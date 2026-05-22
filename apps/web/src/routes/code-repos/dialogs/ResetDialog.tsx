import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { dialogs, useIsDialogOpen } from '../state/useDialogs';
import { openFiles, useOpenFiles } from '../state/useOpenFiles';

/**
 * Foundry-style "Reset branch" confirmation. Discards every pending
 * editor change for the active branch and clears the dirty buffer in
 * useOpenFiles. A true server-side reset to origin requires a backend
 * endpoint that is not in scope today; the dialog surfaces this and
 * resets the client-side state only.
 */
export function ResetDialog() {
  const open = useIsDialogOpen('reset');
  const { currentBranch } = useRepoIdentity();
  const { pendingFileChanges, setPendingFileChanges, busy } = useRepoState();
  const { dirty } = useOpenFiles();

  if (!open) return null;

  const dirtyCount = Object.keys(dirty).length + pendingFileChanges.length;

  function confirmReset() {
    for (const path of Object.keys(dirty)) {
      openFiles.clearDirty(path);
    }
    setPendingFileChanges([]);
    notifications.success(`Cleared local edits on ${currentBranch}`);
    dialogs.close('reset');
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => dialogs.close('reset')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reset branch"
        className="relative w-full max-w-md mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold inline-flex items-center gap-2">
            <Glyph name="undo" size={14} tone="muted" />
            Reset {currentBranch}
          </h2>
          <button
            type="button"
            onClick={() => dialogs.close('reset')}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-3">
          <p className="text-of-13 text-of-text">
            This drops every uncommitted change on{' '}
            <span className="font-mono">{currentBranch}</span>. The editor buffer and the
            pending-changes list will be cleared.
          </p>
          <div className="rounded-of-sm border border-of-warning-soft bg-of-warning-soft p-3 text-of-12 text-of-warning">
            <p className="font-of-semibold">{dirtyCount} change{dirtyCount === 1 ? '' : 's'} pending</p>
            <p className="mt-1">
              A server-side reset to <code className="font-mono">origin/{currentBranch}</code> requires a backend
              endpoint that is not wired yet. The client buffer is cleared on confirm.
            </p>
          </div>
        </div>

        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={() => dialogs.close('reset')}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || dirtyCount === 0}
            onClick={confirmReset}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium ${
              busy || dirtyCount === 0
                ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
                : 'bg-of-danger text-white hover:opacity-90'
            }`}
          >
            <Glyph name="undo" size={12} tone="currentColor" />
            Discard local edits
          </button>
        </footer>
      </div>
    </div>
  );
}
