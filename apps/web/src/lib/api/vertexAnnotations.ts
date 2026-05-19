import api from './client';

// ────────────────────────────────────────────────────────────────
// Annotation CRUD for vertex graphs (callouts, regions, etc.). All
// routes are nested under /vertex/graphs/{graphId}/annotations.
// ────────────────────────────────────────────────────────────────

export type AnnotationKind =
  | 'callout'
  | 'region'
  | 'note'
  | 'arrow'
  | string;

export interface VertexAnnotation {
  id: string;
  graph_id: string;
  kind: AnnotationKind;
  text: string;
  geometry_json: unknown;
  author_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnotationRequest {
  kind: AnnotationKind;
  text: string;
  geometry_json: unknown;
}

export interface UpdateAnnotationRequest {
  text?: string;
  geometry_json?: unknown;
}

interface AnnotationListResponse {
  items: VertexAnnotation[] | null;
}

function graphIdFromRid(ridOrId: string): string {
  const prefix = 'ri.vertex.main.graph.';
  if (ridOrId.startsWith(prefix)) return ridOrId.slice(prefix.length);
  return ridOrId;
}

export async function listAnnotations(graphRidOrId: string): Promise<VertexAnnotation[]> {
  const graphId = graphIdFromRid(graphRidOrId);
  const response = await api.get<AnnotationListResponse>(`/vertex/graphs/${graphId}/annotations`);
  return response.items ?? [];
}

export async function createAnnotation(
  graphRidOrId: string,
  body: CreateAnnotationRequest,
): Promise<VertexAnnotation> {
  const graphId = graphIdFromRid(graphRidOrId);
  return api.post<VertexAnnotation>(`/vertex/graphs/${graphId}/annotations`, body);
}

export async function updateAnnotation(
  graphRidOrId: string,
  annotationId: string,
  body: UpdateAnnotationRequest,
): Promise<VertexAnnotation> {
  const graphId = graphIdFromRid(graphRidOrId);
  return api.patch<VertexAnnotation>(
    `/vertex/graphs/${graphId}/annotations/${annotationId}`,
    body,
  );
}

export async function deleteAnnotation(graphRidOrId: string, annotationId: string): Promise<void> {
  const graphId = graphIdFromRid(graphRidOrId);
  await api.delete<void>(`/vertex/graphs/${graphId}/annotations/${annotationId}`);
}
