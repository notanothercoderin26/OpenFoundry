import api from './client';

// ────────────────────────────────────────────────────────────────
// vertex-service client — replaces the previous localStorage stub.
// The "VertexAnalysis" UI concept maps to the backend "Graph" wire
// type. Field names are translated on the boundary so existing UI
// code (VertexPage, etc.) keeps the camelCase surface it was built
// against, while the wire format remains snake_case to match Go.
// ────────────────────────────────────────────────────────────────

export interface VertexAnalysis {
  rid: string;
  title: string;
  description: string;
  seedObjectSetRid: string | null;
  layoutState: Record<string, unknown>;
  layerConfiguration: Record<string, unknown>;
  scenarioSet: string[];
  branchContext: { branchRid: string | null; branchName: string | null };
  owningProjectRid: string;
  organizations: string[];
  markings: string[];
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface VertexAnalysisVersion {
  versionId: string;
  analysisRid: string;
  authorUserId: string;
  timestamp: string;
  changelogMessage: string;
  snapshot: VertexAnalysis;
}

// Wire (Go) shapes — duplicated locally to avoid pulling in a
// generated SDK module before that toolchain lands.
interface WireGraph {
  id: string;
  rid: string;
  title: string;
  description: string;
  seed_object_refs: string[] | null;
  branch_context: string;
  model_rid: string;
  layout_state_json: unknown;
  layer_configuration_json: unknown;
  timeline_state_json: unknown;
  project_id?: string | null;
  organizations: string[] | null;
  markings: string[] | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface WireGraphVersion {
  id: string;
  graph_id: string;
  version: number;
  changelog: string;
  snapshot_json: unknown;
  author_id: string;
  created_at: string;
}

interface WirePage<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  next_cursor?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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
    // Legacy / plain string fallback — treat as branch name.
    return { branchRid: null, branchName: value };
  }
}

function encodeBranchContext(ctx: { branchRid: string | null; branchName: string | null }): string {
  return JSON.stringify(ctx);
}

function projectRidFromId(projectId: string | null | undefined): string {
  if (!projectId) return '';
  return `ri.compass.main.project.${projectId}`;
}

function projectIdFromRid(rid: string): string | null {
  if (!rid) return null;
  const prefix = 'ri.compass.main.project.';
  if (rid.startsWith(prefix)) return rid.slice(prefix.length);
  return rid;
}

function fromWire(graph: WireGraph): VertexAnalysis {
  const seeds = graph.seed_object_refs ?? [];
  return {
    rid: graph.rid,
    title: graph.title,
    description: graph.description,
    seedObjectSetRid: seeds.length > 0 ? seeds[0] : null,
    layoutState: asRecord(graph.layout_state_json),
    layerConfiguration: asRecord(graph.layer_configuration_json),
    scenarioSet: [],
    branchContext: parseBranchContext(graph.branch_context),
    owningProjectRid: projectRidFromId(graph.project_id ?? null),
    organizations: graph.organizations ?? [],
    markings: graph.markings ?? [],
    ownerUserId: graph.owner_id,
    createdAt: graph.created_at,
    updatedAt: graph.updated_at,
  };
}

function fromWireVersion(version: WireGraphVersion, analysisRid: string): VertexAnalysisVersion {
  const snapshot = version.snapshot_json as WireGraph | null;
  return {
    versionId: version.id,
    analysisRid,
    authorUserId: version.author_id,
    timestamp: version.created_at,
    changelogMessage: version.changelog,
    snapshot: snapshot ? fromWire(snapshot) : ({} as VertexAnalysis),
  };
}

function graphIdFromRid(rid: string): string {
  const prefix = 'ri.vertex.main.graph.';
  if (rid.startsWith(prefix)) return rid.slice(prefix.length);
  return rid;
}

// ───── CRUD ──────────────────────────────────────────────────────

export async function createVertexAnalysis(
  input: Omit<VertexAnalysis, 'rid' | 'createdAt' | 'updatedAt'>,
): Promise<VertexAnalysis> {
  const projectIdRaw = projectIdFromRid(input.owningProjectRid);
  const body: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    seed_object_refs: input.seedObjectSetRid ? [input.seedObjectSetRid] : [],
    branch_context: encodeBranchContext(input.branchContext),
    model_rid: '',
    organizations: input.organizations,
    markings: input.markings,
  };
  if (projectIdRaw) body.project_id = projectIdRaw;
  const created = await api.post<WireGraph>('/vertex/graphs', body);
  // The backend doesn't accept layout_state_json on create, so apply
  // it as an immediate PATCH if the caller supplied one.
  if (
    Object.keys(input.layoutState).length > 0 ||
    Object.keys(input.layerConfiguration).length > 0
  ) {
    const patched = await api.patch<WireGraph>(`/vertex/graphs/${graphIdFromRid(created.rid)}`, {
      layout_state_json: input.layoutState,
      layer_configuration_json: input.layerConfiguration,
    });
    return fromWire(patched);
  }
  return fromWire(created);
}

export async function listVertexAnalyses(projectRid?: string): Promise<VertexAnalysis[]> {
  const params = new URLSearchParams();
  if (projectRid) {
    const projectId = projectIdFromRid(projectRid);
    if (projectId) params.set('project_id', projectId);
  }
  const query = params.toString();
  const path = `/vertex/graphs${query ? `?${query}` : ''}`;
  const page = await api.get<WirePage<WireGraph>>(path);
  return (page.data ?? []).map(fromWire);
}

export async function getVertexAnalysis(rid: string): Promise<VertexAnalysis | null> {
  try {
    const graph = await api.get<WireGraph>(`/vertex/graphs/${graphIdFromRid(rid)}`);
    return fromWire(graph);
  } catch (cause) {
    if (isNotFound(cause)) return null;
    throw cause;
  }
}

export async function updateVertexAnalysis(
  rid: string,
  patch: Partial<Omit<VertexAnalysis, 'rid' | 'createdAt'>>,
): Promise<VertexAnalysis | null> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.seedObjectSetRid !== undefined) {
    body.seed_object_refs = patch.seedObjectSetRid ? [patch.seedObjectSetRid] : [];
  }
  if (patch.branchContext !== undefined) body.branch_context = encodeBranchContext(patch.branchContext);
  if (patch.layoutState !== undefined) body.layout_state_json = patch.layoutState;
  if (patch.layerConfiguration !== undefined) body.layer_configuration_json = patch.layerConfiguration;
  if (patch.organizations !== undefined) body.organizations = patch.organizations;
  if (patch.markings !== undefined) body.markings = patch.markings;
  try {
    const graph = await api.patch<WireGraph>(`/vertex/graphs/${graphIdFromRid(rid)}`, body);
    return fromWire(graph);
  } catch (cause) {
    if (isNotFound(cause)) return null;
    throw cause;
  }
}

export async function deleteVertexAnalysis(rid: string): Promise<boolean> {
  try {
    await api.delete<void>(`/vertex/graphs/${graphIdFromRid(rid)}`);
    return true;
  } catch (cause) {
    if (isNotFound(cause)) return false;
    throw cause;
  }
}

// ───── Layout draft ───────────────────────────────────────────────
// Per-user layout drafts are still session-local — they were never
// persisted server-side under the previous localStorage scheme, and
// the new backend has no dedicated endpoint for them yet. Keep them
// in localStorage so the existing autosave UX continues to work.

const LAYOUT_DRAFT_KEY = 'of.vertex.layout-drafts.v2';

interface LayoutDraftStore {
  [key: string]: Record<string, unknown>;
}

function loadLayoutDrafts(): LayoutDraftStore {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(LAYOUT_DRAFT_KEY) ?? '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as LayoutDraftStore;
    }
    return {};
  } catch {
    return {};
  }
}

function saveLayoutDrafts(drafts: LayoutDraftStore) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LAYOUT_DRAFT_KEY, JSON.stringify(drafts));
}

export function autosaveVertexLayoutDraft(
  analysisRid: string,
  userId: string,
  layout: Record<string, unknown>,
) {
  const drafts = loadLayoutDrafts();
  drafts[`${analysisRid}:${userId}`] = layout;
  saveLayoutDrafts(drafts);
}

export function getVertexLayoutDraft(analysisRid: string, userId: string): Record<string, unknown> | null {
  return loadLayoutDrafts()[`${analysisRid}:${userId}`] ?? null;
}

// ───── Versions ───────────────────────────────────────────────────

export async function saveVertexAnalysisVersion(
  analysisRid: string,
  _authorUserId: string,
  changelogMessage: string,
): Promise<VertexAnalysisVersion | null> {
  const graphId = graphIdFromRid(analysisRid);
  try {
    const version = await api.post<WireGraphVersion>(`/vertex/graphs/${graphId}/versions`, {
      changelog: changelogMessage.trim() || 'Saved analysis changes',
    });
    return fromWireVersion(version, analysisRid);
  } catch (cause) {
    if (isNotFound(cause)) return null;
    throw cause;
  }
}

export async function listVertexAnalysisVersions(analysisRid: string): Promise<VertexAnalysisVersion[]> {
  const graphId = graphIdFromRid(analysisRid);
  const page = await api.get<WirePage<WireGraphVersion>>(`/vertex/graphs/${graphId}/versions`);
  return (page.data ?? []).map((v) => fromWireVersion(v, analysisRid));
}

// ───── Forks ──────────────────────────────────────────────────────

export async function forkVertexAnalysis(
  analysisRid: string,
  _newOwnerUserId: string,
): Promise<VertexAnalysis | null> {
  const source = await getVertexAnalysis(analysisRid);
  if (!source) return null;
  try {
    const graph = await api.post<WireGraph>(`/vertex/graphs/${graphIdFromRid(analysisRid)}/fork`, {
      new_title: `${source.title} (fork)`,
    });
    return fromWire(graph);
  } catch (cause) {
    if (isNotFound(cause)) return null;
    throw cause;
  }
}

// ───── Compass linking ────────────────────────────────────────────

export function compassVertexAnalysisPath(rid: string, title?: string): string {
  const slug = (title ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const segment = encodeURIComponent(slug ? `${rid}--${slug}` : rid);
  return `/vertex/analyses/${segment}`;
}

// ───── Helpers ────────────────────────────────────────────────────

function isNotFound(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const status = (cause as { status?: unknown }).status;
  return status === 404;
}
