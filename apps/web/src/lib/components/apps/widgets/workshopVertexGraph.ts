// Vertex Graph embed widget — props reader + small helpers.
//
// Foundry-native shape: Workshop embeds a saved Vertex graph, graph
// template, or diagram (see Palantir Workshop "Embed Foundry apps"
// reference). The embed is a viewport — building/editing the graph
// happens in the Vertex app itself. Selection sync is user→Workshop
// via `selected_objects`; Workshop→graph is one-directional via the
// `zoom_to` input.

import type { AppWidget } from '@/lib/api/apps';

export type VertexResourceKind = 'static' | 'variable' | 'override_rid';

export interface VertexGraphResourceConfig {
  kind: VertexResourceKind;
  rid: string;
  variableId: string;
  overrideRid: string;
}

export interface VertexGraphPanels {
  legend: boolean;
  series: boolean;
  timeSelection: boolean;
  timeline: boolean;
  layers: boolean;
  selection: boolean;
  search: boolean;
  histogram: boolean;
  info: boolean;
  versionHistory: boolean;
  addObject: boolean;
  subgraphNavigation: boolean;
}

export interface VertexGraphCapabilities {
  readOnly: boolean;
  enableTransitionToVertex: boolean;
  enableExportPng: boolean;
}

export interface VertexGraphScenario {
  loadFromScenario: boolean;
  regenerateAfterApply: boolean;
}

export type VertexGraphAvailableActions = 'all' | 'some' | 'none';

export interface VertexGraphEmbedProps {
  resource: VertexGraphResourceConfig;
  subGraphVariableId: string;
  refreshKeyVariableId: string;
  appendOnParameterChange: boolean;
  scenario: VertexGraphScenario;
  selectedObjectsVariableId: string;
  objectsOnSubgraphVariableId: string;
  zoomToVariableId: string;
  addToSubgraphVariableId: string;
  availableActions: VertexGraphAvailableActions;
  availableActionTypeIds: string[];
  capabilities: VertexGraphCapabilities;
  panels: VertexGraphPanels;
  incompleteInputsMessage: string;
}

const DEFAULT_PANELS: VertexGraphPanels = {
  legend: true,
  series: false,
  timeSelection: false,
  timeline: false,
  layers: false,
  selection: true,
  search: false,
  histogram: false,
  info: true,
  versionHistory: false,
  addObject: false,
  subgraphNavigation: false,
};

const DEFAULT_CAPABILITIES: VertexGraphCapabilities = {
  readOnly: true,
  enableTransitionToVertex: true,
  enableExportPng: false,
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringProp(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

function booleanProp(source: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : fallback;
}

function readResource(value: unknown): VertexGraphResourceConfig {
  const raw = asObject(value);
  const kindRaw = stringProp(raw, 'kind');
  const kind: VertexResourceKind =
    kindRaw === 'variable' || kindRaw === 'override_rid' ? kindRaw : 'static';
  return {
    kind,
    rid: stringProp(raw, 'rid'),
    variableId: stringProp(raw, 'variable_id'),
    overrideRid: stringProp(raw, 'override_rid'),
  };
}

function readPanels(value: unknown): VertexGraphPanels {
  const raw = asObject(value);
  return {
    legend: booleanProp(raw, 'legend', DEFAULT_PANELS.legend),
    series: booleanProp(raw, 'series', DEFAULT_PANELS.series),
    timeSelection: booleanProp(raw, 'time_selection', DEFAULT_PANELS.timeSelection),
    timeline: booleanProp(raw, 'timeline', DEFAULT_PANELS.timeline),
    layers: booleanProp(raw, 'layers', DEFAULT_PANELS.layers),
    selection: booleanProp(raw, 'selection', DEFAULT_PANELS.selection),
    search: booleanProp(raw, 'search', DEFAULT_PANELS.search),
    histogram: booleanProp(raw, 'histogram', DEFAULT_PANELS.histogram),
    info: booleanProp(raw, 'info', DEFAULT_PANELS.info),
    versionHistory: booleanProp(raw, 'version_history', DEFAULT_PANELS.versionHistory),
    addObject: booleanProp(raw, 'add_object', DEFAULT_PANELS.addObject),
    subgraphNavigation: booleanProp(raw, 'subgraph_navigation', DEFAULT_PANELS.subgraphNavigation),
  };
}

function readCapabilities(value: unknown): VertexGraphCapabilities {
  const raw = asObject(value);
  return {
    readOnly: booleanProp(raw, 'read_only', DEFAULT_CAPABILITIES.readOnly),
    enableTransitionToVertex: booleanProp(raw, 'enable_transition_to_vertex', DEFAULT_CAPABILITIES.enableTransitionToVertex),
    enableExportPng: booleanProp(raw, 'enable_export_png', DEFAULT_CAPABILITIES.enableExportPng),
  };
}

function readScenario(value: unknown): VertexGraphScenario {
  const raw = asObject(value);
  return {
    loadFromScenario: booleanProp(raw, 'load_from_scenario'),
    regenerateAfterApply: booleanProp(raw, 'regenerate_after_apply'),
  };
}

function readAvailableActions(value: unknown): VertexGraphAvailableActions {
  return value === 'none' || value === 'some' ? value : 'all';
}

function readActionTypeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function readVertexGraphEmbedProps(raw: Record<string, unknown> | null | undefined): VertexGraphEmbedProps {
  const props = raw ?? {};
  return {
    resource: readResource(props.resource),
    subGraphVariableId: stringProp(props, 'sub_graph_variable_id'),
    refreshKeyVariableId: stringProp(props, 'refresh_key_variable_id'),
    appendOnParameterChange: booleanProp(props, 'append_on_parameter_change'),
    scenario: readScenario(props.scenario),
    selectedObjectsVariableId: stringProp(props, 'selected_objects_variable_id'),
    objectsOnSubgraphVariableId: stringProp(props, 'objects_on_subgraph_variable_id'),
    zoomToVariableId: stringProp(props, 'zoom_to_variable_id'),
    addToSubgraphVariableId: stringProp(props, 'add_to_subgraph_variable_id'),
    availableActions: readAvailableActions(props.available_actions),
    availableActionTypeIds: readActionTypeIds(props.available_action_type_ids),
    capabilities: readCapabilities(props.capabilities),
    panels: readPanels(props.panels),
    incompleteInputsMessage:
      stringProp(props, 'incomplete_inputs_message') || 'Pick a saved Vertex graph in the inspector to render.',
  };
}

// resolveGraphRid resolves the effective Vertex graph RID from the
// widget props + the runtime primitive values map (where string
// variables surface). Static / override paths bypass the variable
// lookup; variable mode pulls the RID from `primitiveValues[id]`.
//
// override_rid takes precedence over static when present, matching the
// Palantir embed semantics ("Override graph RID … replaces template-
// generated graph").
export function resolveGraphRid(
  props: VertexGraphEmbedProps,
  primitiveValues: Record<string, unknown>,
): string {
  const override = props.resource.overrideRid.trim();
  if (override) return override;
  if (props.resource.kind === 'variable' && props.resource.variableId) {
    const value = primitiveValues[props.resource.variableId];
    return typeof value === 'string' ? value : '';
  }
  return props.resource.rid.trim();
}

// graphIdFromRid mirrors the helper inside vertexAnalyses.ts. We
// duplicate the trivial prefix-strip rather than export it because
// that file owns the broader Vertex API surface; keeping the embed
// widget independent of that file's internal helpers prevents
// accidental coupling.
const GRAPH_RID_PREFIX = 'ri.vertex.main.graph.';

export function graphIdFromRid(rid: string): string {
  return rid.startsWith(GRAPH_RID_PREFIX) ? rid.slice(GRAPH_RID_PREFIX.length) : rid;
}

// readRefreshKey returns the runtime value of the configured refresh
// key variable, coerced to a string. The variable's value change
// triggers a re-fetch of the saved graph (per Foundry's "Refresh key"
// semantic: any value change triggers a complete reload).
export function readRefreshKey(
  props: VertexGraphEmbedProps,
  primitiveValues: Record<string, unknown>,
): string {
  if (!props.refreshKeyVariableId) return '';
  const value = primitiveValues[props.refreshKeyVariableId];
  if (value === null || value === undefined) return '';
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
}

// readWidgetProps adapts an AppWidget payload to typed embed props.
// Mirrors the convention used by every other widget in this folder.
export function readWidgetVertexGraphEmbedProps(widget: Pick<AppWidget, 'props'>): VertexGraphEmbedProps {
  return readVertexGraphEmbedProps(widget.props);
}
