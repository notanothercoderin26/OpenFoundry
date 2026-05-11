import { describe, expect, it } from 'vitest';

import {
  objectTypeAPIName,
  objectTypeGeoPointPropertyNames,
  objectTypeGeoShapePropertyNames,
  objectTypePluralDisplayName,
  objectTypePrimaryKey,
  objectTypeRID,
  objectTypeSearchablePropertyNames,
  objectTypeTitleProperty,
  propertyTypeMetadata,
  type ObjectType,
  type Property,
} from './ontology';

const now = '2026-05-11T00:00:00Z';

function property(overrides: Partial<Property>): Property {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    object_type_id: overrides.object_type_id ?? 'Trail',
    name: overrides.name ?? 'label',
    display_name: overrides.display_name ?? overrides.name ?? 'Label',
    description: overrides.description ?? '',
    property_type: overrides.property_type ?? 'string',
    required: overrides.required ?? false,
    unique_constraint: overrides.unique_constraint ?? false,
    time_dependent: overrides.time_dependent ?? false,
    default_value: overrides.default_value ?? null,
    validation_rules: overrides.validation_rules ?? null,
    inline_edit_config: overrides.inline_edit_config ?? null,
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    ...overrides,
  };
}

function objectType(overrides: Partial<ObjectType> = {}): ObjectType {
  return {
    id: 'Trail',
    name: 'Trail',
    display_name: 'Trail',
    description: '',
    primary_key_property: 'id',
    icon: 'walk',
    color: '#0f766e',
    owner_id: 'test',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('ontology object type metadata helpers', () => {
  it('keeps stable aliases for Foundry-like metadata', () => {
    const type = objectType({
      properties: [
        property({ name: 'label', property_type: 'string' }),
        property({ name: 'trailhead', property_type: 'geopoint' }),
        property({ name: 'route', property_type: 'geojson' }),
      ],
      title_property: 'label',
    });

    expect(objectTypeRID(type)).toBe('ri.ontology.main.object-type.Trail');
    expect(objectTypeAPIName(type)).toBe('Trail');
    expect(objectTypePluralDisplayName(type)).toBe('Trails');
    expect(objectTypePrimaryKey(type)).toBe('id');
    expect(objectTypeTitleProperty(type)).toBe('label');
    expect(objectTypeSearchablePropertyNames(type)).toEqual(['label', 'id']);
    expect(objectTypeGeoPointPropertyNames(type)).toEqual(['trailhead']);
    expect(objectTypeGeoShapePropertyNames(type)).toEqual(['route']);
  });

  it('honors backend-provided metadata over derived fallbacks', () => {
    const type = objectType({
      rid: 'ri.custom.object-type.trail',
      api_name: 'TrailApi',
      plural_display_name: 'Trailheads',
      primary_key: 'trail_id',
      title_property: 'trail_name',
      searchable_property_names: ['trail_name'],
      geopoint_property_names: ['start_point'],
      geoshape_property_names: ['route_shape'],
    });

    expect(objectTypeRID(type)).toBe('ri.custom.object-type.trail');
    expect(objectTypeAPIName(type)).toBe('TrailApi');
    expect(objectTypePluralDisplayName(type)).toBe('Trailheads');
    expect(objectTypePrimaryKey(type)).toBe('trail_id');
    expect(objectTypeTitleProperty(type)).toBe('trail_name');
    expect(objectTypeSearchablePropertyNames(type)).toEqual(['trail_name']);
    expect(objectTypeGeoPointPropertyNames(type)).toEqual(['start_point']);
    expect(objectTypeGeoShapePropertyNames(type)).toEqual(['route_shape']);
  });
});

describe('ontology property metadata helpers', () => {
  it('derives base type semantics for advanced property types', () => {
    expect(propertyTypeMetadata(property({ property_type: 'geopoint' }))).toMatchObject({
      base_type: 'geopoint',
      type_family: 'geospatial',
      value_shape: 'lat-lon-object',
      filterable: true,
      sortable: false,
    });
    expect(propertyTypeMetadata(property({ property_type: 'geojson' }))).toMatchObject({
      base_type: 'geoshape',
      type_family: 'geospatial',
    });
    expect(propertyTypeMetadata(property({ property_type: 'vector' }))).toMatchObject({
      base_type: 'vector',
      type_family: 'semantic',
      array_allowed: false,
    });
    expect(propertyTypeMetadata(property({ property_type: 'time_series' }))).toMatchObject({
      base_type: 'time_series',
      type_family: 'timeseries',
      array_allowed: false,
    });
  });

  it('honors backend-provided property metadata', () => {
    const metadata = propertyTypeMetadata(property({
      property_type: 'string',
      base_type: 'media_reference',
      type_family: 'media',
      type_display_name: 'Media reference',
      value_shape: 'media-reference',
      array_allowed: true,
      searchable: false,
      filterable: true,
      sortable: false,
      aggregatable: false,
      semantic_hints: ['media'],
    }));

    expect(metadata.base_type).toBe('media_reference');
    expect(metadata.type_family).toBe('media');
    expect(metadata.semantic_hints).toEqual(['media']);
  });
});
