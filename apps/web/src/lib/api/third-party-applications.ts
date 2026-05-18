import api from './client';

export type ThirdPartyClientType = 'confidential' | 'public';
export type ThirdPartyGrantType = 'authorization_code' | 'client_credentials';
export type ThirdPartyManagementSurface = 'developer_console' | 'control_panel_fallback';

export interface ThirdPartyApplicationEnablement {
  application_id: string;
  organization_id: string;
  enabled: boolean;
  project_resource_ids: string[];
  marking_ids: string[];
  organization_consent: boolean;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ThirdPartyApplication {
  id: string;
  client_id: string;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  client_type: ThirdPartyClientType;
  enabled_grant_types: ThirdPartyGrantType[];
  redirect_uris: string[];
  scopes: string[];
  owner_user_ids: string[];
  managing_organization_id: string;
  discoverable_organization_ids: string[];
  enablements: ThirdPartyApplicationEnablement[];
  service_user_id?: string | null;
  client_secret_prefix?: string | null;
  client_secret_created_at?: string | null;
  preferred_management_surface: ThirdPartyManagementSurface;
  control_panel_fallback: boolean;
  requires_pkce: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  revoked_at?: string | null;
}

export interface ThirdPartyApplicationListResponse {
  items: ThirdPartyApplication[];
  total: number;
  warning: string;
}

export interface CreateThirdPartyApplicationRequest {
  name: string;
  description?: string | null;
  logo_url?: string | null;
  client_type: ThirdPartyClientType;
  enabled_grant_types: ThirdPartyGrantType[];
  redirect_uris: string[];
  scopes: string[];
  owner_user_ids: string[];
  managing_organization_id?: string | null;
  discoverable_organization_ids: string[];
  enablement_organization_ids: string[];
  preferred_management_surface?: ThirdPartyManagementSurface;
  control_panel_fallback?: boolean;
}

export interface CreateThirdPartyApplicationResponse {
  application: ThirdPartyApplication;
  client_secret?: string;
  warning: string;
}

export interface RotateThirdPartyApplicationSecretResponse {
  application: ThirdPartyApplication;
  client_secret: string;
  warning: string;
}

export interface UpsertThirdPartyApplicationEnablementRequest {
  enabled: boolean;
  project_resource_ids?: string[];
  marking_ids?: string[];
  organization_consent?: boolean;
}

export interface ThirdPartyServiceUser {
  id: string;
  email: string;
  username?: string | null;
  name: string;
  is_active: boolean;
  organization_id?: string | null;
  auth_source: string;
  realm: string;
}

export interface ThirdPartyServiceUserRole {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

export interface ThirdPartyServiceUserGrant {
  id: string;
  application_id: string;
  service_user_id: string;
  scope_type: 'project' | 'resource';
  scope_id: string;
  role_key: string;
  granted_by?: string | null;
  created_at: string;
  revoked_at?: string | null;
}

export interface ThirdPartyServiceUserAuditEvent {
  id: string;
  application_id: string;
  service_user_id?: string | null;
  actor_id?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ThirdPartyServiceUserInspection {
  application: ThirdPartyApplication;
  service_user?: ThirdPartyServiceUser | null;
  client_credentials_enabled: boolean;
  platform_roles: ThirdPartyServiceUserRole[];
  permissions: string[];
  resource_grants: ThirdPartyServiceUserGrant[];
  audit_events: ThirdPartyServiceUserAuditEvent[];
  warning: string;
}

export interface CreateThirdPartyServiceUserGrantRequest {
  scope_type: 'project' | 'resource';
  scope_id: string;
  role_key: string;
}

export function listThirdPartyApplications() {
  return api.get<ThirdPartyApplicationListResponse>('/third-party-applications');
}

export function createThirdPartyApplication(body: CreateThirdPartyApplicationRequest) {
  return api.post<CreateThirdPartyApplicationResponse>('/third-party-applications', body);
}

export function updateThirdPartyApplication(id: string, body: Partial<CreateThirdPartyApplicationRequest>) {
  return api.patch<ThirdPartyApplication>(`/third-party-applications/${encodeURIComponent(id)}`, body);
}

export function deleteThirdPartyApplication(id: string) {
  return api.delete<void>(`/third-party-applications/${encodeURIComponent(id)}`);
}

export function rotateThirdPartyApplicationSecret(id: string) {
  return api.post<RotateThirdPartyApplicationSecretResponse>(
    `/third-party-applications/${encodeURIComponent(id)}/rotate-secret`,
    {},
  );
}

export function upsertThirdPartyApplicationEnablement(
  id: string,
  organizationId: string,
  body: UpsertThirdPartyApplicationEnablementRequest,
) {
  return api.put<ThirdPartyApplication>(
    `/third-party-applications/${encodeURIComponent(id)}/organizations/${encodeURIComponent(organizationId)}/enablement`,
    body,
  );
}

export function disableThirdPartyApplicationEnablement(id: string, organizationId: string) {
  return api.delete<ThirdPartyApplication>(
    `/third-party-applications/${encodeURIComponent(id)}/organizations/${encodeURIComponent(organizationId)}/enablement`,
  );
}

export function getThirdPartyApplicationServiceUser(id: string) {
  return api.get<ThirdPartyServiceUserInspection>(
    `/third-party-applications/${encodeURIComponent(id)}/service-user`,
  );
}

export function ensureThirdPartyApplicationServiceUser(id: string) {
  return api.post<ThirdPartyServiceUserInspection>(
    `/third-party-applications/${encodeURIComponent(id)}/service-user`,
    {},
  );
}

export function assignThirdPartyServiceUserRole(id: string, roleId: string) {
  return api.put<ThirdPartyServiceUserInspection>(
    `/third-party-applications/${encodeURIComponent(id)}/service-user/roles/${encodeURIComponent(roleId)}`,
    {},
  );
}

export function revokeThirdPartyServiceUserRole(id: string, roleId: string) {
  return api.delete<ThirdPartyServiceUserInspection>(
    `/third-party-applications/${encodeURIComponent(id)}/service-user/roles/${encodeURIComponent(roleId)}`,
  );
}

export function createThirdPartyServiceUserGrant(id: string, body: CreateThirdPartyServiceUserGrantRequest) {
  return api.post<ThirdPartyServiceUserGrant>(
    `/third-party-applications/${encodeURIComponent(id)}/service-user/grants`,
    body,
  );
}

export function revokeThirdPartyServiceUserGrant(id: string, grantId: string) {
  return api.delete<ThirdPartyServiceUserGrant>(
    `/third-party-applications/${encodeURIComponent(id)}/service-user/grants/${encodeURIComponent(grantId)}`,
  );
}
