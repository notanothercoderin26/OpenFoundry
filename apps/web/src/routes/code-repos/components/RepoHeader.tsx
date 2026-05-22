import { useNavigate } from 'react-router-dom';

import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoContext } from '../state/useRepoContext';

interface RepoHeaderProps {
  unreadNotificationCount?: number;
}

/**
 * Top header for the Code Repositories IDE. Mirrors the Foundry layout:
 *
 *   [<>]  Project › Repo ★   |   Code  Branches  PRs  Checks  Settings   |   Explore lineage  Clone  ?  🔔  Share  ≡
 *
 * Phase 0 ships the structure with working Clone-URL copy and breadcrumb
 * navigation. Share / Help / Notifications are wired with placeholders that
 * surface a toast — they get real behaviour in F1 (Help tour) and F3
 * (permission dialog).
 */
export function RepoHeader({ unreadNotificationCount = 0 }: RepoHeaderProps) {
  const navigate = useNavigate();
  const { repository } = useRepoContext();

  async function copyCloneUrl() {
    if (!repository) return;
    try {
      await navigator.clipboard.writeText(repository.git_http_url);
      notifications.success(`Copied HTTPS clone URL for ${repository.name}`);
    } catch {
      notifications.error('Unable to copy clone URL');
    }
  }

  if (!repository) {
    return (
      <header className="flex items-center h-12 px-4 border-b border-of-border bg-of-surface-raised">
        <Glyph name="code" size={16} tone="muted" />
        <span className="ml-2 text-of-13 text-of-text-muted">Code Repositories</span>
      </header>
    );
  }

  return (
    <header className="flex items-center h-12 px-3 gap-2 border-b border-of-border bg-of-surface-raised">
      <button
        type="button"
        onClick={() => navigate('/code-repos')}
        className="inline-flex items-center justify-center w-8 h-8 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
        title="Back to Code Repositories"
      >
        <Glyph name="code" size={16} tone="currentColor" />
      </button>

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-of-13 text-of-text-muted min-w-0">
        <button
          type="button"
          onClick={() => navigate('/code-repos')}
          className="hover:text-of-text hover:underline truncate"
        >
          {repository.owner || 'Code Repositories'}
        </button>
        <span aria-hidden className="text-of-text-soft">›</span>
        <span className="text-of-text-soft truncate" title={repository.slug}>
          …
        </span>
        <span aria-hidden className="text-of-text-soft">›</span>
        <span className="text-of-text font-of-semibold truncate" title={repository.name}>
          {repository.name}
        </span>
        <button
          type="button"
          className="inline-flex items-center justify-center w-6 h-6 rounded-of-sm text-of-text-soft hover:text-of-accent"
          title="Star repository (coming in F5)"
          onClick={() => notifications.info('Star is coming in Phase 5')}
        >
          <Glyph name="star" size={14} tone="currentColor" />
        </button>
      </nav>

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
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-of-sm text-of-12 font-of-medium text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          onClick={() => void copyCloneUrl()}
          title={repository.git_http_url}
        >
          Clone
          <Glyph name="chevron-down" size={12} tone="currentColor" />
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center w-8 h-8 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          title="Help (coming in Phase 3 — tour)"
          onClick={() => notifications.info('In-app tour is coming in Phase 3')}
        >
          <Glyph name="help" size={16} tone="currentColor" />
        </button>
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
          title="Share repository (coming in Phase 5)"
          onClick={() => notifications.info('Share dialog is coming in Phase 5')}
        >
          <Glyph name="users" size={14} tone="currentColor" />
          Share
        </button>
      </div>
    </header>
  );
}
