import { useMemo } from 'react';

import type { BranchDefinition, CommitDefinition, MergeRequestDefinition } from '@/lib/api/code-repos';
import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { openFiles } from '../state/useOpenFiles';

function pickReadme(files: ReadonlyArray<{ path: string; content: string; language: string }>) {
  return files.find((file) => /^readme(\.|$)/i.test(file.path.split('/').at(-1) ?? '')) ?? null;
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
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Empty-state landing for the multi-tab editor. Shows the repository's
 * README in a card alongside three operator panels:
 *
 *   • Recent commits (last five from the active branch).
 *   • Branches sorted by activity (the BranchDefinition currently has no
 *     created_by, so "your" branches are not filterable yet — see master
 *     plan §10 B12; until then this lists every branch touched recently).
 *   • Pull requests authored by the signed-in user.
 *
 * Clicking any list item opens the underlying file or routes the user
 * back into the relevant tab.
 */
export function EditorHomeView() {
  const { repository, currentUser } = useRepoIdentity();
  const { files, commits, branches, mergeRequests } = useRepoState();

  const readme = useMemo(() => pickReadme(files), [files]);
  const recentCommits = useMemo(() => commits.slice(0, 5), [commits]);
  const recentBranches = useMemo(
    () => [...branches].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
    [branches],
  );
  const userPullRequests = useMemo(() => {
    if (!currentUser?.name) {
      return mergeRequests.filter((mr) => mr.status === 'open' || mr.status === 'approved').slice(0, 5);
    }
    const needle = currentUser.name.toLowerCase();
    return mergeRequests
      .filter((mr) => mr.author?.toLowerCase() === needle)
      .filter((mr) => mr.status === 'open' || mr.status === 'approved')
      .slice(0, 5);
  }, [mergeRequests, currentUser]);

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 bg-of-canvas">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
            Repository
          </p>
          <h1 className="mt-1 text-of-14 font-of-semibold text-of-text" style={{ fontSize: 20 }}>
            {repository.name}
          </h1>
          <p className="mt-1 text-of-13 text-of-text-muted">{repository.description}</p>
        </header>

        {readme ? (
          <section className="rounded-of-md border border-of-border bg-of-surface-raised">
            <header className="flex items-center gap-2 h-9 px-3 border-b border-of-border">
              <Glyph name="document" size={14} tone="muted" />
              <span className="text-of-13 font-of-semibold">{readme.path}</span>
              <button
                type="button"
                onClick={() => openFiles.open(readme.path, readme.language)}
                className="ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-of-sm text-of-12 text-of-accent hover:bg-of-accent-soft"
              >
                Open
                <Glyph name="chevron-right" size={10} tone="currentColor" />
              </button>
            </header>
            <pre className="px-4 py-3 max-h-72 overflow-auto text-of-12 font-mono text-of-text whitespace-pre-wrap">
              {readme.content}
            </pre>
          </section>
        ) : (
          <section className="rounded-of-md border border-dashed border-of-border bg-of-surface-raised p-4">
            <p className="text-of-13 text-of-text-muted">
              No README found at the repo root. Create one to give collaborators a head start.
            </p>
          </section>
        )}

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <RecentCommitsCard commits={recentCommits} />
          <BranchesCard branches={recentBranches} />
          <PullRequestsCard mergeRequests={userPullRequests} viewerName={currentUser?.name ?? null} />
        </div>
      </div>
    </div>
  );
}

function RecentCommitsCard({ commits }: { commits: ReadonlyArray<CommitDefinition> }) {
  return (
    <section className="rounded-of-md border border-of-border bg-of-surface-raised">
      <header className="flex items-center gap-2 h-9 px-3 border-b border-of-border">
        <Glyph name="history" size={14} tone="muted" />
        <span className="text-of-13 font-of-semibold">Recent commits</span>
      </header>
      <ul className="divide-y divide-of-border">
        {commits.length === 0 ? (
          <li className="px-3 py-3 text-of-12 text-of-text-soft">No commits yet on this branch.</li>
        ) : (
          commits.map((commit) => (
            <li key={commit.id} className="px-3 py-2">
              <p className="text-of-13 text-of-text truncate" title={commit.title}>
                {commit.title}
              </p>
              <p className="mt-0.5 text-of-12 text-of-text-soft truncate">
                {commit.sha.slice(0, 8)} · {commit.author_name || 'unknown'} ·{' '}
                {relativeTime(commit.created_at)}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function BranchesCard({ branches }: { branches: ReadonlyArray<BranchDefinition> }) {
  return (
    <section className="rounded-of-md border border-of-border bg-of-surface-raised">
      <header className="flex items-center gap-2 h-9 px-3 border-b border-of-border">
        <Glyph name="workflow" size={14} tone="muted" />
        <span className="text-of-13 font-of-semibold">Recent branches</span>
      </header>
      <ul className="divide-y divide-of-border">
        {branches.length === 0 ? (
          <li className="px-3 py-3 text-of-12 text-of-text-soft">No branches yet.</li>
        ) : (
          branches.map((branch) => (
            <li key={branch.id} className="px-3 py-2">
              <p className="text-of-13 text-of-text truncate font-mono" title={branch.name}>
                {branch.name}
                {branch.is_default ? (
                  <span className="ml-1 text-of-12 text-of-text-soft font-sans">(default)</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-of-12 text-of-text-soft truncate">
                {branch.protected ? 'protected · ' : ''}
                {branch.ahead_by > 0 ? `↑${branch.ahead_by} · ` : ''}
                {relativeTime(branch.updated_at)}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function PullRequestsCard({
  mergeRequests,
  viewerName,
}: {
  mergeRequests: ReadonlyArray<MergeRequestDefinition>;
  viewerName: string | null;
}) {
  const subtitle = viewerName ? `Pull requests you authored` : 'Open pull requests';
  return (
    <section className="rounded-of-md border border-of-border bg-of-surface-raised">
      <header className="flex items-center gap-2 h-9 px-3 border-b border-of-border">
        <Glyph name="graph" size={14} tone="muted" />
        <span className="text-of-13 font-of-semibold">{subtitle}</span>
      </header>
      <ul className="divide-y divide-of-border">
        {mergeRequests.length === 0 ? (
          <li className="px-3 py-3 text-of-12 text-of-text-soft">No pull requests match.</li>
        ) : (
          mergeRequests.map((mr) => (
            <li key={mr.id} className="px-3 py-2">
              <p className="text-of-13 text-of-text truncate" title={mr.title}>
                {mr.title}
              </p>
              <p className="mt-0.5 text-of-12 text-of-text-soft truncate font-mono">
                {mr.source_branch} → {mr.target_branch}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
