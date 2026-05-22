import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { BranchDefinition, MergeRequestDefinition } from '@/lib/api/code-repos';
import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../../state/RepoContext';
import { dialogs } from '../../state/useDialogs';

import { TagsPanel } from './TagsPanel';

type Mode = 'branches' | 'tags';

function isOwnedByViewer(
  branch: BranchDefinition,
  viewerId: string | null,
  viewerNamingKey: string | null,
): boolean {
  if (viewerId && branch.created_by && branch.created_by === viewerId) return true;
  // Fallback heuristic for branches that pre-date the metadata sidecar
  // (created_by empty): treat "<viewer>/topic" naming as Personal.
  if (!branch.created_by && viewerNamingKey) {
    return branch.name.toLowerCase().startsWith(`${viewerNamingKey}/`);
  }
  return false;
}

function classify(
  branches: ReadonlyArray<BranchDefinition>,
  viewerId: string | null,
  viewerNamingKey: string | null,
) {
  const defaultBranch = branches.find((branch) => branch.is_default) ?? null;
  const personal = branches.filter(
    (branch) => !branch.is_default && isOwnedByViewer(branch, viewerId, viewerNamingKey),
  );
  const other = branches.filter(
    (branch) => !branch.is_default && !isOwnedByViewer(branch, viewerId, viewerNamingKey),
  );
  return { defaultBranch, personal, other };
}

function namingKeyFromUser(
  name: string | null | undefined,
  email: string | null | undefined,
): string | null {
  if (email) {
    const local = email.split('@')[0];
    if (local) return local.toLowerCase();
  }
  if (name) return name.trim().toLowerCase().replace(/\s+/g, '-');
  return null;
}

function mergeRequestForBranch(
  mergeRequests: ReadonlyArray<MergeRequestDefinition>,
  branchName: string,
) {
  return (
    mergeRequests
      .filter((mr) => mr.source_branch === branchName)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
  );
}

/**
 * Foundry-style Branches tab. Replaces the legacy BranchManager surface
 * with a per-group list (Default / Personal / Other) plus a Tags section,
 * batch-select checkboxes, and an inline action column wired to the
 * existing mutation handlers in useRepoState.
 *
 * "Personal" branches are heuristically identified by the
 * "<user>/feature" naming convention because BranchDefinition does not
 * yet carry a created_by field — master plan gap B12.
 */
export function BranchesTab() {
  const navigate = useNavigate();
  const { repository, currentUser } = useRepoIdentity();
  const {
    branches,
    mergeRequests,
    ciRuns,
    busy,
    switchBranchAction,
    deleteBranchAction,
    selectMergeRequest,
    setMergeRequestDraft,
  } = useRepoState();

  const [mode, setMode] = useState<Mode>('branches');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const viewerId = currentUser?.id ?? null;
  const namingKey = namingKeyFromUser(currentUser?.name, currentUser?.email);
  const groups = useMemo(
    () => classify(branches, viewerId, namingKey),
    [branches, viewerId, namingKey],
  );

  function toggleSelected(branchName: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(branchName)) next.delete(branchName);
      else next.add(branchName);
      return next;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} branch${selected.size === 1 ? '' : 'es'}?`)) {
      return;
    }
    for (const branchName of selected) {
      await deleteBranchAction(branchName);
    }
    setSelected(new Set());
  }

  function startProposeChanges(branchName: string) {
    setMergeRequestDraft({
      source_branch: branchName,
      target_branch: repository.default_branch,
      title: `Promote ${branchName}`,
    });
    dialogs.open('new-pull-request');
  }

  function openPullRequest(mergeRequestId: string) {
    void selectMergeRequest(mergeRequestId);
  }

  function openBranchInIde(branchName: string) {
    void switchBranchAction(branchName);
    navigate(`/code-repos/${repository.id}`);
  }

  if (mode === 'tags') {
    return (
      <div className="p-4">
        <ModeToggle
          mode={mode}
          onChange={setMode}
          totalBranches={branches.length}
          onNewBranch={() => dialogs.open('new-branch')}
        />
        <TagsPanel />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <ModeToggle
        mode={mode}
        onChange={setMode}
        totalBranches={branches.length}
        onNewBranch={() => dialogs.open('new-branch')}
      />

      {selected.size > 0 ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13">
          <span>{selected.size} selected</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void deleteSelected()}
            className="ml-auto inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm text-of-12 font-of-medium bg-of-danger-soft text-of-danger hover:bg-of-danger hover:text-white"
          >
            <Glyph name="trash" size={12} tone="currentColor" />
            Delete selected
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex items-center h-7 px-2 rounded-of-sm text-of-12 font-of-medium text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          >
            Clear
          </button>
        </div>
      ) : null}

      <BranchSection
        title="Default branch"
        branches={groups.defaultBranch ? [groups.defaultBranch] : []}
        viewerId={viewerId}
        viewerNamingKey={namingKey}
        selected={selected}
        toggleSelected={toggleSelected}
        ciRuns={ciRuns}
        mergeRequests={mergeRequests}
        busy={busy}
        onOpenInIde={openBranchInIde}
        onDelete={(branchName) => void deleteBranchAction(branchName)}
        onPropose={startProposeChanges}
        onOpenPullRequest={openPullRequest}
        forbidDelete
      />

      <BranchSection
        title="Personal branches"
        branches={groups.personal}
        viewerId={viewerId}
        viewerNamingKey={namingKey}
        selected={selected}
        toggleSelected={toggleSelected}
        ciRuns={ciRuns}
        mergeRequests={mergeRequests}
        busy={busy}
        onOpenInIde={openBranchInIde}
        onDelete={(branchName) => void deleteBranchAction(branchName)}
        onPropose={startProposeChanges}
        onOpenPullRequest={openPullRequest}
        emptyHint={
          viewerId
            ? `Branches you create are tagged on the server. Older branches without a created_by are classified by the "${namingKey ?? 'user'}/<topic>" fallback.`
            : 'Personal classification needs a signed-in user.'
        }
      />

      <BranchSection
        title="Other branches"
        branches={groups.other}
        viewerId={viewerId}
        viewerNamingKey={namingKey}
        selected={selected}
        toggleSelected={toggleSelected}
        ciRuns={ciRuns}
        mergeRequests={mergeRequests}
        busy={busy}
        onOpenInIde={openBranchInIde}
        onDelete={(branchName) => void deleteBranchAction(branchName)}
        onPropose={startProposeChanges}
        onOpenPullRequest={openPullRequest}
      />

    </div>
  );
}

interface ModeToggleProps {
  mode: Mode;
  onChange: (next: Mode) => void;
  totalBranches: number;
  onNewBranch: () => void;
}

function ModeToggle({ mode, onChange, totalBranches, onNewBranch }: ModeToggleProps) {
  return (
    <header className="flex items-center gap-2">
      <h2 className="text-of-14 font-of-semibold">{totalBranches} branches</h2>
      <div className="ml-auto inline-flex items-stretch h-8 rounded-of-sm border border-of-border bg-of-surface-raised overflow-hidden">
        {(['branches', 'tags'] as Mode[]).map((entry) => {
          const active = entry === mode;
          return (
            <button
              key={entry}
              type="button"
              onClick={() => onChange(entry)}
              className={`inline-flex items-center h-full px-3 text-of-12 font-of-medium capitalize ${
                active ? 'bg-of-accent-soft text-of-accent' : 'text-of-text-muted hover:bg-of-surface-muted'
              }`}
            >
              {entry}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onNewBranch}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-success text-white hover:opacity-90"
      >
        <Glyph name="plus" size={12} tone="currentColor" />
        New branch
      </button>
    </header>
  );
}

interface BranchSectionProps {
  title: string;
  branches: ReadonlyArray<BranchDefinition>;
  viewerId: string | null;
  viewerNamingKey: string | null;
  selected: ReadonlySet<string>;
  toggleSelected: (name: string) => void;
  ciRuns: ReturnType<typeof useRepoState>['ciRuns'];
  mergeRequests: ReadonlyArray<MergeRequestDefinition>;
  busy: boolean;
  onOpenInIde: (branchName: string) => void;
  onDelete: (branchName: string) => void;
  onPropose: (branchName: string) => void;
  onOpenPullRequest: (mergeRequestId: string) => void;
  /** When set, overrides the per-branch owner check (used to lock the
   *  Default branch row regardless of who created it). */
  forbidDelete?: boolean;
  emptyHint?: string;
}

function BranchSection({
  title,
  branches,
  viewerId,
  viewerNamingKey,
  selected,
  toggleSelected,
  ciRuns,
  mergeRequests,
  busy,
  onOpenInIde,
  onDelete,
  onPropose,
  onOpenPullRequest,
  forbidDelete = false,
  emptyHint,
}: BranchSectionProps) {
  return (
    <section className="rounded-of-md border border-of-border bg-of-surface-raised overflow-hidden">
      <header className="grid grid-cols-[40px_minmax(0,1fr)_140px_180px_40px] gap-2 items-center px-3 h-9 border-b border-of-border bg-of-surface text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
        <span />
        <span>{title}</span>
        <span>Checks</span>
        <span>Pull request</span>
        <span />
      </header>
      {branches.length === 0 ? (
        <p className="px-3 py-4 text-of-12 text-of-text-soft">
          {emptyHint ?? 'Nothing here yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-of-border">
          {branches.map((branch) => {
            const owned = isOwnedByViewer(branch, viewerId, viewerNamingKey);
            const canDelete = !forbidDelete && !branch.is_default && owned;
            return (
              <BranchRow
                key={branch.id}
                branch={branch}
                checked={selected.has(branch.name)}
                onToggle={() => toggleSelected(branch.name)}
                latestCi={ciRuns.find((run) => run.branch_name === branch.name) ?? null}
                pullRequest={mergeRequestForBranch(mergeRequests, branch.name)}
                busy={busy}
                onOpenInIde={() => onOpenInIde(branch.name)}
                onDelete={() => onDelete(branch.name)}
                onPropose={() => onPropose(branch.name)}
                onOpenPullRequest={onOpenPullRequest}
                canDelete={canDelete}
                deleteTitle={
                  branch.is_default
                    ? 'Default branches cannot be deleted'
                    : owned
                      ? 'Delete branch'
                      : 'Only the branch creator can delete this branch'
                }
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface BranchRowProps {
  branch: BranchDefinition;
  checked: boolean;
  onToggle: () => void;
  latestCi: ReturnType<typeof useRepoState>['ciRuns'][number] | null;
  pullRequest: MergeRequestDefinition | null;
  busy: boolean;
  onOpenInIde: () => void;
  onDelete: () => void;
  onPropose: () => void;
  onOpenPullRequest: (mergeRequestId: string) => void;
  canDelete: boolean;
  deleteTitle: string;
}

function BranchRow({
  branch,
  checked,
  onToggle,
  latestCi,
  pullRequest,
  busy,
  onOpenInIde,
  onDelete,
  onPropose,
  onOpenPullRequest,
  canDelete,
  deleteTitle,
}: BranchRowProps) {
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)_140px_180px_40px] gap-2 items-center px-3 py-2">
      <input
        type="checkbox"
        aria-label={`Select ${branch.name}`}
        checked={checked}
        onChange={onToggle}
        disabled={branch.is_default}
        className="w-4 h-4 accent-of-accent"
      />
      <div className="min-w-0 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-of-sm bg-of-surface-muted text-of-12 font-mono text-of-text truncate max-w-full"
          title={branch.name}
        >
          {branch.protected ? <Glyph name="lock" size={10} tone="warning" /> : null}
          {branch.name}
        </span>
        <button
          type="button"
          onClick={onOpenInIde}
          className="text-of-12 text-of-accent hover:underline whitespace-nowrap"
        >
          View code
        </button>
        {branch.ahead_by > 0 ? (
          <span className="text-of-12 text-of-text-soft">↑{branch.ahead_by}</span>
        ) : null}
      </div>
      <ChecksCell ci={latestCi} />
      <PullRequestCell
        pr={pullRequest}
        onPropose={onPropose}
        onOpenPullRequest={onOpenPullRequest}
        busy={busy}
      />
      <button
        type="button"
        aria-label={`Delete ${branch.name}`}
        title={deleteTitle}
        disabled={!canDelete || busy}
        onClick={onDelete}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-of-sm ${
          canDelete
            ? 'text-of-text-muted hover:bg-of-danger-soft hover:text-of-danger'
            : 'text-of-text-soft cursor-not-allowed'
        }`}
      >
        <Glyph name="trash" size={13} tone="currentColor" />
      </button>
    </li>
  );
}

interface ChecksCellProps {
  ci: ReturnType<typeof useRepoState>['ciRuns'][number] | null;
}

function ChecksCell({ ci }: ChecksCellProps) {
  if (!ci) {
    return <span className="text-of-12 text-of-text-soft">—</span>;
  }
  if (ci.status === 'passed') {
    return (
      <span className="inline-flex items-center gap-1 text-of-12 text-of-success">
        <Glyph name="check" size={12} tone="currentColor" /> Passed 1/1
      </span>
    );
  }
  if (ci.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-of-12 text-of-danger">
        <Glyph name="circle-x" size={12} tone="currentColor" /> Failed 1/1
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-of-12 text-of-text-muted">
      <span className="w-2 h-2 rounded-full bg-of-accent animate-pulse" /> Passed 0/1
    </span>
  );
}

interface PullRequestCellProps {
  pr: MergeRequestDefinition | null;
  onPropose: () => void;
  onOpenPullRequest: (mergeRequestId: string) => void;
  busy: boolean;
}

function PullRequestCell({ pr, onPropose, onOpenPullRequest, busy }: PullRequestCellProps) {
  if (!pr) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onPropose}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-of-sm text-of-12 font-of-medium border border-of-border bg-of-surface-raised text-of-text hover:bg-of-surface-muted disabled:opacity-60"
      >
        <Glyph name="share" size={12} tone="currentColor" />
        Propose changes
      </button>
    );
  }
  const palette =
    pr.status === 'merged'
      ? 'bg-[#7e3ba3] text-white'
      : pr.status === 'closed'
        ? 'bg-of-danger text-white'
        : pr.status === 'approved'
          ? 'bg-of-success text-white'
          : 'bg-of-accent text-white';
  return (
    <button
      type="button"
      onClick={() => onOpenPullRequest(pr.id)}
      title={`Open “${pr.title}”`}
      className={`inline-flex items-center justify-center h-6 px-2 rounded-of-sm text-of-12 font-of-medium capitalize hover:opacity-90 ${palette}`}
    >
      {pr.status}
    </button>
  );
}
