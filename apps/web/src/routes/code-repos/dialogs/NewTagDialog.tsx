import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { dialogs, useIsDialogOpen } from '../state/useDialogs';

type Mode = 'branch' | 'commit';

interface TagValidation {
  regex?: string;
  errorMessage?: string;
}

function readValidation(settings: Record<string, unknown>): TagValidation | null {
  const block =
    (settings.tagNameValidation as TagValidation | undefined) ??
    (settings.tag_name_validation as TagValidation | undefined);
  if (!block || typeof block !== 'object') return null;
  return {
    regex: typeof block.regex === 'string' ? block.regex : undefined,
    errorMessage: typeof block.errorMessage === 'string' ? block.errorMessage : undefined,
  };
}

/**
 * Foundry-style "Create new tag" modal. Mirrors the layout from the
 * docs site: name + message + tagger + protected flag, plus a Source
 * toggle for tagging the current branch HEAD vs. a specific commit
 * SHA. Validates the name client-side against the regex declared in
 * `repository.settings.tagNameValidation`.
 */
export function NewTagDialog() {
  const open = useIsDialogOpen('new-tag');
  const { repository } = useRepoIdentity();
  const { branches, commits, createTagAction, busy, currentBranch } = useRepoState();

  const validation = useMemo(() => readValidation(repository.settings), [repository.settings]);

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [protectedTag, setProtectedTag] = useState(false);
  const [mode, setMode] = useState<Mode>('branch');
  const [targetBranch, setTargetBranch] = useState<string>(currentBranch);
  const [targetCommit, setTargetCommit] = useState<string>(commits[0]?.sha ?? '');

  useEffect(() => {
    if (!open) return;
    setName('');
    setMessage('');
    setProtectedTag(false);
    setMode('branch');
    setTargetBranch(currentBranch);
    setTargetCommit(commits[0]?.sha ?? '');
  }, [open, currentBranch, commits]);

  if (!open) return null;

  const validationError = (() => {
    if (!name || !validation?.regex) return null;
    try {
      const pattern = new RegExp(validation.regex);
      if (pattern.test(name)) return null;
      return validation.errorMessage ?? `Tag name must match ${validation.regex}`;
    } catch {
      return null;
    }
  })();

  const target = mode === 'branch' ? targetBranch : targetCommit;
  const canSubmit = !busy && name.trim().length > 0 && !validationError && target.length > 0;

  async function submit() {
    if (!canSubmit) return;
    await createTagAction(name.trim(), target, message.trim(), protectedTag);
    dialogs.close('new-tag');
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => dialogs.close('new-tag')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create new tag"
        className="relative w-full max-w-xl mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold inline-flex items-center gap-2">
            <Glyph name="tag" size={14} tone="muted" />
            Create new tag
          </h2>
          <button
            type="button"
            onClick={() => dialogs.close('new-tag')}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">Tag name</label>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={validation?.regex ?? 'v1.0.0'}
              className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13 font-mono"
            />
            {validation?.regex ? (
              <p className="mt-1 text-of-12 text-of-text-soft">
                Names must match <code className="font-mono">{validation.regex}</code>.
              </p>
            ) : (
              <p className="mt-1 text-of-12 text-of-text-soft">
                Add a <code className="font-mono">tagNameValidation</code> block to{' '}
                <code className="font-mono">repoSettings.json</code> to enforce a convention.
              </p>
            )}
            {validationError ? (
              <p className="mt-1 text-of-12 text-of-danger">{validationError}</p>
            ) : null}
          </div>

          <fieldset className="border border-of-border rounded-of-sm p-3 space-y-2">
            <legend className="px-1 text-of-12 font-of-semibold text-of-text-muted">Source</legend>
            <label className="flex items-start gap-2 text-of-13">
              <input
                type="radio"
                name="tag-source"
                checked={mode === 'branch'}
                onChange={() => setMode('branch')}
                className="mt-0.5 accent-of-accent"
              />
              <span className="flex-1">
                From current branch
                <select
                  value={targetBranch}
                  onChange={(event) => setTargetBranch(event.target.value)}
                  disabled={mode !== 'branch'}
                  className="mt-1 w-full h-8 px-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12 font-mono"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="flex items-start gap-2 text-of-13">
              <input
                type="radio"
                name="tag-source"
                checked={mode === 'commit'}
                onChange={() => setMode('commit')}
                className="mt-0.5 accent-of-accent"
              />
              <span className="flex-1">
                From specific commit
                <input
                  value={targetCommit}
                  onChange={(event) => setTargetCommit(event.target.value)}
                  disabled={mode !== 'commit'}
                  placeholder="a1b2c3d4…"
                  className="mt-1 w-full h-8 px-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12 font-mono"
                />
                {commits.length > 0 ? (
                  <p className="mt-1 text-of-12 text-of-text-soft truncate">
                    Recent: {commits.slice(0, 3).map((commit) => commit.sha.slice(0, 8)).join(', ')}
                  </p>
                ) : null}
              </span>
            </label>
          </fieldset>

          <div>
            <label className="text-of-12 font-of-semibold text-of-text-muted block">Message</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={3}
              placeholder="Annotated tag message"
              className="mt-1 w-full px-3 py-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            />
          </div>

          <label className="flex items-start gap-2 text-of-13">
            <input
              type="checkbox"
              checked={protectedTag}
              onChange={(event) => setProtectedTag(event.target.checked)}
              className="mt-0.5 accent-of-accent"
            />
            <span>Mark this tag as protected (only admins can move it).</span>
          </label>
        </div>

        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={() => dialogs.close('new-tag')}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className={`inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium ${
              canSubmit ? 'bg-of-success text-white hover:opacity-90' : 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
            }`}
          >
            Create tag
          </button>
        </footer>
      </div>
    </div>
  );
}
