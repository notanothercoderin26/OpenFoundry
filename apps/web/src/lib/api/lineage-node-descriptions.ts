// Persistent node-level descriptions for the Data Lineage Properties
// helper. Mirrors services/lineage-service/internal/handlers/descriptions.go.
//
// The endpoints are CRUD-shaped: Upsert returns 204 when the body is
// empty (Foundry's "clear description" UX).

import api from './client';

export interface NodeDescription {
  node_id: string;
  description: string;
  updated_by: string;
  updated_at: string;
}

export interface UpsertNodeDescriptionRequest {
  description: string;
}

export function getNodeDescription(nodeId: string) {
  return api.get<NodeDescription>(`/lineage/nodes/${encodeURIComponent(nodeId)}/description`);
}

export function upsertNodeDescription(nodeId: string, body: UpsertNodeDescriptionRequest) {
  // Backend returns 204 (no body) when the trimmed payload is empty,
  // or 200 with the upserted row otherwise. The client returns the
  // raw fetch type so callers can branch on undefined.
  return api.put<NodeDescription | undefined>(
    `/lineage/nodes/${encodeURIComponent(nodeId)}/description`,
    body,
  );
}

export function deleteNodeDescription(nodeId: string) {
  return api.delete<void>(`/lineage/nodes/${encodeURIComponent(nodeId)}/description`);
}
