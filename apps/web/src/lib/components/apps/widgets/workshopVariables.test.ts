import { describe, expect, it } from 'vitest';

import type { ObjectInstance } from '@/lib/api/ontology';

import {
  createWorkshopVariableEngine,
  variableFiltersForObjectSet,
  type WorkshopVariableLike,
} from './workshopVariables';

function object(id: string, properties: Record<string, unknown>): ObjectInstance {
  return {
    id,
    object_type_id: 'Trail',
    properties,
    created_by: 'test',
    created_at: '2026-05-11T00:00:00Z',
    updated_at: '2026-05-11T00:00:00Z',
  };
}

describe('Workshop variable engine', () => {
  it('builds dependency graph and recomputes object sets when filter outputs change', () => {
    const variables: WorkshopVariableLike[] = [
      {
        id: 'trail_filter',
        kind: 'filter_output',
        name: 'Trail filter',
        object_type_id: 'Trail',
        source_widget_id: 'filter_widget',
      },
      {
        id: 'filtered_trails',
        kind: 'object_set_definition',
        name: 'Filtered trails',
        object_type_id: 'Trail',
        filter_variable_id: 'trail_filter',
      },
    ];

    const first = createWorkshopVariableEngine(variables, {
      filterValues: {
        difficulty_filter: { search: 'hard' },
      },
      filterMetadata: {
        difficulty_filter: {
          outputVariableId: 'trail_filter',
          sourceWidgetId: 'filter_widget',
          propertyName: 'difficulty',
          component: 'search',
        },
      },
    });

    expect(first.evaluationOrder).toEqual(['trail_filter', 'filtered_trails']);
    expect(first.graph.trail_filter.dependents).toEqual(['filtered_trails']);
    expect(first.getObjectSetFilter('trail_filter')?.filters).toEqual([
      { property_name: 'difficulty', operator: 'contains', value: 'hard' },
    ]);
    expect(variableFiltersForObjectSet(variables[1], first)).toEqual([
      { property_name: 'difficulty', operator: 'contains', value: 'hard' },
    ]);

    const second = createWorkshopVariableEngine(variables, {
      filterValues: {
        difficulty_filter: { search: 'easy' },
      },
      filterMetadata: {
        difficulty_filter: {
          outputVariableId: 'trail_filter',
          sourceWidgetId: 'filter_widget',
          propertyName: 'difficulty',
          component: 'search',
        },
      },
    }, first, ['trail_filter']);

    expect(second.dirtyVariableIds).toEqual(expect.arrayContaining(['trail_filter', 'filtered_trails']));
    expect(second.getObjectSet('filtered_trails')?.filters).toEqual([
      { property_name: 'difficulty', operator: 'contains', value: 'easy' },
    ]);
  });

  it('resolves selected object sets and aggregation variables', () => {
    const variables: WorkshopVariableLike[] = [
      { id: 'selected_trails', kind: 'object_set_selection', name: 'Selected trails', object_type_id: 'Trail' },
      {
        id: 'selected_count',
        kind: 'aggregation',
        name: 'Selected count',
        source_variable_id: 'selected_trails',
        metadata: { metric: 'count' },
      },
      {
        id: 'selected_gain_sum',
        kind: 'aggregation',
        name: 'Selected gain',
        source_variable_id: 'selected_trails',
        metadata: { metric: 'sum', property_name: 'gain_ft' },
      },
    ];

    const engine = createWorkshopVariableEngine(variables, {
      selectedObjectSets: {
        selected_trails: [
          object('trail-1', { gain_ft: 750 }),
          object('trail-2', { gain_ft: 250 }),
        ],
      },
    });

    expect(engine.getSelectedObjectSet('selected_trails').map((entry) => entry.id)).toEqual(['trail-1', 'trail-2']);
    expect(engine.getPrimitive('selected_count')).toBe(2);
    expect(engine.getPrimitive('selected_gain_sum')).toBe(1000);
  });

  it('exposes cached function outputs as primitive values and tracks dependency dirtiness', () => {
    const variables: WorkshopVariableLike[] = [
      { id: 'temperature', kind: 'numeric', name: 'Temperature', object_type_id: '', default_value: 72 },
      {
        id: 'effort_score',
        kind: 'function_output',
        name: 'Effort score',
        object_type_id: 'Trail',
        metadata: {
          function_package_id: '00000000-0000-0000-0000-000000000015',
          parameters: [{ name: 'temperature_f', variable_id: 'temperature' }],
          result_path: 'score',
        },
      },
    ];

    const first = createWorkshopVariableEngine(variables, {
      functionValues: {
        effort_score: { value: 158, status: 'success', cache_key: 'warm' },
      },
    });
    const second = createWorkshopVariableEngine([
      { ...variables[0], default_value: 84 },
      variables[1],
    ], {
      functionValues: {
        effort_score: { value: 158, status: 'success', cache_key: 'warm' },
      },
    }, first, ['temperature']);

    expect(first.graph.temperature.dependents).toEqual(['effort_score']);
    expect(first.getPrimitive('effort_score')).toBe(158);
    expect(first.getValue('effort_score')).toMatchObject({ kind: 'function_output', status: 'success' });
    expect(second.dirtyVariableIds).toEqual(expect.arrayContaining(['temperature', 'effort_score']));
  });

  it('initializes primitive values from URL and runtime parameters', () => {
    const variables: WorkshopVariableLike[] = [
      { id: 'trail_id', kind: 'url_parameter', name: 'Trail ID', metadata: { parameter_name: 'trail' } },
      { id: 'temperature_unit', kind: 'string', name: 'unit', default_value: 'fahrenheit' },
    ];

    const engine = createWorkshopVariableEngine(variables, {
      runtimeParameters: { trail: 'mesa', unit: 'celsius' },
    });

    expect(engine.getPrimitive('trail_id')).toBe('mesa');
    expect(engine.getPrimitive('temperature_unit')).toBe('celsius');
  });

  it('resolves scenario variables with values, baselines, and deltas', () => {
    const variables: WorkshopVariableLike[] = [
      {
        id: 'trail_scenario',
        kind: 'scenario',
        name: 'Trail scenario',
        metadata: {
          parameters: [
            { name: 'demand_multiplier', label: 'Demand multiplier', default_value: '1.0' },
            { name: 'temperature_f', label: 'Temperature', default_value: '70' },
          ],
        },
      },
    ];

    const engine = createWorkshopVariableEngine(variables, {
      primitiveValues: {
        trail_scenario: {
          kind: 'scenario',
          status: 'applied',
          values: { demand_multiplier: '1.25', temperature_f: '84' },
          baseline: { demand_multiplier: '1.0', temperature_f: '70' },
        },
      },
    });

    const scenario = engine.getScenario('trail_scenario');
    expect(engine.getPrimitive('trail_scenario')).toEqual({ demand_multiplier: '1.25', temperature_f: '84' });
    expect(scenario).toMatchObject({
      status: 'applied',
      values: { demand_multiplier: '1.25', temperature_f: '84' },
      baseline: { demand_multiplier: '1.0', temperature_f: '70' },
    });
    expect(scenario?.deltas.demand_multiplier.delta_number).toBe(0.25);
    expect(scenario?.changed_parameter_names).toEqual(['demand_multiplier', 'temperature_f']);
  });

  it('resolves multi-select and range filter outputs for downstream object sets', () => {
    const variables: WorkshopVariableLike[] = [
      {
        id: 'trail_filter',
        kind: 'filter_output',
        name: 'Trail filter',
        object_type_id: 'Trail',
        source_widget_id: 'filter_widget',
      },
      {
        id: 'filtered_trails',
        kind: 'object_set_definition',
        name: 'Filtered trails',
        object_type_id: 'Trail',
        filter_variable_id: 'trail_filter',
      },
    ];

    const engine = createWorkshopVariableEngine(variables, {
      filterValues: {
        difficulty: { values: ['Easy', 'Moderate'] },
        distance: { range_min: '5', range_max: '10' },
      },
      filterMetadata: {
        difficulty: {
          outputVariableId: 'trail_filter',
          sourceWidgetId: 'filter_widget',
          propertyName: 'difficulty',
          component: 'multi_select',
        },
        distance: {
          outputVariableId: 'trail_filter',
          sourceWidgetId: 'filter_widget',
          propertyName: 'distance_miles',
          component: 'range_numeric',
        },
      },
    });

    expect(engine.getObjectSetFilter('trail_filter')?.filters).toEqual([
      { property_name: 'difficulty', operator: 'in', value: ['Easy', 'Moderate'] },
      { property_name: 'distance_miles', operator: 'gte', value: '5' },
      { property_name: 'distance_miles', operator: 'lte', value: '10' },
    ]);
    expect(variableFiltersForObjectSet(variables[1], engine)).toEqual([
      { property_name: 'difficulty', operator: 'in', value: ['Easy', 'Moderate'] },
      { property_name: 'distance_miles', operator: 'gte', value: '5' },
      { property_name: 'distance_miles', operator: 'lte', value: '10' },
    ]);
  });

  it('composes reusable object set filter variables across object sets and runtime widget outputs', () => {
    const variables: WorkshopVariableLike[] = [
      { id: 'difficulty_value', kind: 'string', name: 'Difficulty', default_value: 'hard' },
      {
        id: 'base_filter',
        kind: 'object_set_filter',
        name: 'Base trail filter',
        object_type_id: 'Trail',
        static_filters: [
          { property_name: 'difficulty', operator: 'equals', value_variable_id: 'difficulty_value' },
        ],
      },
      {
        id: 'interactive_filter',
        kind: 'object_set_filter',
        name: 'Interactive trail filter',
        object_type_id: 'Trail',
        source_variable_id: 'base_filter',
        static_filters: [
          { property_name: 'status', operator: 'equals', value: 'open' },
        ],
      },
      {
        id: 'table_trails',
        kind: 'object_set_definition',
        name: 'Table trails',
        object_type_id: 'Trail',
        filter_variable_id: 'interactive_filter',
      },
      {
        id: 'map_trails',
        kind: 'object_set_definition',
        name: 'Map trails',
        object_type_id: 'Trail',
        metadata: { filter_variable_ids: ['interactive_filter'] },
      },
    ];

    const engine = createWorkshopVariableEngine(variables, {
      filterValues: {
        distance_range: { range_min: '5', range_max: '10' },
        chart_selection: { filters: [{ property_name: 'region', operator: 'equals', value: 'Boulder' }] },
      },
      filterMetadata: {
        distance_range: {
          outputVariableId: 'interactive_filter',
          sourceWidgetId: 'filter_widget',
          propertyName: 'distance_miles',
          component: 'range_numeric',
        },
        chart_selection: {
          outputVariableId: 'interactive_filter',
          sourceWidgetId: 'chart_widget',
          component: 'selection',
        },
      },
    });

    const expectedFilters = [
      { property_name: 'difficulty', operator: 'equals', value_variable_id: 'difficulty_value', value: 'hard' },
      { property_name: 'status', operator: 'equals', value: 'open' },
      { property_name: 'distance_miles', operator: 'gte', value: '5' },
      { property_name: 'distance_miles', operator: 'lte', value: '10' },
      { property_name: 'region', operator: 'equals', value: 'Boulder' },
    ];
    expect(engine.graph.difficulty_value.dependents).toEqual(['base_filter']);
    expect(engine.graph.base_filter.dependents).toEqual(['interactive_filter']);
    expect(engine.graph.interactive_filter.dependents).toEqual(expect.arrayContaining(['table_trails', 'map_trails']));
    expect(engine.getObjectSetFilter('interactive_filter')).toMatchObject({
      sourceFilterVariableIds: ['base_filter'],
      objectTypeIds: ['Trail'],
    });
    expect(engine.getObjectSetFilter('interactive_filter')?.filters).toEqual(expectedFilters);
    expect(engine.getObjectSet('table_trails')?.filters).toEqual(expectedFilters);
    expect(engine.getObjectSet('map_trails')?.filters).toEqual(expectedFilters);
  });

  it('reports missing dependencies and cycles', () => {
    const variables: WorkshopVariableLike[] = [
      { id: 'a', kind: 'aggregation', name: 'A', source_variable_id: 'b' },
      { id: 'b', kind: 'aggregation', name: 'B', source_variable_id: 'a' },
      { id: 'c', kind: 'object_set_definition', name: 'C', filter_variable_id: 'missing' },
    ];

    const engine = createWorkshopVariableEngine(variables);

    expect(engine.diagnostics.map((entry) => entry.code)).toEqual(expect.arrayContaining(['cycle', 'missing_dependency']));
    expect(engine.diagnostics.some((entry) => entry.message.includes('missing'))).toBe(true);
  });
});
