import type { Ref, ReactNode } from 'react';

import { Glyph, type GlyphName } from '@components/ui/Glyph';

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

/* ------------------------------------------------------------------------- */
/* Sidebar                                                                    */
/* ------------------------------------------------------------------------- */

export type OntologySidebarItemId =
  | 'discover'
  | 'proposals'
  | 'history'
  | 'object-types'
  | 'properties'
  | 'shared-properties'
  | 'link-types'
  | 'action-types'
  | 'groups'
  | 'interfaces'
  | 'value-types'
  | 'functions'
  | 'health'
  | 'cleanup'
  | 'configuration';

interface SidebarItemDef {
  id: OntologySidebarItemId;
  label: string;
  glyph: GlyphName;
  /** Renders the count slot when true (resources block). */
  showCount?: boolean;
  /** Optional dot indicator (e.g. health warnings pending). */
  pending?: boolean;
}

const MAIN_ITEMS: SidebarItemDef[] = [
  { id: 'discover', label: 'Discover', glyph: 'ontology' },
  { id: 'proposals', label: 'Proposals', glyph: 'users' },
  { id: 'history', label: 'History', glyph: 'history' },
];

const RESOURCE_ITEMS: SidebarItemDef[] = [
  { id: 'object-types', label: 'Object types', glyph: 'cube', showCount: true },
  { id: 'properties', label: 'Properties', glyph: 'list', showCount: true },
  { id: 'shared-properties', label: 'Shared Properties', glyph: 'ontology', showCount: true },
  { id: 'link-types', label: 'Link types', glyph: 'link', showCount: true },
  { id: 'action-types', label: 'Action types', glyph: 'run', showCount: true },
  { id: 'groups', label: 'Groups', glyph: 'view-grid', showCount: true },
  { id: 'interfaces', label: 'Interfaces', glyph: 'artifact', showCount: true },
  { id: 'value-types', label: 'Value types', glyph: 'tag', showCount: true },
  { id: 'functions', label: 'Functions', glyph: 'code', showCount: true },
];

const HEALTH_ITEMS: SidebarItemDef[] = [
  { id: 'health', label: 'Health issues', glyph: 'shield-plus' },
  { id: 'cleanup', label: 'Cleanup', glyph: 'sparkles' },
];

const FOOTER_ITEM: SidebarItemDef = {
  id: 'configuration',
  label: 'Ontology configuration',
  glyph: 'settings',
};

interface OntologyShellSidebarProps {
  active: OntologySidebarItemId;
  onSelect: (id: OntologySidebarItemId) => void;
  counts?: Partial<Record<OntologySidebarItemId, number>>;
  /** Rendered above the navigation, typically the OntologySelector. */
  header?: ReactNode;
  className?: string;
}

/**
 * Foundry-style left rail: 240px, white background, right border. Sticky
 * directly beneath the {@link OntologyShellTopBar}, scrolls internally when
 * the nav exceeds the viewport.
 *
 *  Main      Discover · Proposals · History
 *  RESOURCES Object types · Properties · …  (with counts on the right)
 *  ─────
 *  Health    Health issues · Cleanup
 *  ─────  (footer)
 *  ⚙        Ontology configuration
 */
export function OntologyShellSidebar({
  active,
  onSelect,
  counts,
  header,
  className,
}: OntologyShellSidebarProps) {
  const classes = [
    'sticky top-12 self-start shrink-0 w-60 flex flex-col',
    'h-[calc(100vh-3rem)] bg-of-surface-raised border-r border-of-border',
  ];
  if (className) classes.push(className);

  return (
    <aside className={classes.join(' ')} aria-label="Ontology navigation">
      {header ? <div className="px-2.5 pt-2.5">{header}</div> : null}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 flex flex-col gap-px">
        {MAIN_ITEMS.map((item) => (
          <SidebarItem
            key={item.id}
            def={item}
            active={item.id === active}
            onClick={() => onSelect(item.id)}
          />
        ))}

        <div className="mt-3 mb-1 px-2.5 text-[10px] font-of-semibold text-of-text-soft uppercase tracking-wider">
          Resources
        </div>
        {RESOURCE_ITEMS.map((item) => (
          <SidebarItem
            key={item.id}
            def={item}
            active={item.id === active}
            count={counts?.[item.id]}
            onClick={() => onSelect(item.id)}
          />
        ))}

        <div className="my-2 mx-2 border-t border-of-border" />
        {HEALTH_ITEMS.map((item) => (
          <SidebarItem
            key={item.id}
            def={item}
            active={item.id === active}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </nav>
      <div className="border-t border-of-border p-1.5">
        <SidebarItem
          def={FOOTER_ITEM}
          active={FOOTER_ITEM.id === active}
          onClick={() => onSelect(FOOTER_ITEM.id)}
        />
      </div>
    </aside>
  );
}

interface SidebarItemProps {
  def: SidebarItemDef;
  active: boolean;
  count?: number;
  onClick: () => void;
}

function SidebarItem({ def, active, count, onClick }: SidebarItemProps) {
  const classes = [
    'group flex items-center gap-2 w-full px-2 h-8 rounded-of-sm',
    'text-of-13 text-left transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-of-accent-soft',
  ];
  if (active) {
    classes.push('bg-of-accent-soft text-of-accent font-of-semibold');
  } else {
    classes.push('text-of-text hover:bg-of-surface-muted font-of-medium');
  }
  const iconTone = active ? 'var(--of-accent)' : 'var(--of-text-muted)';

  return (
    <button
      type="button"
      onClick={onClick}
      className={classes.join(' ')}
      aria-current={active ? 'page' : undefined}
    >
      <span className="shrink-0 inline-flex w-4 h-4 items-center justify-center">
        <Glyph name={def.glyph} size={14} tone={iconTone} />
      </span>
      <span className="flex-1 truncate">{def.label}</span>
      {def.showCount && count != null ? (
        <span
          className={`text-of-12 tabular-nums ${
            active ? 'text-of-accent' : 'text-of-text-muted'
          }`}
        >
          {formatCount(count)}
        </span>
      ) : null}
      {def.pending ? (
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ background: '#f59e0b' }}
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function formatCount(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
