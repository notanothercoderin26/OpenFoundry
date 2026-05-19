// vertex-service client for graph templates.
//
// A graph template is a reusable recipe that materialises a Vertex
// graph from a small set of user-supplied parameters. The backend
// stores the structured configuration (parameters, search-around
// bindings, layer styling, defaults) as JSONB; this client mirrors
// the Go wire shapes exactly so we can wire the React UI to it
// without an intermediate normalisation layer.

import api from './client';

export type NonObjectValueType = 'integer' | 'string' | 'boolean' | 'double';

export type SearchAroundKind = 'relation' | 'function' | 'saved';

export interface GraphTemplateObjectParameter {
  id: string;
  name: string;
  description: string;
  object_type_id: string;
  required: boolean;
  single_object: boolean;
}

export interface GraphTemplateNonObjectParameter {
  id: string;
  name: string;
  description: string;
  value_type: NonObjectValueType;
  default_value?: unknown;
  required: boolean;
}

export interface GraphTemplateSearchAround {
  id: string;
  object_parameter_id: string;
  kind: SearchAroundKind;
  config: unknown;
}

export interface GraphTemplateLayerConfig {
  layer_id: string;
  include: boolean;
  keep_styling: boolean;
}

export interface GraphTemplateGraphConfig {
  display_name: string;
  description: string;
  layout: string;
}

export interface GraphTemplateDefaults {
  pinned_items: string[];
}

export interface GraphTemplate {
  id: string;
  rid: string;
  title: string;
  description: string;
  source_graph_id: string | null;
  object_parameters: GraphTemplateObjectParameter[];
  non_object_parameters: GraphTemplateNonObjectParameter[];
  search_arounds: GraphTemplateSearchAround[];
  layer_config: GraphTemplateLayerConfig[];
  graph_config: GraphTemplateGraphConfig;
  defaults: GraphTemplateDefaults;
  owner_id: string;
  project_id: string | null;
  organizations: string[];
  markings: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateGraphTemplateRequest {
  title: string;
  description: string;
  source_graph_id?: string | null;
  object_parameters: GraphTemplateObjectParameter[];
  non_object_parameters: GraphTemplateNonObjectParameter[];
  search_arounds: GraphTemplateSearchAround[];
  layer_config: GraphTemplateLayerConfig[];
  graph_config: GraphTemplateGraphConfig;
  defaults: GraphTemplateDefaults;
  project_id?: string | null;
  organizations?: string[];
  markings?: string[];
}

export type UpdateGraphTemplateRequest = Partial<{
  title: string;
  description: string;
  object_parameters: GraphTemplateObjectParameter[];
  non_object_parameters: GraphTemplateNonObjectParameter[];
  search_arounds: GraphTemplateSearchAround[];
  layer_config: GraphTemplateLayerConfig[];
  graph_config: GraphTemplateGraphConfig;
  defaults: GraphTemplateDefaults;
  project_id: string | null;
  organizations: string[];
  markings: string[];
}>;

export interface InstantiateGraphTemplateRequest {
  title?: string;
  object_parameter_values: Record<string, string[]>;
  non_object_parameter_values: Record<string, unknown>;
}

export interface InstantiateGraphTemplateResponse {
  graph: {
    id: string;
    rid: string;
    title: string;
    seed_object_refs: string[];
    [key: string]: unknown;
  };
  object_parameter_values: Record<string, string[]>;
  non_object_parameter_values: Record<string, unknown>;
}

export interface ListGraphTemplatesResult {
  items: GraphTemplate[];
  total: number;
}

export interface ListGraphTemplatesQuery {
  q?: string;
  project_id?: string;
  page?: number;
  per_page?: number;
}

export async function listGraphTemplates(query: ListGraphTemplatesQuery = {}): Promise<ListGraphTemplatesResult> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.project_id) params.set('project_id', query.project_id);
  if (query.page) params.set('page', String(query.page));
  if (query.per_page) params.set('per_page', String(query.per_page));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return api.get<ListGraphTemplatesResult>(`/vertex/graph-templates${suffix}`);
}

export async function getGraphTemplate(id: string): Promise<GraphTemplate> {
  return api.get<GraphTemplate>(`/vertex/graph-templates/${id}`);
}

export async function createGraphTemplate(body: CreateGraphTemplateRequest): Promise<GraphTemplate> {
  return api.post<GraphTemplate>('/vertex/graph-templates', body);
}

export async function updateGraphTemplate(id: string, body: UpdateGraphTemplateRequest): Promise<GraphTemplate> {
  return api.patch<GraphTemplate>(`/vertex/graph-templates/${id}`, body);
}

export async function deleteGraphTemplate(id: string): Promise<void> {
  await api.delete<void>(`/vertex/graph-templates/${id}`);
}

export async function instantiateGraphTemplate(
  id: string,
  body: InstantiateGraphTemplateRequest,
): Promise<InstantiateGraphTemplateResponse> {
  return api.post<InstantiateGraphTemplateResponse>(`/vertex/graph-templates/${id}/instantiate`, body);
}

// Default values for a freshly opened TemplateBuilder. Helps the
// component avoid the "null vs undefined" cliff for all the typed
// sub-structures.
export function emptyGraphTemplateBuilderState(sourceGraphId: string | null = null): CreateGraphTemplateRequest {
  return {
    title: '',
    description: '',
    source_graph_id: sourceGraphId,
    object_parameters: [],
    non_object_parameters: [],
    search_arounds: [],
    layer_config: [],
    graph_config: { display_name: '', description: '', layout: 'auto' },
    defaults: { pinned_items: [] },
  };
}

// Helper to generate a stable local id for parameters / search-arounds
// that haven't yet been persisted. We use crypto.randomUUID if
// available (modern browsers) and fall back to a short timestamp for
// JSDOM-style test environments.
export function localId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
