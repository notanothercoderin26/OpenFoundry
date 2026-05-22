// Module-interface helpers: URL-parameter initialization and
// localStorage state saving for Workshop variables tagged with an
// external id. Mirrors Palantir Workshop's Module interface feature.
//
// Behavior contract (matches Palantir):
//   - Routing: variables with `routing.enabled` are hydrated once at
//     module load from `window.location.search`. Subsequent URL
//     changes are ignored; the source of truth is in-memory state.
//   - Interface: marks a variable as part of the module-interface API.
//     Open Workshop module events and the Embedded Module widget
//     consume this metadata to surface mappable variables.
//   - State saving: variables with `state_saving.enabled` round-trip
//     through `localStorage` under a key scoped by (app slug, user id,
//     external id) so values survive reloads.

import type { WorkshopVariableLike } from './workshopVariables';

const STORAGE_PREFIX = 'of.workshop.state';

export type ModuleInterfaceVariable = WorkshopVariableLike & {
  external_id: string;
};

/**
 * Returns the variables that participate in the module interface
 * (interface.enabled, routing.enabled, or state_saving.enabled — any of
 * the three implies the variable exposes an `external_id`).
 */
export function moduleInterfaceVariables(
  variables: WorkshopVariableLike[],
): ModuleInterfaceVariable[] {
  const out: ModuleInterfaceVariable[] = [];
  for (const variable of variables) {
    if (!variable.external_id) continue;
    const tagged =
      variable.interface?.enabled ||
      variable.routing?.enabled ||
      variable.state_saving?.enabled;
    if (!tagged) continue;
    out.push(variable as ModuleInterfaceVariable);
  }
  return out;
}

/**
 * Resolves the initial value of each routing-enabled variable from a
 * URL-parameter map. The output is keyed by variable id (not external
 * id) so callers can dispatch straight into `setPrimitiveValue`.
 *
 * Variables not present in the URL are omitted; callers should fall
 * back to the variable's `default_value` for those.
 */
export function hydrateVariablesFromUrl(
  variables: WorkshopVariableLike[],
  urlParams: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const variable of variables) {
    if (!variable.routing?.enabled) continue;
    if (!variable.external_id) continue;
    const raw = urlParams[variable.external_id];
    if (raw === undefined) continue;
    out[variable.id] = coerceUrlValue(raw, variable.kind);
  }
  return out;
}

/**
 * Returns the localStorage key used to persist a variable. Keys are
 * scoped by app slug and user id so the same physical browser can
 * carry state for multiple apps and users.
 */
export function stateSavingKey(
  appSlug: string,
  userId: string,
  externalId: string,
): string {
  return `${STORAGE_PREFIX}:${appSlug}:${userId}:${externalId}`;
}

/**
 * Reads any persisted values for state-saving-enabled variables. Quiet
 * on errors (e.g. JSON parse, missing localStorage) so the runtime
 * always boots even if storage is corrupted.
 */
export function readPersistedState(
  variables: WorkshopVariableLike[],
  appSlug: string,
  userId: string,
): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const storage = safeLocalStorage();
  if (!storage) return {};
  const out: Record<string, unknown> = {};
  for (const variable of variables) {
    if (!variable.state_saving?.enabled) continue;
    if (!variable.external_id) continue;
    const key = stateSavingKey(appSlug, userId, variable.external_id);
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      out[variable.id] = JSON.parse(raw);
    } catch {
      // ignore corrupted entries
    }
  }
  return out;
}

/**
 * Writes the current values of state-saving-enabled variables to
 * localStorage. Pass the same `appSlug`/`userId` as `readPersistedState`.
 */
export function writePersistedState(
  variables: WorkshopVariableLike[],
  values: Record<string, unknown>,
  appSlug: string,
  userId: string,
): void {
  if (typeof window === 'undefined') return;
  const storage = safeLocalStorage();
  if (!storage) return;
  for (const variable of variables) {
    if (!variable.state_saving?.enabled) continue;
    if (!variable.external_id) continue;
    const key = stateSavingKey(appSlug, userId, variable.external_id);
    const value = values[variable.id];
    if (value === undefined) {
      storage.removeItem(key);
      continue;
    }
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded — silently drop
    }
  }
}

/**
 * Best-effort coercion of a string URL parameter to the variable's
 * declared primitive kind. Unknown kinds and parse failures fall back
 * to the raw string so the value still reaches the variable.
 */
export function coerceUrlValue(raw: string, kind: string): unknown {
  switch (kind) {
    case 'boolean':
      return raw === 'true' || raw === '1';
    case 'number':
    case 'numeric':
    case 'integer':
    case 'float':
    case 'double': {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : raw;
    }
    case 'array':
    case 'struct':
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    default:
      return raw;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
