import { useEffect, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { dialogs, useIsDialogOpen } from '../state/useDialogs';

/**
 * Foundry-style "Merge another branch into current" dialog. Picks a
 * source branch from the dropdown, defaults the target to the active
 * branch, captures a commit message + optional sign-off + author, and
 * fires mergeBranchAction from useRepoState.
 */
export function MergeDialog() {
  const open = useIsDialogOpen('merge');
  const { repository, currentBranch } = useRepoIdentity();
  const { branches, branchOptions, mergeBranchAction, busy } = useRepoState();

  const initialSource = branchOptions.find((branch) => branch !== currentBranch) ?? '';
  const [source, setSource] = useState(initialSource);
  const [target, setTarget] = useState(currentBranch || repository.default_branch);
  const [message, setMessage] = useState('');
  const [signOff, setSignOff] = useState(true);
  const [author, setAuthor] = useState('');

  useEffect(() => {
    if (!open) return;
    setSource(branchOptions.find((branch) => branch !== currentBranch) ?? '');
    setTarget(currentBranch || repository.default_branch);
    setMessage('');
    setSignOff(true);
    setAuthor('');
  }, [open, currentBranch, repository.default_branch, branchOptions]);

  if (!open) return null;

  const canSubmit = !busy && source.length > 0 && target.length > 0 && source !== target;

  async function submit() {
    if (!canSubmit) return;
    await mergeBranchAction(source, target);
    dialogs.close('merge');
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => dialogs.close('merge')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Merge another branch"
        className="relative w-full max-w-xl mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold inline-flex items-center gap-2">
            <Glyph name="workflow" size={14} tone="muted" />
            Merge another branch
          </h2>
          <button
            type="button"
            onClick={() => dialogs.close('merge')}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">Merge from</label>
              <select
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13 font-mono"
              >
                {branches
                  .filter((branch) => branch.name !== target)
                  .map((branch) => (
                    <option key={branch.id} value={branch.name}>
                      {branch.name}
                      {branch.is_default ? ' (default)' : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">Into</label>
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13 font-mono"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.name} disabled={branch.name === source}>
                    {branch.name}
                    {branch.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {source === target ? (
            <p className="text-of-12 text-of-warning">Pick a different source and target branch.</p>
          ) : null}

          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">Commit message</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              placeholder={`Merge ${source || 'source'} into ${target || 'target'}`}
              className="mt-1 w-full px-3 py-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-of-12 font-of-semibold text-of-text-muted block">Author</label>
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="(use signed-in identity)"
                className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
              />
            </div>
            <label className="flex items-end gap-2 pb-1">
              <input
                type="checkbox"
                checked={signOff}
                onChange={(event) => setSignOff(event.target.checked)}
                className="accent-of-accent"
              />
              <span className="text-of-13">Add sign-off trailer</span>
            </label>
          </div>
        </div>

        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={() => dialogs.close('merge')}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium ${
              canSubmit ? 'bg-of-accent text-white hover:bg-of-accent-hover' : 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
            }`}
          >
            <Glyph name="check" size={12} tone="currentColor" />
            Merge
          </button>
        </footer>
      </div>
    </div>
  );
}
