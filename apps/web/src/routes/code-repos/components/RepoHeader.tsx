import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Glyph } from '@/lib/components/ui/Glyph';
import { Popover } from '@/lib/components/ui/Popover';
import { StarFavoriteButton } from '@/lib/components/ui/StarFavoriteButton';
import { favorites, useIsFavorite } from '@stores/favorites';
import { notifications } from '@stores/notifications';

import { ResetDialog } from '../dialogs/ResetDialog';
import { ShareDialog } from '../dialogs/ShareDialog';
import { UpgradeDialog } from '../dialogs/UpgradeDialog';
import { useRepoIdentity } from '../state/RepoContext';

import { HeaderMenu } from './HeaderMenu';

interface RepoHeaderProps {
  unreadNotificationCount?: number;
}

/**
 * Foundry-style top header for the IDE shell:
 *
 *   [<>] owner › … › repo ⭐ branch | File ▾  Help ▾ | Explore lineage  Clone ▾  ?  🔔  Share
 *
 * Star is backed by the local favorites store (no /star endpoint yet, see
 * master plan §10 B7). Clone opens a popover with HTTPS / SSH URLs ready
 * to copy. File / Help are real menus wired to the placeholder dialogs and
 * to documentation links. Share opens a placeholder permissions dialog.
 */
export function RepoHeader({ unreadNotificationCount = 0 }: RepoHeaderProps) {
  const navigate = useNavigate();
  const { repository, currentUser, currentBranch } = useRepoIdentity();
  const starred = useIsFavorite(repository.id);

  const cloneTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notifications.success(`Copied ${label}`);
    } catch {
      notifications.error(`Unable to copy ${label}`);
    }
  }

  const helpItems = [
    {
      id: 'tour',
      label: 'Take the tour',
      glyph: 'tour' as const,
      description: 'Step-by-step walkthrough of the IDE.',
      onSelect: () => notifications.info('In-app tour ships in Phase 3'),
    },
    {
      id: 'docs',
      label: 'Open documentation',
      glyph: 'book-open' as const,
      onSelect: () => navigate('/developers'),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      glyph: 'asterisk' as const,
      shortcut: 'F1',
      onSelect: () => notifications.info('Command palette ships in Phase 3 (F1)'),
    },
  ];

  const fileItems = [
    {
      id: 'reset',
      label: 'Reset branch…',
      glyph: 'undo' as const,
      description: `Discard uncommitted changes on ${currentBranch}.`,
      onSelect: () => setResetOpen(true),
    },
    {
      id: 'upgrade',
      label: 'Upgrade language versions…',
      glyph: 'shield-plus' as const,
      onSelect: () => setUpgradeOpen(true),
    },
  ];

  const helpTooltip = currentUser ? `Help — signed in as ${currentUser.name}` : 'Help';

  return (
    <header className="flex items-center h-12 px-3 gap-1 border-b border-of-border bg-of-surface-raised">
      <Link
        to="/code-repos"
        className="inline-flex items-center justify-center w-8 h-8 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
        title="Back to Code Repositories"
      >
        <Glyph name="code" size={16} tone="currentColor" />
      </Link>

      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-of-13 text-of-text-muted min-w-0"
      >
        <Link to="/code-repos" className="hover:text-of-text hover:underline truncate">
          {repository.owner || 'Code Repositories'}
        </Link>
        <span aria-hidden className="text-of-text-soft">›</span>
        <span className="text-of-text-soft truncate" title={repository.slug}>
          …
        </span>
        <span aria-hidden className="text-of-text-soft">›</span>
        <span className="text-of-text font-of-semibold truncate" title={repository.name}>
          {repository.name}
        </span>
        <StarFavoriteButton
          value={starred}
          size="sm"
          onChange={() => {
            favorites.toggle(repository.id);
            notifications.info(starred ? 'Removed from favorites' : 'Added to favorites');
          }}
        />
        <span aria-hidden className="text-of-text-soft">·</span>
        <span
          className="text-of-12 text-of-text-soft truncate"
          title={`Current branch: ${currentBranch}`}
        >
          {currentBranch}
        </span>
      </nav>

      <div className="ml-3 flex items-center gap-0.5">
        <HeaderMenu label="File" items={fileItems} width={260} />
        <HeaderMenu label="Help" items={helpItems} width={240} title={helpTooltip} />
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-of-sm text-of-12 font-of-medium text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          onClick={() => navigate(`/lineage?repo=${encodeURIComponent(repository.id)}`)}
          title="Explore lineage"
        >
          <Glyph name="lineage" size={14} tone="currentColor" />
          Explore lineage
        </button>

        <button
          ref={cloneTriggerRef}
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-of-sm text-of-12 font-of-medium text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          aria-haspopup="dialog"
          aria-expanded={cloneOpen}
          onClick={() => setCloneOpen((v) => !v)}
        >
          Clone
          <Glyph name="chevron-down" size={12} tone="currentColor" />
        </button>
        <Popover
          open={cloneOpen}
          anchorRef={cloneTriggerRef}
          onClose={() => setCloneOpen(false)}
          placement="bottom"
          align="end"
          width={420}
          showArrow={false}
          ariaLabel="Clone repository"
        >
          <div className="p-3 space-y-3">
            <CloneUrlRow
              label="HTTPS"
              value={repository.git_http_url}
              onCopy={() => void copyToClipboard(repository.git_http_url, 'HTTPS clone URL')}
            />
            {repository.git_ssh_enabled ? (
              <CloneUrlRow
                label="SSH"
                value={repository.git_ssh_url}
                onCopy={() => void copyToClipboard(repository.git_ssh_url, 'SSH clone URL')}
              />
            ) : (
              <div className="text-of-12 text-of-text-soft">
                SSH access is disabled for this repository.
              </div>
            )}
            <p className="text-of-12 text-of-text-soft">
              Authenticate with your OIDC session credentials when prompted.
            </p>
          </div>
        </Popover>

        <HeaderMenu
          iconOnly
          glyph="help"
          title={helpTooltip}
          items={helpItems}
          align="end"
          width={240}
        />

        <button
          type="button"
          className="relative inline-flex items-center justify-center w-8 h-8 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          title="Notifications"
          onClick={() => navigate('/notifications')}
        >
          <Glyph name="bell" size={16} tone="currentColor" />
          {unreadNotificationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-of-accent text-white text-[10px] font-of-semibold">
              {unreadNotificationCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          title="Share repository"
          onClick={() => setShareOpen(true)}
        >
          <Glyph name="users" size={14} tone="currentColor" />
          Share
        </button>
      </div>

      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </header>
  );
}

interface CloneUrlRowProps {
  label: string;
  value: string;
  onCopy: () => void;
}

function CloneUrlRow({ label, value, onCopy }: CloneUrlRowProps) {
  return (
    <div>
      <p className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="flex-1 min-w-0 h-8 px-2 rounded-of-sm border border-of-border bg-of-surface-muted text-of-12 font-mono text-of-text"
        />
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center w-8 h-8 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          title={`Copy ${label} URL`}
        >
          <Glyph name="duplicate" size={14} tone="currentColor" />
        </button>
      </div>
    </div>
  );
}
