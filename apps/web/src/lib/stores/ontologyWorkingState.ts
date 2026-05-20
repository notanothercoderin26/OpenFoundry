// Ontology Manager working-state store.
//
// Holds the in-memory stack of edits the user has staged but not yet
// saved — the "1 edit" badge in the top bar, the Review-edits modal
// contents, and the History → Unsaved-changes sidebar all read from
// this store. Mutations to the live ontology only happen when `save()`
// is called, which funnels every staged edit through the atomic
// `POST /api/v1/ontology/batch-save` endpoint.
//
// Store identity rules:
//   - One in-memory edit per (resource_kind, resource_id) for updates
//     and deletes. Re-staging a field on the same object type folds
//     into the existing card so the Review-edits modal sees "N edits"
//     on a single card instead of N separate cards. A subsequent
//     delete on the same id replaces a pending update.
//   - Creates each get their own card keyed by clientId. They never
//     dedupe — staging two creates of "Aircraft" is the user's
//     problem to spot.
//
// Persistence: sessionStorage. Edits survive refresh but not tab
// close, mirroring the Palantir behaviour where Discover loses
// unsaved work when you close the browser but keeps it when you
// navigate inside the app.
//
// State that is NOT held here:
//   - Server-side resource snapshots (TanStack Query owns those).
//   - The currently-open edit form's local input state (each form
//     keeps its own useState until the user clicks "Stage" / form
//     submit, which calls into this store).

import { useSyncExternalStore } from "react";

import {
  type BatchEdit,
  type BatchEditOp,
  type BatchEditResource,
  type BatchEditStatus,
  type BatchSaveResponse,
  type ValidationIssue,
  batchSave,
} from "../api/ontologyBatchSave";

// ── Types ────────────────────────────────────────────────────────────

export interface FieldDiff {
  path: string;
  before: unknown;
  after: unknown;
}

export interface StagedConflict {
  current_version: number;
  current_body: unknown;
}

/**
 * A single in-memory edit. `originalSnapshot` is the server state at
 * the moment the edit was staged; `draft` is the value the user has
 * built up. Field diffs are derived on demand by `diffStagedEdit()`.
 */
export interface StagedEdit {
  clientId: string;
  op: BatchEditOp;
  resource: BatchEditResource;
  /** null when op = "create" and the server hasn't assigned an id yet. */
  resourceId: string | null;
  /** null when op = "create". */
  expectedVersion: number | null;
  /** Original server state when the edit was staged. null for creates. */
  originalSnapshot: unknown;
  /** Current draft body — what we send as `body` to the backend. */
  draft: unknown;
  /** Display label for the modal's edit card (e.g. "[Example Data] Aircraft"). */
  label: string;
  /**
   * Resource sub-kind for the icon next to the label in the modal
   * (e.g. "object_type" → cube icon). Today this equals `resource`,
   * but property edits may want to override to e.g. "property:number".
   */
  iconKind?: string;
  status: BatchEditStatus | "pending" | "saving";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Warning codes the user explicitly acknowledged in the modal. */
  confirmedWarnings: string[];
  conflict?: StagedConflict;
  /** Wall-clock millis when the edit entered the store. */
  createdAt: number;
}

export interface WorkingStateSnapshot {
  edits: StagedEdit[];
  saveInFlight: boolean;
  /** Set when the last batch-save call itself failed at the transport layer. */
  lastTransportError: string | null;
  /** Last batch_id returned by the server, for History view linking. */
  lastBatchId: string | null;
}

// ── Stage / discard input shapes ─────────────────────────────────────

interface StageBase {
  clientId?: string;
  label: string;
  iconKind?: string;
}

export interface StageCreateInput extends StageBase {
  op: "create";
  resource: BatchEditResource;
  draft: unknown;
}

export interface StageUpdateInput extends StageBase {
  op: "update";
  resource: BatchEditResource;
  resourceId: string;
  expectedVersion: number;
  originalSnapshot: unknown;
  draft: unknown;
}

export interface StageDeleteInput extends StageBase {
  op: "delete";
  resource: BatchEditResource;
  resourceId: string;
  expectedVersion: number;
  originalSnapshot: unknown;
}

export type StageInput = StageCreateInput | StageUpdateInput | StageDeleteInput;

// ── Store internals ──────────────────────────────────────────────────

const STORAGE_KEY = "of_ontology_working_state";

const initialSnapshot: WorkingStateSnapshot = {
  edits: [],
  saveInFlight: false,
  lastTransportError: null,
  lastBatchId: null,
};

let snapshot: WorkingStateSnapshot = initialSnapshot;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setSnapshot(next: Partial<WorkingStateSnapshot>) {
  snapshot = { ...snapshot, ...next };
  persist();
  emit();
}

function persist() {
  if (typeof sessionStorage === "undefined") return;
  try {
    // Only the edits + lastBatchId are worth persisting; in-flight
    // status and transport errors are session-local.
    const persisted = {
      edits: snapshot.edits,
      lastBatchId: snapshot.lastBatchId,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Quota exceeded or storage disabled — silently drop. The UI
    // already shows the badge from the in-memory snapshot.
  }
}

function hydrate() {
  if (typeof sessionStorage === "undefined") return;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<{
      edits: StagedEdit[];
      lastBatchId: string | null;
    }>;
    const edits = Array.isArray(parsed.edits) ? parsed.edits : [];
    snapshot = {
      ...initialSnapshot,
      edits,
      lastBatchId: parsed.lastBatchId ?? null,
    };
  } catch {
    snapshot = initialSnapshot;
  }
}

hydrate();

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers / test environments. Not cryptographic,
  // but client_id only needs to be unique within a single working state.
  return "edit-" + Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

// ── Core mutations ───────────────────────────────────────────────────

function findIndexFor(resource: BatchEditResource, resourceId: string | null): number {
  if (resourceId === null) return -1;
  return snapshot.edits.findIndex(
    (e) => e.resource === resource && e.resourceId === resourceId,
  );
}

function findIndexByClientId(clientId: string): number {
  return snapshot.edits.findIndex((e) => e.clientId === clientId);
}

/**
 * Stage a new edit, or fold a new value into an existing edit for the
 * same resource. Returns the clientId so callers can subsequently
 * call `updateDraft` / `discard` against it.
 */
export function stage(input: StageInput): string {
  const now = Date.now();
  if (input.op === "create") {
    const clientId = input.clientId ?? uuid();
    const edit: StagedEdit = {
      clientId,
      op: "create",
      resource: input.resource,
      resourceId: null,
      expectedVersion: null,
      originalSnapshot: null,
      draft: input.draft,
      label: input.label,
      iconKind: input.iconKind ?? input.resource,
      status: "pending",
      errors: [],
      warnings: [],
      confirmedWarnings: [],
      createdAt: now,
    };
    setSnapshot({ edits: [...snapshot.edits, edit] });
    return clientId;
  }

  // update / delete — fold by (resource, id).
  const existingIdx = findIndexFor(input.resource, input.resourceId);
  if (existingIdx >= 0) {
    const existing = snapshot.edits[existingIdx];
    if (input.op === "delete") {
      // Replace any pending update with the delete; keep the original
      // snapshot from before any earlier edit so the audit log shows
      // the true "before".
      const replaced: StagedEdit = {
        ...existing,
        clientId: input.clientId ?? existing.clientId,
        op: "delete",
        // Drafts are irrelevant for deletes.
        draft: null,
        label: input.label || existing.label,
        iconKind: input.iconKind ?? existing.iconKind,
        status: "pending",
        errors: [],
        warnings: [],
        confirmedWarnings: [],
        conflict: undefined,
        expectedVersion: input.expectedVersion,
        originalSnapshot:
          existing.originalSnapshot ?? input.originalSnapshot,
      };
      const next = [...snapshot.edits];
      next[existingIdx] = replaced;
      setSnapshot({ edits: next });
      return replaced.clientId;
    }
    // update merging an existing update — keep the older original
    // snapshot (it represents the true "before" the user started
    // editing) but adopt the new draft and bump the expected_version
    // upward if the caller saw a newer revision.
    const merged: StagedEdit = {
      ...existing,
      op: "update",
      draft: input.draft,
      label: input.label || existing.label,
      iconKind: input.iconKind ?? existing.iconKind,
      status: "pending",
      errors: [],
      warnings: [],
      confirmedWarnings: [],
      conflict: undefined,
      expectedVersion: Math.max(existing.expectedVersion ?? 0, input.expectedVersion),
      originalSnapshot: existing.originalSnapshot ?? input.originalSnapshot,
    };
    const next = [...snapshot.edits];
    next[existingIdx] = merged;
    setSnapshot({ edits: next });
    return merged.clientId;
  }

  const clientId = input.clientId ?? uuid();
  const edit: StagedEdit = {
    clientId,
    op: input.op,
    resource: input.resource,
    resourceId: input.resourceId,
    expectedVersion: input.expectedVersion,
    originalSnapshot: input.op === "delete" ? input.originalSnapshot : input.originalSnapshot,
    draft: input.op === "delete" ? null : input.draft,
    label: input.label,
    iconKind: input.iconKind ?? input.resource,
    status: "pending",
    errors: [],
    warnings: [],
    confirmedWarnings: [],
    createdAt: now,
  };
  setSnapshot({ edits: [...snapshot.edits, edit] });
  return clientId;
}

/** Patch the draft on an existing edit without re-folding. */
export function updateDraft(clientId: string, draft: unknown) {
  const idx = findIndexByClientId(clientId);
  if (idx < 0) return;
  const next = [...snapshot.edits];
  next[idx] = { ...next[idx], draft, status: "pending", errors: [], warnings: [] };
  setSnapshot({ edits: next });
}

export function discard(clientId: string) {
  const next = snapshot.edits.filter((e) => e.clientId !== clientId);
  if (next.length === snapshot.edits.length) return;
  setSnapshot({ edits: next });
}

export function discardAll() {
  setSnapshot({ edits: [], lastTransportError: null });
}

export function acknowledgeWarning(clientId: string, warningCode: string) {
  const idx = findIndexByClientId(clientId);
  if (idx < 0) return;
  const edit = snapshot.edits[idx];
  if (edit.confirmedWarnings.includes(warningCode)) return;
  const next = [...snapshot.edits];
  next[idx] = {
    ...edit,
    confirmedWarnings: [...edit.confirmedWarnings, warningCode],
  };
  setSnapshot({ edits: next });
}

/**
 * Resolve a conflict by either dropping the user's edit ("use_latest")
 * or restaging it against the new server version ("keep_mine"). In
 * the "keep_mine" branch, the conflict's current_body becomes the new
 * originalSnapshot so the audit log reflects the actual delta.
 */
export function resolveConflict(clientId: string, choice: "use_latest" | "keep_mine") {
  const idx = findIndexByClientId(clientId);
  if (idx < 0) return;
  const edit = snapshot.edits[idx];
  if (!edit.conflict) return;
  if (choice === "use_latest") {
    discard(clientId);
    return;
  }
  const next = [...snapshot.edits];
  next[idx] = {
    ...edit,
    expectedVersion: edit.conflict.current_version,
    originalSnapshot: edit.conflict.current_body ?? edit.originalSnapshot,
    conflict: undefined,
    status: "pending",
    errors: [],
  };
  setSnapshot({ edits: next });
}

// ── Save ─────────────────────────────────────────────────────────────

export interface SaveOptions {
  note?: string;
  source?: string;
}

/**
 * POST the staged edits to the backend atomically. On success, edits
 * that committed are removed from the store and the modal closes; on
 * failure, the affected edits carry status="conflict" or "error" so
 * the modal can render the Conflicts / Errors tabs.
 *
 * Returns the raw server response so the caller (the Review-edits
 * modal) can branch on the global `status` field if it needs to.
 */
export async function save(options: SaveOptions = {}): Promise<BatchSaveResponse | null> {
  if (snapshot.saveInFlight) return null;
  if (snapshot.edits.length === 0) return null;

  setSnapshot({
    saveInFlight: true,
    lastTransportError: null,
    edits: snapshot.edits.map((e) => ({ ...e, status: "saving" })),
  });

  const wire = snapshot.edits.map(toWireEdit);

  let response: BatchSaveResponse;
  try {
    response = await batchSave({
      note: options.note,
      source: options.source,
      edits: wire,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setSnapshot({
      saveInFlight: false,
      lastTransportError: message,
      // Pull edits back to "pending" so the modal isn't stuck on
      // "saving…" for a connection error.
      edits: snapshot.edits.map((e) => ({ ...e, status: "pending" })),
    });
    return null;
  }

  applySaveResponse(response);
  return response;
}

function toWireEdit(edit: StagedEdit): BatchEdit {
  const wire: BatchEdit = {
    client_id: edit.clientId,
    op: edit.op,
    resource: edit.resource,
  };
  if (edit.resourceId) wire.id = edit.resourceId;
  if (edit.expectedVersion !== null) wire.expected_version = edit.expectedVersion;
  if (edit.op !== "delete") wire.body = edit.draft;
  if (edit.confirmedWarnings.length > 0) wire.confirmed_warnings = edit.confirmedWarnings;
  return wire;
}

function applySaveResponse(response: BatchSaveResponse) {
  const byClientId = new Map(response.results.map((r) => [r.client_id, r]));
  const edits = snapshot.edits.map((edit) => {
    const result = byClientId.get(edit.clientId);
    if (!result) {
      // Server didn't echo this edit. Treat as still-pending so the
      // user can retry.
      return { ...edit, status: "pending" as const };
    }
    if (result.status === "ok") {
      return { ...edit, status: "saved" as const };
    }
    if (result.status === "conflict") {
      return {
        ...edit,
        status: "conflict" as const,
        conflict:
          result.current_version !== undefined
            ? {
                current_version: result.current_version,
                current_body: result.current_body,
              }
            : edit.conflict,
        errors: result.errors ?? [],
        warnings: result.warnings ?? [],
      };
    }
    if (result.status === "skipped") {
      return { ...edit, status: "pending" as const };
    }
    // error
    return {
      ...edit,
      status: "error" as const,
      errors: result.errors ?? [],
      warnings: result.warnings ?? [],
    };
  });

  const survivors = edits.filter((e) => e.status !== "saved");

  setSnapshot({
    edits: survivors,
    saveInFlight: false,
    lastBatchId: response.batch_id,
  });
}

// ── Selectors ────────────────────────────────────────────────────────

export function getEditCount(): number {
  return snapshot.edits.length;
}

export function getErrorCount(): number {
  return snapshot.edits.filter((e) => e.errors.length > 0).length;
}

export function getWarningCount(): number {
  return snapshot.edits.filter((e) => e.warnings.length > 0).length;
}

export function getConflictCount(): number {
  return snapshot.edits.filter((e) => e.status === "conflict").length;
}

export function hasUnsavedChanges(): boolean {
  return snapshot.edits.length > 0;
}

export function findEdit(clientId: string): StagedEdit | undefined {
  return snapshot.edits.find((e) => e.clientId === clientId);
}

export function findEditForResource(
  resource: BatchEditResource,
  resourceId: string,
): StagedEdit | undefined {
  return snapshot.edits.find(
    (e) => e.resource === resource && e.resourceId === resourceId,
  );
}

// ── Diff (used by the Review-edits modal renderer) ───────────────────

/**
 * Field-level diff between an edit's `originalSnapshot` and its
 * current `draft`. The modal renders each entry as a strikethrough
 * (before) / green (after) pair next to the field path. Nested
 * objects produce one entry covering the whole subtree, matching the
 * Foundry modal screenshots.
 *
 * Skips housekeeping fields (`version`, `created_at`, `updated_at`)
 * so the modal doesn't show implementation noise next to the user's
 * actual changes.
 */
export function diffStagedEdit(edit: StagedEdit): FieldDiff[] {
  if (edit.op === "create" || edit.op === "delete") return [];
  const before = toRecord(edit.originalSnapshot);
  const after = toRecord(edit.draft);
  const keys = mergedKeys(before, after);
  const out: FieldDiff[] = [];
  for (const key of keys) {
    if (key === "version" || key === "created_at" || key === "updated_at") {
      continue;
    }
    const b = before[key];
    const a = after[key];
    if (deepEqual(b, a)) continue;
    out.push({ path: key, before: b, after: a });
  }
  return out;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function mergedKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  Object.keys(a).forEach((k) => seen.add(k));
  Object.keys(b).forEach((k) => seen.add(k));
  return [...seen].sort();
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

// ── React bindings ────────────────────────────────────────────────────

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): WorkingStateSnapshot {
  return snapshot;
}

/**
 * Subscribe to the full snapshot. Components that only need the count
 * should prefer `useEditCount()` to avoid re-rendering on unrelated
 * edits.
 */
export function useOntologyWorkingState(): WorkingStateSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

let cachedCount = snapshot.edits.length;
let lastCountVersion = snapshot;
function getCachedEditCount(): number {
  if (lastCountVersion !== snapshot) {
    cachedCount = snapshot.edits.length;
    lastCountVersion = snapshot;
  }
  return cachedCount;
}

export function useEditCount(): number {
  return useSyncExternalStore(subscribe, getCachedEditCount, getCachedEditCount);
}

// ── Test helpers ─────────────────────────────────────────────────────

/**
 * Reset the store to a clean state. Test-only — production callers
 * should use discardAll().
 */
export function _resetForTests() {
  snapshot = initialSnapshot;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
  emit();
}
