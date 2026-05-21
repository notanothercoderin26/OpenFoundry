import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

type SubcategoryId =
  | 'administration'
  | 'analyze-data'
  | 'build-monitor-pipelines'
  | 'data-governance'
  | 'manage-deploy-models'
  | 'operational-applications'
  | 'support';

type CategoryId = 'all' | 'platform' | SubcategoryId;

interface CategoryDef {
  id: CategoryId;
  label: string;
  parent?: 'platform';
}

interface AppEntry {
  id: string;
  name: string;
  description: string;
  to: string;
  icon: GlyphName;
  category: SubcategoryId;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'all', label: 'All apps' },
  { id: 'platform', label: 'Platform apps' },
  { id: 'administration', label: 'Administration', parent: 'platform' },
  { id: 'analyze-data', label: 'Analyze Data', parent: 'platform' },
  { id: 'build-monitor-pipelines', label: 'Build & monitor pipelines', parent: 'platform' },
  { id: 'data-governance', label: 'Data Governance', parent: 'platform' },
  { id: 'manage-deploy-models', label: 'Manage & deploy models', parent: 'platform' },
  { id: 'operational-applications', label: 'Operational applications', parent: 'platform' },
  { id: 'support', label: 'Support', parent: 'platform' },
];

const APPS: AppEntry[] = [
  { id: 'object-explorer', name: 'Object explorer', description: 'Search and inspect ontology objects.', to: '/object-explorer', icon: 'search', category: 'analyze-data' },
  { id: 'contour', name: 'Contour', description: 'Point-and-click data analysis on datasets and ontology.', to: '/contour', icon: 'graph', category: 'analyze-data' },
  { id: 'quiver', name: 'Quiver', description: 'Pivot, chart, and slice data in a spreadsheet.', to: '/quiver', icon: 'graph', category: 'analyze-data' },
  { id: 'notepad', name: 'Notepad', description: 'Author rich documents with embedded data.', to: '/notepad', icon: 'document', category: 'analyze-data' },
  { id: 'workshop', name: 'Workshop', description: 'Build operational apps backed by your ontology and datasets.', to: '/apps', icon: 'object', category: 'operational-applications' },
  { id: 'pipeline-builder', name: 'Pipeline builder', description: 'Compose dataset transformation pipelines.', to: '/pipelines', icon: 'run', category: 'build-monitor-pipelines' },
  { id: 'code-repos', name: 'Code repositories', description: 'Version-controlled code repositories for transforms and SDKs.', to: '/code-repos', icon: 'code', category: 'operational-applications' },
  { id: 'ontology-manager', name: 'Ontology manager', description: 'Manage object types, links, properties, and shared types.', to: '/ontology-manager', icon: 'ontology', category: 'data-governance' },
  { id: 'object-link-types', name: 'Object & link types', description: 'Define object and link types.', to: '/object-link-types', icon: 'link', category: 'data-governance' },
  { id: 'interfaces', name: 'Interfaces', description: 'Cross-type capability interfaces.', to: '/interfaces', icon: 'artifact', category: 'data-governance' },
  { id: 'compute-modules', name: 'Compute Modules', description: 'Run containerized workloads queryable from apps and pipelines.', to: '/compute-modules', icon: 'code', category: 'manage-deploy-models' },
  { id: 'foundry-rules', name: 'Foundry Rules', description: 'Continuous monitors over your ontology and datasets.', to: '/foundry-rules', icon: 'settings', category: 'administration' },
  { id: 'data-connection', name: 'Data Connection', description: 'Connect to external sources and stream data in.', to: '/data-connection', icon: 'database', category: 'build-monitor-pipelines' },
  { id: 'streaming', name: 'Streaming', description: 'Operate streaming pipelines and inspect live data.', to: '/streaming', icon: 'run', category: 'build-monitor-pipelines' },
  { id: 'builds', name: 'Builds', description: 'Inspect dataset builds and downstream impact.', to: '/builds', icon: 'history', category: 'build-monitor-pipelines' },
  { id: 'build-schedules', name: 'Build schedules', description: 'Schedule and operate dataset builds.', to: '/build-schedules', icon: 'history', category: 'build-monitor-pipelines' },
  { id: 'lineage', name: 'Lineage', description: 'Trace dataset and ontology dependencies.', to: '/lineage', icon: 'graph', category: 'data-governance' },
  { id: 'developers', name: 'Developers', description: 'Developer console, API keys, and SDK references.', to: '/developers', icon: 'code', category: 'operational-applications' },
  { id: 'control-panel', name: 'Control panel', description: 'Tenant-wide controls, governance, and quotas.', to: '/control-panel', icon: 'settings', category: 'administration' },
  { id: 'settings', name: 'Workspace settings', description: 'Settings for users, roles, policies, MFA, SSO.', to: '/settings', icon: 'settings', category: 'administration' },
];

const SUBCATEGORY_ORDER: SubcategoryId[] = [
  'administration',
  'analyze-data',
  'build-monitor-pipelines',
  'data-governance',
  'manage-deploy-models',
  'operational-applications',
  'support',
];

const SUBCATEGORY_LABEL: Record<SubcategoryId, string> = {
  administration: 'Administration',
  'analyze-data': 'Analyze Data',
  'build-monitor-pipelines': 'Build & monitor pipelines',
  'data-governance': 'Data Governance',
  'manage-deploy-models': 'Manage & deploy models',
  'operational-applications': 'Operational applications',
  support: 'Support',
};

interface TileColor {
  bg: string;
  fg: string;
}

const CATEGORY_TILE: Record<SubcategoryId, TileColor> = {
  administration: { bg: '#E5E9EE', fg: '#5F6B7A' },
  'analyze-data': { bg: '#D6EBF2', fg: '#0E7490' },
  'build-monitor-pipelines': { bg: '#F4E5D1', fg: '#B66B1E' },
  'data-governance': { bg: '#E5DDEF', fg: '#6B47A0' },
  'manage-deploy-models': { bg: '#DCEFE0', fg: '#157347' },
  'operational-applications': { bg: '#DDE9F8', fg: '#1F5EA8' },
  support: { bg: '#F8D9D9', fg: '#B42318' },
};

const FAVORITES_STORAGE_KEY = 'of:applications-portal:favorites';

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((id) => typeof id === 'string'));
  } catch {
    /* ignore corrupt storage */
  }
  return new Set();
}

function persistFavorites(favs: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favs)));
  } catch {
    /* ignore quota errors */
  }
}

function categoryCount(category: CategoryId) {
  if (category === 'all' || category === 'platform') return APPS.length;
  return APPS.filter((app) => app.category === category).length;
}

export function ApplicationsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryId>('all');

  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistFavorites(next);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return APPS.filter((app) => {
      if (category !== 'all' && category !== 'platform' && app.category !== category) return false;
      if (!q) return true;
      return app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q);
    });
  }, [search, category]);

  const groupedSections = useMemo(() => {
    const byCategory = new Map<SubcategoryId, AppEntry[]>();
    for (const app of filtered) {
      const bucket = byCategory.get(app.category) ?? [];
      bucket.push(app);
      byCategory.set(app.category, bucket);
    }
    return SUBCATEGORY_ORDER.map((id) => ({
      id,
      label: SUBCATEGORY_LABEL[id],
      apps: byCategory.get(id) ?? [],
    })).filter((section) => section.apps.length > 0);
  }, [filtered]);

  const topLevel = CATEGORIES.filter((cat) => !cat.parent);
  const platformChildren = CATEGORIES.filter((cat) => cat.parent === 'platform');

  const pageTitle = category === 'all' ? 'All apps' : 'Platform apps';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        background: 'var(--bg-app-portal)',
        color: 'var(--text-default)',
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-app-portal)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 960,
          }}
        >
          <Glyph name="search" size={18} tone="var(--text-muted)" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Data connection"
            aria-label="Search applications"
            style={{
              flex: 1,
              background: 'transparent',
              border: 0,
              outline: 'none',
              color: 'var(--text-strong)',
              fontSize: 15,
              padding: '4px 0',
            }}
            autoFocus
          />
        </div>
      </header>

      <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
        <aside
          aria-label="Application categories"
          style={{
            width: 240,
            flex: '0 0 240px',
            background: 'var(--bg-panel-muted)',
            borderRight: '1px solid var(--border-subtle)',
            padding: '12px 8px',
            overflowY: 'auto',
          }}
        >
          {topLevel.map((cat) => (
            <CategoryButton
              key={cat.id}
              cat={cat}
              active={category === cat.id}
              count={categoryCount(cat.id)}
              onClick={() => setCategory(cat.id)}
            />
          ))}

          <div
            style={{
              marginLeft: 16,
              paddingLeft: 8,
              borderLeft: '1px solid var(--border-default)',
              marginTop: 2,
            }}
          >
            {platformChildren.map((cat) => (
              <CategoryButton
                key={cat.id}
                cat={cat}
                active={category === cat.id}
                count={categoryCount(cat.id)}
                onClick={() => setCategory(cat.id)}
              />
            ))}
          </div>
        </aside>

        <section
          role="region"
          aria-label="Application catalog"
          style={{
            flex: 1,
            padding: '28px 32px 32px',
            overflowY: 'auto',
            background: 'var(--bg-app-portal)',
          }}
        >
          <h1
            style={{
              margin: '0 0 24px',
              fontSize: 26,
              fontWeight: 600,
              color: 'var(--text-strong)',
              lineHeight: 1.2,
            }}
          >
            {pageTitle}
          </h1>

          {groupedSections.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No apps match the current filters.
            </p>
          ) : (
            groupedSections.map((section) => (
              <div key={section.id} style={{ marginBottom: 28 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {section.label}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 20,
                      height: 18,
                      padding: '0 6px',
                      borderRadius: 9,
                      background: 'var(--bg-chip)',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {section.apps.length}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                  }}
                >
                  {section.apps.map((app) => (
                    <AppCard
                      key={app.id}
                      app={app}
                      favorite={favorites.has(app.id)}
                      onToggleFavorite={() => toggleFavorite(app.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

interface CategoryButtonProps {
  cat: CategoryDef;
  active: boolean;
  count: number;
  onClick: () => void;
}

function CategoryButton({ cat, active, count, onClick }: CategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 10px',
        margin: '1px 0',
        border: 0,
        background: active ? 'var(--bg-default)' : 'transparent',
        color: active ? 'var(--text-link)' : 'var(--text-default)',
        fontWeight: active ? 600 : 500,
        fontSize: 13,
        borderRadius: 4,
        cursor: 'pointer',
        textAlign: 'left',
        gap: 8,
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {cat.label}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 22,
          height: 18,
          padding: '0 6px',
          borderRadius: 9,
          background: 'var(--bg-chip)',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}
      </span>
    </button>
  );
}

interface AppCardProps {
  app: AppEntry;
  favorite: boolean;
  onToggleFavorite: () => void;
}

function AppCard({ app, favorite, onToggleFavorite }: AppCardProps) {
  const tile = CATEGORY_TILE[app.category];

  return (
    <div style={{ position: 'relative' }}>
      <Link
        to={app.to}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          padding: 16,
          paddingRight: 48,
          borderRadius: 6,
          background: 'var(--bg-panel-muted)',
          color: 'var(--text-default)',
          textDecoration: 'none',
          border: 'none',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = '#eef2f6';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-panel-muted)';
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            background: tile.bg,
            color: tile.fg,
            borderRadius: 6,
            flex: '0 0 auto',
          }}
        >
          <Glyph name={app.icon} size={22} tone={tile.fg} />
        </span>
        <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
            {app.name}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {app.description}
          </span>
        </span>
      </Link>

      <button
        type="button"
        aria-label={favorite ? `Unfavorite ${app.name}` : `Favorite ${app.name}`}
        aria-pressed={favorite}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite();
        }}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          border: 'none',
          background: 'transparent',
          color: favorite ? '#D9923A' : 'var(--text-soft)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(15, 23, 42, 0.05)';
          if (!favorite)
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-default)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          if (!favorite) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-soft)';
        }}
      >
        <Glyph name={favorite ? 'star-filled' : 'star'} size={18} tone="currentColor" />
      </button>
    </div>
  );
}
