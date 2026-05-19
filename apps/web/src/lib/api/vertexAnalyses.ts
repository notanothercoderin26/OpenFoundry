import { resourceRIDForKind } from '@/lib/compass/resourceTypeRegistry';

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

interface VertexAnalysisStore {
  analyses: VertexAnalysis[];
  versions: VertexAnalysisVersion[];
  userLayoutDrafts: Record<string, Record<string, unknown>>;
}

const STORAGE_KEY = 'of.vertex.analysis.store.v1';

function createId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
}

function emptyStore(): VertexAnalysisStore {
  return { analyses: [], versions: [], userLayoutDrafts: {} };
}

function loadStore(): VertexAnalysisStore {
  if (typeof localStorage === 'undefined') return emptyStore();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<VertexAnalysisStore>;
    return {
      analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      userLayoutDrafts: parsed.userLayoutDrafts && typeof parsed.userLayoutDrafts === 'object' ? parsed.userLayoutDrafts : {},
    };
  } catch {
    return emptyStore();
  }
}

function saveStore(store: VertexAnalysisStore) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function createVertexAnalysis(input: Omit<VertexAnalysis, 'rid' | 'createdAt' | 'updatedAt'>): VertexAnalysis {
  const now = new Date().toISOString();
  const next: VertexAnalysis = {
    ...input,
    rid: resourceRIDForKind('vertex_analysis', createId()),
    createdAt: now,
    updatedAt: now,
  };
  const store = loadStore();
  store.analyses.unshift(next);
  saveStore(store);
  return next;
}

export function listVertexAnalyses(projectRid?: string): VertexAnalysis[] {
  return loadStore().analyses.filter((a) => !projectRid || a.owningProjectRid === projectRid);
}

export function getVertexAnalysis(rid: string): VertexAnalysis | null {
  return loadStore().analyses.find((a) => a.rid === rid) ?? null;
}

export function updateVertexAnalysis(rid: string, patch: Partial<Omit<VertexAnalysis, 'rid' | 'createdAt'>>): VertexAnalysis | null {
  const store = loadStore();
  const idx = store.analyses.findIndex((a) => a.rid === rid);
  if (idx < 0) return null;
  const next: VertexAnalysis = { ...store.analyses[idx], ...patch, updatedAt: new Date().toISOString() };
  store.analyses[idx] = next;
  saveStore(store);
  return next;
}

export function deleteVertexAnalysis(rid: string): boolean {
  const store = loadStore();
  const before = store.analyses.length;
  store.analyses = store.analyses.filter((a) => a.rid !== rid);
  store.versions = store.versions.filter((v) => v.analysisRid !== rid);
  saveStore(store);
  return store.analyses.length !== before;
}

export function autosaveVertexLayoutDraft(analysisRid: string, userId: string, layout: Record<string, unknown>) {
  const store = loadStore();
  store.userLayoutDrafts[`${analysisRid}:${userId}`] = layout;
  saveStore(store);
}

export function getVertexLayoutDraft(analysisRid: string, userId: string): Record<string, unknown> | null {
  return loadStore().userLayoutDrafts[`${analysisRid}:${userId}`] ?? null;
}

export function saveVertexAnalysisVersion(analysisRid: string, authorUserId: string, changelogMessage: string): VertexAnalysisVersion | null {
  const store = loadStore();
  const analysis = store.analyses.find((a) => a.rid === analysisRid);
  if (!analysis) return null;
  const version: VertexAnalysisVersion = {
    versionId: createId(),
    analysisRid,
    authorUserId,
    timestamp: new Date().toISOString(),
    changelogMessage: changelogMessage.trim() || 'Saved analysis changes',
    snapshot: { ...analysis },
  };
  store.versions.unshift(version);
  saveStore(store);
  return version;
}

export function listVertexAnalysisVersions(analysisRid: string): VertexAnalysisVersion[] {
  return loadStore().versions.filter((v) => v.analysisRid === analysisRid);
}

export function forkVertexAnalysis(analysisRid: string, newOwnerUserId: string): VertexAnalysis | null {
  const source = getVertexAnalysis(analysisRid);
  if (!source) return null;
  return createVertexAnalysis({
    ...source,
    ownerUserId: newOwnerUserId,
    title: `${source.title} (fork)`,
    layoutState: source.layoutState,
  });
}

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
