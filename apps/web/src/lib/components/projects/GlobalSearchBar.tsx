import { forwardRef } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

interface GlobalSearchBarProps {
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
}

export const GlobalSearchBar = forwardRef<HTMLInputElement, GlobalSearchBarProps>(function GlobalSearchBar(
  { value, onChange, onClear },
  ref,
) {
  return (
    <div
      style={{
        padding: '10px 22px 12px',
        background: '#fff',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#5f6b7a',
            display: 'inline-flex',
          }}
        >
          <Glyph name="search" size={14} />
        </span>
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search all portfolios, projects, folders and files..."
          aria-label="Search Compass"
          style={{
            width: '100%',
            padding: '7px 32px 7px 32px',
            fontSize: 13,
            border: '1px solid var(--border-default)',
            borderRadius: 16,
            background: '#fff',
            color: 'var(--text-strong)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              border: 0,
              background: 'transparent',
              padding: 4,
              cursor: 'pointer',
              color: '#5f6b7a',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Glyph name="x" size={12} />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--of-foundry-text-muted)',
              background: 'var(--of-foundry-surface)',
              border: '1px solid var(--of-foundry-border)',
              borderRadius: 3,
              padding: '1px 5px',
              lineHeight: 1.3,
              pointerEvents: 'none',
            }}
          >
            ⌘K
          </kbd>
        )}
      </div>
    </div>
  );
});
