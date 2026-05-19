import api from './client';

// ────────────────────────────────────────────────────────────────
// Traversal primitives served by ontology-query-service (NOT
// vertex-service). These power:
//   - the right-click Search Around dropdown (link-summary)
//   - executing a saved Search Around step list (traverse)
//   - the Histogram sidebar tab (histogram)
// All requests are JWT-cookie authenticated like the rest of the
// API surface.
// ────────────────────────────────────────────────────────────────

export interface ObjectRef {
  object_type_id: string;
  object_id: string;
  display_label?: string;
  properties_json?: unknown;
}

export interface LinkSummaryEntry {
  link_type_id: string;
  target_object_type_id?: string;
  display_name?: string;
  direction: 'outgoing' | 'incoming' | string;
  count: number;
  count_is_estimate: boolean;
}

export interface LinkSummaryResponse {
  entries: LinkSummaryEntry[];
  hidden_count: number;
}

export interface TraversalFilter {
  property: string;
  op: string;
  literal_json?: unknown;
  parameter_ref?: string;
}

export interface TraversalStep {
  ordinal: number;
  relation_id: string;
  direction: 'outgoing' | 'incoming' | string;
  filters: TraversalFilter[];
}

export interface TraverseRequest {
  tenant: string;
  starting_set: ObjectRef[];
  steps: TraversalStep[];
  parameter_values_json?: Record<string, unknown>;
  branch_context?: string;
}

export interface TraverseResultGroup {
  object_type_id: string;
  items: ObjectRef[];
  total: number;
}

export interface TraverseCost {
  cpu_seconds: number;
  rows_scanned: number;
  indices_hit: string[];
  budget_exceeded: boolean;
}

export interface TraverseResponse {
  groups: TraverseResultGroup[];
  cost: TraverseCost;
}

export interface HistogramRequest {
  tenant: string;
  object_refs: ObjectRef[];
  properties: string[];
}

export interface HistogramBucket {
  value_json: unknown;
  count: number;
}

export interface NumericSummary {
  sum: number;
  avg: number;
  min: number;
  max: number;
  n: number;
}

export interface HistogramFacet {
  property: string;
  object_type_id?: string;
  buckets: HistogramBucket[];
  numeric?: NumericSummary;
  n: number;
  uniq: number;
}

export interface HistogramResponse {
  facets: HistogramFacet[];
}

export interface LinkSummaryParams {
  link_types?: string[];
}

function buildLinkTypesQuery(linkTypes?: string[]): string {
  if (!linkTypes || linkTypes.length === 0) return '';
  const sp = new URLSearchParams();
  sp.set('link_types', linkTypes.join(','));
  return `?${sp.toString()}`;
}

export async function linkSummary(
  tenant: string,
  objectId: string,
  params: LinkSummaryParams = {},
): Promise<LinkSummaryResponse> {
  const query = buildLinkTypesQuery(params.link_types);
  const response = await api.get<LinkSummaryResponse>(
    `/ontology/objects/${encodeURIComponent(tenant)}/${encodeURIComponent(objectId)}/link-summary${query}`,
  );
  return {
    entries: response.entries ?? [],
    hidden_count: response.hidden_count ?? 0,
  };
}

export async function traverse(body: TraverseRequest): Promise<TraverseResponse> {
  const response = await api.post<TraverseResponse>('/ontology/traverse', body);
  return {
    groups: response.groups ?? [],
    cost: response.cost ?? {
      cpu_seconds: 0,
      rows_scanned: 0,
      indices_hit: [],
      budget_exceeded: false,
    },
  };
}

export async function histogram(body: HistogramRequest): Promise<HistogramResponse> {
  const response = await api.post<HistogramResponse>('/ontology/histogram', body);
  return { facets: response.facets ?? [] };
}
