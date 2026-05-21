import { useMemo, useState } from 'react';
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

function categoryCount(category: CategoryId) {
  if (category === 'all' || category === 'platform') return APPS.length;
  return APPS.filter((app) => app.category === category).length;
}

export function ApplicationsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryId>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return APPS.filter((app) => {
      if (category !== 'all' && category !== 'platform' && app.category !== category) return false;
      if (!q) return true;
      return app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q);
    });
  }, [search, category]);

  const topLevel = CATEGORIES.filter((cat) => !cat.parent);
  const platformChildren = CATEGORIES.filter((cat) => cat.parent === 'platform');

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
            padding: '24px 32px',
            overflowY: 'auto',
            background: 'var(--bg-app-portal)',
          }}
        >
          {filtered.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No apps match the current filters.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              }}
            >
              {filtered.map((app) => (
                <Link
                  key={app.id}
                  to={app.to}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 6,
                    background: 'var(--bg-panel-muted)',
                    color: 'var(--text-default)',
                    textDecoration: 'none',
                    border: '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor =
                      'var(--border-default)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'transparent';
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 36,
                      height: 36,
                      background: '#F4E5D1',
                      color: '#B66B1E',
                      borderRadius: 6,
                      flex: '0 0 auto',
                    }}
                  >
                    <Glyph name={app.icon} size={18} tone="#B66B1E" />
                  </span>
                  <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
                      {app.name}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {app.description}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
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
