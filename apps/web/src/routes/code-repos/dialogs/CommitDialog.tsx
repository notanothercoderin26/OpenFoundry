import { useEffect, useState } from 'react';

import type { RepositoryFileMutation } from '@/lib/api/code-repos';
import { Glyph } from '@/lib/components/ui/Glyph';

export interface CommitDialogProps {
  open: boolean;
  onClose: () => void;
  branchName: string;
  defaultAuthor?: string;
  pendingChanges: ReadonlyArray<RepositoryFileMutation>;
  busy: boolean;
  /**
   * Fires when the user confirms the commit. The page is expected to call
   * createCommit with the supplied draft and then close the dialog.
   */
  onSubmit: (draft: {
    title: string;
    description: string;
    sign_off: boolean;
    author_name?: string;
  }) => Promise<void> | void;
}

function actionLabel(action: RepositoryFileMutation['action']) {
  switch (action) {
    case 'new':
      return 'created';
    case 'save':
      return 'edited';
    case 'rename':
      return 'renamed';
    case 'move':
      return 'moved';
    case 'delete':
      return 'deleted';
    default:
      return action;
  }
}

function actionTone(action: RepositoryFileMutation['action']) {
  switch (action) {
    case 'new':
      return 'text-of-success';
    case 'delete':
      return 'text-of-danger';
    case 'rename':
    case 'move':
      return 'text-of-warning';
    default:
      return 'text-of-text-muted';
  }
}

/**
 * Foundry-style commit modal. Lists the pending file mutations gathered by
 * the editor and lets the user attach a title, description, sign-off flag
 * and an explicit author. Submission is delegated to the page so the
 * existing createCommit handler and its invalidation flow are reused.
 */
export function CommitDialog({
  open,
  onClose,
  branchName,
  defaultAuthor,
  pendingChanges,
  busy,
  onSubmit,
}: CommitDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [signOff, setSignOff] = useState(true);
  const [authorName, setAuthorName] = useState('');

  useEffect(() => {
    if (open) {
      setAuthorName(defaultAuthor ?? '');
    }
  }, [open, defaultAuthor]);

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && pendingChanges.length > 0 && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      sign_off: signOff,
      author_name: authorName.trim() || undefined,
    });
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Commit changes"
        className="relative w-full max-w-xl mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold">Commit on {branchName}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Refine package manifest defaults"
              className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            />
          </div>

          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Tighten metadata defaults ahead of publication."
              className="mt-1 w-full px-3 py-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">Author</label>
              <input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="(use signed-in identity)"
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
              />
            </div>
            <label className="flex items-end gap-2 pb-1">
              <input
                type="checkbox"
                checked={signOff}
                onChange={(e) => setSignOff(e.target.checked)}
                className="accent-of-accent"
              />
              <span className="text-of-13">Add sign-off trailer</span>
            </label>
          </div>

          <div>
            <p className="text-of-12 font-of-semibold text-of-text-muted">
              {pendingChanges.length} pending change{pendingChanges.length === 1 ? '' : 's'}
            </p>
            {pendingChanges.length === 0 ? (
              <p className="mt-1 text-of-12 text-of-text-soft">
                Edit a file in the editor before committing — Foundry refuses empty atomic commits.
              </p>
            ) : (
              <ul className="mt-1 max-h-40 overflow-auto border border-of-border rounded-of-sm divide-y divide-of-border">
                {pendingChanges.map((change, index) => (
                  <li key={`${change.action}:${change.path}:${index}`} className="flex items-center gap-2 px-2 py-1">
                    <span className={`text-of-12 font-of-semibold uppercase ${actionTone(change.action)}`}>
                      {actionLabel(change.action)}
                    </span>
                    <span className="font-mono text-of-12 text-of-text truncate">{change.path}</span>
                    {change.new_path && change.new_path !== change.path ? (
                      <>
                        <Glyph name="chevron-right" size={10} tone="muted" />
                        <span className="font-mono text-of-12 text-of-text truncate">{change.new_path}</span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium ${
              canSubmit
                ? 'bg-of-accent text-white hover:bg-of-accent-hover'
                : 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
            }`}
          >
            <Glyph name="check" size={14} tone="currentColor" />
            Create commit
          </button>
        </footer>
      </div>
    </div>
  );
}
