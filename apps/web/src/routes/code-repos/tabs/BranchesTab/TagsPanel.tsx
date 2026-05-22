import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { NewTagDialog } from '../../dialogs/NewTagDialog';
import { useRepoIdentity, useRepoState } from '../../state/RepoContext';

interface TagValidationSettings {
  regex?: string;
  errorMessage?: string;
}

function readTagValidation(settings: Record<string, unknown> | undefined): TagValidationSettings | null {
  if (!settings) return null;
  const block =
    (settings.tagNameValidation as TagValidationSettings | undefined) ??
    (settings.tag_name_validation as TagValidationSettings | undefined);
  if (!block || typeof block !== 'object') return null;
  return {
    regex: typeof block.regex === 'string' ? block.regex : undefined,
    errorMessage: typeof block.errorMessage === 'string' ? block.errorMessage : undefined,
  };
}

/**
 * Tags subsection of the Branches tab. Reads tags from useRepoState and
 * exposes the New Tag flow plus a quick "Create tag" inline form whose
 * validation pulls the regex from `repoSettings.json` in the repository
 * settings (when present).
 */
export function TagsPanel() {
  const { repository } = useRepoIdentity();
  const { tags, branches, createTagAction, busy } = useRepoState();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState<string>(repository.default_branch);
  const [message, setMessage] = useState('');

  const validation = useMemo(() => readTagValidation(repository.settings), [repository.settings]);

  const validationError = useMemo(() => {
    if (!name || !validation?.regex) return null;
    try {
      const pattern = new RegExp(validation.regex);
      if (pattern.test(name)) return null;
      return validation.errorMessage ?? `Tag name must match ${validation.regex}`;
    } catch {
      return null;
    }
  }, [name, validation]);

  const canSubmit = !busy && name.trim().length > 0 && !validationError;

  async function submit() {
    if (!canSubmit) return;
    await createTagAction(name.trim(), target, message.trim(), false);
    setName('');
    setMessage('');
  }

  return (
    <div className="space-y-4 mt-4">
      <header className="flex items-center gap-2">
        <h3 className="text-of-14 font-of-semibold">{tags.length} tags</h3>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-success text-white hover:opacity-90"
        >
          <Glyph name="plus" size={12} tone="currentColor" />
          New tag
        </button>
      </header>

      <section className="rounded-of-md border border-of-border bg-of-surface-raised p-3 space-y-2">
        <p className="text-of-12 font-of-semibold text-of-text-muted uppercase tracking-wider">
          Quick tag
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <div>
            <label className="text-of-12 text-of-text-muted block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={validation?.regex ?? 'v1.0.0'}
              className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            />
          </div>
          <div>
            <label className="text-of-12 text-of-text-muted block">Target branch</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className={`h-9 px-3 rounded-of-sm text-of-12 font-of-medium ${
                canSubmit
                  ? 'bg-of-accent text-white hover:bg-of-accent-hover'
                  : 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
              }`}
            >
              Create tag
            </button>
          </div>
        </div>
        <div>
          <label className="text-of-12 text-of-text-muted block">Message (optional)</label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Annotated tag message"
            className="mt-1 w-full h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
          />
        </div>
        {validation?.regex ? (
          <p className="text-of-12 text-of-text-soft">
            Tags must match <code className="font-mono">{validation.regex}</code>.
          </p>
        ) : (
          <p className="text-of-12 text-of-text-soft">
            Add <code className="font-mono">tagNameValidation</code> to <code className="font-mono">repoSettings.json</code> to enforce a naming convention.
          </p>
        )}
        {validationError ? (
          <p className="text-of-12 text-of-danger">{validationError}</p>
        ) : null}
      </section>

      <section className="rounded-of-md border border-of-border bg-of-surface-raised overflow-hidden">
        <header className="grid grid-cols-[minmax(0,1fr)_140px_200px_120px] gap-2 items-center px-3 h-9 border-b border-of-border bg-of-surface text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
          <span>Tag</span>
          <span>Target</span>
          <span>Tagger</span>
          <span>Created</span>
        </header>
        {tags.length === 0 ? (
          <p className="px-3 py-4 text-of-12 text-of-text-soft">No tags yet.</p>
        ) : (
          <ul className="divide-y divide-of-border">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="grid grid-cols-[minmax(0,1fr)_140px_200px_120px] gap-2 items-center px-3 py-2"
              >
                <span className="inline-flex items-center gap-1.5 text-of-13 font-mono text-of-text truncate" title={tag.name}>
                  <Glyph name="tag" size={12} tone="muted" />
                  {tag.name}
                  {tag.protected ? <Glyph name="lock" size={10} tone="warning" /> : null}
                </span>
                <span className="text-of-12 font-mono text-of-text-soft truncate" title={tag.target_sha}>
                  {tag.target_sha.slice(0, 12)}
                </span>
                <span className="text-of-12 text-of-text-soft truncate">{tag.tagger || 'unknown'}</span>
                <button
                  type="button"
                  onClick={() => {
                    notifications.info('Open the tag detail in the future Releases area');
                  }}
                  className="text-of-12 text-of-text-soft hover:text-of-text text-left"
                >
                  {new Date(tag.created_at).toLocaleDateString()}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewTagDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
