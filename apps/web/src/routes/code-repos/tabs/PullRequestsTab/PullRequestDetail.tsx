import { useMemo, useRef, useState } from 'react';

import type { ReviewComment } from '@/lib/api/code-repos';
import { MonacoDiffEditor } from '@/lib/components/MonacoDiffEditor';
import { Glyph } from '@/lib/components/ui/Glyph';
import { Popover } from '@/lib/components/ui/Popover';
import { notifications } from '@stores/notifications';

import { useRepoIdentity, useRepoState } from '../../state/RepoContext';

type SubTab = 'conversation' | 'commits' | 'files' | 'checks';

interface PullRequestDetailProps {
  onBackToList: () => void;
}

function relativeTime(iso: string) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffSeconds = Math.round((Date.now() - then) / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Foundry-style pull request detail. Four sub-tabs (Conversation,
 * Commits, Files changed, Checks) sharing the merge-request header and
 * the right-side metadata sidebar. Inline review comments on the diff
 * are rendered as a per-file list — true in-Monaco overlays require
 * backend gap B8 (threaded comments with parent_comment_id).
 */
export function PullRequestDetail({ onBackToList }: PullRequestDetailProps) {
  const { currentUser } = useRepoIdentity();
  const {
    mergeRequestDetail,
    ciRuns,
    commits,
    files,
    commentDraft,
    setCommentDraft,
    createCommentAction,
    changeMergeRequestStatus,
    updateReviewerState,
    mergeSelectedMergeRequest,
    mergeBlockers,
    diffPatch,
    busy,
  } = useRepoState();

  const [tab, setTab] = useState<SubTab>('conversation');
  const mergeMenuRef = useRef<HTMLButtonElement | null>(null);
  const [mergeMenuOpen, setMergeMenuOpen] = useState(false);

  if (!mergeRequestDetail) {
    return null;
  }

  const mr = mergeRequestDetail.merge_request;
  const approvalCount = mergeRequestDetail.approval_count;
  const requiredApprovals = mr.approvals_required;
  const branchCommits = commits.filter((commit) => commit.branch_name === mr.source_branch);
  const branchCiRuns = ciRuns.filter((run) => run.branch_name === mr.source_branch);
  const canMerge = mergeBlockers.length === 0;

  const statusPalette =
    mr.status === 'merged'
      ? 'bg-[#7e3ba3] text-white'
      : mr.status === 'closed'
        ? 'bg-of-danger text-white'
        : mr.status === 'approved'
          ? 'bg-of-success text-white'
          : 'bg-of-accent text-white';

  return (
    <div className="p-4 space-y-4">
      <header className="space-y-2">
        <button
          type="button"
          onClick={onBackToList}
          className="inline-flex items-center gap-1 text-of-12 text-of-text-muted hover:text-of-text"
        >
          <Glyph name="chevron-left" size={12} tone="currentColor" />
          Back to pull requests
        </button>
        <div className="flex items-start gap-3">
          <span
            className={`mt-1 inline-flex items-center justify-center h-6 px-2 rounded-of-sm text-of-12 font-of-medium capitalize ${statusPalette}`}
          >
            {mr.status}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-of-14 font-of-semibold text-of-text" style={{ fontSize: 18 }}>
              {mr.title}
            </h2>
            <p className="mt-1 text-of-12 text-of-text-soft font-mono">
              {mr.source_branch} <Glyph name="chevron-right" size={10} tone="muted" /> {mr.target_branch}
            </p>
            <p className="mt-0.5 text-of-12 text-of-text-soft">
              opened by {mr.author || 'unknown'} · {relativeTime(mr.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {mr.status === 'open' || mr.status === 'approved' ? (
              <div className="inline-flex items-stretch">
                <button
                  type="button"
                  disabled={!canMerge || busy}
                  onClick={() => void mergeSelectedMergeRequest()}
                  className={`inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-l-of-sm text-of-12 font-of-medium ${
                    canMerge && !busy
                      ? 'bg-of-success text-white hover:opacity-90'
                      : 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
                  }`}
                  title={canMerge ? 'Merge pull request (create a merge commit)' : mergeBlockers[0]}
                >
                  <Glyph name="check" size={12} tone="currentColor" />
                  Merge pull request
                </button>
                <button
                  ref={mergeMenuRef}
                  type="button"
                  disabled={!canMerge || busy}
                  onClick={() => setMergeMenuOpen((value) => !value)}
                  aria-haspopup="menu"
                  aria-expanded={mergeMenuOpen}
                  className={`inline-flex items-center justify-center w-7 h-8 rounded-r-of-sm border-l border-white/20 ${
                    canMerge && !busy
                      ? 'bg-of-success text-white hover:opacity-90'
                      : 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
                  }`}
                  title="Merge strategy"
                >
                  <Glyph name="chevron-down" size={12} tone="currentColor" />
                </button>
                <Popover
                  open={mergeMenuOpen}
                  anchorRef={mergeMenuRef}
                  onClose={() => setMergeMenuOpen(false)}
                  placement="bottom"
                  align="end"
                  width={260}
                  showArrow={false}
                  ariaLabel="Merge strategy"
                >
                  <ul role="menu" className="py-1 text-of-13">
                    <MergeOption
                      glyph="workflow"
                      label="Create a merge commit"
                      description="Default. Combines source into target as one commit."
                      onClick={() => {
                        setMergeMenuOpen(false);
                        void mergeSelectedMergeRequest();
                      }}
                    />
                    <MergeOption
                      glyph="autosaved"
                      label="Squash and merge"
                      description="Backend gap — fans out to a single commit when the resolver ships."
                      onClick={() => {
                        setMergeMenuOpen(false);
                        notifications.info('Squash strategy requires backend gap (merge_strategy param)');
                      }}
                    />
                    <MergeOption
                      glyph="history"
                      label="Rebase and merge"
                      description="Backend gap — replays commits without a merge commit."
                      onClick={() => {
                        setMergeMenuOpen(false);
                        notifications.info('Rebase strategy requires backend gap (merge_strategy param)');
                      }}
                    />
                  </ul>
                </Popover>
              </div>
            ) : null}
            {mr.status === 'closed' ? (
              <button
                type="button"
                onClick={() => void changeMergeRequestStatus('open')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium border border-of-border text-of-text hover:bg-of-surface-muted"
              >
                Reopen
              </button>
            ) : null}
            {mr.status === 'open' || mr.status === 'approved' ? (
              <button
                type="button"
                onClick={() => void changeMergeRequestStatus('closed')}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium border border-of-border text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
        {mergeBlockers.length > 0 ? (
          <ul className="space-y-1">
            {mergeBlockers.map((blocker) => (
              <li
                key={blocker}
                className="px-3 py-2 rounded-of-sm border border-of-warning-soft bg-of-warning-soft text-of-12 text-of-warning"
              >
                {blocker}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <nav className="flex items-end gap-1 border-b border-of-border">
        {([
          ['conversation', 'Conversation', mergeRequestDetail.comments.length],
          ['commits', 'Commits', branchCommits.length],
          ['files', 'Files changed', undefined],
          ['checks', 'Checks', branchCiRuns.length],
        ] as Array<[SubTab, string, number | undefined]>).map(([id, label, count]) => {
          const active = id === tab;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-3 h-9 -mb-px border-b-2 text-of-13 font-of-medium ${
                active
                  ? 'border-of-accent text-of-accent'
                  : 'border-transparent text-of-text-muted hover:text-of-text'
              }`}
            >
              {label}
              {typeof count === 'number' ? (
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-of-sm text-of-12 font-of-semibold tabular-nums ${
                    active ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-muted text-of-text-muted'
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px' }}>
        <section className="min-w-0">
          {tab === 'conversation' ? (
            <ConversationSection
              description={mr.description}
              author={mr.author}
              createdAt={mr.created_at}
              comments={mergeRequestDetail.comments}
              draft={{
                author: commentDraft.author,
                body: commentDraft.body,
                file_path: commentDraft.file_path,
                line_number: commentDraft.line_number,
              }}
              busy={busy}
              onChangeDraft={(patch) =>
                setCommentDraft({
                  author: patch.author ?? commentDraft.author,
                  body: patch.body ?? commentDraft.body,
                  file_path: patch.file_path ?? commentDraft.file_path,
                  line_number: patch.line_number ?? commentDraft.line_number,
                })
              }
              onSubmit={() => void createCommentAction()}
              onApprove={async () => {
                const reviewerName = (commentDraft.author || currentUser?.name || 'Reviewer').trim();
                if (commentDraft.body.trim()) await createCommentAction();
                await updateReviewerState(reviewerName, true, 'approved');
                notifications.success(`${reviewerName} approved this pull request`);
              }}
              onRequestChanges={async () => {
                const reviewerName = (commentDraft.author || currentUser?.name || 'Reviewer').trim();
                if (commentDraft.body.trim()) await createCommentAction();
                await updateReviewerState(reviewerName, false, 'requested_changes');
                notifications.warning(`${reviewerName} requested changes`);
              }}
            />
          ) : null}

          {tab === 'commits' ? (
            <CommitsSection commits={branchCommits} />
          ) : null}

          {tab === 'files' ? (
            <FilesChangedSection patch={diffPatch} comments={mergeRequestDetail.comments} files={files} />
          ) : null}

          {tab === 'checks' ? (
            <ChecksSection ciRuns={branchCiRuns} />
          ) : null}
        </section>

        <aside className="space-y-3">
          <SidebarSection title="Reviewers">
            {mr.reviewers.length === 0 ? (
              <p className="text-of-12 text-of-text-soft">No reviewers assigned.</p>
            ) : (
              <ul className="space-y-1">
                {mr.reviewers.map((reviewer) => (
                  <li
                    key={reviewer.reviewer}
                    className="flex items-center gap-2 text-of-13"
                  >
                    <span className="flex-1 min-w-0 truncate">{reviewer.reviewer}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void updateReviewerState(reviewer.reviewer, !reviewer.approved, reviewer.approved ? 'pending' : 'approved')
                      }
                      className={`inline-flex items-center gap-1 h-6 px-2 rounded-of-sm text-of-12 font-of-medium ${
                        reviewer.approved
                          ? 'bg-of-success text-white'
                          : 'bg-of-surface-muted text-of-text-muted hover:text-of-text'
                      }`}
                    >
                      <Glyph name="check" size={10} tone="currentColor" />
                      {reviewer.approved ? 'Approved' : 'Approve'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-of-12 text-of-text-soft">
              {approvalCount} of {requiredApprovals} required approvals.
            </p>
          </SidebarSection>

          <SidebarSection title="Labels">
            {mr.labels.length === 0 ? (
              <p className="text-of-12 text-of-text-soft">No labels.</p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {mr.labels.map((label) => (
                  <li
                    key={label}
                    className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-accent-soft text-of-12 text-of-accent"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </SidebarSection>

          <SidebarSection title="Dataset impact">
            <p className="text-of-12 text-of-text-soft">
              Showing impacted datasets requires gap §8.7 — the lineage cross-reference is not wired yet.
            </p>
            <button
              type="button"
              onClick={() => notifications.info('Dataset impact ships in Phase 5')}
              className="mt-2 inline-flex items-center gap-1 text-of-12 text-of-accent hover:underline"
            >
              <Glyph name="lineage" size={10} tone="currentColor" />
              Explore lineage
            </button>
          </SidebarSection>
        </aside>
      </div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-of-md border border-of-border bg-of-surface-raised p-3">
      <h3 className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
        {title}
      </h3>
      <div className="mt-2 text-of-13">{children}</div>
    </section>
  );
}

interface ConversationSectionProps {
  description: string;
  author: string;
  createdAt: string;
  comments: ReadonlyArray<ReviewComment>;
  draft: { author: string; body: string; file_path: string; line_number: string };
  busy: boolean;
  onChangeDraft: (patch: Partial<{ author: string; body: string; file_path: string; line_number: string }>) => void;
  onSubmit: () => void;
  onApprove: () => void;
  onRequestChanges: () => void;
}

function ConversationSection({
  description,
  author,
  createdAt,
  comments,
  draft,
  busy,
  onChangeDraft,
  onSubmit,
  onApprove,
  onRequestChanges,
}: ConversationSectionProps) {
  const reviewMenuRef = useRef<HTMLButtonElement | null>(null);
  const [reviewMenuOpen, setReviewMenuOpen] = useState(false);

  return (
    <div className="space-y-3">
      <article className="rounded-of-md border border-of-border bg-of-surface-raised p-3">
        <header className="flex items-center gap-2">
          <Glyph name="users" size={12} tone="muted" />
          <span className="text-of-13 font-of-semibold">{author || 'unknown'}</span>
          <span className="text-of-12 text-of-text-soft">{relativeTime(createdAt)}</span>
        </header>
        <p className="mt-2 text-of-13 whitespace-pre-wrap">{description || '(no description)'}</p>
      </article>

      {comments.map((comment) => (
        <CommentArticle key={comment.id} comment={comment} />
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && draft.body.trim()) onSubmit();
        }}
        className="rounded-of-md border border-of-border bg-of-surface-raised p-3 space-y-2"
      >
        <p className="text-of-12 font-of-semibold text-of-text-muted uppercase tracking-wider">
          Add a comment
        </p>
        <textarea
          value={draft.body}
          onChange={(e) => onChangeDraft({ body: e.target.value })}
          rows={3}
          placeholder="Leave a review comment…"
          className="w-full px-3 py-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px] gap-2">
          <input
            value={draft.author}
            onChange={(e) => onChangeDraft({ author: e.target.value })}
            placeholder="Author"
            className="h-8 px-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12"
          />
          <input
            value={draft.file_path}
            onChange={(e) => onChangeDraft({ file_path: e.target.value })}
            placeholder="File path (optional)"
            className="h-8 px-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12 font-mono"
          />
          <input
            value={draft.line_number}
            onChange={(e) => onChangeDraft({ line_number: e.target.value })}
            placeholder="Line"
            type="number"
            className="h-8 px-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12"
          />
        </div>
        <div className="flex justify-end gap-1">
          <div className="inline-flex items-stretch">
            <button
              type="submit"
              disabled={busy || !draft.body.trim()}
              className={`inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-l-of-sm text-of-12 font-of-medium ${
                busy || !draft.body.trim()
                  ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
                  : 'bg-of-accent text-white hover:bg-of-accent-hover'
              }`}
            >
              Comment
            </button>
            <button
              ref={reviewMenuRef}
              type="button"
              disabled={busy}
              onClick={() => setReviewMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={reviewMenuOpen}
              title="Submit review"
              className={`inline-flex items-center justify-center w-7 h-8 rounded-r-of-sm border-l border-white/20 ${
                busy ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed' : 'bg-of-accent text-white hover:bg-of-accent-hover'
              }`}
            >
              <Glyph name="chevron-down" size={12} tone="currentColor" />
            </button>
            <Popover
              open={reviewMenuOpen}
              anchorRef={reviewMenuRef}
              onClose={() => setReviewMenuOpen(false)}
              placement="bottom"
              align="end"
              width={260}
              showArrow={false}
              ariaLabel="Submit review"
            >
              <ul role="menu" className="py-1 text-of-13">
                <MergeOption
                  glyph="check"
                  label="Approve"
                  description="Approve the changes and post the comment."
                  onClick={() => {
                    setReviewMenuOpen(false);
                    onApprove();
                  }}
                />
                <MergeOption
                  glyph="circle-x"
                  label="Request changes"
                  description="Block the merge until concerns are addressed."
                  onClick={() => {
                    setReviewMenuOpen(false);
                    onRequestChanges();
                  }}
                />
                <MergeOption
                  glyph="info"
                  label="Comment"
                  description="Submit the comment without a verdict."
                  onClick={() => {
                    setReviewMenuOpen(false);
                    if (draft.body.trim()) onSubmit();
                  }}
                />
              </ul>
            </Popover>
          </div>
        </div>
      </form>
    </div>
  );
}

function CommentArticle({ comment }: { comment: ReviewComment }) {
  return (
    <article
      className={`rounded-of-md border bg-of-surface-raised p-3 ${
        comment.resolved ? 'border-of-success-soft' : 'border-of-border'
      }`}
    >
      <header className="flex items-center gap-2">
        <Glyph name="users" size={12} tone="muted" />
        <span className="text-of-13 font-of-semibold">{comment.author}</span>
        <span className="text-of-12 text-of-text-soft">{relativeTime(comment.created_at)}</span>
        {comment.file_path ? (
          <span
            className="ml-auto text-of-12 text-of-text-soft font-mono truncate max-w-[40%]"
            title={comment.file_path}
          >
            {comment.file_path}
            {comment.line_number ? `:${comment.line_number}` : ''}
          </span>
        ) : null}
        {comment.resolved ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-of-sm bg-of-success-soft text-of-success text-of-12">
            <Glyph name="check" size={10} tone="currentColor" />
            Resolved
          </span>
        ) : null}
      </header>
      <p className="mt-2 text-of-13 whitespace-pre-wrap">{comment.body}</p>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() =>
            notifications.info(
              comment.resolved
                ? 'Unresolve requires backend gap B8 (PATCH /comments/:id)'
                : 'Resolve requires backend gap B8 (PATCH /comments/:id)',
            )
          }
          className="inline-flex items-center gap-1 h-6 px-2 rounded-of-sm text-of-12 text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
        >
          {comment.resolved ? 'Unresolve thread' : 'Resolve thread'}
        </button>
      </div>
    </article>
  );
}

function CommitsSection({ commits }: { commits: ReturnType<typeof useRepoState>['commits'] }) {
  if (commits.length === 0) {
    return (
      <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">
        No commits on this branch yet.
      </p>
    );
  }
  return (
    <ul className="rounded-of-md border border-of-border bg-of-surface-raised divide-y divide-of-border">
      {commits.map((commit) => (
        <li key={commit.id} className="px-3 py-2">
          <p className="text-of-13 text-of-text truncate" title={commit.title}>
            {commit.title}
          </p>
          <p className="mt-0.5 text-of-12 text-of-text-soft font-mono truncate">
            {commit.sha.slice(0, 12)} · {commit.author_name || 'unknown'} · {relativeTime(commit.created_at)}
          </p>
          {commit.description ? (
            <p className="mt-1 text-of-12 text-of-text-muted whitespace-pre-wrap">{commit.description}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

interface FilesChangedSectionProps {
  patch: string;
  comments: ReadonlyArray<ReviewComment>;
  files: ReturnType<typeof useRepoState>['files'];
}

function FilesChangedSection({ patch, comments, files }: FilesChangedSectionProps) {
  const commentsByFile = useMemo(() => {
    const map = new Map<string, ReviewComment[]>();
    for (const comment of comments) {
      const key = comment.file_path || '(general)';
      const list = map.get(key) ?? [];
      list.push(comment);
      map.set(key, list);
    }
    return map;
  }, [comments]);

  // Pick the file with the most inline comments as the diff target.
  // Backend gap B3 (per-file diff) prevents us from splitting the branch
  // patch by file; once that ships, this becomes a per-row diff editor.
  const fileForDiff = useMemo(() => {
    const ranked = [...commentsByFile.entries()]
      .filter(([file]) => file !== '(general)')
      .sort((a, b) => b[1].length - a[1].length);
    const targetPath = ranked[0]?.[0];
    if (!targetPath) return files[0] ?? null;
    return files.find((file) => file.path === targetPath) ?? files[0] ?? null;
  }, [commentsByFile, files]);

  return (
    <div className="space-y-3">
      <section className="rounded-of-md border border-of-border bg-of-surface-raised">
        <header className="flex items-center gap-2 px-3 h-9 border-b border-of-border">
          <Glyph name="history" size={12} tone="muted" />
          <span className="text-of-13 font-of-semibold">Branch diff vs target</span>
          {fileForDiff ? (
            <span className="ml-2 text-of-12 text-of-text-soft font-mono truncate" title={fileForDiff.path}>
              · viewing {fileForDiff.path}
            </span>
          ) : null}
        </header>
        {fileForDiff ? (
          <div className="h-[480px]">
            <MonacoDiffEditor
              original=""
              modified={fileForDiff.content}
              language={fileForDiff.language || 'text'}
              minHeight={480}
            />
          </div>
        ) : patch ? (
          <pre className="px-3 py-2 max-h-[480px] overflow-auto text-of-12 font-mono text-of-text whitespace-pre">
            {patch}
          </pre>
        ) : (
          <p className="px-3 py-4 text-of-12 text-of-text-soft">
            No diff returned. Per-file diffs arrive with gap B3; for now we render the active branch contents in a
            Monaco diff editor against an empty original.
          </p>
        )}
        <p className="px-3 py-2 border-t border-of-border text-of-12 text-of-text-soft">
          Inline overlays per line require gap B8 (threaded comments); the comments anchored to a file path are
          listed below the diff.
        </p>
      </section>

      {commentsByFile.size > 0 ? (
        <section className="rounded-of-md border border-of-border bg-of-surface-raised">
          <header className="flex items-center gap-2 px-3 h-9 border-b border-of-border">
            <Glyph name="info" size={12} tone="muted" />
            <span className="text-of-13 font-of-semibold">Inline comments</span>
          </header>
          <ul className="divide-y divide-of-border">
            {[...commentsByFile.entries()].map(([file, list]) => (
              <li key={file} className="px-3 py-2">
                <p className="text-of-12 font-mono text-of-text">{file}</p>
                <ul className="mt-1 space-y-1">
                  {list.map((comment) => (
                    <li
                      key={comment.id}
                      className={`text-of-12 text-of-text-muted px-2 py-1 rounded-of-sm ${
                        comment.resolved ? 'bg-of-success-soft' : ''
                      }`}
                    >
                      <span className="font-of-semibold text-of-text">{comment.author}</span>
                      {comment.line_number ? <span> @ line {comment.line_number}</span> : null}
                      {comment.resolved ? <span className="ml-2 text-of-success">resolved</span> : null}
                      <span className="block whitespace-pre-wrap text-of-text">{comment.body}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

interface MergeOptionProps {
  glyph: Parameters<typeof Glyph>[0]['name'];
  label: string;
  description: string;
  onClick: () => void;
}

function MergeOption({ glyph, label, description, onClick }: MergeOptionProps) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className="flex items-start gap-2 w-full px-3 py-2 text-left hover:bg-of-surface-muted"
      >
        <Glyph name={glyph} size={13} tone="muted" />
        <span className="min-w-0">
          <span className="block text-of-13 font-of-semibold text-of-text">{label}</span>
          <span className="block mt-0.5 text-of-12 text-of-text-soft">{description}</span>
        </span>
      </button>
    </li>
  );
}

function ChecksSection({ ciRuns }: { ciRuns: ReturnType<typeof useRepoState>['ciRuns'] }) {
  if (ciRuns.length === 0) {
    return (
      <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">
        No CI runs on the source branch yet.
      </p>
    );
  }
  return (
    <ul className="rounded-of-md border border-of-border bg-of-surface-raised divide-y divide-of-border">
      {ciRuns.map((run) => (
        <li key={run.id} className="px-3 py-2">
          <p className="text-of-13 font-of-semibold">{run.pipeline_name}</p>
          <p className="mt-0.5 text-of-12 text-of-text-soft font-mono truncate">
            {run.commit_sha.slice(0, 12)} · status {run.status} · trigger {run.trigger}
          </p>
        </li>
      ))}
    </ul>
  );
}
