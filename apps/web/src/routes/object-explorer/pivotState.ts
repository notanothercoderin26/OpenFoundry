// Pivot history + multi-step Search Around helpers for Object Explorer.
//
// The Object Explorer pivot UI mirrors Palantir's "Pivot to explore linked
// objects" flow: the analyst pivots from an active object set to a linked
// object type while filters travel across the pivot. Foundry explicitly
// supports sequential pivots ("It is possible to pivot through multiple
// links"). This module is the pure state machine for that history plus the
// adapter that converts a stack of pivots into a multi-step Search Around
// `TraverseRequest` (`/api/v1/ontology/traverse`), which is the canonical
// way to re-execute the chain in one round-trip.
//
// Keeping this side-effect free means the unit tests pin the contract
// without spinning up React state.

import type { TraverseRequest, TraversalStep } from '@/lib/api/vertexTraversal';

import type { ExplorationContext } from './state';

export type PivotHistory = ExplorationContext[];

export function pushPivot(history: PivotHistory, step: ExplorationContext): PivotHistory {
  return [...history, step];
}

// rollbackTo truncates the history so that step `index` becomes the current
// step. `index = -1` clears history entirely. Out-of-range indices are
// clamped so the result is always a valid prefix.
export function rollbackTo(history: PivotHistory, index: number): PivotHistory {
  if (index < 0) return [];
  return history.slice(0, Math.max(0, Math.min(history.length, index + 1)));
}

export function currentPivot(history: PivotHistory): ExplorationContext | null {
  return history.length === 0 ? null : history[history.length - 1];
}

export function pivotHistoryLabel(history: PivotHistory): string {
  if (history.length === 0) return '';
  const first = history[0];
  const segments: string[] = [first.source_object_type_id];
  for (const step of history) {
    segments.push(step.result_object_type_id);
  }
  return segments.join(' → ');
}

export interface TraverseStepInput {
  ordinal: number;
  relation_id: string;
  direction: TraversalStep['direction'];
  filters: TraversalStep['filters'];
}

// pivotHistoryToTraverseRequest turns the pivot history into the
// multi-step `/api/v1/ontology/traverse` request the backend understands.
// Step direction maps Search Around's outgoing/incoming/both to the same
// values the Go handler accepts (default "outgoing" if unset).
//
// Only the FIRST step's `starting_set` is meaningful — subsequent steps
// chain off the previous step's results, mirroring the Go executor in
// `services/ontology-query-service/internal/handlers/traversal.go`.
export function pivotHistoryToTraverseRequest(input: {
  tenant: string;
  history: PivotHistory;
  branchContext?: string;
  parameterValues?: Record<string, unknown>;
}): TraverseRequest | null {
  if (input.history.length === 0) return null;
  const first = input.history[0];
  if (first.source_object_ids.length === 0) return null;

  const steps: TraversalStep[] = input.history.map((step, index) => ({
    ordinal: index,
    relation_id: step.link_type_id,
    direction: normalizeDirection(step.direction),
    filters: [],
  }));

  const startingSet = first.source_object_ids.map((objectId) => ({
    object_type_id: first.source_object_type_id,
    object_id: objectId,
  }));

  return {
    tenant: input.tenant,
    starting_set: startingSet,
    steps,
    parameter_values_json: input.parameterValues ?? {},
    branch_context: input.branchContext ?? '',
  };
}

function normalizeDirection(value: unknown): TraversalStep['direction'] {
  if (value === 'incoming' || value === 'outgoing' || value === 'both') return value;
  if (value === 'inbound') return 'incoming';
  if (value === 'outbound') return 'outgoing';
  return 'outgoing';
}
