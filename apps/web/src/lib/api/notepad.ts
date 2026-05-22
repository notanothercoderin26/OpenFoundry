import api from './client';

export type ProseMirrorDoc = { type: string; content?: unknown[]; [key: string]: unknown };

export interface NotepadDocument {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  content: string;
  content_doc: ProseMirrorDoc | Record<string, never> | null;
  template_key: string | null;
  widgets: Array<Record<string, unknown>>;
  is_favorite: boolean;
  last_indexed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NotepadListSort = 'recent' | 'created_by_me' | 'favorite' | 'all';

export type NotepadExportSource = Partial<
  Pick<NotepadDocument, 'id' | 'title' | 'description' | 'content' | 'content_doc' | 'widgets' | 'template_key'>
>;

export interface NotepadPresence {
  id: string;
  document_id: string;
  user_id: string;
  session_id: string;
  display_name: string;
  cursor_label: string;
  color: string;
  last_seen_at: string;
}

export interface NotepadExportPayload {
  file_name: string;
  mime_type: string;
  title: string;
  html: string;
  preview_excerpt: string;
}

export type NotepadExportFormat = 'html' | 'pdf' | 'docx';

export interface NotepadExportRequest extends NotepadExportSource {
  format?: NotepadExportFormat;
  html_body?: string;
}

export interface NotepadBinaryExport {
  blob: Blob;
  file_name: string;
  mime_type: string;
}

export function listNotepadDocuments(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  sort?: NotepadListSort;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  if (params?.search) query.set('search', params.search);
  if (params?.sort) query.set('sort', params.sort);
  const qs = query.toString();

  return api.get<{ data: NotepadDocument[]; total: number; page: number; per_page: number }>(
    `/notepad/documents${qs ? `?${qs}` : ''}`,
  );
}

export function createNotepadDocument(body: {
  title: string;
  description?: string;
  content?: string;
  content_doc?: ProseMirrorDoc;
  template_key?: string;
  widgets?: Array<Record<string, unknown>>;
}) {
  return api.post<NotepadDocument>('/notepad/documents', body);
}

export function getNotepadDocument(id: string) {
  return api.get<NotepadDocument>(`/notepad/documents/${id}`);
}

export function updateNotepadDocument(
  id: string,
  body: Partial<{
    title: string;
    description: string;
    content: string;
    content_doc: ProseMirrorDoc;
    template_key: string;
    widgets: Array<Record<string, unknown>>;
    last_indexed_at: string | null;
  }>,
) {
  return api.patch<NotepadDocument>(`/notepad/documents/${id}`, body);
}

export function deleteNotepadDocument(id: string) {
  return api.delete(`/notepad/documents/${id}`);
}

export function listNotepadPresence(id: string) {
  return api.get<{ data: NotepadPresence[] }>(`/notepad/documents/${id}/presence`);
}

export function upsertNotepadPresence(
  id: string,
  body: { session_id: string; display_name: string; cursor_label?: string; color?: string },
) {
  return api.post<NotepadPresence>(`/notepad/documents/${id}/presence`, body);
}

// ── Version history (Slice F) ────────────────────────────────────────

export type NotepadRevisionKind = 'autosave' | 'manual' | 'initial';

export interface NotepadRevision {
  id: string;
  document_id: string;
  rev: number;
  kind: NotepadRevisionKind;
  name: string;
  endorsed: boolean;
  author_id: string;
  title: string;
  description: string;
  content: string;
  content_doc: ProseMirrorDoc | Record<string, never> | null;
  widgets: Array<Record<string, unknown>>;
  template_key: string | null;
  created_at: string;
}

export function listNotepadRevisions(id: string, includeAutosaves: boolean) {
  const qs = includeAutosaves ? '?include=all' : '';
  return api.get<{ data: NotepadRevision[] }>(`/notepad/documents/${id}/revisions${qs}`);
}

export function getNotepadRevision(id: string, rev: number) {
  return api.get<NotepadRevision>(`/notepad/documents/${id}/revisions/${rev}`);
}

export function createNotepadRevision(
  id: string,
  body: { name?: string; endorsed?: boolean } = {},
) {
  return api.post<NotepadRevision>(`/notepad/documents/${id}/revisions`, body);
}

export function revertNotepadRevision(id: string, rev: number) {
  return api.post<NotepadDocument>(`/notepad/documents/${id}/revisions/${rev}/revert`, {});
}

// ── Live embeds (Slice C) ────────────────────────────────────────────

export type NotepadEmbedKind =
  | 'object_card'
  | 'contour_chart'
  | 'quiver_chart'
  | 'code_workbook_chart';

export interface NotepadEmbedField {
  label: string;
  value: string;
}

export interface NotepadEmbedPreview {
  kind: NotepadEmbedKind;
  ref: string;
  title: string;
  subtitle?: string;
  status?: string;
  summary?: string;
  thumbnail_url?: string;
  fields?: NotepadEmbedField[];
  preview_url?: string;
  fetched_at: string;
  annotations?: Record<string, string>;
}

export function resolveNotepadEmbed(body: { kind: NotepadEmbedKind; ref: string }) {
  return api.post<NotepadEmbedPreview>('/notepad/embeds/resolve', body);
}

// ── Edit with AIP (Slice D) ──────────────────────────────────────────

export type AIPTransformOp =
  | 'custom_prompt'
  | 'fix_grammar'
  | 'shorten'
  | 'change_style'
  | 'translate'
  | 'function';

export interface AIPTransformRequest {
  op: AIPTransformOp;
  text: string;
  prompt?: string;
  options?: Record<string, string>;
}

export interface AIPTransformResult {
  op: AIPTransformOp;
  source_text: string;
  result: string;
  annotation?: string;
  provider?: string;
}

export function transformNotepadText(body: AIPTransformRequest) {
  return api.post<AIPTransformResult>('/notepad/aip/transform', body);
}

// ── Templates v2 (Slice G) ───────────────────────────────────────────

export type NotepadTemplateInputType = 'string' | 'number' | 'enum';

export interface NotepadTemplateInput {
  key: string;
  label: string;
  type: NotepadTemplateInputType;
  required?: boolean;
  default?: string;
  options?: string[];
  description?: string;
}

export interface NotepadTemplate {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  title: string;
  content: string;
  content_doc: ProseMirrorDoc | Record<string, never> | null;
  widgets: Array<Record<string, unknown>>;
  inputs_schema: NotepadTemplateInput[];
  visibility: 'private' | 'organization';
  template_key: string | null;
  created_at: string;
  updated_at: string;
}

export function listNotepadTemplates() {
  return api.get<{ data: NotepadTemplate[] }>('/notepad/templates');
}

export function getNotepadTemplate(id: string) {
  return api.get<NotepadTemplate>(`/notepad/templates/${id}`);
}

export function createNotepadTemplate(body: {
  name: string;
  description?: string;
  title?: string;
  content?: string;
  content_doc?: ProseMirrorDoc;
  widgets?: Array<Record<string, unknown>>;
  inputs_schema?: NotepadTemplateInput[];
  visibility?: 'private' | 'organization';
  template_key?: string;
}) {
  return api.post<NotepadTemplate>('/notepad/templates', body);
}

export function updateNotepadTemplate(
  id: string,
  body: Partial<{
    name: string;
    description: string;
    title: string;
    content: string;
    content_doc: ProseMirrorDoc;
    widgets: Array<Record<string, unknown>>;
    inputs_schema: NotepadTemplateInput[];
    visibility: 'private' | 'organization';
    template_key: string;
  }>,
) {
  return api.patch<NotepadTemplate>(`/notepad/templates/${id}`, body);
}

export function deleteNotepadTemplate(id: string) {
  return api.delete(`/notepad/templates/${id}`);
}

export function instantiateNotepadTemplate(
  id: string,
  body: { title?: string; description?: string; inputs?: Record<string, string> },
) {
  return api.post<NotepadDocument>(`/notepad/templates/${id}/instantiate`, body);
}

// HTML export — keeps the JSON envelope so the inline preview iframe
// works without changes.
export function exportNotepadDocumentHTML(
  id: string,
  source?: NotepadExportRequest,
): Promise<NotepadExportPayload> {
  return api.post<NotepadExportPayload>(
    `/notepad/documents/${id}/export?format=html`,
    { ...(source ?? {}), format: 'html' },
  );
}

// PDF / DOCX export — bypasses the JSON client because the response
// body is a binary stream. Returns a Blob + filename so the caller can
// trigger a download. Auth lives in the httpOnly `of_session` cookie
// (see client.ts) so `credentials: 'include'` is sufficient.
export async function exportNotepadDocumentBinary(
  id: string,
  format: 'pdf' | 'docx',
  source: NotepadExportRequest = {},
): Promise<NotepadBinaryExport> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
  const response = await fetch(`${base}/notepad/documents/${id}/export?format=${format}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...source, format }),
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // Non-JSON error body — surface as-is.
    }
    throw new Error(message || `Export ${format} failed (${response.status})`);
  }
  const blob = await response.blob();
  const mimeType =
    response.headers.get('content-type') ??
    (format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const fileName = extractFileName(response.headers.get('content-disposition'), `notepad-export.${format}`);
  return { blob, file_name: fileName, mime_type: mimeType };
}

function extractFileName(header: string | null, fallback: string): string {
  if (!header) return fallback;
  // Prefer the RFC 5987 `filename*=UTF-8''…` form when present.
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to plain match
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  if (plain) return plain[1].trim();
  return fallback;
}
