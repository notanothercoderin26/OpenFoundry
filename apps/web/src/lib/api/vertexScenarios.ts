import api from './client';

// ────────────────────────────────────────────────────────────────
// vertex-service Scenario client. The UI keeps its camelCase typed
// surface; the JSON wire format is snake_case to match Go. Scenario
// diff + promote-to-actions helpers that pre-existed in the local
// stub are kept here, in addition to the new HTTP-backed CRUD.
// ────────────────────────────────────────────────────────────────

export type ScenarioEditKind = 'property_change' | 'link_add' | 'link_remove' | 'action_dry_run';

export interface VertexScenarioEdit {
  kind: ScenarioEditKind;
  targetObjectId?: string;
  targetTypeId?: string;
  propertyName?: string;
  propertyValue?: unknown;
  linkTypeId?: string;
  sourceObjectId?: string;
  targetNeighborObjectId?: string;
  actionId?: string;
  actionParameters?: Record<string, unknown>;
}

export interface VertexScenario {
  id: string;
  analysisRid: string;
  name: string;
  description: string;
  edits: VertexScenarioEdit[];
  branchRid: string | null;
  branchName: string | null;
  ephemeralOverlay: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VertexScenarioDiff {
  scenarioId: string;
  changedNodeCount: number;
  changedEdgeCount: number;
  addedCount: number;
  removedCount: number;
  metrics: Record<string, unknown>;
  impactedObjectRefs: string[];
}

// ── Wire types ────────────────────────────────────────────────────

interface WireStagedEdit {
  kind: string;
  target_ref: string;
  property_name?: string;
  old_value_json?: unknown;
  new_value_json?: unknown;
  action_id?: string | null;
}

interface WireScenario {
  id: string;
  graph_id: string;
  name: string;
  description: string;
  edits: WireStagedEdit[] | null;
  branch_context: string;
  author_id: string;
  created_at: string;
  updated_at: string;
}

interface WireScenarioDiff {
  scenario_id: string;
  changed_node_count: number;
  changed_edge_count: number;
  added_count: number;
  removed_count: number;
  metrics_json: unknown;
  impacted_object_refs: string[] | null;
}

interface WirePage<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  next_cursor?: string;
}

// ── Translation helpers ───────────────────────────────────────────

function graphIdFromRid(rid: string): string {
  const prefix = 'ri.vertex.main.graph.';
  if (rid.startsWith(prefix)) return rid.slice(prefix.length);
  return rid;
}

function ridFromGraphId(id: string): string {
  if (id.startsWith('ri.')) return id;
  return `ri.vertex.main.graph.${id}`;
}

function parseBranchContext(value: string): { branchRid: string | null; branchName: string | null } {
  if (!value) return { branchRid: null, branchName: null };
  try {
    const parsed = JSON.parse(value) as { branchRid?: string | null; branchName?: string | null };
    return {
      branchRid: typeof parsed.branchRid === 'string' ? parsed.branchRid : null,
      branchName: typeof parsed.branchName === 'string' ? parsed.branchName : null,
    };
  } catch {
    return { branchRid: null, branchName: value };
  }
}

function encodeBranchContext(branchRid: string | null, branchName: string | null): string {
  return JSON.stringify({ branchRid, branchName });
}

function fromWireEdit(edit: WireStagedEdit): VertexScenarioEdit {
  // The backend uses underscored kinds for some variants and
  // hyphenated for others; the UI standardised on action_dry_run.
  const kind = (edit.kind === 'action_dryrun' ? 'action_dry_run' : edit.kind) as ScenarioEditKind;
  return {
    kind,
    targetObjectId: edit.target_ref || undefined,
    propertyName: edit.property_name || undefined,
    propertyValue: edit.new_value_json,
    actionId: edit.action_id || undefined,
  };
}

function toWireEdit(edit: VertexScenarioEdit): WireStagedEdit {
  const kind = edit.kind === 'action_dry_run' ? 'action_dryrun' : edit.kind;
  const wire: WireStagedEdit = {
    kind,
    target_ref: edit.targetObjectId ?? '',
  };
  if (edit.propertyName !== undefined) wire.property_name = edit.propertyName;
  if (edit.propertyValue !== undefined) wire.new_value_json = edit.propertyValue;
  if (edit.actionId !== undefined) wire.action_id = edit.actionId;
  return wire;
}

function fromWire(scenario: WireScenario): VertexScenario {
  const ctx = parseBranchContext(scenario.branch_context);
  return {
    id: scenario.id,
    analysisRid: ridFromGraphId(scenario.graph_id),
    name: scenario.name,
    description: scenario.description,
    edits: (scenario.edits ?? []).map(fromWireEdit),
    branchRid: ctx.branchRid,
    branchName: ctx.branchName,
    ephemeralOverlay: ctx.branchRid === null,
    createdAt: scenario.created_at,
    updatedAt: scenario.updated_at,
  };
}

function fromWireDiff(diff: WireScenarioDiff): VertexScenarioDiff {
  const metrics =
    diff.metrics_json && typeof diff.metrics_json === 'object' && !Array.isArray(diff.metrics_json)
      ? (diff.metrics_json as Record<string, unknown>)
      : {};
  return {
    scenarioId: diff.scenario_id,
    changedNodeCount: diff.changed_node_count,
    changedEdgeCount: diff.changed_edge_count,
    addedCount: diff.added_count,
    removedCount: diff.removed_count,
    metrics,
    impactedObjectRefs: diff.impacted_object_refs ?? [],
  };
}

// ── Public HTTP-backed surface ────────────────────────────────────

export async function listVertexScenarios(analysisRid: string): Promise<VertexScenario[]> {
  const graphId = graphIdFromRid(analysisRid);
  const page = await api.get<WirePage<WireScenario>>(`/vertex/graphs/${graphId}/scenarios`);
  return (page.data ?? []).map(fromWire);
}

export async function getVertexScenario(
  analysisRid: string,
  scenarioId: string,
): Promise<VertexScenario | null> {
  const graphId = graphIdFromRid(analysisRid);
  try {
    const scenario = await api.get<WireScenario>(`/vertex/graphs/${graphId}/scenarios/${scenarioId}`);
    return fromWire(scenario);
  } catch (cause) {
    if (isNotFound(cause)) return null;
    throw cause;
  }
}

export async function saveVertexScenario(
  input: Omit<VertexScenario, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<VertexScenario> {
  const graphId = graphIdFromRid(input.analysisRid);
  const scenario = await api.post<WireScenario>(`/vertex/graphs/${graphId}/scenarios`, {
    name: input.name,
    description: input.description,
    edits: input.edits.map(toWireEdit),
    branch_context: encodeBranchContext(input.branchRid, input.branchName),
  });
  return fromWire(scenario);
}

export async function updateVertexScenario(
  analysisRid: string,
  scenarioId: string,
  patch: Partial<Pick<VertexScenario, 'name' | 'description' | 'edits'>>,
): Promise<VertexScenario | null> {
  const graphId = graphIdFromRid(analysisRid);
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.edits !== undefined) body.edits = patch.edits.map(toWireEdit);
  try {
    const scenario = await api.patch<WireScenario>(
      `/vertex/graphs/${graphId}/scenarios/${scenarioId}`,
      body,
    );
    return fromWire(scenario);
  } catch (cause) {
    if (isNotFound(cause)) return null;
    throw cause;
  }
}

export async function deleteVertexScenario(analysisRid: string, scenarioId: string): Promise<boolean> {
  const graphId = graphIdFromRid(analysisRid);
  try {
    await api.delete<void>(`/vertex/graphs/${graphId}/scenarios/${scenarioId}`);
    return true;
  } catch (cause) {
    if (isNotFound(cause)) return false;
    throw cause;
  }
}

export async function diffVertexScenario(
  analysisRid: string,
  scenarioId: string,
): Promise<VertexScenarioDiff> {
  const graphId = graphIdFromRid(analysisRid);
  const diff = await api.post<WireScenarioDiff>(
    `/vertex/graphs/${graphId}/scenarios/${scenarioId}/diff`,
    {},
  );
  return fromWireDiff(diff);
}

export async function promoteVertexScenario(
  analysisRid: string,
  scenarioId: string,
  targetBranch = false,
): Promise<{ actionInvocationIds: string[] }> {
  const graphId = graphIdFromRid(analysisRid);
  const response = await api.post<{ action_invocation_ids: string[] | null }>(
    `/vertex/graphs/${graphId}/scenarios/${scenarioId}/promote`,
    { target_branch: targetBranch },
  );
  return { actionInvocationIds: response.action_invocation_ids ?? [] };
}

// ── Pure UI helpers (kept synchronous; not backend-bound) ─────────

export function scenarioDiffSummary(
  baselineNodeCount: number,
  baselineEdgeCount: number,
  scenarioNodeCount: number,
  scenarioEdgeCount: number,
) {
  const changedNodes = Math.max(0, scenarioNodeCount - baselineNodeCount);
  const changedEdges = Math.max(0, scenarioEdgeCount - baselineEdgeCount);
  const removedNodes = Math.max(0, baselineNodeCount - scenarioNodeCount);
  const removedEdges = Math.max(0, baselineEdgeCount - scenarioEdgeCount);
  const clusterSize = scenarioNodeCount;
  const degree = scenarioNodeCount > 0 ? Number(((scenarioEdgeCount * 2) / scenarioNodeCount).toFixed(2)) : 0;
  const centrality = Number(Math.min(1, degree / 10).toFixed(3));
  return { changedNodes, changedEdges, removedNodes, removedEdges, degree, centrality, clusterSize };
}

export function promoteScenarioToActions(scenario: VertexScenario) {
  return scenario.edits
    .filter(
      (edit) =>
        edit.kind === 'action_dry_run' ||
        edit.kind === 'property_change' ||
        edit.kind === 'link_add' ||
        edit.kind === 'link_remove',
    )
    .map((edit, index) => ({
      order: index + 1,
      actionId: edit.actionId || `vertex.${edit.kind}`,
      mode: 'review_required',
      approval: 'required',
      payload: edit,
    }));
}

// ── Helpers ───────────────────────────────────────────────────────

function isNotFound(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const status = (cause as { status?: unknown }).status;
  return status === 404;
}
