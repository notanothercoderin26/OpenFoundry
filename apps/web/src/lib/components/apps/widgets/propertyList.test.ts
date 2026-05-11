import { describe, expect, it } from 'vitest';

import type { ObjectInstance, Property } from '@/lib/api/ontology';

import { createWorkshopVariableEngine, type WorkshopVariableLike } from './workshopVariables';
import { buildPropertyListEntries, formatPropertyListValue, readPropertyListPropertyNames } from './propertyList';

const now = '2026-05-11T00:00:00Z';

function property(name: string, displayName: string, propertyType: string): Property {
  return {
    id: `prop-${name}`,
    object_type_id: 'Trail',
    name,
    display_name: displayName,
    description: '',
    property_type: propertyType,
    required: false,
    unique_constraint: false,
    time_dependent: false,
    default_value: null,
    validation_rules: null,
    created_at: now,
    updated_at: now,
  };
}

function trail(): ObjectInstance {
  return {
    id: 'trail-1',
    object_type_id: 'Trail',
    properties: {
      label: 'Mesa Trail',
      miles: 6.07,
      opened_on: '2026-05-11T07:30:00Z',
      visited: true,
      notes: null,
    },
    created_by: 'test',
    created_at: now,
    updated_at: now,
  };
}

describe('Property List helpers', () => {
  it('builds formatted entries from a selected object variable and hides null properties', () => {
    const variables: WorkshopVariableLike[] = [
      { id: 'trail-active', kind: 'object_set_active_object', name: 'Active trail', object_type_id: 'Trail' },
    ];
    const selectedTrail = trail();
    const engine = createWorkshopVariableEngine(variables, {
      activeObjects: { 'trail-active': selectedTrail },
    });
    const entries = buildPropertyListEntries({
      props: {
        properties: ['label', 'miles', 'opened_on', 'visited', 'notes'],
        hide_nulls: true,
      },
      properties: [
        property('label', 'Trail name', 'string'),
        property('miles', 'Distance miles', 'float'),
        property('opened_on', 'Opened on', 'timestamp'),
        property('visited', 'Visited', 'boolean'),
        property('notes', 'Notes', 'string'),
      ],
      object: engine.getActiveObject('trail-active'),
    });

    expect(entries.map((entry) => [entry.label, entry.value])).toEqual([
      ['Trail name', 'Mesa Trail'],
      ['Distance miles', '6.07'],
      ['Opened on', '2026-05-11 07:30'],
      ['Visited', 'True'],
    ]);
  });

  it('prefers item property configuration over flat compatibility properties', () => {
    expect(readPropertyListPropertyNames({
      properties: ['label', 'notes'],
      items: [{ id: 'item-1', property_names: ['miles', 'label', 'miles'] }],
    })).toEqual(['miles', 'label']);
  });

  it('supports explicit basic format overrides', () => {
    expect(formatPropertyListValue(0.8732, property('grade', 'Grade', 'float'), { kind: 'percent', precision: 1 })).toBe('87.3%');
    expect(formatPropertyListValue(null, property('notes', 'Notes', 'string'), { empty_value: 'No notes' })).toBe('No notes');
  });
});
