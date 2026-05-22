import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import { listNotepadDocuments, type NotepadDocument } from '@/lib/api/notepad';
import { Glyph } from '@/lib/components/ui/Glyph';

interface NotepadHoverPanelProps {
  anchorTop: number;
  anchorLeft: number;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function documentTitle(doc: NotepadDocument): string {
  return doc.title.trim() || 'Untitled document';
}

export function NotepadHoverPanel({
  anchorTop,
  anchorLeft,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: NotepadHoverPanelProps) {
  const [docs, setDocs] = useState<NotepadDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    listNotepadDocuments({ per_page: 5 })
      .then((resp) => {
        if (cancelled) return;
        setDocs(resp.data ?? []);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Failed to load documents');
        setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!newMenuOpen) return;
    function onPointer(event: globalThis.MouseEvent) {
      if (!splitRef.current?.contains(event.target as Node)) {
        setNewMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setNewMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [newMenuOpen]);

  // No real /docs route exists yet; route the link to the Notepad
  // landing page as a fallback and let the destination be re-pointed
  // once the docs site lands.
  function onDocsClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    onClose();
  }

  return createPortal(
    <div
      className="of-notepad-hover"
      style={{ top: anchorTop, left: anchorLeft }}
      role="dialog"
      aria-label="Notepad"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <header className="of-notepad-hover__header">
        <span
          className="of-notepad-hover__icon"
          aria-hidden="true"
          style={{ color: '#f472b6' }}
        >
          <Glyph name="notebook" size={20} tone="#f472b6" />
        </span>
        <div className="of-notepad-hover__heading">
          <h3 className="of-notepad-hover__title">Notepad</h3>
          <p className="of-notepad-hover__desc">
            Create, share, and export object-aware documents and reports.
          </p>
          <a
            href="/notepad"
            className="of-notepad-hover__docs"
            onClick={onDocsClick}
          >
            View documentation
          </a>
        </div>
      </header>

      <div className="of-notepad-hover__refs">
        <p className="of-notepad-hover__refs-label">References</p>
        {docs === null && !error && (
          <p className="of-notepad-hover__refs-empty">Loading…</p>
        )}
        {error && (
          <p className="of-notepad-hover__refs-empty">{error}</p>
        )}
        {docs && docs.length === 0 && !error && (
          <p className="of-notepad-hover__refs-empty">No documents yet.</p>
        )}
        {docs &&
          docs.map((doc) => (
            <Link
              key={doc.id}
              to={`/notepad/${doc.id}`}
              className="of-notepad-hover__ref"
              onClick={onClose}
            >
              <Glyph name="document" size={14} />
              <span>{documentTitle(doc)}</span>
            </Link>
          ))}
      </div>

      <footer className="of-notepad-hover__footer">
        <Link
          to="/notepad?examples=1"
          className="of-notepad-hover__examples"
          onClick={onClose}
        >
          <Glyph name="book-open" size={14} />
          <span>Browse examples</span>
        </Link>

        <div className="of-split-btn" ref={splitRef}>
          <Link
            to="/notepad?new=blank"
            className="of-split-btn__primary"
            onClick={onClose}
          >
            <Glyph name="plus" size={13} />
            <span>New document</span>
          </Link>
          <button
            type="button"
            className="of-split-btn__caret"
            aria-haspopup="menu"
            aria-expanded={newMenuOpen}
            aria-label="New document options"
            onClick={() => setNewMenuOpen((open) => !open)}
          >
            <Glyph name="chevron-down" size={11} />
          </button>
          {newMenuOpen && (
            <div role="menu" className="of-split-btn__menu">
              <Link
                to="/notepad?new=from-template"
                role="menuitem"
                className="of-split-btn__menu-item"
                onClick={onClose}
              >
                New from template
              </Link>
              <Link
                to="/notepad?new=template"
                role="menuitem"
                className="of-split-btn__menu-item"
                onClick={onClose}
              >
                New document template
              </Link>
            </div>
          )}
        </div>
      </footer>
    </div>,
    document.body,
  );
}
