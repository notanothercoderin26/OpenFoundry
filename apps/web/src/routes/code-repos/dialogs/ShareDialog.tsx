import { useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoIdentity } from '../state/RepoContext';
import { dialogs, useIsDialogOpen } from '../state/useDialogs';

type Role = 'viewer' | 'editor' | 'owner';

interface PendingInvite {
  email: string;
  role: Role;
}

/**
 * Share dialog. The code-repository-review-service does not expose a
 * permissions endpoint yet (master plan §10), so we capture invite
 * intents client-side and surface the gap explicitly. The form shape
 * matches what the eventual endpoint will accept so the wiring is a
 * one-liner once the API ships.
 */
export function ShareDialog() {
  const open = useIsDialogOpen('share');
  const { repository } = useRepoIdentity();

  const [recipient, setRecipient] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [pending, setPending] = useState<PendingInvite[]>([]);

  if (!open) return null;

  function addInvite() {
    const email = recipient.trim();
    if (!email) return;
    if (pending.some((entry) => entry.email === email)) return;
    setPending((current) => [...current, { email, role }]);
    setRecipient('');
  }

  function removeInvite(email: string) {
    setPending((current) => current.filter((entry) => entry.email !== email));
  }

  function confirm() {
    if (pending.length === 0) {
      dialogs.close('share');
      return;
    }
    notifications.info(
      `Captured ${pending.length} invite${pending.length === 1 ? '' : 's'}. Backend permissions endpoint pending.`,
    );
    setPending([]);
    dialogs.close('share');
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => dialogs.close('share')}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share repository"
        className="relative w-full max-w-xl mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold inline-flex items-center gap-2">
            <Glyph name="users" size={14} tone="muted" />
            Share {repository.name}
          </h2>
          <button
            type="button"
            onClick={() => dialogs.close('share')}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>

        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)_140px_auto] gap-2">
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addInvite();
                }
              }}
              placeholder="Invite by email or username"
              className="h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              className="h-9 px-3 rounded-of-sm border border-of-border bg-of-surface-raised text-of-13"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </select>
            <button
              type="button"
              onClick={addInvite}
              disabled={recipient.trim().length === 0}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-of-sm text-of-12 font-of-medium ${
                recipient.trim().length === 0
                  ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
                  : 'bg-of-accent text-white hover:bg-of-accent-hover'
              }`}
            >
              <Glyph name="add-user" size={12} tone="currentColor" />
              Add
            </button>
          </div>

          {pending.length > 0 ? (
            <ul className="rounded-of-md border border-of-border bg-of-surface divide-y divide-of-border">
              {pending.map((entry) => (
                <li key={entry.email} className="flex items-center gap-2 px-3 py-2">
                  <Glyph name="users" size={12} tone="muted" />
                  <span className="flex-1 min-w-0 truncate">{entry.email}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-surface-muted text-of-12 capitalize">
                    {entry.role}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.email}`}
                    onClick={() => removeInvite(entry.email)}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-of-sm text-of-text-soft hover:bg-of-danger-soft hover:text-of-danger"
                  >
                    <Glyph name="x" size={12} tone="currentColor" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-of-12 text-of-text-soft">No pending invites.</p>
          )}

          <p className="rounded-of-sm border border-of-warning-soft bg-of-warning-soft text-of-12 text-of-warning p-3">
            Per-repo ACL persistence requires the permissions endpoint
            (master plan §10). The form above mirrors the eventual payload
            shape so wiring it to <code className="font-mono">PATCH /repositories/{repository.id}/acl</code> is
            a one-liner once that endpoint lands.
          </p>
        </div>

        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={() => dialogs.close('share')}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-accent text-white hover:bg-of-accent-hover"
          >
            <Glyph name="check" size={12} tone="currentColor" />
            {pending.length === 0 ? 'Done' : `Capture ${pending.length} invite${pending.length === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
