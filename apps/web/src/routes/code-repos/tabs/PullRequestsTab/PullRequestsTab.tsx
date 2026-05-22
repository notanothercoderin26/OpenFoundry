import { useMemo, useState } from 'react';

import type { MergeRequestDefinition, MergeRequestStatus } from '@/lib/api/code-repos';
import { Glyph } from '@/lib/components/ui/Glyph';

import { NewMergeRequestDialog } from '../../dialogs/NewMergeRequestDialog';
import { useRepoIdentity, useRepoState } from '../../state/RepoContext';

import { PullRequestDetail } from './PullRequestDetail';

type Filter = 'open' | 'closed';

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
 * Foundry-style Pull requests tab. Two view modes:
 *
 *   • List — Open / Closed toggle, search box and "+ New pull request"
 *     button. Each row carries status, branches, approvals and labels.
 *   • Detail — opened when the user clicks a row; shown via internal
 *     state today. Deep-linking via /pull-requests/:prId is reserved
 *     for F3 (router refactor) since this tab is already nested under
 *     CodeReposPage's internal tab router.
 */
export function PullRequestsTab() {
  const { repository } = useRepoIdentity();
  const {
    mergeRequests,
    selectedMergeRequestId,
    mergeRequestDetail,
    branchOptions,
    busy,
    selectMergeRequest,
    createMergeRequestAction,
    setMergeRequestDraft,
    pendingFileChanges,
  } = useRepoState();

  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return mergeRequests.filter((mr) => {
      const status = mr.status as MergeRequestStatus;
      const matchesFilter =
        filter === 'open' ? status === 'open' || status === 'approved' : status === 'closed' || status === 'merged';
      if (!matchesFilter) return false;
      if (!lower) return true;
      return (
        mr.title.toLowerCase().includes(lower) ||
        mr.author.toLowerCase().includes(lower) ||
        mr.labels.some((label) => label.toLowerCase().includes(lower))
      );
    });
  }, [mergeRequests, filter, search]);

  if (selectedMergeRequestId && mergeRequestDetail) {
    return <PullRequestDetail onBackToList={() => void selectMergeRequest('')} />;
  }

  async function handleSubmit(draft: {
    title: string;
    description: string;
    source_branch: string;
    target_branch: string;
    author: string;
    labels: string[];
    reviewers: string[];
    approvals_required: number;
  }) {
    setMergeRequestDraft({
      title: draft.title,
      description: draft.description,
      source_branch: draft.source_branch,
      target_branch: draft.target_branch,
      author: draft.author,
      labels_text: draft.labels.join(', '),
      reviewers_text: draft.reviewers.join(', '),
      approvals_required: String(draft.approvals_required),
      changed_files: String(pendingFileChanges.length || 0),
    });
    await createMergeRequestAction();
    setComposerOpen(false);
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center gap-2">
        <div className="inline-flex items-stretch h-8 rounded-of-sm border border-of-border bg-of-surface-raised overflow-hidden">
          {(['open', 'closed'] as Filter[]).map((entry) => {
            const active = entry === filter;
            return (
              <button
                key={entry}
                type="button"
                onClick={() => setFilter(entry)}
                className={`inline-flex items-center h-full px-3 text-of-12 font-of-medium capitalize ${
                  active ? 'bg-of-accent-soft text-of-accent' : 'text-of-text-muted hover:bg-of-surface-muted'
                }`}
              >
                {entry}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, label…"
            className="w-72 h-8 pl-7 pr-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-of-text-soft">
            <Glyph name="search" size={12} tone="currentColor" />
          </span>
        </div>

        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-success text-white hover:opacity-90"
        >
          <Glyph name="plus" size={12} tone="currentColor" />
          New pull request
        </button>
      </header>

      <section className="rounded-of-md border border-of-border bg-of-surface-raised overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">
            No pull requests match this view.
          </p>
        ) : (
          <ul className="divide-y divide-of-border">
            {filtered.map((mr) => (
              <PullRequestRow
                key={mr.id}
                mr={mr}
                onOpen={() => void selectMergeRequest(mr.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <NewMergeRequestDialog
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        sourceBranch={branchOptions.find((branch) => branch !== repository.default_branch) ?? ''}
        defaultTargetBranch={repository.default_branch}
        availableTargets={branchOptions}
        defaultAuthor={undefined}
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

interface PullRequestRowProps {
  mr: MergeRequestDefinition;
  onOpen: () => void;
}

function PullRequestRow({ mr, onOpen }: PullRequestRowProps) {
  const status = mr.status;
  const palette =
    status === 'merged'
      ? 'bg-[#7e3ba3] text-white'
      : status === 'closed'
        ? 'bg-of-danger text-white'
        : status === 'approved'
          ? 'bg-of-success text-white'
          : 'bg-of-accent text-white';
  const approvalCount = mr.reviewers.filter((reviewer) => reviewer.approved).length;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex items-start gap-3 w-full text-left px-3 py-3 hover:bg-of-surface-muted"
      >
        <span
          className={`mt-0.5 inline-flex items-center justify-center h-6 px-2 rounded-of-sm text-of-12 font-of-medium capitalize ${palette}`}
        >
          {status}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-of-13 font-of-semibold text-of-text truncate">{mr.title}</p>
          <p className="mt-0.5 text-of-12 text-of-text-soft truncate font-mono">
            {mr.source_branch} → {mr.target_branch}
          </p>
          {mr.labels.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1">
              {mr.labels.map((label) => (
                <li
                  key={label}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-surface-muted text-of-12 text-of-text-muted"
                >
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="text-right text-of-12 text-of-text-soft whitespace-nowrap">
          <p>{mr.author || 'unknown'}</p>
          <p className="mt-0.5">{relativeTime(mr.updated_at || mr.created_at)}</p>
          <p className="mt-0.5">
            ✓ {approvalCount}/{mr.approvals_required}
          </p>
        </div>
      </button>
    </li>
  );
}
