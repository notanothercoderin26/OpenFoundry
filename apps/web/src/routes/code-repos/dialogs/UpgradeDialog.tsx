import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoIdentity } from '../state/RepoContext';
import { dialogs, useIsDialogOpen } from '../state/useDialogs';

interface UpgradeCandidate {
  package: string;
  current: string;
  latest: string;
  channel: 'stable' | 'beta';
}

function candidatesForRepo(language: string | undefined): ReadonlyArray<UpgradeCandidate> {
  switch (language) {
    case 'python':
      return [
        { package: 'transforms', current: '5.420.0', latest: '5.430.0', channel: 'stable' },
        { package: 'foundry-platform-sdk', current: '2.1.4', latest: '2.2.0', channel: 'beta' },
        { package: 'pyspark', current: '3.4.1', latest: '3.5.0', channel: 'stable' },
      ];
    case 'typescript':
    case 'javascript':
      return [
        { package: '@open-foundry/sdk', current: '1.12.0', latest: '1.13.2', channel: 'stable' },
        { package: 'vite', current: '7.0.0', latest: '8.0.12', channel: 'stable' },
      ];
    case 'rust':
      return [
        { package: 'gitoxide', current: '0.66.0', latest: '0.69.0', channel: 'stable' },
        { package: 'serde', current: '1.0.196', latest: '1.0.219', channel: 'stable' },
      ];
    default:
      return [];
  }
}

/**
 * Upgrade language versions dialog. The repository service does not yet
 * expose a package-resolution endpoint, so the list is illustrative and
 * keyed by the active repository's primary language. The Apply button
 * is wired to a notification placeholder until the backend ships.
 */
export function UpgradeDialog() {
  const open = useIsDialogOpen('upgrade');
  const { repository } = useRepoIdentity();
  const candidates = candidatesForRepo(repository.language_template);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => dialogs.close('upgrade')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade language versions"
        className="relative w-full max-w-xl mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold inline-flex items-center gap-2">
            <Glyph name="shield-plus" size={14} tone="muted" />
            Upgrade language versions
          </h2>
          <button
            type="button"
            onClick={() => dialogs.close('upgrade')}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-3">
          {candidates.length === 0 ? (
            <p className="text-of-13 text-of-text-muted">
              No upgrade candidates available for{' '}
              <span className="font-mono">{repository.language_template || 'this language'}</span>.
            </p>
          ) : (
            <ul className="rounded-of-md border border-of-border bg-of-surface divide-y divide-of-border">
              {candidates.map((entry) => (
                <li key={entry.package} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 min-w-0">
                    <p className="text-of-13 font-of-semibold text-of-text font-mono truncate">
                      {entry.package}
                    </p>
                    <p className="mt-0.5 text-of-12 text-of-text-soft font-mono">
                      {entry.current} → {entry.latest}
                    </p>
                  </span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-of-sm text-of-12 capitalize ${
                      entry.channel === 'stable' ? 'bg-of-success-soft text-of-success' : 'bg-of-warning-soft text-of-warning'
                    }`}
                  >
                    {entry.channel}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-of-12 text-of-text-soft">
            The upgrade plan above is illustrative. Hooking it to the real package resolver is the next backend
            milestone — the apply action below currently surfaces a toast.
          </p>
        </div>

        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={() => dialogs.close('upgrade')}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={candidates.length === 0}
            onClick={() => {
              notifications.info('Package upgrade ships once the resolver endpoint lands');
              dialogs.close('upgrade');
            }}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium ${
              candidates.length === 0
                ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
                : 'bg-of-accent text-white hover:bg-of-accent-hover'
            }`}
          >
            <Glyph name="check" size={12} tone="currentColor" />
            Apply all
          </button>
        </footer>
      </div>
    </div>
  );
}
