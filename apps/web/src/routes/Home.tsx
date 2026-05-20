import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { CreateProjectModal } from '@/lib/components/projects/CreateProjectModal';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import { listDatasets, type Dataset } from '@/lib/api/datasets';
import { listProjects, type OntologyProject } from '@/lib/api/ontology';
import {
  listRecents,
  listSharedWithMe,
  resolveResourceLabels,
  type RecentEntry,
  type ResourceKind,
  type ResourceShare,
} from '@/lib/api/workspace';
import { projectStablePath, workspaceResourceStablePath } from '@/lib/compass/stableResourceUrls';
import { useAuth } from '@/lib/stores/auth';

type SpaceTab = 'data-catalog' | 'portfolios' | 'projects' | 'your-files' | 'shared';
type SubTab = 'collections' | 'files';

interface SpaceDef {
  id: SpaceTab;
  label: string;
  icon: GlyphName | 'check-circle';
}

const SPACES: SpaceDef[] = [
  { id: 'data-catalog', label: 'Data Catalog', icon: 'check-circle' },
  { id: 'portfolios', label: 'Portfolios', icon: 'bookmark' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'your-files', label: 'Your files', icon: 'document' },
  { id: 'shared', label: 'Shared with you', icon: 'users' },
];

const NEW_ACTIONS: { label: string; to: string; description: string }[] = [
  { label: 'New collection', to: '/projects', description: 'Create a project to group resources.' },
  { label: 'New dataset', to: '/datasets', description: 'Register a dataset.' },
  { label: 'New pipeline', to: '/pipelines/new', description: 'Author a batch or streaming pipeline.' },
  { label: 'Upload data', to: '/datasets/upload', description: 'Upload files to a new dataset.' },
];

interface QuickStartTile {
  label: string;
  description: string;
  to?: string;
  action?: 'create-collection';
  glyph: GlyphName;
  tone: string;
}

const QUICK_START_TILES: QuickStartTile[] = [
  {
    label: 'Create a collection',
    description: 'Group related datasets, dashboards and notebooks under one project.',
    action: 'create-collection',
    glyph: 'project',
    tone: 'var(--status-info)',
  },
  {
    label: 'Upload a dataset',
    description: 'Bring CSV, Parquet or JSON files into the catalog in minutes.',
    to: '/datasets/upload',
    glyph: 'database',
    tone: 'var(--status-success, #2f855a)',
  },
  {
    label: 'Build a pipeline',
    description: 'Author a batch or streaming transformation between datasets.',
    to: '/pipelines/new',
    glyph: 'graph',
    tone: 'var(--accent-strong, #6b46c1)',
  },
  {
    label: 'Explore the ontology',
    description: 'Browse object types, links and the shared semantic model.',
    to: '/ontology',
    glyph: 'ontology',
    tone: 'var(--status-warning, #b45309)',
  },
];

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(user: { name?: string | null; email?: string | null } | null | undefined): string {
  if (!user) return 'there';
  const raw = (user.name ?? user.email ?? '').trim();
  if (!raw) return 'there';
  const first = raw.split(/[\s@.]+/)[0];
  if (!first) return raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

function recentKey(entry: Pick<RecentEntry, 'resource_kind' | 'resource_id'>) {
  return `${entry.resource_kind}:${entry.resource_id}`;
}

function resourceKindLabel(kind: ResourceKind | string): string {
  return String(kind).replace(/^ontology_/, '').replace(/_/g, ' ');
}

function glyphForResource(kind: ResourceKind | string): GlyphName {
  if (kind === 'ontology_project') return 'project';
  if (kind === 'ontology_folder') return 'folder';
  if (kind === 'dataset') return 'database';
  if (kind === 'pipeline') return 'graph';
  if (kind === 'notebook') return 'code';
  if (kind === 'app') return 'app';
  if (kind === 'dashboard') return 'spreadsheet';
  if (kind === 'report') return 'document';
  if (kind === 'model') return 'cube';
  if (kind === 'workflow') return 'run';
  return 'object';
}

const FALLBACK_OWNER_HINT = 'Demo collection';
const PAGE_SIZE = 50;

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function projectName(project: OntologyProject): string {
  return project.display_name || project.slug;
}

function spaceIcon(name: SpaceDef['icon'], color: string) {
  if (name === 'check-circle') {
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx={12} cy={12} r={9} fill={color} />
        <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return <Glyph name={name} size={18} tone={color} />;
}

export function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeSpace, setActiveSpace] = useState<SpaceTab>('data-catalog');
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('collections');
  const [search, setSearch] = useState('');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [projects, setProjects] = useState<OntologyProject[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [shared, setShared] = useState<ResourceShare[]>([]);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [recentLabels, setRecentLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      listProjects({ per_page: PAGE_SIZE }).then((res) => res.data),
      listDatasets({ per_page: PAGE_SIZE }).then((res) => res.data),
      listSharedWithMe({ limit: PAGE_SIZE }),
      listRecents({ limit: 8 }).catch(() => [] as RecentEntry[]),
    ])
      .then(async ([nextProjects, nextDatasets, nextShared, nextRecents]) => {
        if (cancelled) return;
        setProjects(nextProjects);
        setDatasets(nextDatasets);
        setShared(nextShared);
        setRecents(nextRecents);
        if (nextRecents.length > 0) {
          const resolved = await resolveResourceLabels(
            nextRecents.map((entry) => ({
              resource_kind: entry.resource_kind,
              resource_id: entry.resource_id,
            })),
          ).catch(() => null);
          if (cancelled) return;
          const map = new Map<string, string>();
          for (const entry of resolved?.data ?? []) {
            if (entry.label) map.set(recentKey(entry), entry.label);
          }
          setRecentLabels(map);
        } else {
          setRecentLabels(new Map());
        }
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Failed to load workspace');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [projectName(p), p.slug, p.description].some((value) => (value || '').toLowerCase().includes(q)),
    );
  }, [projects, search]);

  const filteredDatasets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return datasets;
    return datasets.filter((d) =>
      [d.name, d.id, d.description, ...(d.tags ?? [])].some((value) => (value || '').toLowerCase().includes(q)),
    );
  }, [datasets, search]);

  const yourFiles = useMemo(() => {
    if (!user) return [] as Dataset[];
    return datasets.filter((d) => d.owner_id === user.id);
  }, [datasets, user]);

  const showFiltersSidebar = activeSpace === 'data-catalog' && activeSubTab === 'files';
  const isEmptyWorkspace = !loading && projects.length === 0 && datasets.length === 0 && recents.length === 0;

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <HomeGreeting userName={firstName(user)} />

      {recents.length > 0 ? (
        <RecentStrip entries={recents} labels={recentLabels} />
      ) : null}

      {isEmptyWorkspace ? (
        <QuickStartTiles onCreateCollection={() => setCreateOpen(true)} />
      ) : null}

      {/* Top spaces strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-default)',
          paddingBottom: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {SPACES.map((space) => {
            const isActive = activeSpace === space.id;
            const color = isActive ? 'var(--status-info)' : 'var(--text-soft)';
            return (
              <button
                key={space.id}
                type="button"
                onClick={() => {
                  setActiveSpace(space.id);
                  if (space.id === 'data-catalog') setActiveSubTab('collections');
                }}
                className={`of-tab ${isActive ? 'of-tab-active' : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                {spaceIcon(space.icon, color)}
                <span>{space.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
          <Link to="/settings" className="of-button">
            Manage spaces
          </Link>
          <Link to="/settings" className="of-button of-button--ghost" aria-label="Settings">
            <Glyph name="settings" size={16} />
          </Link>
        </div>
      </div>

      {error ? (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      {activeSpace === 'data-catalog' ? (
        <DataCatalogView
          activeSubTab={activeSubTab}
          onSubTab={setActiveSubTab}
          projects={filteredProjects}
          datasets={filteredDatasets}
          loading={loading}
          search={search}
          onSearch={setSearch}
          onNewMenuOpen={newMenuOpen}
          setNewMenuOpen={setNewMenuOpen}
          onCreateProject={() => setCreateOpen(true)}
          showFiltersSidebar={showFiltersSidebar}
        />
      ) : null}

      {activeSpace === 'portfolios' ? (
        <EmptySpace
          title="Portfolios"
          description="Group collections into portfolios to give stakeholders a curated entry point. No portfolios have been created yet."
        />
      ) : null}

      {activeSpace === 'projects' ? (
        <ProjectsListView projects={filteredProjects} loading={loading} search={search} onSearch={setSearch} />
      ) : null}

      {activeSpace === 'your-files' ? (
        <FilesView
          datasets={yourFiles}
          loading={loading}
          search={search}
          onSearch={setSearch}
          emptyMessage={user ? 'You do not own any datasets yet.' : 'Sign in to see your files.'}
        />
      ) : null}

      {activeSpace === 'shared' ? (
        <SharedView shared={shared} loading={loading} />
      ) : null}

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(project) => {
          setCreateOpen(false);
          navigate(projectStablePath(project));
        }}
      />
    </section>
  );
}

interface DataCatalogViewProps {
  activeSubTab: SubTab;
  onSubTab: (tab: SubTab) => void;
  projects: OntologyProject[];
  datasets: Dataset[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onNewMenuOpen: boolean;
  setNewMenuOpen: (open: boolean) => void;
  onCreateProject: () => void;
  showFiltersSidebar: boolean;
}

function DataCatalogView({
  activeSubTab,
  onSubTab,
  projects,
  datasets,
  loading,
  search,
  onSearch,
  onNewMenuOpen,
  setNewMenuOpen,
  onCreateProject,
  showFiltersSidebar,
}: DataCatalogViewProps) {
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="of-heading-xl" style={{ marginTop: 0, marginBottom: 4 }}>
            Data Catalog
          </h1>
          <div className="of-tabbar" style={{ marginTop: 6, gap: 4, paddingBottom: 0, border: 0 }}>
            {(['collections', 'files'] as SubTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onSubTab(tab)}
                className={`of-tab ${activeSubTab === tab ? 'of-tab-active' : ''}`}
                style={{ fontSize: 13 }}
              >
                {tab === 'collections' ? 'Collections' : 'Files'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
          <button type="button" className="of-button">
            Request data
          </button>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="of-button of-button--success"
              onClick={() => setNewMenuOpen(!onNewMenuOpen)}
              aria-haspopup="menu"
              aria-expanded={onNewMenuOpen}
            >
              <Glyph name="plus" size={14} tone="#ffffff" /> New
              <span style={{ marginLeft: 4, opacity: 0.85 }}>▾</span>
            </button>
            {onNewMenuOpen ? (
              <div
                role="menu"
                className="of-popover"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  minWidth: 240,
                  padding: 4,
                  display: 'grid',
                  gap: 2,
                  zIndex: 20,
                }}
                onMouseLeave={() => setNewMenuOpen(false)}
              >
                {NEW_ACTIONS.map((action) =>
                  action.label === 'New collection' ? (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        onCreateProject();
                      }}
                      role="menuitem"
                      style={{
                        display: 'grid',
                        gap: 2,
                        padding: '8px 10px',
                        background: 'transparent',
                        border: 0,
                        textAlign: 'left',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ color: 'var(--text-strong)', fontWeight: 600, fontSize: 13 }}>{action.label}</span>
                      <span className="of-text-muted" style={{ fontSize: 11 }}>{action.description}</span>
                    </button>
                  ) : (
                    <Link
                      key={action.to}
                      to={action.to}
                      onClick={() => setNewMenuOpen(false)}
                      role="menuitem"
                      style={{
                        display: 'grid',
                        gap: 2,
                        padding: '8px 10px',
                        color: 'var(--text-default)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <span style={{ color: 'var(--text-strong)', fontWeight: 600, fontSize: 13 }}>{action.label}</span>
                      <span className="of-text-muted" style={{ fontSize: 11 }}>{action.description}</span>
                    </Link>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showFiltersSidebar ? 'minmax(180px, 220px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
          gap: 12,
          alignItems: 'start',
        }}
      >
        {showFiltersSidebar ? <FiltersSidebar /> : null}
        <section className="of-panel" style={{ overflow: 'hidden' }}>
          <div
            className="of-toolbar"
            style={{
              border: 0,
              borderBottom: '1px solid var(--border-subtle)',
              borderRadius: 0,
              justifyContent: 'flex-end',
              padding: '8px 12px',
            }}
          >
            <input
              className="of-input"
              placeholder={activeSubTab === 'collections' ? 'Search collections' : 'Search files'}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />
          </div>
          {activeSubTab === 'collections' ? (
            <CollectionsTable projects={projects} loading={loading} search={search} />
          ) : (
            <FilesTable datasets={datasets} loading={loading} search={search} />
          )}
        </section>
      </div>
    </>
  );
}

function FiltersSidebar() {
  return (
    <aside className="of-panel" style={{ padding: '12px 12px 8px', display: 'grid', gap: 8 }}>
      <p className="of-eyebrow" style={{ margin: 0 }}>Filters</p>
      <FilterGroup label="Tags" />
      <FilterGroup label="Type" />
    </aside>
  );
}

function FilterGroup({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '8px 0 4px' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: 0,
          background: 'transparent',
          border: 0,
          color: 'var(--text-strong)',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
        aria-expanded={open}
      >
        <span>{label}</span>
        <Glyph name="plus" size={14} />
      </button>
      {open ? (
        <p className="of-text-muted" style={{ marginTop: 6, fontSize: 11 }}>
          No options registered.
        </p>
      ) : null}
    </div>
  );
}

interface CollectionsTableProps {
  projects: OntologyProject[];
  loading: boolean;
  search: string;
}

function CollectionsTable({ projects, loading, search }: CollectionsTableProps) {
  return (
    <table className="of-table">
      <thead>
        <tr>
          <th style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Name
            <span style={{ color: 'var(--status-info)' }}>▲</span>
          </th>
          <th style={{ width: 140, textAlign: 'right' }}>Files</th>
        </tr>
      </thead>
      <tbody>
        {loading && projects.length === 0 ? (
          <tr>
            <td colSpan={2} style={{ padding: 24, textAlign: 'center' }}>
              <span className="of-text-muted">Loading collections…</span>
            </td>
          </tr>
        ) : projects.length === 0 ? (
          <tr>
            <td colSpan={2} style={{ padding: 24, textAlign: 'center' }}>
              <span className="of-text-muted">
                {search ? `No collections match “${search}”` : 'No collections yet.'}
              </span>
            </td>
          </tr>
        ) : (
          projects.map((project) => (
            <tr key={project.id}>
              <td>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ marginTop: 2 }}>
                    <Glyph name="bookmark" size={16} tone="var(--status-info)" />
                  </span>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <Link to={projectStablePath(project)} className="of-link" style={{ fontWeight: 600 }}>
                      {projectName(project)}
                    </Link>
                    <span className="of-text-muted" style={{ fontSize: 11 }}>
                      {project.description?.trim() || FALLBACK_OWNER_HINT}{' '}
                      <span className="of-text-soft" style={{ fontFamily: 'var(--font-mono)' }}>{project.slug}</span>
                    </span>
                  </div>
                </div>
              </td>
              <td style={{ textAlign: 'right' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Glyph name="folder" size={14} tone="var(--text-muted)" />
                  <span className="of-text-muted">-</span>
                </span>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

interface FilesTableProps {
  datasets: Dataset[];
  loading: boolean;
  search: string;
  emptyMessage?: string;
}

function FilesTable({ datasets, loading, search, emptyMessage }: FilesTableProps) {
  return (
    <table className="of-table">
      <thead>
        <tr>
          <th style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Name
            <span style={{ color: 'var(--status-info)' }}>▲</span>
          </th>
          <th style={{ width: 220 }}>Last updated</th>
          <th style={{ width: 240 }}>Tags</th>
        </tr>
      </thead>
      <tbody>
        {loading && datasets.length === 0 ? (
          <tr>
            <td colSpan={3} style={{ padding: 24, textAlign: 'center' }}>
              <span className="of-text-muted">Loading files…</span>
            </td>
          </tr>
        ) : datasets.length === 0 ? (
          <tr>
            <td colSpan={3} style={{ padding: 24, textAlign: 'center' }}>
              <span className="of-text-muted">
                {search ? `No files match “${search}”` : (emptyMessage ?? 'No datasets registered yet.')}
              </span>
            </td>
          </tr>
        ) : (
          datasets.map((dataset) => (
            <tr key={dataset.id}>
              <td>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ marginTop: 2 }}>
                    <Glyph name="spreadsheet" size={16} tone="var(--status-info)" />
                  </span>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <Link to={`/datasets/${dataset.id}`} className="of-link" style={{ fontWeight: 600 }}>
                      {dataset.name}
                    </Link>
                    <span className="of-text-soft" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      {dataset.storage_path || `/${dataset.id}`}
                    </span>
                  </div>
                </div>
              </td>
              <td className="of-text-muted">{formatDate(dataset.updated_at)}</td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(dataset.tags ?? []).slice(0, 3).map((tag) => (
                    <span key={tag} className="of-chip">{tag}</span>
                  ))}
                  {(dataset.tags?.length ?? 0) > 3 ? (
                    <span className="of-text-muted" style={{ fontSize: 11 }}>+{(dataset.tags?.length ?? 0) - 3}</span>
                  ) : null}
                  {(dataset.tags?.length ?? 0) === 0 ? <span className="of-text-soft" style={{ fontSize: 11 }}>—</span> : null}
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function ProjectsListView({
  projects,
  loading,
  search,
  onSearch,
}: {
  projects: OntologyProject[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <section className="of-panel" style={{ overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <h1 className="of-heading-xl" style={{ margin: 0 }}>Projects</h1>
        <input
          className="of-input"
          placeholder="Search projects"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
      </header>
      <CollectionsTable projects={projects} loading={loading} search={search} />
    </section>
  );
}

function FilesView({
  datasets,
  loading,
  search,
  onSearch,
  emptyMessage,
}: {
  datasets: Dataset[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  emptyMessage: string;
}) {
  return (
    <section className="of-panel" style={{ overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <h1 className="of-heading-xl" style={{ margin: 0 }}>Your files</h1>
        <input
          className="of-input"
          placeholder="Search files"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
      </header>
      <FilesTable datasets={datasets} loading={loading} search={search} emptyMessage={emptyMessage} />
    </section>
  );
}

function SharedView({ shared, loading }: { shared: ResourceShare[]; loading: boolean }) {
  return (
    <section className="of-panel" style={{ overflow: 'hidden' }}>
      <header style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className="of-heading-xl" style={{ margin: 0 }}>Shared with you</h1>
        <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
          Resources other users granted you access to.
        </p>
      </header>
      <table className="of-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th style={{ width: 120 }}>Access</th>
            <th style={{ width: 200 }}>Shared by</th>
            <th style={{ width: 200 }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {loading && shared.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: 24, textAlign: 'center' }}>
                <span className="of-text-muted">Loading shares…</span>
              </td>
            </tr>
          ) : shared.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: 24, textAlign: 'center' }}>
                <span className="of-text-muted">Nothing shared with you.</span>
              </td>
            </tr>
          ) : (
            shared.map((share) => {
              const href = share.resource_kind === 'ontology_project'
                ? workspaceResourceStablePath(share.resource_kind, share.resource_id)
                : share.resource_kind === 'dataset'
                  ? workspaceResourceStablePath(share.resource_kind, share.resource_id)
                  : null;
              const label = share.resource_id;
              return (
                <tr key={share.id}>
                  <td>
                    {href ? (
                      <Link to={href} className="of-link">{label}</Link>
                    ) : (
                      <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{label}</span>
                    )}
                    <div className="of-text-soft" style={{ marginTop: 2, fontSize: 10 }}>
                      {share.resource_kind.replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td><span className="of-chip">{share.access_level}</span></td>
                  <td className="of-text-muted">{share.sharer_id}</td>
                  <td className="of-text-muted">{formatDate(share.created_at)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}

function HomeGreeting({ userName }: { userName: string }) {
  const hello = useMemo(() => greeting(new Date()), []);
  return (
    <header style={{ display: 'grid', gap: 2 }}>
      <h1 className="of-heading-xl" style={{ margin: 0, fontSize: 22 }}>
        {hello}, {userName}
      </h1>
      <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
        Here&apos;s what&apos;s happening in your workspace.
      </p>
    </header>
  );
}

function RecentStrip({
  entries,
  labels,
}: {
  entries: RecentEntry[];
  labels: Map<string, string>;
}) {
  const visible = entries.slice(0, 6);
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2
          className="of-eyebrow"
          style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Glyph name="history" size={14} /> Recent
        </h2>
        <Link to="/recent" className="of-link" style={{ fontSize: 12 }}>
          View all
        </Link>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8,
        }}
      >
        {visible.map((entry) => {
          const key = recentKey(entry);
          const label = labels.get(key) ?? entry.resource_id;
          return (
            <Link
              key={key}
              to={workspaceResourceStablePath(entry.resource_kind, entry.resource_id, label)}
              className="of-panel"
              style={{
                display: 'grid',
                gap: 6,
                padding: '10px 12px',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Glyph name={glyphForResource(entry.resource_kind)} size={16} tone="var(--status-info)" />
                <span
                  style={{
                    color: 'var(--text-strong)',
                    fontWeight: 600,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={label}
                >
                  {label}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 11,
                }}
              >
                <span className="of-text-muted" style={{ textTransform: 'capitalize' }}>
                  {resourceKindLabel(entry.resource_kind)}
                </span>
                <span className="of-text-soft">{relativeTime(entry.last_accessed_at)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function QuickStartTiles({ onCreateCollection }: { onCreateCollection: () => void }) {
  return (
    <section
      className="of-panel"
      style={{ padding: '16px 16px 14px', display: 'grid', gap: 12 }}
    >
      <div style={{ display: 'grid', gap: 2 }}>
        <h2 className="of-heading-lg" style={{ margin: 0, fontSize: 16 }}>
          Get started
        </h2>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          Your workspace is empty. Pick a starting point to populate the catalog.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {QUICK_START_TILES.map((tile) => {
          const inner = (
            <>
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-subtle, rgba(0,0,0,0.04))',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Glyph name={tile.glyph} size={18} tone={tile.tone} />
              </span>
              <div style={{ display: 'grid', gap: 2 }}>
                <span style={{ color: 'var(--text-strong)', fontWeight: 600, fontSize: 13 }}>
                  {tile.label}
                </span>
                <span className="of-text-muted" style={{ fontSize: 11 }}>
                  {tile.description}
                </span>
              </div>
            </>
          );
          const tileStyle = {
            display: 'grid',
            gridTemplateColumns: '32px minmax(0, 1fr)',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px',
            background: 'var(--surface-default, transparent)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'left' as const,
            cursor: 'pointer',
            textDecoration: 'none',
            color: 'inherit',
            width: '100%',
          };
          if (tile.action === 'create-collection') {
            return (
              <button
                key={tile.label}
                type="button"
                onClick={onCreateCollection}
                style={tileStyle}
              >
                {inner}
              </button>
            );
          }
          return (
            <Link key={tile.label} to={tile.to ?? '#'} style={tileStyle}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function EmptySpace({ title, description }: { title: string; description: string }) {
  return (
    <section className="of-panel" style={{ padding: '32px 24px', textAlign: 'center' }}>
      <h2 className="of-heading-lg" style={{ margin: 0 }}>{title}</h2>
      <p className="of-text-muted" style={{ marginTop: 8, maxWidth: 480, marginInline: 'auto', fontSize: 13 }}>
        {description}
      </p>
    </section>
  );
}
