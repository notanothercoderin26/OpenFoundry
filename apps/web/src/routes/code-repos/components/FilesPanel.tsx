import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  listRepositoryTemplates,
  type RepositoryFile,
  type RepositoryTemplateDefinition,
} from '@/lib/api/code-repos';
import { Glyph } from '@/lib/components/ui/Glyph';
import { Popover } from '@/lib/components/ui/Popover';
import { notifications } from '@stores/notifications';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { openFiles } from '../state/useOpenFiles';

interface TreeNode {
  path: string;
  name: string;
  depth: number;
  kind: 'file' | 'folder';
  file?: RepositoryFile;
  children?: TreeNode[];
}

function buildTree(files: ReadonlyArray<RepositoryFile>): TreeNode[] {
  const root: TreeNode = { path: '', name: '', depth: -1, kind: 'folder', children: [] };

  for (const file of files) {
    const parts = file.path.split('/');
    let parent = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const folderPath = parts.slice(0, i + 1).join('/');
      const children = parent.children ?? [];
      let folder = children.find((entry) => entry.path === folderPath && entry.kind === 'folder');
      if (!folder) {
        folder = { path: folderPath, name: parts[i], depth: i, kind: 'folder', children: [] };
        children.push(folder);
        parent.children = children;
      }
      parent = folder;
    }
    const parentChildren = parent.children ?? [];
    parentChildren.push({
      path: file.path,
      name: parts[parts.length - 1],
      depth: parts.length - 1,
      kind: 'file',
      file,
    });
    parent.children = parentChildren;
  }

  function sort(node: TreeNode) {
    if (!node.children) return;
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sort);
  }
  sort(root);

  return root.children ?? [];
}

function collectFolderPaths(nodes: ReadonlyArray<TreeNode>, into = new Set<string>()) {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      into.add(node.path);
      if (node.children) collectFolderPaths(node.children, into);
    }
  }
  return into;
}

function filterTreeByName(nodes: ReadonlyArray<TreeNode>, needle: string): TreeNode[] {
  if (!needle) return nodes as TreeNode[];
  const lower = needle.toLowerCase();
  function walk(node: TreeNode): TreeNode | null {
    if (node.kind === 'file') {
      return node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)
        ? node
        : null;
    }
    const children = (node.children ?? [])
      .map(walk)
      .filter((entry): entry is TreeNode => entry !== null);
    if (children.length === 0 && !node.name.toLowerCase().includes(lower)) return null;
    return { ...node, children };
  }
  return nodes.map(walk).filter((entry): entry is TreeNode => entry !== null);
}

/**
 * Foundry-style file tree panel. Renders a hierarchical, expandable tree
 * over the repo's files; clicking a file opens it (and registers a tab in
 * useOpenFiles for the upcoming multi-tab editor); double-clicking pins
 * the tab. Right-click — or the inline ⋯ trigger — surfaces Rename / Move
 * / Delete / Copy path, routed through mutateFile via fileTreeAction.
 *
 * The header buttons cover the IDE conventions:
 *   ⚙️  Tree settings  (placeholder until F5 ships per-user preferences)
 *   ➕  Create new file / folder / sub-project (templates list)
 */
export function FilesPanel() {
  const { selectedFile } = useRepoIdentity();
  const { files, pendingFileChanges, selectFile, fileTreeAction } = useRepoState();

  const [filter, setFilter] = useState('');
  const tree = useMemo(() => buildTree(files), [files]);
  const visibleTree = useMemo(() => filterTreeByName(tree, filter.trim()), [tree, filter]);

  const [expanded, setExpanded] = useState<Set<string>>(() => collectFolderPaths(tree));
  // Whenever a new folder appears (e.g. after creating a file), expand it.
  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      collectFolderPaths(tree).forEach((path) => next.add(path));
      return next;
    });
  }, [tree]);

  const dirtyPaths = useMemo(() => {
    const set = new Set<string>();
    for (const change of pendingFileChanges) {
      if (change.path) set.add(change.path);
      if (change.new_path) set.add(change.new_path);
    }
    return set;
  }, [pendingFileChanges]);

  const newButtonRef = useRef<HTMLButtonElement | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  function toggleFolder(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function openFile(file: RepositoryFile, pin = false) {
    selectFile(file.path);
    openFiles.open(file.path, file.language, pin);
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      notifications.success(`Copied ${path}`);
    } catch {
      notifications.error('Unable to copy path');
    }
  }

  async function newFile() {
    setNewMenuOpen(false);
    const nextPath = window.prompt('New file path', 'src/new_file.py');
    if (!nextPath) return;
    await fileTreeAction('new', nextPath, nextPath, '');
    selectFile(nextPath);
  }

  async function newFolder() {
    setNewMenuOpen(false);
    const folderPath = window.prompt('New folder path', 'src/new_folder');
    if (!folderPath) return;
    const placeholder = `${folderPath.replace(/\/$/, '')}/.gitkeep`;
    await fileTreeAction('new', placeholder, placeholder, '');
  }

  function openTemplatePicker() {
    setNewMenuOpen(false);
    setTemplatePickerOpen(true);
  }

  return (
    <aside
      aria-label="Files panel"
      data-tour="files-panel"
      className="flex flex-col w-64 shrink-0 border-r border-of-border bg-of-surface"
    >
      <header className="flex items-center h-9 px-2 border-b border-of-border bg-of-surface-raised">
        <span className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
          Files
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="Tree settings (coming in Phase 5)"
            onClick={() => notifications.info('Per-user tree settings ship in Phase 5')}
            className="inline-flex items-center justify-center w-6 h-6 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          >
            <Glyph name="settings" size={12} tone="currentColor" />
          </button>
          <button
            ref={newButtonRef}
            type="button"
            title="Create"
            aria-haspopup="menu"
            aria-expanded={newMenuOpen}
            onClick={() => setNewMenuOpen((v) => !v)}
            className="inline-flex items-center justify-center w-6 h-6 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
          >
            <Glyph name="plus" size={12} tone="currentColor" />
          </button>
        </div>
      </header>

      <div className="p-2">
        <div className="relative">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search file names…"
            className="w-full h-7 pl-7 pr-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-of-text-soft">
            <Glyph name="search" size={12} tone="currentColor" />
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto pb-2">
        {visibleTree.length === 0 ? (
          <p className="px-3 py-2 text-of-12 text-of-text-soft">
            {filter ? 'No files match.' : 'No files yet — create one with the + button.'}
          </p>
        ) : (
          <ul role="tree" className="select-none">
            {visibleTree.map((node) => (
              <TreeRow
                key={`${node.kind}:${node.path}`}
                node={node}
                expanded={expanded}
                onToggleFolder={toggleFolder}
                activePath={selectedFile?.path ?? ''}
                dirtyPaths={dirtyPaths}
                onOpenFile={openFile}
                onAction={async (action, path, nextPath) => {
                  if (action === 'copy-path') {
                    await copyPath(path);
                    return;
                  }
                  if (action === 'rename' || action === 'move') {
                    const target = window.prompt(action === 'rename' ? 'Rename to' : 'Move to', nextPath ?? path);
                    if (!target || target === path) return;
                    await fileTreeAction(action, path, target);
                    selectFile(target);
                    return;
                  }
                  if (action === 'delete') {
                    if (!window.confirm(`Delete ${path}?`)) return;
                    await fileTreeAction('delete', path);
                    return;
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <Popover
        open={newMenuOpen}
        anchorRef={newButtonRef}
        onClose={() => setNewMenuOpen(false)}
        placement="bottom"
        align="end"
        width={220}
        showArrow={false}
        ariaLabel="Create"
      >
        <ul role="menu" className="py-1">
          <NewMenuItem glyph="document" label="New file" onClick={() => void newFile()} />
          <NewMenuItem glyph="folder" label="New folder" onClick={() => void newFolder()} />
          <NewMenuItem
            glyph="project"
            label="New sub-project…"
            onClick={openTemplatePicker}
          />
        </ul>
      </Popover>

      {templatePickerOpen ? (
        <TemplatePickerDialog
          onClose={() => setTemplatePickerOpen(false)}
          onPicked={(template) => {
            notifications.info(
              `Sub-project from "${template.name}" — backend ships in Phase 5 (see master plan §10).`,
            );
            setTemplatePickerOpen(false);
          }}
        />
      ) : null}
    </aside>
  );
}

interface NewMenuItemProps {
  glyph: 'document' | 'folder' | 'project';
  label: string;
  onClick: () => void;
}

function NewMenuItem({ glyph, label, onClick }: NewMenuItemProps) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-of-13 text-of-text hover:bg-of-surface-muted"
      >
        <Glyph name={glyph} size={14} tone="currentColor" />
        {label}
      </button>
    </li>
  );
}

interface TreeRowProps {
  node: TreeNode;
  expanded: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
  activePath: string;
  dirtyPaths: ReadonlySet<string>;
  onOpenFile: (file: RepositoryFile, pin?: boolean) => void;
  onAction: (
    action: 'rename' | 'move' | 'delete' | 'copy-path',
    path: string,
    nextPath?: string,
  ) => Promise<void>;
}

function TreeRow({
  node,
  expanded,
  onToggleFolder,
  activePath,
  dirtyPaths,
  onOpenFile,
  onAction,
}: TreeRowProps) {
  if (node.kind === 'folder') {
    const open = expanded.has(node.path);
    return (
      <li role="treeitem" aria-expanded={open}>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          className="flex items-center gap-1 w-full pr-2 py-1 text-of-13 text-of-text hover:bg-of-surface-muted"
          style={{ paddingLeft: 8 + node.depth * 12 }}
        >
          <Glyph
            name={open ? 'chevron-down' : 'chevron-right'}
            size={10}
            tone="muted"
          />
          <Glyph name={open ? 'folder-open' : 'folder'} size={13} tone="muted" />
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children ? (
          <ul role="group">
            {node.children.map((child) => (
              <TreeRow
                key={`${child.kind}:${child.path}`}
                node={child}
                expanded={expanded}
                onToggleFolder={onToggleFolder}
                activePath={activePath}
                dirtyPaths={dirtyPaths}
                onOpenFile={onOpenFile}
                onAction={onAction}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const active = node.path === activePath;
  const dirty = dirtyPaths.has(node.path);

  return (
    <li role="treeitem">
      <FileRow
        node={node}
        active={active}
        dirty={dirty}
        onOpenFile={onOpenFile}
        onAction={onAction}
      />
    </li>
  );
}

interface FileRowProps {
  node: TreeNode;
  active: boolean;
  dirty: boolean;
  onOpenFile: (file: RepositoryFile, pin?: boolean) => void;
  onAction: (
    action: 'rename' | 'move' | 'delete' | 'copy-path',
    path: string,
    nextPath?: string,
  ) => Promise<void>;
}

function FileRow({ node, active, dirty, onOpenFile, onAction }: FileRowProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [contextOpen, setContextOpen] = useState(false);

  if (!node.file) return null;
  const file = node.file;

  return (
    <div
      className={`group relative flex items-center gap-1 pr-1 py-1 cursor-pointer text-of-13 ${
        active ? 'bg-of-accent-soft text-of-accent font-of-semibold' : 'text-of-text hover:bg-of-surface-muted'
      }`}
      style={{ paddingLeft: 8 + node.depth * 12 }}
      onClick={() => onOpenFile(file)}
      onDoubleClick={() => onOpenFile(file, true)}
      onContextMenu={(event) => {
        event.preventDefault();
        setContextOpen(true);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenFile(file);
        }
      }}
    >
      <span className="w-3" aria-hidden />
      <Glyph name="document" size={13} tone="muted" />
      <span className="flex-1 min-w-0 truncate font-mono">{node.name}</span>
      {dirty ? (
        <span
          aria-label="Unsaved changes"
          title="Unsaved changes"
          className="w-2 h-2 rounded-full bg-of-accent"
        />
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${node.path}`}
        onClick={(event) => {
          event.stopPropagation();
          setContextOpen(true);
        }}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-of-sm text-of-text-muted hover:bg-of-surface-raised hover:text-of-text ${
          contextOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <Glyph name="menu" size={12} tone="currentColor" />
      </button>
      <Popover
        open={contextOpen}
        anchorRef={triggerRef}
        onClose={() => setContextOpen(false)}
        placement="bottom"
        align="end"
        width={200}
        showArrow={false}
        ariaLabel={`Actions for ${node.name}`}
      >
        <ul role="menu" className="py-1">
          <ContextItem
            label="Rename…"
            glyph="pencil"
            onClick={() => {
              setContextOpen(false);
              void onAction('rename', node.path);
            }}
          />
          <ContextItem
            label="Move…"
            glyph="move"
            onClick={() => {
              setContextOpen(false);
              void onAction('move', node.path, node.path);
            }}
          />
          <ContextItem
            label="Copy path"
            glyph="duplicate"
            onClick={() => {
              setContextOpen(false);
              void onAction('copy-path', node.path);
            }}
          />
          <ContextItem
            label="Delete"
            glyph="trash"
            danger
            onClick={() => {
              setContextOpen(false);
              void onAction('delete', node.path);
            }}
          />
        </ul>
      </Popover>
    </div>
  );
}

interface ContextItemProps {
  label: string;
  glyph: 'pencil' | 'move' | 'duplicate' | 'trash';
  danger?: boolean;
  onClick: () => void;
}

function ContextItem({ label, glyph, danger, onClick }: ContextItemProps) {
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-of-13 ${
          danger ? 'text-of-danger hover:bg-of-danger-soft' : 'text-of-text hover:bg-of-surface-muted'
        }`}
      >
        <Glyph name={glyph} size={13} tone="currentColor" />
        {label}
      </button>
    </li>
  );
}

interface TemplatePickerDialogProps {
  onClose: () => void;
  onPicked: (template: RepositoryTemplateDefinition) => void;
}

function TemplatePickerDialog({ onClose, onPicked }: TemplatePickerDialogProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['code-repos', 'templates'],
    queryFn: () => listRepositoryTemplates().then((response) => response.items),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pick a sub-project template"
        className="relative w-full max-w-xl mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold">New sub-project</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>
        <div className="p-4 max-h-[60vh] overflow-auto">
          {isLoading ? (
            <p className="text-of-13 text-of-text-muted">Loading templates…</p>
          ) : error ? (
            <p className="text-of-13 text-of-danger">{error instanceof Error ? error.message : 'Unable to load templates.'}</p>
          ) : (data ?? []).length === 0 ? (
            <p className="text-of-13 text-of-text-muted">No templates available.</p>
          ) : (
            <ul className="grid gap-2">
              {(data ?? []).map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => onPicked(template)}
                    className="w-full text-left p-3 rounded-of-sm border border-of-border bg-of-surface hover:border-of-accent hover:bg-of-accent-soft"
                  >
                    <p className="text-of-13 font-of-semibold text-of-text">{template.name}</p>
                    <p className="mt-1 text-of-12 text-of-text-muted">{template.description}</p>
                    <p className="mt-2 text-of-12 text-of-text-soft font-mono">
                      {template.language_template} · {template.package_kind}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
