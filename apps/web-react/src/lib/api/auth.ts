import api from './client';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  roles: string[];
  groups: string[];
  permissions: string[];
  organization_id: string | null;
  attributes: Record<string, unknown>;
  mfa_enabled: boolean;
  mfa_enforced: boolean;
  auth_source: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface PermissionRecord {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  created_at: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  permission_ids: string[];
  permissions: string[];
}

export interface GroupRecord {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
  role_ids: string[];
  roles: string[];
}

export interface PolicyRecord {
  id: string;
  name: string;
  description: string | null;
  effect: string;
  resource: string;
  action: string;
  conditions: Record<string, unknown>;
  row_filter: string | null;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RestrictedViewEvaluation {
  id: string;
  name: string;
  row_filter: string | null;
  hidden_columns: string[];
  allowed_org_ids: string[];
  allowed_markings: string[];
  consumer_mode_enabled: boolean;
  allow_guest_access: boolean;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  matched_policy_ids: string[];
  deny_policy_ids: string[];
  row_filter: string | null;
  hidden_columns: string[];
  matched_restricted_view_ids: string[];
  restricted_views: RestrictedViewEvaluation[];
  deny_reasons: string[];
  allowed_org_ids: string[];
  allowed_markings: string[];
  effective_clearance: string | null;
  consumer_mode: boolean;
}

export interface RestrictedViewRecord {
  id: string;
  name: string;
  description: string | null;
  resource: string;
  action: string;
  conditions: Record<string, unknown>;
  row_filter: string | null;
  hidden_columns: string[];
  allowed_org_ids: string[];
  allowed_markings: string[];
  consumer_mode_enabled: boolean;
  allow_guest_access: boolean;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function getMe() {
  return api.get<UserProfile>('/users/me');
}

export function refreshToken(refresh_token: string) {
  return api.post<TokenResponse>('/auth/refresh', { refresh_token });
}

export function listUsers(params?: { q?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  const qs = query.toString();
  return api.get<UserProfile[]>(`/users${qs ? `?${qs}` : ''}`);
}

export function updateUser(
  userId: string,
  data: Partial<Pick<UserProfile, 'name' | 'organization_id' | 'attributes' | 'mfa_enforced' | 'is_active'>>,
) {
  return api.patch<UserProfile>(`/users/${userId}`, data);
}

export function deactivateUser(userId: string) {
  return api.delete<void>(`/users/${userId}`);
}

export function listPermissions() {
  return api.get<PermissionRecord[]>('/permissions');
}

export function listRoles() {
  return api.get<RoleRecord[]>('/roles');
}

export function createRole(data: { name: string; description?: string | null; permission_ids: string[] }) {
  return api.post<RoleRecord>('/roles', data);
}

export function assignUserRole(userId: string, role_id: string) {
  return api.post<void>(`/users/${userId}/roles`, { role_id });
}

export function removeUserRole(userId: string, roleId: string) {
  return api.delete<void>(`/users/${userId}/roles/${roleId}`);
}

export function listGroups(params?: { q?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  const qs = query.toString();
  return api.get<GroupRecord[]>(`/groups${qs ? `?${qs}` : ''}`);
}

export function createGroup(data: { name: string; description?: string | null; role_ids: string[] }) {
  return api.post<GroupRecord>('/groups', data);
}

export function addUserToGroup(userId: string, group_id: string) {
  return api.post<void>(`/users/${userId}/groups`, { group_id });
}

export function removeUserFromGroup(userId: string, groupId: string) {
  return api.delete<void>(`/users/${userId}/groups/${groupId}`);
}

export function createPermission(data: { resource: string; action: string; description?: string | null }) {
  return api.post<PermissionRecord>('/permissions', data);
}

export function listPolicies() {
  return api.get<PolicyRecord[]>('/policies');
}

export function createPolicy(data: {
  name: string;
  description?: string | null;
  effect: string;
  resource: string;
  action: string;
  conditions: Record<string, unknown>;
  row_filter?: string | null;
  enabled: boolean;
}) {
  return api.post<PolicyRecord>('/policies', data);
}

export function deletePolicy(policyId: string) {
  return api.delete<void>(`/policies/${policyId}`);
}

export function evaluatePolicy(data: {
  resource: string;
  action: string;
  resource_attributes: Record<string, unknown>;
}) {
  return api.post<PolicyEvaluationResult>('/policies/evaluate', data);
}

export function listRestrictedViews() {
  return api.get<RestrictedViewRecord[]>('/restricted-views');
}

export function createRestrictedView(data: {
  name: string;
  description?: string | null;
  resource: string;
  action: string;
  conditions: Record<string, unknown>;
  row_filter?: string | null;
  hidden_columns?: string[];
  allowed_org_ids?: string[];
  allowed_markings?: string[];
  consumer_mode_enabled?: boolean;
  allow_guest_access?: boolean;
  enabled: boolean;
}) {
  return api.post<RestrictedViewRecord>('/restricted-views', data);
}

export function deleteRestrictedView(viewId: string) {
  return api.delete<void>(`/restricted-views/${viewId}`);
}
