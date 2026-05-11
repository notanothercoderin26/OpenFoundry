import type { ObjectInstance } from '@/lib/api/ontology';

export type FreeFormAnalysisCardKind =
  | 'table'
  | 'metric'
  | 'filter'
  | 'bar_chart'
  | 'line_chart'
  | 'pie_chart'
  | 'text';

export type FreeFormAnalysisMetric = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'approx_unique';
export type FreeFormAnalysisFilterOperator = 'contains' | 'equals' | 'gte' | 'lte' | 'gt' | 'lt' | 'not_equals';

export interface FreeFormAnalysisCard {
  id: string;
  kind: FreeFormAnalysisCardKind;
  title: string;
  property?: string;
  metric?: FreeFormAnalysisMetric;
  value?: unknown;
  columns?: string[];
  category_property?: string;
  value_property?: string;
  operator?: FreeFormAnalysisFilterOperator;
  content?: string;
}

export interface FreeFormAnalysisProps {
  sourceVariableId: string;
  objectTypeId: string;
  outputVariableId: string;
  emptyStateHeader: string;
  emptyStateDescription: string;
  enablePathSaving: boolean;
  maxRows: number;
  cards: FreeFormAnalysisCard[];
}

export interface FreeFormMetricResult {
  value: number | null;
  displayValue: string;
  label: string;
}

export interface FreeFormChartBucket {
  category: string;
  value: number;
  objects: ObjectInstance[];
}

const DEFAULT_MAX_ROWS = 5000;

export function readFreeFormAnalysisProps(raw: Record<string, unknown> | null | undefined): FreeFormAnalysisProps {
  const props = raw ?? {};
  const cards = Array.isArray(props.cards)
    ? props.cards.map(readCard).filter((entry): entry is FreeFormAnalysisCard => entry !== null)
    : [];
  return {
    sourceVariableId: stringProp(props, 'source_variable_id'),
    objectTypeId: stringProp(props, 'object_type_id'),
    outputVariableId: stringProp(props, 'output_variable_id'),
    emptyStateHeader: stringProp(props, 'empty_state_header') || 'Start a free-form analysis',
    emptyStateDescription: stringProp(props, 'empty_state_description') || 'Add filters, tables, metrics, and charts against this app-bounded object set.',
    enablePathSaving: props.enable_path_saving === true,
    maxRows: clampMaxRows(props.max_rows),
    cards,
  };
}

export function makeFreeFormAnalysisCard(kind: FreeFormAnalysisCardKind, properties: string[] = []): FreeFormAnalysisCard {
  const first = properties[0] ?? '';
  const numeric = properties[1] ?? first;
  const id = `card_${kind}_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`;
  if (kind === 'filter') {
    return { id, kind, title: 'Filter object set', property: first, operator: 'contains', value: '' };
  }
  if (kind === 'metric') {
    return { id, kind, title: 'Metric card', metric: 'count', property: numeric };
  }
  if (kind === 'bar_chart' || kind === 'line_chart' || kind === 'pie_chart') {
    return { id, kind, title: chartTitle(kind), metric: 'count', category_property: first, value_property: numeric };
  }
  if (kind === 'text') {
    return { id, kind, title: 'Text card', content: 'Add analysis notes here.' };
  }
  return { id, kind: 'table', title: 'Object table', columns: properties.slice(0, 5) };
}

export function applyFreeFormAnalysisFilters(
  rows: ObjectInstance[],
  cards: FreeFormAnalysisCard[],
  search = '',
): ObjectInstance[] {
  const filterCards = cards.filter((card) => card.kind === 'filter' && card.property);
  const normalizedSearch = normalize(search);
  return rows.filter((row) => {
    if (normalizedSearch && !objectMatchesSearch(row, normalizedSearch)) return false;
    return filterCards.every((card) => objectMatchesCardFilter(row, card));
  });
}

export function buildFreeFormMetric(rows: ObjectInstance[], card: FreeFormAnalysisCard): FreeFormMetricResult {
  const metric = card.metric ?? 'count';
  const label = card.title || metricLabel(metric);
  if (metric === 'count') {
    return { value: rows.length, displayValue: formatNumber(rows.length), label };
  }
  const property = card.property || card.value_property || '';
  if (!property) return { value: null, displayValue: 'No property', label };
  if (metric === 'approx_unique') {
    const value = new Set(rows.map((row) => stringify(row.properties?.[property])).filter(Boolean)).size;
    return { value, displayValue: formatNumber(value), label };
  }
  const values = rows.map((row) => numberValue(row.properties?.[property])).filter((entry): entry is number => entry !== null);
  if (values.length === 0) return { value: null, displayValue: 'No data', label };
  let value: number;
  if (metric === 'sum') value = values.reduce((sum, entry) => sum + entry, 0);
  else if (metric === 'avg') value = values.reduce((sum, entry) => sum + entry, 0) / values.length;
  else if (metric === 'min') value = Math.min(...values);
  else if (metric === 'max') value = Math.max(...values);
  else value = values.length;
  return { value, displayValue: formatNumber(value), label };
}

export function buildFreeFormChartBuckets(rows: ObjectInstance[], card: FreeFormAnalysisCard): FreeFormChartBucket[] {
  const categoryProperty = card.category_property || card.property || '';
  if (!categoryProperty) return [];
  const buckets = new Map<string, ObjectInstance[]>();
  for (const row of rows) {
    const category = stringify(row.properties?.[categoryProperty]) || 'No value';
    const current = buckets.get(category) ?? [];
    current.push(row);
    buckets.set(category, current);
  }
  return [...buckets.entries()]
    .map(([category, objects]) => ({
      category,
      objects,
      value: buildFreeFormMetric(objects, {
        ...card,
        metric: card.metric ?? 'count',
        property: card.value_property || card.property,
      }).value ?? 0,
    }))
    .sort((a, b) => b.value - a.value || a.category.localeCompare(b.category, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, 40);
}

function readCard(raw: unknown): FreeFormAnalysisCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const kind = stringProp(record, 'kind') as FreeFormAnalysisCardKind;
  if (!isCardKind(kind)) return null;
  return {
    id: stringProp(record, 'id') || `card_${kind}`,
    kind,
    title: stringProp(record, 'title') || cardFallbackTitle(kind),
    property: optionalString(record, 'property'),
    metric: readMetric(record.metric),
    value: record.value,
    columns: Array.isArray(record.columns) ? record.columns.map(String).filter(Boolean) : undefined,
    category_property: optionalString(record, 'category_property'),
    value_property: optionalString(record, 'value_property'),
    operator: readOperator(record.operator),
    content: optionalString(record, 'content'),
  };
}

function objectMatchesCardFilter(row: ObjectInstance, card: FreeFormAnalysisCard): boolean {
  const actual = row.properties?.[card.property ?? ''];
  const expected = card.value;
  const operator = card.operator ?? 'contains';
  if (operator === 'equals') return normalize(actual) === normalize(expected);
  if (operator === 'not_equals') return normalize(actual) !== normalize(expected);
  if (operator === 'gte') return compare(actual, expected) >= 0;
  if (operator === 'lte') return compare(actual, expected) <= 0;
  if (operator === 'gt') return compare(actual, expected) > 0;
  if (operator === 'lt') return compare(actual, expected) < 0;
  return normalize(actual).includes(normalize(expected));
}

function objectMatchesSearch(row: ObjectInstance, search: string): boolean {
  if (normalize(row.id).includes(search) || normalize(row.object_type_id).includes(search)) return true;
  return Object.values(row.properties ?? {}).some((value) => normalize(value).includes(search));
}

function compare(actual: unknown, expected: unknown): number {
  const left = numberValue(actual);
  const right = numberValue(expected);
  if (left !== null && right !== null) return left === right ? 0 : left > right ? 1 : -1;
  return normalize(actual).localeCompare(normalize(expected), undefined, { numeric: true, sensitivity: 'base' });
}

function clampMaxRows(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_ROWS;
  return Math.max(1, Math.min(10000, Math.floor(parsed)));
}

function readMetric(value: unknown): FreeFormAnalysisMetric | undefined {
  return ['count', 'sum', 'avg', 'min', 'max', 'approx_unique'].includes(String(value)) ? value as FreeFormAnalysisMetric : undefined;
}

function readOperator(value: unknown): FreeFormAnalysisFilterOperator | undefined {
  return ['contains', 'equals', 'gte', 'lte', 'gt', 'lt', 'not_equals'].includes(String(value)) ? value as FreeFormAnalysisFilterOperator : undefined;
}

function isCardKind(value: string): value is FreeFormAnalysisCardKind {
  return ['table', 'metric', 'filter', 'bar_chart', 'line_chart', 'pie_chart', 'text'].includes(value);
}

function stringProp(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? record[key].trim() : '';
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = stringProp(record, key);
  return value || undefined;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: unknown): string {
  return stringify(value).toLowerCase().trim();
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

function metricLabel(metric: FreeFormAnalysisMetric): string {
  if (metric === 'approx_unique') return 'Approx unique';
  return metric[0].toUpperCase() + metric.slice(1);
}

function chartTitle(kind: FreeFormAnalysisCardKind): string {
  if (kind === 'line_chart') return 'Line chart';
  if (kind === 'pie_chart') return 'Pie chart';
  return 'Bar chart';
}

function cardFallbackTitle(kind: FreeFormAnalysisCardKind): string {
  if (kind === 'filter') return 'Filter object set';
  if (kind === 'metric') return 'Metric card';
  if (kind === 'text') return 'Text card';
  if (kind === 'table') return 'Object table';
  return chartTitle(kind);
}
