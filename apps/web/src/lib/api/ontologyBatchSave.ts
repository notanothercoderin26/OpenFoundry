// Ontology Manager batch-save wire types and client.
//
// Mirrors the Go shapes in
// `services/ontology-definition-service/internal/models/batch_save.go`.
// Field names use snake_case to match the JSON the backend reads and
// writes — the store layer is responsible for camelCase ergonomics on
// the React side.
//
// All staged edits flow through `batchSave()` as one request. The
// backend applies them atomically: either the whole batch commits or
// nothing changes. Per-edit failures (validation errors, optimistic-
// concurrency conflicts) come back inside `results[]` so the modal
// can render its Errors / Conflicts / Warnings tabs without
// special-casing transport-level errors.

import api from "./client";

export type BatchEditOp = "create" | "update" | "delete";

export type BatchEditResource =
  | "object_type"
  | "property"
  | "link_type"
  | "object_type_group"
  | "shared_property_type";

export type BatchEditStatus = "ok" | "conflict" | "error" | "skipped";

export interface ValidationIssue {
  code: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
  /**
   * When set, the UI must require the user to type this string back
   * before save proceeds. Used for destructive warnings such as the
   * "388 edits will be undone" confirmation.
   */
  requires_confirmation?: string;
  detail?: Record<string, unknown>;
}

export interface BatchEdit {
  /**
   * Caller-assigned correlation token (uuid) so the modal can match
   * results back to in-memory edit cards across retries.
   */
  client_id: string;
  op: BatchEditOp;
  resource: BatchEditResource;
  /**
   * Required for update/delete; optional for create (server generates
   * a fresh uuid when omitted).
   */
  id?: string;
  /**
   * Required for update/delete. The version the client read for this
   * resource before editing it. A mismatch surfaces as a conflict.
   */
  expected_version?: number;
  /**
   * Resource-specific payload. Shape matches the existing single-
   * resource endpoint payloads:
   *   - object_type create  → CreateObjectTypeRequest
   *   - object_type update  → UpdateObjectTypeRequest
   *   - link_type create    → CreateLinkTypeRequest
   *   - link_type update    → UpdateLinkTypeRequest
   *   - object_type_group   → Create/UpdateObjectTypeGroupRequest
   *   - property create     → CreatePropertyRequest + object_type_id
   *   - property update     → UpdatePropertyRequest
   * Omitted for deletes.
   */
  body?: unknown;
  /**
   * Warning codes the user explicitly confirmed in the modal. The
   * backend rejects the batch if any required-confirmation warning is
   * missing from this list.
   */
  confirmed_warnings?: string[];
}

export interface BatchSaveRequest {
  note?: string;
  source?: string;
  edits: BatchEdit[];
}

export interface BatchEditResult {
  client_id: string;
  resource: BatchEditResource;
  op: BatchEditOp;
  status: BatchEditStatus;

  /** Server-assigned id (creates) or echo of the request id. */
  resource_id?: string;
  /** Version after a successful create/update. Null for deletes. */
  new_version?: number;
  /** Resource state after the operation, for cache hydration. */
  after?: unknown;

  /** Populated on conflict: latest version and body the server holds. */
  current_version?: number;
  current_body?: unknown;

  errors?: ValidationIssue[];
  warnings?: ValidationIssue[];
}

export interface BatchSaveResponse {
  batch_id: string;
  status: "ok" | "failed";
  results: BatchEditResult[];
}

export function batchSave(req: BatchSaveRequest) {
  return api.post<BatchSaveResponse>("/ontology/batch-save", req);
}

// ── Audit log ────────────────────────────────────────────────────────

export interface AuditDiffEntry {
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditLogEntry {
  id: string;
  batch_id?: string;
  resource_kind: BatchEditResource;
  resource_id: string;
  operation: BatchEditOp;
  changed_by: string;
  changed_at: string;
  expected_version?: number;
  new_version: number;
  before_state?: unknown;
  after_state?: unknown;
  field_diffs: AuditDiffEntry[];
  source: string;
  note?: string;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  limit: number;
  offset: number;
}

export interface AuditLogQuery {
  resource_kind?: BatchEditResource;
  resource_id?: string;
  batch_id?: string;
  changed_by?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fetch ontology_audit_log entries — backs the History view in the
 * Ontology Manager. Entries that share a `batch_id` belong to the
 * same Save click in the Review-edits modal.
 */
export function listAuditLog(query: AuditLogQuery = {}) {
  const params = new URLSearchParams();
  if (query.resource_kind) params.set("resource_kind", query.resource_kind);
  if (query.resource_id) params.set("resource_id", query.resource_id);
  if (query.batch_id) params.set("batch_id", query.batch_id);
  if (query.changed_by) params.set("changed_by", query.changed_by);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  const qs = params.toString();
  return api.get<AuditLogPage>(`/ontology/audit-log${qs ? `?${qs}` : ""}`);
}
