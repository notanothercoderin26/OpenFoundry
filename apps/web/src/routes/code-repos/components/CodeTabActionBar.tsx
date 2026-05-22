import { useMemo } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { dialogs } from '../state/useDialogs';

import { BranchSelector } from './BranchSelector';
import { HeaderMenu, type HeaderMenuItem } from './HeaderMenu';

/**
 * Foundry-style action bar that lives at the top of the Code tab:
 *
 *   [branch ▾] ✏️ ➕ ………… ▶ Preview  🧪 Test  💾 Commit  🔨 Build  📤 Propose changes  ⋯
 *
 * The bar drives the IDE's working state. Dialogs are opened through the
 * shared dialogs store so the same modal can be invoked from here, the
 * RepoHeader, the command palette, or any future caller.
 */
export function CodeTabActionBar() {
  const { repository, currentBranch } = useRepoIdentity();
  const {
    branches,
    branchOptions,
    busy,
    pendingFileChanges,
    switchBranchAction,
    triggerCiAction,
    setMergeRequestDraft,
  } = useRepoState();

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

  const overflowItems: HeaderMenuItem[] = [
    {
      id: 'merge',
      label: 'Merge another branch…',
      glyph: 'workflow',
      description: 'Merge a feature branch into the current branch.',
      onSelect: () => dialogs.open('merge'),
    },
    {
      id: 'reset',
      label: 'Reset branch…',
      glyph: 'undo',
      description: `Discard uncommitted changes on ${currentBranch}.`,
      onSelect: () => dialogs.open('reset'),
    },
    {
      id: 'upgrade',
      label: 'Upgrade language versions…',
      glyph: 'shield-plus',
      onSelect: () => dialogs.open('upgrade'),
    },
  ];

  return (
    <div
      data-tour="action-bar"
      className="flex items-center gap-1.5 h-11 px-3 border-b border-of-border bg-of-surface-raised"
    >
      <BranchSelector
        branches={branches}
        currentBranch={currentBranch}
        busy={busy}
        onSwitch={(branch) => void switchBranchAction(branch)}
        onCreateBranch={() => dialogs.open('new-branch')}
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
          disabled={busy}
          onClick={() => notifications.info('Preview backend ships in Phase 4 (gap B1)')}
          dataTour="preview-button"
        />
        <ActionButton
          label="Test"
          glyph="badge-check"
          disabled={busy}
          onClick={() => notifications.info('Test runner backend ships in Phase 4 (gap B2)')}
        />
        <ActionButton
          label="Commit"
          glyph="autosaved"
          disabled={commitDisabled}
          primary={!commitDisabled}
          onClick={() => dialogs.open('commit')}
          dataTour="commit-button"
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
          onClick={() => {
            setMergeRequestDraft({
              source_branch: currentBranch,
              target_branch: repository.default_branch,
            });
            dialogs.open('new-pull-request');
          }}
          dataTour="propose-button"
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
  );
}

interface ActionButtonProps {
  label: string;
  glyph: Parameters<typeof Glyph>[0]['name'];
  disabled?: boolean;
  primary?: boolean;
  tooltip?: string;
  dataTour?: string;
  onClick: () => void;
}

function ActionButton({
  label,
  glyph,
  disabled,
  primary,
  tooltip,
  dataTour,
  onClick,
}: ActionButtonProps) {
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
      data-tour={dataTour}
      onClick={onClick}
      className={`${base} ${palette}`}
    >
      <Glyph name={glyph} size={14} tone="currentColor" />
      <span>{label}</span>
    </button>
  );
}
