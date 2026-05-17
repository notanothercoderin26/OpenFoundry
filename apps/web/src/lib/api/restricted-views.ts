import api from './client';

export interface RestrictedViewTransaction {
  id: string;
  kind: string;
  status: string;
  branch_name?: string;
  actor_id?: string;
  reason?: string;
  backing_dataset_rid?: string;
  restricted_view_id?: string;
  started_at?: string;
  completed_at?: string;
  [key: string]: unknown;
}

export interface RestrictedViewRecord {
  id: string;
  name: string;
  description: string | null;
  backing_dataset_rid: string;
  backing_dataset_branch: string | null;
  project_rid: string | null;
  folder_rid: string | null;
  path: string | null;
  owner_ids: string[];
  resource: string;
  action: string;
  conditions: Record<string, unknown>;
  policy: Record<string, unknown>;
  row_filter: string | null;
  hidden_columns: string[];
  marking_columns: string[];
  allowed_org_ids: string[];
  allowed_markings: string[];
  assumed_markings: string[];
  transactions: RestrictedViewTransaction[];
  output_metadata: Record<string, unknown>;
  view_metadata: Record<string, unknown>;
  transform_input_blocked: boolean;
  last_built_at: string | null;
  build_status: string;
  consumer_mode_enabled: boolean;
  allow_guest_access: boolean;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RestrictedViewWriteRequest {
  name?: string;
  description?: string | null;
  backing_dataset_rid?: string;
  backing_dataset_branch?: string | null;
  project_rid?: string | null;
  folder_rid?: string | null;
  path?: string | null;
  owner_ids?: string[];
  resource?: string;
  action?: string;
  conditions?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  row_filter?: string | null;
  hidden_columns?: string[];
  marking_columns?: string[];
  allowed_org_ids?: string[];
  allowed_markings?: string[];
  assumed_markings?: string[];
  output_metadata?: Record<string, unknown>;
  view_metadata?: Record<string, unknown>;
  transform_input_blocked?: boolean;
  consumer_mode_enabled?: boolean;
  allow_guest_access?: boolean;
  enabled?: boolean;
}

export interface RestrictedViewBuildRequest {
  branch_name?: string;
  reason?: string;
  output_metadata?: Record<string, unknown>;
}

export interface RestrictedViewTransformInputCheck {
  allowed: boolean;
  restricted_view_id: string;
  transform_input_blocked: boolean;
  reason: string;
}

export function listRestrictedViews(): Promise<RestrictedViewRecord[]> {
  return api.get<RestrictedViewRecord[]>('/restricted-views');
}

export function getRestrictedView(id: string): Promise<RestrictedViewRecord> {
  return api.get<RestrictedViewRecord>(`/restricted-views/${id}`);
}

export function createRestrictedView(body: RestrictedViewWriteRequest & {
  name: string;
  backing_dataset_rid: string;
  enabled: boolean;
}): Promise<RestrictedViewRecord> {
  return api.post<RestrictedViewRecord>('/restricted-views', body);
}

export function updateRestrictedView(id: string, body: RestrictedViewWriteRequest): Promise<RestrictedViewRecord> {
  return api.patch<RestrictedViewRecord>(`/restricted-views/${id}`, body);
}

export function deleteRestrictedView(id: string): Promise<void> {
  return api.delete<void>(`/restricted-views/${id}`);
}

export function buildRestrictedView(id: string, body: RestrictedViewBuildRequest): Promise<RestrictedViewRecord> {
  return api.post<RestrictedViewRecord>(`/restricted-views/${id}/build`, body);
}

export function listRestrictedViewTransactions(id: string): Promise<{ items: RestrictedViewTransaction[] }> {
  return api.get<{ items: RestrictedViewTransaction[] }>(`/restricted-views/${id}/transactions`);
}

export function checkRestrictedViewTransformInput(id: string): Promise<RestrictedViewTransformInputCheck> {
  return api.post<RestrictedViewTransformInputCheck>(`/restricted-views/${id}/transform-input:check`, {});
}
