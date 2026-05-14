import type { EvaluationSuiteColumn, EvaluationTestCase } from '@/lib/api/evals';
import type { ObjectInstance } from '@/lib/api/ontology';

export type EvaluationObjectSetRefreshMode = 'snapshot' | 'refresh';

export type EvaluationObjectSetColumnMappingKind =
  | 'backing_object'
  | 'object_property'
  | 'linked_object'
  | 'linked_object_set'
  | 'linked_property'
  | 'static_value';

export type EvaluationObjectSetRow = ObjectInstance | Record<string, unknown>;

export interface EvaluationObjectSetColumnMapping {
  columnApiName: string;
  kind: EvaluationObjectSetColumnMappingKind;
  propertyApiName?: string;
  linkPath?: string[];
  linkedPropertyApiName?: string;
  staticValue?: unknown;
}

export interface EvaluationObjectSetBacking {
  id: string;
  objectSetId: string;
  objectSetName: string;
  objectTypeId: string;
  refreshMode: EvaluationObjectSetRefreshMode;
  rowLimit?: number;
  mappings: EvaluationObjectSetColumnMapping[];
  snapshotRows?: EvaluationObjectSetRow[];
  lastRefreshedAtIso?: string;
}

export interface ObjectSetBackedRecomputeResult {
  testCases: EvaluationTestCase[];
  objectSetBackings: EvaluationObjectSetBacking[];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function objectId(row: EvaluationObjectSetRow) {
  const record = row as Record<string, unknown>;
  return String(record.id ?? record.objectId ?? record.object_id ?? record.rid ?? 'object');
}

function objectTypeId(row: EvaluationObjectSetRow, fallback: string) {
  const record = row as Record<string, unknown>;
  return String(record.object_type_id ?? record.objectTypeId ?? record.type ?? fallback);
}

function objectProperties(value: unknown): Record<string, unknown> {
  const record = recordValue(value);
  const properties = recordValue(record?.properties);
  return properties ?? record ?? {};
}

function objectReference(value: unknown, fallbackObjectTypeId: string) {
  const record = recordValue(value);
  if (!record) return value;
  return {
    id: String(record.id ?? record.objectId ?? record.object_id ?? record.rid ?? ''),
    objectTypeId: String(record.objectTypeId ?? record.object_type_id ?? record.type ?? fallbackObjectTypeId),
    properties: objectProperties(record),
  };
}

function linkedContainer(row: EvaluationObjectSetRow) {
  const record = row as Record<string, unknown>;
  return recordValue(record.links) ?? recordValue(record.linkedObjects) ?? recordValue(record.linked_objects) ?? {};
}

function resolveLinkedValue(row: EvaluationObjectSetRow, linkPath: string[] | undefined): unknown {
  if (!linkPath || linkPath.length === 0) return undefined;
  let value: unknown = linkedContainer(row);
  for (const segment of linkPath) {
    const record = recordValue(value);
    if (!record) return undefined;
    value = record[segment];
  }
  return value;
}

function propertyValue(row: EvaluationObjectSetRow, propertyApiName: string | undefined) {
  if (!propertyApiName) return undefined;
  return objectProperties(row)[propertyApiName];
}

function valueForMapping(row: EvaluationObjectSetRow, backing: EvaluationObjectSetBacking, mapping: EvaluationObjectSetColumnMapping) {
  if (mapping.kind === 'backing_object') return objectReference(row, backing.objectTypeId);
  if (mapping.kind === 'object_property') return propertyValue(row, mapping.propertyApiName);
  if (mapping.kind === 'static_value') return mapping.staticValue;
  const linkedValue = resolveLinkedValue(row, mapping.linkPath);
  if (mapping.kind === 'linked_object') return objectReference(linkedValue, '');
  if (mapping.kind === 'linked_object_set') {
    const values = Array.isArray(linkedValue) ? linkedValue : linkedValue === undefined ? [] : [linkedValue];
    return values.map((value) => objectReference(value, ''));
  }
  if (mapping.kind === 'linked_property') {
    if (Array.isArray(linkedValue)) {
      return linkedValue.map((value) => objectProperties(value)[mapping.linkedPropertyApiName ?? mapping.propertyApiName ?? '']);
    }
    return objectProperties(linkedValue)[mapping.linkedPropertyApiName ?? mapping.propertyApiName ?? ''];
  }
  return undefined;
}

function fallbackValueForColumn(column: EvaluationSuiteColumn): unknown {
  if (column.role === 'metadata') return undefined;
  switch (String(column.type).toLowerCase()) {
    case 'integer':
    case 'long':
    case 'short':
      return 0;
    case 'double':
    case 'float':
    case 'numeric':
      return 0;
    case 'boolean':
    case 'bool':
      return false;
    case 'object_list':
    case 'object_set':
    case 'list':
    case 'array':
      return [];
    case 'object':
    case 'json':
      return {};
    default:
      return '';
  }
}

function testCaseName(row: EvaluationObjectSetRow, index: number) {
  const properties = objectProperties(row);
  const name = properties.name ?? properties.title ?? properties.displayName ?? properties.display_name;
  return name ? String(name) : `Object set row ${index + 1}`;
}

export function validateObjectSetColumnMappings(backing: EvaluationObjectSetBacking, columns: EvaluationSuiteColumn[]): string[] {
  const issues: string[] = [];
  const columnsByName = new Map(columns.map((column) => [column.apiName, column]));
  const seen = new Set<string>();
  backing.mappings.forEach((mapping) => {
    const column = columnsByName.get(mapping.columnApiName);
    if (!column) issues.push(`${backing.objectSetName} maps unknown column ${mapping.columnApiName}.`);
    if (seen.has(mapping.columnApiName)) issues.push(`${backing.objectSetName} maps column ${mapping.columnApiName} more than once.`);
    seen.add(mapping.columnApiName);
    if (mapping.kind === 'object_property' && !mapping.propertyApiName) issues.push(`${mapping.columnApiName} needs a backing object property.`);
    if (['linked_object', 'linked_object_set', 'linked_property'].includes(mapping.kind) && (!mapping.linkPath || mapping.linkPath.length === 0)) {
      issues.push(`${mapping.columnApiName} needs a linked object path.`);
    }
    if (mapping.kind === 'linked_property' && !mapping.linkedPropertyApiName && !mapping.propertyApiName) {
      issues.push(`${mapping.columnApiName} needs a linked property.`);
    }
    if (mapping.kind === 'backing_object' && column && column.type !== 'object' && column.type !== 'json') {
      issues.push(`${mapping.columnApiName} must be an object/json column for backing object mappings.`);
    }
    if (mapping.kind === 'linked_object_set' && column && !['object_set', 'object_list', 'array', 'list', 'json'].includes(String(column.type))) {
      issues.push(`${mapping.columnApiName} must be an object set/list/json column.`);
    }
  });
  columns
    .filter((column) => column.role !== 'metadata')
    .forEach((column) => {
      if (!seen.has(column.apiName)) issues.push(`${backing.objectSetName} is missing a mapping for required column ${column.apiName}.`);
    });
  return issues;
}

export function buildObjectSetBackedTestCases({
  backing,
  columns,
  rows,
  now = new Date(),
}: {
  backing: EvaluationObjectSetBacking;
  columns: EvaluationSuiteColumn[];
  rows: EvaluationObjectSetRow[];
  now?: Date;
}): EvaluationTestCase[] {
  const columnNames = new Set(columns.map((column) => column.apiName));
  const limitedRows = rows.slice(0, Math.max(0, Math.floor(backing.rowLimit ?? rows.length)));
  return limitedRows.map((row, index) => {
    const values = Object.fromEntries(columns.map((column) => [column.apiName, fallbackValueForColumn(column)]));
    backing.mappings.forEach((mapping) => {
      if (columnNames.has(mapping.columnApiName)) values[mapping.columnApiName] = valueForMapping(row, backing, mapping);
    });
    const compactValues = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
    const rowId = objectId(row);
    const name = testCaseName(row, index);
    return {
      id: `object-set-${backing.id}-${rowId}`,
      name,
      source: 'object_set',
      object_set_backing_id: backing.id,
      values: compactValues,
      metadata: {
        source_surface: 'object_set',
        object_set_id: backing.objectSetId,
        object_set_name: backing.objectSetName,
        object_set_backing_id: backing.id,
        object_id: rowId,
        object_type_id: objectTypeId(row, backing.objectTypeId),
        refresh_mode: backing.refreshMode,
        refreshed_at: now.toISOString(),
      },
      generated_name_hint: name,
    };
  });
}

export function recomputeObjectSetBackedTestCases({
  existingTestCases,
  objectSetBackings,
  columns,
  rowsByObjectSetId,
  forceRefreshBackingIds = [],
  now = new Date(),
}: {
  existingTestCases: EvaluationTestCase[];
  objectSetBackings: EvaluationObjectSetBacking[];
  columns: EvaluationSuiteColumn[];
  rowsByObjectSetId: Record<string, EvaluationObjectSetRow[]>;
  forceRefreshBackingIds?: string[];
  now?: Date;
}): ObjectSetBackedRecomputeResult {
  const forceRefresh = new Set(forceRefreshBackingIds);
  const manualCases = existingTestCases.filter((testCase) => testCase.source !== 'object_set');
  const objectSetCasesByBacking = new Map<string, EvaluationTestCase[]>();
  existingTestCases
    .filter((testCase) => testCase.source === 'object_set')
    .forEach((testCase) => {
      const backingId = String(testCase.object_set_backing_id ?? testCase.objectSetBackingId ?? testCase.metadata?.object_set_backing_id ?? '');
      if (!backingId) return;
      objectSetCasesByBacking.set(backingId, [...(objectSetCasesByBacking.get(backingId) ?? []), testCase]);
    });
  const nextBackings = objectSetBackings.map((backing) => {
    const existingForBacking = objectSetCasesByBacking.get(backing.id) ?? [];
    const shouldKeepSnapshot = backing.refreshMode === 'snapshot' && existingForBacking.length > 0 && !forceRefresh.has(backing.id);
    if (shouldKeepSnapshot) return backing;
    const rows = rowsByObjectSetId[backing.objectSetId] ?? backing.snapshotRows ?? [];
    return {
      ...backing,
      snapshotRows: backing.refreshMode === 'snapshot' ? rows : backing.snapshotRows,
      lastRefreshedAtIso: now.toISOString(),
    };
  });
  const objectSetCases = nextBackings.flatMap((backing) => {
    const existingForBacking = objectSetCasesByBacking.get(backing.id) ?? [];
    if (backing.refreshMode === 'snapshot' && existingForBacking.length > 0 && !forceRefresh.has(backing.id)) return existingForBacking;
    const rows = rowsByObjectSetId[backing.objectSetId] ?? backing.snapshotRows ?? [];
    return buildObjectSetBackedTestCases({ backing, columns, rows, now });
  });
  return {
    testCases: [...manualCases, ...objectSetCases],
    objectSetBackings: nextBackings,
  };
}
