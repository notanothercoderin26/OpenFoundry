import api from './client';

// ────────────────────────────────────────────────────────────────
// Search Around CRUD against vertex-service. Search Arounds are
// reusable, multi-hop traversal templates parameterised by the
// starting object type.
// ────────────────────────────────────────────────────────────────

export type SearchAroundDirection = 'outgoing' | 'incoming';
export type SearchAroundFilterOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'range'
  | 'contains';
export type SearchAroundParameterType = 'string' | 'number' | 'boolean' | 'date' | 'timestamp';

export interface SearchAroundFilter {
  property: string;
  op: SearchAroundFilterOp;
  literal_json?: unknown;
  parameter_ref?: string;
}

export interface SearchAroundStep {
  ordinal: number;
  relation_id: string;
  direction: SearchAroundDirection;
  filters: SearchAroundFilter[];
}

export interface SearchAroundParameter {
  name: string;
  type: SearchAroundParameterType;
  description: string;
  default_value_json?: unknown;
  required: boolean;
}

export interface SearchAround {
  id: string;
  rid: string;
  title: string;
  description: string;
  starting_object_type_id: string;
  steps: SearchAroundStep[];
  parameters: SearchAroundParameter[];
  project_id?: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSearchAroundRequest {
  title: string;
  description: string;
  starting_object_type_id: string;
  steps: SearchAroundStep[];
  parameters: SearchAroundParameter[];
  project_id?: string | null;
}

export interface UpdateSearchAroundRequest {
  title?: string;
  description?: string;
  steps?: SearchAroundStep[];
  parameters?: SearchAroundParameter[];
}

export interface ListSearchAroundsParams {
  page?: number;
  per_page?: number;
  project_id?: string;
  starting_object_type_id?: string;
  search?: string;
}

export interface SearchAroundPage {
  data: SearchAround[];
  total: number;
  page: number;
  per_page: number;
  next_cursor?: string;
}

function buildQuery(params: ListSearchAroundsParams = {}): string {
  const sp = new URLSearchParams();
  if (params.page !== undefined) sp.set('page', String(params.page));
  if (params.per_page !== undefined) sp.set('per_page', String(params.per_page));
  if (params.project_id) sp.set('project_id', params.project_id);
  if (params.starting_object_type_id) sp.set('starting_object_type_id', params.starting_object_type_id);
  if (params.search) sp.set('search', params.search);
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export async function listSearchArounds(params: ListSearchAroundsParams = {}): Promise<SearchAroundPage> {
  const page = await api.get<SearchAroundPage>(`/vertex/search-arounds${buildQuery(params)}`);
  return {
    data: page.data ?? [],
    total: page.total ?? 0,
    page: page.page ?? 1,
    per_page: page.per_page ?? 50,
    next_cursor: page.next_cursor,
  };
}

export async function getSearchAround(id: string): Promise<SearchAround> {
  return api.get<SearchAround>(`/vertex/search-arounds/${id}`);
}

export async function createSearchAround(body: CreateSearchAroundRequest): Promise<SearchAround> {
  return api.post<SearchAround>('/vertex/search-arounds', body);
}

export async function updateSearchAround(
  id: string,
  body: UpdateSearchAroundRequest,
): Promise<SearchAround> {
  return api.patch<SearchAround>(`/vertex/search-arounds/${id}`, body);
}

export async function deleteSearchAround(id: string): Promise<void> {
  await api.delete<void>(`/vertex/search-arounds/${id}`);
}
