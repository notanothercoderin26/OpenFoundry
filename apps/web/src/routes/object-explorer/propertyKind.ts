// Maps a property_type string from the ontology API onto a coarse
// visual kind so the preview can render a tiny glyph and accessible
// label per row. The mapping is intentionally tolerant: backends emit
// the kind in many forms ("string", "STR", "text", "long", "int64", …)
// so we normalise then bucket.

export type PropertyDisplayKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'timestamp'
  | 'geopoint'
  | 'geoshape'
  | 'attachment'
  | 'reference'
  | 'array'
  | 'unknown';

export function classifyPropertyKind(rawKind: string | null | undefined): PropertyDisplayKind {
  const normalized = (rawKind ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (!normalized) return 'unknown';
  if (normalized.startsWith('array') || normalized.endsWith('_array') || normalized.includes('list')) return 'array';
  if (['boolean', 'bool', 'bit'].includes(normalized)) return 'boolean';
  if (
    ['int', 'integer', 'long', 'short', 'tinyint', 'smallint', 'bigint', 'float', 'double', 'decimal', 'number', 'numeric'].includes(
      normalized,
    ) ||
    /^(int|uint|float|decimal)\d*$/.test(normalized)
  ) {
    return 'number';
  }
  if (['date'].includes(normalized) || normalized.endsWith('_date')) return 'date';
  if (['time'].includes(normalized) || normalized === 'time_of_day') return 'time';
  if (['timestamp', 'datetime', 'instant'].includes(normalized) || normalized.includes('timestamp')) return 'timestamp';
  if (normalized.includes('geopoint') || normalized.includes('geo_point') || normalized === 'point') return 'geopoint';
  if (
    normalized.includes('geoshape') ||
    normalized.includes('geo_shape') ||
    normalized.includes('geometry') ||
    normalized.includes('geojson') ||
    ['polygon', 'multipolygon', 'linestring', 'line_string'].includes(normalized)
  ) {
    return 'geoshape';
  }
  if (normalized.includes('attachment') || normalized.includes('media') || normalized.includes('file')) return 'attachment';
  if (
    normalized.includes('reference') ||
    normalized.includes('object_id') ||
    normalized === 'rid' ||
    normalized === 'uuid'
  ) {
    return 'reference';
  }
  if (normalized === 'string' || normalized === 'str' || normalized === 'text' || normalized.includes('string') || normalized.includes('text')) {
    return 'string';
  }
  return 'unknown';
}

export function propertyKindGlyph(kind: PropertyDisplayKind): string {
  switch (kind) {
    case 'string':
      return '“ ”';
    case 'number':
      return '123';
    case 'boolean':
      return '☑';
    case 'date':
      return '📅';
    case 'time':
      return '⏱';
    case 'timestamp':
      return '🕒';
    case 'geopoint':
      return '◉';
    case 'geoshape':
      return '⬟';
    case 'attachment':
      return '📎';
    case 'reference':
      return '#';
    case 'array':
      return '[ ]';
    case 'unknown':
    default:
      return '·';
  }
}

export function propertyKindLabel(kind: PropertyDisplayKind): string {
  switch (kind) {
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'time':
      return 'Time';
    case 'timestamp':
      return 'Timestamp';
    case 'geopoint':
      return 'Geo point';
    case 'geoshape':
      return 'Geo shape';
    case 'attachment':
      return 'Attachment';
    case 'reference':
      return 'Reference';
    case 'array':
      return 'Array';
    default:
      return 'Property';
  }
}
