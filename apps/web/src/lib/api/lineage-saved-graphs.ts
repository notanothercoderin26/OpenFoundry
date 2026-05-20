// Backend-backed Save / Open graph + share-link client. Mirrors the Go
// handlers in services/lineage-service/internal/handlers/saved_graphs.go.
// The opaque `payload` field carries whatever JSON-serializable snapshot
// the LineagePage decides to persist; the backend treats it as a blob.

import api from './client';

export interface SavedLineageGraph {
  id: string;
  owner_id: string;
  name: string;
  branch: string;
  coloring_mode: string;
  payload: Record<string, unknown>;
  share_token: string | null;
  share_read_only: boolean;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedLineageGraphListResponse {
  data: SavedLineageGraph[];
}

export interface CreateSavedLineageGraphRequest {
  name: string;
  branch: string;
  coloring_mode: string;
  payload: Record<string, unknown>;
}

export interface UpdateSavedLineageGraphRequest {
  name?: string;
  branch?: string;
  coloring_mode?: string;
  payload?: Record<string, unknown>;
}

export interface ShareTokenResponse {
  token: string;
  read_only: boolean;
  shared_at: string;
}

export interface SharedLineageGraph {
  id: string;
  name: string;
  branch: string;
  coloring_mode: string;
  payload: Record<string, unknown>;
  read_only: boolean;
  shared_at: string;
  updated_at: string;
}

export function listSavedLineageGraphs() {
  return api.get<SavedLineageGraphListResponse>('/lineage/saved-graphs');
}

export function createSavedLineageGraph(body: CreateSavedLineageGraphRequest) {
  return api.post<SavedLineageGraph>('/lineage/saved-graphs', body);
}

export function getSavedLineageGraph(id: string) {
  return api.get<SavedLineageGraph>(`/lineage/saved-graphs/${encodeURIComponent(id)}`);
}

export function updateSavedLineageGraph(id: string, body: UpdateSavedLineageGraphRequest) {
  return api.put<SavedLineageGraph>(`/lineage/saved-graphs/${encodeURIComponent(id)}`, body);
}

export function deleteSavedLineageGraph(id: string) {
  return api.delete<void>(`/lineage/saved-graphs/${encodeURIComponent(id)}`);
}

export function shareSavedLineageGraph(id: string, options: { read_only?: boolean } = {}) {
  const query = new URLSearchParams();
  if (options.read_only === false) query.set('read_only', 'false');
  const qs = query.toString();
  return api.post<ShareTokenResponse>(
    `/lineage/saved-graphs/${encodeURIComponent(id)}/share${qs ? `?${qs}` : ''}`,
    null,
  );
}

export function revokeSavedLineageGraphShare(id: string) {
  return api.delete<void>(`/lineage/saved-graphs/${encodeURIComponent(id)}/share`);
}

export function getSharedLineageGraph(token: string) {
  return api.get<SharedLineageGraph>(`/lineage/shared/${encodeURIComponent(token)}`);
}
