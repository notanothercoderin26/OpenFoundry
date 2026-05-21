// Workspace API client: thin wrapper over the Phase 1 backend surface
// exposed by `tenancy-organizations-service` under `/api/v1/workspace/*`.
// Used by the new project navigation/detail pages and components.

import api from './client';

export type ResourceKind =
  | 'ontology_project'
  | 'ontology_folder'
  | 'ontology_resource_binding'
  | 'dataset'
  | 'pipeline'
  | 'query'
  | 'notebook'
  | 'app'
  | 'dashboard'
  | 'report'
  | 'model'
  | 'workflow'
  | 'other';

export type AccessLevel = 'viewer' | 'editor' | 'owner';

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export interface UserFavorite {
  user_id: string;
  resource_kind: ResourceKind;
  resource_id: string;
  group_id: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface FavoriteGroup {
  id: string;
  user_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ListFavoritesEnvelope {
  data: UserFavorite[];
  groups: FavoriteGroup[];
}

export function listFavorites(params?: { kind?: ResourceKind; limit?: number }) {
  return listFavoritesWithGroups(params).then((response) => response.data);
}

export function listFavoritesWithGroups(params?: { kind?: ResourceKind; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.kind) qs.set('kind', params.kind);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api
    .get<ListFavoritesEnvelope>(
      `/workspace/favorites${query ? `?${query}` : ''}`,
    );
}

export function createFavorite(body: {
  resource_kind: ResourceKind;
  resource_id: string;
  group_id?: string | null;
  display_order?: number;
}) {
  return api.post<UserFavorite>('/workspace/favorites', body);
}

export function deleteFavorite(kind: ResourceKind, id: string) {
  return api.delete(`/workspace/favorites/${kind}/${id}`);
}

export function listFavoriteGroups() {
  return api
    .get<{ data: FavoriteGroup[] }>('/workspace/favorites/groups')
    .then((response) => response.data);
}

export function createFavoriteGroup(body: { name: string; display_order?: number }) {
  return api.post<FavoriteGroup>('/workspace/favorites/groups', body);
}

export function updateFavoriteOrder(items: Array<{
  resource_kind: ResourceKind;
  resource_id: string;
  group_id?: string | null;
  display_order: number;
}>) {
  return api.put<void>('/workspace/favorites/order', { items });
}

export function updateFavoriteGroupsOrder(groups: Array<{ id: string; display_order: number }>) {
  return api.put<void>('/workspace/favorites/groups/order', { groups });
}

// ---------------------------------------------------------------------------
// Recents
// ---------------------------------------------------------------------------

export interface RecentEntry {
  resource_kind: ResourceKind;
  resource_id: string;
  last_accessed_at: string;
}

export function recordAccess(body: { resource_kind: ResourceKind; resource_id: string }) {
  return api.post<{ ok: true }>('/workspace/recents', body);
}

export function listRecents(params?: { kind?: ResourceKind; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.kind) qs.set('kind', params.kind);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api
    .get<{ data: RecentEntry[] }>(
      `/workspace/recents${query ? `?${query}` : ''}`,
    )
    .then((response) => response.data);
}

// ---------------------------------------------------------------------------
// Resource references
// ---------------------------------------------------------------------------

export interface ResourceReferenceNode {
  resource_kind: ResourceKind | string;
  resource_id: string;
  resource_rid: string;
  display_name: string;
  description?: string | null;
  project_id?: string | null;
  project_rid?: string | null;
}

export interface ResourceReferenceEdge {
  source: ResourceReferenceNode;
  target: ResourceReferenceNode;
  relationship: string;
  created_at: string;
  updated_at: string;
  derived: boolean;
}

export interface ResourceReferenceGraph {
  resource_kind: ResourceKind | string;
  resource_id: string;
  resource_rid: string;
  depends_on: ResourceReferenceEdge[];
  used_by: ResourceReferenceEdge[];
}

export interface ReplaceResourceReferencesBody {
  depends_on: Array<{
    resource_kind: ResourceKind | string;
    resource_id: string;
    relationship?: string;
  }>;
}

export function listResourceReferences(kind: ResourceKind | string, id: string) {
  return api.get<ResourceReferenceGraph>(`/workspace/resources/${kind}/${id}/references`);
}

export function replaceResourceReferences(
  kind: ResourceKind | string,
  id: string,
  body: ReplaceResourceReferencesBody,
) {
  return api.put<ResourceReferenceGraph>(`/workspace/resources/${kind}/${id}/references`, body);
}

// ---------------------------------------------------------------------------
// Compass search
// ---------------------------------------------------------------------------

export interface CompassSearchResult {
  rid: string;
  type: string;
  display_name: string;
  owning_project_id?: string | null;
  owning_project_rid?: string | null;
  organization_rids: string[];
  marking_rids: string[];
  last_modified_at: string;
  owner_id?: string | null;
  tags: string[];
  summary: string;
  long_text_sources?: Array<{ kind: string; label?: string }>;
  open_url: string;
  is_deleted: boolean;
  score?: number;
  snippet?: string;
}

export interface CompassFacetValue {
  key: string;
  label: string;
  count: number;
}

export interface CompassSearchFacets {
  types?: CompassFacetValue[] | null;
  projects?: CompassFacetValue[] | null;
  owners?: CompassFacetValue[] | null;
  markings?: CompassFacetValue[] | null;
  modified?: CompassFacetValue[] | null;
}

export interface CompassSearchResponse {
  data: CompassSearchResult[];
  next_cursor?: string | null;
  limit: number;
  facets?: CompassSearchFacets | null;
}

export interface CompassSearchParams {
  q?: string;
  type?: string;
  project?: string;
  owner?: string;
  marking?: string[];
  modified?: string;
  limit?: number;
  cursor?: string;
}

export function searchCompass(params: CompassSearchParams) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.type) qs.set('type', params.type);
  if (params.project) qs.set('project', params.project);
  if (params.owner) qs.set('owner', params.owner);
  if (params.modified) qs.set('modified', params.modified);
  for (const marking of params.marking ?? []) {
    if (marking.trim()) qs.append('marking', marking.trim());
  }
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  const query = qs.toString();
  return api.get<CompassSearchResponse>(`/compass/search${query ? `?${query}` : ''}`);
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  query: string;
  tab: 'top' | 'apps' | 'objects' | 'datasets' | 'files' | string;
  type?: string | null;
  project_id?: string | null;
  project_rid?: string | null;
  owner_id?: string | null;
  marking_rids: string[];
  modified_bucket?: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function listSavedSearches(params?: { limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api
    .get<{ data: SavedSearch[] }>(
      `/workspace/saved-searches${query ? `?${query}` : ''}`,
    )
    .then((response) => response.data);
}

export function createSavedSearch(body: {
  name: string;
  query: string;
  tab?: string;
  type?: string | null;
  project?: string | null;
  owner_id?: string | null;
  marking_rids?: string[];
  modified_bucket?: string | null;
  display_order?: number;
}) {
  return api.post<SavedSearch>('/workspace/saved-searches', body);
}

export function deleteSavedSearch(id: string) {
  return api.delete(`/workspace/saved-searches/${id}`);
}

export interface ProjectFollow {
  user_id: string;
  project_id: string;
  project_rid?: string | null;
  created_at: string;
}

export function listProjectFollows(params?: { limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api
    .get<{ data: ProjectFollow[] }>(
      `/workspace/project-follows${query ? `?${query}` : ''}`,
    )
    .then((response) => response.data);
}

export function followProject(body: { project_id?: string; project_rid?: string }) {
  return api.post<ProjectFollow>('/workspace/project-follows', body);
}

export function unfollowProject(project: string) {
  return api.delete(`/workspace/project-follows/${encodeURIComponent(project)}`);
}

export interface ResourceRecommendation extends CompassSearchResult {
  reason: string;
  signals: string[];
  collaborator_count: number;
  last_activity_at?: string | null;
}

export function listRecommendations(params?: { limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api
    .get<{ data: ResourceRecommendation[] }>(
      `/workspace/recommendations${query ? `?${query}` : ''}`,
    )
    .then((response) => response.data);
}

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

export interface TrashEntry {
  resource_kind: ResourceKind;
  resource_id: string;
  project_id: string | null;
  display_name: string;
  deleted_at: string;
  deleted_by: string | null;
  retention_days: number;
  purge_after: string | null;
  original_project_id: string | null;
  original_parent_folder_id: string | null;
  restore_target_status: 'original_path' | 'project_root' | string;
}

export interface RestoreResourceResponse {
  restored: boolean;
  restored_to_original_path: boolean;
  restored_to_project_id?: string | null;
  restored_to_folder_id?: string | null;
  banner?: string | null;
}

export function listTrash(params?: { kind?: ResourceKind; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.kind) qs.set('kind', params.kind);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api
    .get<{ data: TrashEntry[] }>(
      `/workspace/trash${query ? `?${query}` : ''}`,
    )
    .then((response) => response.data);
}

export function restoreResource(kind: ResourceKind, id: string) {
  return api.post<RestoreResourceResponse>(`/workspace/resources/${kind}/${id}/restore`, {});
}

export function purgeResource(kind: ResourceKind, id: string) {
  return api.delete(`/workspace/resources/${kind}/${id}/purge`);
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export interface ResourceShare {
  id: string;
  resource_kind: ResourceKind;
  resource_id: string;
  shared_with_user_id: string | null;
  shared_with_group_id: string | null;
  sharer_id: string;
  access_level: AccessLevel;
  note: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateShareBody {
  shared_with_user_id?: string;
  shared_with_group_id?: string;
  access_level: AccessLevel;
  note?: string;
  expires_at?: string | null;
}

export function createShare(kind: ResourceKind, id: string, body: CreateShareBody) {
  return api.post<ResourceShare>(`/workspace/resources/${kind}/${id}/share`, body);
}

export function listResourceShares(kind: ResourceKind, id: string) {
  return api
    .get<{ data: ResourceShare[] }>(`/workspace/resources/${kind}/${id}/shares`)
    .then((response) => response.data);
}

export function revokeShare(shareId: string) {
  return api.delete(`/workspace/shares/${shareId}`);
}

export function listSharedWithMe(params?: { kind?: ResourceKind; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.kind) qs.set('kind', params.kind);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api
    .get<{ data: ResourceShare[] }>(
      `/workspace/shared-with-me${query ? `?${query}` : ''}`,
    )
    .then((response) => response.data);
}

export function listSharedByMe(params?: { kind?: ResourceKind; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.kind) qs.set('kind', params.kind);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return api
    .get<{ data: ResourceShare[] }>(
      `/workspace/shared-by-me${query ? `?${query}` : ''}`,
    )
    .then((response) => response.data);
}

// ---------------------------------------------------------------------------
// Resource operations (move / rename / duplicate / soft-delete / batch)
// ---------------------------------------------------------------------------

export interface MoveBody {
  target_folder_id?: string | null;
  target_folder_rid?: string | null;
  target_project_id?: string | null;
  target_project_rid?: string | null;
  confirm_access_policy_change?: boolean;
  confirm_marking_change?: boolean;
}

export function moveResource(kind: ResourceKind, id: string, body: MoveBody) {
  return api.post<{ ok: true }>(`/workspace/resources/${kind}/${id}/move`, body);
}

export function renameResource(kind: ResourceKind, id: string, body: { name: string }) {
  return api.post<{ ok: true }>(`/workspace/resources/${kind}/${id}/rename`, body);
}

export function duplicateResource(
  kind: ResourceKind,
  id: string,
  body?: { target_folder_id?: string | null; suffix?: string },
) {
  return api.post<{ id: string }>(
    `/workspace/resources/${kind}/${id}/duplicate`,
    body ?? {},
  );
}

export function softDeleteResource(kind: ResourceKind, id: string, params?: { retention_days?: number }) {
  const qs = new URLSearchParams();
  if (params?.retention_days) qs.set('retention_days', String(params.retention_days));
  const query = qs.toString();
  return api.delete(`/workspace/resources/${kind}/${id}${query ? `?${query}` : ''}`);
}

export interface BatchAction {
  op: 'move' | 'delete' | 'trash' | 'share';
  resource_kind: ResourceKind;
  resource_id: string;
  target_folder_id?: string | null;
  target_project_id?: string | null;
  target_folder_rid?: string | null;
  target_project_rid?: string | null;
  confirm_access_policy_change?: boolean;
  confirm_marking_change?: boolean;
  retention_days?: number;
  shared_with_user_id?: string | null;
  shared_with_group_id?: string | null;
  access_level?: AccessLevel;
  note?: string | null;
  expires_at?: string | null;
}

export interface BatchResultEntry {
  op?: string;
  resource_kind: ResourceKind;
  resource_id: string;
  ok: boolean;
  error: string | null;
  share_id?: string;
  share_change_type?: 'granted' | 'updated';
}

export interface BatchResponse {
  batch_id?: string;
  preflight_failed?: boolean;
  results: BatchResultEntry[];
}

export function batchApply(actions: BatchAction[]) {
  return api.post<BatchResponse>('/workspace/resources/batch', { actions });
}

// ---------------------------------------------------------------------------
// Cross-resource label resolver (POST /workspace/resources/resolve).
// Returns canonical labels for ontology projects/folders today; other
// kinds fall back to `resolved: false` and the caller keeps its
// placeholder. The frontend `resource-labels.ts` cache batches calls.
// ---------------------------------------------------------------------------

export interface ResolvedLabel {
  resource_kind: ResourceKind;
  resource_id: string;
  resolved: boolean;
  label: string | null;
  description: string | null;
}

export function resolveResourceLabels(
  items: Array<{ resource_kind: ResourceKind; resource_id: string }>,
) {
  return api.post<{ data: ResolvedLabel[] }>('/workspace/resources/resolve', { items });
}

// ---------------------------------------------------------------------------
// Compass tags
// ---------------------------------------------------------------------------

export interface CompassTag {
  id: string;
  name: string;
  color: string;
  created_by: string;
  created_at: string;
}

export interface ResourceTagsEntry {
  resource_kind: string;
  resource_id: string;
  tags: CompassTag[];
}

export function listCompassTags() {
  return api.get<{ data: CompassTag[] }>('/workspace/tags');
}

export function createCompassTag(body: { name: string; color?: string }) {
  return api.post<CompassTag>('/workspace/tags', body);
}

export function deleteCompassTag(id: string) {
  return api.delete(`/workspace/tags/${id}`);
}

export function listResourceTags(kind: ResourceKind, id: string) {
  return api.get<{ data: CompassTag[] }>(`/workspace/resources/${kind}/${id}/tags`);
}

export function tagResource(kind: ResourceKind, id: string, tagId: string) {
  return api.post(`/workspace/resources/${kind}/${id}/tags`, { tag_id: tagId });
}

export function untagResource(kind: ResourceKind, id: string, tagId: string) {
  return api.delete(`/workspace/resources/${kind}/${id}/tags/${tagId}`);
}

export function bulkListResourceTags(
  resources: Array<{ resource_kind: ResourceKind; resource_id: string }>,
) {
  return api.post<{ data: ResourceTagsEntry[] }>('/workspace/tags:bulk', {
    resources,
  });
}
