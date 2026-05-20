import {
  normalizeObjectExplorerProductConfig,
  objectViewFullHref,
  type ObjectQueryFilter,
  type ObjectType,
  type Property,
  type SearchResult,
} from '@/lib/api/ontology';

export type SearchMode = 'lexical' | 'semantic';
export type EvaluationMode = 'preview' | 'materialize';

export interface RecentItem {
  kind: string;
  id: string;
  title: string;
  route: string;
  objectTypeId: string | null;
  createdAt: string;
}

export interface PropertyFilterDraft {
  property_name: string;
  operator: ObjectQueryFilter['operator'];
  value: string;
}

export type LinkedFilterMode = 'has_link' | 'linked_property' | 'object_reference';

export interface LinkedFilterDraft {
  mode: LinkedFilterMode;
  link_type_id: string;
  property_name: string;
  operator: ObjectQueryFilter['operator'];
  value: string;
  object_id: string;
}

export interface ExplorationContext {
  kind: 'linked_filter' | 'pivot';
  label: string;
  source_object_type_id: string;
  result_object_type_id: string;
  source_object_ids: string[];
  result_object_ids: string[];
  link_type_id: string;
  direction: string;
}

export const RECENTS_KEY = 'of.objectExplorer.recents';
export const FAVORITES_KEY = 'of.objectExplorer.favoriteTypes';

export const DEFAULT_PROPERTY_FILTER: PropertyFilterDraft = {
  property_name: '',
  operator: 'equals',
  value: '',
};

export const DEFAULT_LINKED_FILTER: LinkedFilterDraft = {
  mode: 'has_link',
  link_type_id: '',
  property_name: '',
  operator: 'equals',
  value: '',
  object_id: '',
};

export const SEARCH_KINDS = [
  { value: '', label: 'All resources' },
  { value: 'object_instance', label: 'Objects' },
  { value: 'object_type', label: 'Object types' },
  { value: 'action_type', label: 'Actions' },
  { value: 'link_type', label: 'Links' },
  { value: 'shared_property_type', label: 'Shared properties' },
];

export const OBJECT_EXPLORER_CONFIG = normalizeObjectExplorerProductConfig({
  max_action_selection_count: 1000,
  max_export_selection_count: 5000,
  open_in_targets: ['object_views', 'graph', 'map', 'workshop', 'reports'],
});

export const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function readRecents(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

export function writeRecents(items: RecentItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, 30)));
}

export function readFavoriteTypeIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function writeFavoriteTypeIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function shortId(value: string | null | undefined, length = 10) {
  if (!value) return '-';
  return value.length <= length ? value : `${value.slice(0, length)}...`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : dateFormatter.format(parsed);
}

export function uniqueRecentKey(item: RecentItem) {
  return `${item.kind}:${item.id}`;
}

export function propertyKind(property?: Property | null) {
  const raw = `${property?.property_type || ''} ${property?.base_type || ''} ${property?.type_family || ''}`.toLowerCase();
  if (/(int|long|float|double|decimal|number|numeric|currency|percent)/.test(raw)) return 'number';
  if (/(date|time|timestamp)/.test(raw)) return 'date';
  if (/(bool)/.test(raw)) return 'boolean';
  return 'string';
}

export function propertyInputType(property?: Property | null) {
  const kind = propertyKind(property);
  if (kind === 'number') return 'number';
  if (kind === 'date') return 'datetime-local';
  return 'text';
}

export function operatorOptionsForProperty(property?: Property | null) {
  const kind = propertyKind(property);
  if (kind === 'number' || kind === 'date') {
    return [
      ['equals', 'equals'],
      ['not_equals', 'not equals'],
      ['gt', 'greater than'],
      ['gte', 'greater or equal'],
      ['lt', 'less than'],
      ['lte', 'less or equal'],
      ['is_empty', 'is empty'],
      ['is_not_empty', 'is not empty'],
    ] as const;
  }
  if (kind === 'boolean') {
    return [
      ['equals', 'equals'],
      ['not_equals', 'not equals'],
      ['is_empty', 'is empty'],
      ['is_not_empty', 'is not empty'],
    ] as const;
  }
  return [
    ['equals', 'equals'],
    ['contains', 'contains'],
    ['not_equals', 'not equals'],
    ['is_empty', 'is empty'],
    ['is_not_empty', 'is not empty'],
  ] as const;
}

export function coerceFilterValue(value: string, property?: Property | null) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (propertyKind(property) === 'number') {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  if (propertyKind(property) === 'boolean') return trimmed.toLowerCase() === 'true';
  return trimmed;
}

export function uniqueObjectIds(results: SearchResult[]) {
  return Array.from(new Set(results
    .filter((result) => result.kind === 'object_instance')
    .map((result) => result.id)
    .filter(Boolean)));
}

export function splitCompact(value: string) {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatValueLocal(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function objectToSearchResult(
  object: { id: string; object_type_id: string; properties: Record<string, unknown> },
  objectType?: ObjectType | null,
): SearchResult {
  const titleProperty = objectType?.title_property || objectType?.primary_key_property || objectType?.primary_key || 'id';
  const title = formatValueLocal(object.properties?.[titleProperty]) || object.id;
  return {
    kind: 'object_instance',
    id: object.id,
    object_type_id: object.object_type_id,
    title,
    subtitle: objectType?.display_name || objectType?.name || object.object_type_id,
    snippet: Object.entries(object.properties || {})
      .slice(0, 4)
      .map(([key, value]) => `${key}: ${formatValueLocal(value)}`)
      .join(' · '),
    score: 1,
    route: objectViewFullHref(object.object_type_id, object.id),
    metadata: { ...(object.properties || {}) },
  };
}

export function objectQueryFiltersFromDrafts(
  filters: PropertyFilterDraft[],
  properties: Property[] = [],
): ObjectQueryFilter[] {
  const propertyByName = new Map(properties.map((property) => [property.name, property]));
  return filters
    .filter((filter) => filter.property_name && (filter.operator === 'is_empty' || filter.operator === 'is_not_empty' || filter.value.trim() !== ''))
    .map((filter) => ({
      property_name: filter.property_name,
      operator: filter.operator,
      value: filter.operator === 'is_empty' || filter.operator === 'is_not_empty' ? undefined : coerceFilterValue(filter.value, propertyByName.get(filter.property_name)),
    }));
}

export function objectSetFiltersFromQueryFilters(filters: ObjectQueryFilter[]) {
  return filters.map((filter) => ({
    field: filter.property_name,
    operator: filter.operator || 'equals',
    value: filter.value ?? null,
  }));
}

export function objectIdFromEvaluationRow(row: Record<string, unknown>) {
  const candidate = (row.base && typeof row.base === 'object') ? row.base as Record<string, unknown> : row;
  return typeof candidate.id === 'string' ? candidate.id : '';
}

export function objectTypeIdFromResultSet(results: SearchResult[]) {
  const typeIds = Array.from(new Set(results
    .filter((result) => result.kind === 'object_instance' && result.object_type_id)
    .map((result) => result.object_type_id as string)));
  return typeIds.length === 1 ? typeIds[0] : '';
}
