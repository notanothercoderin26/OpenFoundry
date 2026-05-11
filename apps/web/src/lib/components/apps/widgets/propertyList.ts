import type { ObjectInstance, Property } from '@/lib/api/ontology';

export interface PropertyListItemLike {
  id?: string;
  property_names?: string[];
}

export interface PropertyListFormatConfig {
  kind?: 'auto' | 'text' | 'number' | 'percent' | 'date' | 'datetime' | 'boolean' | 'json';
  precision?: number;
  prefix?: string;
  suffix?: string;
  empty_value?: string;
}

export interface PropertyListPropsLike {
  items?: PropertyListItemLike[];
  properties?: string[];
  hide_nulls?: boolean;
  formats?: Record<string, PropertyListFormatConfig>;
}

export interface PropertyListDisplayEntry {
  name: string;
  label: string;
  value: string;
  rawValue: unknown;
  isNull: boolean;
  property?: Property;
}

export function readPropertyListPropertyNames(props: PropertyListPropsLike | null | undefined): string[] {
  if (!props) return [];
  const fromItems = Array.isArray(props.items)
    ? props.items.flatMap((item) => Array.isArray(item.property_names) ? item.property_names : [])
    : [];
  const source = fromItems.length > 0 ? fromItems : (Array.isArray(props.properties) ? props.properties : []);
  return uniquePropertyNames(source);
}

export function buildPropertyListEntries({
  props,
  properties,
  object,
}: {
  props: PropertyListPropsLike | null | undefined;
  properties: Property[];
  object: ObjectInstance | null;
}): PropertyListDisplayEntry[] {
  const propertyByName = new Map(properties.map((property) => [property.name, property]));
  const formats = props?.formats ?? {};
  return readPropertyListPropertyNames(props).map((name) => {
    const property = propertyByName.get(name);
    const rawValue = object?.properties?.[name];
    const isNull = propertyListValueIsNull(rawValue);
    return {
      name,
      label: property?.display_name || name,
      value: formatPropertyListValue(rawValue, property, formats[name]),
      rawValue,
      isNull,
      property,
    };
  }).filter((entry) => !props?.hide_nulls || !entry.isNull);
}

export function propertyListValueIsNull(value: unknown) {
  return value === null || value === undefined || value === '';
}

export function formatPropertyListValue(
  value: unknown,
  property?: Property | null,
  format?: PropertyListFormatConfig,
) {
  if (propertyListValueIsNull(value)) return format?.empty_value ?? '—';
  const kind = format?.kind && format.kind !== 'auto' ? format.kind : inferredFormatKind(property, value);
  const prefix = format?.prefix ?? '';
  const suffix = format?.suffix ?? '';
  const precision = typeof format?.precision === 'number' ? Math.max(0, Math.min(8, Math.floor(format.precision))) : undefined;
  let rendered: string;
  switch (kind) {
    case 'number':
      rendered = formatNumber(value, precision);
      break;
    case 'percent':
      rendered = `${formatNumber(Number(value) * 100, precision ?? 1)}%`;
      break;
    case 'boolean':
      rendered = booleanValue(value) ? 'True' : 'False';
      break;
    case 'date':
      rendered = formatDateLike(value, false);
      break;
    case 'datetime':
      rendered = formatDateLike(value, true);
      break;
    case 'json':
      rendered = formatJson(value);
      break;
    default:
      rendered = formatText(value);
      break;
  }
  return `${prefix}${rendered}${suffix}`;
}

function uniquePropertyNames(values: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function inferredFormatKind(property: Property | null | undefined, value: unknown): NonNullable<PropertyListFormatConfig['kind']> {
  const type = property?.property_type?.toLowerCase() ?? '';
  if (type.includes('bool') || typeof value === 'boolean') return 'boolean';
  if (type.includes('date') && !type.includes('time')) return 'date';
  if (type.includes('time') || type.includes('timestamp')) return 'datetime';
  if (['integer', 'long', 'short', 'byte', 'double', 'float', 'decimal', 'number'].some((entry) => type.includes(entry)) || typeof value === 'number') return 'number';
  if (typeof value === 'object') return 'json';
  return 'text';
}

function formatNumber(value: unknown, precision?: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (precision !== undefined) return numeric.toFixed(precision);
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(4).replace(/\.?0+$/, '');
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

function formatDateLike(value: unknown, includeTime: boolean) {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const iso = date.toISOString();
  return includeTime ? iso.slice(0, 16).replace('T', ' ') : iso.slice(0, 10);
}

function formatJson(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatText).join(', ');
  return JSON.stringify(value);
}

function formatText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatText).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
