import { useMemo, useState, type ReactNode } from 'react';

import { COMPASS_RESOURCE_TYPE_REGISTRY } from '@/lib/compass/resourceTypeRegistry';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

export interface CompassFilterState {
  types: string[];
  portfolios: string[];
  projects: string[];
  tags: string[];
  orgs: string[];
  promoted: boolean;
}

export interface PortfolioOption {
  id: string;
  name: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface TagOption {
  id: string;
  name: string;
  color?: string;
}

export interface OrgOption {
  id: string;
  name: string;
}

interface CompassFilterRailProps {
  filters: CompassFilterState;
  onChange: (next: CompassFilterState) => void;
  portfolios: PortfolioOption[];
  projects: ProjectOption[];
  tags: TagOption[];
  orgs: OrgOption[];
  onCreatePortfolio?: (name: string) => void | Promise<void>;
}

interface FacetCounts {
  [type: string]: number;
}

const TYPES_INITIAL_VISIBLE = 5;

export const EMPTY_FILTERS: CompassFilterState = {
  types: [],
  portfolios: [],
  projects: [],
  tags: [],
  orgs: [],
  promoted: false,
};

export function activeFilterCount(filters: CompassFilterState): number {
  return (
    filters.types.length +
    filters.portfolios.length +
    filters.projects.length +
    filters.tags.length +
    filters.orgs.length +
    (filters.promoted ? 1 : 0)
  );
}

export function CompassFilterRail({
  filters,
  onChange,
  portfolios,
  projects,
  tags,
  orgs,
  onCreatePortfolio,
}: CompassFilterRailProps) {
  const count = activeFilterCount(filters);

  function toggleArray(key: keyof CompassFilterState, value: string) {
    if (key === 'promoted') return;
    const current = filters[key] as string[];
    const exists = current.includes(value);
    const next = exists ? current.filter((entry) => entry !== value) : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  function clearAll() {
    onChange(EMPTY_FILTERS);
  }

  return (
    <aside
      aria-label="Compass filters"
      style={{
        background: '#fff',
        borderRight: '1px solid var(--border-subtle)',
        minHeight: 480,
        padding: '8px 0',
        fontSize: 12,
        color: 'var(--text-strong)',
      }}
    >
      <FacetHeader>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Glyph name="filter" size={14} tone="#5f6b7a" />
          <span style={{ fontWeight: 600 }}>Filters</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600,
              background: count > 0 ? '#2D72D2' : '#e1e6ed',
              color: count > 0 ? '#fff' : '#5f6b7a',
            }}
          >
            {count}
          </span>
        </span>
        {count > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            style={{
              border: 0,
              background: 'transparent',
              color: '#2D72D2',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            Clear all
          </button>
        ) : null}
      </FacetHeader>

      <TypesFacet
        selected={filters.types}
        onToggle={(value) => toggleArray('types', value)}
      />

      <Disclosure title="Status" defaultOpen>
        <CheckboxRow
          checked={filters.promoted}
          onChange={() => onChange({ ...filters, promoted: !filters.promoted })}
          icon={<PurpleCheckIcon />}
          label="Promoted items"
        />
      </Disclosure>

      <Disclosure title="Portfolios" defaultOpen>
        <SearchInput placeholder="Search portfolios..." />
        {portfolios.length === 0 ? (
          <EmptyHint>No portfolios yet</EmptyHint>
        ) : (
          portfolios.map((portfolio) => (
            <CheckboxRow
              key={portfolio.id}
              checked={filters.portfolios.includes(portfolio.id)}
              onChange={() => toggleArray('portfolios', portfolio.id)}
              icon={<Glyph name="folder" size={14} tone="#5f6b7a" />}
              label={portfolio.name}
            />
          ))
        )}
        {onCreatePortfolio ? (
          <InlineCreate
            placeholder="New portfolio name"
            buttonLabel="Add"
            onCreate={(name) => onCreatePortfolio(name)}
          />
        ) : null}
      </Disclosure>

      <Disclosure title="Projects" defaultOpen={false}>
        <SearchInput placeholder="Search projects..." />
        {projects.length === 0 ? (
          <EmptyHint>No projects available</EmptyHint>
        ) : (
          projects.slice(0, 10).map((project) => (
            <CheckboxRow
              key={project.id}
              checked={filters.projects.includes(project.id)}
              onChange={() => toggleArray('projects', project.id)}
              icon={<Glyph name="project" size={14} tone="#5f6b7a" />}
              label={project.name}
            />
          ))
        )}
      </Disclosure>

      <Disclosure title="Tags" defaultOpen={false}>
        <TagsMultiSelect
          available={tags}
          selected={filters.tags}
          onChange={(next) => onChange({ ...filters, tags: next })}
        />
      </Disclosure>

      <Disclosure title="Organizations" defaultOpen={false}>
        {orgs.length === 0 ? (
          <EmptyHint>No organizations</EmptyHint>
        ) : (
          orgs.map((org) => (
            <CheckboxRow
              key={org.id}
              checked={filters.orgs.includes(org.id)}
              onChange={() => toggleArray('orgs', org.id)}
              label={org.name}
            />
          ))
        )}
      </Disclosure>
    </aside>
  );
}

function FacetHeader({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  );
}

function Disclosure({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--text-strong)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>{title}</span>
        <Glyph name={open ? 'chevron-up' : 'chevron-down'} size={12} tone="#5f6b7a" />
      </button>
      {open ? <div style={{ padding: '2px 10px 8px' }}>{children}</div> : null}
    </section>
  );
}

function SearchInput({ placeholder }: { placeholder: string }) {
  return (
    <div style={{ position: 'relative', margin: '4px 4px 8px' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#a1a8b3',
          display: 'inline-flex',
        }}
      >
        <Glyph name="search" size={12} />
      </span>
      <input
        type="search"
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '5px 8px 5px 24px',
          fontSize: 11,
          border: '1px solid var(--border-default)',
          borderRadius: 3,
          background: '#fff',
          color: 'var(--text-strong)',
          outline: 'none',
        }}
      />
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  icon,
  label,
  count,
}: {
  checked: boolean;
  onChange: () => void;
  icon?: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 4px',
        cursor: 'pointer',
        borderRadius: 3,
        fontSize: 12,
        color: 'var(--text-strong)',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ margin: 0, cursor: 'pointer' }}
      />
      {icon ? <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span> : null}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {count !== undefined ? (
        <span style={{ color: '#5f6b7a', fontSize: 11 }}>{count}</span>
      ) : null}
    </label>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: '4px 4px', fontSize: 11, color: '#a1a8b3' }}>{children}</p>
  );
}

function InlineCreate({
  placeholder,
  buttonLabel,
  onCreate,
}: {
  placeholder: string;
  buttonLabel: string;
  onCreate: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      setName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 6, padding: '0 4px' }}>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        disabled={busy}
        style={{
          flex: 1,
          padding: '4px 6px',
          fontSize: 11,
          border: '1px solid var(--border-default)',
          borderRadius: 3,
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !name.trim()}
        className="of-button"
        style={{ padding: '2px 8px', fontSize: 11 }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function PurpleCheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#7c5dd6" />
      <path
        d="M8 12.5l2.5 2.5L16 9.5"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TypesFacet({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const allTypes = useMemo(
    () =>
      COMPASS_RESOURCE_TYPE_REGISTRY.map((entry) => ({
        type: entry.type,
        label: entry.displayName,
        icon: entry.defaultIcon,
      })),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTypes;
    return allTypes.filter((entry) => entry.label.toLowerCase().includes(q));
  }, [allTypes, query]);

  const counts = useMemo<FacetCounts>(() => ({}), []);
  const visible = showAll ? filtered : filtered.slice(0, TYPES_INITIAL_VISIBLE);
  const hiddenCount = filtered.length - visible.length;

  return (
    <Disclosure title="Types" defaultOpen>
      <div style={{ position: 'relative', margin: '4px 4px 8px' }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#a1a8b3',
            display: 'inline-flex',
          }}
        >
          <Glyph name="search" size={12} />
        </span>
        <input
          type="search"
          placeholder="Search types..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{
            width: '100%',
            padding: '5px 8px 5px 24px',
            fontSize: 11,
            border: '1px solid var(--border-default)',
            borderRadius: 3,
            background: '#fff',
            color: 'var(--text-strong)',
            outline: 'none',
          }}
        />
      </div>
      {visible.map((entry) => (
        <CheckboxRow
          key={entry.type}
          checked={selected.includes(entry.type)}
          onChange={() => onToggle(entry.type)}
          icon={<Glyph name={entry.icon as GlyphName} size={14} tone="#5f6b7a" />}
          label={entry.label}
          count={counts[entry.type]}
        />
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            display: 'block',
            marginTop: 4,
            padding: '2px 4px',
            border: 0,
            background: 'transparent',
            color: '#2D72D2',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          View all ({filtered.length})
        </button>
      ) : null}
      {showAll && filtered.length > TYPES_INITIAL_VISIBLE ? (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          style={{
            display: 'block',
            marginTop: 4,
            padding: '2px 4px',
            border: 0,
            background: 'transparent',
            color: '#2D72D2',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          Show fewer
        </button>
      ) : null}
    </Disclosure>
  );
}

function TagsMultiSelect({
  available,
  selected,
  onChange,
}: {
  available: TagOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const remaining = available.filter((tag) => !selected.includes(tag.id));

  function remove(id: string) {
    onChange(selected.filter((entry) => entry !== id));
  }

  function add(id: string) {
    onChange([...selected, id]);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative', margin: '4px 4px 4px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          minHeight: 26,
          padding: '3px 6px',
          border: '1px solid var(--border-default)',
          borderRadius: 3,
          background: '#fff',
          cursor: available.length > 0 ? 'pointer' : 'not-allowed',
        }}
        onClick={() => available.length > 0 && setOpen((value) => !value)}
      >
        {selected.length === 0 ? (
          <span style={{ color: '#a1a8b3', fontSize: 11 }}>
            {available.length === 0 ? 'No tags yet' : 'Select tags...'}
          </span>
        ) : (
          selected.map((id) => {
            const tag = available.find((entry) => entry.id === id);
            const label = tag?.name ?? id;
            const color = tag?.color ?? '#5f6b7a';
            return (
              <span
                key={id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '1px 4px 1px 6px',
                  borderRadius: 8,
                  background: `${color}1a`,
                  color,
                  fontSize: 10,
                  fontWeight: 500,
                }}
              >
                {label}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(id);
                  }}
                  aria-label={`Remove ${label}`}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <Glyph name="x" size={10} />
                </button>
              </span>
            );
          })
        )}
      </div>
      {open && remaining.length > 0 ? (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 20,
            background: '#fff',
            border: '1px solid var(--border-default)',
            borderRadius: 3,
            boxShadow: 'var(--shadow-popover)',
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {remaining.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => add(tag.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '5px 8px',
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 11,
                color: 'var(--text-strong)',
              }}
            >
              {tag.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
