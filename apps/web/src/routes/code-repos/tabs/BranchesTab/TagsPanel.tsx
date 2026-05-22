import { useMemo } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoIdentity, useRepoState } from '../../state/RepoContext';
import { dialogs } from '../../state/useDialogs';

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
 * Foundry-style Tags subsection. Lists every tag returned by listTags
 * with target SHA, tagger, message preview, and creation date; the
 * "+ New tag" button hands off to the real NewTagDialog where the
 * regex declared in repoSettings.json is enforced.
 */
export function TagsPanel() {
  const { repository } = useRepoIdentity();
  const { tags } = useRepoState();
  const validation = useMemo(() => readTagValidation(repository.settings), [repository.settings]);

  return (
    <div className="space-y-3 mt-4">
      <header className="flex items-center gap-2">
        <h3 className="text-of-14 font-of-semibold">{tags.length} tags</h3>
        {validation?.regex ? (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-of-sm bg-of-surface-muted text-of-12 text-of-text-muted"
            title="Tag names must match the configured regex (repoSettings.json)"
          >
            <Glyph name="shield" size={10} tone="muted" />
            <code className="font-mono">{validation.regex}</code>
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => dialogs.open('new-tag')}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-success text-white hover:opacity-90"
        >
          <Glyph name="plus" size={12} tone="currentColor" />
          New tag
        </button>
      </header>

      <section className="rounded-of-md border border-of-border bg-of-surface-raised overflow-hidden">
        <header className="grid grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)_140px_120px] gap-2 items-center px-3 h-9 border-b border-of-border bg-of-surface text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
          <span>Tag</span>
          <span>Target</span>
          <span>Message</span>
          <span>Tagger</span>
          <span>Created</span>
        </header>
        {tags.length === 0 ? (
          <p className="px-3 py-4 text-of-12 text-of-text-soft">
            No tags yet — release a version using the “+ New tag” button.
          </p>
        ) : (
          <ul className="divide-y divide-of-border">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="grid grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)_140px_120px] gap-2 items-center px-3 py-2"
              >
                <span
                  className="inline-flex items-center gap-1.5 text-of-13 font-mono text-of-text truncate"
                  title={tag.name}
                >
                  <Glyph name="tag" size={12} tone="muted" />
                  {tag.name}
                  {tag.protected ? <Glyph name="lock" size={10} tone="warning" /> : null}
                </span>
                <span
                  className="text-of-12 font-mono text-of-text-soft truncate"
                  title={tag.target_sha}
                >
                  {tag.target_sha.slice(0, 12)}
                </span>
                <span
                  className="text-of-12 text-of-text-muted truncate"
                  title={tag.message || '(no message)'}
                >
                  {tag.message || '—'}
                </span>
                <span className="text-of-12 text-of-text-soft truncate" title={tag.tagger}>
                  {tag.tagger || 'unknown'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    notifications.info('Tag detail view ships once the Releases page lands');
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
    </div>
  );
}
