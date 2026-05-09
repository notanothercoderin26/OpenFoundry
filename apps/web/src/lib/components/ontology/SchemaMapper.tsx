import type { DatasetPreviewResponse } from '@/lib/api/datasets';
import type {
  ObjectType,
  ObjectTypeBindingPropertyMapping,
  Property,
} from '@/lib/api/ontology';
import { Glyph } from '@/lib/components/ui/Glyph';

export type SchemaMapperColumn = NonNullable<DatasetPreviewResponse['columns']>[number];

interface SchemaMapperProps {
  columns: SchemaMapperColumn[];
  rows?: Array<Record<string, unknown>>;
  properties: Property[];
  objectType: ObjectType | null;
  mapping: ObjectTypeBindingPropertyMapping[];
  primaryKeyColumn: string;
  disabled?: boolean;
  onMappingChange: (next: ObjectTypeBindingPropertyMapping[]) => void;
  onPrimaryKeyColumnChange: (column: string) => void;
}

interface MappingIssueInput {
  columns: SchemaMapperColumn[];
  properties: Property[];
  objectType: ObjectType | null;
  mapping: ObjectTypeBindingPropertyMapping[];
  primaryKeyColumn: string;
}

function normalizeSchemaName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function propertyDisplay(property: Property) {
  return `${property.name} (${property.property_type})`;
}

function formatSample(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 80);
  return String(value).slice(0, 80);
}

export function buildAutoMapping(
  columns: SchemaMapperColumn[],
  properties: Property[],
): ObjectTypeBindingPropertyMapping[] {
  const usedTargets = new Set<string>();
  const result: ObjectTypeBindingPropertyMapping[] = [];

  for (const column of columns) {
    const columnKey = normalizeSchemaName(column.name);
    const match = properties.find((property) => {
      if (usedTargets.has(property.name)) return false;
      return (
        normalizeSchemaName(property.name) === columnKey
        || normalizeSchemaName(property.display_name) === columnKey
      );
    });

    if (match) {
      usedTargets.add(match.name);
      result.push({ source_field: column.name, target_property: match.name });
    }
  }

  return result;
}

export function findPrimaryKeyColumn(
  columns: SchemaMapperColumn[],
  objectType: ObjectType | null,
  mapping: ObjectTypeBindingPropertyMapping[],
) {
  const primaryKey = objectType?.primary_key_property;
  if (primaryKey) {
    const mapped = mapping.find((entry) => entry.target_property === primaryKey);
    if (mapped?.source_field) return mapped.source_field;

    const direct = columns.find((column) => normalizeSchemaName(column.name) === normalizeSchemaName(primaryKey));
    if (direct) return direct.name;
  }

  return columns[0]?.name ?? '';
}

export function applyMappingForSource(
  mapping: ObjectTypeBindingPropertyMapping[],
  sourceField: string,
  targetProperty: string,
) {
  const next = mapping.filter((entry) => (
    entry.source_field !== sourceField && entry.target_property !== targetProperty
  ));

  if (!targetProperty) return next;
  return [...next, { source_field: sourceField, target_property: targetProperty }];
}

export function getSchemaMappingIssues({
  columns,
  properties,
  objectType,
  mapping,
  primaryKeyColumn,
}: MappingIssueInput) {
  const issues: string[] = [];
  const columnNames = new Set(columns.map((column) => column.name));
  const propertyNames = new Set(properties.map((property) => property.name));
  const seenTargets = new Set<string>();
  const primaryKeyProperty = objectType?.primary_key_property ?? '';

  if (columns.length === 0) issues.push('Dataset preview has no columns.');
  if (!primaryKeyColumn) issues.push('Select a primary key source column.');
  if (primaryKeyColumn && !columnNames.has(primaryKeyColumn)) {
    issues.push(`Primary key column "${primaryKeyColumn}" is not in the dataset preview.`);
  }
  if (mapping.length === 0) issues.push('Map at least one dataset column.');

  for (const entry of mapping) {
    if (!entry.source_field.trim()) issues.push('A mapped source column is empty.');
    if (!entry.target_property.trim()) issues.push('A mapped target property is empty.');
    if (entry.source_field && !columnNames.has(entry.source_field)) {
      issues.push(`Source column "${entry.source_field}" is not in the dataset preview.`);
    }
    if (entry.target_property && !propertyNames.has(entry.target_property)) {
      issues.push(`Target property "${entry.target_property}" is not on the object type.`);
    }
    if (seenTargets.has(entry.target_property)) {
      issues.push(`Target property "${entry.target_property}" is mapped more than once.`);
    }
    seenTargets.add(entry.target_property);
  }

  if (primaryKeyProperty) {
    const primaryKeyMapping = mapping.find((entry) => entry.target_property === primaryKeyProperty);
    if (!primaryKeyMapping) {
      issues.push(`Map a source column to the primary key property "${primaryKeyProperty}".`);
    } else if (primaryKeyColumn && primaryKeyMapping.source_field !== primaryKeyColumn) {
      issues.push(`Primary key column must be the source mapped to "${primaryKeyProperty}".`);
    }
  }

  return Array.from(new Set(issues));
}

export function SchemaMapper({
  columns,
  rows = [],
  properties,
  objectType,
  mapping,
  primaryKeyColumn,
  disabled = false,
  onMappingChange,
  onPrimaryKeyColumnChange,
}: SchemaMapperProps) {
  const issues = getSchemaMappingIssues({ columns, properties, objectType, mapping, primaryKeyColumn });
  const mappedTargets = new Set(mapping.map((entry) => entry.target_property));
  const requiredUnmapped = properties.filter((property) => property.required && !mappedTargets.has(property.name));

  function autoMap() {
    const next = buildAutoMapping(columns, properties);
    onMappingChange(next);
    onPrimaryKeyColumnChange(findPrimaryKeyColumn(columns, objectType, next));
  }

  function clearMapping() {
    onMappingChange([]);
    onPrimaryKeyColumnChange(columns[0]?.name ?? '');
  }

  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Schema mapper</p>
          <h2 className="of-heading-lg" style={{ marginTop: 4 }}>Columns to properties</h2>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={autoMap} disabled={disabled} className="of-button">
            <Glyph name="sparkles" size={14} />
            Auto-map
          </button>
          <button type="button" onClick={clearMapping} disabled={disabled} className="of-button">
            <Glyph name="x" size={14} />
            Clear
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="of-chip">Columns {columns.length}</span>
        <span className="of-chip">Properties {properties.length}</span>
        <span className="of-chip">Mapped {mapping.length}</span>
        {objectType?.primary_key_property && <span className="of-chip">PK {objectType.primary_key_property}</span>}
      </div>

      {requiredUnmapped.length > 0 && (
        <div className="of-status-warning" style={{ padding: '9px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          Required properties not mapped: {requiredUnmapped.map((property) => property.name).join(', ')}
        </div>
      )}

      {issues.length > 0 && (
        <div className="of-status-danger" style={{ padding: '9px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {issues[0]}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="of-table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ width: 220 }}>Dataset column</th>
              <th style={{ width: 140 }}>Type</th>
              <th>Sample</th>
              <th style={{ width: 260 }}>Object property</th>
              <th style={{ width: 80 }}>PK</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => {
              const current = mapping.find((entry) => entry.source_field === column.name);
              const sample = rows.find((row) => row[column.name] !== undefined)?.[column.name];
              return (
                <tr key={column.name}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{column.name}</td>
                  <td className="of-text-muted">{column.field_type ?? column.data_type ?? 'unknown'}</td>
                  <td className="of-text-muted" style={{ fontFamily: 'var(--font-mono)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatSample(sample)}
                  </td>
                  <td>
                    <select
                      value={current?.target_property ?? ''}
                      onChange={(event) => onMappingChange(applyMappingForSource(mapping, column.name, event.target.value))}
                      disabled={disabled}
                      className="of-input"
                    >
                      <option value="">Skip</option>
                      {properties.map((property) => (
                        <option key={property.id} value={property.name}>{propertyDisplay(property)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="radio"
                      name="schema-mapper-primary-key"
                      checked={primaryKeyColumn === column.name}
                      onChange={() => onPrimaryKeyColumnChange(column.name)}
                      disabled={disabled}
                    />
                  </td>
                </tr>
              );
            })}
            {columns.length === 0 && (
              <tr>
                <td colSpan={5} className="of-text-muted">No preview columns.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
