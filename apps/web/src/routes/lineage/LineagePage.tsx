import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { Core, ElementDefinition, EventObject, StylesheetStyle } from 'cytoscape';

import { CytoscapeCanvas } from '@components/CytoscapeCanvas';
import { MonacoEditor } from '@/lib/components/MonacoEditor';
import { ResourceHealthStatusBadge } from '@/lib/components/health/HealthReportsPanel';
import { ResourceHealthChecksPanel } from '@/lib/components/health/ResourceHealthChecksPanel';
import { BuildTimelinePanel } from '@/lib/components/lineage/BuildTimelinePanel';
import { HistogramPanel, type HistogramFilter } from '@/lib/components/lineage/HistogramPanel';
import { MediaSetPreview } from '@/lib/components/lineage/MediaSetPreview';
import { NodeBadgeOverlay, type NodeBadgeSpec, type NodeRelatedShortcut } from '@/lib/components/lineage/NodeBadgeOverlay';
import { NodeContextMenu, type NodeContextMenuItem } from '@/lib/components/lineage/NodeContextMenu';
import { NodePropertiesPanel, type RelatedObjectType } from '@/lib/components/lineage/NodePropertiesPanel';
import { RelatedItemsPanel } from '@/lib/components/lineage/RelatedItemsPanel';
import { ScheduleSidebar } from '@/lib/components/lineage/ScheduleSidebar';
import { ConfirmDialog } from '@/lib/components/ConfirmDialog';
import { listDatasetBuildsV1, listBuildsV1, type Build, type CreateBuildResponse } from '@/lib/api/buildsV1';
import { runBuildWithExpectationGates } from '@/lib/api/data-expectations';
import {
  deleteNodeDescription,
  getNodeDescription,
  upsertNodeDescription,
  type NodeDescription as PersistedNodeDescription,
} from '@/lib/api/lineage-node-descriptions';
import {
  createSavedLineageGraph,
  deleteSavedLineageGraph,
  getSharedLineageGraph,
  listSavedLineageGraphs,
  revokeSavedLineageGraphShare,
  shareSavedLineageGraph,
  type SavedLineageGraph,
} from '@/lib/api/lineage-saved-graphs';
import {
  forceSnapshotOnNextBuild,
  getDatasetHealth,
  getDatasetSchemaForBranch,
  loadJobSpecStatus,
  listDatasetTransactions,
  previewDataset,
  rollbackDatasetBranch,
  type DatasetTransaction,
  type DatasetHealthResponse,
  type DatasetPreviewResponse,
  type DatasetSchema,
  type DatasetSchemaResponse,
} from '@/lib/api/datasets';
import {
  getDatasetColumnLineage,
  getDatasetLineageImpact,
  getFullLineage,
  triggerLineageBuilds,
  type ColumnLineageEdge,
  type LineageBuildResult,
  type LineageGraph,
  type LineageImpactAnalysis,
  type LineageNode,
} from '@/lib/api/pipelines';
import { downloadCytoscapeSvg } from '@/lib/lineage/exportSvg';
import {
  commonAncestors,
  commonDescendants,
  expandFromSeeds,
  inBetweenNodes,
} from '@/lib/lineage/graphTraversal';
import {
  computeBuildTimeline,
  type BuildTimelineColorBy,
  type BuildTimelineRangeKey,
} from '@/lib/lineage/buildTimeline';
import {
  CORE_LINEAGE_KINDS,
  collectRelatedArtifacts,
  distinctRelatedKinds,
  sortRelatedArtifacts,
  type RelatedArtifact,
  type RelatedArtifactSort,
} from '@/lib/lineage/relatedArtifacts';
import {
  computeSelectionHistogram,
  type HistogramSection,
  type SchemaLike as HistogramSchemaLike,
} from '@/lib/lineage/selectionHistogram';
import {
  computePipelineRollbackPlan,
  downstreamDatasetIds,
  transactionTime,
  transactionType,
  type PipelineRollbackPlan,
  type PipelineRollbackTarget,
} from '@/lib/lineage/pipelineRollback';
import type { ResourceHealthCheckKind } from '@/lib/api/resource-health-checks';
import { listSchedules, type Schedule } from '@/lib/api/schedules';
import { notifications } from '@stores/notifications';

// =============================================================================
// Coloring schemes — Foundry Data Lineage exposes a broad set of built-in
// color axes. OpenFoundry derives these facts defensively from node metadata
// so the graph remains useful while individual services grow richer payloads.
// =============================================================================

type ColoringMode =
  | 'resource_type'
  | 'project'
  | 'folder'
  | 'repository'
  | 'build_status'
  | 'data_health'
  | 'out_of_date'
  | 'branch'
  | 'code_status'
  | 'storage'
  | 'compute'
  | 'transaction_type'
  | 'permissions'
  | 'custom_groups'
  | 'user_views'
  | 'issues'
  | 'marking';
type BottomTabId =
  | 'preview'
  | 'schema'
  | 'history'
  | 'jobs'
  | 'schedules'
  | 'health'
  | 'permissions'
  | 'code'
  | 'build_timeline';
type BuildHelperStrategy = 'all_ancestors' | 'between_selected' | 'selected_only';

type DatasetSchemaLike = DatasetSchema | DatasetSchemaResponse;

interface NodeDetailsState {
  schema: DatasetSchemaLike | null;
  builds: Build[];
  schedules: Schedule[];
  health: DatasetHealthResponse | null;
  loading: boolean;
  errors: string[];
}

const EMPTY_NODE_DETAILS: NodeDetailsState = {
  schema: null,
  builds: [],
  schedules: [],
  health: null,
  loading: false,
  errors: [],
};

interface BuildHelperTarget {
  node_id: string;
  label: string;
  dataset_rid: string;
  pipeline_rid: string;
  branch: string;
  fallback_branches: string[];
  force_build: boolean;
  distance: number;
  reason: string;
  transform_ids: string[];
  blocked_reason?: string;
}

interface BuildHelperPlan {
  strategy: BuildHelperStrategy;
  branch: string;
  fallback_branches: string[];
  force_build: boolean;
  selected_node_ids: string[];
  targets: BuildHelperTarget[];
  transform_ids: string[];
  warnings: string[];
}

interface BuildHelperRunResult {
  pipeline_rid: string;
  output_dataset_rids: string[];
  response?: CreateBuildResponse;
  error?: string;
}

interface PipelineRollbackRunResult {
  node_id: string;
  label: string;
  action: PipelineRollbackTarget['action'];
  status: 'succeeded' | 'skipped' | 'failed';
  message: string;
  transaction_rid?: string | null;
}

interface NodeColorContext {
  jobSpecMap: Record<string, boolean>;
  buildStatusByPipeline: Record<string, string>;
}

interface NodeColorCategory {
  key: string;
  label: string;
  value: string;
  color: string;
}

interface LegendEntry extends NodeColorCategory {
  count: number;
  hidden: boolean;
}

interface LineageSnapshotCamera {
  zoom: number;
  pan: { x: number; y: number };
}

interface LineageSnapshotGraphState {
  captured_at: string;
  node_count: number;
  edge_count: number;
  visible_node_count: number;
  visible_edge_count: number;
  node_ids: string[];
  edge_ids: string[];
  visible_node_ids: string[];
  visible_edge_ids: string[];
}

interface SavedLineageGraphSnapshot {
  id: string;
  name: string;
  saved_at: string;
  branch: string;
  coloring_mode: ColoringMode;
  legend_open: boolean;
  hidden_color_keys: string[];
  find_query: string;
  selected_node_ids: string[];
  expand_parents: number;
  expand_children: number;
  layout_by_color: boolean;
  group_by_color: boolean;
  layout_name: 'breadthfirst' | 'fcose';
  graph_state: LineageSnapshotGraphState | null;
  camera?: LineageSnapshotCamera;
  /** Set when the snapshot was minted server-side (UUID). Local-only
   *  snapshots use `lineage-snapshot-<timestamp>` instead. */
  backend_id?: string;
  /** Token returned by the backend when "Get quick share link" was used. */
  share_token?: string | null;
}

// Best-effort UUID detector so we know when a snapshot.id is backed
// by the lineage-service vs a localStorage-only timestamp ID.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isBackendSnapshotId(id: string): boolean {
  return UUID_RE.test(id);
}

// Conversion between the local snapshot shape and the SavedLineageGraph
// payload that travels through the backend. We round-trip the entire
// local object through `payload`; the top-level columns on the row
// (name/branch/coloring_mode) make list-views possible without
// scanning the blob.
function snapshotToBackendRequest(snapshot: SavedLineageGraphSnapshot) {
  return {
    name: snapshot.name,
    branch: snapshot.branch,
    coloring_mode: snapshot.coloring_mode,
    payload: snapshot as unknown as Record<string, unknown>,
  };
}

function backendRowToSnapshot(row: SavedLineageGraph | { id: string; payload: Record<string, unknown>; name: string; branch: string; coloring_mode: string; updated_at: string; share_token?: string | null }): SavedLineageGraphSnapshot {
  const payload = (row.payload ?? {}) as Partial<SavedLineageGraphSnapshot>;
  return {
    id: row.id,
    backend_id: row.id,
    share_token: row.share_token ?? null,
    name: payload.name ?? row.name,
    saved_at: payload.saved_at ?? row.updated_at,
    branch: payload.branch ?? row.branch,
    coloring_mode: (payload.coloring_mode ?? row.coloring_mode) as ColoringMode,
    legend_open: payload.legend_open ?? true,
    hidden_color_keys: payload.hidden_color_keys ?? [],
    find_query: payload.find_query ?? '',
    selected_node_ids: payload.selected_node_ids ?? [],
    expand_parents: payload.expand_parents ?? 5,
    expand_children: payload.expand_children ?? 0,
    layout_by_color: payload.layout_by_color ?? false,
    group_by_color: payload.group_by_color ?? false,
    layout_name: payload.layout_name ?? 'breadthfirst',
    graph_state: payload.graph_state ?? null,
    camera: payload.camera,
  };
}

const BUILD_HELPER_STRATEGIES: Array<{ value: BuildHelperStrategy; label: string; description: string }> = [
  {
    value: 'all_ancestors',
    label: 'All ancestor datasets',
    description: 'Build selected datasets and every upstream dataset reachable in the graph.',
  },
  {
    value: 'between_selected',
    label: 'All transforms in between',
    description: 'Build datasets on paths between selected upstream and downstream datasets.',
  },
  {
    value: 'selected_only',
    label: 'Selected datasets only',
    description: 'Build just the selected datasets, ordered by dependency position.',
  },
];

const COLORING_OPTION_BASE = [
  { value: 'resource_type', label: 'Resource type' },
  { value: 'project', label: 'Project' },
  { value: 'folder', label: 'Folder' },
  { value: 'repository', label: 'Repository' },
  { value: 'build_status', label: 'Build status' },
  { value: 'data_health', label: 'Data Health' },
  { value: 'out_of_date', label: 'Out-of-date' },
  { value: 'branch', label: 'Branch' },
  { value: 'code_status', label: 'Code status' },
  { value: 'storage', label: 'Storage' },
  { value: 'compute', label: 'Compute' },
  { value: 'transaction_type', label: 'Transaction type' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'custom_groups', label: 'Custom groups' },
  { value: 'user_views', label: 'User views' },
  { value: 'issues', label: 'Issues' },
  { value: 'marking', label: 'Marking' },
] satisfies Array<{ value: ColoringMode; label: string }>;

const COLORING_OPTIONS: { value: ColoringMode; label: string; description: string }[] = COLORING_OPTION_BASE.map((entry) => ({
  ...entry,
  description: `${entry.label} coloring`,
}));

// Pastel palette tuned to match Foundry Data Lineage screenshots.
const RESOURCE_PALETTE: Record<string, string> = {
  dataset: '#d4ec97',
  pipeline: '#b3def0',
  transform: '#9fd6d1',
  build: '#e6cf7b',
  schedule: '#f1b6bd',
  workflow: '#f7c79b',
  workflow_handoff: '#d7b7ee',
  ontology_output: '#c9d1ff',
  object_type: '#c1cfee',
  action: '#e9c1a4',
  function: '#bfe3aa',
  application: '#f6d08f',
  virtual_table: '#cfe7c4',
  artifact: '#e6dfb6',
};

const MARKING_PALETTE: Record<string, string> = {
  public: '#cbd5e1',
  confidential: '#f4a366',
  pii: '#f08585',
};

const BUILD_STATUS_PALETTE: Record<string, string> = {
  completed: '#7fc97f',
  running: '#80b1d3',
  queued: '#fdb462',
  failed: '#fb8072',
  aborted: '#b3b3b3',
  resolving: '#bebada',
  'jobspec available': '#94d39e',
  'no jobspec': '#cdd5dd',
  'not applicable': '#dde2e8',
  unknown: '#cdd5dd',
};

const DATA_HEALTH_PALETTE: Record<string, string> = {
  healthy: '#7fc97f',
  warning: '#fdb462',
  degraded: '#fdb462',
  failing: '#fb8072',
  failed: '#fb8072',
  'schema drift': '#bc80bd',
  unknown: '#cdd5dd',
};

const OUT_OF_DATE_PALETTE: Record<string, string> = {
  'up-to-date': '#7fc97f',
  data: '#fdb462',
  logic: '#80b1d3',
  'data+logic': '#fb8072',
  'out-of-date': '#fb8072',
  unknown: '#cdd5dd',
};

const CODE_STATUS_PALETTE: Record<string, string> = {
  current: '#7fc97f',
  available: '#94d39e',
  running: '#80b1d3',
  failed: '#fb8072',
  'out-of-date': '#fdb462',
  unavailable: '#cdd5dd',
  unknown: '#cdd5dd',
};

const TRANSACTION_TYPE_PALETTE: Record<string, string> = {
  snapshot: '#80b1d3',
  append: '#7fc97f',
  update: '#fdb462',
  delete: '#fb8072',
  mixed: '#bc80bd',
  unknown: '#cdd5dd',
};

const PERMISSION_PALETTE: Record<string, string> = {
  public: '#cbd5e1',
  private: '#b3b3b3',
  confidential: '#f4a366',
  pii: '#f08585',
  restricted: '#fb8072',
  inherited: '#bebada',
  unknown: '#cdd5dd',
};

const ISSUE_PALETTE: Record<string, string> = {
  issues: '#fb8072',
  warnings: '#fdb462',
  clean: '#7fc97f',
  unknown: '#cdd5dd',
};

const USER_VIEW_PALETTE: Record<string, string> = {
  none: '#dde2e8',
  low: '#b3def0',
  medium: '#80b1d3',
  high: '#5b8cc0',
  unknown: '#cdd5dd',
};

const DYNAMIC_PALETTE = [
  '#8dd3c7',
  '#ffffb3',
  '#bebada',
  '#fb8072',
  '#80b1d3',
  '#fdb462',
  '#b3de69',
  '#fccde5',
  '#bc80bd',
  '#ccebc5',
  '#ffed6f',
  '#9ecae1',
  '#fdae6b',
  '#a1d99b',
  '#dadaeb',
];

const LINEAGE_SNAPSHOT_STORAGE_KEY = 'openfoundry.lineage.graphSnapshots.v1';

const FALLBACK_COLOR = '#cdd5dd';

function normalizeToken(value: string, fallback = 'unknown') {
  const token = value.trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, ' ');
  return token || fallback;
}

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function firstMetadataString(metadata: Record<string, unknown>, keys: string[], fallback = 'unknown') {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }
  return fallback;
}

function firstMetadataNumber(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function metadataFlag(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const token = normalizeToken(value);
      if (['true', 'yes', '1'].includes(token)) return true;
      if (['false', 'no', '0'].includes(token)) return false;
    }
  }
  return null;
}

function dynamicColor(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return DYNAMIC_PALETTE[hash % DYNAMIC_PALETTE.length];
}

function categoryFromValue(
  mode: ColoringMode,
  rawValue: string,
  palette?: Record<string, string>,
  label?: string,
): NodeColorCategory {
  const value = normalizeToken(rawValue);
  return {
    key: `${mode}:${value}`,
    label: label ?? titleCase(value),
    value,
    color: palette?.[value] ?? dynamicColor(`${mode}:${value}`),
  };
}

function normalizeBuildStatus(value: string) {
  const status = normalizeToken(value);
  if (status.includes('completed') || status.includes('succeeded') || status === 'success') return 'completed';
  if (status.includes('running')) return 'running';
  if (status.includes('queued') || status.includes('pending')) return 'queued';
  if (status.includes('failed') || status.includes('error')) return 'failed';
  if (status.includes('abort') || status.includes('cancel')) return 'aborted';
  if (status.includes('resolution') || status.includes('resolving')) return 'resolving';
  return status;
}

function nodePipelineKey(node: LineageNode) {
  const metadata = node.metadata ?? {};
  return (
    metadataString(metadata, 'pipeline_rid') ||
    metadataString(metadata, 'producer_pipeline_rid') ||
    metadataString(metadata, 'pipeline_id') ||
    (node.kind === 'pipeline' ? node.id : '')
  );
}

function buildStatusValue(node: LineageNode, context: NodeColorContext) {
  const metadata = node.metadata ?? {};
  const explicit = firstMetadataString(metadata, ['build_status', 'last_build_status', 'state', 'status'], '');
  if (explicit) return normalizeBuildStatus(explicit);
  const pipeline = nodePipelineKey(node);
  if (pipeline && context.buildStatusByPipeline[pipeline]) return normalizeBuildStatus(context.buildStatusByPipeline[pipeline]);
  if (node.kind === 'dataset') return context.jobSpecMap[node.id] ? 'jobspec available' : 'no jobspec';
  return 'not applicable';
}

function healthStatusValue(node: LineageNode) {
  const metadata = node.metadata ?? {};
  if (metadataFlag(metadata, ['schema_drift_flag', 'schema_drift']) === true) return 'schema drift';
  return normalizeToken(firstMetadataString(metadata, ['data_health', 'health_status', 'last_health_status', 'quality_status'], 'unknown'));
}

function outOfDateValue(node: LineageNode) {
  const metadata = node.metadata ?? {};
  const data = metadataFlag(metadata, ['data_out_of_date', 'data_stale']);
  const logic = metadataFlag(metadata, ['logic_out_of_date', 'logic_stale']);
  if (data && logic) return 'data+logic';
  if (data) return 'data';
  if (logic) return 'logic';
  const stale = metadataFlag(metadata, ['out_of_date', 'stale', 'is_stale']);
  if (stale === true) return 'out-of-date';
  if (stale === false || data === false || logic === false) return 'up-to-date';
  return normalizeToken(firstMetadataString(metadata, ['freshness_status', 'staleness_status'], 'unknown'));
}

function codeStatusValue(node: LineageNode, context: NodeColorContext) {
  const metadata = node.metadata ?? {};
  const explicit = firstMetadataString(metadata, ['code_status', 'ci_status', 'repository_status'], '');
  if (explicit) return normalizeToken(explicit);
  if (node.kind !== 'dataset' && node.kind !== 'pipeline' && node.kind !== 'transform') return 'unavailable';
  return context.jobSpecMap[node.id] ? 'available' : 'unavailable';
}

function transactionTypeValue(node: LineageNode) {
  const raw = normalizeToken(firstMetadataString(node.metadata ?? {}, ['transaction_type', 'last_transaction_type', 'write_mode', 'build_strategy'], 'unknown'));
  if (raw.includes('snapshot')) return 'snapshot';
  if (raw.includes('append')) return 'append';
  if (raw.includes('update') || raw.includes('upsert')) return 'update';
  if (raw.includes('delete')) return 'delete';
  if (raw.includes('mixed')) return 'mixed';
  return raw;
}

function permissionsValue(node: LineageNode) {
  const metadata = node.metadata ?? {};
  const explicit = firstMetadataString(metadata, ['permission_status', 'permission_level', 'access', 'resource_visibility'], '');
  if (explicit) return normalizeToken(explicit);
  if (node.marking === 'pii' || node.marking === 'confidential') return normalizeToken(node.marking);
  return normalizeToken(node.marking || 'unknown');
}

function userViewsValue(node: LineageNode) {
  const metadata = node.metadata ?? {};
  const explicit = firstMetadataString(metadata, ['user_view_bucket', 'user_views_bucket'], '');
  if (explicit) return normalizeToken(explicit);
  const count = firstMetadataNumber(metadata, ['user_views', 'user_view_count', 'view_count', 'views']);
  if (count === null) return 'unknown';
  if (count <= 0) return 'none';
  if (count < 10) return 'low';
  if (count < 100) return 'medium';
  return 'high';
}

function issuesValue(node: LineageNode) {
  const metadata = node.metadata ?? {};
  const rawIssues = metadata.issues;
  const issueCount = Array.isArray(rawIssues) ? rawIssues.length : firstMetadataNumber(metadata, ['issue_count', 'issues_count']);
  if (issueCount && issueCount > 0) return 'issues';
  const warnings = firstMetadataNumber(metadata, ['warning_count', 'warnings_count']);
  if (warnings && warnings > 0) return 'warnings';
  const errorMessage = firstMetadataString(metadata, ['error_message', 'failure_reason', 'blocked_reason'], '');
  if (errorMessage) return 'issues';
  const health = healthStatusValue(node);
  if (['failed', 'failing', 'degraded', 'schema drift'].includes(health)) return health === 'degraded' ? 'warnings' : 'issues';
  return 'clean';
}

function colorCategoryForNode(node: LineageNode, mode: ColoringMode, context: NodeColorContext): NodeColorCategory {
  const metadata = node.metadata ?? {};
  if (mode === 'resource_type') return categoryFromValue(mode, node.kind, RESOURCE_PALETTE, titleCase(node.kind));
  if (mode === 'project') {
    const value = firstMetadataString(metadata, ['project_rid', 'project_id', 'project', 'project_name'], 'unknown');
    return categoryFromValue(mode, value, undefined, value === 'unknown' ? 'Unknown project' : value);
  }
  if (mode === 'folder') {
    const value = firstMetadataString(metadata, ['folder_path', 'folder', 'parent_folder_rid', 'folder_rid'], 'unknown');
    return categoryFromValue(mode, value, undefined, value === 'unknown' ? 'Unknown folder' : value);
  }
  if (mode === 'repository') {
    const value = firstMetadataString(metadata, ['repository', 'repo', 'repository_rid', 'source_repository'], 'unknown');
    return categoryFromValue(mode, value, undefined, value === 'unknown' ? 'No repository' : value);
  }
  if (mode === 'build_status') return categoryFromValue(mode, buildStatusValue(node, context), BUILD_STATUS_PALETTE);
  if (mode === 'data_health') return categoryFromValue(mode, healthStatusValue(node), DATA_HEALTH_PALETTE);
  if (mode === 'out_of_date') return categoryFromValue(mode, outOfDateValue(node), OUT_OF_DATE_PALETTE);
  if (mode === 'branch') {
    const value = firstMetadataString(metadata, ['active_branch', 'branch', 'build_branch'], 'unknown');
    return categoryFromValue(mode, value, undefined, value === 'unknown' ? 'Unknown branch' : value);
  }
  if (mode === 'code_status') return categoryFromValue(mode, codeStatusValue(node, context), CODE_STATUS_PALETTE);
  if (mode === 'storage') {
    const value = firstMetadataString(metadata, ['storage', 'storage_backend', 'storage_location', 'source_type', 'format'], 'unknown');
    return categoryFromValue(mode, value);
  }
  if (mode === 'compute') {
    const value = firstMetadataString(metadata, ['compute', 'compute_engine', 'runtime', 'engine', 'transform_type'], node.kind === 'transform' ? 'foundry' : 'unknown');
    return categoryFromValue(mode, value);
  }
  if (mode === 'transaction_type') return categoryFromValue(mode, transactionTypeValue(node), TRANSACTION_TYPE_PALETTE);
  if (mode === 'permissions') return categoryFromValue(mode, permissionsValue(node), PERMISSION_PALETTE);
  if (mode === 'custom_groups') {
    const value = firstMetadataString(metadata, ['custom_group', 'custom_groups', 'color_group', 'group', 'user_group'], 'ungrouped');
    return categoryFromValue(mode, value, undefined, value === 'ungrouped' ? 'Ungrouped' : value);
  }
  if (mode === 'user_views') return categoryFromValue(mode, userViewsValue(node), USER_VIEW_PALETTE);
  if (mode === 'issues') return categoryFromValue(mode, issuesValue(node), ISSUE_PALETTE);
  return categoryFromValue(mode, node.marking, MARKING_PALETTE);
}

function buildStatusByPipeline(builds: Build[]) {
  const byPipeline: Record<string, { state: string; ts: number }> = {};
  for (const build of builds) {
    const ts = Date.parse(build.finished_at ?? build.started_at ?? build.queued_at ?? build.created_at);
    const current = byPipeline[build.pipeline_rid];
    if (!current || ts >= current.ts) byPipeline[build.pipeline_rid] = { state: build.state, ts: Number.isFinite(ts) ? ts : 0 };
  }
  return Object.fromEntries(Object.entries(byPipeline).map(([pipeline, value]) => [pipeline, value.state]));
}

function nodeBorderColor(marking: string) {
  return MARKING_PALETTE[marking] ?? '#9aa3ad';
}

function resourceColor(kind: string) {
  return RESOURCE_PALETTE[kind] ?? FALLBACK_COLOR;
}

function savedLineageSnapshotsAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadSavedLineageSnapshots(): SavedLineageGraphSnapshot[] {
  if (!savedLineageSnapshotsAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(LINEAGE_SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedLineageGraphSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string')
      .map((entry) => ({
        ...entry,
        branch: typeof entry.branch === 'string' ? entry.branch : 'master',
        coloring_mode: COLORING_OPTION_BASE.some((option) => option.value === entry.coloring_mode) ? entry.coloring_mode : 'resource_type',
        legend_open: typeof entry.legend_open === 'boolean' ? entry.legend_open : true,
        hidden_color_keys: Array.isArray(entry.hidden_color_keys) ? entry.hidden_color_keys.filter((value) => typeof value === 'string') : [],
        find_query: typeof entry.find_query === 'string' ? entry.find_query : '',
        selected_node_ids: Array.isArray(entry.selected_node_ids) ? entry.selected_node_ids.filter((value) => typeof value === 'string') : [],
        expand_parents: typeof entry.expand_parents === 'number' ? entry.expand_parents : 0,
        expand_children: typeof entry.expand_children === 'number' ? entry.expand_children : 0,
        layout_by_color: typeof entry.layout_by_color === 'boolean' ? entry.layout_by_color : false,
        group_by_color: typeof entry.group_by_color === 'boolean' ? entry.group_by_color : false,
        layout_name: entry.layout_name ?? (entry.layout_by_color ? 'fcose' : 'breadthfirst'),
        graph_state: entry.graph_state ?? null,
      }))
      .sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at));
  } catch {
    return [];
  }
}

function persistSavedLineageSnapshots(snapshots: SavedLineageGraphSnapshot[]) {
  if (!savedLineageSnapshotsAvailable()) return;
  window.localStorage.setItem(LINEAGE_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots.slice(0, 20)));
}

function lineageSnapshotLink(snapshotID: string, readOnly = false) {
  if (typeof window === 'undefined') return `/lineage?snapshot=${encodeURIComponent(snapshotID)}${readOnly ? '&readonly=1' : ''}`;
  const url = new URL(window.location.href);
  url.pathname = '/lineage';
  url.search = '';
  url.searchParams.set('snapshot', snapshotID);
  if (readOnly) url.searchParams.set('readonly', '1');
  return url.toString();
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === 'undefined') return;
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.focus();
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

function enrichLineageGraph(graph: LineageGraph | null, schedules: Schedule[], builds: Build[]): LineageGraph | null {
  if (!graph) return null;
  const nodes: LineageNode[] = graph.nodes.map((node) => ({ ...node, metadata: node.metadata ?? {} }));
  const edges = graph.edges.map((edge) => ({ ...edge, metadata: edge.metadata ?? {} }));
  const nodeIDs = new Set(nodes.map((node) => node.id));
  const edgeIDs = new Set(edges.map((edge) => edge.id));

  const addNode = (node: LineageNode) => {
    if (nodeIDs.has(node.id)) return;
    nodeIDs.add(node.id);
    nodes.push(node);
  };
  const addEdge = (edge: LineageGraph['edges'][number]) => {
    if (edgeIDs.has(edge.id) || !nodeIDs.has(edge.source) || !nodeIDs.has(edge.target)) return;
    edgeIDs.add(edge.id);
    edges.push(edge);
  };
  const findByRID = (rid: string) => {
    if (!rid) return null;
    return nodes.find((node) => node.id === rid || metadataString(node.metadata ?? {}, 'rid') === rid || metadataString(node.metadata ?? {}, 'pipeline_rid') === rid) ?? null;
  };

  for (const edge of graph.edges) {
    const metadata = edge.metadata ?? {};
    const nodeID = edge.node_id || metadataString(metadata, 'node_id');
    const nodeLabel = metadataString(metadata, 'node_label') || nodeID;
    const transformType = metadataString(metadata, 'transform_type') || metadataString(metadata, 'type');
    if (!edge.pipeline_id || (!nodeID && !nodeLabel && !transformType)) continue;
    const transformID = `transform:${edge.pipeline_id}:${nodeID || nodeLabel || transformType}`;
    addNode({
      id: transformID,
      kind: 'transform',
      label: nodeLabel || transformType || 'Transform',
      marking: edge.effective_marking || 'public',
      metadata: {
        pipeline_id: edge.pipeline_id,
        node_id: nodeID,
        transform_type: transformType,
        repository: metadataString(metadata, 'repository'),
        source: 'lineage_edge',
      },
    });
    addEdge({
      id: `synthetic:${edge.id}:to-transform`,
      source: edge.source,
      source_kind: edge.source_kind,
      target: transformID,
      target_kind: 'transform',
      relation_kind: edge.relation_kind === 'produces' ? 'pipeline_step' : 'transform_input',
      pipeline_id: edge.pipeline_id,
      workflow_id: edge.workflow_id,
      node_id: edge.node_id,
      step_id: edge.step_id,
      effective_marking: edge.effective_marking,
      metadata: {},
    });
    addEdge({
      id: `synthetic:${edge.id}:from-transform`,
      source: transformID,
      source_kind: 'transform',
      target: edge.target,
      target_kind: edge.target_kind,
      relation_kind: edge.relation_kind === 'consumes' ? 'pipeline_step' : 'transform_output',
      pipeline_id: edge.pipeline_id,
      workflow_id: edge.workflow_id,
      node_id: edge.node_id,
      step_id: edge.step_id,
      effective_marking: edge.effective_marking,
      metadata: {},
    });
  }

  for (const schedule of schedules) {
    const scheduleID = `schedule:${schedule.rid}`;
    addNode({
      id: scheduleID,
      kind: 'schedule',
      label: schedule.name,
      marking: 'public',
      metadata: {
        rid: schedule.rid,
        project_rid: schedule.project_rid,
        folder_rid: schedule.folder_rid,
        branch: schedule.branch,
        build_strategy: schedule.build_strategy,
        paused: schedule.paused,
        owner: schedule.owner,
        last_run_at: schedule.last_run_at,
        target_rids: schedule.target_rids,
      },
    });
    for (const targetRID of schedule.target_rids ?? []) {
      const target = findByRID(targetRID);
      if (!target) continue;
      addEdge({
        id: `schedule:${schedule.rid}:${target.id}`,
        source: scheduleID,
        source_kind: 'schedule',
        target: target.id,
        target_kind: target.kind,
        relation_kind: 'schedules',
        pipeline_id: null,
        workflow_id: null,
        node_id: null,
        step_id: null,
        effective_marking: target.marking,
        metadata: { branch: schedule.branch, build_strategy: schedule.build_strategy },
      });
    }
  }

  for (const build of builds) {
    const buildID = `build:${build.rid}`;
    addNode({
      id: buildID,
      kind: 'build',
      label: build.rid,
      marking: 'public',
      metadata: {
        rid: build.rid,
        pipeline_rid: build.pipeline_rid,
        branch: build.build_branch,
        build_branch: build.build_branch,
        state: build.state,
        trigger_kind: build.trigger_kind,
        force_build: build.force_build,
        requested_by: build.requested_by,
        started_at: build.started_at,
        finished_at: build.finished_at,
      },
    });
    const pipeline = findByRID(build.pipeline_rid);
    if (pipeline) {
      addEdge({
        id: `build:${build.rid}:${pipeline.id}`,
        source: pipeline.id,
        source_kind: pipeline.kind,
        target: buildID,
        target_kind: 'build',
        relation_kind: 'build_execution',
        pipeline_id: pipeline.id,
        workflow_id: null,
        node_id: null,
        step_id: null,
        effective_marking: pipeline.marking,
        metadata: { branch: build.build_branch, state: build.state },
      });
    }
  }

  for (const node of [...nodes]) {
    for (const output of metadataItems(node.metadata ?? {}, ['ontology_outputs', 'ontology_output_rids'])) {
      const outputID = `ontology:${output.id}`;
      addNode({ id: outputID, kind: 'ontology_output', label: output.label, marking: node.marking, metadata: output.metadata });
      addEdge({
        id: `ontology:${node.id}:${output.id}`,
        source: node.id,
        source_kind: node.kind,
        target: outputID,
        target_kind: 'ontology_output',
        relation_kind: 'ontology_output',
        pipeline_id: null,
        workflow_id: null,
        node_id: null,
        step_id: null,
        effective_marking: node.marking,
        metadata: {},
      });
    }
    for (const handoff of metadataItems(node.metadata ?? {}, ['workflow_handoffs', 'handoffs'])) {
      const handoffID = `handoff:${handoff.id}`;
      addNode({ id: handoffID, kind: 'workflow_handoff', label: handoff.label, marking: node.marking, metadata: handoff.metadata });
      addEdge({
        id: `handoff:${node.id}:${handoff.id}`,
        source: node.id,
        source_kind: node.kind,
        target: handoffID,
        target_kind: 'workflow_handoff',
        relation_kind: 'workflow_handoff',
        pipeline_id: null,
        workflow_id: node.kind === 'workflow' ? node.id : null,
        node_id: null,
        step_id: null,
        effective_marking: node.marking,
        metadata: {},
      });
    }
  }

  return { nodes, edges };
}

function metadataItems(metadata: Record<string, unknown>, keys: string[]) {
  const items: Array<{ id: string; label: string; metadata: Record<string, unknown> }> = [];
  for (const key of keys) {
    const raw = metadata[key];
    if (!Array.isArray(raw)) continue;
    raw.forEach((item, index) => {
      if (typeof item === 'string') {
        items.push({ id: item, label: item, metadata: { rid: item, source_key: key } });
      } else if (isRecord(item)) {
        const id = metadataString(item, 'id') || metadataString(item, 'rid') || `${key}:${index}`;
        const label = metadataString(item, 'label') || metadataString(item, 'name') || id;
        items.push({ id, label, metadata: { ...item, source_key: key } });
      }
    });
  }
  return items;
}

function lineageNodeSearchText(node: LineageNode) {
  const metadata = node.metadata ?? {};
  const tokens: string[] = [node.id, node.kind, node.label, node.marking];
  for (const key of [
    'rid',
    'path',
    'folder_path',
    'parent_folder_rid',
    'project_id',
    'project_rid',
    'resource_type',
    'repository',
    'repository_rid',
    'repo',
    'schedule',
    'schedule_rid',
    'branch',
    'active_branch',
    'build_branch',
    'display_name',
    'table_name',
    'pipeline_rid',
  ]) {
    const value = metadata[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      tokens.push(String(value));
    }
  }
  const links = metadata.links;
  if (isRecord(links)) {
    for (const value of Object.values(links)) {
      if (typeof value === 'string') tokens.push(value);
    }
  }
  return tokens.join(' ').toLowerCase();
}

function buildHelperRelevantEdges(graph: LineageGraph) {
  return graph.edges.filter((edge) => {
    if (edge.relation_kind === 'schedules' || edge.relation_kind === 'build_execution') return false;
    if (edge.relation_kind === 'ontology_output' || edge.relation_kind === 'workflow_handoff') return false;
    return true;
  });
}

function parseFallbackBranches(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function producerPipelineRidForDataset(graph: LineageGraph, node: LineageNode) {
  const metadata = node.metadata ?? {};
  const direct = metadataString(metadata, 'pipeline_rid') || metadataString(metadata, 'producer_pipeline_rid');
  if (direct) return direct;
  const incoming = buildHelperRelevantEdges(graph).filter((edge) => edge.target === node.id);
  for (const edge of incoming) {
    if (edge.pipeline_id) return edge.pipeline_id;
    const edgePipeline = metadataString(edge.metadata ?? {}, 'pipeline_rid') || metadataString(edge.metadata ?? {}, 'pipeline_id');
    if (edgePipeline) return edgePipeline;
  }
  return '';
}

function dependencyDepths(graph: LineageGraph) {
  const relevant = buildHelperRelevantEdges(graph);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (nodeID: string): number => {
    if (memo.has(nodeID)) return memo.get(nodeID) ?? 0;
    if (visiting.has(nodeID)) return 0;
    visiting.add(nodeID);
    const parents = relevant.filter((edge) => edge.target === nodeID).map((edge) => edge.source);
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depth));
    visiting.delete(nodeID);
    memo.set(nodeID, value);
    return value;
  };
  for (const node of graph.nodes) depth(node.id);
  return memo;
}

function collectIncomingReachable(graph: LineageGraph, roots: string[]) {
  const relevant = buildHelperRelevantEdges(graph);
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const edge of relevant.filter((entry) => entry.target === id)) queue.push(edge.source);
  }
  return seen;
}

function collectPathNodesBetweenSelected(graph: LineageGraph, selectedDatasetIDs: string[]) {
  const relevant = buildHelperRelevantEdges(graph);
  const outgoing = new Map<string, string[]>();
  for (const edge of relevant) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }
  const selected = new Set(selectedDatasetIDs);
  const pathNodes = new Set<string>();
  for (const source of selectedDatasetIDs) {
    const queue: Array<{ id: string; path: string[] }> = [{ id: source, path: [source] }];
    const bestSeen = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || bestSeen.has(current.id)) continue;
      bestSeen.add(current.id);
      if (current.id !== source && selected.has(current.id)) {
        for (const id of current.path) pathNodes.add(id);
        continue;
      }
      for (const next of outgoing.get(current.id) ?? []) {
        if (current.path.includes(next)) continue;
        queue.push({ id: next, path: [...current.path, next] });
      }
    }
  }
  return pathNodes;
}

function computeBuildHelperPlan(
  graph: LineageGraph | null,
  selectedNodeIDs: string[],
  strategy: BuildHelperStrategy,
  branch: string,
  fallbackText: string,
  forceBuild: boolean,
): BuildHelperPlan {
  const fallbackBranches = parseFallbackBranches(fallbackText);
  const selectedIDs = Array.from(new Set(selectedNodeIDs));
  const empty: BuildHelperPlan = {
    strategy,
    branch,
    fallback_branches: fallbackBranches,
    force_build: forceBuild,
    selected_node_ids: selectedIDs,
    targets: [],
    transform_ids: [],
    warnings: [],
  };
  if (!graph) return { ...empty, warnings: ['No lineage graph is loaded.'] };
  const nodesByID = new Map(graph.nodes.map((node) => [node.id, node]));
  const selectedDatasets = selectedIDs
    .map((id) => nodesByID.get(id))
    .filter((node): node is LineageNode => Boolean(node && node.kind === 'dataset'));
  if (selectedDatasets.length === 0) return { ...empty, warnings: ['Select at least one dataset node.'] };

  const selectedDatasetIDs = selectedDatasets.map((node) => node.id);
  let included = new Set<string>();
  if (strategy === 'all_ancestors') {
    included = collectIncomingReachable(graph, selectedDatasetIDs);
  } else if (strategy === 'between_selected') {
    if (selectedDatasetIDs.length < 2) {
      return { ...empty, warnings: ['Select at least two dataset nodes for the in-between strategy.'] };
    }
    included = collectPathNodesBetweenSelected(graph, selectedDatasetIDs);
    if (included.size === 0) {
      return { ...empty, warnings: ['No directed transform path exists between the selected datasets.'] };
    }
  } else {
    included = new Set(selectedDatasetIDs);
  }

  const depths = dependencyDepths(graph);
  const transformIDs = graph.nodes
    .filter((node) => included.has(node.id) && (node.kind === 'transform' || node.kind === 'pipeline'))
    .map((node) => node.id);
  const targets = graph.nodes
    .filter((node) => included.has(node.id) && node.kind === 'dataset')
    .map((node) => {
      const datasetRid = datasetRidForNode(node);
      const pipelineRid = producerPipelineRidForDataset(graph, node);
      const targetTransforms = buildHelperRelevantEdges(graph)
        .filter((edge) => edge.target === node.id || edge.source === node.id)
        .flatMap((edge) => [edge.source, edge.target])
        .filter((id) => {
          const candidate = nodesByID.get(id);
          return candidate?.kind === 'transform' || candidate?.kind === 'pipeline';
        });
      return {
        node_id: node.id,
        label: node.label,
        dataset_rid: datasetRid,
        pipeline_rid: pipelineRid,
        branch,
        fallback_branches: fallbackBranches,
        force_build: forceBuild,
        distance: depths.get(node.id) ?? 0,
        reason: strategy === 'selected_only' ? 'selected' : selectedDatasetIDs.includes(node.id) ? 'selected' : 'resolved dependency',
        transform_ids: Array.from(new Set(targetTransforms)),
        blocked_reason: pipelineRid ? undefined : 'No producing pipeline RID is available for this dataset.',
      } satisfies BuildHelperTarget;
    })
    .sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label));

  const warnings = targets.length === 0 ? ['The selected nodes do not resolve to buildable datasets.'] : [];
  const blocked = targets.filter((target) => target.blocked_reason).length;
  if (blocked > 0) warnings.push(`${blocked} target(s) cannot be run until lineage captures a producing pipeline RID.`);
  return { ...empty, targets, transform_ids: transformIDs, warnings };
}

// Cytoscape stylesheet — round-rectangle pill with embedded chevrons in the
// label, mimicking Foundry's "‹  name  ›" node visual.
const STYLESHEET: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      shape: 'round-rectangle',
      label: 'data(displayLabel)',
      color: '#1f252d',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '220',
      'font-size': 11,
      'font-weight': 600,
      'font-family':
        'Arial, "Helvetica Neue", Helvetica, "Segoe UI", system-ui, -apple-system, sans-serif',
      width: 'label',
      height: 26,
      'padding-left': '14',
      'padding-right': '14',
      'padding-top': '4',
      'padding-bottom': '4',
      'border-width': 1,
      'border-color': 'data(borderColor)',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#9aa3ad',
      'target-arrow-color': '#9aa3ad',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.9,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#f08c3a',
      'overlay-opacity': 0,
    },
  },
  {
    selector: 'node.dim',
    style: {
      opacity: 0.25,
    },
  },
  {
    selector: 'node.match',
    style: {
      'border-width': 2,
      'border-color': '#2d72d2',
    },
  },
  {
    selector: 'node.histogram-match',
    style: {
      'border-width': 3,
      'border-color': '#1d4d9d',
      'overlay-color': '#1d4d9d',
      'overlay-opacity': 0.08,
    },
  },
  {
    selector: 'edge.highlight',
    style: {
      'line-color': '#f08c3a',
      'target-arrow-color': '#f08c3a',
      width: 2.5,
    },
  },
];

const LAYOUT_BREADTHFIRST = {
  name: 'breadthfirst',
  directed: true,
  spacingFactor: 1.4,
  padding: 24,
} as const;
const LAYOUT_FCOSE = { name: 'fcose', animate: false, padding: 30 } as const;
const LAYOUT_GRID = { name: 'grid', padding: 24, avoidOverlap: true } as const;
const LAYOUT_CIRCLE = { name: 'circle', padding: 24, avoidOverlap: true } as const;
const LAYOUT_CONCENTRIC = { name: 'concentric', padding: 24, avoidOverlap: true } as const;

type LayoutMode = 'breadthfirst' | 'fcose' | 'grid' | 'circle' | 'concentric';

const LAYOUT_OPTIONS: Array<{ value: LayoutMode; label: string; description: string }> = [
  { value: 'breadthfirst', label: 'Hierarchical', description: 'Directed top-down by topological order (default).' },
  { value: 'fcose', label: 'Force-directed', description: 'Cluster related nodes; great for coloured groupings.' },
  { value: 'grid', label: 'Grid', description: 'Uniform rows and columns; useful for triage.' },
  { value: 'circle', label: 'Circle', description: 'Nodes arranged along a circumference.' },
  { value: 'concentric', label: 'Concentric', description: 'Rings of decreasing centrality from the centre out.' },
];

// =============================================================================
// Inline SVG icon set for the lineage ribbon. Strokes use currentColor so each
// button can hover-tint without recreating the icon.
// =============================================================================

interface IconProps {
  size?: number;
}
function Icon({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const IconPan = () => (
  <Icon>
    <path d="M12 4v6M12 14v6M4 12h6M14 12h6" />
    <path d="M9 7l3-3 3 3M9 17l3 3 3-3M7 9l-3 3 3 3M17 9l3 3-3 3" />
  </Icon>
);
const IconDragSelect = () => (
  <Icon>
    <path d="M4 4h4M16 4h4M4 20h4M16 20h4M4 8v4M4 14v4M20 8v4M20 14v4" strokeDasharray="2 2" />
    <path d="M11 11l4 4M15 15l-1 0M15 15l0-1" />
  </Icon>
);
const IconFlow = () => (
  <Icon>
    <path d="M4 6h8a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8h8" />
    <path d="M16 22l4-4M16 22l4 4" />
  </Icon>
);
const IconRelatedArtifacts = () => (
  <Icon>
    <path d="M9 12a3 3 0 0 1 3-3h3a4 4 0 0 1 0 8h-1" />
    <path d="M15 12a3 3 0 0 1-3 3H9a4 4 0 0 1 0-8h1" />
  </Icon>
);
const IconChartGantt = () => (
  <Icon>
    <line x1="3" y1="6" x2="11" y2="6" strokeWidth={2} />
    <line x1="7" y1="12" x2="17" y2="12" strokeWidth={2} />
    <line x1="5" y1="18" x2="14" y2="18" strokeWidth={2} />
  </Icon>
);
const IconHelp = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-0.9 0.4-1.5 1-1.5 2v0.7" />
    <circle cx="12" cy="17" r="0.8" fill="currentColor" />
  </Icon>
);
const IconLayout = () => (
  <Icon>
    <rect x="3.5" y="4" width="7" height="6" rx="1.2" />
    <rect x="13.5" y="4" width="7" height="9" rx="1.2" />
    <rect x="3.5" y="13" width="7" height="7" rx="1.2" />
    <rect x="13.5" y="16" width="7" height="4" rx="1.2" />
  </Icon>
);
const IconUndo = () => (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h9a6 6 0 0 1 0 12h-3" />
  </Icon>
);
const IconRedo = () => (
  <Icon>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9h-9a6 6 0 0 0 0 12h3" />
  </Icon>
);
const IconClean = () => (
  <Icon>
    <path d="M3 5h18" />
    <path d="M6 5l3 14h6l3-14" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Icon>
);
const IconSelect = () => (
  <Icon>
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </Icon>
);
const IconExpand = () => (
  <Icon>
    <circle cx="6" cy="12" r="2" />
    <circle cx="18" cy="6" r="2" />
    <circle cx="18" cy="18" r="2" />
    <path d="M8 11l8-4M8 13l8 4" />
  </Icon>
);
const IconColor = () => (
  <Icon>
    <path d="M12 4c-3 4-5 7-5 10a5 5 0 0 0 10 0c0-3-2-6-5-10z" />
  </Icon>
);
const IconFind = () => (
  <Icon>
    <circle cx="11" cy="11" r="6" />
    <path d="M16 16l4 4" />
    <path d="M9 11h4M11 9v4" />
  </Icon>
);
const IconRemove = () => (
  <Icon>
    <circle cx="12" cy="12" r="8" />
    <path d="M8 12h8" />
  </Icon>
);
const IconAlign = () => (
  <Icon>
    <rect x="3.5" y="5" width="6" height="6" rx="1" />
    <rect x="14.5" y="5" width="6" height="6" rx="1" />
    <rect x="3.5" y="13" width="6" height="6" rx="1" />
    <rect x="14.5" y="13" width="6" height="6" rx="1" />
  </Icon>
);
const IconLayoutColor = () => (
  <Icon>
    <circle cx="6.5" cy="6.5" r="1.6" />
    <circle cx="12" cy="6.5" r="1.6" />
    <circle cx="17.5" cy="6.5" r="1.6" />
    <circle cx="6.5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="17.5" cy="12" r="1.6" />
    <circle cx="6.5" cy="17.5" r="1.6" />
    <circle cx="12" cy="17.5" r="1.6" />
    <circle cx="17.5" cy="17.5" r="1.6" />
  </Icon>
);
const IconGroupColor = () => (
  <Icon>
    <ellipse cx="9" cy="12" rx="5" ry="3.5" />
    <ellipse cx="15" cy="12" rx="5" ry="3.5" />
  </Icon>
);
const IconLegendEye = () => (
  <Icon>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    <path d="M4 4l16 16" />
  </Icon>
);
const IconLegendEyeOpen = () => (
  <Icon>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
const IconResourceTable = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="14" rx="1.2" />
    <path d="M3.5 10h17M9 5v14" />
  </Icon>
);
const IconBranch = () => (
  <Icon>
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="9" r="2.2" />
    <path d="M6 8.2v7.6M6 12c0-3 2-3 4-3h6" />
  </Icon>
);
const IconCmd = () => (
  <Icon>
    <rect x="4" y="4" width="6" height="6" rx="1.6" />
    <rect x="14" y="4" width="6" height="6" rx="1.6" />
    <rect x="4" y="14" width="6" height="6" rx="1.6" />
    <rect x="14" y="14" width="6" height="6" rx="1.6" />
  </Icon>
);
const IconSettings = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" />
  </Icon>
);
const IconChevronDown = () => (
  <Icon size={14}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);
const IconZoomCenter = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
  </Icon>
);
const IconZoomIn = () => (
  <Icon>
    <circle cx="11" cy="11" r="6" />
    <path d="M11 8v6M8 11h6M16 16l4 4" />
  </Icon>
);
const IconZoomOut = () => (
  <Icon>
    <circle cx="11" cy="11" r="6" />
    <path d="M8 11h6M16 16l4 4" />
  </Icon>
);
const IconFit = () => (
  <Icon>
    <path d="M4 9V5h4M16 5h4v4M4 15v4h4M16 19h4v-4" />
  </Icon>
);
const IconSearch = () => (
  <Icon>
    <circle cx="11" cy="11" r="6" />
    <path d="M16 16l4 4" />
  </Icon>
);
const IconCalendar = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15" rx="1.2" />
    <path d="M3.5 9h17M8 3v4M16 3v4" />
  </Icon>
);
const IconClipboard = () => (
  <Icon>
    <rect x="6" y="4" width="12" height="17" rx="1.4" />
    <path d="M9 4h6v3H9z" />
  </Icon>
);
const IconWrench = () => (
  <Icon>
    <path d="M14.5 4a4.5 4.5 0 0 1 5 5.5L7 22 2 17 14.5 4z" />
    <path d="M14 9l1 1" />
  </Icon>
);
const IconChevronsLeft = () => (
  <Icon size={16}>
    <path d="M11 7l-5 5 5 5M18 7l-5 5 5 5" />
  </Icon>
);
const IconChevronsDown = () => (
  <Icon size={16}>
    <path d="M7 7l5 5 5-5M7 13l5 5 5-5" />
  </Icon>
);
const IconFullscreen = () => (
  <Icon size={14}>
    <path d="M4 9V5h4M16 5h4v4M4 15v4h4M16 19h4v-4" />
  </Icon>
);
const IconRefresh = () => (
  <Icon>
    <path d="M20 11A8 8 0 1 0 12 20" />
    <path d="M20 5v6h-6" />
  </Icon>
);

// =============================================================================
// Page
// =============================================================================

export function LineagePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const linkedSnapshotId = locationParams.get('snapshot') ?? '';
  const sharedToken = locationParams.get('share') ?? '';
  const readOnlyMode =
    locationParams.get('readonly') === '1' ||
    locationParams.get('presentation') === '1' ||
    sharedToken !== '';
  const [graph, setGraph] = useState<LineageGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<LineageNode | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [impact, setImpact] = useState<LineageImpactAnalysis | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<LineageBuildResult | null>(null);
  const [acknowledgeSensitiveLineage, setAcknowledgeSensitiveLineage] = useState(false);
  const [jobSpecByDatasetId, setJobSpecByDatasetId] = useState<Record<string, boolean>>({});
  const [graphSchedules, setGraphSchedules] = useState<Schedule[]>([]);
  const [graphBuilds, setGraphBuilds] = useState<Build[]>([]);

  // Lineage-app specific UI state.
  const [coloringMode, setColoringMode] = useState<ColoringMode>('resource_type');
  const [legendOpen, setLegendOpen] = useState(true);
  const [hiddenColorKeys, setHiddenColorKeys] = useState<string[]>([]);
  const [coloringMenuOpen, setColoringMenuOpen] = useState(false);
  const [expandPopoverOpen, setExpandPopoverOpen] = useState(false);
  const [selectPopoverOpen, setSelectPopoverOpen] = useState(false);
  const [expandParents, setExpandParents] = useState(5);
  const [expandChildren, setExpandChildren] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findMode, setFindMode] = useState<'name' | 'column'>('name');
  /** Per-dataset cache of column names. Populated lazily when the user
   *  switches Find to column mode and we walk the visible datasets. */
  const [columnsByDatasetId, setColumnsByDatasetId] = useState<Record<string, Set<string>>>({});
  const [columnIndexLoading, setColumnIndexLoading] = useState(false);
  const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number; y: number; nodeId: string; nodeLabel: string } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [nodeDescriptions, setNodeDescriptions] = useState<Record<string, PersistedNodeDescription | null>>({});
  const [nodeDescriptionLoading, setNodeDescriptionLoading] = useState<Record<string, boolean>>({});
  const [branch, setBranch] = useState('master');
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [layoutByColor, setLayoutByColor] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('breadthfirst');
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [groupByColor, setGroupByColor] = useState(false);
  const [panSelectMode, setPanSelectMode] = useState<'pan' | 'select'>('pan');
  /** Quarter-turn count for the Flow tool (0 = TB, 1 = LR, 2 = BT, 3 = RL). */
  const [flowQuarter, setFlowQuarter] = useState<0 | 1 | 2 | 3>(1);
  const [bottomTab, setBottomTab] = useState<BottomTabId>('preview');
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [bottomFullscreen, setBottomFullscreen] = useState(false);
  const [activeRightTool, setActiveRightTool] = useState<
    'search' | 'properties' | 'tools' | 'calendar' | 'clipboard' | 'related' | null
  >(null);
  const [datasetPreview, setDatasetPreview] = useState<DatasetPreviewResponse | null>(null);
  const [datasetPreviewLoading, setDatasetPreviewLoading] = useState(false);
  const [nodeDetails, setNodeDetails] = useState<NodeDetailsState>(EMPTY_NODE_DETAILS);
  const [buildHelperStrategy, setBuildHelperStrategy] = useState<BuildHelperStrategy>('all_ancestors');
  const [buildHelperFallbacks, setBuildHelperFallbacks] = useState('master');
  const [buildHelperForce, setBuildHelperForce] = useState(false);
  const [buildHelperPlan, setBuildHelperPlan] = useState<BuildHelperPlan | null>(null);
  const [buildHelperRunning, setBuildHelperRunning] = useState(false);
  const [buildHelperResults, setBuildHelperResults] = useState<BuildHelperRunResult[]>([]);
  const [pipelineRollbackTransactions, setPipelineRollbackTransactions] = useState<DatasetTransaction[]>([]);
  const [pipelineRollbackTransactionId, setPipelineRollbackTransactionId] = useState('');
  const [pipelineRollbackTransactionsByDataset, setPipelineRollbackTransactionsByDataset] = useState<Record<string, DatasetTransaction[]>>({});
  const [pipelineRollbackExcludedIds, setPipelineRollbackExcludedIds] = useState<string[]>([]);
  const [pipelineRollbackPlan, setPipelineRollbackPlan] = useState<PipelineRollbackPlan | null>(null);
  const [pipelineRollbackLoading, setPipelineRollbackLoading] = useState(false);
  const [pipelineRollbackRunning, setPipelineRollbackRunning] = useState(false);
  const [pipelineRollbackResults, setPipelineRollbackResults] = useState<PipelineRollbackRunResult[]>([]);
  const [pipelineRollbackConfirmOpen, setPipelineRollbackConfirmOpen] = useState(false);
  const [savedSnapshots, setSavedSnapshots] = useState<SavedLineageGraphSnapshot[]>(() => loadSavedLineageSnapshots());
  const [schemaByDatasetId, setSchemaByDatasetId] = useState<Record<string, HistogramSchemaLike | null>>({});
  const [schemaFetchingDatasetIds, setSchemaFetchingDatasetIds] = useState<Set<string>>(() => new Set());
  const [histogramFilters, setHistogramFilters] = useState<HistogramFilter[]>([]);
  const [relatedExcludedKinds, setRelatedExcludedKinds] = useState<Set<string>>(() => new Set());
  const [relatedSort, setRelatedSort] = useState<RelatedArtifactSort>('newest');
  const [relatedShowAutosaved, setRelatedShowAutosaved] = useState(false);
  const [relatedShowTrash, setRelatedShowTrash] = useState(false);
  const [buildTimelineRange, setBuildTimelineRange] = useState<BuildTimelineRangeKey>('10d');
  const [buildTimelineColorBy, setBuildTimelineColorBy] = useState<BuildTimelineColorBy>('schedule');

  const cyRef = useRef<Core | null>(null);
  const [cyInstance, setCyInstance] = useState<Core | null>(null);
  const graphRef = useRef<LineageGraph | null>(null);
  const selectedNodeRef = useRef<LineageNode | null>(null);
  const selectedNodeIdsRef = useRef<string[]>([]);
  const restoredSnapshotIDRef = useRef<string>('');
  const branchRef = useRef(branch);
  useEffect(() => {
    branchRef.current = branch;
  }, [branch]);
  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [graphResult, schedulesResult, buildsResult] = await Promise.allSettled([
        getFullLineage(),
        listSchedules({ limit: 500 }),
        listBuildsV1({ limit: 500 }),
      ]);
      if (graphResult.status === 'rejected') throw graphResult.reason;
      const fresh = graphResult.value;
      setGraphSchedules(schedulesResult.status === 'fulfilled' ? schedulesResult.value.data : []);
      setGraphBuilds(buildsResult.status === 'fulfilled' ? buildsResult.value.data : []);
      const datasetIds = fresh.nodes.filter((n) => n.kind === 'dataset').map((n) => n.id);
      const jobSpecResults = await Promise.allSettled(
        datasetIds.map(async (id) => [id, await loadJobSpecStatus(id)] as const),
      );
      const nextJobSpec: Record<string, boolean> = {};
      for (const r of jobSpecResults) {
        if (r.status === 'fulfilled') {
          const [id, status] = r.value;
          nextJobSpec[id] = status.has_master_jobspec;
        }
      }
      setJobSpecByDatasetId(nextJobSpec);
      setGraph(fresh);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load lineage');
      setGraphSchedules([]);
      setGraphBuilds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  const viewGraph = useMemo(() => enrichLineageGraph(graph, graphSchedules, graphBuilds), [graph, graphSchedules, graphBuilds]);
  const colorContext = useMemo<NodeColorContext>(() => ({
    jobSpecMap: jobSpecByDatasetId,
    buildStatusByPipeline: buildStatusByPipeline(graphBuilds),
  }), [jobSpecByDatasetId, graphBuilds]);
  const selectedPipelineRollbackTransaction = useMemo(() => (
    pipelineRollbackTransactions.find((tx) => tx.id === pipelineRollbackTransactionId) ?? null
  ), [pipelineRollbackTransactions, pipelineRollbackTransactionId]);

  useEffect(() => {
    graphRef.current = viewGraph;
  }, [viewGraph]);

  // ---------------------------------------------------------------------------
  // Cytoscape elements & interaction
  // ---------------------------------------------------------------------------

  const elements = useMemo<ElementDefinition[]>(() => {
    if (!viewGraph) return [];
    const hidden = new Set(hiddenColorKeys);
    const visibleNodes = viewGraph.nodes.filter((node) => !hidden.has(colorCategoryForNode(node, coloringMode, colorContext).key));
    const visibleNodeIDs = new Set(visibleNodes.map((node) => node.id));
    return [
      ...visibleNodes.map((node) => {
        const category = colorCategoryForNode(node, coloringMode, colorContext);
        return {
          data: {
            id: node.id,
            // Foundry visual: chevron-tagged pill. The chevrons are baked into
            // the label so we keep a single round-rectangle node primitive.
            displayLabel: `‹  ${node.label}  ›`,
            searchText: lineageNodeSearchText(node),
            kind: node.kind,
            marking: node.marking,
            colorMode: coloringMode,
            colorKey: category.key,
            colorLabel: category.label,
            color: category.color,
            borderColor: nodeBorderColor(node.marking),
          },
        };
      }),
      ...viewGraph.edges.filter((edge) => visibleNodeIDs.has(edge.source) && visibleNodeIDs.has(edge.target)).map((edge) => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          relation: edge.relation_kind,
        },
      })),
    ];
  }, [viewGraph, coloringMode, colorContext, hiddenColorKeys]);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    for (const id of selectedNodeIds) cy.$id(id).select();
  }, [selectedNodeIds, elements]);

  const layout = useMemo(() => {
    // "Layout by color" forces fcose since it clusters; otherwise respect
    // the explicit layout picked from the Layout menu.
    if (layoutByColor) {
      return LAYOUT_FCOSE as unknown as Parameters<typeof CytoscapeCanvas>[0]['layout'];
    }
    const pick =
      layoutMode === 'fcose'
        ? LAYOUT_FCOSE
        : layoutMode === 'grid'
        ? LAYOUT_GRID
        : layoutMode === 'circle'
        ? LAYOUT_CIRCLE
        : layoutMode === 'concentric'
        ? LAYOUT_CONCENTRIC
        : LAYOUT_BREADTHFIRST;
    return pick as unknown as Parameters<typeof CytoscapeCanvas>[0]['layout'];
  }, [layoutByColor, layoutMode]);

  function clearSelection() {
    setSelectedNodeIds([]);
    setSelectedNode(null);
    setImpact(null);
    setBuildResult(null);
    setDatasetPreview(null);
    setNodeDetails(EMPTY_NODE_DETAILS);
    setBuildHelperPlan(null);
    setBuildHelperResults([]);
    setPipelineRollbackTransactions([]);
    setPipelineRollbackTransactionId('');
    setPipelineRollbackTransactionsByDataset({});
    setPipelineRollbackExcludedIds([]);
    setPipelineRollbackPlan(null);
    setPipelineRollbackResults([]);
  }

  function selectLineageNode(node: LineageNode | null, additive = false) {
    if (!node) {
      clearSelection();
      return;
    }
    const current = selectedNodeIdsRef.current;
    const nextIDs = additive
      ? current.includes(node.id)
        ? current.filter((id) => id !== node.id)
        : [...current, node.id]
      : [node.id];
    if (nextIDs.length === 0) {
      clearSelection();
      return;
    }
    const primaryID = nextIDs[nextIDs.length - 1];
    const primary = graphRef.current?.nodes.find((entry) => entry.id === primaryID) ?? node;
    setSelectedNodeIds(nextIDs);
    setSelectedNode(primary);
    setImpact(null);
    setBuildResult(null);
    setDatasetPreview(null);
    setNodeDetails(EMPTY_NODE_DETAILS);
    setBuildHelperPlan(null);
    setBuildHelperResults([]);
    setPipelineRollbackTransactions([]);
    setPipelineRollbackTransactionId('');
    setPipelineRollbackTransactionsByDataset({});
    setPipelineRollbackExcludedIds([]);
    setPipelineRollbackPlan(null);
    setPipelineRollbackResults([]);
    if (primary.kind === 'dataset') {
      void loadImpact(primary.id);
      void loadPreview(primary.id);
      void loadNodeDetails(primary);
    }
  }

  function toggleLegendFilter(key: string) {
    setHiddenColorKeys((current) => (
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
    ));
  }

  function clearLegendFilters() {
    setHiddenColorKeys((current) => current.filter((key) => !key.startsWith(`${coloringMode}:`)));
  }

  const handleCytoscapeReady = useCallback((cy: Core) => {
    cyRef.current = cy;
    setCyInstance(cy);
    cy.removeListener('tap');
    cy.removeListener('cxttap');
    cy.on('tap', 'node', (event: EventObject) => {
      const nodeId = String(event.target.id());
      const node = graphRef.current?.nodes.find((entry) => entry.id === nodeId) ?? null;
      const original = event.originalEvent as MouseEvent | undefined;
      selectLineageNode(node, Boolean(original?.shiftKey || original?.metaKey || original?.ctrlKey));
    });
    cy.on('tap', (event) => {
      if (event.target === cy) {
        clearSelection();
        setNodeContextMenu(null);
      }
    });
    cy.on('cxttap', 'node', (event: EventObject) => {
      const nodeId = String(event.target.id());
      const node = graphRef.current?.nodes.find((entry) => entry.id === nodeId) ?? null;
      if (!node) return;
      // Select the node so the menu actions act on it.
      selectLineageNode(node, false);
      const original = event.originalEvent as MouseEvent | undefined;
      setNodeContextMenu({
        x: original?.clientX ?? 0,
        y: original?.clientY ?? 0,
        nodeId: node.id,
        nodeLabel: node.label,
      });
    });
  }, []);

  // Lazy column-index loader. When the user switches Find to column
  // mode we walk every visible dataset once and remember the column
  // names locally. Subsequent finds reuse the cache so typing stays
  // instant. Backend errors are silent — column search just falls
  // back to its existing rows.
  const loadColumnsForVisibleDatasets = useCallback(async () => {
    if (!viewGraph) return;
    const targets = viewGraph.nodes
      .filter((n) => n.kind === 'dataset')
      .map((n) => n.id)
      .filter((id) => !columnsByDatasetId[id]);
    if (targets.length === 0) return;
    setColumnIndexLoading(true);
    const results = await Promise.allSettled(targets.map((id) => getDatasetColumnLineage(id)));
    setColumnsByDatasetId((prev) => {
      const next = { ...prev };
      targets.forEach((id, idx) => {
        const result = results[idx];
        const set = new Set<string>();
        if (result.status === 'fulfilled') {
          for (const edge of result.value as ColumnLineageEdge[]) {
            if (edge.source_dataset_id === id && edge.source_column) set.add(edge.source_column);
            if (edge.target_dataset_id === id && edge.target_column) set.add(edge.target_column);
          }
        }
        next[id] = set;
      });
      return next;
    });
    setColumnIndexLoading(false);
  }, [viewGraph, columnsByDatasetId]);

  useEffect(() => {
    if (findMode !== 'column' || !findOpen) return;
    void loadColumnsForVisibleDatasets();
  }, [findMode, findOpen, loadColumnsForVisibleDatasets]);

  // Apply find-query highlight (re-runs when the term, mode, or graph changes).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const q = findQuery.trim().toLowerCase();
    cy.nodes().removeClass('match dim');
    if (!q) return;
    const matches = cy.nodes().filter((n) => {
      const id = n.id();
      if (findMode === 'column') {
        const columns = columnsByDatasetId[id];
        if (!columns) return false;
        for (const column of columns) {
          if (column.toLowerCase().includes(q)) return true;
        }
        return false;
      }
      return String(n.data('searchText') ?? n.data('displayLabel') ?? '').toLowerCase().includes(q);
    });
    if (matches.length === 0) return;
    cy.nodes().not(matches).addClass('dim');
    matches.addClass('match');
  }, [findQuery, findMode, columnsByDatasetId, elements]);

  async function loadImpact(datasetId: string) {
    setImpactLoading(true);
    setBuildResult(null);
    setAcknowledgeSensitiveLineage(false);
    try {
      const next = await getDatasetLineageImpact(datasetId);
      setImpact(next);
    } catch (cause) {
      setImpact(null);
      notifications.error(cause instanceof Error ? cause.message : 'Failed to load impact analysis');
    } finally {
      setImpactLoading(false);
    }
  }

  async function loadPreview(datasetId: string) {
    setDatasetPreviewLoading(true);
    try {
      const next = await previewDataset(datasetId, { limit: 25 });
      setDatasetPreview(next);
    } catch {
      setDatasetPreview(null);
    } finally {
      setDatasetPreviewLoading(false);
    }
  }

  async function loadNodeDetails(node: LineageNode) {
    const datasetRid = datasetRidForNode(node);
    setNodeDetails({ ...EMPTY_NODE_DETAILS, loading: true });
    const [schemaResult, buildsResult, schedulesResult, healthResult] = await Promise.allSettled([
      getDatasetSchemaForBranch(node.id, branchRef.current),
      datasetRid ? listDatasetBuildsV1(datasetRid) : Promise.resolve({ data: [] as Build[], dataset_rid: '' }),
      datasetRid ? listSchedules({ files: [datasetRid], limit: 50 }) : Promise.resolve({ data: [] as Schedule[], total: 0 }),
      datasetRid ? getDatasetHealth(datasetRid) : Promise.resolve(null),
    ]);
    if (selectedNodeRef.current?.id !== node.id) return;
    const errors: string[] = [];
    if (schemaResult.status === 'rejected') errors.push('Schema is not available for this node.');
    if (buildsResult.status === 'rejected') errors.push('Jobs/builds are not available for this node.');
    if (schedulesResult.status === 'rejected') errors.push('Schedules are not available for this node.');
    if (healthResult.status === 'rejected') errors.push('Health is not available for this node.');
    setNodeDetails({
      schema: schemaResult.status === 'fulfilled' ? schemaResult.value : null,
      builds: buildsResult.status === 'fulfilled' ? buildsResult.value.data : [],
      schedules: schedulesResult.status === 'fulfilled' ? schedulesResult.value.data : [],
      health: healthResult.status === 'fulfilled' ? healthResult.value : null,
      loading: false,
      errors,
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadRollbackTransactions() {
      if (!selectedNode || selectedNode.kind !== 'dataset') {
        setPipelineRollbackTransactions([]);
        setPipelineRollbackTransactionId('');
        setPipelineRollbackTransactionsByDataset({});
        setPipelineRollbackPlan(null);
        return;
      }
      setPipelineRollbackLoading(true);
      setPipelineRollbackPlan(null);
      setPipelineRollbackResults([]);
      try {
        const rows = await listDatasetTransactions(selectedNode.id, { branch });
        if (cancelled) return;
        const committed = rows.filter((tx) => tx.status === 'COMMITTED');
        setPipelineRollbackTransactions(rows);
        setPipelineRollbackTransactionsByDataset({
          [selectedNode.id]: rows,
          [datasetRidForNode(selectedNode)]: rows,
        });
        setPipelineRollbackTransactionId((current) => {
          if (current && committed.some((tx) => tx.id === current)) return current;
          return committed[1]?.id ?? committed[0]?.id ?? '';
        });
        setPipelineRollbackExcludedIds([]);
      } catch (cause) {
        if (!cancelled) {
          setPipelineRollbackTransactions([]);
          setPipelineRollbackTransactionId('');
          setPipelineRollbackTransactionsByDataset({});
          notifications.error(cause instanceof Error ? cause.message : 'Failed to load rollback transactions');
        }
      } finally {
        if (!cancelled) setPipelineRollbackLoading(false);
      }
    }
    void loadRollbackTransactions();
    return () => {
      cancelled = true;
    };
  }, [selectedNode, branch]);

  async function triggerBuilds() {
    if (!selectedNode || selectedNode.kind !== 'dataset') return;
    setBuilding(true);
    try {
      const next = await triggerLineageBuilds(selectedNode.id, {
        include_workflows: true,
        dry_run: false,
        acknowledge_sensitive_lineage: acknowledgeSensitiveLineage,
        context: { initiated_from: 'lineage-explorer' },
      });
      setBuildResult(next);
      notifications.success(`Triggered ${next.triggered.length} downstream build(s)`);
      await loadImpact(selectedNode.id);
      setBottomTab('jobs');
      setBottomCollapsed(false);
    } catch (cause) {
      notifications.error(cause instanceof Error ? cause.message : 'Failed to trigger builds');
    } finally {
      setBuilding(false);
    }
  }

  function previewBuildHelperPlan() {
    const plan = computeBuildHelperPlan(
      viewGraph,
      selectedNodeIds,
      buildHelperStrategy,
      branch,
      buildHelperFallbacks,
      buildHelperForce,
    );
    setBuildHelperPlan(plan);
    setBuildHelperResults([]);
    setActiveRightTool('tools');
    if (plan.targets.length === 0) {
      notifications.error(plan.warnings[0] ?? 'No build targets resolved from the current selection');
    } else {
      notifications.success(`Preview resolved ${plan.targets.length} dataset target(s)`);
    }
  }

  function selectBuildPlanTargets(plan: BuildHelperPlan) {
    const targetIDs = plan.targets.map((target) => target.node_id);
    if (targetIDs.length === 0) return;
    setSelectedNodeIds(targetIDs);
    const primary = viewGraph?.nodes.find((node) => node.id === targetIDs[targetIDs.length - 1]) ?? null;
    setSelectedNode(primary);
    if (primary?.kind === 'dataset') {
      void loadImpact(primary.id);
      void loadPreview(primary.id);
      void loadNodeDetails(primary);
    }
    const cy = cyRef.current;
    if (cy) {
      let collection = cy.collection();
      for (const id of targetIDs) collection = collection.union(cy.$id(id));
      cy.fit(collection, 40);
    }
  }

  async function runBuildHelperPlan() {
    const plan = buildHelperPlan ?? computeBuildHelperPlan(
      viewGraph,
      selectedNodeIds,
      buildHelperStrategy,
      branch,
      buildHelperFallbacks,
      buildHelperForce,
    );
    setBuildHelperPlan(plan);
    const runnable = plan.targets.filter((target) => !target.blocked_reason && target.pipeline_rid && target.dataset_rid);
    if (runnable.length === 0) {
      notifications.error(plan.warnings[0] ?? 'No runnable dataset targets in the build preview');
      return;
    }
    const groups = new Map<string, string[]>();
    for (const target of runnable) {
      const list = groups.get(target.pipeline_rid) ?? [];
      if (!list.includes(target.dataset_rid)) list.push(target.dataset_rid);
      groups.set(target.pipeline_rid, list);
    }
    setBuildHelperRunning(true);
    setBuildHelperResults([]);
    try {
      const results = await Promise.allSettled(
        [...groups.entries()].map(async ([pipelineRid, outputDatasetRids]) => ({
          pipeline_rid: pipelineRid,
          output_dataset_rids: outputDatasetRids,
          response: await runBuildWithExpectationGates({
            pipeline_rid: pipelineRid,
            build_branch: plan.branch,
            job_spec_fallback: plan.fallback_branches,
            force_build: plan.force_build,
            output_dataset_rids: outputDatasetRids,
            trigger_kind: plan.force_build ? 'FORCE' : 'MANUAL',
          }),
        })),
      );
      const normalized: BuildHelperRunResult[] = results.map((result, index) => {
        const [pipelineRid, outputDatasetRids] = [...groups.entries()][index];
        if (result.status === 'fulfilled') return result.value;
        return {
          pipeline_rid: pipelineRid,
          output_dataset_rids: outputDatasetRids,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      });
      setBuildHelperResults(normalized);
      const failures = normalized.filter((result) => result.error).length;
      if (failures > 0) notifications.error(`${failures} build group(s) failed to enqueue`);
      else notifications.success(`Queued ${normalized.length} build group(s) from lineage`);
      setBottomTab('jobs');
      setBottomCollapsed(false);
      void loadGraph();
    } finally {
      setBuildHelperRunning(false);
    }
  }

  function recomputePipelineRollbackPlan(
    nextExcludedIds: string[] = pipelineRollbackExcludedIds,
    nextTransactionsByDataset: Record<string, DatasetTransaction[]> = pipelineRollbackTransactionsByDataset,
  ) {
    if (!selectedNode || selectedNode.kind !== 'dataset') return null;
    const plan = computePipelineRollbackPlan({
      graph: viewGraph,
      upstreamNodeId: selectedNode.id,
      branch,
      selectedTransaction: selectedPipelineRollbackTransaction,
      transactionsByDataset: nextTransactionsByDataset,
      jobSpecByDatasetId,
      excludedNodeIds: nextExcludedIds,
    });
    setPipelineRollbackPlan(plan);
    return plan;
  }

  async function previewPipelineRollback() {
    if (!selectedNode || selectedNode.kind !== 'dataset') {
      notifications.error('Select an upstream dataset before previewing pipeline rollback');
      return;
    }
    if (!selectedPipelineRollbackTransaction) {
      notifications.error('Select a successful transaction to roll back to');
      return;
    }
    setPipelineRollbackLoading(true);
    setPipelineRollbackResults([]);
    try {
      const ids = downstreamDatasetIds(viewGraph, selectedNode.id);
      const nodesByID = new Map((viewGraph?.nodes ?? []).map((node) => [node.id, node]));
      const nextIndex: Record<string, DatasetTransaction[]> = { ...pipelineRollbackTransactionsByDataset };
      const missing = ids.filter((id) => !nextIndex[id]);
      const results = await Promise.allSettled(
        missing.map(async (nodeId) => {
          const rows = await listDatasetTransactions(nodeId, { branch });
          return [nodeId, rows] as const;
        }),
      );
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const [nodeId, rows] = result.value;
        nextIndex[nodeId] = rows;
        const node = nodesByID.get(nodeId);
        if (node) nextIndex[datasetRidForNode(node)] = rows;
      }
      setPipelineRollbackTransactionsByDataset(nextIndex);
      const plan = recomputePipelineRollbackPlan(pipelineRollbackExcludedIds, nextIndex);
      setActiveRightTool('tools');
      if (!plan || plan.targets.length === 0) {
        notifications.error(plan?.warnings[0] ?? 'No rollback targets found');
      } else {
        notifications.success(`Preview resolved ${plan.targets.length} rollback target(s)`);
      }
    } finally {
      setPipelineRollbackLoading(false);
    }
  }

  function togglePipelineRollbackExclusion(nodeId: string) {
    const target = pipelineRollbackPlan?.targets.find((entry) => entry.node_id === nodeId);
    if (target?.is_upstream) return;
    const nextExcluded = pipelineRollbackExcludedIds.includes(nodeId)
      ? pipelineRollbackExcludedIds.filter((id) => id !== nodeId)
      : [...pipelineRollbackExcludedIds, nodeId];
    setPipelineRollbackExcludedIds(nextExcluded);
    recomputePipelineRollbackPlan(nextExcluded);
  }

  function requestPipelineRollbackRun() {
    if (!pipelineRollbackPlan) {
      void previewPipelineRollback();
      return;
    }
    setPipelineRollbackConfirmOpen(true);
  }

  async function runPipelineRollbackPlan() {
    const plan = pipelineRollbackPlan;
    if (!plan) return;
    setPipelineRollbackConfirmOpen(false);
    setPipelineRollbackRunning(true);
    setPipelineRollbackResults([]);
    const included = plan.targets.filter((target) => !target.excluded);
    const results: PipelineRollbackRunResult[] = [];
    try {
      for (const target of included) {
        if (target.action === 'unchanged') {
          results.push({ node_id: target.node_id, label: target.label, action: target.action, status: 'skipped', message: 'Already at target transaction.' });
          continue;
        }
        try {
          if (target.action === 'force_snapshot') {
            await forceSnapshotOnNextBuild(target.dataset_rid, target.branch, {
              summary: `Pipeline rollback recovery from ${plan.root_label} at ${shortRef(plan.transaction_id)}`,
            });
            results.push({ node_id: target.node_id, label: target.label, action: target.action, status: 'succeeded', message: 'Marked for snapshot recovery on next build.' });
            continue;
          }
          if (!target.target_transaction_id) {
            results.push({ node_id: target.node_id, label: target.label, action: target.action, status: 'failed', message: 'Missing rollback target transaction.' });
            continue;
          }
          const response = await rollbackDatasetBranch(target.dataset_rid, target.branch, {
            transaction_id: target.target_transaction_id,
            summary: `Pipeline rollback from ${plan.root_label} to ${shortRef(plan.transaction_id)}`,
            confirmation: `PIPELINE ROLLBACK ${plan.branch}`,
            force_snapshot_on_next_build: !target.preserve_incrementality,
          });
          results.push({
            node_id: target.node_id,
            label: target.label,
            action: target.action,
            status: 'succeeded',
            message: `Rolled back to ${shortRef(target.target_transaction_id)}.`,
            transaction_rid: response.transaction_rid ?? response.transaction?.transaction_rid ?? null,
          });
        } catch (cause) {
          results.push({
            node_id: target.node_id,
            label: target.label,
            action: target.action,
            status: 'failed',
            message: cause instanceof Error ? cause.message : 'Rollback failed.',
          });
        }
      }
      setPipelineRollbackResults(results);
      const failures = results.filter((result) => result.status === 'failed').length;
      if (failures > 0) notifications.error(`${failures} rollback action(s) failed`);
      else notifications.success(`Pipeline rollback applied to ${results.filter((result) => result.status === 'succeeded').length} target(s)`);
      void loadGraph();
      if (selectedNode?.kind === 'dataset') void loadImpact(selectedNode.id);
    } finally {
      setPipelineRollbackRunning(false);
    }
  }

  function currentSnapshotGraphState(): LineageSnapshotGraphState | null {
    if (!viewGraph) return null;
    const hidden = new Set(hiddenColorKeys);
    const visibleNodes = viewGraph.nodes.filter((node) => !hidden.has(colorCategoryForNode(node, coloringMode, colorContext).key));
    const visibleNodeIDs = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = viewGraph.edges.filter((edge) => visibleNodeIDs.has(edge.source) && visibleNodeIDs.has(edge.target));
    return {
      captured_at: new Date().toISOString(),
      node_count: viewGraph.nodes.length,
      edge_count: viewGraph.edges.length,
      visible_node_count: visibleNodes.length,
      visible_edge_count: visibleEdges.length,
      node_ids: viewGraph.nodes.map((node) => node.id),
      edge_ids: viewGraph.edges.map((edge) => edge.id),
      visible_node_ids: visibleNodes.map((node) => node.id),
      visible_edge_ids: visibleEdges.map((edge) => edge.id),
    };
  }

  function captureSnapshot(name: string, replaceID?: string) {
    const camera = cyRef.current
      ? { zoom: cyRef.current.zoom(), pan: cyRef.current.pan() }
      : undefined;
    const graphState = currentSnapshotGraphState();
    const localID = replaceID ?? `lineage-snapshot-${Date.now()}`;
    const snapshot: SavedLineageGraphSnapshot = {
      id: localID,
      name,
      saved_at: new Date().toISOString(),
      branch,
      coloring_mode: coloringMode,
      legend_open: legendOpen,
      hidden_color_keys: hiddenColorKeys,
      find_query: findQuery,
      selected_node_ids: selectedNodeIds,
      expand_parents: expandParents,
      expand_children: expandChildren,
      layout_by_color: layoutByColor,
      group_by_color: groupByColor,
      layout_name: layoutByColor ? 'fcose' : 'breadthfirst',
      graph_state: graphState,
      camera,
      backend_id: replaceID && isBackendSnapshotId(replaceID) ? replaceID : undefined,
      share_token: null,
    };
    const next = [snapshot, ...savedSnapshots.filter((entry) => entry.id !== snapshot.id)];
    setSavedSnapshots(next);
    persistSavedLineageSnapshots(next);
    // Mirror to the backend as a best-effort write-through. The local
    // cache stays authoritative for offline / unauthenticated cases so
    // a 401 or network failure doesn't lose the snapshot.
    void mirrorSnapshotToBackend(snapshot);
    return snapshot;
  }

  async function mirrorSnapshotToBackend(snapshot: SavedLineageGraphSnapshot) {
    try {
      const created = await createSavedLineageGraph(snapshotToBackendRequest(snapshot));
      // Swap the temporary local id for the real backend id so future
      // share / delete operations hit the right row.
      setSavedSnapshots((prev) => {
        const promoted: SavedLineageGraphSnapshot = {
          ...snapshot,
          id: created.id,
          backend_id: created.id,
          saved_at: created.updated_at,
          share_token: created.share_token ?? null,
        };
        const updated = [promoted, ...prev.filter((entry) => entry.id !== snapshot.id && entry.id !== created.id)];
        persistSavedLineageSnapshots(updated);
        return updated;
      });
    } catch {
      // Silent: the local cache already holds the snapshot.
    }
  }

  function saveCurrentSnapshot() {
    const existing = savedSnapshots.find((entry) => entry.name === 'Current lineage graph');
    const snapshot = captureSnapshot('Current lineage graph', existing?.id);
    notifications.success(`Saved ${snapshot.name} with ${hiddenColorKeys.length} active filter(s)`);
  }

  function saveSnapshotAs() {
    const snapshot = captureSnapshot(`Lineage graph ${new Date().toLocaleString()}`);
    notifications.success(`Saved snapshot ${snapshot.name}`);
  }

  function restoreSnapshot(snapshot: SavedLineageGraphSnapshot, options: { silent?: boolean } = {}) {
    setBranch(snapshot.branch);
    setColoringMode(snapshot.coloring_mode);
    setLegendOpen(snapshot.legend_open);
    setHiddenColorKeys(snapshot.hidden_color_keys);
    setFindQuery(snapshot.find_query);
    setFindOpen(Boolean(snapshot.find_query));
    setExpandParents(snapshot.expand_parents);
    setExpandChildren(snapshot.expand_children);
    setLayoutByColor(snapshot.layout_by_color);
    setGroupByColor(snapshot.group_by_color);
    setSelectedNodeIds(snapshot.selected_node_ids);
    const primaryID = snapshot.selected_node_ids[snapshot.selected_node_ids.length - 1];
    const primary = viewGraph?.nodes.find((node) => node.id === primaryID) ?? null;
    setSelectedNode(primary);
    if (primary?.kind === 'dataset') {
      void loadImpact(primary.id);
      void loadPreview(primary.id);
      void loadNodeDetails(primary);
    }
    if (snapshot.camera) {
      window.setTimeout(() => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.zoom(snapshot.camera?.zoom ?? 1);
        cy.pan(snapshot.camera?.pan ?? { x: 0, y: 0 });
      }, 0);
    }
    if (!options.silent) notifications.success(`Restored ${snapshot.name}`);
  }

  function duplicateSnapshot(snapshot: SavedLineageGraphSnapshot) {
    const copy: SavedLineageGraphSnapshot = {
      ...snapshot,
      id: `lineage-snapshot-${Date.now()}`,
      name: `${snapshot.name} copy`,
      saved_at: new Date().toISOString(),
    };
    const next = [copy, ...savedSnapshots];
    setSavedSnapshots(next);
    persistSavedLineageSnapshots(next);
    notifications.success(`Duplicated ${snapshot.name}`);
  }

  async function copySnapshotLink(snapshot: SavedLineageGraphSnapshot, readOnly = false) {
    // Backend-backed snapshots get a real token-based public link. We
    // mint a fresh token on every Copy so a previously-revoked link
    // doesn't sneak back into the clipboard.
    if (snapshot.backend_id) {
      try {
        const minted = await shareSavedLineageGraph(snapshot.backend_id, { read_only: readOnly });
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const url = `${origin}/lineage?share=${encodeURIComponent(minted.token)}`;
        await copyTextToClipboard(url);
        setSavedSnapshots((prev) => {
          const next = prev.map((entry) =>
            entry.backend_id === snapshot.backend_id ? { ...entry, share_token: minted.token } : entry,
          );
          persistSavedLineageSnapshots(next);
          return next;
        });
        notifications.success(readOnly ? 'Copied presentation link' : 'Copied graph link');
        return;
      } catch (cause) {
        notifications.error(cause instanceof Error ? cause.message : 'Could not mint share link');
        return;
      }
    }
    // Local-only snapshot — fall back to the legacy URL-hash share link
    // so the user is not blocked when the backend is unreachable.
    await copyTextToClipboard(lineageSnapshotLink(snapshot.id, readOnly));
    notifications.success(readOnly ? 'Copied presentation link' : 'Copied graph link');
  }


  function exportSnapshotMetadata(snapshot: SavedLineageGraphSnapshot) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const exported = {
      exported_at: new Date().toISOString(),
      kind: 'openfoundry.lineage.graph_snapshot.v1',
      snapshot,
    };
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${snapshot.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lineage-graph'}-${snapshot.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
    notifications.success('Exported graph snapshot metadata');
  }

  function presentSnapshot(snapshot: SavedLineageGraphSnapshot) {
    navigate(`/lineage?snapshot=${encodeURIComponent(snapshot.id)}&readonly=1`);
  }

  async function revokeSnapshotShare(snapshot: SavedLineageGraphSnapshot) {
    if (!snapshot.backend_id) {
      notifications.info('This snapshot was never shared.');
      return;
    }
    try {
      await revokeSavedLineageGraphShare(snapshot.backend_id);
      setSavedSnapshots((prev) => {
        const next = prev.map((entry) =>
          entry.backend_id === snapshot.backend_id ? { ...entry, share_token: null } : entry,
        );
        persistSavedLineageSnapshots(next);
        return next;
      });
      notifications.success('Share link revoked');
    } catch (cause) {
      notifications.error(cause instanceof Error ? cause.message : 'Could not revoke share link');
    }
  }

  function deleteSnapshot(id: string) {
    const target = savedSnapshots.find((entry) => entry.id === id);
    const next = savedSnapshots.filter((entry) => entry.id !== id);
    setSavedSnapshots(next);
    persistSavedLineageSnapshots(next);
    notifications.success('Deleted lineage graph snapshot');
    if (target?.backend_id) {
      void deleteSavedLineageGraph(target.backend_id).catch(() => {
        // Silent: the local cache already removed the row; if the
        // backend ever comes back it will re-hydrate from the merge.
      });
    }
  }

  useEffect(() => {
    if (!linkedSnapshotId || restoredSnapshotIDRef.current === linkedSnapshotId) return;
    const snapshot = savedSnapshots.find((entry) => entry.id === linkedSnapshotId);
    if (!snapshot || !viewGraph) return;
    restoredSnapshotIDRef.current = linkedSnapshotId;
    restoreSnapshot(snapshot, { silent: true });
    if (readOnlyMode) {
      setActiveRightTool(null);
      setSaveMenuOpen(false);
      setColoringMenuOpen(false);
      setExpandPopoverOpen(false);
      setBottomCollapsed(true);
    }
  }, [linkedSnapshotId, readOnlyMode, savedSnapshots, viewGraph]);

  // Hydrate saved snapshots from the backend so they survive across
  // browsers / devices. Backend rows merge into the local cache by id;
  // local-only snapshots (timestamp ids) are preserved as offline copies.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await listSavedLineageGraphs();
        if (cancelled) return;
        const remote = response.data.map(backendRowToSnapshot);
        setSavedSnapshots((prev) => {
          const remoteIDs = new Set(remote.map((entry) => entry.id));
          const localOnly = prev.filter(
            (entry) => !entry.backend_id && !remoteIDs.has(entry.id),
          );
          const merged = [...remote, ...localOnly].sort(
            (a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at),
          );
          persistSavedLineageSnapshots(merged);
          return merged;
        });
      } catch {
        // Silent: localStorage is the safety net while the backend is down.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Open the public viewer when a ?share=<token> link is loaded. The
  // hydrated snapshot is injected into the local cache so the existing
  // `?snapshot=<id>` machinery picks it up without further plumbing.
  useEffect(() => {
    if (!sharedToken || restoredSnapshotIDRef.current === sharedToken) return;
    let cancelled = false;
    (async () => {
      try {
        const shared = await getSharedLineageGraph(sharedToken);
        if (cancelled) return;
        const snapshot = backendRowToSnapshot({
          id: shared.id,
          name: shared.name,
          branch: shared.branch,
          coloring_mode: shared.coloring_mode,
          payload: shared.payload,
          updated_at: shared.updated_at,
          share_token: sharedToken,
        });
        restoredSnapshotIDRef.current = sharedToken;
        setSavedSnapshots((prev) => [snapshot, ...prev.filter((entry) => entry.id !== snapshot.id)]);
        restoreSnapshot(snapshot, { silent: true });
        setActiveRightTool(null);
        setSaveMenuOpen(false);
        setColoringMenuOpen(false);
        setExpandPopoverOpen(false);
        setBottomCollapsed(true);
      } catch (cause) {
        notifications.error(
          cause instanceof Error ? cause.message : 'Share link not found or revoked',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedToken, viewGraph]);

  // ---------------------------------------------------------------------------
  // Zoom / fit controls
  // ---------------------------------------------------------------------------

  function zoomBy(factor: number) {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }
  function fitGraph() {
    cyRef.current?.fit(undefined, 40);
  }
  function recenterGraph() {
    cyRef.current?.center();
  }

  // ---------------------------------------------------------------------------
  // Derived counts for ribbon + legend
  // ---------------------------------------------------------------------------

  const sensitiveCandidateCount =
    impact?.build_candidates.filter((c) => c.requires_acknowledgement).length ?? 0;

  const legendEntries = useMemo<LegendEntry[]>(() => {
    if (!viewGraph) return [];
    const hidden = new Set(hiddenColorKeys);
    const byKey = new Map<string, LegendEntry>();
    for (const node of viewGraph.nodes) {
      const category = colorCategoryForNode(node, coloringMode, colorContext);
      const existing = byKey.get(category.key);
      if (existing) {
        existing.count += 1;
      } else {
        byKey.set(category.key, { ...category, count: 1, hidden: hidden.has(category.key) });
      }
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [viewGraph, coloringMode, colorContext, hiddenColorKeys]);

  const multiSelectActionDisabled = selectedNodeIds.length < 2;
  const expandFromSeedsDisabled =
    selectedNodeIds.length === 0 || expandParents + expandChildren === 0;

  const branchOptions = useMemo<string[]>(() => {
    const defaults = ['master', 'main', 'develop', 'staging'];
    const found = new Set<string>(defaults);
    found.add(branch);
    if (viewGraph) {
      for (const node of viewGraph.nodes) {
        const value = node.metadata?.['branch'];
        if (typeof value === 'string' && value.length > 0) found.add(value);
      }
      for (const edge of viewGraph.edges) {
        const value = edge.metadata?.['branch'];
        if (typeof value === 'string' && value.length > 0) found.add(value);
      }
    }
    return [...found];
  }, [viewGraph, branch]);

  // Per-node count of non-core neighbors. Used by NodeBadgeOverlay to
  // render a right-edge "→" shortcut that opens the Related items
  // drawer focused on that node — matches Foundry's hover-on-arrow
  // affordance documented for the Data Lineage app.
  const relatedShortcutByNode = useMemo<Record<string, NodeRelatedShortcut>>(() => {
    if (!viewGraph) return {};
    const counts = new Map<string, Set<string>>();
    for (const edge of viewGraph.edges) {
      if (!CORE_LINEAGE_KINDS.has(edge.target_kind) && CORE_LINEAGE_KINDS.has(edge.source_kind)) {
        let set = counts.get(edge.source);
        if (!set) {
          set = new Set();
          counts.set(edge.source, set);
        }
        set.add(edge.target);
      }
      if (!CORE_LINEAGE_KINDS.has(edge.source_kind) && CORE_LINEAGE_KINDS.has(edge.target_kind)) {
        let set = counts.get(edge.target);
        if (!set) {
          set = new Set();
          counts.set(edge.target, set);
        }
        set.add(edge.source);
      }
    }
    const result: Record<string, NodeRelatedShortcut> = {};
    for (const [nodeId, neighbors] of counts.entries()) {
      result[nodeId] = {
        count: neighbors.size,
        onClick: () => {
          const node = viewGraph.nodes.find((n) => n.id === nodeId);
          if (!node) return;
          setSelectedNodeIds([nodeId]);
          setSelectedNode(node);
          setActiveRightTool('related');
        },
      };
    }
    return result;
  }, [viewGraph]);

  const nodeBadges = useMemo<Record<string, NodeBadgeSpec[]>>(() => {
    if (!viewGraph) return {};
    const labelByNodeId = new Map(viewGraph.nodes.map((node) => [node.id, node.label]));
    const map: Record<string, NodeBadgeSpec[]> = {};
    for (const node of viewGraph.nodes) {
      const badges: NodeBadgeSpec[] = [];
      if (node.kind === 'object_type') {
        badges.push({ kind: 'object-type', tooltip: `Object type: ${node.label}` });
      }
      if (node.kind === 'dataset') {
        const writebackSources = new Set<string>();
        const backingTargets = new Set<string>();
        for (const edge of viewGraph.edges) {
          if (edge.source === node.id && edge.target_kind === 'object_type') {
            backingTargets.add(edge.target);
          }
          if (edge.target === node.id && edge.source_kind === 'object_type') {
            writebackSources.add(edge.source);
          }
        }
        if (backingTargets.size > 0) {
          const names = [...backingTargets].map((id) => labelByNodeId.get(id) ?? id);
          const namesLabel = names.join(', ');
          badges.push({
            kind: 'backing',
            tooltip:
              backingTargets.size === 1
                ? `This dataset is used to create the Ontology object [${namesLabel}]`
                : `This dataset is used to create ${backingTargets.size} Ontology objects: ${namesLabel}`,
          });
        }
        if (writebackSources.size > 0) {
          const names = [...writebackSources].map((id) => labelByNodeId.get(id) ?? id);
          const namesLabel = names.join(', ');
          badges.push({
            kind: 'writeback',
            tooltip:
              writebackSources.size === 1
                ? `This dataset receives writeback from the Ontology object [${namesLabel}]`
                : `This dataset receives writeback from ${writebackSources.size} Ontology objects: ${namesLabel}`,
          });
        }
      }
      if (badges.length > 0) map[node.id] = badges;
    }
    return map;
  }, [viewGraph]);

  const expandPreview = useMemo(() => {
    if (!viewGraph) {
      return { inBetween: 0, commonAncestors: 0, commonDescendants: 0, expandFromSeeds: 0 };
    }
    return {
      inBetween: inBetweenNodes(selectedNodeIds, viewGraph).size,
      commonAncestors: commonAncestors(selectedNodeIds, viewGraph).size,
      commonDescendants: commonDescendants(selectedNodeIds, viewGraph).size,
      expandFromSeeds:
        selectedNodeIds.length === 0
          ? 0
          : expandFromSeeds(selectedNodeIds, viewGraph, expandParents, expandChildren).size,
    };
  }, [viewGraph, selectedNodeIds, expandParents, expandChildren]);

  // -------------------------------------------------------------------------
  // Properties / Histogram (right sidebar) — computed from current selection.
  // -------------------------------------------------------------------------

  const histogramSections = useMemo<HistogramSection[]>(() => {
    if (!viewGraph || selectedNodeIds.length < 2) return [];
    return computeSelectionHistogram({
      nodes: viewGraph.nodes,
      selectedNodeIds,
      schemaByDatasetId,
    });
  }, [viewGraph, selectedNodeIds, schemaByDatasetId]);

  const highlightedHistogramIds = useMemo<string[]>(() => {
    if (histogramFilters.length === 0 || histogramSections.length === 0) return [];
    // Group filters by section, then OR within section + AND across sections.
    const bySection = new Map<string, Set<string>>();
    for (const filter of histogramFilters) {
      const section = histogramSections.find((s) => s.id === filter.sectionId);
      const row = section?.rows.find((r) => r.value === filter.value);
      if (!row) continue;
      let existing = bySection.get(filter.sectionId);
      if (!existing) {
        existing = new Set<string>();
        bySection.set(filter.sectionId, existing);
      }
      for (const id of row.nodeIds) existing.add(id);
    }
    let intersection: Set<string> | null = null;
    for (const set of bySection.values()) {
      if (intersection === null) {
        intersection = new Set(set);
      } else {
        const next = new Set<string>();
        for (const id of intersection) if (set.has(id)) next.add(id);
        intersection = next;
      }
      if (intersection.size === 0) break;
    }
    return intersection ? [...intersection] : [];
  }, [histogramFilters, histogramSections]);

  // Apply a CSS class to highlighted nodes so the canvas reflects active filters.
  useEffect(() => {
    const cy = cyInstance;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().removeClass('histogram-match');
      if (highlightedHistogramIds.length === 0) return;
      for (const id of highlightedHistogramIds) cy.$id(id).addClass('histogram-match');
    });
  }, [cyInstance, highlightedHistogramIds]);

  // Reset histogram filters when selection drops below the multi-select
  // threshold; otherwise stale filters reference nodes that are no longer
  // grouped together in the histogram.
  useEffect(() => {
    if (selectedNodeIds.length < 2 && histogramFilters.length > 0) {
      setHistogramFilters([]);
    }
  }, [selectedNodeIds, histogramFilters.length]);

  const relatedObjectTypes = useMemo<RelatedObjectType[]>(() => {
    if (!viewGraph || !selectedNode) return [];
    const labelById = new Map(viewGraph.nodes.map((node) => [node.id, node.label]));
    if (selectedNode.kind === 'object_type') return [];
    if (selectedNode.kind !== 'dataset') return [];
    const out: RelatedObjectType[] = [];
    const seen = new Set<string>();
    for (const edge of viewGraph.edges) {
      if (edge.source === selectedNode.id && edge.target_kind === 'object_type') {
        if (seen.has(edge.target)) continue;
        seen.add(edge.target);
        out.push({ id: edge.target, label: labelById.get(edge.target) ?? edge.target, relation: 'backing' });
      } else if (edge.target === selectedNode.id && edge.source_kind === 'object_type') {
        if (seen.has(edge.source)) continue;
        seen.add(edge.source);
        out.push({ id: edge.source, label: labelById.get(edge.source) ?? edge.source, relation: 'writeback' });
      }
    }
    return out;
  }, [viewGraph, selectedNode]);

  const propertiesSchemaRows = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== 'dataset') return [];
    return schemaRows(nodeDetails.schema, datasetPreview);
  }, [selectedNode, nodeDetails.schema, datasetPreview]);

  const columnsAvailable = useMemo(() => {
    if (selectedNodeIds.length < 2) return true;
    if (!viewGraph) return false;
    for (const id of selectedNodeIds) {
      const node = viewGraph.nodes.find((n) => n.id === id);
      if (node?.kind === 'dataset' && !schemaByDatasetId[id]) return false;
    }
    return true;
  }, [selectedNodeIds, schemaByDatasetId, viewGraph]);

  const loadColumnsForSelection = useCallback(async () => {
    if (!viewGraph) return;
    const targets = selectedNodeIds
      .map((id) => viewGraph.nodes.find((n) => n.id === id))
      .filter((n): n is LineageNode => Boolean(n) && n!.kind === 'dataset')
      .filter((n) => !schemaByDatasetId[n.id]);
    if (targets.length === 0) return;
    setSchemaFetchingDatasetIds((prev) => {
      const next = new Set(prev);
      for (const t of targets) next.add(t.id);
      return next;
    });
    const results = await Promise.allSettled(
      targets.map(async (t) => [t.id, await getDatasetSchemaForBranch(t.id, branchRef.current)] as const),
    );
    setSchemaByDatasetId((prev) => {
      const next = { ...prev };
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [id, schema] = result.value;
          next[id] = schema as HistogramSchemaLike;
        }
      }
      return next;
    });
    setSchemaFetchingDatasetIds((prev) => {
      const next = new Set(prev);
      for (const t of targets) next.delete(t.id);
      return next;
    });
  }, [viewGraph, selectedNodeIds, schemaByDatasetId]);

  const handleToggleHistogramFilter = useCallback((filter: HistogramFilter) => {
    setHistogramFilters((prev) => {
      const exists = prev.find((f) => f.sectionId === filter.sectionId && f.value === filter.value);
      if (exists) return prev.filter((f) => f !== exists);
      return [...prev, filter];
    });
  }, []);

  const handleUpdateSelectionFromHistogram = useCallback(() => {
    if (highlightedHistogramIds.length === 0 || !viewGraph) return;
    const ids = highlightedHistogramIds;
    setSelectedNodeIds(ids);
    const lastId = ids[ids.length - 1];
    const primary = viewGraph.nodes.find((n) => n.id === lastId) ?? null;
    setSelectedNode(primary);
    setHistogramFilters([]);
    notifications.success(`Updated selection to ${ids.length} node(s)`);
  }, [highlightedHistogramIds, viewGraph]);

  const handleCopyNodeNames = useCallback(async () => {
    if (!viewGraph || selectedNodeIds.length === 0) return;
    const labels = selectedNodeIds
      .map((id) => viewGraph.nodes.find((n) => n.id === id)?.label ?? '')
      .filter(Boolean);
    await copyTextToClipboard(labels.join(', '));
    notifications.success(`Copied ${labels.length} resource name(s)`);
  }, [viewGraph, selectedNodeIds]);

  const handleOpenInOntologyManager = useCallback((objectTypeId: string) => {
    navigate(`/ontology-manager?object_type=${encodeURIComponent(objectTypeId)}`);
  }, [navigate]);

  const handleOpenDataset = useCallback((node: LineageNode) => {
    const href = datasetHrefForNode(node);
    if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener');
  }, []);

  // ----- Persistent node descriptions --------------------------------------

  const loadNodeDescription = useCallback(async (nodeId: string) => {
    setNodeDescriptionLoading((prev) => ({ ...prev, [nodeId]: true }));
    try {
      const desc = await getNodeDescription(nodeId);
      setNodeDescriptions((prev) => ({ ...prev, [nodeId]: desc }));
    } catch {
      // 404 / unauth → mark as "none captured" so the UI shows the
      // Add-description CTA instead of a spinner.
      setNodeDescriptions((prev) => ({ ...prev, [nodeId]: null }));
    } finally {
      setNodeDescriptionLoading((prev) => ({ ...prev, [nodeId]: false }));
    }
  }, []);

  useEffect(() => {
    if (!selectedNode) return;
    if (nodeDescriptions[selectedNode.id] !== undefined) return;
    void loadNodeDescription(selectedNode.id);
  }, [selectedNode, nodeDescriptions, loadNodeDescription]);

  const handleSaveNodeDescription = useCallback(async (node: LineageNode) => {
    if (typeof window === 'undefined') return;
    const existing = nodeDescriptions[node.id]?.description ?? '';
    const next = window.prompt(`Description for ${node.label}`, existing);
    if (next === null) return; // cancelled
    try {
      const upserted = await upsertNodeDescription(node.id, { description: next });
      if (upserted) {
        setNodeDescriptions((prev) => ({ ...prev, [node.id]: upserted }));
        notifications.success('Description saved');
      } else {
        // Backend returned 204 → trimmed body was empty, row deleted.
        setNodeDescriptions((prev) => ({ ...prev, [node.id]: null }));
        notifications.success('Description cleared');
      }
    } catch (cause) {
      notifications.error(cause instanceof Error ? cause.message : 'Could not save description');
    }
  }, [nodeDescriptions]);

  const handleClearNodeDescription = useCallback(async (node: LineageNode) => {
    try {
      await deleteNodeDescription(node.id);
      setNodeDescriptions((prev) => ({ ...prev, [node.id]: null }));
      notifications.success('Description cleared');
    } catch (cause) {
      notifications.error(cause instanceof Error ? cause.message : 'Could not clear description');
    }
  }, []);

  // ----- Related items ------------------------------------------------------

  const relatedArtifactsAll = useMemo<RelatedArtifact[]>(() => {
    if (!viewGraph || selectedNodeIds.length === 0) return [];
    return collectRelatedArtifacts({
      nodes: viewGraph.nodes,
      edges: viewGraph.edges,
      selectedNodeIds,
      includeAutosaved: relatedShowAutosaved,
      includeTrash: relatedShowTrash,
    });
  }, [viewGraph, selectedNodeIds, relatedShowAutosaved, relatedShowTrash]);

  const relatedDistinctKinds = useMemo(
    () => distinctRelatedKinds(relatedArtifactsAll),
    [relatedArtifactsAll],
  );

  const relatedIncludedKinds = useMemo(() => {
    if (relatedDistinctKinds.length === 0) return new Set<string>();
    return new Set(relatedDistinctKinds.filter((k) => !relatedExcludedKinds.has(k)));
  }, [relatedDistinctKinds, relatedExcludedKinds]);

  const relatedArtifactsVisible = useMemo<RelatedArtifact[]>(() => {
    const filtered = relatedArtifactsAll.filter((item) => relatedIncludedKinds.has(item.kind));
    return sortRelatedArtifacts(filtered, relatedSort);
  }, [relatedArtifactsAll, relatedIncludedKinds, relatedSort]);

  const handleRelatedToggleKind = useCallback((kind: string) => {
    setRelatedExcludedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const handleRelatedIncludeAllKinds = useCallback(() => {
    setRelatedExcludedKinds(new Set());
  }, []);

  const handleRelatedFocusOnGraph = useCallback((item: RelatedArtifact) => {
    const cy = cyRef.current;
    if (!cy) return;
    const element = cy.$id(item.id);
    if (element.length === 0) return;
    cy.center(element);
    cy.animate({ zoom: Math.max(cy.zoom(), 1) }, { duration: 200 });
    const node = graphRef.current?.nodes.find((n) => n.id === item.id);
    if (node) {
      setSelectedNodeIds([item.id]);
      setSelectedNode(node);
    }
  }, []);

  // ----- Build timeline -----------------------------------------------------

  const pipelineDatasetMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!viewGraph) return map;
    for (const edge of viewGraph.edges) {
      // pipeline node → dataset node means the pipeline produces that dataset.
      if (edge.source_kind === 'pipeline' && edge.target_kind === 'dataset') {
        const existing = map.get(edge.source);
        if (existing) {
          if (!existing.includes(edge.target)) existing.push(edge.target);
        } else {
          map.set(edge.source, [edge.target]);
        }
      }
    }
    return map;
  }, [viewGraph]);

  const datasetLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!viewGraph) return map;
    for (const node of viewGraph.nodes) {
      if (node.kind === 'dataset') map.set(node.id, node.label);
    }
    return map;
  }, [viewGraph]);

  const selectedDatasetIds = useMemo(
    () =>
      selectedNodeIds.filter((id) => {
        const node = viewGraph?.nodes.find((n) => n.id === id);
        return node?.kind === 'dataset';
      }),
    [selectedNodeIds, viewGraph],
  );

  const lastBuiltAtByPipeline = useMemo(() => {
    const map = new Map<string, string>();
    for (const build of graphBuilds) {
      const ts = build.finished_at ?? build.started_at;
      if (!ts) continue;
      const existing = map.get(build.pipeline_rid);
      if (!existing || ts > existing) {
        map.set(build.pipeline_rid, ts);
      }
    }
    return map;
  }, [graphBuilds]);

  const buildTimelineResult = useMemo(
    () =>
      computeBuildTimeline({
        builds: graphBuilds,
        pipelineDatasetMap,
        datasetLabelMap,
        selectedDatasetIds,
        rangeKey: buildTimelineRange,
        colorBy: buildTimelineColorBy,
      }),
    [graphBuilds, pipelineDatasetMap, datasetLabelMap, selectedDatasetIds, buildTimelineRange, buildTimelineColorBy],
  );

  // ----- Selection tools ---------------------------------------------------

  const setSelectionToIds = useCallback((ids: string[]) => {
    if (!viewGraph) return;
    if (ids.length === 0) {
      setSelectedNodeIds([]);
      setSelectedNode(null);
      return;
    }
    const next = [...new Set(ids)];
    setSelectedNodeIds(next);
    const primaryId = next[next.length - 1];
    const primary = viewGraph.nodes.find((n) => n.id === primaryId) ?? null;
    setSelectedNode(primary);
  }, [viewGraph]);

  const handleSelectAll = useCallback(() => {
    if (!viewGraph) return;
    setSelectionToIds(viewGraph.nodes.map((n) => n.id));
    setSelectPopoverOpen(false);
    notifications.success(`Selected ${viewGraph.nodes.length} node(s)`);
  }, [viewGraph, setSelectionToIds]);

  const handleInvertSelection = useCallback(() => {
    if (!viewGraph) return;
    const current = new Set(selectedNodeIdsRef.current);
    const inverted = viewGraph.nodes.map((n) => n.id).filter((id) => !current.has(id));
    setSelectionToIds(inverted);
    setSelectPopoverOpen(false);
    notifications.success(`Inverted to ${inverted.length} node(s)`);
  }, [viewGraph, setSelectionToIds]);

  const handleSelectChildren = useCallback(() => {
    if (!viewGraph || selectedNodeIdsRef.current.length === 0) return;
    const additions = expandFromSeeds(selectedNodeIdsRef.current, viewGraph, 0, 1);
    if (additions.size === 0) {
      notifications.info('No direct children to add');
      setSelectPopoverOpen(false);
      return;
    }
    setSelectionToIds([...selectedNodeIdsRef.current, ...additions]);
    setSelectPopoverOpen(false);
    notifications.success(`Added ${additions.size} child node(s)`);
  }, [viewGraph, setSelectionToIds]);

  const handleSelectParents = useCallback(() => {
    if (!viewGraph || selectedNodeIdsRef.current.length === 0) return;
    const additions = expandFromSeeds(selectedNodeIdsRef.current, viewGraph, 1, 0);
    if (additions.size === 0) {
      notifications.info('No direct parents to add');
      setSelectPopoverOpen(false);
      return;
    }
    setSelectionToIds([...selectedNodeIdsRef.current, ...additions]);
    setSelectPopoverOpen(false);
    notifications.success(`Added ${additions.size} parent node(s)`);
  }, [viewGraph, setSelectionToIds]);

  const nodeContextMenuItems = useMemo<NodeContextMenuItem[]>(() => {
    if (!nodeContextMenu) return [];
    const node = viewGraph?.nodes.find((n) => n.id === nodeContextMenu.nodeId);
    if (!node) return [];
    const isDataset = node.kind === 'dataset';
    const isObjectType = node.kind === 'object_type';
    return [
      {
        id: 'expand-node',
        label: 'Expand node…',
        hint: 'Open the Expand popover anchored at this node',
        onSelect: () => {
          setSelectedNodeIds([node.id]);
          setSelectedNode(node);
          setExpandPopoverOpen(true);
        },
      },
      {
        id: 'expand-parents',
        label: 'Expand parents',
        hint: 'Walk one hop upstream and add to selection',
        onSelect: () => {
          if (!viewGraph) return;
          const additions = expandFromSeeds([node.id], viewGraph, 1, 0);
          setSelectedNodeIds([node.id, ...additions]);
          setSelectedNode(node);
        },
      },
      {
        id: 'expand-descendants',
        label: 'Expand descendants',
        hint: 'Walk one hop downstream and add to selection',
        onSelect: () => {
          if (!viewGraph) return;
          const additions = expandFromSeeds([node.id], viewGraph, 0, 1);
          setSelectedNodeIds([node.id, ...additions]);
          setSelectedNode(node);
        },
      },
      {
        id: 'view-properties',
        label: 'View node properties',
        hint: 'Open the properties drawer on the right',
        onSelect: () => {
          setActiveRightTool('properties');
        },
      },
      {
        id: 'view-related',
        label: 'View related items',
        hint: 'Open the related artifacts drawer',
        onSelect: () => {
          setActiveRightTool('related');
        },
      },
      {
        id: 'open-in-app',
        label: isObjectType ? 'Open in Ontology Manager' : 'Open in app',
        disabled: !isDataset && !isObjectType,
        onSelect: () => {
          if (isObjectType) {
            navigate(`/ontology-manager?object_type=${encodeURIComponent(node.id)}`);
          } else if (isDataset) {
            const href = datasetHrefForNode(node);
            if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener');
          }
        },
      },
      {
        id: 'remove-from-graph',
        label: 'Remove from graph',
        hint: 'Hide this node in the current view',
        variant: 'danger',
        onSelect: () => {
          const cy = cyRef.current;
          if (!cy) return;
          cy.$id(node.id).remove();
        },
      },
    ];
  }, [nodeContextMenu, viewGraph, navigate]);

  const handleRelatedOpenArtifact = useCallback((item: RelatedArtifact) => {
    if (typeof window === 'undefined') return;
    const meta = (graphRef.current?.nodes.find((n) => n.id === item.id)?.metadata ?? {}) as Record<string, unknown>;
    const links = meta.links;
    if (links && typeof links === 'object' && !Array.isArray(links)) {
      for (const key of ['self', 'open', 'view']) {
        const value = (links as Record<string, unknown>)[key];
        if (typeof value === 'string' && value) {
          window.open(value, '_blank', 'noopener');
          return;
        }
      }
    }
    // Fallback: route by kind.
    switch (item.kind) {
      case 'object_type':
        window.open(`/ontology-manager?object_type=${encodeURIComponent(item.id)}`, '_blank', 'noopener');
        return;
      case 'application':
        window.open(`/apps/${encodeURIComponent(item.id)}`, '_blank', 'noopener');
        return;
      case 'function':
        window.open(`/compute-modules/${encodeURIComponent(item.id)}`, '_blank', 'noopener');
        return;
      default:
        notifications.info(`No deep link configured for ${item.kind}`);
    }
  }, []);

  const applyExpandSelection = useCallback(
    (newIds: Iterable<string>, label: string) => {
      const additions = [...newIds].filter((id) => !selectedNodeIdsRef.current.includes(id));
      if (additions.length === 0) {
        notifications.info(`No new ${label} to add`);
        return;
      }
      const nextIds = [...selectedNodeIdsRef.current, ...additions];
      const lastId = nextIds[nextIds.length - 1];
      const primary = graphRef.current?.nodes.find((entry) => entry.id === lastId) ?? null;
      setSelectedNodeIds(nextIds);
      if (primary) setSelectedNode(primary);
      notifications.success(`Added ${additions.length} ${label}`);
      window.setTimeout(() => {
        const cy = cyRef.current;
        if (!cy) return;
        const collection = cy.collection();
        for (const id of nextIds) collection.merge(cy.$id(id));
        if (collection.length > 0) cy.fit(collection, 60);
      }, 0);
    },
    [],
  );

  const handleAddInBetween = useCallback(() => {
    if (!viewGraph || selectedNodeIdsRef.current.length < 2) return;
    applyExpandSelection(inBetweenNodes(selectedNodeIdsRef.current, viewGraph), 'in-between node(s)');
    setExpandPopoverOpen(false);
  }, [viewGraph, applyExpandSelection]);

  const handleAddCommonAncestors = useCallback(() => {
    if (!viewGraph || selectedNodeIdsRef.current.length < 2) return;
    applyExpandSelection(commonAncestors(selectedNodeIdsRef.current, viewGraph), 'common ancestor(s)');
    setExpandPopoverOpen(false);
  }, [viewGraph, applyExpandSelection]);

  const handleAddCommonDescendants = useCallback(() => {
    if (!viewGraph || selectedNodeIdsRef.current.length < 2) return;
    applyExpandSelection(commonDescendants(selectedNodeIdsRef.current, viewGraph), 'common descendant(s)');
    setExpandPopoverOpen(false);
  }, [viewGraph, applyExpandSelection]);

  const handleExpandFromSeeds = useCallback(() => {
    if (!viewGraph || selectedNodeIdsRef.current.length === 0) return;
    applyExpandSelection(
      expandFromSeeds(selectedNodeIdsRef.current, viewGraph, expandParents, expandChildren),
      'expansion node(s)',
    );
    setExpandPopoverOpen(false);
  }, [viewGraph, expandParents, expandChildren, applyExpandSelection]);

  useEffect(() => {
    const cy = cyInstance;
    if (!cy) return;
    cy.boxSelectionEnabled(panSelectMode === 'select');
    cy.userPanningEnabled(panSelectMode === 'pan');
  }, [cyInstance, panSelectMode]);

  // Flow tool — rotates the laid-out positions in 90° increments so the
  // dependency direction can be flipped LR/TB/RL/BT without re-running
  // the layout from scratch. We track the quarter currently applied to
  // the on-screen positions; when the graph re-layouts (`layoutstop`)
  // we reset the tracker to 0 so the next rotation is applied to the
  // fresh positions instead of double-rotating.
  const flowQuarterAppliedRef = useRef<0 | 1 | 2 | 3>(0);
  useEffect(() => {
    const cy = cyInstance;
    if (!cy) return;
    const onLayoutStop = () => {
      flowQuarterAppliedRef.current = 0;
      if (flowQuarter === 0) return;
      cy.batch(() => {
        cy.nodes().forEach((node) => {
          const { x, y } = node.position();
          let nx = x;
          let ny = y;
          for (let i = 0; i < flowQuarter; i++) {
            const ox = nx;
            nx = -ny;
            ny = ox;
          }
          node.position({ x: nx, y: ny });
        });
      });
      flowQuarterAppliedRef.current = flowQuarter;
      cy.fit(undefined, 40);
    };
    cy.on('layoutstop', onLayoutStop);
    return () => {
      cy.off('layoutstop', onLayoutStop);
    };
  }, [cyInstance, flowQuarter]);

  // Apply the rotation eagerly when the user toggles the Flow direction
  // without waiting for a re-layout.
  useEffect(() => {
    const cy = cyInstance;
    if (!cy) return;
    const delta = ((flowQuarter - flowQuarterAppliedRef.current) + 4) % 4;
    if (delta === 0) return;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        const { x, y } = node.position();
        let nx = x;
        let ny = y;
        for (let i = 0; i < delta; i++) {
          const ox = nx;
          nx = -ny;
          ny = ox;
        }
        node.position({ x: nx, y: ny });
      });
    });
    flowQuarterAppliedRef.current = flowQuarter;
    cy.fit(undefined, 40);
  }, [cyInstance, flowQuarter]);

  useEffect(() => {
    if (readOnlyMode) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // Question-mark opens the shortcuts modal (without a modifier).
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !inInput) {
        event.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) return;
      if (inInput) return;
      const key = event.key.toLowerCase();
      if (key === 'b') {
        event.preventDefault();
        handleAddInBetween();
      } else if (key === 'j') {
        event.preventDefault();
        handleAddCommonAncestors();
      } else if (key === 'k') {
        event.preventDefault();
        handleAddCommonDescendants();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [readOnlyMode, handleAddInBetween, handleAddCommonAncestors, handleAddCommonDescendants]);

  const presentationSnapshot = linkedSnapshotId ? savedSnapshots.find((entry) => entry.id === linkedSnapshotId) ?? null : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="lineage-app" style={readOnlyMode ? presentationPageRoot : pageRoot}>
      {!readOnlyMode && (
        <>
          <LineageHeader
            branch={branch}
            branchOptions={branchOptions}
            branchMenuOpen={branchMenuOpen}
            onBranchClick={() => setBranchMenuOpen((v) => !v)}
            onBranchSelect={(b) => {
              setBranch(b);
              setBuildHelperPlan(null);
              setBuildHelperResults([]);
              setBranchMenuOpen(false);
            }}
            saveMenuOpen={saveMenuOpen}
            onSaveClick={saveCurrentSnapshot}
            onSaveCaretClick={() => setSaveMenuOpen((v) => !v)}
            onSaveAs={() => {
              setSaveMenuOpen(false);
              saveSnapshotAs();
            }}
            onOpenGraph={() => {
              setSaveMenuOpen(false);
              setActiveRightTool('clipboard');
            }}
            onExportSvg={() => {
              setSaveMenuOpen(false);
              const cy = cyRef.current;
              if (!cy) {
                notifications.error('Graph is not ready yet');
                return;
              }
              const filename = `lineage-${branch}-${new Date().toISOString().slice(0, 10)}`;
              downloadCytoscapeSvg(cy, filename, `Lineage · ${branch}`);
              notifications.success('Exported graph to SVG');
            }}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            helpMenuOpen={helpMenuOpen}
            onHelpMenuClick={() => setHelpMenuOpen((v) => !v)}
            onStartTour={() => {
              setHelpMenuOpen(false);
              notifications.info('Product tour is coming soon');
            }}
          />

          <Ribbon
            selectedNode={selectedNode}
            selectedNodeCount={selectedNodeIds.length}
            panSelectMode={panSelectMode}
            onPanSelectModeChange={setPanSelectMode}
            onClean={() => {
              clearSelection();
              setFindQuery('');
              setFindOpen(false);
            }}
            selectPopoverOpen={selectPopoverOpen}
            onSelectClick={() => setSelectPopoverOpen((v) => !v)}
            onSelectAll={handleSelectAll}
            onInvertSelection={handleInvertSelection}
            onSelectChildren={handleSelectChildren}
            onSelectParents={handleSelectParents}
            onSelectFocus={() => {
              setSelectPopoverOpen(false);
              if (selectedNode && cyRef.current) {
                cyRef.current.center(cyRef.current.$id(selectedNode.id));
              }
            }}
            expandPopoverOpen={expandPopoverOpen}
            onExpandClick={() => setExpandPopoverOpen((v) => !v)}
            expandParents={expandParents}
            expandChildren={expandChildren}
            onExpandParentsChange={setExpandParents}
            onExpandChildrenChange={setExpandChildren}
            onExpandApply={handleExpandFromSeeds}
            onAddInBetween={handleAddInBetween}
            onAddCommonAncestors={handleAddCommonAncestors}
            onAddCommonDescendants={handleAddCommonDescendants}
            expandPreview={expandPreview}
            multiSelectActionDisabled={multiSelectActionDisabled}
            expandFromSeedsDisabled={expandFromSeedsDisabled}
            onColorClick={() => setColoringMenuOpen((v) => !v)}
            coloringMenuOpen={coloringMenuOpen}
            coloringMode={coloringMode}
            onColoringChange={(mode) => {
              setColoringMode(mode);
              setColoringMenuOpen(false);
            }}
            findOpen={findOpen}
            onFindClick={() => setFindOpen((v) => !v)}
            findQuery={findQuery}
            onFindQueryChange={setFindQuery}
            findMode={findMode}
            onFindModeChange={setFindMode}
            columnIndexLoading={columnIndexLoading}
            onRemoveClick={() => {
              if (!selectedNode || !cyRef.current) return;
              cyRef.current.$id(selectedNode.id).remove();
              clearSelection();
              notifications.success('Removed from graph');
            }}
            onAlignClick={() => fitGraph()}
            layoutByColor={layoutByColor}
            onLayoutByColorClick={() => setLayoutByColor((v) => !v)}
            groupByColor={groupByColor}
            onGroupByColorClick={() => setGroupByColor((v) => !v)}
            legendOpen={legendOpen}
            onLegendToggle={() => setLegendOpen((v) => !v)}
            onRefresh={() => void loadGraph()}
            flowQuarter={flowQuarter}
            onFlowToggle={() => setFlowQuarter((v) => (((v + 1) % 4) as 0 | 1 | 2 | 3))}
            layoutMenuOpen={layoutMenuOpen}
            layoutMode={layoutMode}
            onLayoutMenuClick={() => setLayoutMenuOpen((v) => !v)}
            onLayoutModeChange={(mode) => {
              setLayoutMode(mode);
              setLayoutMenuOpen(false);
            }}
          />
        </>
      )}

      <div style={readOnlyMode ? presentationCanvasShell : canvasShell}>
        <div style={canvasArea}>
          {readOnlyMode && (
            <div style={presentationBanner} className="of-panel">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {presentationSnapshot?.name ?? 'Lineage graph'}
                </div>
                <div className="of-eyebrow" style={{ marginTop: 3 }}>
                  Read-only · {branch} · {COLORING_OPTIONS.find((option) => option.value === coloringMode)?.label}
                </div>
              </div>
              <button type="button" className="of-button" style={{ fontSize: 11 }} onClick={() => navigate('/lineage')}>
                Exit
              </button>
            </div>
          )}

          {error && (
            <div className="of-status-danger" style={errorBanner}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={emptyState}>Loading lineage graph…</div>
          ) : !viewGraph || viewGraph.nodes.length === 0 ? (
            <div style={emptyState}>No lineage data yet. Run a pipeline or workflow to populate the graph.</div>
          ) : (
            <>
              <CytoscapeCanvas
                elements={elements}
                stylesheet={STYLESHEET}
                layout={layout}
                height="100%"
                onReady={handleCytoscapeReady}
                className="lineage-canvas"
              />
              <NodeBadgeOverlay
                cy={cyInstance}
                badgesByNode={nodeBadges}
                relatedShortcutByNode={relatedShortcutByNode}
              />
              {nodeContextMenu && (
                <NodeContextMenu
                  anchor={nodeContextMenu}
                  items={nodeContextMenuItems}
                  onClose={() => setNodeContextMenu(null)}
                />
              )}
            </>
          )}

          {legendOpen && legendEntries.length > 0 && (
            <div style={legendCard} className="of-panel">
              <div style={legendHeader}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1f252d' }}>
                  {COLORING_OPTIONS.find((option) => option.value === coloringMode)?.label}
                </span>
                {legendEntries.some((entry) => entry.hidden) && (
                  <button type="button" style={legendClearBtn} onClick={clearLegendFilters}>
                    Clear filters
                  </button>
                )}
              </div>
              {legendEntries.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  style={{ ...legendItem, ...(entry.hidden ? legendItemHidden : {}) }}
                  onClick={() => toggleLegendFilter(entry.key)}
                  title={entry.hidden ? 'Show this category' : 'Hide this category'}
                >
                  <span style={{ ...legendSwatch, background: entry.color }} />
                  <span style={{ fontSize: 12, color: '#1f252d', fontWeight: 500 }}>{entry.label}</span>
                  <span style={{ fontSize: 11, color: '#5f6b7a' }}>({entry.count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Floating zoom / fit controls */}
          <div style={zoomStack}>
            <ZoomButton title="Recenter" onClick={recenterGraph}>
              <IconZoomCenter />
            </ZoomButton>
            <ZoomButton title="Zoom in" onClick={() => zoomBy(1.25)}>
              <IconZoomIn />
            </ZoomButton>
            <ZoomButton title="Zoom out" onClick={() => zoomBy(0.8)}>
              <IconZoomOut />
            </ZoomButton>
            <ZoomButton title="Fit to screen" onClick={fitGraph}>
              <IconFit />
            </ZoomButton>
          </div>

          {/* Right rail */}
          {!readOnlyMode && <aside style={rightRail}>
            <RightRailButton
              active={activeRightTool === 'search'}
              title="Search"
              onClick={() => setActiveRightTool((v) => (v === 'search' ? null : 'search'))}
            >
              <IconSearch />
            </RightRailButton>
            <RightRailButton
              active={activeRightTool === 'properties'}
              title={selectedNodeIds.length >= 2 ? 'View histogram of selection properties' : 'View node properties'}
              onClick={() => setActiveRightTool((v) => (v === 'properties' ? null : 'properties'))}
            >
              <IconResourceTable />
            </RightRailButton>
            <RightRailButton
              active={activeRightTool === 'tools'}
              title="Tools"
              onClick={() => setActiveRightTool((v) => (v === 'tools' ? null : 'tools'))}
            >
              <IconWrench />
            </RightRailButton>
            <RightRailButton
              active={activeRightTool === 'calendar'}
              title="Schedule"
              onClick={() => setActiveRightTool((v) => (v === 'calendar' ? null : 'calendar'))}
            >
              <IconCalendar />
            </RightRailButton>
            <RightRailButton
              active={activeRightTool === 'clipboard'}
              title="Clipboard"
              onClick={() => setActiveRightTool((v) => (v === 'clipboard' ? null : 'clipboard'))}
            >
              <IconClipboard />
            </RightRailButton>
            <RightRailButton
              active={activeRightTool === 'related'}
              title="Related items"
              badge={relatedArtifactsAll.length > 0 ? relatedArtifactsAll.length : undefined}
              onClick={() => setActiveRightTool((v) => (v === 'related' ? null : 'related'))}
            >
              <IconRelatedArtifacts />
            </RightRailButton>
            <button type="button" style={rightRailCollapse} title="Collapse">
              <IconChevronsLeft />
            </button>
          </aside>}

          {!readOnlyMode && activeRightTool && (
            <div style={rightRailDrawer} className="of-panel">
              <RightRailDrawerContent
                tool={activeRightTool}
                propertiesTitle={
                  selectedNodeIds.length >= 2
                    ? 'Histogram of selection properties'
                    : 'View node properties'
                }
                relatedContent={
                  selectedNodeIds.length > 0 ? (
                    <RelatedItemsPanel
                      items={relatedArtifactsVisible}
                      distinctKinds={relatedDistinctKinds}
                      includedKinds={relatedIncludedKinds}
                      onToggleKind={handleRelatedToggleKind}
                      onIncludeAllKinds={handleRelatedIncludeAllKinds}
                      sort={relatedSort}
                      onSortChange={setRelatedSort}
                      showAutosaved={relatedShowAutosaved}
                      showTrash={relatedShowTrash}
                      onToggleAutosaved={() => setRelatedShowAutosaved((v) => !v)}
                      onToggleTrash={() => setRelatedShowTrash((v) => !v)}
                      onFocusOnGraph={handleRelatedFocusOnGraph}
                      onOpenArtifact={handleRelatedOpenArtifact}
                    />
                  ) : null
                }
                propertiesContent={
                  selectedNodeIds.length >= 2 && histogramSections.length > 0
                    ? (
                        <HistogramPanel
                          sections={histogramSections}
                          selectionCount={selectedNodeIds.length}
                          highlightedCount={highlightedHistogramIds.length}
                          activeFilters={histogramFilters}
                          onToggleFilter={handleToggleHistogramFilter}
                          onClearFilters={() => setHistogramFilters([])}
                          onUpdateSelection={handleUpdateSelectionFromHistogram}
                          onCopyNames={handleCopyNodeNames}
                          onLoadColumns={loadColumnsForSelection}
                          loadingColumns={schemaFetchingDatasetIds.size > 0}
                          columnsAvailable={columnsAvailable}
                        />
                      )
                    : selectedNode
                    ? (
                        <NodePropertiesPanel
                          node={selectedNode}
                          relatedObjectTypes={relatedObjectTypes}
                          schemaRows={propertiesSchemaRows}
                          schemaLoading={nodeDetails.loading}
                          description={
                            nodeDescriptions[selectedNode.id]
                              ? {
                                  text: nodeDescriptions[selectedNode.id]!.description,
                                  updatedAt: nodeDescriptions[selectedNode.id]!.updated_at,
                                  updatedBy: nodeDescriptions[selectedNode.id]!.updated_by,
                                }
                              : null
                          }
                          descriptionLoading={Boolean(nodeDescriptionLoading[selectedNode.id])}
                          onOpenInOntologyManager={handleOpenInOntologyManager}
                          onOpenDataset={handleOpenDataset}
                          onCopyResourceId={(node) => {
                            void copyTextToClipboard(node.id).then(() => {
                              notifications.success('Copied resource ID');
                            });
                          }}
                          onAddDescription={(node) => void handleSaveNodeDescription(node)}
                          onClearDescription={(node) => void handleClearNodeDescription(node)}
                          onReportIssue={(node) => {
                            if (typeof window === 'undefined') return;
                            const subject = encodeURIComponent(`Issue with lineage node ${node.label}`);
                            const body = encodeURIComponent(
                              `Resource: ${node.label}\nID: ${node.id}\nKind: ${node.kind}\n\nWhat's wrong?`,
                            );
                            window.location.href = `mailto:lineage-issues@openfoundry.local?subject=${subject}&body=${body}`;
                          }}
                        />
                      )
                    : null
                }
                graph={viewGraph}
                selectedNode={selectedNode}
                selectedNodeIds={selectedNodeIds}
                coloringMode={coloringMode}
                hiddenColorKeys={hiddenColorKeys}
                legendEntries={legendEntries}
                savedSnapshots={savedSnapshots}
                buildStrategy={buildHelperStrategy}
                buildFallbacks={buildHelperFallbacks}
                buildForce={buildHelperForce}
                buildPlan={buildHelperPlan}
                buildResults={buildHelperResults}
                buildRunning={buildHelperRunning}
                rollbackTransactions={pipelineRollbackTransactions}
                rollbackSelectedTransactionId={pipelineRollbackTransactionId}
                rollbackLoading={pipelineRollbackLoading}
                rollbackPlan={pipelineRollbackPlan}
                rollbackExcludedIds={pipelineRollbackExcludedIds}
                rollbackResults={pipelineRollbackResults}
                rollbackRunning={pipelineRollbackRunning}
                onClose={() => setActiveRightTool(null)}
                onCreateForDataset={(datasetRid) => navigate(`/schedules/new?event_target=${encodeURIComponent(datasetRid)}`)}
                onColoringModeChange={(mode) => {
                  setColoringMode(mode);
                  setColoringMenuOpen(false);
                }}
                onToggleLegendFilter={toggleLegendFilter}
                onClearLegendFilters={clearLegendFilters}
                onRestoreSnapshot={restoreSnapshot}
                onDeleteSnapshot={deleteSnapshot}
                onDuplicateSnapshot={duplicateSnapshot}
                onCopySnapshotLink={(snapshot, linkReadOnly) => void copySnapshotLink(snapshot, linkReadOnly)}
                onExportSnapshot={exportSnapshotMetadata}
                onPresentSnapshot={presentSnapshot}
                onRevokeShare={(snapshot) => void revokeSnapshotShare(snapshot)}
                onPick={(id) => {
                  const node = viewGraph?.nodes.find((n) => n.id === id) ?? null;
                  selectLineageNode(node);
                  if (cyRef.current) cyRef.current.center(cyRef.current.$id(id));
                }}
                onBuildStrategyChange={(next) => {
                  setBuildHelperStrategy(next);
                  setBuildHelperPlan(null);
                  setBuildHelperResults([]);
                }}
                onBuildFallbacksChange={(next) => {
                  setBuildHelperFallbacks(next);
                  setBuildHelperPlan(null);
                  setBuildHelperResults([]);
                }}
                onBuildForceChange={(next) => {
                  setBuildHelperForce(next);
                  setBuildHelperPlan(null);
                  setBuildHelperResults([]);
                }}
                lastBuiltAtByPipeline={lastBuiltAtByPipeline}
                onPreviewBuildPlan={previewBuildHelperPlan}
                onRunBuildPlan={() => void runBuildHelperPlan()}
                onCancelBuildPreview={() => {
                  setBuildHelperPlan(null);
                  setBuildHelperResults([]);
                }}
                onSelectBuildTargets={selectBuildPlanTargets}
                onRollbackTransactionChange={(next) => {
                  setPipelineRollbackTransactionId(next);
                  setPipelineRollbackPlan(null);
                  setPipelineRollbackResults([]);
                }}
                onRefreshRollbackTransactions={() => {
                  setPipelineRollbackTransactions([]);
                  setPipelineRollbackTransactionId('');
                  setPipelineRollbackTransactionsByDataset({});
                  setPipelineRollbackPlan(null);
                  setPipelineRollbackResults([]);
                  if (selectedNode?.kind === 'dataset') {
                    setPipelineRollbackLoading(true);
                    void listDatasetTransactions(selectedNode.id, { branch })
                      .then((rows) => {
                        setPipelineRollbackTransactions(rows);
                        setPipelineRollbackTransactionsByDataset({ [selectedNode.id]: rows, [datasetRidForNode(selectedNode)]: rows });
                        const committed = rows.filter((tx) => tx.status === 'COMMITTED');
                        setPipelineRollbackTransactionId(committed[1]?.id ?? committed[0]?.id ?? '');
                      })
                      .catch((cause) => notifications.error(cause instanceof Error ? cause.message : 'Failed to refresh rollback transactions'))
                      .finally(() => setPipelineRollbackLoading(false));
                  }
                }}
                onPreviewRollback={() => void previewPipelineRollback()}
                onToggleRollbackExclude={togglePipelineRollbackExclusion}
                onRunRollback={requestPipelineRollbackRun}
              />
            </div>
          )}
        </div>

        {!readOnlyMode && (
          <ConfirmDialog
            open={pipelineRollbackConfirmOpen}
            title="Run pipeline rollback"
            message={`Apply rollback from ${pipelineRollbackPlan?.root_label ?? 'the selected dataset'} to ${pipelineRollbackPlan?.targets.filter((target) => !target.excluded).length ?? 0} dataset target(s)? Unsupported resources and excluded downstream datasets will remain unchanged.`}
            confirmLabel="Run rollback"
            danger
            busy={pipelineRollbackRunning}
            onCancel={() => setPipelineRollbackConfirmOpen(false)}
            onConfirm={() => void runPipelineRollbackPlan()}
          />
        )}

        {/* Bottom panel — Preview / History / Code / Data health / Build timeline */}
        {!readOnlyMode && <BottomPanel
          collapsed={bottomCollapsed}
          fullscreen={bottomFullscreen}
          onCollapse={() => setBottomCollapsed((v) => !v)}
          onFullscreen={() => setBottomFullscreen((v) => !v)}
          tab={bottomTab}
          onTabChange={setBottomTab}
          selectedNode={selectedNode}
          selectedCount={selectedNodeIds.length}
          impact={impact}
          impactLoading={impactLoading}
          building={building}
          buildResult={buildResult}
          datasetPreview={datasetPreview}
          datasetPreviewLoading={datasetPreviewLoading}
          nodeDetails={nodeDetails}
          graph={viewGraph}
          acknowledgeSensitiveLineage={acknowledgeSensitiveLineage}
          onAckChange={setAcknowledgeSensitiveLineage}
          sensitiveCandidateCount={sensitiveCandidateCount}
          onTriggerBuilds={() => void triggerBuilds()}
          onReloadImpact={() => selectedNode?.id && void loadImpact(selectedNode.id)}
          branch={branch}
          buildTimeline={
            <BuildTimelinePanel
              rows={buildTimelineResult.rows}
              from={buildTimelineResult.from}
              until={buildTimelineResult.until}
              rangeKey={buildTimelineRange}
              colorBy={buildTimelineColorBy}
              onRangeChange={setBuildTimelineRange}
              onColorByChange={setBuildTimelineColorBy}
              emptyHint={
                selectedDatasetIds.length === 0
                  ? 'Select one or more datasets to see their build timeline.'
                  : 'No builds in this time window for the selected datasets.'
              }
            />
          }
        />}
      </div>
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </section>
  );
}

const KEYBOARD_SHORTCUTS: Array<{ label: string; combo: string }> = [
  { label: 'Add nodes in-between selection', combo: '⌘ + B' },
  { label: 'Add common ancestors of selection', combo: '⌘ + J' },
  { label: 'Add common descendants of selection', combo: '⌘ + K' },
  { label: 'Multi-select (toggle)', combo: 'Shift / ⌘ + click' },
  { label: 'Drag-select box', combo: 'Tools → Drag select' },
  { label: 'Show this list', combo: '?' },
];

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="of-panel"
        style={{
          minWidth: 320,
          maxWidth: 480,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>Keyboard shortcuts</strong>
          <button
            type="button"
            className="of-button"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 12,
                padding: '4px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <dt style={{ margin: 0, color: 'var(--text-default)' }}>{shortcut.label}</dt>
              <dd
                style={{
                  margin: 0,
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap',
                }}
              >
                {shortcut.combo}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// =============================================================================
// Header
// =============================================================================

interface LineageHeaderProps {
  branch: string;
  branchOptions: string[];
  branchMenuOpen: boolean;
  onBranchClick: () => void;
  onBranchSelect: (b: string) => void;
  saveMenuOpen: boolean;
  onSaveClick: () => void;
  onSaveCaretClick: () => void;
  onSaveAs: () => void;
  onOpenGraph: () => void;
  onExportSvg: () => void;
  onOpenShortcuts: () => void;
  helpMenuOpen: boolean;
  onHelpMenuClick: () => void;
  onStartTour: () => void;
}
function LineageHeader({
  branch,
  branchOptions,
  branchMenuOpen,
  onBranchClick,
  onBranchSelect,
  saveMenuOpen,
  onSaveClick,
  onSaveCaretClick,
  onSaveAs,
  onOpenGraph,
  onExportSvg,
  onOpenShortcuts,
  helpMenuOpen,
  onHelpMenuClick,
  onStartTour,
}: LineageHeaderProps) {
  const [customBranch, setCustomBranch] = useState('');
  return (
    <header style={headerRow}>
      <div style={headerLeft}>
        <span style={lineageMark}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="6" height="6" rx="1.4" fill="#f08c3a" />
            <rect x="14" y="14" width="7" height="7" rx="1.4" fill="#3b86c4" />
            <path d="M9 6h5a4 4 0 0 1 4 4v4" stroke="#1f252d" strokeWidth="1.5" />
          </svg>
        </span>
        <span style={headerTitle}>Data Lineage</span>
      </div>

      <div style={headerCenter}>
        <div style={branchPicker}>
          <button type="button" style={branchTrigger} onClick={onBranchClick}>
            <IconBranch />
            <span style={{ flex: 1, textAlign: 'left' }}>{branch}</span>
            <IconChevronDown />
          </button>
          {branchMenuOpen && (
            <div style={branchMenu} className="of-panel">
              {branchOptions.map((b) => (
                <button
                  key={b}
                  type="button"
                  style={menuItem(b === branch)}
                  onClick={() => onBranchSelect(b)}
                >
                  <IconBranch />
                  <span>{b}</span>
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = customBranch.trim();
                  if (!next) return;
                  setCustomBranch('');
                  onBranchSelect(next);
                }}
                style={{ display: 'flex', gap: 6, padding: '4px 6px' }}
              >
                <input
                  type="text"
                  value={customBranch}
                  onChange={(event) => setCustomBranch(event.target.value)}
                  placeholder="Enter branch name…"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '4px 6px',
                    fontSize: 12,
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-default)',
                  }}
                />
                <button
                  type="submit"
                  className="of-btn"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  disabled={customBranch.trim().length === 0}
                >
                  Use
                </button>
              </form>
            </div>
          )}
        </div>
        <button type="button" style={iconBtn} title="Branch settings">
          <IconBranch />
        </button>
      </div>

      <div style={headerRight}>
        <button
          type="button"
          style={iconBtn}
          title="Keyboard shortcuts (?)"
          onClick={onOpenShortcuts}
        >
          <IconCmd />
        </button>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            style={iconBtn}
            title="Help"
            onClick={onHelpMenuClick}
          >
            <IconHelp />
          </button>
          {helpMenuOpen && (
            <div style={saveMenu} className="of-panel">
              <button
                type="button"
                style={menuItem(false)}
                onClick={() => {
                  onHelpMenuClick();
                  onOpenShortcuts();
                }}
              >
                Keyboard shortcuts
              </button>
              <button
                type="button"
                style={menuItem(false)}
                onClick={() => {
                  onHelpMenuClick();
                  onStartTour();
                }}
              >
                Take the product tour
              </button>
              <a
                href="mailto:support@openfoundry.local?subject=Data%20Lineage%20support"
                style={{ ...menuItem(false), textDecoration: 'none' }}
                onClick={onHelpMenuClick}
              >
                Contact support
              </a>
            </div>
          )}
        </div>
        <button type="button" style={iconBtn} title="Settings">
          <IconSettings />
        </button>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <button type="button" style={savePrimary} onClick={onSaveClick}>
            Save
          </button>
          <button type="button" style={saveCaret} onClick={onSaveCaretClick} title="Save options">
            <IconChevronDown />
          </button>
          {saveMenuOpen && (
            <div style={saveMenu} className="of-panel">
              <button type="button" style={menuItem(false)} onClick={onSaveAs}>
                Save as…
              </button>
              <button type="button" style={menuItem(false)} onClick={onOpenGraph}>
                Open graph…
              </button>
              <button type="button" style={menuItem(false)} onClick={onExportSvg}>
                Export graph to SVG
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// =============================================================================
// Ribbon
// =============================================================================

interface ExpandPreviewCounts {
  inBetween: number;
  commonAncestors: number;
  commonDescendants: number;
  expandFromSeeds: number;
}

interface RibbonProps {
  selectedNode: LineageNode | null;
  selectedNodeCount: number;
  panSelectMode: 'pan' | 'select';
  onPanSelectModeChange: (mode: 'pan' | 'select') => void;
  onClean: () => void;
  selectPopoverOpen: boolean;
  onSelectClick: () => void;
  onSelectAll: () => void;
  onInvertSelection: () => void;
  onSelectChildren: () => void;
  onSelectParents: () => void;
  onSelectFocus: () => void;
  expandPopoverOpen: boolean;
  onExpandClick: () => void;
  expandParents: number;
  expandChildren: number;
  onExpandParentsChange: (n: number) => void;
  onExpandChildrenChange: (n: number) => void;
  onExpandApply: () => void;
  onAddInBetween: () => void;
  onAddCommonAncestors: () => void;
  onAddCommonDescendants: () => void;
  expandPreview: ExpandPreviewCounts;
  multiSelectActionDisabled: boolean;
  expandFromSeedsDisabled: boolean;
  onColorClick: () => void;
  coloringMenuOpen: boolean;
  coloringMode: ColoringMode;
  onColoringChange: (m: ColoringMode) => void;
  findOpen: boolean;
  onFindClick: () => void;
  findQuery: string;
  onFindQueryChange: (s: string) => void;
  findMode: 'name' | 'column';
  onFindModeChange: (mode: 'name' | 'column') => void;
  columnIndexLoading: boolean;
  onRemoveClick: () => void;
  onAlignClick: () => void;
  layoutByColor: boolean;
  onLayoutByColorClick: () => void;
  groupByColor: boolean;
  onGroupByColorClick: () => void;
  legendOpen: boolean;
  onLegendToggle: () => void;
  onRefresh: () => void;
  flowQuarter: 0 | 1 | 2 | 3;
  onFlowToggle: () => void;
  layoutMenuOpen: boolean;
  layoutMode: LayoutMode;
  onLayoutMenuClick: () => void;
  onLayoutModeChange: (mode: LayoutMode) => void;
}
function Ribbon(props: RibbonProps) {
  const {
    selectedNodeCount,
    panSelectMode,
    onPanSelectModeChange,
    onClean,
    selectPopoverOpen,
    onSelectClick,
    onSelectAll,
    onInvertSelection,
    onSelectChildren,
    onSelectParents,
    onSelectFocus,
    expandPopoverOpen,
    onExpandClick,
    expandParents,
    expandChildren,
    onExpandParentsChange,
    onExpandChildrenChange,
    onExpandApply,
    onAddInBetween,
    onAddCommonAncestors,
    onAddCommonDescendants,
    expandPreview,
    multiSelectActionDisabled,
    expandFromSeedsDisabled,
    onColorClick,
    coloringMenuOpen,
    coloringMode,
    onColoringChange,
    findOpen,
    onFindClick,
    findQuery,
    onFindQueryChange,
    findMode,
    onFindModeChange,
    columnIndexLoading,
    onRemoveClick,
    onAlignClick,
    layoutByColor,
    onLayoutByColorClick,
    groupByColor,
    onGroupByColorClick,
    legendOpen,
    onLegendToggle,
    onRefresh,
    flowQuarter,
    onFlowToggle,
    layoutMenuOpen,
    layoutMode,
    onLayoutMenuClick,
    onLayoutModeChange,
  } = props;

  return (
    <div style={ribbonRow}>
      <div style={toolGroupWrap}>
        <div style={toolGroupRow}>
          <button
            type="button"
            title="Panning mode (drag the canvas to pan)"
            onClick={() => onPanSelectModeChange('pan')}
            style={{ ...toolSubBtn, ...(panSelectMode === 'pan' ? toolBtnActive : {}) }}
          >
            <IconPan />
          </button>
          <button
            type="button"
            title="Drag select mode (hold 'shift' and click + drag)"
            onClick={() => onPanSelectModeChange('select')}
            style={{ ...toolSubBtn, ...(panSelectMode === 'select' ? toolBtnActive : {}) }}
          >
            <IconDragSelect />
          </button>
        </div>
        <span style={toolBtnLabel}>Tools</span>
      </div>
      <div style={{ position: 'relative' }}>
        <ToolButton label="Layout" onClick={onLayoutMenuClick} active={layoutMenuOpen}>
          <IconLayout />
        </ToolButton>
        {layoutMenuOpen && (
          <div style={expandPopover} className="of-panel">
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                style={{
                  ...expandRow,
                  ...(layoutMode === option.value ? { background: 'var(--bg-chip-active)', color: 'var(--text-link)' } : {}),
                }}
                onClick={() => onLayoutModeChange(option.value)}
                title={option.description}
              >
                <IconLayout /> {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={ribbonGroup}>
        <ToolButton label="Undo" onClick={() => undefined}>
          <IconUndo />
        </ToolButton>
        <ToolButton label="Redo" onClick={() => undefined}>
          <IconRedo />
        </ToolButton>
      </div>
      <ToolButton label="Clean" onClick={onClean}>
        <IconClean />
      </ToolButton>
      <div style={{ position: 'relative' }}>
        <ToolButton label="Select" onClick={onSelectClick} active={selectPopoverOpen}>
          <IconSelect />
        </ToolButton>
        {selectPopoverOpen && (
          <div style={expandPopover} className="of-panel">
            <button
              type="button"
              style={expandRow}
              onClick={onSelectAll}
              title="Select every visible node on the graph"
            >
              <IconSelect /> Select all
            </button>
            <button
              type="button"
              style={expandRow}
              onClick={onInvertSelection}
              disabled={selectedNodeCount === 0}
              title="De-select current nodes and select the rest"
            >
              <IconSelect /> Invert selection
            </button>
            <button
              type="button"
              style={expandRow}
              onClick={onSelectChildren}
              disabled={selectedNodeCount === 0}
              title="Add direct children of the current selection"
            >
              <IconSelect /> Select children
            </button>
            <button
              type="button"
              style={expandRow}
              onClick={onSelectParents}
              disabled={selectedNodeCount === 0}
              title="Add direct parents of the current selection"
            >
              <IconSelect /> Select parents
            </button>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 0' }} />
            <button
              type="button"
              style={expandRow}
              onClick={onSelectFocus}
              disabled={selectedNodeCount === 0}
              title="Center the canvas on the primary selection"
            >
              <IconSelect /> Focus on selection
            </button>
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <ToolButton label="Expand" onClick={onExpandClick} active={expandPopoverOpen}>
          <IconExpand />
        </ToolButton>
        {expandPopoverOpen && (
          <div style={expandPopover} className="of-panel">
            <button
              type="button"
              style={expandRow}
              disabled={multiSelectActionDisabled || expandPreview.inBetween === 0}
              onClick={onAddInBetween}
              title="Add all nodes on directed paths between the selected nodes"
            >
              <IconExpand /> Add in-between ({expandPreview.inBetween})
              <span style={hotkey}>⌘B</span>
            </button>
            <button
              type="button"
              style={expandRow}
              disabled={multiSelectActionDisabled || expandPreview.commonAncestors === 0}
              onClick={onAddCommonAncestors}
              title="Add nodes that are ancestors of every selected node"
            >
              <IconExpand /> Add common ancestors ({expandPreview.commonAncestors})
              <span style={hotkey}>⌘J</span>
            </button>
            <button
              type="button"
              style={expandRow}
              disabled={multiSelectActionDisabled || expandPreview.commonDescendants === 0}
              onClick={onAddCommonDescendants}
              title="Add nodes that are descendants of every selected node"
            >
              <IconExpand /> Add common descendants ({expandPreview.commonDescendants})
              <span style={hotkey}>⌘K</span>
            </button>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 0' }} />
            <div style={expandStepperRow}>
              <Stepper
                value={expandParents}
                onChange={onExpandParentsChange}
                hint="Expand parents"
              />
              <Stepper
                value={expandChildren}
                onChange={onExpandChildrenChange}
                hint="Expand children"
              />
            </div>
            <button
              type="button"
              className="of-btn of-btn-primary"
              style={{ marginTop: 12, width: '100%' }}
              onClick={onExpandApply}
              disabled={expandFromSeedsDisabled || expandPreview.expandFromSeeds === 0}
            >
              Add {expandPreview.expandFromSeeds} nodes
            </button>
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <ToolButton label="Color" onClick={onColorClick} active={coloringMenuOpen}>
          <IconColor />
        </ToolButton>
        {coloringMenuOpen && (
          <div style={coloringPopover} className="of-panel">
            {COLORING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                style={menuItem(opt.value === coloringMode)}
                onClick={() => onColoringChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <ToolButton label="Find" onClick={onFindClick} active={findOpen}>
          <IconFind />
        </ToolButton>
        {findOpen && (
          <div style={findPopover} className="of-panel">
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button
                type="button"
                style={{ ...findModeBtn, ...(findMode === 'name' ? findModeBtnActive : {}) }}
                onClick={() => onFindModeChange('name')}
              >
                By name
              </button>
              <button
                type="button"
                style={{ ...findModeBtn, ...(findMode === 'column' ? findModeBtnActive : {}) }}
                onClick={() => onFindModeChange('column')}
                title="Search dataset columns (loads schemas on demand)"
              >
                By column
              </button>
            </div>
            <input
              type="text"
              autoFocus
              placeholder={
                findMode === 'column'
                  ? 'Find column name…'
                  : 'Find dataset, path, project, branch…'
              }
              value={findQuery}
              onChange={(e) => onFindQueryChange(e.target.value)}
              style={findInput}
            />
            {findMode === 'column' && columnIndexLoading && (
              <div className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                Loading column indexes…
              </div>
            )}
          </div>
        )}
      </div>
      <ToolButton label="Remove" onClick={onRemoveClick}>
        <IconRemove />
      </ToolButton>
      <ToolButton label="Align" onClick={onAlignClick}>
        <IconAlign />
      </ToolButton>
      <ToolButton
        label={`Flow ${flowQuarter === 0 ? 'TB' : flowQuarter === 1 ? 'LR' : flowQuarter === 2 ? 'BT' : 'RL'}`}
        title="Rotate dependency direction (TB → LR → BT → RL)"
        onClick={onFlowToggle}
      >
        <IconFlow />
      </ToolButton>

      <div style={{ flex: 1 }} />

      <ToolButton label={`Layout\nby color`} active={layoutByColor} onClick={onLayoutByColorClick}>
        <IconLayoutColor />
      </ToolButton>
      <ToolButton label={`Group\nby color`} active={groupByColor} onClick={onGroupByColorClick}>
        <IconGroupColor />
      </ToolButton>
      <ToolButton label="Legend" active={legendOpen} onClick={onLegendToggle}>
        {legendOpen ? <IconLegendEyeOpen /> : <IconLegendEye />}
      </ToolButton>
      <div style={coloringSelect}>
        <IconResourceTable />
        <span style={{ flex: 1, padding: '0 8px' }}>
          {COLORING_OPTIONS.find((o) => o.value === coloringMode)?.label}
        </span>
        <button type="button" style={iconBtnGhost} onClick={onColorClick}>
          <IconChevronDown />
        </button>
      </div>
      <ToolButton label="Refresh" onClick={onRefresh}>
        <IconRefresh />
      </ToolButton>
    </div>
  );
}

interface ToolButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}
function ToolButton({ label, onClick, active = false, disabled = false, title, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...toolBtn,
        ...(active ? toolBtnActive : {}),
        ...(disabled ? toolBtnDisabled : {}),
      }}
    >
      <span style={toolBtnIcon}>{children}</span>
      <span style={toolBtnLabel}>{label}</span>
    </button>
  );
}

// =============================================================================
// Stepper (Expand popover)
// =============================================================================

interface StepperProps {
  value: number;
  onChange: (n: number) => void;
  hint: string;
}
function Stepper({ value, onChange, hint }: StepperProps) {
  return (
    <div style={stepperWrap}>
      <div style={stepperControls}>
        <button type="button" style={stepperBtn} onClick={() => onChange(Math.max(0, value - 5))}>
          «
        </button>
        <button type="button" style={stepperBtn} onClick={() => onChange(Math.max(0, value - 1))}>
          ‹
        </button>
        <span style={stepperValue}>{value}</span>
        <button type="button" style={stepperBtn} onClick={() => onChange(value + 1)}>
          ›
        </button>
        <button type="button" style={stepperBtn} onClick={() => onChange(value + 5)}>
          »
        </button>
      </div>
      <span style={stepperHint}>{hint}</span>
    </div>
  );
}

// =============================================================================
// Right rail
// =============================================================================

interface RightRailButtonProps {
  active: boolean;
  title: string;
  onClick: () => void;
  badge?: number;
  children: ReactNode;
}
function RightRailButton({ active, title, onClick, badge, children }: RightRailButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        ...rightRailButton,
        ...(active ? rightRailButtonActive : {}),
        position: 'relative',
      }}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span style={rightRailBadge}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  );
}

interface RightRailDrawerContentProps {
  tool: 'search' | 'properties' | 'tools' | 'calendar' | 'clipboard' | 'related';
  propertiesContent: ReactNode | null;
  propertiesTitle: string;
  relatedContent: ReactNode | null;
  graph: LineageGraph | null;
  selectedNode: LineageNode | null;
  selectedNodeIds: string[];
  coloringMode: ColoringMode;
  hiddenColorKeys: string[];
  legendEntries: LegendEntry[];
  savedSnapshots: SavedLineageGraphSnapshot[];
  buildStrategy: BuildHelperStrategy;
  buildFallbacks: string;
  buildForce: boolean;
  buildPlan: BuildHelperPlan | null;
  buildResults: BuildHelperRunResult[];
  buildRunning: boolean;
  rollbackTransactions: DatasetTransaction[];
  rollbackSelectedTransactionId: string;
  rollbackLoading: boolean;
  rollbackPlan: PipelineRollbackPlan | null;
  rollbackExcludedIds: string[];
  rollbackResults: PipelineRollbackRunResult[];
  rollbackRunning: boolean;
  onClose: () => void;
  onCreateForDataset: (datasetRid: string) => void;
  onColoringModeChange: (mode: ColoringMode) => void;
  onToggleLegendFilter: (key: string) => void;
  onClearLegendFilters: () => void;
  onRestoreSnapshot: (snapshot: SavedLineageGraphSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  onDuplicateSnapshot: (snapshot: SavedLineageGraphSnapshot) => void;
  onCopySnapshotLink: (snapshot: SavedLineageGraphSnapshot, readOnly?: boolean) => void;
  onExportSnapshot: (snapshot: SavedLineageGraphSnapshot) => void;
  onPresentSnapshot: (snapshot: SavedLineageGraphSnapshot) => void;
  onRevokeShare: (snapshot: SavedLineageGraphSnapshot) => void;
  onPick: (id: string) => void;
  lastBuiltAtByPipeline: Map<string, string>;
  onBuildStrategyChange: (strategy: BuildHelperStrategy) => void;
  onBuildFallbacksChange: (value: string) => void;
  onBuildForceChange: (value: boolean) => void;
  onPreviewBuildPlan: () => void;
  onRunBuildPlan: () => void;
  onCancelBuildPreview: () => void;
  onSelectBuildTargets: (plan: BuildHelperPlan) => void;
  onRollbackTransactionChange: (transactionId: string) => void;
  onRefreshRollbackTransactions: () => void;
  onPreviewRollback: () => void;
  onToggleRollbackExclude: (nodeId: string) => void;
  onRunRollback: () => void;
}
function RightRailDrawerContent({
  tool,
  propertiesContent,
  propertiesTitle,
  relatedContent,
  graph,
  selectedNode,
  selectedNodeIds,
  coloringMode,
  hiddenColorKeys,
  legendEntries,
  savedSnapshots,
  buildStrategy,
  buildFallbacks,
  buildForce,
  buildPlan,
  buildResults,
  buildRunning,
  rollbackTransactions,
  rollbackSelectedTransactionId,
  rollbackLoading,
  rollbackPlan,
  rollbackExcludedIds,
  rollbackResults,
  rollbackRunning,
  onClose,
  onCreateForDataset,
  onColoringModeChange,
  onToggleLegendFilter,
  onClearLegendFilters,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onDuplicateSnapshot,
  onCopySnapshotLink,
  onExportSnapshot,
  onPresentSnapshot,
  onRevokeShare,
  onPick,
  lastBuiltAtByPipeline,
  onBuildStrategyChange,
  onBuildFallbacksChange,
  onBuildForceChange,
  onPreviewBuildPlan,
  onRunBuildPlan,
  onCancelBuildPreview,
  onSelectBuildTargets,
  onRollbackTransactionChange,
  onRefreshRollbackTransactions,
  onPreviewRollback,
  onToggleRollbackExclude,
  onRunRollback,
}: RightRailDrawerContentProps) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const list = graph?.nodes ?? [];
    const query = q.trim().toLowerCase();
    if (!query) return list.slice(0, 80);
    return list.filter((n) => lineageNodeSearchText(n).includes(query)).slice(0, 80);
  }, [graph, q]);

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <strong style={{ fontSize: 13, color: 'var(--text-strong)' }}>
          {tool === 'search' && 'Search'}
          {tool === 'properties' && propertiesTitle}
          {tool === 'tools' && 'Tools'}
          {tool === 'calendar' && 'Schedule'}
          {tool === 'clipboard' && 'Clipboard'}
          {tool === 'related' && 'Related items'}
        </strong>
        <button type="button" style={iconBtnGhost} onClick={onClose} title="Close">
          ×
        </button>
      </div>

      {tool === 'search' && (
        <>
          <input
            type="text"
            placeholder="Dataset, path, project, folder, type, repo, schedule, branch…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...findInput, marginBottom: 10 }}
          />
          <div style={{ flex: 1, overflow: 'auto', display: 'grid', gap: 4 }}>
            {filtered.length === 0 ? (
              <div className="of-text-muted" style={{ fontSize: 12 }}>
                No matches.
              </div>
            ) : (
              filtered.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onPick(n.id)}
                  style={resourceListRow}
                >
                  <span style={{ ...resourceDot, background: resourceColor(n.kind) }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{n.label}</span>
                  <span style={{ color: 'var(--text-soft)', fontSize: 11 }}>{n.kind}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}

      {tool === 'properties' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {propertiesContent ?? (
            <div className="of-text-muted" style={{ fontSize: 12 }}>
              Select a node to view properties, or select 2+ nodes to compare them.
            </div>
          )}
        </div>
      )}

      {tool === 'related' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {relatedContent ?? (
            <div className="of-text-muted" style={{ fontSize: 12 }}>
              Select a node to see its related artifacts.
            </div>
          )}
        </div>
      )}

      {tool === 'tools' && (
        <div style={{ display: 'grid', gap: 12, minHeight: 0, overflow: 'auto' }}>
          <ColorAndFilterTool
            coloringMode={coloringMode}
            hiddenColorKeys={hiddenColorKeys}
            legendEntries={legendEntries}
            onColoringModeChange={onColoringModeChange}
            onToggleLegendFilter={onToggleLegendFilter}
            onClearLegendFilters={onClearLegendFilters}
          />
          <BuildHelperTool
            graph={graph}
            selectedNodeIds={selectedNodeIds}
            strategy={buildStrategy}
            fallbackBranches={buildFallbacks}
            forceBuild={buildForce}
            plan={buildPlan}
            results={buildResults}
            running={buildRunning}
            lastBuiltAtByPipeline={lastBuiltAtByPipeline}
            onStrategyChange={onBuildStrategyChange}
            onFallbackBranchesChange={onBuildFallbacksChange}
            onForceBuildChange={onBuildForceChange}
            onPreview={onPreviewBuildPlan}
            onRun={onRunBuildPlan}
            onCancelPreview={onCancelBuildPreview}
            onSelectTargets={onSelectBuildTargets}
          />
          <PipelineRollbackTool
            selectedNode={selectedNode}
            transactions={rollbackTransactions}
            selectedTransactionId={rollbackSelectedTransactionId}
            loading={rollbackLoading}
            plan={rollbackPlan}
            excludedIds={rollbackExcludedIds}
            results={rollbackResults}
            running={rollbackRunning}
            onTransactionChange={onRollbackTransactionChange}
            onRefreshTransactions={onRefreshRollbackTransactions}
            onPreview={onPreviewRollback}
            onToggleExclude={onToggleRollbackExclude}
            onRun={onRunRollback}
          />
        </div>
      )}
      {tool === 'calendar' && (
        <ScheduleSidebar
          selectedDatasetRids={selectedNode?.kind === 'dataset' ? [datasetRidForNode(selectedNode)] : []}
          onCreateForDataset={onCreateForDataset}
        />
      )}
      {tool === 'clipboard' && (
        <SnapshotClipboard
          snapshots={savedSnapshots}
          onRestore={onRestoreSnapshot}
          onDelete={onDeleteSnapshot}
          onDuplicate={onDuplicateSnapshot}
          onCopyLink={onCopySnapshotLink}
          onExport={onExportSnapshot}
          onPresent={onPresentSnapshot}
          onRevokeShare={onRevokeShare}
        />
      )}
    </div>
  );
}

interface ColorAndFilterToolProps {
  coloringMode: ColoringMode;
  hiddenColorKeys: string[];
  legendEntries: LegendEntry[];
  onColoringModeChange: (mode: ColoringMode) => void;
  onToggleLegendFilter: (key: string) => void;
  onClearLegendFilters: () => void;
}

function ColorAndFilterTool({
  coloringMode,
  hiddenColorKeys,
  legendEntries,
  onColoringModeChange,
  onToggleLegendFilter,
  onClearLegendFilters,
}: ColorAndFilterToolProps) {
  const activeHidden = hiddenColorKeys.filter((key) => key.startsWith(`${coloringMode}:`)).length;
  return (
    <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 10 }}>
      <div>
        <p className="of-eyebrow">Node coloring</p>
        <select
          value={coloringMode}
          onChange={(event) => onColoringModeChange(event.target.value as ColoringMode)}
          className="of-input"
          style={{ marginTop: 6 }}
        >
          {COLORING_OPTIONS.map((entry) => (
            <option key={entry.value} value={entry.value}>{entry.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="of-eyebrow">Filters</span>
        <button type="button" className="of-button" style={{ fontSize: 11 }} onClick={onClearLegendFilters} disabled={activeHidden === 0}>
          Clear
        </button>
      </div>

      <div style={{ display: 'grid', gap: 5, maxHeight: 220, overflow: 'auto' }}>
        {legendEntries.length === 0 ? (
          <div className="of-text-muted" style={{ fontSize: 12 }}>No categories in the active graph.</div>
        ) : legendEntries.map((entry) => (
          <label key={entry.key} style={filterLegendRow}>
            <input
              type="checkbox"
              checked={!entry.hidden}
              onChange={() => onToggleLegendFilter(entry.key)}
            />
            <span style={{ ...legendSwatch, background: entry.color }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.label}
            </span>
            <span className="of-text-muted">{entry.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

interface SnapshotClipboardProps {
  snapshots: SavedLineageGraphSnapshot[];
  onRestore: (snapshot: SavedLineageGraphSnapshot) => void;
  onDelete: (id: string) => void;
  onDuplicate: (snapshot: SavedLineageGraphSnapshot) => void;
  onCopyLink: (snapshot: SavedLineageGraphSnapshot, readOnly?: boolean) => void;
  onExport: (snapshot: SavedLineageGraphSnapshot) => void;
  onPresent: (snapshot: SavedLineageGraphSnapshot) => void;
  onRevokeShare: (snapshot: SavedLineageGraphSnapshot) => void;
}

function SnapshotClipboard({ snapshots, onRestore, onDelete, onDuplicate, onCopyLink, onExport, onPresent, onRevokeShare }: SnapshotClipboardProps) {
  if (snapshots.length === 0) {
    return (
      <p className="of-text-muted" style={{ fontSize: 12 }}>
        No saved graph snapshots yet.
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8, overflow: 'auto' }}>
      {snapshots.map((snapshot) => {
        const mode = COLORING_OPTIONS.find((entry) => entry.value === snapshot.coloring_mode)?.label ?? snapshot.coloring_mode;
        const graphState = snapshot.graph_state;
        return (
          <div key={snapshot.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {snapshot.name}
              </strong>
              <div className="of-eyebrow" style={{ marginTop: 4 }}>
                {mode} · {snapshot.hidden_color_keys.length} filter{snapshot.hidden_color_keys.length === 1 ? '' : 's'} · {snapshot.branch}
              </div>
              <div className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {graphState
                  ? `${graphState.visible_node_count}/${graphState.node_count} nodes · ${graphState.visible_edge_count}/${graphState.edge_count} edges · expand ${snapshot.expand_parents}/${snapshot.expand_children}`
                  : `expand ${snapshot.expand_parents}/${snapshot.expand_children}`}
              </div>
              <div className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {new Date(snapshot.saved_at).toLocaleString()}
              </div>
            </div>
            <div style={snapshotActionGrid}>
              <button type="button" className="of-button of-button--primary" style={{ fontSize: 11 }} onClick={() => onRestore(snapshot)}>
                Restore
              </button>
              <button type="button" className="of-button" style={{ fontSize: 11 }} onClick={() => onCopyLink(snapshot)}>
                Copy link
              </button>
              <button type="button" className="of-button" style={{ fontSize: 11 }} onClick={() => onCopyLink(snapshot, true)}>
                Copy read-only
              </button>
              <button type="button" className="of-button" style={{ fontSize: 11 }} onClick={() => onPresent(snapshot)}>
                Present
              </button>
              <button type="button" className="of-button" style={{ fontSize: 11 }} onClick={() => onDuplicate(snapshot)}>
                Duplicate
              </button>
              <button type="button" className="of-button" style={{ fontSize: 11 }} onClick={() => onExport(snapshot)}>
                Export
              </button>
              {snapshot.share_token && (
                <button
                  type="button"
                  className="of-button"
                  style={{ fontSize: 11 }}
                  onClick={() => onRevokeShare(snapshot)}
                  title="Revoke the active share link so it stops resolving"
                >
                  Revoke share
                </button>
              )}
              <button type="button" className="of-button" style={{ fontSize: 11 }} onClick={() => onDelete(snapshot.id)}>
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface BuildHelperToolProps {
  graph: LineageGraph | null;
  selectedNodeIds: string[];
  strategy: BuildHelperStrategy;
  fallbackBranches: string;
  forceBuild: boolean;
  plan: BuildHelperPlan | null;
  results: BuildHelperRunResult[];
  running: boolean;
  lastBuiltAtByPipeline: Map<string, string>;
  onStrategyChange: (strategy: BuildHelperStrategy) => void;
  onFallbackBranchesChange: (value: string) => void;
  onForceBuildChange: (value: boolean) => void;
  onPreview: () => void;
  onRun: () => void;
  onCancelPreview: () => void;
  onSelectTargets: (plan: BuildHelperPlan) => void;
}

function BuildHelperTool({
  graph,
  selectedNodeIds,
  strategy,
  fallbackBranches,
  forceBuild,
  plan,
  results,
  running,
  lastBuiltAtByPipeline,
  onStrategyChange,
  onFallbackBranchesChange,
  onForceBuildChange,
  onPreview,
  onRun,
  onCancelPreview,
  onSelectTargets,
}: BuildHelperToolProps) {
  const selectedDatasets = useMemo(() => {
    const byID = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
    return selectedNodeIds.map((id) => byID.get(id)).filter((node): node is LineageNode => Boolean(node && node.kind === 'dataset'));
  }, [graph, selectedNodeIds]);
  const [showWontBeBuilt, setShowWontBeBuilt] = useState(true);
  const runnableTargets = plan?.targets.filter((target) => !target.blocked_reason) ?? [];
  const blockedTargets = plan?.targets.filter((target) => Boolean(target.blocked_reason)) ?? [];
  const runnableCount = runnableTargets.length;
  const visibleTargets = showWontBeBuilt ? plan?.targets ?? [] : runnableTargets;

  // Stage A: strategy selection. Shown when no plan has been computed yet.
  if (!plan) {
    return (
      <div style={{ display: 'grid', gap: 12, minHeight: 0, overflow: 'auto' }}>
        <div className="of-panel-muted" style={{ padding: 10 }}>
          <p className="of-eyebrow">Build helper · Step 1 of 2 · Select a build strategy</p>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {selectedDatasets.length} selected dataset{selectedDatasets.length === 1 ? '' : 's'}
          </div>
          {selectedDatasets.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {selectedDatasets.slice(0, 6).map((node) => (
                <div key={node.id} style={{ fontSize: 11, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                  {node.label}
                </div>
              ))}
              {selectedDatasets.length > 6 && (
                <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>+{selectedDatasets.length - 6} more</div>
              )}
            </div>
          )}
        </div>

        <fieldset style={{ display: 'grid', gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="of-eyebrow" style={{ marginBottom: 4 }}>Builds · Select a build strategy</legend>
          {BUILD_HELPER_STRATEGIES.map((entry) => (
            <label key={entry.value} style={radioRow}>
              <input
                type="radio"
                name="build-strategy"
                value={entry.value}
                checked={strategy === entry.value}
                onChange={(event) => onStrategyChange(event.target.value as BuildHelperStrategy)}
              />
              <div style={{ display: 'grid', gap: 2, flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{entry.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.description}</span>
              </div>
            </label>
          ))}
        </fieldset>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Fallback branches
          <input
            value={fallbackBranches}
            onChange={(event) => onFallbackBranchesChange(event.target.value)}
            className="of-input"
            placeholder="master, staging"
          />
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="of-button of-button--primary"
            onClick={onPreview}
            disabled={selectedDatasets.length === 0}
          >
            Next (View preview)
          </button>
        </div>

        {results.length > 0 && (
          <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <p className="of-eyebrow">Run results</p>
            {results.map((result) => (
              <div key={result.pipeline_rid} style={{ fontSize: 11, overflowWrap: 'anywhere' }}>
                <strong>{result.pipeline_rid}</strong>
                <div className={result.error ? 'of-status-danger' : 'of-text-muted'} style={{ marginTop: 2 }}>
                  {result.error ?? `${result.output_dataset_rids.length} output(s) · ${result.response?.state ?? 'queued'}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Stage B: preview. The user has computed a plan and now decides whether
  // to run it. They can flip the force-build toggle, show/hide the blocked
  // rows, focus the targets on the canvas, or cancel back to Stage A.
  return (
    <div style={{ display: 'grid', gap: 12, minHeight: 0, overflow: 'auto' }}>
      <div className="of-panel-muted" style={{ padding: 10 }}>
        <p className="of-eyebrow">Build helper · Step 2 of 2 · Finalize build options</p>
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
          {runnableCount} dataset{runnableCount === 1 ? '' : 's'} will be built
        </div>
        {blockedTargets.length > 0 && (
          <div className="of-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
            {blockedTargets.length} blocked target{blockedTargets.length === 1 ? '' : 's'} excluded
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <MetricPill label="Targets" value={plan.targets.length} />
          <MetricPill label="Transforms" value={plan.transform_ids.length} />
          <MetricPill label="Strategy" value={BUILD_HELPER_STRATEGIES.find((s) => s.value === plan.strategy)?.label ?? plan.strategy} />
          <MetricPill label="Branch" value={plan.branch} />
        </div>
        {plan.warnings.length > 0 && (
          <div className="of-status-warning" style={{ marginTop: 8, padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
            {plan.warnings.join(' ')}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={showWontBeBuilt}
            onChange={(event) => setShowWontBeBuilt(event.target.checked)}
          />
          Show datasets that will not be built
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={forceBuild}
            onChange={(event) => onForceBuildChange(event.target.checked)}
          />
          Force build on up-to-date datasets
        </label>
        <button
          type="button"
          className="of-button"
          style={{ fontSize: 11, justifySelf: 'start' }}
          onClick={() => onSelectTargets(plan)}
          disabled={plan.targets.length === 0}
        >
          Select nodes on graph
        </button>
      </div>

      <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflow: 'auto' }}>
        {visibleTargets.length === 0 ? (
          <div className="of-text-muted" style={{ fontSize: 12, padding: 8 }}>
            No targets to display.
          </div>
        ) : (
          visibleTargets.map((target) => {
            const lastBuilt = lastBuiltAtByPipeline.get(target.pipeline_rid);
            const blocked = Boolean(target.blocked_reason);
            return (
              <div key={target.node_id} style={{ ...candidateRow, opacity: blocked ? 0.55 : 1 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' }}>{target.label}</div>
                  <div className="of-eyebrow" style={{ marginTop: 3 }}>
                    {target.reason} · d{target.distance} · {target.branch}
                  </div>
                  {lastBuilt ? (
                    <div className="of-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                      Last built at {formatHelperTimestamp(lastBuilt)}
                    </div>
                  ) : (
                    <div className="of-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                      Never built in this window
                    </div>
                  )}
                  {target.blocked_reason && (
                    <div style={{ fontSize: 11, color: 'var(--status-danger)', marginTop: 3 }}>{target.blocked_reason}</div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: blocked ? 'var(--status-danger)' : 'var(--status-success)' }}>
                  {blocked ? 'blocked' : 'ready'}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="of-button" onClick={onCancelPreview} disabled={running}>
          Cancel
        </button>
        <button
          type="button"
          className="of-button of-button--primary"
          onClick={onRun}
          disabled={runnableCount === 0 || running}
        >
          {running ? 'Running...' : 'Run build'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow">Run results</p>
          {results.map((result) => (
            <div key={result.pipeline_rid} style={{ fontSize: 11, overflowWrap: 'anywhere' }}>
              <strong>{result.pipeline_rid}</strong>
              <div className={result.error ? 'of-status-danger' : 'of-text-muted'} style={{ marginTop: 2 }}>
                {result.error ?? `${result.output_dataset_rids.length} output(s) · ${result.response?.state ?? 'queued'}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatHelperTimestamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString();
}

const radioRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '8px 10px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};

interface PipelineRollbackToolProps {
  selectedNode: LineageNode | null;
  transactions: DatasetTransaction[];
  selectedTransactionId: string;
  loading: boolean;
  plan: PipelineRollbackPlan | null;
  excludedIds: string[];
  results: PipelineRollbackRunResult[];
  running: boolean;
  onTransactionChange: (transactionId: string) => void;
  onRefreshTransactions: () => void;
  onPreview: () => void;
  onToggleExclude: (nodeId: string) => void;
  onRun: () => void;
}

function PipelineRollbackTool({
  selectedNode,
  transactions,
  selectedTransactionId,
  loading,
  plan,
  excludedIds,
  results,
  running,
  onTransactionChange,
  onRefreshTransactions,
  onPreview,
  onToggleExclude,
  onRun,
}: PipelineRollbackToolProps) {
  const committed = transactions.filter((transaction) => transaction.status === 'COMMITTED');
  const includedTargets = plan?.targets.filter((target) => !target.excluded) ?? [];
  const executableCount = includedTargets.filter((target) => target.action !== 'unchanged').length;
  const unsupportedCount = plan?.unsupported.length ?? 0;
  const selectedIsDataset = selectedNode?.kind === 'dataset';
  return (
    <div style={{ display: 'grid', gap: 12, minHeight: 0, overflow: 'auto' }}>
      <div className="of-panel-muted" style={{ padding: 10 }}>
        <p className="of-eyebrow">Pipeline rollback</p>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          {selectedIsDataset ? selectedNode.label : 'Select an upstream dataset node'}
        </div>
        {selectedIsDataset && (
          <div className="of-text-muted" style={{ fontSize: 11, marginTop: 4, overflowWrap: 'anywhere' }}>
            {datasetRidForNode(selectedNode)}
          </div>
        )}
      </div>

      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
        Successful transaction
        <select
          value={selectedTransactionId}
          onChange={(event) => onTransactionChange(event.target.value)}
          disabled={!selectedIsDataset || loading || committed.length === 0}
          className="of-input"
        >
          <option value="">Select transaction</option>
          {committed.map((transaction) => {
            const time = transactionTime(transaction);
            return (
              <option key={transaction.id} value={transaction.id}>
                {shortRef(transaction.id)} · {transactionType(transaction) ?? transaction.operation} · {time ? time.toLocaleString() : 'unknown time'}
              </option>
            );
          })}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="of-button" onClick={onRefreshTransactions} disabled={!selectedIsDataset || loading}>
          Refresh transactions
        </button>
        <button type="button" className="of-button" onClick={onPreview} disabled={!selectedIsDataset || loading || !selectedTransactionId}>
          {loading ? 'Previewing...' : 'Preview rollback'}
        </button>
        <button type="button" className="of-button of-button--primary" onClick={onRun} disabled={!plan || executableCount === 0 || running}>
          {running ? 'Rolling back...' : 'Run rollback'}
        </button>
      </div>

      {plan && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="of-panel-muted" style={{ padding: 10 }}>
            <p className="of-eyebrow">Preview</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <MetricPill label="Targets" value={plan.targets.length} />
              <MetricPill label="Included" value={includedTargets.length} />
              <MetricPill label="Unsupported" value={unsupportedCount} />
              <MetricPill label="Branch" value={plan.branch} />
            </div>
            {plan.warnings.length > 0 && (
              <div className="of-status-warning" style={{ marginTop: 8, padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
                {plan.warnings.join(' ')}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflow: 'auto' }}>
            {plan.targets.map((target) => (
              <label key={target.node_id} style={candidateRow}>
                <input
                  type="checkbox"
                  checked={!target.excluded}
                  disabled={target.is_upstream}
                  onChange={() => onToggleExclude(target.node_id)}
                  title={target.is_upstream ? 'The upstream rollback target cannot be excluded.' : undefined}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {target.label}
                    {target.is_upstream ? ' · upstream' : ''}
                  </div>
                  <div className="of-eyebrow" style={{ marginTop: 3 }}>
                    {target.action.replace('_', ' ')} · d{target.distance} · {target.target_transaction_id ? shortRef(target.target_transaction_id) : 'no prior tx'}
                  </div>
                  {target.warnings.length > 0 && (
                    <div style={{ display: 'grid', gap: 3, marginTop: 5 }}>
                      {target.warnings.map((warning) => (
                        <span key={warning} style={{ fontSize: 11, color: warning.includes('logic changed') || warning.includes('snapshot') ? 'var(--status-warning)' : 'var(--text-muted)' }}>
                          {warning}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: target.excluded ? 'var(--text-soft)' : target.action === 'force_snapshot' ? 'var(--status-warning)' : 'var(--status-success)' }}>
                  {target.excluded ? 'excluded' : target.action === 'unchanged' ? 'unchanged' : target.action === 'force_snapshot' ? 'snapshot' : 'rollback'}
                </span>
              </label>
            ))}
          </div>

          {plan.unsupported.length > 0 && (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow">Unsupported resources</p>
              {plan.unsupported.map((resource) => (
                <div key={resource.node_id} style={{ fontSize: 11, overflowWrap: 'anywhere' }}>
                  <strong>{resource.label}</strong> · {resource.resource_type || resource.kind} · d{resource.distance}
                  <div className="of-text-muted" style={{ marginTop: 2 }}>{resource.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow">Rollback results</p>
          {results.map((result) => (
            <div key={`${result.node_id}-${result.action}`} style={{ fontSize: 11, overflowWrap: 'anywhere' }}>
              <strong>{result.label}</strong>
              <div className={result.status === 'failed' ? 'of-status-danger' : 'of-text-muted'} style={{ marginTop: 2 }}>
                {result.status} · {result.message}{result.transaction_rid ? ` · ${shortRef(result.transaction_rid)}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedIsDataset && committed.length === 0 && !loading && (
        <div className="of-status-warning" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
          No successful transactions are available for this branch.
        </div>
      )}
      {excludedIds.length > 0 && (
        <div className="of-text-muted" style={{ fontSize: 11 }}>
          {excludedIds.length} downstream dataset{excludedIds.length === 1 ? '' : 's'} excluded.
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 8, minWidth: 0 }}>
      <div className="of-eyebrow">{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}

// =============================================================================
// Bottom panel — selected resource details
// =============================================================================

const BOTTOM_TABS: { id: BottomTabId; label: string; icon: ReactNode }[] = [
  { id: 'preview', label: 'Preview', icon: <IconResourceTable /> },
  { id: 'schema', label: 'Schema', icon: <IconResourceTable /> },
  { id: 'history', label: 'History', icon: <IconRefresh /> },
  { id: 'jobs', label: 'Jobs', icon: <IconWrench /> },
  { id: 'schedules', label: 'Schedules', icon: <IconCalendar /> },
  { id: 'health', label: 'Health', icon: <IconColor /> },
  { id: 'permissions', label: 'Permissions', icon: <IconSelect /> },
  { id: 'code', label: 'Code', icon: <IconCmd /> },
  { id: 'build_timeline', label: 'Build timeline', icon: <IconChartGantt /> },
];

interface BottomPanelProps {
  collapsed: boolean;
  fullscreen: boolean;
  onCollapse: () => void;
  onFullscreen: () => void;
  tab: BottomTabId;
  onTabChange: (t: BottomTabId) => void;
  selectedNode: LineageNode | null;
  selectedCount: number;
  impact: LineageImpactAnalysis | null;
  impactLoading: boolean;
  building: boolean;
  buildResult: LineageBuildResult | null;
  datasetPreview: DatasetPreviewResponse | null;
  datasetPreviewLoading: boolean;
  nodeDetails: NodeDetailsState;
  graph: LineageGraph | null;
  acknowledgeSensitiveLineage: boolean;
  onAckChange: (v: boolean) => void;
  sensitiveCandidateCount: number;
  onTriggerBuilds: () => void;
  onReloadImpact: () => void;
  buildTimeline: ReactNode;
  branch: string;
}
function BottomPanel({
  collapsed,
  fullscreen,
  onCollapse,
  onFullscreen,
  tab,
  onTabChange,
  selectedNode,
  selectedCount,
  impact,
  impactLoading,
  building,
  buildResult,
  datasetPreview,
  datasetPreviewLoading,
  nodeDetails,
  graph,
  acknowledgeSensitiveLineage,
  onAckChange,
  sensitiveCandidateCount,
  onTriggerBuilds,
  onReloadImpact,
  buildTimeline,
  branch,
}: BottomPanelProps) {
  const height = collapsed ? 36 : fullscreen ? '60vh' : 240;

  return (
    <div style={{ ...bottomPanel, height, transition: 'height 120ms ease-out' }}>
      <div style={bottomPanelTabs}>
        {BOTTOM_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            style={{ ...bottomTabBtn, ...(t.id === tab && !collapsed ? bottomTabBtnActive : {}) }}
            onClick={() => {
              onTabChange(t.id);
              if (collapsed) onCollapse();
            }}
          >
            <span style={{ display: 'inline-flex', width: 14, height: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={selectedIndicator}>
          {selectedNode ? `${selectedNode.kind} selected${selectedCount > 1 ? ` · ${selectedCount} nodes` : ''}` : 'No node selected'}
        </span>
        <button type="button" style={iconBtnGhost} onClick={onCollapse} title={collapsed ? 'Expand panel' : 'Collapse panel'}>
          <IconChevronsDown />
        </button>
        <button type="button" style={iconBtnGhost} onClick={onFullscreen} title="Fullscreen panel">
          <IconFullscreen />
        </button>
      </div>

      {!collapsed && (
        <div style={bottomPanelBody}>
          {tab === 'preview' && (
            <PreviewTab
              selectedNode={selectedNode}
              datasetPreview={datasetPreview}
              datasetPreviewLoading={datasetPreviewLoading}
              branch={branch}
            />
          )}
          {tab === 'schema' && <SchemaTab selectedNode={selectedNode} nodeDetails={nodeDetails} datasetPreview={datasetPreview} />}
          {tab === 'history' && <HistoryTab selectedNode={selectedNode} graph={graph} />}
          {tab === 'jobs' && <JobsTab selectedNode={selectedNode} nodeDetails={nodeDetails} buildResult={buildResult} />}
          {tab === 'schedules' && <SchedulesTab selectedNode={selectedNode} nodeDetails={nodeDetails} />}
          {tab === 'health' && (
            <HealthTab
              selectedNode={selectedNode}
              impact={impact}
              impactLoading={impactLoading}
              building={building}
              nodeDetails={nodeDetails}
              acknowledgeSensitiveLineage={acknowledgeSensitiveLineage}
              onAckChange={onAckChange}
              sensitiveCandidateCount={sensitiveCandidateCount}
              onTriggerBuilds={onTriggerBuilds}
              onReloadImpact={onReloadImpact}
            />
          )}
          {tab === 'permissions' && <PermissionsTab selectedNode={selectedNode} />}
          {tab === 'code' && <CodeTab selectedNode={selectedNode} />}
          {tab === 'build_timeline' && buildTimeline}
        </div>
      )}
    </div>
  );
}

interface PreviewTabProps {
  selectedNode: LineageNode | null;
  datasetPreview: DatasetPreviewResponse | null;
  datasetPreviewLoading: boolean;
  branch: string;
}
function PreviewTab({ selectedNode, datasetPreview, datasetPreviewLoading, branch }: PreviewTabProps) {
  if (!selectedNode) {
    return <div style={tabHint}>Select a node to inspect its preview.</div>;
  }
  if (isMediaSetNode(selectedNode)) {
    return <MediaSetPreview mediaSetRid={selectedNode.id} branch={branch} />;
  }
  if (selectedNode.kind !== 'dataset') {
    return (
      <div style={tabHint}>
        {selectedNode.label} is a {selectedNode.kind}. Preview is only available for datasets.
      </div>
    );
  }
  const metadata = selectedNode.metadata ?? {};
  const datasetPath = metadataString(metadata, 'path') || metadataString(metadata, 'folder_path');
  const displayName = metadataString(metadata, 'display_name') || selectedNode.label;
  const datasetHref = datasetHrefForNode(selectedNode);
  const previewHeader = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--border-default)' }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</strong>
        <span className="of-text-muted" style={{ display: 'block', marginTop: 2, fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {datasetPath || selectedNode.id}
        </span>
      </div>
      <Link to={datasetHref} className="of-button" style={{ flex: '0 0 auto', fontSize: 11 }}>
        Open dataset
      </Link>
    </div>
  );
  if (datasetPreviewLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateRows: 'max-content 1fr', height: '100%' }}>
        {previewHeader}
        <div style={tabHint}>Loading dataset preview…</div>
      </div>
    );
  }
  if (!datasetPreview || !datasetPreview.rows || datasetPreview.rows.length === 0) {
    return (
      <div style={{ display: 'grid', gridTemplateRows: 'max-content 1fr', height: '100%' }}>
        {previewHeader}
        <div style={tabHint}>No preview rows available for this dataset.</div>
      </div>
    );
  }
  const columns = datasetPreview.columns ?? [];
  const rows = datasetPreview.rows;

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'max-content 1fr', height: '100%' }}>
      {previewHeader}
      <div style={{ overflow: 'auto', minHeight: 0 }}>
        <table style={previewTable}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.name} style={previewTh}>
                  {col.name}
                  <div style={{ fontSize: 10, color: 'var(--text-soft)', fontWeight: 400 }}>
                    {col.field_type ?? col.data_type ?? ''}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((col) => (
                  <td key={col.name} style={previewTd}>
                    {formatPreviewCell(row[col.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isMediaSetNode(node: LineageNode): boolean {
  if (node.kind === 'media_set') return true;
  const meta = node.metadata ?? {};
  for (const key of ['resource_type', 'kind', 'dataset_kind']) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === 'string' && value === 'media_set') return true;
  }
  return false;
}

function formatPreviewCell(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function shortRef(value?: string | null, length = 12) {
  if (!value) return 'n/a';
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function datasetRidForNode(node: LineageNode | null) {
  if (!node) return '';
  return metadataString(node.metadata ?? {}, 'rid') || metadataString(node.metadata ?? {}, 'dataset_rid') || node.id;
}

function nodeDisplayPath(node: LineageNode) {
  const metadata = node.metadata ?? {};
  return metadataString(metadata, 'path') || metadataString(metadata, 'folder_path') || metadataString(metadata, 'repository') || node.id;
}

function relationLabel(edge: { relation_kind: string; source_kind?: string; target_kind?: string }) {
  return edge.relation_kind.replace(/_/g, ' ');
}

function schemaRows(schema: DatasetSchemaLike | null, preview: DatasetPreviewResponse | null) {
  const rows: Array<{ name: string; type: string; nullable: string }> = [];
  if (schema) {
    const raw = 'schema' in schema ? schema.schema.fields : schema.fields;
    if (Array.isArray(raw)) {
      for (const field of raw) {
        if (isRecord(field)) {
          const fieldType = field.field_type ?? field.type ?? field.data_type;
          rows.push({
            name: String(field.name ?? 'column'),
            type: typeof fieldType === 'string' ? fieldType : isRecord(fieldType) ? String(fieldType.type ?? 'struct') : 'unknown',
            nullable: field.nullable === false || field.required === true ? 'required' : 'nullable',
          });
        }
      }
    } else if (isRecord(raw)) {
      for (const [name, value] of Object.entries(raw)) {
        rows.push({ name, type: typeof value === 'string' ? value : 'unknown', nullable: 'unknown' });
      }
    }
  }
  if (rows.length === 0) {
    for (const column of preview?.columns ?? []) {
      rows.push({
        name: column.name,
        type: column.field_type ?? column.data_type ?? 'unknown',
        nullable: column.nullable === false ? 'required' : 'nullable',
      });
    }
  }
  return rows;
}

function datasetHrefForNode(node: LineageNode) {
  const links = node.metadata?.links;
  if (links && typeof links === 'object' && !Array.isArray(links)) {
    const linkMap = links as Record<string, unknown>;
    for (const key of ['preview', 'self']) {
      const value = linkMap[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return `/datasets/${encodeURIComponent(node.id)}`;
}

function SchemaTab({ selectedNode, nodeDetails, datasetPreview }: { selectedNode: LineageNode | null; nodeDetails: NodeDetailsState; datasetPreview: DatasetPreviewResponse | null }) {
  if (!selectedNode) return <div style={tabHint}>Select a node to inspect schema.</div>;
  const rows = schemaRows(nodeDetails.schema, datasetPreview);
  if (selectedNode.kind !== 'dataset' && rows.length === 0) {
    return <div style={tabHint}>Schema details are captured for datasets and schema-backed outputs.</div>;
  }
  if (nodeDetails.loading && rows.length === 0) return <div style={tabHint}>Loading schema…</div>;
  return (
    <div style={{ overflow: 'auto', height: '100%', padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>{selectedNode.label}</strong>
        <span className="of-text-muted" style={{ fontSize: 11 }}>{rows.length} field{rows.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 ? (
        <div style={tabHint}>No schema has been captured for this node.</div>
      ) : (
        <table style={previewTable}>
          <thead>
            <tr>
              <th style={previewTh}>Column</th>
              <th style={previewTh}>Type</th>
              <th style={previewTh}>Nullability</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td style={previewTd}>{row.name}</td>
                <td style={previewTd}>{row.type}</td>
                <td style={previewTd}>{row.nullable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HistoryTab({ selectedNode, graph }: { selectedNode: LineageNode | null; graph: LineageGraph | null }) {
  if (!selectedNode) return <div style={tabHint}>Select a node to inspect history and graph references.</div>;
  const metadata = selectedNode.metadata ?? {};
  const incoming = graph?.edges.filter((edge) => edge.target === selectedNode.id) ?? [];
  const outgoing = graph?.edges.filter((edge) => edge.source === selectedNode.id) ?? [];
  const facts = [
    ['Resource type', selectedNode.kind],
    ['Path', nodeDisplayPath(selectedNode)],
    ['Branch', metadataString(metadata, 'active_branch') || metadataString(metadata, 'branch') || metadataString(metadata, 'build_branch') || 'n/a'],
    ['Version', metadataNumber(metadata, 'current_version')?.toString() || metadataString(metadata, 'version') || 'n/a'],
    ['Status', metadataString(metadata, 'status') || 'n/a'],
    ['Last refreshed', metadataString(metadata, 'metadata_refreshed_at') || metadataString(metadata, 'lineage_synced_at') || 'n/a'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 12, padding: 12, overflow: 'auto', height: '100%' }}>
      <div className="of-panel-muted" style={{ padding: 12 }}>
        <p className="of-eyebrow">Resource history</p>
        <dl style={{ display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr)', gap: '6px 8px', margin: '8px 0 0', fontSize: 12 }}>
          {facts.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt className="of-text-muted">{label}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <RelationList title="Incoming" edges={incoming} graph={graph} empty="No upstream graph references." />
        <RelationList title="Outgoing" edges={outgoing} graph={graph} empty="No downstream graph references." />
      </div>
    </div>
  );
}

function RelationList({ title, edges, graph, empty }: { title: string; edges: LineageGraph['edges']; graph: LineageGraph | null; empty: string }) {
  const nodes = graph?.nodes ?? [];
  return (
    <div className="of-panel-muted" style={{ padding: 12, minWidth: 0 }}>
      <p className="of-eyebrow">{title}</p>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {edges.length === 0 ? (
          <div className="of-text-muted" style={{ fontSize: 12 }}>{empty}</div>
        ) : edges.slice(0, 12).map((edge) => {
          const peerId = title === 'Incoming' ? edge.source : edge.target;
          const peer = nodes.find((node) => node.id === peerId);
          return (
            <div key={edge.id} style={impactRow}>
              <div style={{ fontWeight: 500, fontSize: 12 }}>{peer?.label ?? peerId}</div>
              <div className="of-eyebrow" style={{ marginTop: 2 }}>{relationLabel(edge)} · {edge.effective_marking}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobsTab({ selectedNode, nodeDetails, buildResult }: { selectedNode: LineageNode | null; nodeDetails: NodeDetailsState; buildResult: LineageBuildResult | null }) {
  if (!selectedNode) return <div style={tabHint}>Select a dataset to inspect jobs and builds.</div>;
  if (nodeDetails.loading) return <div style={tabHint}>Loading jobs…</div>;
  const builds = nodeDetails.builds;
  return (
    <div style={{ padding: 12, overflow: 'auto', height: '100%', display: 'grid', gap: 10 }}>
      {buildResult && (
        <div className="of-panel-muted" style={{ padding: 12 }}>
          <p className="of-eyebrow">Latest lineage build dispatch</p>
          <div className="of-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            {buildResult.triggered.length} triggered · {buildResult.skipped.length} skipped
          </div>
        </div>
      )}
      {builds.length === 0 ? (
        <div style={tabHint}>No build/job history has been linked to this dataset.</div>
      ) : builds.map((build) => (
        <div key={build.rid} style={candidateRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13, overflowWrap: 'anywhere' }}>{build.rid}</div>
            <div className="of-eyebrow" style={{ marginTop: 4 }}>
              {build.pipeline_rid} · {build.build_branch}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{build.state}</div>
            <div className="of-text-muted" style={{ fontSize: 11 }}>{build.finished_at ?? build.started_at ?? build.queued_at ?? build.created_at}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SchedulesTab({ selectedNode, nodeDetails }: { selectedNode: LineageNode | null; nodeDetails: NodeDetailsState }) {
  if (!selectedNode) return <div style={tabHint}>Select a dataset to inspect schedules.</div>;
  if (nodeDetails.loading) return <div style={tabHint}>Loading schedules…</div>;
  if (nodeDetails.schedules.length === 0) return <div style={tabHint}>No schedules touch this node.</div>;
  return (
    <div style={{ padding: 12, overflow: 'auto', height: '100%', display: 'grid', gap: 8 }}>
      {nodeDetails.schedules.map((schedule) => (
        <div key={schedule.rid} style={candidateRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{schedule.name}</div>
            <div className="of-eyebrow" style={{ marginTop: 4 }}>{schedule.branch} · {schedule.build_strategy}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{schedule.paused ? 'paused' : 'active'}</div>
            <Link to={`/schedules/${encodeURIComponent(schedule.rid)}`} className="of-text-muted" style={{ fontSize: 11 }}>Open</Link>
          </div>
        </div>
      ))}
    </div>
  );
}

interface CodeTabProps {
  selectedNode: LineageNode | null;
}
function CodeTab({ selectedNode }: CodeTabProps) {
  const [editorRef, setEditorRef] = useState<MonacoEditorHandle | null>(null);
  const [editable, setEditable] = useState(false);
  if (!selectedNode) {
    return <div style={tabHint}>Select a dataset to view its job-spec source.</div>;
  }
  const meta = selectedNode.metadata ?? {};
  const code =
    (typeof meta.transform_source === 'string' && meta.transform_source) ||
    (typeof meta.source === 'string' && meta.source) ||
    '';
  if (!code) {
    return (
      <div style={tabHint}>
        No transform source captured for {selectedNode.label}. Code is only available for datasets
        produced by Code Repository or Pipeline Builder transforms.
      </div>
    );
  }

  const language = (() => {
    for (const key of ['transform_language', 'language', 'code_language']) {
      const value = (meta as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length > 0) {
        const normalized = value.toLowerCase();
        if (normalized.includes('python') || normalized.includes('pyspark')) return 'python';
        if (normalized.includes('sql')) return 'sql';
        if (normalized.includes('r')) return 'r';
        if (normalized.includes('javascript') || normalized.includes('typescript')) return 'typescript';
        if (normalized.includes('java')) return 'java';
        if (normalized.includes('scala')) return 'scala';
        return normalized;
      }
    }
    // Last-resort heuristic on the code body.
    if (/^(from |import |def )/m.test(code)) return 'python';
    if (/^\s*(select|with|from)\s/i.test(code)) return 'sql';
    return 'plaintext';
  })();

  const repoUrl = firstMetaStringLocal(meta, ['repository_url', 'repo_url', 'source_repository_url']);
  const workbookUrl = firstMetaStringLocal(meta, ['workbook_url', 'code_workbook_url', 'notebook_url']);
  const repoLabel = workbookUrl ? 'View in code workbook' : 'View in repository';
  const externalUrl = workbookUrl ?? repoUrl;

  return (
    <div style={codeTabRoot}>
      <div style={codeToolbar}>
        <button
          type="button"
          className="of-button"
          style={{ fontSize: 11 }}
          onClick={() => setEditable((v) => !v)}
          title={editable ? 'Lock the editor (Quick edit off)' : 'Toggle Quick edit (local-only)'}
        >
          {editable ? 'Lock' : 'Quick edit'}
        </button>
        <button
          type="button"
          className="of-button"
          style={{ fontSize: 11 }}
          onClick={() => editorRef?.editor.getAction('actions.find')?.run()}
          title="Find in code (⌘F)"
        >
          Find…
        </button>
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="of-button"
            style={{ fontSize: 11 }}
          >
            {repoLabel} ↗
          </a>
        ) : (
          <span className="of-text-muted" style={{ fontSize: 11 }}>
            No repository or workbook link captured
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span className="of-text-muted" style={{ fontSize: 11 }}>
          {language}
        </span>
      </div>
      <div style={codeBody}>
        <MonacoEditor
          value={code}
          language={language}
          minimap
          readOnly={!editable}
          minHeight={220}
          onMount={(editor) => setEditorRef({ editor })}
        />
      </div>
    </div>
  );
}

interface MonacoEditorHandle {
  editor: import('monaco-editor/esm/vs/editor/editor.api').editor.IStandaloneCodeEditor;
}

function firstMetaStringLocal(metadata: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

const codeTabRoot: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
};
const codeToolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'var(--bg-canvas)',
};
const codeBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

interface HealthTabProps {
  selectedNode: LineageNode | null;
  impact: LineageImpactAnalysis | null;
  impactLoading: boolean;
  building: boolean;
  nodeDetails: NodeDetailsState;
  acknowledgeSensitiveLineage: boolean;
  onAckChange: (v: boolean) => void;
  sensitiveCandidateCount: number;
  onTriggerBuilds: () => void;
  onReloadImpact: () => void;
}

function lineageHealthCheckKinds(
  selectedNode: LineageNode,
  impact: LineageImpactAnalysis,
  nodeDetails: NodeDetailsState,
) {
  const kinds = new Set<ResourceHealthCheckKind>(['status']);
  if (nodeDetails.health) {
    kinds.add('freshness');
    kinds.add('build');
    kinds.add('schema');
    kinds.add('size');
  }
  if (nodeDetails.schema) kinds.add('schema');
  if (nodeDetails.builds.length > 0 || impact.build_candidates.length > 0) {
    kinds.add('duration');
    kinds.add('build');
    kinds.add('job');
  }
  if (nodeDetails.schedules.length > 0) {
    kinds.add('duration');
    kinds.add('schedule');
  }
  if (impact.upstream.length > 0 || impact.downstream.length > 0) kinds.add('content');
  const metadata = selectedNode.metadata ?? {};
  const syncSignal = ['sync_id', 'source_id', 'connector_type', 'sync_status'].some((key) => metadataString(metadata, key));
  if (syncSignal) kinds.add('sync');
  return Array.from(kinds);
}

function HealthTab({
  selectedNode,
  impact,
  impactLoading,
  building,
  nodeDetails,
  acknowledgeSensitiveLineage,
  onAckChange,
  sensitiveCandidateCount,
  onTriggerBuilds,
  onReloadImpact,
}: HealthTabProps) {
  if (!selectedNode || selectedNode.kind !== 'dataset') {
    return <div style={tabHint}>Select a dataset to inspect health and upstream / downstream impact.</div>;
  }
  if (impactLoading) return <div style={tabHint}>Loading impact analysis…</div>;
  if (!impact) {
    return (
      <div style={tabHint}>
        Impact data is not available.{' '}
        <button type="button" className="of-btn" onClick={onReloadImpact}>
          Retry
        </button>
      </div>
    );
  }
  const resourceRid = datasetRidForNode(selectedNode);
  const availableKinds = lineageHealthCheckKinds(selectedNode, impact, nodeDetails);
  return (
    <div style={{ display: 'grid', gap: 12, padding: '12px 16px', overflow: 'auto', height: '100%' }}>
      <div style={metricsGrid}>
        <MetricCard label="Upstream" value={impact.upstream.length} />
        <MetricCard label="Downstream" value={impact.downstream.length} />
        <MetricCard label="Build candidates" value={impact.build_candidates.length} />
        <MetricCard label="Propagated marking" value={impact.propagated_marking} />
        {nodeDetails.health && (
          <>
            <MetricCard label="Rows" value={nodeDetails.health.row_count} />
            <MetricCard label="Columns" value={nodeDetails.health.col_count} />
            <MetricCard label="Last build" value={nodeDetails.health.last_build_status} />
            <MetricCard label="Schema drift" value={nodeDetails.health.schema_drift_flag ? 'yes' : 'no'} />
          </>
        )}
      </div>

      {nodeDetails.errors.length > 0 && (
        <div className="of-status-warning" style={{ padding: 10, borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {nodeDetails.errors.join(' ')}
        </div>
      )}

      <section className="of-panel-muted" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="of-text-muted" style={{ fontSize: 12 }}>Latest Data Health report snapshot</span>
        <ResourceHealthStatusBadge resourceRid={resourceRid} compact />
      </section>

      <ResourceHealthChecksPanel
        resourceRid={resourceRid}
        resourceName={selectedNode.label || resourceRid}
        resourceType="dataset"
        sourceSurface="data_lineage"
        availableKinds={availableKinds}
        defaultGroup="Data Lineage"
        defaultMonitoringView={metadataString(selectedNode.metadata ?? {}, 'project_rid') || metadataString(selectedNode.metadata ?? {}, 'folder_path') || 'Lineage health'}
        compact
      />

      {sensitiveCandidateCount > 0 && (
        <label
          className="of-status-warning"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={acknowledgeSensitiveLineage}
            onChange={(e) => onAckChange(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            {sensitiveCandidateCount} downstream build candidate(s) inherit confidential or PII
            lineage. Acknowledge before dispatching.
          </span>
        </label>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="of-btn" onClick={onReloadImpact} disabled={impactLoading}>
          {impactLoading ? 'Refreshing…' : 'Refresh impact'}
        </button>
        <button
          type="button"
          className="of-btn of-btn-primary"
          onClick={onTriggerBuilds}
          disabled={building || (sensitiveCandidateCount > 0 && !acknowledgeSensitiveLineage)}
        >
          {building ? 'Triggering…' : 'Build impacted'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <ImpactColumn title="Upstream" items={impact.upstream.slice(0, 8)} empty="No upstream dependencies." />
        <ImpactColumn title="Downstream" items={impact.downstream.slice(0, 8)} empty="No downstream dependencies." />
      </div>

      <div className="of-panel-muted" style={{ padding: 12 }}>
        <p className="of-eyebrow">Build candidates</p>
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          {impact.build_candidates.length === 0 ? (
            <div className="of-text-muted" style={{ fontSize: 12 }}>
              No downstream pipelines or workflows are reachable from this dataset.
            </div>
          ) : (
            impact.build_candidates.map((c) => (
              <div key={c.id} style={candidateRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{c.label}</div>
                  <div className="of-eyebrow" style={{ marginTop: 4 }}>
                    {c.kind} · distance {c.distance} · path marking {c.effective_marking}
                  </div>
                  {c.requires_acknowledgement && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--status-warning)' }}>
                      Sensitive lineage acknowledgment required
                    </div>
                  )}
                  {c.blocked_reason && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--status-danger)' }}>
                      {c.blocked_reason}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: c.triggerable ? 'var(--status-success)' : 'var(--text-muted)',
                    }}
                  >
                    {c.status ?? 'unknown'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface ImpactColumnProps {
  title: string;
  items: { id: string; label: string; kind: string; distance: number; marking: string; effective_marking: string }[];
  empty: string;
}
function ImpactColumn({ title, items, empty }: ImpactColumnProps) {
  return (
    <div className="of-panel-muted" style={{ padding: 12 }}>
      <p className="of-eyebrow">{title}</p>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {items.length === 0 ? (
          <div className="of-text-muted" style={{ fontSize: 12 }}>
            {empty}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} style={impactRow}>
              <div style={{ fontWeight: 500, fontSize: 12 }}>{item.label}</div>
              <div className="of-eyebrow" style={{ marginTop: 2 }}>
                {item.kind} · d{item.distance} · {item.marking}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="of-panel-muted" style={{ padding: 12 }}>
      <p className="of-eyebrow">{label}</p>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function PermissionsTab({ selectedNode }: { selectedNode: LineageNode | null }) {
  if (!selectedNode) return <div style={tabHint}>Select a node to inspect permissions and markings.</div>;
  const metadata = selectedNode.metadata ?? {};
  const rows = [
    ['Effective marking', selectedNode.marking],
    ['Dataset marking', metadataString(metadata, 'dataset_marking') || metadataString(metadata, 'base_marking') || 'n/a'],
    ['Visibility', metadataString(metadata, 'resource_visibility') || 'n/a'],
    ['Owner', metadataString(metadata, 'owner_id') || metadataString(metadata, 'owner') || 'n/a'],
    ['Project', metadataString(metadata, 'project_rid') || metadataString(metadata, 'project_id') || 'n/a'],
    ['Folder', metadataString(metadata, 'folder_path') || metadataString(metadata, 'parent_folder_rid') || 'n/a'],
  ];
  const permissionRefs = Array.isArray(metadata.permissions) ? metadata.permissions : [];
  return (
    <div style={{ padding: 12, overflow: 'auto', height: '100%', display: 'grid', gap: 12 }}>
      <div className="of-panel-muted" style={{ padding: 12 }}>
        <p className="of-eyebrow">Access context</p>
        <dl style={{ display: 'grid', gridTemplateColumns: '130px minmax(0, 1fr)', gap: '6px 8px', margin: '8px 0 0', fontSize: 12 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt className="of-text-muted">{label}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="of-panel-muted" style={{ padding: 12 }}>
        <p className="of-eyebrow">Permission references</p>
        {permissionRefs.length === 0 ? (
          <div className="of-text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            No explicit permission edges are attached to this lineage node yet.
          </div>
        ) : (
          <pre style={{ ...codePre, maxHeight: 120, marginTop: 8 }}>
            <code>{JSON.stringify(permissionRefs, null, 2)}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

function ZoomButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} style={zoomButton}>
      {children}
    </button>
  );
}

// =============================================================================
// Inline styles — keeps the layout self-contained next to the component logic.
// =============================================================================

const pageRoot: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto auto 1fr',
  height: 'calc(100vh - var(--topbar-height, 56px))',
  background: 'var(--bg-canvas)',
  margin: 0,
};
const presentationPageRoot: CSSProperties = {
  ...pageRoot,
  gridTemplateRows: '1fr',
  height: '100vh',
};

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '6px 12px',
  background: 'var(--bg-default)',
  borderBottom: '1px solid var(--border-default)',
};
const headerLeft: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minWidth: 220 };
const lineageMark: CSSProperties = { display: 'inline-flex' };
const headerTitle: CSSProperties = { fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' };
const headerCenter: CSSProperties = { flex: 1, display: 'flex', justifyContent: 'center', gap: 6 };
const headerRight: CSSProperties = { display: 'flex', alignItems: 'center', gap: 4 };

const branchPicker: CSSProperties = { position: 'relative' };
const branchTrigger: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  width: 280,
  height: 30,
  padding: '0 10px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-default)',
  color: 'var(--text-default)',
  fontSize: 13,
};
const branchMenu: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  width: 280,
  zIndex: 30,
  padding: 4,
  display: 'grid',
  gap: 2,
};

const iconBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text-muted)',
  borderRadius: 'var(--radius-sm)',
};
const iconBtnGhost: CSSProperties = {
  ...iconBtn,
  width: 22,
  height: 22,
  fontSize: 13,
};

const savePrimary: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 30,
  padding: '0 14px',
  border: '1px solid #18794a',
  background: '#1f9c5b',
  color: '#fff',
  borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
  fontWeight: 600,
  fontSize: 13,
};
const saveCaret: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 30,
  width: 24,
  border: '1px solid #18794a',
  borderLeft: 'none',
  background: '#1f9c5b',
  color: '#fff',
  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
};
const saveMenu: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  width: 200,
  zIndex: 30,
  padding: 4,
  display: 'grid',
  gap: 2,
};

const ribbonRow: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 4,
  padding: '6px 8px',
  background: 'var(--bg-panel-muted)',
  borderBottom: '1px solid var(--border-default)',
  minHeight: 56,
};
const ribbonGroup: CSSProperties = {
  display: 'inline-flex',
  background: 'var(--bg-default)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
};
const toolBtn: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  minWidth: 56,
  padding: '4px 6px',
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text-default)',
  borderRadius: 'var(--radius-sm)',
};
const toolBtnActive: CSSProperties = {
  background: 'var(--bg-chip-active)',
  border: '1px solid var(--border-focus)',
  color: 'var(--text-link)',
};
const toolBtnDisabled: CSSProperties = { opacity: 0.4, cursor: 'not-allowed' };
const toolGroupWrap: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '4px 6px',
};
const toolGroupRow: CSSProperties = {
  display: 'inline-flex',
  gap: 4,
};
const findModeBtn: CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 600,
  background: 'var(--bg-canvas)',
  color: 'var(--text-muted)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};
const findModeBtnActive: CSSProperties = {
  background: 'var(--bg-chip-active)',
  color: 'var(--text-link)',
  borderColor: 'var(--border-focus)',
};
const toolSubBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 22,
  padding: 2,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text-default)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};
const toolBtnIcon: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
const toolBtnLabel: CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  textTransform: 'none',
  whiteSpace: 'pre',
  textAlign: 'center',
  lineHeight: 1.1,
  marginTop: 2,
};

const expandPopover: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  zIndex: 25,
  width: 320,
  padding: 12,
};
const expandRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '6px 8px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-default)',
  borderRadius: 'var(--radius-sm)',
  textAlign: 'left',
};
const hotkey: CSSProperties = { marginLeft: 'auto', color: 'var(--text-soft)', fontSize: 11 };
const expandStepperRow: CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' };

const stepperWrap: CSSProperties = { display: 'grid', gap: 4, justifyItems: 'center' };
const stepperControls: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'stretch',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
};
const stepperBtn: CSSProperties = {
  width: 24,
  height: 28,
  background: 'var(--bg-default)',
  border: 'none',
  borderRight: '1px solid var(--border-subtle)',
  color: 'var(--text-muted)',
};
const stepperValue: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 28,
  fontWeight: 600,
};
const stepperHint: CSSProperties = { fontSize: 11, color: 'var(--text-muted)' };

const coloringPopover: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  zIndex: 25,
  width: 220,
  padding: 4,
  maxHeight: 360,
  overflow: 'auto',
};
const findPopover: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  zIndex: 25,
  width: 240,
  padding: 8,
};
const findInput: CSSProperties = {
  width: '100%',
  height: 28,
  padding: '0 8px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-default)',
  color: 'var(--text-default)',
  fontSize: 12,
};

const coloringSelect: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 36,
  padding: '0 8px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-default)',
  fontSize: 12,
  minWidth: 170,
  color: 'var(--text-default)',
};

const canvasShell: CSSProperties = {
  display: 'grid',
  gridTemplateRows: '1fr auto',
  minHeight: 0,
};
const presentationCanvasShell: CSSProperties = {
  ...canvasShell,
  gridTemplateRows: '1fr',
};
const canvasArea: CSSProperties = {
  position: 'relative',
  background: 'var(--bg-canvas)',
  minHeight: 0,
};
const presentationBanner: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  zIndex: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  maxWidth: 460,
  padding: '10px 12px',
};
const errorBanner: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  right: 12,
  zIndex: 5,
  padding: '10px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
};
const emptyState: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  color: 'var(--text-muted)',
  fontSize: 13,
};

const legendCard: CSSProperties = {
  position: 'absolute',
  top: 18,
  right: 80,
  zIndex: 8,
  padding: 12,
  display: 'grid',
  gap: 6,
  minWidth: 180,
  maxWidth: 320,
  maxHeight: 'calc(100% - 64px)',
  overflow: 'auto',
};
const legendHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 2,
};
const legendClearBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-link)',
  fontSize: 11,
  padding: 0,
};
const legendItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: 'none',
  background: 'transparent',
  padding: '2px 0',
  textAlign: 'left',
  width: '100%',
  borderRadius: 'var(--radius-sm)',
};
const legendItemHidden: CSSProperties = {
  opacity: 0.42,
  textDecoration: 'line-through',
};
const legendSwatch: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid rgba(31,37,45,0.18)',
  flex: '0 0 auto',
};

const filterLegendRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  minWidth: 0,
  fontSize: 12,
  color: 'var(--text-default)',
};

const snapshotActionGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 6,
};

const zoomStack: CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: 12,
  display: 'grid',
  gap: 6,
  zIndex: 6,
};
const zoomButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  background: 'var(--bg-default)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-muted)',
  boxShadow: 'var(--shadow-popover)',
};

const rightRail: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  display: 'grid',
  gap: 4,
  background: 'var(--bg-default)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 4,
  zIndex: 6,
};
const rightRailButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-muted)',
};
const rightRailBadge: CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  minWidth: 16,
  height: 14,
  padding: '0 4px',
  borderRadius: 7,
  background: 'var(--text-link)',
  color: '#fff',
  fontSize: 9,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
};
const rightRailButtonActive: CSSProperties = {
  background: 'var(--bg-chip-active)',
  borderColor: 'var(--border-focus)',
  color: 'var(--text-link)',
};
const rightRailCollapse: CSSProperties = {
  ...rightRailButton,
  marginTop: 2,
};
const rightRailDrawer: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 60,
  width: 320,
  height: 'calc(100% - 32px)',
  zIndex: 5,
  display: 'flex',
  flexDirection: 'column',
};

const resourceListRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-default)',
  fontSize: 12,
  color: 'var(--text-default)',
};
const resourceDot: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid rgba(31,37,45,0.2)',
};

const bottomPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderTop: '1px solid var(--border-default)',
  background: 'var(--bg-default)',
  overflow: 'hidden',
};
const bottomPanelTabs: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '0 12px',
  borderBottom: '1px solid var(--border-subtle)',
  height: 36,
};
const bottomTabBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 10px',
  border: '1px solid transparent',
  borderBottom: 'none',
  background: 'transparent',
  color: 'var(--text-muted)',
  borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
  fontSize: 12,
};
const bottomTabBtnActive: CSSProperties = {
  background: 'var(--bg-default)',
  border: '1px solid var(--border-default)',
  borderBottom: '1px solid var(--bg-default)',
  color: 'var(--text-link)',
  fontWeight: 600,
  position: 'relative',
  top: 1,
};
const selectedIndicator: CSSProperties = {
  marginRight: 12,
  fontSize: 12,
  color: 'var(--text-link)',
  fontWeight: 500,
};
const bottomPanelBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  background: 'var(--bg-default)',
};

const tabHint: CSSProperties = {
  padding: 16,
  color: 'var(--text-muted)',
  fontSize: 12,
};

const previewTable: CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  fontSize: 12,
};
const previewTh: CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  borderBottom: '1px solid var(--border-default)',
  background: 'var(--bg-panel-muted)',
  fontWeight: 600,
  color: 'var(--text-strong)',
  position: 'sticky',
  top: 0,
};
const previewTd: CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-default)',
};

const codePre: CSSProperties = {
  margin: 0,
  padding: 16,
  background: '#0f172a',
  color: '#e2e8f0',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  whiteSpace: 'pre',
  overflow: 'auto',
  height: '100%',
};

const metricsGrid: CSSProperties = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
};
const candidateRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 10,
  background: 'var(--bg-default)',
};
const impactRow: CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 8,
  background: 'var(--bg-default)',
};

function menuItem(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '6px 10px',
    border: 'none',
    background: active ? 'var(--bg-chip-active)' : 'transparent',
    color: active ? 'var(--text-link)' : 'var(--text-default)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 12,
    textAlign: 'left',
    fontWeight: active ? 600 : 400,
  };
}
