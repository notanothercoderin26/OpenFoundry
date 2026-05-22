import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { CommitDialog } from '../dialogs/CommitDialog';
import { MergeDialog } from '../dialogs/MergeDialog';
import { NewBranchDialog } from '../dialogs/NewBranchDialog';
import { NewMergeRequestDialog } from '../dialogs/NewMergeRequestDialog';
import { ResetDialog } from '../dialogs/ResetDialog';
import { UpgradeDialog } from '../dialogs/UpgradeDialog';
import { useRepoIdentity, useRepoState } from '../state/RepoContext';

import { BranchSelector } from './BranchSelector';
import { HeaderMenu, type HeaderMenuItem } from './HeaderMenu';

/**
 * Foundry-style action bar that lives at the top of the Code tab:
 *
 *   [branch ▾] ✏️ ➕ ………… ▶ Preview  🧪 Test  💾 Commit  🔨 Build  📤 Propose changes  ⋯
 *
 * The bar drives the IDE's working state — switching branch, opening the
 * commit/PR dialogs, and triggering CI builds. Buttons are disabled when
 * the current context forbids the operation (protected branch, no dirty
 * files, no source/target diff, …).
 *
 * Preview and Test do not yet have backend endpoints (master plan §10 B1
 * and B2). The UI is wired and disabled-states honour the eventual flow,
 * but clicking surfaces a "coming soon" toast instead of running anything.
 */
export function CodeTabActionBar() {
  const { repository, currentBranch } = useRepoIdentity();
  const {
    branches,
    branchOptions,
    busy,
    commitDraft,
    pendingFileChanges,
    switchBranchAction,
    createCommitAction,
    setCommitDraft,
    triggerCiAction,
    createMergeRequestAction,
    setMergeRequestDraft,
  } = useRepoState();

  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [mrOpen, setMrOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const currentBranchInfo = useMemo(
    () => branches.find((branch) => branch.name === currentBranch) ?? null,
    [branches, currentBranch],
  );

  const isProtected = currentBranchInfo?.protected ?? false;
  const hasPendingChanges = pendingFileChanges.length > 0;
  const isDefaultBranch = currentBranchInfo?.is_default ?? false;

  const commitDisabled = busy || isProtected || !hasPendingChanges;
  const buildDisabled = busy || !currentBranch;
  const proposeDisabled = busy || isDefaultBranch || branchOptions.length < 2;
  const previewDisabled = busy;
  const testDisabled = busy;

  async function handleCommitSubmit(draft: {
    title: string;
    description: string;
    sign_off: boolean;
    author_name?: string;
  }) {
    setCommitDraft({
      branch_name: currentBranch,
      title: draft.title,
      description: draft.description,
      sign_off: draft.sign_off,
      author_name: draft.author_name ?? '',
    });
    await createCommitAction();
    setCommitOpen(false);
  }

  async function handleMergeRequestSubmit(draft: {
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
    setMrOpen(false);
  }

  const overflowItems: HeaderMenuItem[] = [
    {
      id: 'merge',
      label: 'Merge another branch…',
      glyph: 'workflow',
      description: 'Merge a feature branch into the current branch.',
      onSelect: () => setMergeOpen(true),
    },
    {
      id: 'reset',
      label: 'Reset branch…',
      glyph: 'undo',
      description: `Discard uncommitted changes on ${currentBranch}.`,
      onSelect: () => setResetOpen(true),
    },
    {
      id: 'upgrade',
      label: 'Upgrade language versions…',
      glyph: 'shield-plus',
      onSelect: () => setUpgradeOpen(true),
    },
  ];

  const defaultTarget =
    branchOptions.find((name) => name === repository.default_branch && name !== currentBranch) ??
    branchOptions.find((name) => name !== currentBranch) ??
    repository.default_branch;

  return (
    <>
      <div className="flex items-center gap-1.5 h-11 px-3 border-b border-of-border bg-of-surface-raised">
        <BranchSelector
          branches={branches}
          currentBranch={currentBranch}
          busy={busy}
          onSwitch={(branch) => void switchBranchAction(branch)}
          onCreateBranch={() => setNewBranchOpen(true)}
        />

        {isProtected ? (
          <span
            className="ml-2 inline-flex items-center gap-1 text-of-12 text-of-warning"
            title="Protected branches cannot be edited directly"
          >
            <Glyph name="lock" size={12} tone="currentColor" /> Protected
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <ActionButton
            label="Preview"
            glyph="run"
            disabled={previewDisabled}
            onClick={() => notifications.info('Preview backend ships in Phase 4 (gap B1)')}
          />
          <ActionButton
            label="Test"
            glyph="badge-check"
            disabled={testDisabled}
            onClick={() => notifications.info('Test runner backend ships in Phase 4 (gap B2)')}
          />
          <ActionButton
            label="Commit"
            glyph="autosaved"
            disabled={commitDisabled}
            primary={!commitDisabled}
            onClick={() => setCommitOpen(true)}
            tooltip={
              isProtected
                ? 'Protected branch — commit via a pull request'
                : hasPendingChanges
                  ? `${pendingFileChanges.length} file change${pendingFileChanges.length === 1 ? '' : 's'} pending`
                  : 'Edit a file in the editor first'
            }
          />
          <ActionButton
            label="Build"
            glyph="pipeline"
            disabled={buildDisabled}
            onClick={() => void triggerCiAction()}
          />
          <ActionButton
            label="Propose changes"
            glyph="share"
            disabled={proposeDisabled}
            onClick={() => setMrOpen(true)}
            tooltip={
              isDefaultBranch
                ? 'Switch to a feature branch first'
                : branchOptions.length < 2
                  ? 'No target branch available'
                  : `Open a pull request from ${currentBranch}`
            }
          />
          <HeaderMenu
            iconOnly
            glyph="menu"
            align="end"
            title="More actions"
            items={overflowItems}
            width={280}
          />
        </div>
      </div>

      <NewBranchDialog open={newBranchOpen} onClose={() => setNewBranchOpen(false)} />
      <CommitDialog
        open={commitOpen}
        onClose={() => setCommitOpen(false)}
        branchName={currentBranch}
        defaultAuthor={commitDraft.author_name || undefined}
        pendingChanges={pendingFileChanges}
        busy={busy}
        onSubmit={handleCommitSubmit}
      />
      <NewMergeRequestDialog
        open={mrOpen}
        onClose={() => setMrOpen(false)}
        sourceBranch={currentBranch}
        defaultTargetBranch={defaultTarget}
        availableTargets={branchOptions}
        defaultAuthor={undefined}
        busy={busy}
        onSubmit={handleMergeRequestSubmit}
      />
      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} />
      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </>
  );
}

interface ActionButtonProps {
  label: string;
  glyph: Parameters<typeof Glyph>[0]['name'];
  disabled?: boolean;
  primary?: boolean;
  tooltip?: string;
  onClick: () => void;
}

function ActionButton({ label, glyph, disabled, primary, tooltip, onClick }: ActionButtonProps) {
  const base =
    'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-of-sm text-of-12 font-of-medium transition-colors';
  const palette = disabled
    ? 'text-of-text-soft cursor-not-allowed'
    : primary
      ? 'bg-of-accent text-white hover:bg-of-accent-hover'
      : 'text-of-text-muted hover:bg-of-surface-muted hover:text-of-text';
  return (
    <button
      type="button"
      disabled={disabled}
      title={tooltip ?? label}
      onClick={onClick}
      className={`${base} ${palette}`}
    >
      <Glyph name={glyph} size={14} tone="currentColor" />
      <span>{label}</span>
    </button>
  );
}
