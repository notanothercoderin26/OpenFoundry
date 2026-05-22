// EmbeddedRuntimeBridge — runtime glue that lets a child Workshop
// module share variables with its parent. Mirrors Palantir's contract:
// the parent's variable definition is authoritative and the child's
// own default for a mapped variable is ignored.
//
// The bridge is supplied to a child `WorkshopRuntimeProvider` via the
// `EmbeddedBridgeContext` React context. The provider checks each
// primitive variable on every render: if the variable's external_id
// is in `bridge.mappedExternalIDs`, the bridge's `read`/`write` win
// over local state and localStorage. Updates flow both ways — a `set
// variable` event in the child writes to the parent through `write`,
// and the parent's re-render produces a new bridge whose `read`
// returns the updated value.
//
// Self-reference guard: ancestor module slugs travel through a
// separate `EmbeddedAncestorsContext` so the renderer can refuse to
// mount a child that would form a cycle.

import { createContext } from 'react';

import type { WorkshopVariableLike } from './workshopVariables';

export interface EmbeddedRuntimeBridge {
  /**
   * Returns the current parent value bound to the given child
   * external_id, or `undefined` if the external id is not mapped.
   */
  read(childExternalID: string): unknown;
  /**
   * Writes a value to the parent for the given child external_id. A
   * no-op when the external id is not mapped.
   */
  write(childExternalID: string, value: unknown): void;
  /**
   * Stable list of mapped external ids. Used as a fast-path check in
   * the runtime provider so it does not need to walk the full
   * variables list on every read.
   */
  readonly mappedExternalIDs: string[];
}

export const EmbeddedBridgeContext = createContext<EmbeddedRuntimeBridge | null>(null);

export const EmbeddedAncestorsContext = createContext<string[]>([]);

/**
 * Picks the variables whose `external_id` is mapped by the bridge.
 * Returns a `Record<variableId, value>` for use as an initial primitive
 * state in `WorkshopRuntimeProvider`.
 */
export function hydrateFromBridge(
  variables: WorkshopVariableLike[],
  bridge: EmbeddedRuntimeBridge,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const variable of variables) {
    if (!variable.external_id) continue;
    if (!bridge.mappedExternalIDs.includes(variable.external_id)) continue;
    const value = bridge.read(variable.external_id);
    if (value === undefined) continue;
    out[variable.id] = value;
  }
  return out;
}

/**
 * Merges bridged values on top of a local primitives map. The output
 * is what the variable engine and widget tree should see; the input
 * `primitives` map remains the canonical local state.
 */
export function applyBridgeToPrimitives(
  primitives: Record<string, unknown>,
  variables: WorkshopVariableLike[],
  bridge: EmbeddedRuntimeBridge | null,
): Record<string, unknown> {
  if (!bridge || bridge.mappedExternalIDs.length === 0) return primitives;
  const merged: Record<string, unknown> = { ...primitives };
  for (const variable of variables) {
    if (!variable.external_id) continue;
    if (!bridge.mappedExternalIDs.includes(variable.external_id)) continue;
    const value = bridge.read(variable.external_id);
    if (value === undefined) continue;
    merged[variable.id] = value;
  }
  return merged;
}

/**
 * Resolves the parent variable id (if any) that backs a child
 * external_id, given a mapping. Falls back to `null` when the mapping
 * source is missing or refers to a literal.
 */
export interface InterfaceMappingEntry {
  kind: 'variable' | 'literal' | 'runtime_parameter';
  variable_id?: string;
  value?: unknown;
}

export type InterfaceMapping = Record<string, InterfaceMappingEntry>;

export function resolveMappedParentVariable(
  mapping: InterfaceMapping,
  childExternalID: string,
): string | null {
  const entry = mapping[childExternalID];
  if (!entry) return null;
  if (entry.kind !== 'variable') return null;
  return entry.variable_id ?? null;
}

/**
 * Reports whether a child's externally-typed variable can be mapped to
 * a parent variable of a given kind. Loose for V1: declared kinds
 * (e.g. 'numeric' vs 'number') and KindUnknown are accepted; only
 * mismatched concrete kinds (e.g. 'object_set' vs 'string') are
 * rejected. The runtime warns rather than blocks so builders can iterate.
 */
export function bridgeKindsCompatible(childKind: string, parentKind: string): boolean {
  if (!childKind || !parentKind) return true;
  if (childKind === parentKind) return true;
  // Numeric aliases.
  const numericAliases = new Set(['numeric', 'number', 'integer', 'float', 'double']);
  if (numericAliases.has(childKind) && numericAliases.has(parentKind)) return true;
  // Active-object kinds are object refs either way.
  const objectRefAliases = new Set(['object_set_active_object', 'object_ref']);
  if (objectRefAliases.has(childKind) && objectRefAliases.has(parentKind)) return true;
  return false;
}
