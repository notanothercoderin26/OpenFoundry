// Foundry's "Related artifacts" sidebar lists resources that are DIRECTLY
// linked to the selected nodes — Workshop apps, Slate dashboards, Contour
// visualizations, etc. We derive the same view from the in-memory lineage
// graph: direct neighbors of the selection whose `kind` is not one of the
// core lineage kinds (dataset / pipeline / transform / build / schedule /
// workflow). New artifact kinds added to the backend are picked up
// automatically by this allow-all-but-core rule.

import type { LineageEdge, LineageNode } from '@/lib/api/pipelines';

export const CORE_LINEAGE_KINDS = new Set([
  'dataset',
  'pipeline',
  'transform',
  'build',
  'schedule',
  'workflow',
]);

export interface RelatedArtifact {
  id: string;
  label: string;
  kind: string;
  path: string;
  createdAt: string | null;
  lastModifiedAt: string | null;
  isAutosaved: boolean;
  isTrashed: boolean;
  /** Selected node this artifact is directly linked to. */
  parentNodeId: string;
  /** 'downstream' (selected → artifact) or 'upstream' (artifact → selected). */
  direction: 'downstream' | 'upstream';
}

export type RelatedArtifactSort =
  | 'newest'
  | 'oldest'
  | 'name'
  | 'path'
  | 'last_modified';

interface CollectOptions {
  nodes: LineageNode[];
  edges: LineageEdge[];
  selectedNodeIds: string[];
  /** Allowed kinds; null/undefined means "all non-core kinds". */
  allowedKinds?: ReadonlySet<string> | null;
  includeAutosaved?: boolean;
  includeTrash?: boolean;
}

function firstMetaString(metadata: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function metaBool(metadata: Record<string, unknown>, keys: readonly string[]): boolean {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && /^(1|true|yes|trashed)$/i.test(value)) return true;
  }
  return false;
}

export function collectRelatedArtifacts({
  nodes,
  edges,
  selectedNodeIds,
  allowedKinds,
  includeAutosaved = false,
  includeTrash = false,
}: CollectOptions): RelatedArtifact[] {
  if (selectedNodeIds.length === 0) return [];
  const selectedSet = new Set(selectedNodeIds);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // Direct neighbors of selected nodes, classified as upstream/downstream.
  // Multiple selected nodes pointing to the same artifact only appear once
  // (the first parent encountered wins for the parentNodeId attribution).
  const seen = new Map<string, { parentNodeId: string; direction: 'downstream' | 'upstream' }>();
  for (const edge of edges) {
    if (selectedSet.has(edge.source) && !selectedSet.has(edge.target)) {
      if (!seen.has(edge.target)) {
        seen.set(edge.target, { parentNodeId: edge.source, direction: 'downstream' });
      }
    }
    if (selectedSet.has(edge.target) && !selectedSet.has(edge.source)) {
      if (!seen.has(edge.source)) {
        seen.set(edge.source, { parentNodeId: edge.target, direction: 'upstream' });
      }
    }
  }

  const out: RelatedArtifact[] = [];
  for (const [id, { parentNodeId, direction }] of seen) {
    const node = nodeById.get(id);
    if (!node) continue;
    if (CORE_LINEAGE_KINDS.has(node.kind)) continue;
    if (allowedKinds && !allowedKinds.has(node.kind)) continue;
    const meta = node.metadata ?? {};
    const isAutosaved = metaBool(meta, ['autosaved', 'is_autosaved', 'auto_saved']);
    const isTrashed = metaBool(meta, ['is_trashed', 'trashed', 'is_deleted']) || Boolean(meta['deleted_at']);
    if (isAutosaved && !includeAutosaved) continue;
    if (isTrashed && !includeTrash) continue;
    out.push({
      id: node.id,
      label: node.label,
      kind: node.kind,
      path: firstMetaString(meta, ['path', 'folder_path', 'parent_path', 'rid']) ?? '',
      createdAt: firstMetaString(meta, ['created_at', 'first_seen_at']),
      lastModifiedAt: firstMetaString(meta, ['last_modified_at', 'updated_at', 'last_built_at']),
      isAutosaved,
      isTrashed,
      parentNodeId,
      direction,
    });
  }
  return out;
}

function timestampCompare(a: string | null, b: string | null, descending: boolean): number {
  // Items with no timestamp always sort to the END regardless of direction;
  // otherwise an "oldest first" sort puts the empties at the top, which is
  // the opposite of what the user wants.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return descending ? b.localeCompare(a) : a.localeCompare(b);
}

export function sortRelatedArtifacts(items: RelatedArtifact[], sort: RelatedArtifactSort): RelatedArtifact[] {
  const sorted = [...items];
  switch (sort) {
    case 'newest':
      sorted.sort((a, b) => timestampCompare(a.createdAt, b.createdAt, true) || a.label.localeCompare(b.label));
      break;
    case 'oldest':
      sorted.sort((a, b) => timestampCompare(a.createdAt, b.createdAt, false) || a.label.localeCompare(b.label));
      break;
    case 'name':
      sorted.sort((a, b) => a.label.localeCompare(b.label));
      break;
    case 'path':
      sorted.sort((a, b) => a.path.localeCompare(b.path) || a.label.localeCompare(b.label));
      break;
    case 'last_modified':
      sorted.sort(
        (a, b) => timestampCompare(a.lastModifiedAt, b.lastModifiedAt, true) || a.label.localeCompare(b.label),
      );
      break;
  }
  return sorted;
}

export function distinctRelatedKinds(items: RelatedArtifact[]): string[] {
  const set = new Set<string>();
  for (const item of items) set.add(item.kind);
  return [...set].sort();
}
