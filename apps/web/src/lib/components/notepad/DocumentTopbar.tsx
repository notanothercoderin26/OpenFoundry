import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

export interface DocumentTopbarAction {
  key: string;
  label: string;
  icon?: GlyphName;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface DocumentTopbarNewAction {
  primaryLabel: string;
  primaryTo: string;
  menu: Array<{ label: string; to: string }>;
}

export interface DocumentTopbarProps {
  title: string;
  folder?: string;
  isFavorite: boolean;
  onToggleFavorite?: () => void;
  isLocked?: boolean;
  actions?: DocumentTopbarAction[];
  newAction?: DocumentTopbarNewAction;
}

export function DocumentTopbar({
  title,
  folder = 'Personal',
  isFavorite,
  onToggleFavorite,
  isLocked = false,
  actions,
  newAction,
}: DocumentTopbarProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const newRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!actionsOpen && !newOpen) return;
    function onPointer(event: globalThis.MouseEvent) {
      const target = event.target as Node;
      if (actionsOpen && actionsRef.current && !actionsRef.current.contains(target)) {
        setActionsOpen(false);
      }
      if (newOpen && newRef.current && !newRef.current.contains(target)) {
        setNewOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActionsOpen(false);
        setNewOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen, newOpen]);

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
      </div>

      <div className="of-doc-topbar__actions">
        {actions && actions.length > 0 && (
          <div className="of-doc-topbar__menu-wrap" ref={actionsRef}>
            <button
              type="button"
              className="of-doc-topbar__btn"
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((open) => !open)}
            >
              <span>Actions</span>
              <Glyph name="chevron-down" size={11} />
            </button>
            {actionsOpen && (
              <div role="menu" className="of-doc-topbar__menu">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    role="menuitem"
                    className={`of-doc-topbar__menu-item${
                      action.danger ? ' of-doc-topbar__menu-item--danger' : ''
                    }`}
                    disabled={action.disabled}
                    onClick={() => {
                      setActionsOpen(false);
                      action.onClick();
                    }}
                  >
                    {action.icon && <Glyph name={action.icon} size={13} />}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
