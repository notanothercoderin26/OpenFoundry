import type { Ref, ReactNode } from 'react';

import { Glyph } from '@components/ui/Glyph';

interface OntologyShellSearchProps {
  value: string;
  onChange: (next: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  hotkey?: string;
  ariaLabel?: string;
}

interface OntologyShellTopBarProps {
  title?: string;
  search: OntologyShellSearchProps;
  /** Buttons rendered before the branch selector (e.g. unsaved edits, bind dataset). */
  leadingActions?: ReactNode;
  /** The branch selector — caller owns the popover + state. */
  branchSlot?: ReactNode;
  /** The "New" dropdown — caller owns the popover + state. */
  newSlot?: ReactNode;
  className?: string;
}

/**
 * Foundry-style top bar for the Ontology Manager.
 *
 *  ┌────────────────────────────────────────────────────────────────────┐
 *  │ ▣ Ontology Management   [🔍 Search by name, RID, aliases… ⌘K]      │
 *  │                                       … leading │ Main ▾ │ New ▾  │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 * Height: 48px, white background, 1px bottom border in `--of-border`.
 * Sticky at the top of the viewport. Branch and "New" dropdowns are
 * passed in as slots so the page keeps its existing popover state.
 */
export function OntologyShellTopBar({
  title = 'Ontology Management',
  search,
  leadingActions,
  branchSlot,
  newSlot,
  className,
}: OntologyShellTopBarProps) {
  const classes = [
    'sticky top-0 z-30 flex items-center gap-3 h-12 px-3',
    'bg-of-surface-raised border-b border-of-border',
  ];
  if (className) classes.push(className);

  return (
    <header className={classes.join(' ')}>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm"
          style={{ background: 'var(--of-accent)', color: '#fff' }}
          aria-hidden
        >
          <Glyph name="cube" size={16} tone="#fff" />
        </span>
        <h1 className="text-of-14 font-of-semibold text-of-text whitespace-nowrap">{title}</h1>
      </div>

      <OntologyShellSearch {...search} />

      <div className="flex items-center gap-2 shrink-0">
        {leadingActions}
        {branchSlot}
        {newSlot}
      </div>
    </header>
  );
}

function OntologyShellSearch({
  value,
  onChange,
  inputRef,
  placeholder = 'Search by name, RID, aliases…',
  hotkey = '⌘K',
  ariaLabel = 'Search ontology resources',
}: OntologyShellSearchProps) {
  return (
    <div
      className={[
        'flex items-center gap-2 flex-1 max-w-[720px] mx-auto h-8 px-2.5',
        'bg-of-surface border border-of-border rounded-of-sm',
        'focus-within:border-of-accent focus-within:bg-of-surface-raised',
        'focus-within:ring-2 focus-within:ring-of-accent-soft',
      ].join(' ')}
    >
      <Glyph name="search" size={14} tone="var(--of-text-muted)" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={[
          'flex-1 min-w-0 bg-transparent border-0 outline-none',
          'text-of-13 text-of-text placeholder:text-of-text-soft',
        ].join(' ')}
      />
      {hotkey ? (
        <kbd
          aria-hidden
          className={[
            'inline-flex items-center justify-center min-w-[28px] h-5 px-1.5',
            'rounded-of-sm border border-of-border bg-of-surface-raised',
            'text-of-12 font-of-medium text-of-text-muted',
          ].join(' ')}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {hotkey}
        </kbd>
      ) : null}
    </div>
  );
}
