import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ConfirmDialog } from '@components/ConfirmDialog';
import {
  CompassFilterRail,
  type CompassFilterState,
  type PortfolioOption,
  type TagOption,
} from '@/lib/components/projects/CompassFilterRail';
import { CreateProjectModal } from '@/lib/components/projects/CreateProjectModal';
import { GlobalSearchBar } from '@/lib/components/projects/GlobalSearchBar';
import { QuickFilterCards, type QuickFilterKind } from '@/lib/components/projects/QuickFilterCards';
import { RequestDataDialog } from '@/lib/components/projects/RequestDataDialog';
import {
  createCompassNamespace,
  createCompassPortfolio,
  deleteProject,
  listCompassNamespaces,
  listCompassPortfolios,
  listPortfolioProjects,
  listProjects,
  promoteProject,
  unpromoteProject,
  type CompassNamespace,
  type CompassPortfolio,
  type OntologyProject,
} from '@/lib/api/ontology';
import { listSpaces, type NexusSpace } from '@/lib/api/nexus';
import {
  bulkListResourceTags,
  listCompassTags,
  listSharedWithMe,
  listTrash,
  purgeResource,
  restoreResource,
  searchCompass,
  type CompassSearchResult,
  type CompassTag,
  type ResourceShare,
  type TrashEntry,
} from '@/lib/api/workspace';
import { TagChips, TagPicker } from '@/lib/components/projects/TagPicker';
import { projectStablePath, workspaceResourceStablePath } from '@/lib/compass/stableResourceUrls';
import { useCurrentUser } from '@/lib/stores/auth';

type Section = 'portfolios' | 'projects' | 'your-files' | 'shared';

interface SectionEntry {
  id: Section;
  label: string;
  glyph: 'portfolios' | 'projects' | 'your-files' | 'shared';
}

const SECTIONS: SectionEntry[] = [
  { id: 'portfolios', label: 'Portfolios', glyph: 'portfolios' },
  { id: 'projects', label: 'Projects', glyph: 'projects' },
  { id: 'your-files', label: 'Your files', glyph: 'your-files' },
  { id: 'shared', label: 'Shared with you', glyph: 'shared' },
];

function projectName(project: OntologyProject) {
  return project.display_name || project.slug;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return formatter.format(diffSec, 'second');
  if (abs < 3600) return formatter.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return formatter.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 30 * 86_400) return formatter.format(Math.round(diffSec / 86_400), 'day');
  if (abs < 365 * 86_400) return formatter.format(Math.round(diffSec / (30 * 86_400)), 'month');
  return formatter.format(Math.round(diffSec / (365 * 86_400)), 'year');
}

function formatKind(kind: string) {
  return kind.replace(/_/g, ' ');
}

function trashRetentionLabel(entry: TrashEntry) {
  return `Purge after ${formatDateTime(entry.purge_after)} · ${entry.retention_days}d`;
}

function sharedResourceHref(share: ResourceShare): string | null {
  if (share.resource_kind === 'ontology_project') return workspaceResourceStablePath(share.resource_kind, share.resource_id);
  return null;
}

function isSection(value: string | null): value is Section {
  return (
    value === 'portfolios' ||
    value === 'projects' ||
    value === 'your-files' ||
    value === 'shared'
  );
}

function tagsToOptions(tags: CompassTag[]): TagOption[] {
  return tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }));
}

function portfoliosToOptions(portfolios: CompassPortfolio[]): PortfolioOption[] {
  return portfolios.map((p) => ({ id: p.id, name: p.name }));
}

function filtersFromSearchParams(params: URLSearchParams): CompassFilterState {
  return {
    types: params.getAll('type'),
    portfolios: params.getAll('portfolio'),
    projects: params.getAll('project'),
    tags: params.getAll('tag'),
    orgs: params.getAll('org'),
    promoted: params.get('promoted') === 'true',
  };
}

function applyFiltersToSearchParams(
  params: URLSearchParams,
  filters: CompassFilterState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('type');
  next.delete('portfolio');
  next.delete('project');
  next.delete('tag');
  next.delete('org');
  next.delete('promoted');
  for (const value of filters.types) next.append('type', value);
  for (const value of filters.portfolios) next.append('portfolio', value);
  for (const value of filters.projects) next.append('project', value);
  for (const value of filters.tags) next.append('tag', value);
  for (const value of filters.orgs) next.append('org', value);
  if (filters.promoted) next.set('promoted', 'true');
  return next;
}

// ─── Inline icon set, kept tight to mirror Compass screenshots ────────────────

interface IconProps {
  size?: number;
  color?: string;
}

function FolderClosedIcon({ size = 18, color = '#5f6b7a' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 7.5h6l2 2h9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18.5z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PortfoliosIcon({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="6" height="14" rx="1" stroke={color} strokeWidth="1.6" />
      <rect x="11.5" y="5" width="6" height="14" rx="1" stroke={color} strokeWidth="1.6" />
      <path d="M19 6.7l1.7.3-1.6 13.6-1.7-.3z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5.5 8.5h3M5.5 11h3M13 8.5h3M13 11h3" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BriefcaseIcon({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="7.5" width="17" height="11" rx="1.5" stroke={color} strokeWidth="1.6" />
      <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.5 12.5h17" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

function UserIcon({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="3.4" stroke={color} strokeWidth="1.6" />
      <path d="M5 19a7 7 0 0 1 14 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GroupIcon({ size = 18, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="3" stroke={color} strokeWidth="1.6" />
      <circle cx="16.5" cy="10" r="2.4" stroke={color} strokeWidth="1.6" />
      <path d="M3.5 18.5a5.5 5.5 0 0 1 11 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.5 18.5a4 4 0 0 1 6.5-3.1" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="2.6" stroke={color} strokeWidth="1.6" />
      <path
        d="M12 4.5v1.8M12 17.7v1.8M4.5 12h1.8M17.7 12h1.8M6.4 6.4l1.3 1.3M16.3 16.3l1.3 1.3M6.4 17.6l1.3-1.3M16.3 7.7l1.3-1.3"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon({ size = 13, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function ProjectGlyphIcon({ size = 18, accent = '#7c5dd6' }: { size?: number; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="14" height="11" rx="1.5" stroke="#5f6b7a" strokeWidth="1.6" />
      <path d="M3 9.2h14" stroke="#5f6b7a" strokeWidth="1.6" />
      <circle cx="18.4" cy="17.6" r="3.4" fill={accent} />
      <path d="M17 17.6l1 1 1.8-2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="12" r="1.6" fill={color} />
      <circle cx="12" cy="12" r="1.6" fill={color} />
      <circle cx="18" cy="12" r="1.6" fill={color} />
    </svg>
  );
}

function SectionGlyph({ name, active }: { name: SectionEntry['glyph']; active: boolean }) {
  const color = active ? 'var(--text-strong)' : '#5f6b7a';
  switch (name) {
    case 'portfolios':
      return <PortfoliosIcon color={color} />;
    case 'projects':
      return <BriefcaseIcon color={color} />;
    case 'your-files':
      return <UserIcon color={color} />;
    case 'shared':
      return <GroupIcon color={color} />;
  }
}

function ChevronDownIcon({ size = 12, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ size = 12, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NamespaceChipIcon({ size = 14, color = '#5f6b7a' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 7h6l2 2h9v9.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 13.5l2 2 4-4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProjectsListPage() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const sectionParam = searchParams.get('section');
  const initialSection: Section = isSection(sectionParam) ? sectionParam : 'projects';
  const [section, setSection] = useState<Section>(initialSection);

  const [projects, setProjects] = useState<OntologyProject[]>([]);
  const [shared, setShared] = useState<ResourceShare[]>([]);
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNotice, setRequestNotice] = useState('');
  const [trashNotice, setTrashNotice] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OntologyProject | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashEntry | null>(null);
  const [namespace, setNamespace] = useState<string | null>(() => searchParams.get('ns'));
  const [filters, setFilters] = useState<CompassFilterState>(() => filtersFromSearchParams(searchParams));
  const [globalQuery, setGlobalQuery] = useState<string>(() => searchParams.get('q') ?? '');
  const [searchResults, setSearchResults] = useState<CompassSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [orgs, setOrgs] = useState<NexusSpace[]>([]);
  const [tags, setTags] = useState<CompassTag[]>([]);
  const [tagsByProject, setTagsByProject] = useState<Record<string, CompassTag[]>>({});
  const [portfolios, setPortfolios] = useState<CompassPortfolio[]>([]);
  const [portfoliosByProject, setPortfoliosByProject] = useState<Record<string, CompassPortfolio[]>>({});
  const [namespaces, setNamespaces] = useState<CompassNamespace[]>([]);

  const manageRef = useRef<HTMLDivElement>(null);
  const globalSearchRef = useRef<HTMLInputElement>(null);

  const activeNamespaceId = useMemo(() => {
    if (!namespace) return null;
    return namespaces.find((ns) => ns.name === namespace)?.id ?? null;
  }, [namespace, namespaces]);

  const filteredProjects = useMemo(() => {
    let rows = projects;
    if (section === 'your-files' && currentUser?.id) {
      rows = rows.filter((project) => project.owner_id === currentUser.id);
    }
    if (filters.promoted) {
      rows = rows.filter((project) => project.is_promoted === true);
    }
    if (filters.projects.length > 0) {
      const allowed = new Set(filters.projects);
      rows = rows.filter((project) => allowed.has(project.id));
    }
    if (filters.tags.length > 0) {
      const allowed = new Set(filters.tags);
      rows = rows.filter((project) =>
        (tagsByProject[project.id] ?? []).some((tag) => allowed.has(tag.id)),
      );
    }
    if (filters.orgs.length > 0) {
      const allowed = new Set(filters.orgs);
      rows = rows.filter((project) => project.workspace_slug != null && allowed.has(project.workspace_slug));
    }
    if (activeNamespaceId) {
      rows = rows.filter((project) => project.namespace_id === activeNamespaceId);
    }
    return rows;
  }, [projects, section, currentUser?.id, filters, tagsByProject, activeNamespaceId]);

  async function refreshSection(next: Section) {
    setLoading(true);
    setError('');
    try {
      if (next === 'shared') {
        setShared(await listSharedWithMe({ limit: 200 }));
      } else {
        const res = await listProjects({ per_page: 200 });
        setProjects(res.data);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function loadTrash() {
    setBusy(true);
    setError('');
    try {
      setTrash(await listTrash({ limit: 200 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load trash');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (section === 'projects') next.delete('section');
        else next.set('section', section);
        return next;
      },
      { replace: true },
    );
    void refreshSection(section);
  }, [section]);

  useEffect(() => {
    setSearchParams((prev) => applyFiltersToSearchParams(prev, filters), { replace: true });
  }, [filters]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (namespace) next.set('ns', namespace);
        else next.delete('ns');
        return next;
      },
      { replace: true },
    );
  }, [namespace]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (globalQuery.trim()) next.set('q', globalQuery.trim());
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [globalQuery]);

  useEffect(() => {
    const trimmed = globalQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await searchCompass({
            q: trimmed,
            type: filters.types[0],
            limit: 50,
          });
          setSearchResults(res.data);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Search failed');
          setSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [globalQuery, filters.types]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await listSpaces();
        setOrgs(res.items ?? []);
      } catch {
        setOrgs([]);
      }
    })();
    void refreshTagsCatalog();
    void (async () => {
      try {
        const res = await listCompassPortfolios();
        const list = res.data ?? [];
        setPortfolios(list);
        const memberships = await Promise.all(
          list.map(async (portfolio) => {
            try {
              const projectsRes = await listPortfolioProjects(portfolio.id);
              return { portfolio, members: projectsRes.data ?? [] };
            } catch {
              return { portfolio, members: [] };
            }
          }),
        );
        const next: Record<string, CompassPortfolio[]> = {};
        for (const { portfolio, members } of memberships) {
          for (const m of members) {
            (next[m.project_id] ??= []).push(portfolio);
          }
        }
        setPortfoliosByProject(next);
      } catch {
        setPortfolios([]);
        setPortfoliosByProject({});
      }
    })();
    void (async () => {
      try {
        const res = await listCompassNamespaces();
        setNamespaces(res.data ?? []);
      } catch {
        setNamespaces([]);
      }
    })();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const cmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (cmdK) {
        event.preventDefault();
        globalSearchRef.current?.focus();
        globalSearchRef.current?.select();
        return;
      }
      if (!inEditable && (event.key === 'n' || event.key === 'N') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setCreateOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (projects.length === 0) {
      setTagsByProject({});
      return;
    }
    void (async () => {
      try {
        const res = await bulkListResourceTags(
          projects.map((project) => ({
            resource_kind: 'ontology_project',
            resource_id: project.id,
          })),
        );
        const next: Record<string, CompassTag[]> = {};
        for (const entry of res.data ?? []) {
          next[entry.resource_id] = entry.tags;
        }
        setTagsByProject(next);
      } catch {
        // best effort
      }
    })();
  }, [projects]);

  async function refreshTagsCatalog() {
    try {
      const res = await listCompassTags();
      setTags(res.data ?? []);
    } catch {
      setTags([]);
    }
  }

  async function refreshTagsForVisibleProjects() {
    if (projects.length === 0) return;
    try {
      const res = await bulkListResourceTags(
        projects.map((project) => ({
          resource_kind: 'ontology_project',
          resource_id: project.id,
        })),
      );
      const next: Record<string, CompassTag[]> = {};
      for (const entry of res.data ?? []) {
        next[entry.resource_id] = entry.tags;
      }
      setTagsByProject(next);
    } catch {
      // best effort
    }
  }

  useEffect(() => {
    if (!manageOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (!manageRef.current?.contains(event.target as Node)) setManageOpen(false);
    }
    function onEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') setManageOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [manageOpen]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    try {
      await deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await refreshSection(section);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function restore(entry: TrashEntry) {
    setBusy(true);
    setError('');
    setTrashNotice('');
    try {
      const result = await restoreResource(entry.resource_kind, entry.resource_id);
      setTrashNotice(result.banner || `${entry.display_name || entry.resource_id} restored.`);
      await loadTrash();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPurge() {
    if (!purgeTarget) return;
    setBusy(true);
    setError('');
    try {
      await purgeResource(purgeTarget.resource_kind, purgeTarget.resource_id);
      setPurgeTarget(null);
      await loadTrash();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Purge failed');
    } finally {
      setBusy(false);
    }
  }

  function openTrashOverlay() {
    setManageOpen(false);
    setTrashOpen(true);
    void loadTrash();
  }

  function handleSection(next: Section) {
    setSection(next);
  }

  async function togglePromoted(project: OntologyProject) {
    try {
      if (project.is_promoted) {
        await unpromoteProject(project.id);
      } else {
        await promoteProject(project.id);
      }
      await refreshSection(section);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Promote update failed');
    }
  }

  function nameToSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'item';
  }

  async function handleCreatePortfolio(name: string) {
    try {
      const portfolio = await createCompassPortfolio({ name, slug: nameToSlug(name) });
      setPortfolios((current) => [...current, portfolio]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create portfolio');
    }
  }

  async function handleCreateNamespace(name: string) {
    try {
      const ns = await createCompassNamespace({ name, slug: nameToSlug(name) });
      setNamespaces((current) => [...current, ns]);
      setNamespace(ns.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create namespace');
    }
  }

  function handleQuickFilter(kind: QuickFilterKind) {
    if (kind === 'portfolios') {
      handleSection('portfolios');
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('promoted');
          return next;
        },
        { replace: true },
      );
      return;
    }
    if (kind === 'projects') {
      handleSection('projects');
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('promoted');
          return next;
        },
        { replace: true },
      );
      return;
    }
    handleSection('projects');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('promoted', 'true');
        return next;
      },
      { replace: true },
    );
  }

  function handleRequestSubmitted(payload: { title: string; description: string; useCase: string }) {
    setRequestOpen(false);
    setRequestNotice(`Request "${payload.title}" queued. The data steward team will follow up.`);
    setTimeout(() => setRequestNotice(''), 5000);
  }

  return (
    <section
      className="of-page"
      style={{ display: 'grid', gap: 0, padding: 0, background: '#fff', minHeight: '100%' }}
    >
      {/* ── Compass-style sub-nav (img_001) ───────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 22px',
          background: '#fff',
        }}
      >
        <nav
          aria-label="Compass sections"
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <button
            type="button"
            aria-label="All files"
            onClick={() => handleSection('projects')}
            style={{
              border: 0,
              background: 'transparent',
              padding: 6,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <FolderClosedIcon size={20} color="#5f6b7a" />
          </button>
          {SECTIONS.map((entry) => {
            const active = section === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSection(entry.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  border: 0,
                  borderRadius: 3,
                  background: 'transparent',
                  color: active ? 'var(--text-strong)' : 'var(--text-default)',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <SectionGlyph name={entry.glyph} active={active} />
                <span>{entry.label}</span>
              </button>
            );
          })}
        </nav>
        <div style={{ flex: 1 }} />
        <NamespaceSelector
          name={namespace}
          onChange={setNamespace}
          namespaces={namespaces}
          onCreate={(name) => void handleCreateNamespace(name)}
        />
      </div>

      {/* ── Section header (title + actions + manage spaces) ──────────── */}
      <div style={{ padding: '8px 22px 0', background: '#fff' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <NamespaceBreadcrumb
            namespace={namespace}
            onClear={() => setNamespace(null)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} ref={manageRef}>
            <button type="button" className="of-button" onClick={() => setRequestOpen(true)}>
              Request data
            </button>
            <button
              type="button"
              className="of-button of-button--foundry-green"
              onClick={() => setCreateOpen(true)}
              style={{ paddingLeft: 10, paddingRight: 12 }}
            >
              <PlusIcon color="#fff" /> New project
            </button>
            <button
              type="button"
              className="of-button"
              onClick={() => setManageOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={manageOpen}
              style={{ paddingRight: 10 }}
            >
              Manage spaces
              <GearIcon />
            </button>
            {manageOpen ? (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  zIndex: 30,
                  minWidth: 220,
                  background: '#fff',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4,
                  boxShadow: 'var(--shadow-popover)',
                  padding: 4,
                }}
              >
                <MenuItem onClick={openTrashOverlay}>Open trash</MenuItem>
                <MenuItem
                  onClick={() => {
                    setManageOpen(false);
                    navigate('/settings');
                  }}
                >
                  Workspace settings
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setManageOpen(false);
                    void refreshSection(section);
                  }}
                >
                  Refresh
                </MenuItem>
              </div>
            ) : null}
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        />
      </div>

      {error ? (
        <div
          className="of-status-danger"
          style={{
            margin: '8px 22px 0',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {requestNotice ? (
        <div
          className="of-status-info"
          style={{
            margin: '8px 22px 0',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          {requestNotice}
        </div>
      ) : null}

      {trashNotice ? (
        <div
          className="of-status-info"
          style={{
            margin: '8px 22px 0',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          {trashNotice}
        </div>
      ) : null}

      <QuickFilterCards onApply={handleQuickFilter} />

      <GlobalSearchBar
        ref={globalSearchRef}
        value={globalQuery}
        onChange={setGlobalQuery}
        onClear={() => setGlobalQuery('')}
      />

      {/* ── Body: FILTERS rail + main table ──────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '232px minmax(0, 1fr)',
          background: '#fff',
          minHeight: 480,
        }}
      >
        <CompassFilterRail
          filters={filters}
          onChange={setFilters}
          portfolios={portfoliosToOptions(portfolios)}
          projects={projects.map((project) => ({
            id: project.id,
            name: project.display_name || project.slug,
          }))}
          tags={tagsToOptions(tags)}
          orgs={orgs.map((space) => ({ id: space.slug, name: space.display_name || space.slug }))}
          onCreatePortfolio={(name) => void handleCreatePortfolio(name)}
        />
        <div style={{ display: 'grid', gap: 0 }}>
          {globalQuery.trim() ? (
            <GlobalSearchResults
              results={searchResults}
              loading={searchLoading}
              query={globalQuery.trim()}
            />
          ) : (
            <>
              {section === 'projects' ? (
                <ProjectsTable
                  projects={filteredProjects}
                  loading={loading}
                  onDelete={(project) => setDeleteTarget(project)}
                  onRequestAccess={() => setRequestOpen(true)}
                  busy={busy}
                  tagsCatalog={tags}
                  tagsByProject={tagsByProject}
                  onTagsCatalogChange={() => void refreshTagsCatalog()}
                  onProjectTagsChange={() => void refreshTagsForVisibleProjects()}
                  portfoliosByProject={portfoliosByProject}
                  onTogglePromoted={(project) => void togglePromoted(project)}
                />
              ) : null}

              {section === 'your-files' ? (
                <ProjectsTable
                  projects={filteredProjects}
                  loading={loading}
                  onDelete={(project) => setDeleteTarget(project)}
                  onRequestAccess={() => setRequestOpen(true)}
                  busy={busy}
                  ownedHint
                  tagsCatalog={tags}
                  tagsByProject={tagsByProject}
                  onTagsCatalogChange={() => void refreshTagsCatalog()}
                  onProjectTagsChange={() => void refreshTagsForVisibleProjects()}
                  portfoliosByProject={portfoliosByProject}
                  onTogglePromoted={(project) => void togglePromoted(project)}
                />
              ) : null}

              {section === 'shared' ? <SharedTable shared={shared} loading={loading} /> : null}

              {section === 'portfolios' ? <PortfoliosPlaceholder /> : null}
            </>
          )}
        </div>
      </div>

      {/* ── Modals & drawers ──────────────────────────────────────────── */}
      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(project) => {
          setCreateOpen(false);
          navigate(projectStablePath(project));
        }}
      />

      <RequestDataDialog
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onSubmit={handleRequestSubmitted}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Move project to trash"
        message={deleteTarget ? `Move "${projectName(deleteTarget)}" to trash?` : ''}
        confirmLabel="Move to trash"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={purgeTarget !== null}
        title="Permanently delete project"
        message={purgeTarget ? `Permanently delete "${purgeTarget.display_name || purgeTarget.resource_id}"?` : ''}
        confirmLabel="Delete permanently"
        danger
        busy={busy}
        onConfirm={() => void confirmPurge()}
        onCancel={() => setPurgeTarget(null)}
      />

      {trashOpen ? (
        <TrashOverlay
          trash={trash}
          loading={busy}
          onClose={() => setTrashOpen(false)}
          onRestore={(entry) => void restore(entry)}
          onPurge={(entry) => setPurgeTarget(entry)}
        />
      ) : null}
    </section>
  );
}

// ─── Sub-views ───────────────────────────────────────────────────────────────

function DocumentIcon({ size = 14, color = '#5f6b7a' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3.5v4h4" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function NamespaceBreadcrumb({
  namespace,
  onClear,
}: {
  namespace: string | null;
  onClear: () => void;
}) {
  return (
    <nav
      aria-label="Namespace breadcrumb"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        color: 'var(--text-strong)',
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: namespace ? '#2D72D2' : 'var(--text-strong)',
          cursor: 'default',
        }}
      >
        <DocumentIcon color={namespace ? '#2D72D2' : '#5f6b7a'} />
        All files
      </span>
      {namespace ? (
        <>
          <span aria-hidden="true" style={{ color: '#a1a8b3', fontWeight: 400 }}>
            ›
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0,
              border: '1px solid var(--border-default)',
              borderRadius: 3,
              background: '#fff',
              height: 26,
              maxWidth: 360,
              fontSize: 12,
              color: 'var(--text-strong)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 8px',
                height: '100%',
                minWidth: 0,
              }}
            >
              <NamespaceChipIcon size={13} />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 260,
                }}
                title={namespace}
              >
                {namespace}
              </span>
            </span>
            <button
              type="button"
              aria-label="Clear namespace breadcrumb"
              onClick={onClear}
              style={{
                border: 0,
                background: 'transparent',
                padding: '0 6px',
                height: '100%',
                cursor: 'pointer',
                color: '#5f6b7a',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <CloseIcon size={11} />
            </button>
            <button
              type="button"
              aria-label="Choose namespace"
              style={{
                border: 0,
                borderLeft: '1px solid var(--border-default)',
                background: 'transparent',
                padding: '0 6px',
                height: '100%',
                cursor: 'pointer',
                color: '#5f6b7a',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <ChevronDownIcon size={11} />
            </button>
          </span>
        </>
      ) : null}
    </nav>
  );
}

function NamespaceSelector({
  name,
  onChange,
  namespaces,
  onCreate,
}: {
  name: string | null;
  onChange: (next: string | null) => void;
  namespaces: CompassNamespace[];
  onCreate?: (name: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEsc(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (!name) {
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          type="button"
          className="of-button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            padding: '4px 10px',
            color: '#5f6b7a',
          }}
          onClick={() => setOpen((value) => !value)}
        >
          <NamespaceChipIcon />
          <span>Select namespace</span>
          <ChevronDownIcon />
        </button>
        {open ? (
          <NamespaceDropdown
            namespaces={namespaces}
            onPick={(ns) => {
              onChange(ns.name);
              setOpen(false);
            }}
            onCreate={
              onCreate
                ? async (next) => {
                    await onCreate(next);
                    setOpen(false);
                  }
                : undefined
            }
          />
        ) : null}
      </div>
    );
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0,
          border: '1px solid var(--border-default)',
          borderRadius: 3,
          background: '#fff',
          height: 28,
          maxWidth: 320,
          fontSize: 12,
          color: 'var(--text-strong)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 8px',
            height: '100%',
            minWidth: 0,
          }}
        >
          <NamespaceChipIcon />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 220,
            }}
            title={name}
          >
            {name}
          </span>
        </span>
        <button
          type="button"
          aria-label="Clear namespace"
          onClick={() => onChange(null)}
          style={{
            border: 0,
            background: 'transparent',
            padding: '0 6px',
            height: '100%',
            cursor: 'pointer',
            color: '#5f6b7a',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <CloseIcon />
        </button>
        <button
          type="button"
          aria-label="Choose namespace"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            border: 0,
            borderLeft: '1px solid var(--border-default)',
            background: 'transparent',
            padding: '0 6px',
            height: '100%',
            cursor: 'pointer',
            color: '#5f6b7a',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <ChevronDownIcon />
        </button>
        <button
          type="button"
          aria-label="Namespace settings"
          style={{
            border: 0,
            borderLeft: '1px solid var(--border-default)',
            background: 'transparent',
            padding: '0 8px',
            height: '100%',
            cursor: 'pointer',
            color: '#5f6b7a',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <GearIcon size={13} />
        </button>
      </div>
      {open ? (
        <NamespaceDropdown
          namespaces={namespaces}
          onPick={(ns) => {
            onChange(ns.name);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function NamespaceDropdown({
  namespaces,
  onPick,
  onCreate,
}: {
  namespaces: CompassNamespace[];
  onPick: (ns: CompassNamespace) => void;
  onCreate?: (name: string) => void | Promise<void>;
}) {
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitCreate() {
    const trimmed = draftName.trim();
    if (!trimmed || !onCreate) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      setDraftName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        zIndex: 30,
        minWidth: 240,
        maxWidth: 320,
        background: '#fff',
        border: '1px solid var(--border-default)',
        borderRadius: 4,
        boxShadow: 'var(--shadow-popover)',
        padding: 4,
      }}
    >
      {namespaces.length === 0 ? (
        <p style={{ margin: '6px 8px', fontSize: 11, color: '#a1a8b3' }}>
          No namespaces defined yet.
        </p>
      ) : (
        namespaces.map((ns) => (
          <button
            key={ns.id}
            type="button"
            role="menuitem"
            onClick={() => onPick(ns)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              textAlign: 'left',
              border: 0,
              background: 'transparent',
              padding: '6px 8px',
              fontSize: 12,
              color: 'var(--text-strong)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            <NamespaceChipIcon size={13} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {ns.name}
              </div>
              {ns.description ? (
                <div
                  style={{
                    fontSize: 10,
                    color: '#8a96a6',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ns.description}
                </div>
              ) : null}
            </div>
          </button>
        ))
      )}
      {onCreate ? (
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            marginTop: 4,
            paddingTop: 6,
            display: 'flex',
            gap: 4,
          }}
        >
          <input
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitCreate();
              }
            }}
            placeholder="New namespace name"
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
            onClick={() => void submitCreate()}
            disabled={busy || !draftName.trim()}
            className="of-button"
            style={{ padding: '2px 8px', fontSize: 11 }}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: 0,
        background: 'transparent',
        padding: '8px 10px',
        fontSize: 12,
        color: 'var(--text-strong)',
        borderRadius: 3,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}


type ProjectSortKey = 'name' | 'updated';
type ProjectSortDir = 'asc' | 'desc';

function ProjectsTable({
  projects,
  loading,
  onDelete,
  onRequestAccess,
  busy,
  ownedHint,
  tagsCatalog,
  tagsByProject,
  onTagsCatalogChange,
  onProjectTagsChange,
  portfoliosByProject,
  onTogglePromoted,
}: {
  projects: OntologyProject[];
  loading: boolean;
  onDelete: (project: OntologyProject) => void;
  onRequestAccess: (project: OntologyProject) => void;
  busy: boolean;
  ownedHint?: boolean;
  tagsCatalog: CompassTag[];
  tagsByProject: Record<string, CompassTag[]>;
  onTagsCatalogChange: () => void;
  onProjectTagsChange: () => void;
  portfoliosByProject: Record<string, CompassPortfolio[]>;
  onTogglePromoted: (project: OntologyProject) => void;
}) {
  const [sortKey, setSortKey] = useState<ProjectSortKey>('updated');
  const [sortDir, setSortDir] = useState<ProjectSortDir>('desc');

  const sorted = useMemo(() => {
    const rows = [...projects];
    rows.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'name') {
        return projectName(a).localeCompare(projectName(b)) * dir;
      }
      return (
        (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
      );
    });
    return rows;
  }, [projects, sortKey, sortDir]);

  function toggleSort(key: ProjectSortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('desc');
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <span className="of-text-muted">Loading projects...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {ownedHint ? (
        <p
          className="of-text-muted"
          style={{ margin: 0, padding: '10px 22px', fontSize: 12 }}
        >
          Projects where you are the owner.
        </p>
      ) : null}
      <table className="of-table compass-files-table">
        <thead>
          <tr>
            <th style={{ paddingLeft: 22 }}>
              <SortHeader
                label="File name"
                active={sortKey === 'name'}
                dir={sortDir}
                onClick={() => toggleSort('name')}
              />
            </th>
            <th>
              <SortHeader
                label="Last modified"
                active={sortKey === 'updated'}
                dir={sortDir}
                onClick={() => toggleSort('updated')}
              />
            </th>
            <th>Tags</th>
            <th>Portfolio</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: 0 }}>
                <CompassEmptyState
                  glyph={<BriefcaseIcon size={32} color="#aab4c0" />}
                  title="No projects match these filters"
                  message="Adjust filters in the rail or create a new project to populate this view."
                />
              </td>
            </tr>
          ) : (
            sorted.map((project) => (
              <ProjectsTableRow
                key={project.id}
                project={project}
                busy={busy}
                onDelete={onDelete}
                onRequestAccess={onRequestAccess}
                attachedTags={tagsByProject[project.id] ?? []}
                tagsCatalog={tagsCatalog}
                onTagsCatalogChange={onTagsCatalogChange}
                onProjectTagsChange={onProjectTagsChange}
                projectPortfolios={portfoliosByProject[project.id] ?? []}
                onTogglePromoted={onTogglePromoted}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProjectsTableRow({
  project,
  busy,
  onDelete,
  onRequestAccess,
  attachedTags,
  tagsCatalog,
  onTagsCatalogChange,
  onProjectTagsChange,
  projectPortfolios,
  onTogglePromoted,
}: {
  project: OntologyProject;
  busy: boolean;
  onDelete: (project: OntologyProject) => void;
  onRequestAccess: (project: OntologyProject) => void;
  attachedTags: CompassTag[];
  tagsCatalog: CompassTag[];
  onTagsCatalogChange: () => void;
  onProjectTagsChange: () => void;
  projectPortfolios: CompassPortfolio[];
  onTogglePromoted: (project: OntologyProject) => void;
}) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const linkCount = project.references?.length ?? 0;
  const hasAccess = Boolean(project.owner_id);
  const updatedDateLabel = formatDateTime(project.updated_at);
  const updatedRelative = formatRelativeTime(project.updated_at);

  return (
    <tr
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setMenuOpen(false);
      }}
      style={{ position: 'relative' }}
    >
      <td style={{ paddingLeft: 22 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <ProjectGlyphIcon />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link to={projectStablePath(project)} className="of-link">
                {projectName(project)}
              </Link>
              {linkCount > 0 ? (
                <LinkCountBadge count={linkCount} />
              ) : null}
              {project.is_promoted ? <PromotedBadge /> : null}
            </div>
            <div
              className="of-text-soft"
              style={{
                marginTop: 2,
                fontSize: 11,
                color: '#5f6b7a',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 520,
              }}
            >
              /{project.workspace_slug || 'workspace'}/{project.slug}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {hover ? (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="of-button of-button--ghost"
                aria-label={`More actions for ${projectName(project)}`}
                onClick={() => setMenuOpen((value) => !value)}
                disabled={busy}
                style={{ padding: '2px 4px' }}
              >
                <MoreIcon />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    zIndex: 20,
                    background: '#fff',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    boxShadow: 'var(--shadow-popover)',
                    padding: 4,
                    minWidth: 180,
                  }}
                >
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onTogglePromoted(project);
                    }}
                  >
                    {project.is_promoted ? 'Unpromote' : 'Promote'}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(project);
                    }}
                  >
                    Move to trash…
                  </MenuItem>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </td>
      <td>
        {hasAccess ? (
          <span
            className="of-text-muted"
            title={updatedDateLabel === '-' ? undefined : updatedDateLabel}
            style={{ fontSize: 12 }}
          >
            {updatedRelative}
          </span>
        ) : (
          <button
            type="button"
            className="of-button"
            onClick={() => onRequestAccess(project)}
            style={{ fontSize: 11, padding: '2px 8px' }}
          >
            Request access
          </button>
        )}
      </td>
      <td>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <TagChips tags={attachedTags} max={3} />
          {hover ? (
            <TagPicker
              resourceKind="ontology_project"
              resourceId={project.id}
              attached={attachedTags}
              available={tagsCatalog}
              onChange={onProjectTagsChange}
              onTagsCatalogChange={onTagsCatalogChange}
            />
          ) : null}
        </div>
      </td>
      <td>
        <PortfolioCell portfolios={projectPortfolios} />
      </td>
    </tr>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: ProjectSortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        color: 'var(--text-strong)',
        letterSpacing: 0.2,
      }}
    >
      <span>{label}</span>
      <SortGlyph active={active} dir={dir} />
    </button>
  );
}

function SortGlyph({ active, dir }: { active: boolean; dir: ProjectSortDir }) {
  const color = active ? '#2D72D2' : '#a1a8b3';
  if (!active) {
    return (
      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 10l4-4 4 4M8 14l4 4 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (dir === 'asc') {
    return (
      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 14l5-5 5 5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10l5 5 5-5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PromotedBadge() {
  return (
    <span
      title="Promoted item"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '0 5px',
        height: 16,
        borderRadius: 8,
        background: '#f2ecfb',
        color: '#7c5dd6',
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="#7c5dd6" />
        <path
          d="M8 12.5l2.5 2.5L16 9.5"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Promoted
    </span>
  );
}

function LinkCountBadge({ count }: { count: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '0 5px',
        height: 16,
        borderRadius: 8,
        background: '#eef1f5',
        color: '#5f6b7a',
        fontSize: 10,
        fontWeight: 500,
      }}
      title={`${count} reference${count === 1 ? '' : 's'}`}
    >
      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="6" width="13" height="13" rx="1.5" stroke="#5f6b7a" strokeWidth="1.6" />
        <path d="M8 3.5h13v13" stroke="#5f6b7a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {count}
    </span>
  );
}

function PortfolioCell({ portfolios }: { portfolios: CompassPortfolio[] }) {
  if (portfolios.length === 0) {
    return <span style={{ fontSize: 12, color: '#a1a8b3' }}>—</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {portfolios.map((portfolio) => (
        <span
          key={portfolio.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: 'var(--text-strong)',
          }}
        >
          <FolderClosedIcon size={14} color="#5f6b7a" />
          <span>{portfolio.name}</span>
        </span>
      ))}
    </div>
  );
}

function SharedTable({ shared, loading }: { shared: ResourceShare[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <span className="of-text-muted">Loading shared resources...</span>
      </div>
    );
  }
  return (
    <table className="of-table of-table--compass">
      <thead>
        <tr>
          <th style={{ paddingLeft: 22 }}>Resource</th>
          <th>Access</th>
          <th>Shared by</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {shared.length === 0 ? (
          <tr>
            <td colSpan={4} style={{ padding: 0 }}>
              <CompassEmptyState
                glyph={<GroupIcon size={32} color="#aab4c0" />}
                title="Nothing shared with you yet"
                message="When a teammate shares a resource, it lands here."
              />
            </td>
          </tr>
        ) : (
          shared.map((share) => {
            const href = sharedResourceHref(share);
            return (
              <tr key={share.id}>
                <td style={{ paddingLeft: 22 }}>
                  {href ? (
                    <Link to={href} className="of-link">
                      {share.resource_id}
                    </Link>
                  ) : (
                    <code>{share.resource_id}</code>
                  )}
                  <div className="of-text-soft" style={{ marginTop: 2, fontSize: 10 }}>
                    {formatKind(share.resource_kind)}
                  </div>
                </td>
                <td>
                  <span className="of-chip">{share.access_level}</span>
                </td>
                <td className="of-text-muted">{share.sharer_id}</td>
                <td className="of-text-muted">{formatDateTime(share.created_at)}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function CompassEmptyState({
  glyph,
  title,
  message,
}: {
  glyph: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div
      style={{
        padding: '48px 24px',
        display: 'grid',
        gap: 8,
        justifyItems: 'center',
        textAlign: 'center',
      }}
    >
      {glyph}
      <p
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-strong)',
        }}
      >
        {title}
      </p>
      <p style={{ margin: 0, maxWidth: 460, fontSize: 12, color: 'var(--of-foundry-text-muted)' }}>
        {message}
      </p>
    </div>
  );
}

function SearchEmptyIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="#aab4c0" strokeWidth="1.6" />
      <path d="M16 16l4 4" stroke="#aab4c0" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 11h6" stroke="#aab4c0" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PortfoliosPlaceholder() {
  return (
    <div style={{ padding: '48px 24px', display: 'grid', gap: 8, justifyItems: 'center', textAlign: 'center' }}>
      <PortfoliosIcon size={36} color="#aab4c0" />
      <p className="of-heading-sm" style={{ margin: 0 }}>
        No portfolios yet
      </p>
      <p className="of-text-muted" style={{ margin: 0, maxWidth: 460 }}>
        Portfolios group projects across business lines. Create your first portfolio from a project to start consolidating
        access, audit and reporting across teams.
      </p>
    </div>
  );
}

function GlobalSearchResults({
  results,
  loading,
  query,
}: {
  results: CompassSearchResult[];
  loading: boolean;
  query: string;
}) {
  if (loading && results.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <span className="of-text-muted">Searching for "{query}"…</span>
      </div>
    );
  }
  return (
    <div>
      <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          {results.length} result{results.length === 1 ? '' : 's'} for "{query}"
        </p>
      </div>
      {results.length === 0 ? (
        <CompassEmptyState
          glyph={<SearchEmptyIcon />}
          title={`No results for "${query}"`}
          message="Try a different keyword, or check the filter rail to broaden the type/tag/portfolio scope."
        />
      ) : (
        <table className="of-table of-table--compass">
          <thead>
            <tr>
              <th style={{ paddingLeft: 22 }}>File name</th>
              <th>Last modified</th>
              <th>Tags</th>
              <th>Project</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.rid}>
                <td style={{ paddingLeft: 22 }}>
                  <a href={result.open_url} className="of-link">
                    {result.display_name}
                  </a>
                  <div className="of-text-soft" style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    {formatKind(result.type)} / {result.rid}
                  </div>
                  {result.snippet ? (
                    <div className="of-text-muted" style={{ marginTop: 4, maxWidth: 520, fontSize: 12 }}>
                      {result.snippet}
                    </div>
                  ) : null}
                </td>
                <td className="of-text-muted">{formatDateTime(result.last_modified_at)}</td>
                <td>
                  {result.tags.length === 0 ? (
                    <span className="of-text-soft">—</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {result.tags.map((tag) => (
                        <span key={tag} className="of-chip" style={{ fontSize: 10 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="of-text-muted">{result.owning_project_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TrashOverlay({
  trash,
  loading,
  onClose,
  onRestore,
  onPurge,
}: {
  trash: TrashEntry[];
  loading: boolean;
  onClose: () => void;
  onRestore: (entry: TrashEntry) => void;
  onPurge: (entry: TrashEntry) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(17, 24, 39, 0.42)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <section
        className="of-panel"
        style={{
          width: '100%',
          maxWidth: 920,
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>
              Manage spaces
            </p>
            <h2 className="of-heading-md" style={{ marginTop: 4 }}>
              Trash
            </h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose}>
            Close
          </button>
        </header>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <span className="of-text-muted">Loading trash...</span>
          </div>
        ) : (
          <table className="of-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Deleted by</th>
                <th>Retention</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {trash.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: 'center' }}>
                    <span className="of-text-muted">Trash is empty.</span>
                  </td>
                </tr>
              ) : (
                trash.map((entry) => (
                  <tr key={`${entry.resource_kind}-${entry.resource_id}`}>
                    <td>
                      <strong style={{ color: 'var(--text-strong)' }}>{entry.display_name || entry.resource_id}</strong>
                      <div className="of-text-soft" style={{ marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                        {formatKind(entry.resource_kind)} / {entry.resource_id}
                      </div>
                    </td>
                    <td className="of-text-muted">{entry.deleted_by ?? 'unknown'}</td>
                    <td className="of-text-muted">
                      {formatDateTime(entry.deleted_at)}
                      <div className="of-text-soft" style={{ marginTop: 2 }}>
                        {trashRetentionLabel(entry)}
                      </div>
                      {entry.restore_target_status === 'project_root' ? (
                        <span className="of-chip" style={{ marginTop: 4, background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
                          Restores to project root
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button type="button" className="of-button" onClick={() => onRestore(entry)} style={{ fontSize: 11 }}>
                          Restore
                        </button>
                        <button
                          type="button"
                          className="of-button of-btn-danger"
                          onClick={() => onPurge(entry)}
                          style={{ fontSize: 11 }}
                        >
                          Purge
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
