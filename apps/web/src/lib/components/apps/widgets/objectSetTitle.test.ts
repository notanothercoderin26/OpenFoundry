import { describe, expect, it } from 'vitest';

import type { ObjectInstance, ObjectType } from '@/lib/api/ontology';

import {
  buildObjectSetTitleModel,
  objectTitle,
  readObjectSetTitleProps,
} from './objectSetTitle';

const now = '2026-05-11T00:00:00Z';

function objectType(overrides: Partial<ObjectType> & Record<string, unknown> = {}): ObjectType {
  return {
    id: 'Trail',
    name: 'Trail',
    display_name: 'Trail',
    description: '',
    primary_key_property: 'id',
    icon: 'run',
    color: '#0f766e',
    owner_id: 'test',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function trail(id: string, label: string): ObjectInstance {
  return {
    id,
    object_type_id: 'Trail',
    properties: { label, difficulty: 'Moderate' },
    created_by: 'test',
    created_at: now,
    updated_at: now,
  };
}

describe('Object Set Title helpers', () => {
  it('renders object-set count title with object type icon metadata', () => {
    const props = readObjectSetTitleProps({ source_variable_id: 'trails' });
    const model = buildObjectSetTitleModel({
      props,
      variableName: 'Trails',
      objectType: objectType({ plural_display_name: 'Trails' }),
      objects: [trail('trail-1', 'Mesa Trail')],
      total: 12,
    });

    expect(model.shouldRender).toBe(true);
    expect(model.title).toBe('12 Trails');
    expect(model.showIcon).toBe(true);
    expect(model.icon).toBe('run');
    expect(model.color).toBe('#0f766e');
  });

  it('renders the single selected object title from title property candidates', () => {
    const props = readObjectSetTitleProps({ contains_single_object: true });
    const model = buildObjectSetTitleModel({
      props,
      variableName: 'Selected trail',
      objectType: objectType({ title_property: 'label' }),
      objects: [trail('trail-1', 'Betasso Preserve')],
      total: 1,
    });

    expect(model.state).toBe('single');
    expect(model.title).toBe('Betasso Preserve');
    expect(model.subtitle).toBe('Trail');
    expect(objectTitle(trail('trail-2', 'Walker Ranch'), objectType({ title_property: 'label' }))).toBe('Walker Ranch');
  });

  it('hides empty object sets by default and renders configured placeholders', () => {
    const hidden = buildObjectSetTitleModel({
      props: readObjectSetTitleProps({}),
      variableName: 'Trails',
      objectType: objectType(),
      objects: [],
      total: 0,
    });
    const placeholder = buildObjectSetTitleModel({
      props: readObjectSetTitleProps({
        contains_single_object: true,
        render_when_empty: true,
        empty_title: 'Select a trail',
        show_icon: false,
      }),
      variableName: 'Selected trail',
      objectType: objectType(),
      objects: [],
      total: 0,
    });

    expect(hidden.shouldRender).toBe(false);
    expect(placeholder.shouldRender).toBe(true);
    expect(placeholder.title).toBe('Select a trail');
    expect(placeholder.state).toBe('empty');
    expect(placeholder.showIcon).toBe(false);
  });

  it('supports explicit title overrides while keeping count context', () => {
    const model = buildObjectSetTitleModel({
      props: readObjectSetTitleProps({ title_override: 'Runnable trails' }),
      variableName: 'Trails',
      objectType: objectType({ plural_display_name: 'Trails' }),
      objects: [trail('trail-1', 'Mesa Trail'), trail('trail-2', 'Walker Ranch')],
      total: 2,
    });

    expect(model.title).toBe('Runnable trails');
    expect(model.subtitle).toBe('2 Trails');
  });
});
