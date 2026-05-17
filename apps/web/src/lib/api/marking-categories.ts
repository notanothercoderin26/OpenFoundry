// SG.11: marking category administration. The gateway routes these
// /api/v1 paths to authorization-policy-service.

import api from './client';

export type MarkingCategoryVisibility = 'visible' | 'hidden';
export type MarkingCategoryPrincipalKind = 'user' | 'group';
export type MarkingCategoryPermissionName = 'administrator' | 'viewer';
export type MarkingPermissionName = 'administrator' | 'remover' | 'applier' | 'member';

export interface MarkingCategoryPrincipal {
  principal_kind: MarkingCategoryPrincipalKind;
  principal_id: string;
}

export interface MarkingCategoryPermission {
  category_id: string;
  principal_kind: MarkingCategoryPrincipalKind;
  principal_id: string;
  permission: MarkingCategoryPermissionName;
  granted_by: string;
  created_at: string;
}

export interface MarkingCategory {
  id: string;
  tenant_id?: string | null;
  slug: string;
  display_name: string;
  description: string;
  visibility: MarkingCategoryVisibility;
  organization_id?: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MarkingCategoryResponse extends MarkingCategory {
  permissions: MarkingCategoryPermission[];
}

export interface MarkingCategoryAuditEvent {
  id: string;
  tenant_id?: string | null;
  category_id?: string | null;
  actor_id: string;
  action: string;
  principal_kind?: MarkingCategoryPrincipalKind | null;
  principal_id?: string | null;
  permission?: MarkingCategoryPermissionName | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MarkingPrincipal {
  principal_kind: MarkingCategoryPrincipalKind;
  principal_id: string;
}

export interface MarkingPermission {
  marking_id: string;
  principal_kind: MarkingCategoryPrincipalKind;
  principal_id: string;
  permission: MarkingPermissionName;
  granted_by: string;
  created_at: string;
}

export interface Marking {
  id: string;
  tenant_id?: string | null;
  category_id: string;
  slug: string;
  display_name: string;
  description: string;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MarkingResponse extends Marking {
  permissions: MarkingPermission[];
  metadata_redacted?: boolean;
}

export interface MarkingAuditEvent {
  id: string;
  tenant_id?: string | null;
  category_id?: string | null;
  marking_id?: string | null;
  actor_id: string;
  action: string;
  principal_kind?: MarkingCategoryPrincipalKind | null;
  principal_id?: string | null;
  permission?: MarkingPermissionName | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MarkingPermissionCheckRequest {
  principal_id?: string;
  group_ids?: string[];
  resource_update_markings_allowed?: boolean;
  expand_access_allowed?: boolean;
}

export interface MarkingPermissionCheckResponse {
  marking_id: string;
  principal_id: string;
  can_manage: boolean;
  can_apply: boolean;
  can_remove: boolean;
  is_member: boolean;
  can_access_marked_data: boolean;
  resource_update_markings_allowed: boolean;
  expand_access_allowed: boolean;
  can_apply_to_resource: boolean;
  can_remove_from_resource: boolean;
  reasons: string[];
}

export interface ResourceMarking {
  id: string;
  tenant_id?: string | null;
  resource_kind: string;
  resource_id: string;
  marking_id: string;
  source_kind: 'direct';
  metadata: Record<string, unknown>;
  applied_by: string;
  applied_at: string;
}

export interface ResourceMarkingMutationResponse {
  allowed: boolean;
  resource_marking?: ResourceMarking;
  permission_check: MarkingPermissionCheckResponse;
}

export interface CreateMarkingCategoryBody {
  slug: string;
  display_name: string;
  description?: string;
  visibility?: MarkingCategoryVisibility;
  organization_id?: string;
  metadata?: Record<string, unknown>;
  administrators?: MarkingCategoryPrincipal[];
  viewers?: MarkingCategoryPrincipal[];
}

export interface CreateMarkingBody {
  id?: string;
  slug: string;
  display_name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  administrators?: MarkingPrincipal[];
  removers?: MarkingPrincipal[];
  appliers?: MarkingPrincipal[];
  members?: MarkingPrincipal[];
}

export interface UpdateMarkingBody {
  display_name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateMarkingCategoryBody {
  display_name?: string;
  description?: string;
  visibility?: MarkingCategoryVisibility;
  organization_id?: string;
  metadata?: Record<string, unknown>;
}

export function listMarkingCategories(includeHidden = true): Promise<{ items: MarkingCategoryResponse[] }> {
  const qs = includeHidden ? '?include_hidden=true' : '';
  return api.get<{ items: MarkingCategoryResponse[] }>(`/marking-categories${qs}`);
}

export function createMarkingCategory(body: CreateMarkingCategoryBody): Promise<MarkingCategoryResponse> {
  return api.post<MarkingCategoryResponse>('/marking-categories', body);
}

export function updateMarkingCategory(id: string, body: UpdateMarkingCategoryBody): Promise<MarkingCategoryResponse> {
  return api.patch<MarkingCategoryResponse>(`/marking-categories/${id}`, body);
}

export function blockDeleteMarkingCategory(id: string): Promise<void> {
  return api.delete<void>(`/marking-categories/${id}`);
}

export function upsertMarkingCategoryPermission(
  categoryID: string,
  body: {
    principal_kind: MarkingCategoryPrincipalKind;
    principal_id: string;
    permission: MarkingCategoryPermissionName;
  },
): Promise<MarkingCategoryPermission> {
  return api.put<MarkingCategoryPermission>(`/marking-categories/${categoryID}/permissions`, body);
}

export function deleteMarkingCategoryPermission(
  categoryID: string,
  principalKind: MarkingCategoryPrincipalKind,
  principalID: string,
  permission: MarkingCategoryPermissionName,
): Promise<void> {
  return api.delete<void>(
    `/marking-categories/${categoryID}/permissions/${principalKind}/${principalID}/${permission}`,
  );
}

export function listMarkingCategoryAuditEvents(
  categoryID: string,
): Promise<{ items: MarkingCategoryAuditEvent[] }> {
  return api.get<{ items: MarkingCategoryAuditEvent[] }>(
    `/marking-categories/${categoryID}/audit-events`,
  );
}

export function listMarkingsForCategory(
  categoryID: string,
  includeHidden = true,
): Promise<{ items: MarkingResponse[] }> {
  const qs = includeHidden ? '?include_hidden=true' : '';
  return api.get<{ items: MarkingResponse[] }>(
    `/marking-categories/${categoryID}/markings${qs}`,
  );
}

export function createMarking(categoryID: string, body: CreateMarkingBody): Promise<MarkingResponse> {
  return api.post<MarkingResponse>(`/marking-categories/${categoryID}/markings`, body);
}

export function updateMarking(id: string, body: UpdateMarkingBody): Promise<MarkingResponse> {
  return api.patch<MarkingResponse>(`/markings/${id}`, body);
}

export function blockDeleteMarking(id: string): Promise<void> {
  return api.delete<void>(`/markings/${id}`);
}

export function blockMoveMarkingCategory(id: string, targetCategoryID: string): Promise<void> {
  return api.put<void>(`/markings/${id}/category`, { target_category_id: targetCategoryID });
}

export function upsertMarkingPermission(
  markingID: string,
  body: {
    principal_kind: MarkingCategoryPrincipalKind;
    principal_id: string;
    permission: MarkingPermissionName;
  },
): Promise<MarkingPermission> {
  return api.put<MarkingPermission>(`/markings/${markingID}/permissions`, body);
}

export function deleteMarkingPermission(
  markingID: string,
  principalKind: MarkingCategoryPrincipalKind,
  principalID: string,
  permission: MarkingPermissionName,
): Promise<void> {
  return api.delete<void>(
    `/markings/${markingID}/permissions/${principalKind}/${principalID}/${permission}`,
  );
}

export function listMarkingAuditEvents(
  markingID: string,
): Promise<{ items: MarkingAuditEvent[] }> {
  return api.get<{ items: MarkingAuditEvent[] }>(
    `/markings/${markingID}/audit-events`,
  );
}

export function checkMarkingPermission(
  markingID: string,
  body: MarkingPermissionCheckRequest,
): Promise<MarkingPermissionCheckResponse> {
  return api.post<MarkingPermissionCheckResponse>(
    `/markings/${markingID}/permission-check`,
    body,
  );
}

export function listResourceMarkings(
  resourceKind: string,
  resourceID: string,
): Promise<{ items: ResourceMarking[] }> {
  const qs = new URLSearchParams({ resource_kind: resourceKind, resource_id: resourceID });
  return api.get<{ items: ResourceMarking[] }>(`/resource-markings?${qs.toString()}`);
}

export function applyResourceMarking(body: {
  resource_kind: string;
  resource_id: string;
  marking_id: string;
  resource_update_markings_allowed: boolean;
  metadata?: Record<string, unknown>;
}): Promise<ResourceMarkingMutationResponse> {
  return api.post<ResourceMarkingMutationResponse>('/resource-markings', body);
}

export function removeResourceMarking(body: {
  resource_kind: string;
  resource_id: string;
  marking_id: string;
  resource_update_markings_allowed: boolean;
  expand_access_allowed?: boolean;
  reason?: string;
}): Promise<ResourceMarkingMutationResponse> {
  return api.post<ResourceMarkingMutationResponse>('/resource-markings/remove', body);
}
