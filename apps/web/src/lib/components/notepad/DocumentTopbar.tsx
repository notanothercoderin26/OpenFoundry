import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Glyph } from '@/lib/components/ui/Glyph';

export interface DocumentTopbarNewAction {
  primaryLabel: string;
  primaryTo: string;
  menu: Array<{ label: string; to: string }>;
}

// Autosave indicator rendered just left of the meta cluster. Mirrors
// the three states the editor's autosave loop can be in.
export type DocumentSaveState =
  | { kind: 'idle'; lastSavedAt: Date | null }
  | { kind: 'saving' }
  | { kind: 'dirty' };

// Structural shape so the topbar stays decoupled from the API types.
// Compatible with NotepadPresence from lib/api/notepad.
export interface DocumentTopbarPresence {
  id: string;
  display_name: string;
  cursor_label?: string;
  color?: string;
}

export interface DocumentTopbarProps {
  title: string;
  folder?: string;
  isFavorite: boolean;
  onToggleFavorite?: () => void;
  isLocked?: boolean;
  saveState?: DocumentSaveState;
  presence?: DocumentTopbarPresence[];
  newAction?: DocumentTopbarNewAction;
}

function formatSaveState(state: DocumentSaveState): string {
  if (state.kind === 'saving') return 'Saving…';
  if (state.kind === 'dirty') return 'Unsaved changes';
  if (state.lastSavedAt) {
    const time = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(state.lastSavedAt);
    return `Saved · ${time}`;
  }
  return 'Saved';
}

export function DocumentTopbar({
  title,
  folder = 'Personal',
  isFavorite,
  onToggleFavorite,
  isLocked = false,
  saveState,
  presence,
  newAction,
}: DocumentTopbarProps) {
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!newOpen) return;
    function onPointer(event: globalThis.MouseEvent) {
      if (!newRef.current?.contains(event.target as Node)) setNewOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setNewOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [newOpen]);

  return (
    <header className="of-doc-topbar">
      <nav className="of-doc-topbar__breadcrumb" aria-label="Breadcrumb">
        <Link to="/notepad" className="of-doc-topbar__crumb of-doc-topbar__crumb--link">
          Notepad
        </Link>
        <span className="of-doc-topbar__sep" aria-hidden="true">
          ›
        </span>
        <span className="of-doc-topbar__crumb of-doc-topbar__crumb--link" title={folder}>
          {folder}
        </span>
        <span className="of-doc-topbar__sep" aria-hidden="true">
          ›
        </span>
        <span className="of-doc-topbar__crumb of-doc-topbar__crumb--current" title={title}>
          {title}
        </span>
      </nav>

      <div className="of-doc-topbar__meta">
        <button
          type="button"
          className="of-doc-topbar__icon-btn of-doc-topbar__icon-btn--star"
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={onToggleFavorite}
          disabled={!onToggleFavorite}
        >
          <Glyph name={isFavorite ? 'star-filled' : 'star'} size={14} />
        </button>
        {isLocked && (
          <span
            className="of-doc-topbar__icon-btn of-doc-topbar__icon-btn--static"
            title="Document is locked"
            aria-label="Document is locked"
          >
            <Glyph name="lock" size={14} />
          </span>
        )}

        {presence && presence.length > 0 && (
          <div
            className="of-doc-topbar__avatars"
            aria-label={`${presence.length} active collaborator${presence.length === 1 ? '' : 's'}`}
          >
            {presence.slice(0, 3).map((collaborator) => (
              <span
                key={collaborator.id}
                className="of-doc-topbar__avatar"
                style={{ background: collaborator.color || '#2d72d2' }}
                title={`${collaborator.display_name}${
                  collaborator.cursor_label ? `: ${collaborator.cursor_label}` : ''
                }`}
              >
                {collaborator.display_name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {presence.length > 3 && (
              <span className="of-doc-topbar__avatar of-doc-topbar__avatar--more">
                +{presence.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="of-doc-topbar__actions">
        {saveState && (
          <span
            className={`of-doc-topbar__save-state of-doc-topbar__save-state--${saveState.kind}`}
            aria-live="polite"
          >
            {formatSaveState(saveState)}
          </span>
        )}

        {newAction && (
          <div className="of-split-btn" ref={newRef}>
            <Link to={newAction.primaryTo} className="of-split-btn__primary">
              <Glyph name="plus" size={13} />
              <span>{newAction.primaryLabel}</span>
            </Link>
            <button
              type="button"
              className="of-split-btn__caret"
              aria-haspopup="menu"
              aria-expanded={newOpen}
              aria-label={`${newAction.primaryLabel} options`}
              onClick={() => setNewOpen((open) => !open)}
            >
              <Glyph name="chevron-down" size={11} />
            </button>
            {newOpen && (
              <div role="menu" className="of-split-btn__menu">
                {newAction.menu.map((item) => (
                  <Link
                    key={item.label}
                    role="menuitem"
                    to={item.to}
                    className="of-split-btn__menu-item"
                    onClick={() => setNewOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
