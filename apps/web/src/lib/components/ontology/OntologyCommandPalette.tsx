import { useEffect, useRef, useState } from 'react';

import { Glyph } from '@components/ui/Glyph';

export interface OntologyCommandResult {
  id: string;
  kind: string;
  label: string;
  detail: string;
  /** Opaque section id the page navigates to when the user picks the result. */
  section: string;
}

interface OntologyCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Live query string. Owned by the caller so the same input can be mirrored
   *  in the top bar if desired. */
  query: string;
  onQueryChange: (next: string) => void;
  /** Pre-filtered results matching `query`. The palette renders them as-is. */
  results: ReadonlyArray<OntologyCommandResult>;
  /** Total result count (results may be a truncated page). */
  totalCount?: number;
  /** Invoked when the user picks a result (Enter or click). */
  onPick: (result: OntologyCommandResult) => void;
  /** Placeholder shown inside the modal's input. */
  placeholder?: string;
}

/**
 * Foundry-style command palette: a modal overlay opened by ⌘K with its own
 * search input and a list of ontology resources. Independent of the top
 * bar's inline search input — closing the modal restores focus to whatever
 * had it before.
 *
 * Keyboard model:
 *  - ESC closes
 *  - ↑/↓ moves the highlighted result
 *  - Enter picks the highlighted result (or first if none highlighted)
 *  - Backdrop click closes
 */
export function OntologyCommandPalette({
  open,
  onClose,
  query,
  onQueryChange,
  results,
  totalCount,
  onPick,
  placeholder = 'Search by name, RID, aliases…',
}: OntologyCommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query, open]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = results[cursor] ?? results[0];
      if (pick) {
        onPick(pick);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4"
      style={{ background: 'rgba(17, 24, 39, 0.45)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search ontology resources"
        onClick={(e) => e.stopPropagation()}
        className={[
          'w-full max-w-[640px] flex flex-col overflow-hidden',
          'bg-of-surface-raised border border-of-border rounded-of-md shadow-of-popover',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 px-3 h-11 border-b border-of-border">
          <Glyph name="search" size={14} tone="var(--of-text-muted)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className={[
              'flex-1 min-w-0 bg-transparent border-0 outline-none',
              'text-of-14 text-of-text placeholder:text-of-text-soft',
            ].join(' ')}
            aria-label="Search ontology resources"
          />
          <kbd
            className={[
              'inline-flex items-center justify-center min-w-[28px] h-5 px-1.5',
              'rounded-of-sm border border-of-border bg-of-surface',
              'text-of-12 font-of-medium text-of-text-muted',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            esc
          </kbd>
        </div>

        <ul
          role="listbox"
          aria-label="Search results"
          className="max-h-[420px] overflow-y-auto m-0 p-1.5 list-none"
        >
          {results.length === 0 ? (
            <li className="px-3 py-6 text-of-13 text-of-text-muted text-center">
              {query.trim()
                ? 'No matching ontology resources.'
                : 'Type to search object types, properties, links, actions, interfaces…'}
            </li>
          ) : (
            results.map((result, index) => {
              const active = index === cursor;
              return (
                <li key={result.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => onPick(result)}
                    className={[
                      'group w-full flex items-start gap-3 px-2.5 py-2 rounded-of-sm text-left',
                      active ? 'bg-of-accent-soft' : 'hover:bg-of-surface-muted',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-of-sm',
                        active ? 'bg-of-accent text-white' : 'bg-of-surface text-of-text-muted',
                      ].join(' ')}
                      aria-hidden
                    >
                      <Glyph
                        name="cube"
                        size={12}
                        tone={active ? '#ffffff' : 'var(--of-text-muted)'}
                      />
                    </span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span
                        className={[
                          'text-of-13 font-of-semibold truncate',
                          active ? 'text-of-accent' : 'text-of-text',
                        ].join(' ')}
                      >
                        {result.label}
                      </span>
                      <span className="text-of-12 text-of-text-muted truncate">
                        {result.kind} · {result.detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-of-border bg-of-surface text-of-12 text-of-text-muted">
          <span>
            {totalCount != null && totalCount > 0
              ? `${results.length} of ${totalCount}`
              : `${results.length} result${results.length === 1 ? '' : 's'}`}
          </span>
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <PaletteKey>↑</PaletteKey>
              <PaletteKey>↓</PaletteKey>
              navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <PaletteKey>↵</PaletteKey>
              select
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function PaletteKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={[
        'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1',
        'rounded-of-sm border border-of-border bg-of-surface-raised',
        'text-of-12 text-of-text-muted',
      ].join(' ')}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </kbd>
  );
}
