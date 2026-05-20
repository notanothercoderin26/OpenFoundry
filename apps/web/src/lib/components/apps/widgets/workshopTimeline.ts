import type { AppWidget } from '@/lib/api/apps';
import type { ObjectInstance } from '@/lib/api/ontology';

export type TimelineOrientation = 'vertical' | 'horizontal';
export type TimelineOrder = 'newest_first' | 'oldest_first';
export type TimelineTitleMode = 'object_title' | 'property' | 'custom';
export type TimelinePropertiesMode = 'prominent' | 'specific';
export type TimelineColorMode = 'default' | 'static' | 'dynamic';
export type TimelineIconMode = 'default' | 'none' | 'custom';
export type TimelineColorRuleOperator = 'equals' | 'in' | 'gte' | 'lte' | 'gt' | 'lt';

export interface TimelineColorRule {
  property_name: string;
  operator: TimelineColorRuleOperator;
  value: unknown;
  color: string;
}

export interface TimelineLayerConfig {
  id: string;
  title: string;
  source_variable_id: string;
  object_type_id: string;
  scenario_variable_id: string;
  date_property: string;
  title_mode: TimelineTitleMode;
  title_property: string;
  custom_title: string;
  properties_mode: TimelinePropertiesMode;
  displayed_properties: string[];
  color_mode: TimelineColorMode;
  color: string;
  color_rules: TimelineColorRule[];
  icon_mode: TimelineIconMode;
  icon: string;
  selection_event_override: string;
}

export interface TimelineWidgetConfig {
  layers: TimelineLayerConfig[];
  orientation: TimelineOrientation;
  order: TimelineOrder;
  show_legend: boolean;
  show_time_between_events: boolean;
  highlight_selection: boolean;
  selected_object_variable_id: string;
  selected_objects_variable_id: string;
  selected_layer_variable_id: string;
  empty_label: string;
  max_events: number;
}

export interface TimelineEvent {
  id: string;
  layerId: string;
  layerTitle: string;
  object: ObjectInstance;
  title: string;
  timestampMs: number;
  color: string;
  icon: string | null;
  selectionEventOverride: string;
  properties: Array<{ name: string; value: unknown }>;
}

const DEFAULT_COLOR = '#2d72d2';
const DEFAULT_ICON = 'calendar';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function normalizeOrientation(value: unknown): TimelineOrientation {
  return value === 'horizontal' ? 'horizontal' : 'vertical';
}

function normalizeOrder(value: unknown): TimelineOrder {
  return value === 'oldest_first' ? 'oldest_first' : 'newest_first';
}

function normalizeTitleMode(value: unknown): TimelineTitleMode {
  if (value === 'property' || value === 'custom') return value;
  return 'object_title';
}

function normalizePropertiesMode(value: unknown): TimelinePropertiesMode {
  return value === 'prominent' ? 'prominent' : 'specific';
}

function normalizeColorMode(value: unknown): TimelineColorMode {
  if (value === 'static' || value === 'dynamic') return value;
  return 'default';
}

function normalizeIconMode(value: unknown): TimelineIconMode {
  if (value === 'none' || value === 'custom') return value;
  return 'default';
}

function normalizeColorRuleOperator(value: unknown): TimelineColorRuleOperator {
  switch (value) {
    case 'in':
    case 'gte':
    case 'lte':
    case 'gt':
    case 'lt':
      return value;
    default:
      return 'equals';
  }
}

function normalizeColorRules(value: unknown): TimelineColorRule[] {
  if (!Array.isArray(value)) return [];
  const out: TimelineColorRule[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const propertyName = readString(entry.property_name);
    const color = readString(entry.color);
    if (!propertyName || !color) continue;
    out.push({
      property_name: propertyName,
      operator: normalizeColorRuleOperator(entry.operator),
      value: entry.value,
      color,
    });
  }
  return out;
}

export function readTimelineLayerConfig(entry: Record<string, unknown>, index: number): TimelineLayerConfig {
  return {
    id: readString(entry.id, `layer-${index + 1}`),
    title: readString(entry.title, `Layer ${index + 1}`),
    source_variable_id: readString(entry.source_variable_id),
    object_type_id: readString(entry.object_type_id),
    scenario_variable_id: readString(entry.scenario_variable_id),
    date_property: readString(entry.date_property),
    title_mode: normalizeTitleMode(entry.title_mode),
    title_property: readString(entry.title_property),
    custom_title: readString(entry.custom_title),
    properties_mode: normalizePropertiesMode(entry.properties_mode),
    displayed_properties: readStringList(entry.displayed_properties),
    color_mode: normalizeColorMode(entry.color_mode),
    color: readString(entry.color, DEFAULT_COLOR),
    color_rules: normalizeColorRules(entry.color_rules),
    icon_mode: normalizeIconMode(entry.icon_mode),
    icon: readString(entry.icon, DEFAULT_ICON),
    selection_event_override: readString(entry.selection_event_override),
  };
}

export function readTimelineWidgetConfig(props: Record<string, unknown> | null | undefined): TimelineWidgetConfig {
  const rawLayers = Array.isArray(props?.layers) ? props.layers : [];
  const layers = rawLayers.filter(isRecord).map((entry, index) => readTimelineLayerConfig(entry, index));
  return {
    layers: layers.length > 0 ? layers : [readTimelineLayerConfig({}, 0)],
    orientation: normalizeOrientation(props?.orientation),
    order: normalizeOrder(props?.order),
    show_legend: readBoolean(props?.show_legend, false),
    show_time_between_events: readBoolean(props?.show_time_between_events, true),
    highlight_selection: readBoolean(props?.highlight_selection, true),
    selected_object_variable_id: readString(props?.selected_object_variable_id),
    selected_objects_variable_id: readString(props?.selected_objects_variable_id),
    selected_layer_variable_id: readString(props?.selected_layer_variable_id),
    empty_label: readString(props?.empty_label, 'No timeline events to display.'),
    max_events: Math.max(1, Math.min(5000, Math.round(readNumber(props?.max_events, 250)))),
  };
}

export function parseTimelineTimestampToMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && trimmed === String(numeric)) return numeric;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function objectDefaultTitle(object: ObjectInstance): string {
  const props = object.properties ?? {};
  const candidates = ['display_name', 'name', 'title', 'label'];
  for (const candidate of candidates) {
    const value = props[candidate];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return object.id;
}

function computeEventTitle(layer: TimelineLayerConfig, object: ObjectInstance): string {
  const props = object.properties ?? {};
  if (layer.title_mode === 'custom') {
    return layer.custom_title || objectDefaultTitle(object);
  }
  if (layer.title_mode === 'property' && layer.title_property) {
    const raw = props[layer.title_property];
    if (raw !== null && raw !== undefined && raw !== '') return String(raw);
  }
  return objectDefaultTitle(object);
}

function compareForRule(left: unknown, right: unknown): number {
  const lNum = typeof left === 'number' ? left : Number(left);
  const rNum = typeof right === 'number' ? right : Number(right);
  if (Number.isFinite(lNum) && Number.isFinite(rNum)) return lNum - rNum;
  const lDate = parseTimelineTimestampToMs(left);
  const rDate = parseTimelineTimestampToMs(right);
  if (lDate !== null && rDate !== null) return lDate - rDate;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

function ruleMatches(rule: TimelineColorRule, value: unknown): boolean {
  switch (rule.operator) {
    case 'equals':
      return value === rule.value || String(value ?? '') === String(rule.value ?? '');
    case 'in':
      return Array.isArray(rule.value) && rule.value.some((entry) => entry === value || String(entry ?? '') === String(value ?? ''));
    case 'gte':
      return compareForRule(value, rule.value) >= 0;
    case 'lte':
      return compareForRule(value, rule.value) <= 0;
    case 'gt':
      return compareForRule(value, rule.value) > 0;
    case 'lt':
      return compareForRule(value, rule.value) < 0;
    default:
      return false;
  }
}

function computeEventColor(layer: TimelineLayerConfig, object: ObjectInstance): string {
  if (layer.color_mode === 'static') return layer.color || DEFAULT_COLOR;
  if (layer.color_mode === 'dynamic') {
    const props = object.properties ?? {};
    for (const rule of layer.color_rules) {
      if (ruleMatches(rule, props[rule.property_name])) return rule.color;
    }
    return layer.color || DEFAULT_COLOR;
  }
  return DEFAULT_COLOR;
}

function computeEventIcon(layer: TimelineLayerConfig): string | null {
  if (layer.icon_mode === 'none') return null;
  if (layer.icon_mode === 'custom') return layer.icon || DEFAULT_ICON;
  return DEFAULT_ICON;
}

function selectDisplayedProperties(layer: TimelineLayerConfig, object: ObjectInstance): Array<{ name: string; value: unknown }> {
  const props = object.properties ?? {};
  if (layer.properties_mode === 'specific') {
    return layer.displayed_properties.map((name) => ({ name, value: props[name] }));
  }
  const visible: Array<{ name: string; value: unknown }> = [];
  for (const [name, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === '') continue;
    visible.push({ name, value });
    if (visible.length >= 4) break;
  }
  return visible;
}

export function buildTimelineEvents(
  layers: TimelineLayerConfig[],
  objectsByLayer: Record<string, ObjectInstance[]>,
  options: { order: TimelineOrder; maxEvents: number },
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const layer of layers) {
    if (!layer.date_property) continue;
    const objects = objectsByLayer[layer.id] ?? [];
    for (const object of objects) {
      const props = object.properties ?? {};
      const timestamp = parseTimelineTimestampToMs(props[layer.date_property]);
      if (timestamp === null) continue;
      events.push({
        id: object.id,
        layerId: layer.id,
        layerTitle: layer.title,
        object,
        title: computeEventTitle(layer, object),
        timestampMs: timestamp,
        color: computeEventColor(layer, object),
        icon: computeEventIcon(layer),
        selectionEventOverride: layer.selection_event_override,
        properties: selectDisplayedProperties(layer, object),
      });
    }
  }
  events.sort((left, right) => (options.order === 'oldest_first'
    ? left.timestampMs - right.timestampMs
    : right.timestampMs - left.timestampMs));
  if (events.length > options.maxEvents) events.length = options.maxEvents;
  return events;
}

export function gapBetweenEvents(previous: TimelineEvent, current: TimelineEvent): string {
  const delta = Math.abs(previous.timestampMs - current.timestampMs);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
  return `${Math.round(delta / 86_400_000)}d`;
}

export function makeDefaultTimelineWidget(): AppWidget {
  return {
    id: `timeline_${Date.now().toString(36)}`,
    widget_type: 'timeline',
    title: 'Timeline 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 3 },
    props: {
      layers: [
        {
          id: 'layer-1',
          title: 'Events',
          source_variable_id: '',
          object_type_id: '',
          date_property: '',
          title_mode: 'object_title',
          title_property: '',
          custom_title: '',
          properties_mode: 'specific',
          displayed_properties: [],
          color_mode: 'default',
          color: DEFAULT_COLOR,
          color_rules: [],
          icon_mode: 'default',
          icon: DEFAULT_ICON,
          selection_event_override: '',
        },
      ],
      orientation: 'vertical',
      order: 'newest_first',
      show_legend: false,
      show_time_between_events: true,
      highlight_selection: true,
      selected_object_variable_id: '',
      selected_objects_variable_id: '',
      selected_layer_variable_id: '',
      empty_label: 'No timeline events to display.',
      max_events: 250,
    },
    binding: null,
    events: [],
    children: [],
  };
}
