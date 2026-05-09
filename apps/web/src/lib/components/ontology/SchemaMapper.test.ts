import { describe, expect, it } from 'vitest';

import type { ObjectType, Property } from '@/lib/api/ontology';
import {
  applyMappingForSource,
  buildAutoMapping,
  findPrimaryKeyColumn,
  getSchemaMappingIssues,
  type SchemaMapperColumn,
} from './SchemaMapper';

const COLUMNS: SchemaMapperColumn[] = [
  { name: 'aircraft_id', data_type: 'string' },
  { name: 'tailNumber', data_type: 'string' },
  { name: 'status', data_type: 'string' },
];

const OBJECT_TYPE_ID = '11111111-1111-1111-1111-111111111111';

const PROPERTIES: Property[] = [
  property('aircraft_id', 'Aircraft ID', true),
  property('tail_number', 'Tail Number'),
  property('status', 'Status'),
];

const OBJECT_TYPE: ObjectType = {
  id: OBJECT_TYPE_ID,
  name: 'aircraft',
  display_name: 'Aircraft',
  description: '',
  primary_key_property: 'aircraft_id',
  icon: null,
  color: null,
  owner_id: '22222222-2222-2222-2222-222222222222',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

describe('SchemaMapper helpers', () => {
  it('auto-maps columns to API source_field mappings', () => {
    expect(buildAutoMapping(COLUMNS, PROPERTIES)).toEqual([
      { source_field: 'aircraft_id', target_property: 'aircraft_id' },
      { source_field: 'tailNumber', target_property: 'tail_number' },
      { source_field: 'status', target_property: 'status' },
    ]);
  });

  it('keeps target properties unique when editing a source mapping', () => {
    const next = applyMappingForSource(
      [
        { source_field: 'aircraft_id', target_property: 'aircraft_id' },
        { source_field: 'status', target_property: 'status' },
      ],
      'tailNumber',
      'status',
    );

    expect(next).toEqual([
      { source_field: 'aircraft_id', target_property: 'aircraft_id' },
      { source_field: 'tailNumber', target_property: 'status' },
    ]);
  });

  it('selects the source column mapped to the object primary key', () => {
    const mapping = buildAutoMapping(COLUMNS, PROPERTIES);

    expect(findPrimaryKeyColumn(COLUMNS, OBJECT_TYPE, mapping)).toBe('aircraft_id');
  });

  it('flags mappings that do not project the primary key property', () => {
    const issues = getSchemaMappingIssues({
      columns: COLUMNS,
      properties: PROPERTIES,
      objectType: OBJECT_TYPE,
      mapping: [{ source_field: 'status', target_property: 'status' }],
      primaryKeyColumn: 'aircraft_id',
    });

    expect(issues).toContain('Map a source column to the primary key property "aircraft_id".');
  });
});

function property(name: string, displayName: string, required = false): Property {
  return {
    id: name,
    object_type_id: OBJECT_TYPE_ID,
    name,
    display_name: displayName,
    description: '',
    property_type: 'string',
    required,
    unique_constraint: false,
    time_dependent: false,
    default_value: null,
    validation_rules: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}
