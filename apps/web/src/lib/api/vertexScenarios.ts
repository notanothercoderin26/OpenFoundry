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

const STORAGE_KEY = 'of.vertex.scenarios.v1';

function readAll(): VertexScenario[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as VertexScenario[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: VertexScenario[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function createId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

export function listVertexScenarios(analysisRid: string): VertexScenario[] {
  return readAll().filter((row) => row.analysisRid === analysisRid);
}

export function saveVertexScenario(input: Omit<VertexScenario, 'id' | 'createdAt' | 'updatedAt'>): VertexScenario {
  const rows = readAll();
  const now = new Date().toISOString();
  const next: VertexScenario = { ...input, id: createId(), createdAt: now, updatedAt: now };
  rows.unshift(next);
  writeAll(rows);
  return next;
}

export function scenarioDiffSummary(baselineNodeCount: number, baselineEdgeCount: number, scenarioNodeCount: number, scenarioEdgeCount: number) {
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
    .filter((edit) => edit.kind === 'action_dry_run' || edit.kind === 'property_change' || edit.kind === 'link_add' || edit.kind === 'link_remove')
    .map((edit, index) => ({
      order: index + 1,
      actionId: edit.actionId || `vertex.${edit.kind}`,
      mode: 'review_required',
      approval: 'required',
      payload: edit,
    }));
}
