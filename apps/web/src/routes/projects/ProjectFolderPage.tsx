import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BulkActionsToolbar, type BulkAction } from '@/lib/components/workspace/BulkActionsToolbar';
import { ConfirmDialog } from '@/lib/components/ConfirmDialog';
import { resourceRIDForKind } from '@/lib/compass/resourceTypeRegistry';
import {
  folderStablePath,
  projectStablePath,
  resourceIDFromStableSegment,
  resourceLocatorFromStableSegment,
} from '@/lib/compass/stableResourceUrls';
import { FolderTree } from '@/lib/components/workspace/FolderTree';
import { MoveDialog } from '@/lib/components/workspace/MoveDialog';
import { OpenWithMenu } from '@/lib/components/workspace/OpenWithMenu';
import { buildProjectFolderBreadcrumbItems, ProjectBreadcrumb } from '@/lib/components/workspace/ProjectBreadcrumb';
import { RenameDialog } from '@/lib/components/workspace/RenameDialog';
import { ResourceDetailsPanel, type ResourceSummary } from '@/lib/components/workspace/ResourceDetailsPanel';
import { RowActionsMenu } from '@/lib/components/workspace/RowActionsMenu';
import { ShareDialog } from '@/lib/components/workspace/ShareDialog';
import { Glyph } from '@/lib/components/ui/Glyph';
import { ResourcePickerDialog, type ResourcePickerAction } from '@/lib/components/projects/ResourcePickerDialog';
import { UploadFilesDialog } from '@/lib/components/projects/UploadFilesDialog';
import {
  bindProjectResource,
  createProjectFolder,
  getProject,
  listProjectFolders,
  listProjectResources,
  listProjects,
  type OntologyProject,
  type OntologyProjectFolder,
  type OntologyProjectResourceBinding,
} from '@/lib/api/ontology';
import {
  batchApply,
  duplicateResource,
  listResourceReferences,
  recordAccess,
  softDeleteResource,
  type ResourceKind,
} from '@/lib/api/workspace';

const RESOURCE_KIND_OPTIONS: ResourceKind[] = [
  'dataset',
  'pipeline',
  'query',
  'notebook',
  'app',
  'dashboard',
  'report',
  'model',
  'workflow',
  'other',
];

const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  ontology_project: 'Project',
  ontology_folder: 'Folder',
  ontology_resource_binding: 'Binding',
  dataset: 'Dataset',
  pipeline: 'Pipeline',
  query: 'Query',
  notebook: 'Notebook',
  app: 'App',
  dashboard: 'Dashboard',
  report: 'Report',
  model: 'Model',
  workflow: 'Workflow',
  other: 'Other',
};

type FolderExplorerItem = {
  key: string;
  type: 'folder';
  id: string;
  name: string;
  description: string | null;
  kind: 'ontology_folder';
  operationKind: 'ontology_folder';
  shareKind: 'ontology_folder';
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  folder: OntologyProjectFolder;
};

type ResourceExplorerItem = {
  key: string;
  type: 'resource';
  id: string;
  name: string;
  description: string | null;
  kind: ResourceKind;
  operationKind: 'ontology_resource_binding';
  shareKind: ResourceKind;
  createdAt: string;
  updatedAt: string | null;
  ownerId: string;
  binding: OntologyProjectResourceBinding;
};

type ExplorerItem = FolderExplorerItem | ResourceExplorerItem;

type DialogTarget = {
  kind: ResourceKind;
  id: string;
  label: string;
};

const SUPPORTED_RESOURCE_KINDS: ResourceKind[] = [
  'ontology_project',
  'ontology_folder',
  'ontology_resource_binding',
  'dataset',
  'pipeline',
  'query',
  'notebook',
  'app',
  'dashboard',
  'report',
  'model',
  'workflow',
  'other',
];

function asResourceKind(kind: string): ResourceKind {
  return SUPPORTED_RESOURCE_KINDS.includes(kind as ResourceKind) ? (kind as ResourceKind) : 'other';
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function isDescendantFolder(folders: OntologyProjectFolder[], sourceId: string, targetId: string | null) {
  if (!targetId) return false;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let cursor: string | null = targetId;
  while (cursor) {
    if (cursor === sourceId) return true;
    cursor = byId.get(cursor)?.parent_folder_id ?? null;
  }
  return false;
}

export function ProjectFolderPage() {
  const { projectId: projectParam = '', folderId: folderParam = '' } = useParams<{ projectId: string; folderId: string }>();
  const projectRouteID = resourceIDFromStableSegment(projectParam);
  const folderRouteID = resourceLocatorFromStableSegment(folderParam);
  const navigate = useNavigate();
  const [project, setProject] = useState<OntologyProject | null>(null);
  const [projects, setProjects] = useState<OntologyProject[]>([]);
  const [folders, setFolders] = useState<OntologyProjectFolder[]>([]);
  const [resources, setResources] = useState<OntologyProjectResourceBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createMode, setCreateMode] = useState<null | 'folder' | 'binding'>(null);
  const [folderName, setFolderName] = useState('');
  const [folderDescription, setFolderDescription] = useState('');
  const [bindKind, setBindKind] = useState<ResourceKind>('dataset');
  const [bindId, setBindId] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<ResourceKind | 'all'>('all');
  const [detailsResource, setDetailsResource] = useState<ResourceSummary | null>(null);
  const [shareTarget, setShareTarget] = useState<DialogTarget | null>(null);
  const [bulkShareOpen, setBulkShareOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ExplorerItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<ExplorerItem | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteReferenceWarning, setDeleteReferenceWarning] = useState('');

  async function load() {
    if (!projectRouteID) return;
    setLoading(true);
    setError('');
    try {
      const [p, f, r, ps] = await Promise.all([
        getProject(projectRouteID),
        listProjectFolders(projectRouteID),
        listProjectResources(projectRouteID).catch(() => [] as OntologyProjectResourceBinding[]),
        listProjects({ per_page: 200 }).catch(() => null),
      ]);
      setProject(p);
      setFolders(f);
      setResources(r);
      setProjects(ps?.data?.length ? ps.data : [p]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [projectRouteID]);

  useEffect(() => {
    if (!folderRouteID) return;
    recordAccess({ resource_kind: 'ontology_folder', resource_id: folderRouteID }).catch(() => {});
  }, [folderRouteID]);

  const folder = useMemo(() => folders.find((f) => f.id === folderRouteID) ?? null, [folders, folderRouteID]);
  const childFolders = useMemo(
    () => folders.filter((f) => f.parent_folder_id === folderRouteID).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, folderRouteID],
  );
  const breadcrumbItems = useMemo(
    () => (project ? buildProjectFolderBreadcrumbItems(project, folders, folderRouteID) : []),
    [folders, folderRouteID, project],
  );
  const breadcrumbLocation = useMemo(
    () => breadcrumbItems.filter((item) => item.kind === 'project' || item.kind === 'folder').map((item) => item.label).join(' / '),
    [breadcrumbItems],
  );
  const items = useMemo<ExplorerItem[]>(() => {
    const folderItems: FolderExplorerItem[] = childFolders.map((child) => ({
      key: `folder:${child.id}`,
      type: 'folder',
      id: child.id,
      name: child.name,
      description: child.description || null,
      kind: 'ontology_folder',
      operationKind: 'ontology_folder',
      shareKind: 'ontology_folder',
      createdAt: child.created_at,
      updatedAt: child.updated_at,
      ownerId: child.created_by,
      folder: child,
    }));
    const resourceItems: ResourceExplorerItem[] = resources.map((binding) => {
      const kind = asResourceKind(binding.resource_kind);
      return {
        key: `resource:${binding.resource_kind}:${binding.resource_id}`,
        type: 'resource',
        id: binding.resource_id,
        name: `${binding.resource_kind} ${shortId(binding.resource_id)}`,
        description: `Bound by ${shortId(binding.bound_by)}`,
        kind,
        operationKind: 'ontology_resource_binding',
        shareKind: kind,
        createdAt: binding.created_at,
        updatedAt: null,
        ownerId: binding.bound_by,
        binding,
      };
    });
    return [...folderItems, ...resourceItems];
  }, [childFolders, resources]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== 'all') {
        const itemKind = item.type === 'folder' ? 'ontology_folder' : item.shareKind;
        if (itemKind !== kindFilter) return false;
      }
      if (!q) return true;
      return item.name.toLowerCase().includes(q)
        || (item.description ?? '').toLowerCase().includes(q);
    });
  }, [items, search, kindFilter]);

  const selectedItems = useMemo(() => items.filter((item) => selectedKeys.has(item.key)), [items, selectedKeys]);
  const selectedFoldersOnly = selectedItems.length > 0 && selectedItems.every((item) => item.type === 'folder');

  useEffect(() => {
    const targets = deleteTarget
      ? [deleteTarget]
      : bulkDeleteOpen
        ? selectedItems.slice(0, 20)
        : [];
    setDeleteReferenceWarning('');
    if (targets.length === 0) return;

    let cancelled = false;
    Promise.all(
      targets.map((item) => {
        const kind = item.type === 'folder' ? item.operationKind : item.shareKind;
        return listResourceReferences(kind, item.id).catch(() => null);
      }),
    ).then((graphs) => {
      if (cancelled) return;
      const downstream = graphs.reduce<number>((count, graph) => count + (graph?.used_by.length ?? 0), 0);
      const upstream = graphs.reduce<number>((count, graph) => count + (graph?.depends_on.length ?? 0), 0);
      if (downstream === 0 && upstream === 0) return;
      const suffix = bulkDeleteOpen && selectedItems.length > targets.length
        ? ` Checked first ${targets.length} of ${selectedItems.length} selected items.`
        : '';
      setDeleteReferenceWarning(
        `\nReference graph: ${downstream} downstream and ${upstream} upstream reference(s) may need review.${suffix}`,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [deleteTarget, bulkDeleteOpen, selectedItems]);

  useEffect(() => {
    const visibleKeys = new Set(items.map((item) => item.key));
    setSelectedKeys((prev) => {
      const next = new Set([...prev].filter((key) => visibleKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  function handleResourcePick(action: ResourcePickerAction) {
    setShowCreateMenu(false);
    if (action === 'folder') {
      setFolderName('');
      setFolderDescription('');
      setCreateMode('folder');
    } else if (action === 'upload-files') {
      setUploadOpen(true);
    } else if (action === 'bind-existing' || action === 'dataset') {
      setBindKind(action === 'dataset' ? 'dataset' : bindKind);
      setBindId('');
      setCreateMode('binding');
    } else if (action === 'pipeline-builder' && project) {
      navigate(`/pipelines/new?project_id=${project.id}`);
    }
  }

  async function createFolderSubmit() {
    if (!project || !folder || !folderName.trim()) return;
    setBusy(true);
    setError('');
    try {
      await createProjectFolder(project.id, {
        name: folderName.trim(),
        description: folderDescription.trim() || undefined,
        parent_folder_id: folder.id,
      });
      setCreateMode(null);
      setFolderName('');
      setFolderDescription('');
      setFolders(await listProjectFolders(project.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Folder create failed');
    } finally {
      setBusy(false);
    }
  }

  async function bindSubmit() {
    if (!project || !bindId.trim()) return;
    setBusy(true);
    setError('');
    try {
      await bindProjectResource(project.id, {
        resource_kind: bindKind,
        resource_id: bindId.trim(),
      });
      setCreateMode(null);
      setBindId('');
      await refreshAfterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bind failed');
    } finally {
      setBusy(false);
    }
  }

  function setSelected(key: string, selected: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  function resourceSummary(item: ExplorerItem): ResourceSummary {
    const rid = item.type === 'folder'
      ? item.folder.rid
      : resourceRIDForKind(item.shareKind, item.id);
    return {
      id: item.id,
      rid,
      name: item.name,
      kind: item.shareKind,
      description: item.description,
      owner_id: item.ownerId,
      location: breadcrumbLocation,
      project_id: project?.id,
      project_rid: item.type === 'folder'
        ? item.folder.project_rid
        : project ? resourceRIDForKind('ontology_project', project.id) : null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      tags: item.type === 'folder' ? ['folder'] : [item.binding.resource_kind, 'project-binding'],
    };
  }

  function moveDialogProjects(item: ExplorerItem | null) {
    if (!project) return [];
    if (!item || item.operationKind === 'ontology_folder') return [project];
    return projects.length ? projects : [project];
  }

  function projectPath() {
    return project ? projectStablePath(project) : '/projects';
  }

  function folderPathByID(id: string) {
    const target = folders.find((candidate) => candidate.id === id);
    if (!project || !target) return projectPath();
    return folderStablePath(project, target);
  }

  function canMoveItemToFolder(item: ExplorerItem | null, targetFolderId: string) {
    if (!item || item.type !== 'folder') return true;
    return targetFolderId !== item.id && !isDescendantFolder(folders, item.id, targetFolderId);
  }

  function canMoveSelectedToFolder(targetFolderId: string) {
    return selectedItems.every((item) => canMoveItemToFolder(item, targetFolderId));
  }

  async function refreshAfterMutation() {
    await load();
    clearSelection();
  }

  async function duplicateItem(item: ExplorerItem) {
    if (item.type !== 'folder') return;
    setBusy(true);
    setError('');
    try {
      await duplicateResource('ontology_folder', item.id, { target_folder_id: folder?.id ?? null });
      await refreshAfterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Duplicate failed');
    } finally {
      setBusy(false);
    }
  }

  async function duplicateSelected() {
    const targets = selectedItems.filter((item): item is FolderExplorerItem => item.type === 'folder');
    if (!targets.length) return;
    setBusy(true);
    setError('');
    try {
      await Promise.all(targets.map((item) => duplicateResource('ontology_folder', item.id, { target_folder_id: folder?.id ?? null })));
      await refreshAfterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bulk duplicate failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteOne(item: ExplorerItem) {
    setBusy(true);
    setError('');
    try {
      await softDeleteResource(item.operationKind, item.id);
      setDeleteTarget(null);
      await refreshAfterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (!selectedItems.length) return;
    setBusy(true);
    setError('');
    try {
      const response = await batchApply(selectedItems.map((item) => ({
        op: 'delete',
        resource_kind: item.operationKind,
        resource_id: item.id,
      })));
      const failed = response.results.filter((entry) => !entry.ok);
      if (failed.length > 0) {
        setError(`${failed.length} selected item(s) could not be deleted.`);
      }
      setBulkDeleteOpen(false);
      await refreshAfterMutation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bulk delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function moveFolderByTree(targetFolderId: string | null, item: ExplorerItem) {
    if (item.type !== 'folder' || !project) return;
    if (targetFolderId === item.id || isDescendantFolder(folders, item.id, targetFolderId)) {
      setError('A folder cannot be moved into itself or one of its descendants.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await batchApply([{
        op: 'move',
        resource_kind: 'ontology_folder',
        resource_id: item.id,
        target_folder_id: targetFolderId,
      }]);
      const failed = response.results.find((entry) => !entry.ok);
      if (failed) {
        setError(failed.error ?? 'Move failed during preflight.');
        return;
      }
      await refreshAfterMutation();
      if (item.id === folderRouteID && targetFolderId) navigate(folderPathByID(targetFolderId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Move failed');
    } finally {
      setBusy(false);
    }
  }

  function handleRowAction(item: ExplorerItem, action: string) {
    if (!project) return;
    if (action === 'open') {
      if (item.type === 'folder') navigate(folderStablePath(project, item.folder));
      else setDetailsResource(resourceSummary(item));
    } else if (action === 'details') {
      setDetailsResource(resourceSummary(item));
    } else if (action === 'share') {
      setShareTarget({ kind: item.shareKind, id: item.id, label: item.name });
    } else if (action === 'move') {
      setMoveTarget(item);
    } else if (action === 'rename' && item.type === 'folder') {
      setRenameTarget(item);
    } else if (action === 'duplicate' && item.type === 'folder') {
      void duplicateItem(item);
    } else if (action === 'delete') {
      setDeleteTarget(item);
    }
  }

  function handleBulkAction(action: string) {
    if (action === 'move') setBulkMoveOpen(true);
    else if (action === 'share') setBulkShareOpen(true);
    else if (action === 'duplicate') void duplicateSelected();
    else if (action === 'delete') setBulkDeleteOpen(true);
  }

  const bulkActions: BulkAction[] = [
    { id: 'move', label: 'Move', disabled: !selectedFoldersOnly },
    { id: 'share', label: 'Share' },
    { id: 'duplicate', label: 'Duplicate', disabled: !selectedFoldersOnly },
    { id: 'delete', label: 'Move to trash', danger: true },
  ];

  if (loading) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Projects</Link>
        <p className="of-text-muted" style={{ marginTop: 12 }}>Loading...</p>
      </section>
    );
  }

  if (!project) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Projects</Link>
        <p className="of-status-danger" style={{ marginTop: 12 }}>{error || 'Project not found'}</p>
      </section>
    );
  }

  if (!folder) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <Link to={projectStablePath(project)} style={{ color: 'var(--text-muted)', fontSize: 13 }}>{project.display_name || project.slug}</Link>
        <p className="of-status-danger" style={{ marginTop: 12 }}>Folder {folderRouteID} not found in this project.</p>
      </section>
    );
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <ProjectBreadcrumb
        items={breadcrumbItems}
        onNavigate={(item) => {
          if (item.href) navigate(item.href);
        }}
      />

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="of-heading-xl">{folder.name}</h1>
          <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
            {folder.rid} - slug: {folder.slug} - parent: {folder.parent_folder_rid || 'project'}
            {folder.description && ` - ${folder.description}`}
          </p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <button
            type="button"
            className="of-button of-button--success"
            onClick={() => setShowCreateMenu(true)}
          >
            <Glyph name="plus" size={13} />
            New
            <Glyph name="chevron-down" size={11} />
          </button>
          <OpenWithMenu
            resourceKind="ontology_folder"
            resourceId={folder.id}
            resourceRid={folder.rid}
            projectId={project.id}
            projectRid={folder.project_rid}
          />
          <button type="button" onClick={() => setDetailsResource(resourceSummary({
            key: `folder:${folder.id}`,
            type: 'folder',
            id: folder.id,
            name: folder.name,
            description: folder.description || null,
            kind: 'ontology_folder',
            operationKind: 'ontology_folder',
            shareKind: 'ontology_folder',
            createdAt: folder.created_at,
            updatedAt: folder.updated_at,
            ownerId: folder.created_by,
            folder,
          }))} className="of-button">
            Details
          </button>
        </div>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <BulkActionsToolbar
        count={selectedItems.length}
        actions={bulkActions}
        onAction={handleBulkAction}
        onClear={clearSelection}
        busy={busy}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <aside className="of-panel" style={{ padding: 16, position: 'sticky', top: 16 }}>
          <p className="of-eyebrow">Folders</p>
          <div style={{ marginTop: 10 }}>
            <FolderTree
              folders={folders}
              selectedId={folder.id}
              rootLabel={project.display_name || project.slug}
              onSelect={(id) => navigate(id ? folderPathByID(id) : projectStablePath(project))}
              canDrop={(id) => selectedItems.length === 1 && selectedItems[0].type === 'folder' && !isDescendantFolder(folders, selectedItems[0].id, id)}
              onDrop={(id) => {
                if (selectedItems.length === 1) void moveFolderByTree(id, selectedItems[0]);
              }}
            />
          </div>
        </aside>

        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <section className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', border: '1px solid var(--border-default)', borderRadius: 4, background: '#fff', minHeight: 32 }}>
                <Glyph name="search" size={14} tone="#8a96a6" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search files…"
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', minHeight: 28 }}
                />
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5c7080' }}>
                File type
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as ResourceKind | 'all')}
                  className="of-input"
                  style={{ minHeight: 30, fontSize: 12, paddingRight: 22 }}
                >
                  <option value="all">All</option>
                  <option value="ontology_folder">Folder</option>
                  {RESOURCE_KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>{RESOURCE_KIND_LABELS[kind]}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void load()} disabled={busy} className="of-button" style={{ fontSize: 12 }}>
                Refresh
              </button>
            </div>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <p className="of-text-muted" style={{ fontSize: 12, margin: 0 }}>
                {childFolders.length} folder(s) · {resources.length} bound resource(s)
                {(search || kindFilter !== 'all') && ` · ${filteredItems.length} match${filteredItems.length === 1 ? '' : 'es'}`}
              </p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 840, fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' }}>
                    <th style={{ padding: '10px 12px', width: 38 }}>
                      <input
                        type="checkbox"
                        aria-label="Select all visible items"
                        checked={filteredItems.length > 0 && filteredItems.every((item) => selectedKeys.has(item.key))}
                        onChange={(e) => setSelectedKeys(
                          e.target.checked
                            ? new Set(filteredItems.map((item) => item.key))
                            : new Set(),
                        )}
                      />
                    </th>
                    <th style={{ padding: '10px 12px' }}>Name</th>
                    <th style={{ padding: '10px 12px' }}>Kind</th>
                    <th style={{ padding: '10px 12px' }}>Owner</th>
                    <th style={{ padding: '10px 12px' }}>Updated</th>
                    <th style={{ padding: '10px 12px', width: 58 }} />
                    <th style={{ padding: '10px 12px', width: 52 }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr
                      key={item.key}
                      draggable={item.type === 'folder'}
                      onDragStart={() => {
                        clearSelection();
                        setSelected(item.key, true);
                      }}
                      onDoubleClick={() => handleRowAction(item, 'open')}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.name}`}
                          checked={selectedKeys.has(item.key)}
                          onChange={(e) => setSelected(item.key, e.target.checked)}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          type="button"
                          onClick={() => handleRowAction(item, 'open')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: 0, textAlign: 'left', color: '#1c2127', cursor: 'pointer', fontWeight: 600 }}
                        >
                          <Glyph
                            name={item.type === 'folder' ? 'folder' : 'document'}
                            size={16}
                            tone={item.type === 'folder' ? '#cf923f' : '#5c7080'}
                          />
                          <span style={{ color: '#1f6fd1' }}>{item.name}</span>
                        </button>
                        {item.description && <p className="of-text-muted" style={{ margin: '3px 0 0 24px', fontSize: 11 }}>{item.description}</p>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{item.type === 'folder' ? 'folder' : item.binding.resource_kind}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{shortId(item.ownerId)}</td>
                      <td style={{ padding: '10px 12px' }}>{formatDate(item.updatedAt ?? item.createdAt)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <OpenWithMenu
                          compact
                          resourceKind={item.shareKind}
                          resourceId={item.id}
                          resourceRid={item.type === 'folder' ? item.folder.rid : resourceRIDForKind(item.shareKind, item.id)}
                          projectId={project.id}
                          projectRid={item.type === 'folder' ? item.folder.project_rid : resourceRIDForKind('ontology_project', project.id)}
                          onOpen={() => {
                            if (item.type !== 'folder') recordAccess({ resource_kind: item.shareKind, resource_id: item.id }).catch(() => {});
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <RowActionsMenu
                          actions={[
                            { id: 'open', label: item.type === 'folder' ? 'Open folder' : 'Open details' },
                            { id: 'details', label: 'Details' },
                            { id: 'share', label: 'Share', icon: 'share' },
                            { id: 'move', label: 'Move', icon: 'move' },
                            { id: 'rename', label: 'Rename', icon: 'pencil', disabled: item.type !== 'folder' },
                            { id: 'duplicate', label: 'Duplicate', icon: 'duplicate', disabled: item.type !== 'folder' },
                            { id: 'delete', label: item.type === 'folder' ? 'Move to trash' : 'Remove binding', icon: 'delete', danger: true },
                          ]}
                          onSelect={(action) => handleRowAction(item, action)}
                        />
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '48px 24px', textAlign: 'center' }}>
                          <Glyph name="folder-open" size={48} tone="#cf923f" />
                          <div style={{ fontSize: 14, color: '#5c7080' }}>
                            {items.length === 0 ? 'This folder is empty.' : 'No items match the current filters.'}
                          </div>
                          {items.length === 0 && (
                            <button
                              type="button"
                              className="of-button of-button--success"
                              onClick={() => setShowCreateMenu(true)}
                            >
                              <Glyph name="plus" size={13} />
                              New
                              <Glyph name="chevron-down" size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <ResourcePickerDialog
        open={showCreateMenu}
        onClose={() => setShowCreateMenu(false)}
        onPick={handleResourcePick}
      />

      <UploadFilesDialog
        open={uploadOpen}
        projectId={project?.id ?? null}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void refreshAfterMutation()}
      />

      {createMode === 'folder' && (
        <FolderModalDialog
          title="New folder"
          busy={busy}
          submitLabel={busy ? 'Creating…' : 'Create folder'}
          submitDisabled={busy || !folderName.trim()}
          onCancel={() => !busy && setCreateMode(null)}
          onSubmit={() => void createFolderSubmit()}
        >
          <label style={{ fontSize: 12 }}>
            Name
            <input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="of-input"
              autoFocus
              style={{ marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            Description
            <input
              value={folderDescription}
              onChange={(e) => setFolderDescription(e.target.value)}
              className="of-input"
              style={{ marginTop: 4 }}
            />
          </label>
        </FolderModalDialog>
      )}

      {createMode === 'binding' && (
        <FolderModalDialog
          title="Bind resource"
          busy={busy}
          submitLabel={busy ? 'Saving…' : 'Bind'}
          submitDisabled={busy || !bindId.trim()}
          onCancel={() => !busy && setCreateMode(null)}
          onSubmit={() => void bindSubmit()}
        >
          <label style={{ fontSize: 12 }}>
            Resource kind
            <select
              value={bindKind}
              onChange={(e) => setBindKind(e.target.value as ResourceKind)}
              className="of-input"
              style={{ marginTop: 4 }}
            >
              {RESOURCE_KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>{RESOURCE_KIND_LABELS[kind]}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            Resource id
            <input
              value={bindId}
              onChange={(e) => setBindId(e.target.value)}
              placeholder="dataset RID, pipeline id, …"
              className="of-input"
              autoFocus
              style={{ marginTop: 4 }}
            />
          </label>
        </FolderModalDialog>
      )}

      <ResourceDetailsPanel
        open={!!detailsResource}
        resource={detailsResource}
        onClose={() => setDetailsResource(null)}
      />

      <ShareDialog
        open={!!shareTarget}
        resourceKind={shareTarget?.kind ?? null}
        resourceId={shareTarget?.id ?? null}
        resourceLabel={shareTarget?.label}
        onClose={() => setShareTarget(null)}
      />

      <ShareDialog
        open={bulkShareOpen}
        resourceKind={null}
        resourceId={null}
        targets={selectedItems.map((item) => ({ kind: item.shareKind, id: item.id, label: item.name }))}
        onClose={() => setBulkShareOpen(false)}
        onShared={() => {
          setBulkShareOpen(false);
          clearSelection();
        }}
      />

      <RenameDialog
        open={!!renameTarget}
        resourceKind={renameTarget?.operationKind ?? null}
        resourceId={renameTarget?.id ?? null}
        currentName={renameTarget?.name ?? ''}
        onClose={() => setRenameTarget(null)}
        onRenamed={() => void refreshAfterMutation()}
      />

      <MoveDialog
        open={!!moveTarget}
        resourceKind={moveTarget?.operationKind ?? null}
        resourceId={moveTarget?.id ?? null}
        resourceLabel={moveTarget?.name}
        projects={moveDialogProjects(moveTarget)}
        initialProjectId={project.id}
        canSelectFolder={(targetFolderId) => canMoveItemToFolder(moveTarget, targetFolderId)}
        onClose={() => setMoveTarget(null)}
        onMoved={() => void refreshAfterMutation()}
      />

      <MoveDialog
        open={bulkMoveOpen}
        resourceKind={null}
        resourceId={null}
        projects={[project]}
        initialProjectId={project.id}
        targets={selectedItems.map((item) => ({ kind: item.operationKind, id: item.id, label: item.name }))}
        canSelectFolder={canMoveSelectedToFolder}
        onClose={() => setBulkMoveOpen(false)}
        onMoved={() => {
          setBulkMoveOpen(false);
          void refreshAfterMutation();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.type === 'folder' ? 'Move folder to trash' : 'Remove resource binding'}
        message={deleteTarget ? `${deleteTarget.name} will be removed from this folder view.${deleteReferenceWarning}` : ''}
        confirmLabel={deleteTarget?.type === 'folder' ? 'Move to trash' : 'Remove'}
        danger
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void deleteOne(deleteTarget);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Move selected items to trash"
        message={`${selectedItems.length} selected item(s) will be removed.${deleteReferenceWarning}`}
        confirmLabel="Move to trash"
        danger
        busy={busy}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => void deleteSelected()}
      />
    </section>
  );
}

function FolderModalDialog({
  title,
  children,
  busy,
  submitLabel,
  submitDisabled,
  onCancel,
  onSubmit,
}: {
  title: string;
  children: React.ReactNode;
  busy: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: '#fff',
        color: '#1c2127',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        boxShadow: '0 20px 50px rgba(15,23,42,0.4)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-default)',
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: busy ? 'not-allowed' : 'pointer',
              color: '#5c7080',
            }}
            aria-label="Close"
          >
            <Glyph name="x" size={14} />
          </button>
        </div>
        <div style={{ display: 'grid', gap: 10, padding: 16 }}>{children}</div>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          borderTop: '1px solid var(--border-default)',
          padding: '12px 16px',
        }}>
          <button type="button" onClick={onCancel} disabled={busy} className="of-button">Cancel</button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className="of-button of-button--primary"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
