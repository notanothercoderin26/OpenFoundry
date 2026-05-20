import { describe, expect, it } from 'vitest';

import {
  graphIdFromRid,
  readRefreshKey,
  readVertexGraphEmbedProps,
  readWidgetVertexGraphEmbedProps,
  resolveGraphRid,
} from './workshopVertexGraph';

describe('vertex_graph_embed props reader', () => {
  it('returns sane defaults when props are missing', () => {
    const props = readVertexGraphEmbedProps(undefined);
    expect(props.resource).toEqual({ kind: 'static', rid: '', variableId: '', overrideRid: '' });
    expect(props.capabilities.readOnly).toBe(true);
    expect(props.capabilities.enableTransitionToVertex).toBe(true);
    expect(props.panels.legend).toBe(true);
    expect(props.panels.selection).toBe(true);
    expect(props.panels.info).toBe(true);
    expect(props.panels.timeline).toBe(false);
    expect(props.availableActions).toBe('all');
    expect(props.availableActionTypeIds).toEqual([]);
    expect(props.scenario.loadFromScenario).toBe(false);
    expect(props.incompleteInputsMessage).toMatch(/saved Vertex graph/i);
  });

  it('reads static resource configuration', () => {
    const props = readVertexGraphEmbedProps({
      resource: { kind: 'static', rid: 'ri.vertex.main.graph.abc' },
      selected_objects_variable_id: 'var_sel',
    });
    expect(props.resource.kind).toBe('static');
    expect(props.resource.rid).toBe('ri.vertex.main.graph.abc');
    expect(props.selectedObjectsVariableId).toBe('var_sel');
  });

  it('reads variable + override resource configuration', () => {
    const props = readVertexGraphEmbedProps({
      resource: {
        kind: 'variable',
        variable_id: 'graph_rid_var',
        override_rid: 'ri.vertex.main.graph.override',
      },
    });
    expect(props.resource.kind).toBe('variable');
    expect(props.resource.variableId).toBe('graph_rid_var');
    expect(props.resource.overrideRid).toBe('ri.vertex.main.graph.override');
  });

  it('falls back to static when resource.kind is unknown', () => {
    const props = readVertexGraphEmbedProps({ resource: { kind: 'banana' } });
    expect(props.resource.kind).toBe('static');
  });

  it('clamps available_actions to {all, some, none}', () => {
    expect(readVertexGraphEmbedProps({ available_actions: 'none' }).availableActions).toBe('none');
    expect(readVertexGraphEmbedProps({ available_actions: 'some' }).availableActions).toBe('some');
    expect(readVertexGraphEmbedProps({ available_actions: 'all' }).availableActions).toBe('all');
    expect(readVertexGraphEmbedProps({ available_actions: 'banana' }).availableActions).toBe('all');
  });

  it('filters non-string entries out of available_action_type_ids', () => {
    const props = readVertexGraphEmbedProps({ available_action_type_ids: ['act_a', 7, null, 'act_b'] });
    expect(props.availableActionTypeIds).toEqual(['act_a', 'act_b']);
  });

  it('respects panel toggles', () => {
    const props = readVertexGraphEmbedProps({
      panels: { legend: false, timeline: true, histogram: true, info: false },
    });
    expect(props.panels.legend).toBe(false);
    expect(props.panels.timeline).toBe(true);
    expect(props.panels.histogram).toBe(true);
    expect(props.panels.info).toBe(false);
    // unspecified panels keep their defaults
    expect(props.panels.selection).toBe(true);
    expect(props.panels.layers).toBe(false);
  });

  it('reads incomplete_inputs_message override', () => {
    const props = readVertexGraphEmbedProps({ incomplete_inputs_message: 'Pick a graph above.' });
    expect(props.incompleteInputsMessage).toBe('Pick a graph above.');
  });
});

describe('vertex_graph_embed resolveGraphRid', () => {
  it('prefers override_rid over static', () => {
    const props = readVertexGraphEmbedProps({
      resource: { kind: 'static', rid: 'ri.vertex.main.graph.static', override_rid: 'ri.vertex.main.graph.over' },
    });
    expect(resolveGraphRid(props, {})).toBe('ri.vertex.main.graph.over');
  });

  it('returns static rid when no override and kind=static', () => {
    const props = readVertexGraphEmbedProps({ resource: { kind: 'static', rid: 'ri.vertex.main.graph.s' } });
    expect(resolveGraphRid(props, {})).toBe('ri.vertex.main.graph.s');
  });

  it('returns the variable value when kind=variable', () => {
    const props = readVertexGraphEmbedProps({ resource: { kind: 'variable', variable_id: 'graph_var' } });
    expect(resolveGraphRid(props, { graph_var: 'ri.vertex.main.graph.v' })).toBe('ri.vertex.main.graph.v');
  });

  it('returns empty when variable value is missing or non-string', () => {
    const props = readVertexGraphEmbedProps({ resource: { kind: 'variable', variable_id: 'graph_var' } });
    expect(resolveGraphRid(props, {})).toBe('');
    expect(resolveGraphRid(props, { graph_var: 42 })).toBe('');
  });

  it('returns empty when nothing is configured', () => {
    const props = readVertexGraphEmbedProps(undefined);
    expect(resolveGraphRid(props, {})).toBe('');
  });
});

describe('vertex_graph_embed graphIdFromRid', () => {
  it('strips ri.vertex.main.graph. prefix', () => {
    expect(graphIdFromRid('ri.vertex.main.graph.abc-123')).toBe('abc-123');
  });
  it('returns the input when no prefix is present', () => {
    expect(graphIdFromRid('abc-123')).toBe('abc-123');
  });
});

describe('vertex_graph_embed readRefreshKey', () => {
  it('returns empty when no variable is configured', () => {
    const props = readVertexGraphEmbedProps(undefined);
    expect(readRefreshKey(props, {})).toBe('');
  });
  it('returns primitive values as strings', () => {
    const props = readVertexGraphEmbedProps({ refresh_key_variable_id: 'key' });
    expect(readRefreshKey(props, { key: 'hello' })).toBe('hello');
    expect(readRefreshKey(props, { key: 7 })).toBe('7');
    expect(readRefreshKey(props, { key: true })).toBe('true');
  });
  it('json-encodes object values', () => {
    const props = readVertexGraphEmbedProps({ refresh_key_variable_id: 'key' });
    expect(readRefreshKey(props, { key: { a: 1 } })).toBe('{"a":1}');
  });
});

describe('vertex_graph_embed readWidgetVertexGraphEmbedProps', () => {
  it('delegates to readVertexGraphEmbedProps via widget.props', () => {
    const props = readWidgetVertexGraphEmbedProps({
      props: { selected_objects_variable_id: 'sel_var', capabilities: { read_only: false } },
    });
    expect(props.selectedObjectsVariableId).toBe('sel_var');
    expect(props.capabilities.readOnly).toBe(false);
  });
});
