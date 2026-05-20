// Workshop ↔ /ontology/search pushdown (B03 G2).
//
// Closes the Workshop half of the geopolitics PoC's "Workshop filter
// pushdown" gap: compiles `WorkshopVariableFilter[]` straight to the
// backend's POST /api/v1/ontology/search body so the map / timeline /
// object-table / graph widgets can read the same Vespa-backed object
// set without bouncing through Cassandra. The legacy
// `applyObjectSetFilters` client-side path stays available for
// in-memory cases (selected objects, saved object sets) where the
// rows are already in hand.
//
// The compilation is intentionally side-effect free so the unit
// tests can pin the wire shape without spinning up the runtime.

import { searchOntology, type ObjectInstance, type SearchResult } from '@/lib/api/ontology';
import type { WorkshopVariableFilter } from './workshopVariables';

export interface WorkshopSearchPushdownOptions {
  objectTypeId: string;
  filters: WorkshopVariableFilter[];
  query?: string;
  limit?: number;
  kind?: string;
}

export interface WorkshopSearchRequestBody {
  query: string;
  object_type_id?: string;
  kind?: string;
  limit?: number;
  filters: WorkshopSearchRequestFilter[];
}

export interface WorkshopSearchRequestFilter {
  property_name: string;
  operator: string;
  value?: unknown;
  min?: unknown;
  max?: unknown;
}

export interface WorkshopSearchPushdownResult {
  data: ObjectInstance[];
  total: number;
  raw: SearchResult[];
  request: WorkshopSearchRequestBody;
}

// compileWorkshopFiltersToSearch maps Workshop's variable-filter
// shape to the backend's wire format. Keeps `min` / `max` as
// `between` so the Go handler can decide how to push it down per
// backend.
export function compileWorkshopFiltersToSearch(
  filters: WorkshopVariableFilter[] | undefined,
): WorkshopSearchRequestFilter[] {
  if (!filters || filters.length === 0) return [];
  const out: WorkshopSearchRequestFilter[] = [];
  for (const filter of filters) {
    const property = typeof filter.property_name === 'string' ? filter.property_name.trim() : '';
    if (!property) continue;
    const hasMin = filter.min !== undefined && filter.min !== null;
    const hasMax = filter.max !== undefined && filter.max !== null;
    if (hasMin || hasMax) {
      out.push({
        property_name: property,
        operator: 'between',
        min: hasMin ? filter.min : undefined,
        max: hasMax ? filter.max : undefined,
      });
      continue;
    }
    const operator = typeof filter.operator === 'string' && filter.operator.trim()
      ? filter.operator.trim().toLowerCase()
      : 'equals';
    out.push({
      property_name: property,
      operator,
      value: filter.value,
    });
  }
  return out;
}

// buildWorkshopSearchRequest produces the literal POST body the
// backend expects. Split out so callers can inspect / pin the shape
// in tests without hitting the network.
export function buildWorkshopSearchRequest(
  options: WorkshopSearchPushdownOptions,
): WorkshopSearchRequestBody {
  const objectTypeId = options.objectTypeId.trim();
  return {
    query: typeof options.query === 'string' ? options.query : '',
    ...(objectTypeId ? { object_type_id: objectTypeId } : {}),
    ...(options.kind ? { kind: options.kind } : {}),
    ...(typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
      ? { limit: Math.min(100, Math.trunc(options.limit)) }
      : {}),
    filters: compileWorkshopFiltersToSearch(options.filters),
  };
}

// searchResultToObjectInstance projects a search hit into the
// ObjectInstance shape the Workshop runtime feeds to widgets. The
// indexer projects the original payload into `metadata`, so we can
// recover the property bag verbatim.
export function searchResultToObjectInstance(result: SearchResult): ObjectInstance {
  const metadata = result.metadata ?? {};
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'markings' || key === '_markings') continue;
    properties[key] = value;
  }
  const objectTypeId = (result.object_type_id ?? '').toString();
  const marking = readSingleMarking(metadata);
  const generatedAt = new Date(0).toISOString();
  return {
    id: result.id,
    object_type_id: objectTypeId,
    properties,
    created_by: 'ontology-search',
    organization_id: null,
    ...(marking ? { marking } : {}),
    created_at: generatedAt,
    updated_at: generatedAt,
  };
}

// fetchWorkshopObjectSetViaSearch wires the helper to the real
// `searchOntology` API call. The runtime path stays explicit —
// callers must opt in to pushdown when they know the type lives on
// the search backend.
export async function fetchWorkshopObjectSetViaSearch(
  options: WorkshopSearchPushdownOptions,
  client: { searchOntology: typeof searchOntology } = { searchOntology },
): Promise<WorkshopSearchPushdownResult> {
  const request = buildWorkshopSearchRequest(options);
  const response = await client.searchOntology(request);
  const hits = Array.isArray(response.data) ? response.data : [];
  return {
    data: hits.map(searchResultToObjectInstance),
    total: typeof response.total === 'number' ? response.total : hits.length,
    raw: hits,
    request,
  };
}

function readSingleMarking(metadata: Record<string, unknown>): string | null {
  const markings = metadata.markings;
  if (Array.isArray(markings) && markings.length > 0) {
    return String(markings[0]);
  }
  if (typeof metadata.marking === 'string') return metadata.marking;
  return null;
}
