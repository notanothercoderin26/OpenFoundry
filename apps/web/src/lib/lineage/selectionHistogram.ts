// Foundry's "Histogram of selection properties" derives several frequency
// tables from the metadata of the multi-selected lineage nodes. We compute
// the same sections client-side from the in-memory graph, plus an optional
// per-dataset schema map for the "Frequent columns" section.

import type { DatasetSchema, DatasetSchemaResponse } from '@/lib/api/datasets';
import type { LineageNode } from '@/lib/api/pipelines';

export type SchemaLike = DatasetSchema | DatasetSchemaResponse;

export interface HistogramRow {
  value: string;
  count: number;
  nodeIds: string[];
}

export type HistogramSectionId =
  | 'resource_type'
  | 'branch'
  | 'created_by'
  | 'folder_path'
  | 'custom_groups'
  | 'time_created'
  | 'time_last_built'
  | 'frequent_columns';

export interface HistogramSection {
  id: HistogramSectionId;
  title: string;
  rows: HistogramRow[];
  /** Total nodes considered for this section (selected nodes that had data). */
  totalCount: number;
}

interface ComputeOptions {
  nodes: LineageNode[];
  selectedNodeIds: string[];
  schemaByDatasetId?: Record<string, SchemaLike | null | undefined>;
  /** Override current time for deterministic tests. */
  now?: Date;
}

const BRANCH_KEYS = ['active_branch', 'branch', 'build_branch'];
const CREATED_BY_KEYS = ['created_by', 'creator', 'owner', 'created_by_user_id', 'last_modified_by'];
const FOLDER_KEYS = ['folder_path', 'folder', 'parent_folder_rid', 'folder_rid', 'parent_path', 'path'];
const CUSTOM_GROUP_KEYS = ['custom_group', 'custom_groups', 'color_group', 'group', 'user_group'];
const CREATED_AT_KEYS = ['created_at', 'first_seen_at', 'first_built_at'];
const LAST_BUILT_AT_KEYS = ['last_built_at', 'last_build_at', 'updated_at', 'last_modified_at'];

function firstMetadataString(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }
  return undefined;
}

function timeBucket(iso: string | undefined, now: Date): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  const days = (now.getTime() - t) / (1000 * 60 * 60 * 24);
  if (days < 1) return 'Less than 1 day ago';
  if (days < 7) return 'Less than 7 days ago';
  if (days < 30) return 'Less than 30 days ago';
  return 'More than 30 days ago';
}

export function columnsFromSchema(schema: SchemaLike | null | undefined): string[] {
  if (!schema) return [];
  const raw = 'schema' in schema ? schema.schema?.fields : schema.fields;
  const names: string[] = [];
  if (Array.isArray(raw)) {
    for (const field of raw) {
      if (field && typeof field === 'object' && 'name' in field) {
        const name = (field as { name?: unknown }).name;
        if (typeof name === 'string' && name.length > 0) names.push(name);
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const key of Object.keys(raw as Record<string, unknown>)) names.push(key);
  }
  return names;
}

function tally(buckets: Map<string, Set<string>>): HistogramRow[] {
  return [...buckets.entries()]
    .map(([value, nodeIds]) => ({
      value,
      count: nodeIds.size,
      nodeIds: [...nodeIds],
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function computeSelectionHistogram({
  nodes,
  selectedNodeIds,
  schemaByDatasetId,
  now = new Date(),
}: ComputeOptions): HistogramSection[] {
  const selectedSet = new Set(selectedNodeIds);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selectedNodes = selectedNodeIds
    .map((id) => nodeById.get(id))
    .filter((node): node is LineageNode => Boolean(node));

  function bucketByMetadataString(keys: readonly string[]): Map<string, Set<string>> {
    const buckets = new Map<string, Set<string>>();
    for (const node of selectedNodes) {
      const value = firstMetadataString(node.metadata ?? {}, keys);
      if (!value) continue;
      let entry = buckets.get(value);
      if (!entry) {
        entry = new Set();
        buckets.set(value, entry);
      }
      entry.add(node.id);
    }
    return buckets;
  }

  // Resource type — always from node.kind.
  const resourceTypeBuckets = new Map<string, Set<string>>();
  for (const node of selectedNodes) {
    const value = node.kind || 'unknown';
    let entry = resourceTypeBuckets.get(value);
    if (!entry) {
      entry = new Set();
      resourceTypeBuckets.set(value, entry);
    }
    entry.add(node.id);
  }

  // Time buckets.
  const timeCreatedBuckets = new Map<string, Set<string>>();
  const timeLastBuiltBuckets = new Map<string, Set<string>>();
  for (const node of selectedNodes) {
    const meta = node.metadata ?? {};
    const createdAt = firstMetadataString(meta, CREATED_AT_KEYS);
    const lastBuiltAt = firstMetadataString(meta, LAST_BUILT_AT_KEYS);
    const createdBucket = timeBucket(createdAt, now);
    const builtBucket = timeBucket(lastBuiltAt, now);
    if (createdBucket) {
      let entry = timeCreatedBuckets.get(createdBucket);
      if (!entry) {
        entry = new Set();
        timeCreatedBuckets.set(createdBucket, entry);
      }
      entry.add(node.id);
    }
    if (builtBucket) {
      let entry = timeLastBuiltBuckets.get(builtBucket);
      if (!entry) {
        entry = new Set();
        timeLastBuiltBuckets.set(builtBucket, entry);
      }
      entry.add(node.id);
    }
  }

  // Frequent columns — only for datasets whose schema we already have.
  const columnBuckets = new Map<string, Set<string>>();
  if (schemaByDatasetId) {
    for (const node of selectedNodes) {
      if (node.kind !== 'dataset') continue;
      const schema = schemaByDatasetId[node.id];
      if (!schema) continue;
      const columns = columnsFromSchema(schema);
      for (const column of columns) {
        let entry = columnBuckets.get(column);
        if (!entry) {
          entry = new Set();
          columnBuckets.set(column, entry);
        }
        entry.add(node.id);
      }
    }
  }

  const sections: HistogramSection[] = [
    {
      id: 'resource_type',
      title: 'Resource type',
      rows: tally(resourceTypeBuckets),
      totalCount: selectedSet.size,
    },
    {
      id: 'branch',
      title: 'Branch',
      rows: tally(bucketByMetadataString(BRANCH_KEYS)),
      totalCount: selectedSet.size,
    },
    {
      id: 'created_by',
      title: 'Created by',
      rows: tally(bucketByMetadataString(CREATED_BY_KEYS)),
      totalCount: selectedSet.size,
    },
    {
      id: 'folder_path',
      title: 'Frequent folder paths',
      rows: tally(bucketByMetadataString(FOLDER_KEYS)),
      totalCount: selectedSet.size,
    },
    {
      id: 'custom_groups',
      title: 'Custom groups',
      rows: tally(bucketByMetadataString(CUSTOM_GROUP_KEYS)),
      totalCount: selectedSet.size,
    },
    {
      id: 'time_created',
      title: 'Time created',
      rows: tally(timeCreatedBuckets),
      totalCount: selectedSet.size,
    },
    {
      id: 'time_last_built',
      title: 'Time last built',
      rows: tally(timeLastBuiltBuckets),
      totalCount: selectedSet.size,
    },
    {
      id: 'frequent_columns',
      title: 'Frequent columns',
      rows: tally(columnBuckets),
      totalCount: selectedSet.size,
    },
  ];

  return sections;
}
