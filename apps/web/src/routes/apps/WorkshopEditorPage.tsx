import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getApp, updateApp, type AppDefinition, type AppPage, type AppWidget, type AppSettings, type WorkshopHeaderSettings } from '@/lib/api/apps';
import { buildObjectViewActionSuccessToastLink, executeAction, executeActionBatch, getActionType, listActionTypes, listFunctionPackages, listObjectTypes, listProperties, validateAction, type ActionInputField, type ActionOperationKind, type ActionType, type ExecuteActionResponse, type ExecuteBatchActionResponse, type FunctionPackage, type ObjectInstance, type ObjectType, type Property } from '@/lib/api/ontology';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import { EChartCanvas } from '@/lib/components/EChartCanvas';
import { AppRenderer } from '@/lib/components/apps/AppRenderer';
import { useAppHeaderCollapsed } from '@/lib/components/apps/AppHeaderCollapseContext';
import { FreeFormAnalysisWidget } from '@/lib/components/apps/widgets/FreeFormAnalysisWidget';
import { WorkshopMapWidget } from '@/lib/components/apps/widgets/WorkshopMapWidget';
import { readFreeFormAnalysisProps } from '@/lib/components/apps/widgets/freeFormAnalysis';
import { InlineEditCell } from '@/lib/components/ontology/InlineEditCell';
import { readMapLayerConfigs, readMapOverlayConfigs, type WorkshopMapFeatureCollection, type WorkshopMapLayerConfig, type WorkshopMapOverlayLayerConfig } from '@/lib/components/apps/widgets/workshopMap';
import { buildChartXyAggregation, chartXyEChartsOption, type ChartXySeriesMetric } from '@/lib/components/apps/widgets/chartXY';
import { readMetricCardProps, resolveMetricCardMetrics, type MetricCardConditionalRule, type MetricCardDirection, type MetricCardFormatKind, type MetricCardLayoutStyle, type MetricCardMetric, type MetricCardSize, type MetricCardTemplate, type MetricCardValueType } from '@/lib/components/apps/widgets/metricCard';
import { buildObjectSetTitleModel, readObjectSetTitleProps } from '@/lib/components/apps/widgets/objectSetTitle';
import { buildPropertyListEntries, readPropertyListPropertyNames, type PropertyListFormatConfig } from '@/lib/components/apps/widgets/propertyList';
import { WorkshopDataContext } from '@/lib/components/apps/widgets/workshop-context';
import {
  WorkshopRuntimeContext,
  useRuntime,
  type ButtonGroupButton,
  type ButtonOnClickKind,
  type ButtonParameterDefault,
  type ParameterDefaultVisibility,
  type RuntimeApi,
  type WorkshopFilterRuntimeValue,
} from '@/lib/components/apps/widgets/workshop-runtime-context';
import {
  createWorkshopVariableEngine,
  type WorkshopRuntimeFilterMetadata,
  type WorkshopVariableEngineResult,
} from '@/lib/components/apps/widgets/workshopVariables';
import {
  executeWorkshopObjectSet,
  type WorkshopObjectSetExecutionOptions,
} from '@/lib/components/apps/widgets/workshopObjectSets';
import {
  downloadWorkshopEventPayload,
  runWorkshopEvents,
  type WorkshopEventHandlers,
} from '@/lib/components/apps/widgets/workshopEvents';
import { buildFunctionInvocation, clearWorkshopFunctionResultCache, executeCachedFunctionVariable, getCachedFunctionVariableValue, NIL_OBJECT_TYPE_ID, readFunctionVariableConfig, type WorkshopFunctionParameterBinding, type WorkshopFunctionRuntimeValue } from '@/lib/components/apps/widgets/workshopFunctions';
import { buildWorkshopScenarioValue, scenarioPayloadToActionDefaults, type WorkshopScenarioParameter } from '@/lib/components/apps/widgets/workshopScenarios';

const EMPTY_SELECTED_OBJECTS: ObjectInstance[] = [];
type LeftTab = 'layout' | 'outline' | 'variables' | 'settings';

interface SelectionState {
  kind: 'header' | 'page' | 'section' | 'widget';
  id: string;
}

interface HeaderUiState {
  enable_module_header: boolean;
  custom_color: boolean;
  enable_app_logo: boolean;
  logo_kind: 'icon' | 'image';
  enable_favoriting: boolean;
  image_url: string;
}

interface ColorOption {
  id: string;
  label: string;
  hex: string;
}

const HEADER_COLORS: ColorOption[] = [
  { id: 'blue-1', label: 'Blue 1', hex: '#cfe1ff' },
  { id: 'blue-2', label: 'Blue 2', hex: '#9ec3ff' },
  { id: 'blue-3', label: 'Blue 3', hex: '#5b9bff' },
  { id: 'blue-4', label: 'Blue 4', hex: '#2d72d2' },
  { id: 'blue-5', label: 'Blue 5', hex: '#1f4ea0' },
  { id: 'green', label: 'Green', hex: '#15803d' },
  { id: 'orange', label: 'Orange', hex: '#cf923f' },
  { id: 'red', label: 'Red', hex: '#b42318' },
  { id: 'purple', label: 'Purple', hex: '#7c5dd6' },
  { id: 'gray', label: 'Gray', hex: '#5c7080' },
];

const HEADER_ICON_OPTIONS: Array<{ id: GlyphName; label: string }> = [
  { id: 'cube', label: 'Cube' },
  { id: 'object', label: 'Application' },
  { id: 'database', label: 'Dataset' },
  { id: 'folder', label: 'Folder' },
  { id: 'document', label: 'Document' },
  { id: 'graph', label: 'Graph' },
  { id: 'list', label: 'List' },
  { id: 'home', label: 'Home' },
  { id: 'pie-chart', label: 'Pie chart' },
  { id: 'shield', label: 'Shield' },
  { id: 'sparkles', label: 'Sparkles' },
  { id: 'badge-check', label: 'Badge' },
  { id: 'view-grid', label: 'Grid' },
  { id: 'star', label: 'Star' },
  { id: 'tag', label: 'Tag' },
];

const DEFAULT_HEADER_UI: HeaderUiState = {
  enable_module_header: true,
  custom_color: false,
  enable_app_logo: true,
  logo_kind: 'icon',
  enable_favoriting: false,
  image_url: '',
};

function readHeaderUi(settings: AppSettings | null | undefined): HeaderUiState {
  const raw = (settings as unknown as { workshop_header_ui?: Partial<HeaderUiState> } | null | undefined)?.workshop_header_ui;
  return { ...DEFAULT_HEADER_UI, ...(raw ?? {}) };
}

function colorByHex(hex: string | null | undefined): ColorOption | null {
  if (!hex) return null;
  return HEADER_COLORS.find((option) => option.hex.toLowerCase() === hex.toLowerCase()) ?? null;
}

function runtimeParametersFromSearch(searchParams: URLSearchParams) {
  const parameters: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key !== 'mode') parameters[key] = value;
  });
  return parameters;
}

function buildWorkshopDraftPreviewApp(
  app: AppDefinition,
  pages: AppPage[],
  variables: WorkshopVariable[],
  headerSettings: WorkshopHeaderSettings,
  headerUi: HeaderUiState,
): AppDefinition {
  const baseSettings = app.settings ?? ({} as AppSettings);
  const runtimeMetadata = {
    ...(baseSettings.runtime_metadata ?? {}),
    schema_version: baseSettings.runtime_metadata?.schema_version ?? 'openfoundry.workshop.runtime.v1',
    public_slug: baseSettings.runtime_metadata?.public_slug ?? app.slug,
    runtime_mode: 'preview',
    status: 'draft',
    home_page_id: baseSettings.home_page_id ?? pages[0]?.id ?? '',
  };
  const nextSettings = {
    ...baseSettings,
    home_page_id: baseSettings.home_page_id ?? pages[0]?.id ?? null,
    workshop_header: { ...headerSettings },
    workshop_header_ui: { ...headerUi },
    workshop_variables: variables,
    runtime_metadata: runtimeMetadata,
  } as AppSettings;
  return {
    ...app,
    status: 'draft',
    pages,
    settings: nextSettings,
  };
}

const DEFAULT_PAGE_ID = 'page';

function defaultPage(): AppPage {
  const sectionA = makeSection();
  const sectionB = makeSection();
  return {
    id: DEFAULT_PAGE_ID,
    name: 'Page',
    path: '/',
    description: '',
    layout: { kind: 'flex', columns: 2, gap: '12px', max_width: '100%' },
    widgets: [sectionA, sectionB],
    visible: true,
  };
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
}

function makeSection(): AppWidget {
  return {
    id: makeId('section'),
    widget_type: 'section',
    title: 'Section',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: { column_width_kind: 'flex', column_width: 1 },
    binding: null,
    events: [],
    children: [],
  };
}

function makeObjectTableWidget(): AppWidget {
  return {
    id: makeId('object_table'),
    widget_type: 'object_table',
    title: 'Object table 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: {
      object_type_id: '',
      source_variable_id: '',
      columns: [],
      default_sort_property: '',
      default_sort_direction: 'asc',
      row_height_lines: 1,
      wrap_values: false,
      multi_select: false,
      active_object_variable_id: '',
      selected_object_set_variable_id: '',
      disable_active_auto_selection: false,
      enable_inline_edit: false,
      row_actions: [],
    },
    binding: null,
    events: [],
    children: [],
  };
}

function makeObjectSetTitleWidget(): AppWidget {
  return {
    id: makeId('object_set_title'),
    widget_type: 'object_set_title',
    title: 'Object set title 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: {
      source_variable_id: '',
      contains_single_object: false,
      show_icon: true,
      title_override: '',
      render_when_empty: false,
      empty_object_type_id: '',
      empty_title: '',
    },
    binding: null,
    events: [],
    children: [],
  };
}

function makeMetricCardMetric(label = 'Metric'): MetricCardMetric {
  return {
    id: makeId('metric'),
    label,
    description: '',
    value_type: 'number',
    variable_id: '',
    value: '',
    format: { kind: 'number', precision: 1 },
    conditional_formatting: [],
    secondary_metric: null,
  };
}

function makeMetricWidget(): AppWidget {
  return {
    id: makeId('metric'),
    widget_type: 'metric',
    title: 'Metric Card 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: {
      label: 'Metric Card',
      metrics: [makeMetricCardMetric('Metric')],
      layout_style: 'card',
      direction: 'horizontal',
      template: 'stacked',
      metric_size: 'regular',
    },
    binding: null,
    events: [],
    children: [],
  };
}

type ObjectTableSortDirection = 'asc' | 'desc';
type ObjectTableRowAction = ButtonGroupButton;

interface ObjectTableProps {
  object_type_id?: string;
  source_variable_id?: string;
  columns?: string[];
  default_sort_property?: string;
  default_sort_direction?: ObjectTableSortDirection;
  row_height_lines?: number;
  wrap_values?: boolean;
  multi_select?: boolean;
  active_object_variable_id?: string;
  selected_object_set_variable_id?: string;
  disable_active_auto_selection?: boolean;
  enable_inline_edit?: boolean;
  row_actions?: ObjectTableRowAction[];
}

function makeButton(label: string): ButtonGroupButton {
  return {
    id: makeId('btn'),
    label,
    on_click_kind: 'none',
    action_type_id: '',
    parameter_defaults: {},
    default_layout: 'form',
    switch_layout: false,
    conditional_visibility: false,
  };
}

function makeButtonGroupWidget(): AppWidget {
  return {
    id: makeId('button_group'),
    widget_type: 'button_group',
    title: 'Button group 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: {
      button_type: 'inline',
      buttons: [makeButton('Button 1')] as ButtonGroupButton[],
      orientation: 'horizontal',
      fill_horizontal: false,
      row_height_kind: 'auto',
      row_height_value: 600,
    },
    binding: null,
    events: [],
    children: [],
  };
}

interface PropertyListItem {
  id: string;
  property_names: string[];
}

interface PropertyListWidgetProps {
  source_variable_id?: string;
  items?: PropertyListItem[];
  properties?: string[];
  number_of_columns?: number;
  enable_value_wrapping?: boolean;
  hide_nulls?: boolean;
  value_layout?: 'adjacent' | 'below';
  formats?: Record<string, PropertyListFormatConfig>;
}

function makePropertyListWidget(): AppWidget {
  return {
    id: makeId('property_list'),
    widget_type: 'property_list',
    title: 'Property list 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: {
      source_variable_id: '',
      properties: [],
      items: [{ id: makeId('item'), property_names: [] }] as PropertyListItem[],
      number_of_columns: 2,
      enable_value_wrapping: false,
      hide_nulls: false,
      value_layout: 'adjacent',
      row_height_kind: 'auto',
      row_height_value: 600,
    },
    binding: null,
    events: [],
    children: [],
  };
}

function makeMapWidget(): AppWidget {
  return {
    id: makeId('map'),
    widget_type: 'map',
    title: 'Map 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 3 },
    props: {
      base_layer_kind: 'blank',
      zoom: 11,
      output_variable_id: '',
      output_object_set_variable_id: '',
      output_shape_variable_id: '',
      shape_search_output_variable_id: '',
      enable_shape_drawing: true,
      layers: [
        {
          id: makeId('map_layer'),
          title: 'Objects',
          source: 'object_set',
          loading_mode: 'eager',
          source_variable_id: '',
          object_type_id: '',
          tile_layer_id: '',
          tile_page_size: 500,
          tile_simplify_tolerance: 0,
          geometry_type: 'point',
          latitude_field: 'lat',
          longitude_field: 'lon',
          geometry_field: '',
          label_field: 'label',
          color: '#2d72d2',
          visible: true,
          locked: false,
          cluster_enabled: false,
          cluster_radius: 64,
          cluster_max_zoom: 10,
          cluster_color: '#2d72d2',
        },
      ],
      overlay_layers: [],
    },
    binding: null,
    events: [],
    children: [],
  };
}

interface ChartXyLayer {
  id: string;
  title: string;
  data_input: 'object_set' | 'function' | 'time_series';
  source_variable_id: string;
  object_type_id: string;
  layer_type: 'bar' | 'line' | 'scatter';
  show_labels: boolean;
  x_property: string;
  x_bucketing: 'exact' | 'range';
  x_limit: string;
  series_metric: ChartXySeriesMetric;
  series_property: string;
  cumulative_sum: boolean;
  segment_by: string;
}

function makeChartXyLayer(): ChartXyLayer {
  return {
    id: makeId('layer'),
    title: 'Layer (bar)',
    data_input: 'object_set',
    source_variable_id: '',
    object_type_id: '',
    layer_type: 'bar',
    show_labels: true,
    x_property: '',
    x_bucketing: 'exact',
    x_limit: '',
    series_metric: 'count',
    series_property: '',
    cumulative_sum: false,
    segment_by: '',
  };
}

function makeChartXyWidget(): AppWidget {
  return {
    id: makeId('chart_xy'),
    widget_type: 'chart_xy',
    title: 'Chart: XY 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: {
      layers: [makeChartXyLayer()] as ChartXyLayer[],
      annotations: [] as Array<{ id: string }>,
      y_axis_kind: 'categorical',
      show_title: false,
      show_color_markers: true,
      enable_numerical_formatting: false,
      sort_by: 'key_asc',
      enable_ontology_colors: true,
      show_legend: false,
      show_tooltips: true,
      allow_exports: true,
      bar_orientation: 'horizontal',
      output_filter_variable_id: '',
      selected_object_set_variable_id: '',
      row_height_kind: 'auto',
      row_height_value: 600,
    },
    binding: null,
    events: [],
    children: [],
  };
}

function makeChartPieWidget(): AppWidget {
  return {
    id: makeId('chart_pie'),
    widget_type: 'chart_pie',
    title: 'Chart: Pie 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: {
      source_variable_id: '',
      object_type_id: '',
      group_by_property: '',
      enable_ontology_colors: true,
      aggregation_metric: 'count',
      aggregation_property: '',
      enable_numeric_formatting: false,
      radius: 0,
      padding: 'large',
      show_legend: true,
      legend_position: 'next-to',
      legend_anchor: 'right',
      row_height_kind: 'auto',
      row_height_value: 600,
    },
    binding: null,
    events: [],
    children: [],
  };
}

function makeFilterListWidget(): AppWidget {
  return {
    id: makeId('filter_list'),
    widget_type: 'filter_list',
    title: 'Filter list 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 1 },
    props: {
      object_type_id: '',
      source_variable_id: '',
      filters: [] as FilterEntry[],
      allow_add_remove: false,
      layout: 'vertical',
      output_variable_id: '',
      background_color: 'white',
    },
    binding: null,
    events: [],
    children: [],
  };
}

function makeFreeFormAnalysisWidget(): AppWidget {
  return {
    id: makeId('free_form_analysis'),
    widget_type: 'free_form_analysis',
    title: 'Free-form Analysis 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 4 },
    props: {
      source_variable_id: '',
      object_type_id: '',
      output_variable_id: '',
      empty_state_header: 'Start a free-form analysis',
      empty_state_description: 'Add filters, metrics, tables, charts, and notes against this app-bounded object set.',
      enable_path_saving: false,
      max_rows: 5000,
      cards: [],
    },
    binding: null,
    events: [],
    children: [],
  };
}

function makeScenarioWidget(): AppWidget {
  return {
    id: makeId('scenario'),
    widget_type: 'scenario',
    title: 'Scenario controls 1',
    description: '',
    position: { x: 0, y: 0, width: 1, height: 3 },
    props: {
      headline: 'Scenario controls',
      output_variable_id: '',
      apply_label: 'Apply scenario',
      reset_label: 'Reset',
      summary_template: 'Scenario multiplier: {{demand_multiplier}}',
      parameters: [
        { name: 'demand_multiplier', label: 'Demand multiplier', type: 'number', default_value: '1.0', description: '' },
      ] satisfies WorkshopScenarioParameter[],
    },
    binding: null,
    events: [],
    children: [],
  };
}

type FilterComponent = 'multi_select' | 'search' | 'range_numeric' | 'range_date';

interface FilterEntry {
  id: string;
  property_name: string;
  display_name: string;
  component: FilterComponent;
  values: string[];
  range_min: string;
  range_max: string;
  operator?: string;
}

type VariableKind =
  | 'primitive'
  | 'string'
  | 'numeric'
  | 'boolean'
  | 'array'
  | 'struct'
  | 'date'
  | 'timestamp'
  | 'url_parameter'
  | 'runtime_parameter'
  | 'object_set'
  | 'object_set_definition'
  | 'object_set_filter'
  | 'filter_output'
  | 'object_set_active_object'
  | 'object_set_selection'
  | 'aggregation'
  | 'function_output'
  | 'scenario'
  | 'shape_output';

interface VariableStaticFilter {
  property_name: string;
  operator?: 'equals' | 'not_equals' | 'contains' | 'gte' | 'lte' | 'gt' | 'lt' | 'in' | 'is_empty' | 'is_not_empty' | string;
  value?: unknown;
  min?: unknown;
  max?: unknown;
  value_variable_id?: string;
  values_variable_id?: string;
  min_variable_id?: string;
  max_variable_id?: string;
}

export interface WorkshopVariable {
  id: string;
  kind: VariableKind;
  name: string;
  object_type_id: string;
  object_set_id?: string;
  saved_object_set_id?: string;
  source_widget_id?: string;
  source_variable_id?: string;
  filter_variable_id?: string;
  static_filter?: VariableStaticFilter;
  static_filters?: VariableStaticFilter[];
  default_value?: unknown;
  metadata?: Record<string, unknown>;
}

const VARIABLE_KIND_LABEL: Record<string, string> = {
  primitive: 'Primitive',
  string: 'String',
  numeric: 'Numeric',
  boolean: 'Boolean',
  array: 'Array',
  struct: 'Struct',
  date: 'Date',
  timestamp: 'Timestamp',
  url_parameter: 'URL parameter',
  runtime_parameter: 'Runtime parameter',
  object_set: 'Object set',
  object_set_definition: 'Object set definition',
  object_set_filter: 'Object set filter',
  filter_output: 'Filter output',
  object_set_active_object: 'Active object',
  object_set_selection: 'Selected object set',
  aggregation: 'Aggregation',
  function_output: 'Function output',
  scenario: 'Scenario',
  shape_output: 'Shape output',
};

const SECTION_BG_COLORS: Array<{ id: string; label: string; hex: string }> = [
  { id: 'white', label: 'White', hex: '#ffffff' },
  { id: 'light-gray-1', label: 'Light gray 1', hex: '#f7f9fa' },
  { id: 'light-gray-2', label: 'Light gray 2', hex: '#eef1f4' },
  { id: 'light-gray-3', label: 'Light gray 3', hex: '#e3e8ed' },
  { id: 'light-gray-4', label: 'Light gray 4', hex: '#d6dde3' },
  { id: 'light-gray-5', label: 'Light gray 5', hex: '#aab4c0' },
];

const SECTION_HEADER_FORMATS: Array<{ id: string; label: string }> = [
  { id: 'title', label: 'Title' },
  { id: 'contained', label: 'Contained' },
  { id: 'underline', label: 'Underline' },
];

const FILTER_COMPONENT_LABEL: Record<FilterComponent, string> = {
  multi_select: 'Multi-select dropdown',
  search: 'Search',
  range_numeric: 'Numeric range',
  range_date: 'Date range',
};

export function readWorkshopVariables(settings: AppSettings | null | undefined): WorkshopVariable[] {
  const raw = (settings as unknown as { workshop_variables?: WorkshopVariable[] } | null | undefined)?.workshop_variables;
  return Array.isArray(raw) ? raw : [];
}

export function WorkshopEditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode: 'preview' | 'edit' = searchParams.get('mode') === 'preview' ? 'preview' : 'edit';
  const [app, setApp] = useState<AppDefinition | null>(null);
  const [pages, setPages] = useState<AppPage[]>([]);
  const [selection, setSelection] = useState<SelectionState>({ kind: 'page', id: DEFAULT_PAGE_ID });
  const [leftTab, setLeftTab] = useState<LeftTab>('layout');
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [pickerOpen, setPickerOpen] = useState<{ widgetId: string } | null>(null);
  const [widgetMenuSection, setWidgetMenuSection] = useState<string | null>(null);
  const [layoutMenuSection, setLayoutMenuSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [headerSettings, setHeaderSettings] = useState<WorkshopHeaderSettings>({ title: null, icon: null, color: null });
  const [headerUi, setHeaderUi] = useState<HeaderUiState>(DEFAULT_HEADER_UI);
  const [variables, setVariables] = useState<WorkshopVariable[]>([]);
  const [editingVariableId, setEditingVariableId] = useState<string | null>(null);
  const [varAddMenuOpen, setVarAddMenuOpen] = useState(false);
  const [previewPageId, setPreviewPageId] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const [definition, types] = await Promise.all([
          getApp(id),
          listObjectTypes({ per_page: 200 }).then((response) => response.data).catch(() => [] as ObjectType[]),
        ]);
        if (cancelled) return;
        setApp(definition);
        setObjectTypes(types);
        const initialPages = definition.pages.length > 0 ? definition.pages : [defaultPage()];
        setPages(initialPages);
        setSelection({ kind: 'page', id: initialPages[0].id });
        const existingHeader = definition.settings?.workshop_header ?? { title: null, icon: null, color: null };
        setHeaderSettings({
          title: existingHeader.title ?? definition.name,
          icon: existingHeader.icon ?? 'cube',
          color: existingHeader.color ?? '#2d72d2',
        });
        setHeaderUi(readHeaderUi(definition.settings));
        setVariables(readWorkshopVariables(definition.settings));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load app');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (pages.length === 0) {
      setPreviewPageId('');
      return;
    }
    if (!previewPageId || !pages.some((page) => page.id === previewPageId)) {
      setPreviewPageId(pages[0].id);
    }
  }, [pages, previewPageId]);

  const activePage = mode === 'preview'
    ? pages.find((page) => page.id === previewPageId) ?? pages[0] ?? null
    : pages[0] ?? null;

  function patchPage(patch: Partial<AppPage>) {
    setPages((current) => current.map((page, index) => (index === 0 ? { ...page, ...patch } : page)));
  }

  function patchSection(sectionId: string, patcher: (section: AppWidget) => AppWidget) {
    if (!activePage) return;
    const updated: AppWidget[] = activePage.widgets.map((section) => (section.id === sectionId ? patcher(section) : section));
    patchPage({ widgets: updated });
  }

  function patchWidget(sectionId: string, widgetId: string, patcher: (widget: AppWidget) => AppWidget) {
    patchSection(sectionId, (section) => ({
      ...section,
      children: section.children.map((widget) => (widget.id === widgetId ? patcher(widget) : widget)),
    }));
  }

  function removeWidget(sectionId: string, widgetId: string) {
    patchSection(sectionId, (section) => ({
      ...section,
      children: section.children.filter((widget) => widget.id !== widgetId),
    }));
  }

  function addSection() {
    if (!activePage) return;
    const next = [...activePage.widgets, makeSection()];
    patchPage({ widgets: next });
  }

  function draftSettings() {
    if (!app) return;
    const baseSettings = app.settings ?? ({} as AppSettings);
    return {
      ...baseSettings,
      workshop_header: { ...headerSettings },
      workshop_header_ui: { ...headerUi },
      workshop_variables: variables,
    } as AppSettings;
  }

  async function persistDraft() {
    if (!app) throw new Error('App is not loaded');
    const nextSettings = draftSettings();
    if (!nextSettings) throw new Error('App is not loaded');
    const updated = await updateApp(app.id, { pages, settings: nextSettings, status: 'draft' });
    setApp(updated);
    setSavedAt(new Date());
    return updated;
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await persistDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function openPreview() {
    if (!app) return;
    const previewWindow = window.open('about:blank', '_blank');
    setSaving(true);
    setError('');
    try {
      const updated = await persistDraft();
      const url = `/apps/${updated.id}/workshop?mode=preview`;
      if (previewWindow) previewWindow.location.href = url;
      else window.open(url, '_blank');
    } catch (cause) {
      if (previewWindow) previewWindow.close();
      setError(cause instanceof Error ? cause.message : 'Preview failed');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (mode === 'preview') return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        navigate(`/workflow-lineage?app=${encodeURIComponent(id)}`);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, id, navigate]);

  const previewRuntimeParameters = useMemo(() => runtimeParametersFromSearch(searchParams), [searchParams]);
  const draftPreviewApp = useMemo(
    () => (app ? buildWorkshopDraftPreviewApp(app, pages, variables, headerSettings, headerUi) : null),
    [app, headerSettings, headerUi, pages, variables],
  );

  if (!app || !activePage) {
    return (
      <div style={{ padding: 32 }}>
        <p className="of-text-muted">{error || 'Loading editor…'}</p>
        <Link to="/apps" className="of-link">Back to Workshop</Link>
      </div>
    );
  }

  const selectedSection = selection.kind === 'section' ? activePage.widgets.find((s) => s.id === selection.id) ?? null : null;
  const selectedWidget = selection.kind === 'widget'
    ? activePage.widgets.flatMap((section) => section.children.map((widget) => ({ section, widget }))).find((entry) => entry.widget.id === selection.id) ?? null
    : null;

  if (mode === 'preview') {
    return (
      <PreviewRuntime
        app={draftPreviewApp ?? app}
        pages={draftPreviewApp?.pages ?? pages}
        activePage={(draftPreviewApp?.pages ?? pages).find((page) => page.id === previewPageId) ?? activePage}
        variables={variables}
        objectTypes={objectTypes}
        headerSettings={headerSettings}
        headerUi={headerUi}
        onEdit={() => navigate(`/apps/${app.id}/workshop`)}
        onOpenLineage={() => navigate(`/workflow-lineage?app=${encodeURIComponent(app.id)}`)}
      >
        <AppRenderer
          app={draftPreviewApp ?? app}
          mode="builder"
          chrome="panel"
          initialPageId={previewPageId}
          initialRuntimeParameters={previewRuntimeParameters}
        />
      </PreviewRuntime>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 75, display: 'grid', gridTemplateRows: 'auto 1fr', background: '#fff' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="of-button of-button--ghost" onClick={() => navigate(`/apps?selected=${encodeURIComponent(app.id)}`)}>
            <Glyph name="chevron-left" size={12} /> Back
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
            <Glyph name="folder" size={12} /> Workshop · <strong style={{ color: 'var(--text-strong)' }}>{app.name}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="of-text-muted" style={{ fontSize: 11 }}>{savedAt ? `Saved at ${savedAt.toLocaleTimeString()}` : 'Not saved'}</span>
          <button type="button" className="of-button" onClick={() => void openPreview()} disabled={saving}>
            <Glyph name="eye" size={12} /> View
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{ padding: '8px 14px', border: 0, borderRadius: 4, background: '#2d72d2', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '56px 280px 1fr 320px', minHeight: 0 }}>
        <aside style={{ borderRight: '1px solid var(--border-subtle)', padding: '12px 4px', display: 'grid', gap: 4, alignContent: 'start', justifyContent: 'center' }}>
          {(['layout', 'outline', 'variables', 'settings'] as LeftTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setLeftTab(tab)}
              aria-label={tab}
              style={{
                width: 36, height: 36, border: 0, background: leftTab === tab ? 'rgba(45, 114, 210, 0.08)' : 'transparent',
                color: leftTab === tab ? 'var(--status-info)' : 'var(--text-muted)',
                borderRadius: 4, cursor: 'pointer',
              }}
            >
              <Glyph name={tab === 'layout' ? 'cube' : tab === 'outline' ? 'list' : tab === 'variables' ? 'tag' : 'settings'} size={16} />
            </button>
          ))}
        </aside>

        <aside style={{ borderRight: '1px solid var(--border-subtle)', overflowY: 'auto', padding: 14 }}>
          {leftTab === 'layout' ? (
            <LayoutOutline page={activePage} selection={selection} onSelect={setSelection} />
          ) : leftTab === 'outline' ? (
            <p className="of-text-muted" style={{ fontSize: 12 }}>Outline of the page DOM.</p>
          ) : leftTab === 'variables' ? (
            <VariablesPanel
              variables={variables}
              widgets={activePage.widgets}
              addMenuOpen={varAddMenuOpen}
              onToggleAdd={() => setVarAddMenuOpen((open) => !open)}
              onAdd={(variable) => {
                setVariables((current) => [...current, variable]);
                setEditingVariableId(variable.id);
                setVarAddMenuOpen(false);
              }}
              onRename={(variableId, name) => {
                setVariables((current) => current.map((v) => (v.id === variableId ? { ...v, name } : v)));
              }}
              onSelect={(variableId) => setEditingVariableId(variableId)}
              onDelete={(variableId) => {
                setVariables((current) => current.filter((v) => v.id !== variableId));
                if (editingVariableId === variableId) setEditingVariableId(null);
              }}
            />
          ) : (
            <p className="of-text-muted" style={{ fontSize: 12 }}>App settings panel.</p>
          )}
        </aside>

        <main style={{ overflow: 'auto', padding: 18, background: '#f4f6f9' }}>
          {headerUi.enable_module_header ? (
            <div
              onClick={(event) => {
                event.stopPropagation();
                setSelection({ kind: 'header', id: 'header' });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: '#fff',
                border: selection.kind === 'header' ? '2px solid var(--status-info)' : '1px solid var(--border-subtle)',
                borderRadius: 4,
                marginBottom: 12,
                cursor: 'pointer',
              }}
            >
              {headerUi.enable_app_logo ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    background: `${headerSettings.color ?? '#2d72d2'}1a`,
                    color: headerSettings.color ?? '#2d72d2',
                  }}
                >
                  <Glyph name={(headerSettings.icon ?? 'cube') as GlyphName} size={16} tone={headerSettings.color ?? '#2d72d2'} />
                </span>
              ) : null}
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', flex: 1 }}>
                {headerSettings.title || app.name}
              </span>
              {headerUi.enable_favoriting ? <Glyph name="star" size={14} tone="#cf923f" /> : null}
            </div>
          ) : null}
          <SectionToolbar
            label={selection.kind === 'section' || selection.kind === 'widget' ? 'OBJECT TABLE' : 'PAGE'}
            onAddSection={addSection}
            onSplit={(direction) => {
              const sectionId = selection.kind === 'section' ? selection.id : selection.kind === 'widget' ? activePage.widgets.find((s) => s.children.some((w) => w.id === selection.id))?.id ?? null : null;
              if (!sectionId) {
                addSection();
                return;
              }
              const newSection = makeSection();
              const index = activePage.widgets.findIndex((s) => s.id === sectionId);
              if (index < 0) return;
              const insertIndex = direction === 'right' || direction === 'below' ? index + 1 : index;
              const next = [...activePage.widgets];
              next.splice(insertIndex, 0, newSection);
              patchPage({ widgets: next });
              setSelection({ kind: 'section', id: newSection.id });
            }}
          />

          <div style={{ background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 14, display: 'grid', gridTemplateColumns: activePage.widgets.map((section) => `${flexValue(section)}fr`).join(' '), gap: 14, minHeight: 320 }}>
            {activePage.widgets.map((section) => (
              <div
                key={section.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelection({ kind: 'section', id: section.id });
                }}
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 10,
                  border: selection.kind === 'section' && selection.id === section.id ? '2px solid var(--status-info)' : '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  alignContent: 'start',
                }}
              >
                <SectionHeaderRender section={section} />
                {section.children.map((widget) => (
                  <div
                    key={widget.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelection({ kind: 'widget', id: widget.id });
                    }}
                    style={{
                      border: selection.kind === 'widget' && selection.id === widget.id ? '2px solid var(--status-info)' : '1px solid var(--border-default)',
                      borderRadius: 4,
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {widget.widget_type === 'object_table' ? (
                      <ObjectTableWidgetView widget={widget} variables={variables} />
                    ) : widget.widget_type === 'filter_list' ? (
                      <FilterListWidgetView widget={widget} variables={variables} />
                    ) : widget.widget_type === 'object_set_title' ? (
                      <ObjectSetTitleWidgetView widget={widget} variables={variables} objectTypes={objectTypes} />
                    ) : widget.widget_type === 'button_group' ? (
                      <ButtonGroupWidgetView widget={widget} />
                    ) : widget.widget_type === 'metric' ? (
                      <MetricCardWidgetView widget={widget} variables={variables} />
                    ) : widget.widget_type === 'property_list' ? (
                      <PropertyListWidgetView widget={widget} variables={variables} />
                    ) : widget.widget_type === 'chart_pie' ? (
                      <ChartPieWidgetView widget={widget} variables={variables} />
                    ) : widget.widget_type === 'chart_xy' ? (
                      <ChartXyWidgetView widget={widget} variables={variables} />
                    ) : widget.widget_type === 'map' ? (
                      <MapWidgetView widget={widget} variables={variables} />
                    ) : widget.widget_type === 'free_form_analysis' ? (
                      <FreeFormAnalysisWidget widget={widget} variables={variables} />
                    ) : widget.widget_type === 'scenario' ? (
                      <ScenarioWidgetView widget={widget} />
                    ) : (
                      <p className="of-text-muted" style={{ padding: 12, margin: 0, fontSize: 12 }}>{widget.widget_type}</p>
                    )}
                  </div>
                ))}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="of-button"
                    onClick={() => setWidgetMenuSection(widgetMenuSection === section.id ? null : section.id)}
                    style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                  >
                    <Glyph name="plus" size={13} /> Add widget
                  </button>
                  {widgetMenuSection === section.id ? (
                    <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 4, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: 4, zIndex: 5 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeObjectTableWidget();
                          const activeId = makeId('var');
                          const selectedSetId = makeId('var');
                          patchSection(section.id, (s) => ({
                            ...s,
                            children: [...s.children, {
                              ...widget,
                              props: {
                                ...widget.props,
                                active_object_variable_id: activeId,
                                selected_object_set_variable_id: selectedSetId,
                              },
                            }],
                          }));
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                          setPickerOpen({ widgetId: widget.id });
                          setVariables((current) => [
                            ...current,
                            {
                              id: activeId,
                              kind: 'object_set_active_object',
                              name: `${widget.title} Active object`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                            {
                              id: selectedSetId,
                              kind: 'object_set_selection',
                              name: `${widget.title} Selected objects`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                          ]);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="list" size={13} tone="#2d72d2" /> Object table
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeObjectSetTitleWidget();
                          patchSection(section.id, (s) => ({ ...s, children: [...s.children, widget] }));
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="cube" size={13} tone="#2d72d2" /> Object Set Title
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeButtonGroupWidget();
                          patchSection(section.id, (s) => ({ ...s, children: [...s.children, widget] }));
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="run" size={13} tone="#15803d" /> Button group
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makePropertyListWidget();
                          patchSection(section.id, (s) => ({ ...s, children: [...s.children, widget] }));
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="list" size={13} tone="#cf923f" /> Property list
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeMetricWidget();
                          patchSection(section.id, (s) => ({ ...s, children: [...s.children, widget] }));
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="sparkles" size={13} tone="#15803d" /> Metric Card
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeChartPieWidget();
                          patchSection(section.id, (s) => ({ ...s, children: [...s.children, widget] }));
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="pie-chart" size={13} tone="#cf923f" /> Chart: Pie
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeChartXyWidget();
                          const filterId = makeId('var');
                          const selectedSetId = makeId('var');
                          patchSection(section.id, (s) => ({
                            ...s,
                            children: [...s.children, {
                              ...widget,
                              props: {
                                ...widget.props,
                                output_filter_variable_id: filterId,
                                selected_object_set_variable_id: selectedSetId,
                              },
                            }],
                          }));
                          setVariables((current) => [
                            ...current,
                            {
                              id: filterId,
                              kind: 'filter_output',
                              name: `${widget.title} Selection filter`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                            {
                              id: selectedSetId,
                              kind: 'object_set_selection',
                              name: `${widget.title} Selected objects`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                          ]);
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <span style={{ display: 'inline-flex' }}>
                          <ChartXyGlyph />
                        </span>
                        Chart: XY
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeMapWidget();
                          const activeId = makeId('var');
                          const selectedSetId = makeId('var');
                          const shapeId = makeId('var');
                          const shapeSearchId = makeId('var');
                          patchSection(section.id, (s) => ({
                            ...s,
                            children: [...s.children, { ...widget, props: { ...widget.props, output_variable_id: activeId, output_object_set_variable_id: selectedSetId, output_shape_variable_id: shapeId, shape_search_output_variable_id: shapeSearchId } }],
                          }));
                          setVariables((current) => [
                            ...current,
                            {
                              id: activeId,
                              kind: 'object_set_active_object',
                              name: `${widget.title} Selected object`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                            {
                              id: selectedSetId,
                              kind: 'object_set_selection',
                              name: `${widget.title} Selected object set`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                            {
                              id: shapeId,
                              kind: 'shape_output',
                              name: `${widget.title} Drawn shape`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                            {
                              id: shapeSearchId,
                              kind: 'object_set_selection',
                              name: `${widget.title} Shape search results`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                          ]);
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="graph" size={13} tone="#15803d" /> Map
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeFilterListWidget();
                          patchSection(section.id, (s) => ({ ...s, children: [...s.children, widget] }));
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                          const variableId = makeId('var');
                          setVariables((current) => [
                            ...current,
                            {
                              id: variableId,
                              kind: 'object_set_filter',
                              name: `${widget.title} Filter output`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                          ]);
                          patchSection(section.id, (s) => ({
                            ...s,
                            children: s.children.map((c) => (c.id === widget.id ? { ...c, props: { ...c.props, output_variable_id: variableId } } : c)),
                          }));
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <span style={{ display: 'inline-flex' }}>
                          <FilterListGlyph />
                        </span>
                        Filter list
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeFreeFormAnalysisWidget();
                          const outputId = makeId('var');
                          patchSection(section.id, (s) => ({
                            ...s,
                            children: [...s.children, { ...widget, props: { ...widget.props, output_variable_id: outputId } }],
                          }));
                          setVariables((current) => [
                            ...current,
                            {
                              id: outputId,
                              kind: 'object_set_selection',
                              name: `${widget.title} Output object set`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                            },
                          ]);
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="graph" size={13} tone="#7c5dd6" /> Free-form Analysis
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const widget = makeScenarioWidget();
                          const outputId = makeId('var');
                          patchSection(section.id, (s) => ({
                            ...s,
                            children: [...s.children, { ...widget, props: { ...widget.props, output_variable_id: outputId } }],
                          }));
                          setVariables((current) => [
                            ...current,
                            {
                              id: outputId,
                              kind: 'scenario',
                              name: `${widget.title} Scenario`,
                              object_type_id: '',
                              source_widget_id: widget.id,
                              metadata: { parameters: (widget.props as { parameters?: unknown }).parameters ?? [] },
                            },
                          ]);
                          setSelection({ kind: 'widget', id: widget.id });
                          setWidgetMenuSection(null);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="settings" size={13} tone="#c2410c" /> Scenario controls
                      </button>
                    </div>
                  ) : null}
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="of-button"
                    onClick={() => setLayoutMenuSection(layoutMenuSection === section.id ? null : section.id)}
                    style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                  >
                    <Glyph name="view-grid" size={13} /> Set layout
                  </button>
                  {layoutMenuSection === section.id ? (
                    <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 6, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: 12, zIndex: 6 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600 }}>Layout</p>
                      <p className="of-text-muted" style={{ margin: '0 0 10px', fontSize: 11 }}>Determines how components will be arranged in this section</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                        {([
                          { id: 'columns', label: 'Columns' },
                          { id: 'rows', label: 'Rows' },
                          { id: 'tabs', label: 'Tabs' },
                          { id: 'flow', label: 'Flow' },
                          { id: 'toolbar', label: 'Toolbar' },
                          { id: 'loop', label: 'Loop' },
                        ] as const).map((option) => {
                          const current = ((section.props as { layout_kind?: string })?.layout_kind) ?? 'columns';
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => {
                                patchSection(section.id, (s) => ({ ...s, props: { ...s.props, layout_kind: option.id, layout_direction: option.id === 'rows' ? 'rows' : 'columns' } }));
                                setLayoutMenuSection(null);
                              }}
                              style={{ display: 'grid', gap: 4, padding: '10px 6px', border: current === option.id ? '2px solid var(--status-info)' : '1px solid var(--border-subtle)', background: current === option.id ? 'rgba(45, 114, 210, 0.04)' : '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                            >
                              <LayoutPreviewGlyph kind={option.id} />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </main>

        <aside style={{ borderLeft: '1px solid var(--border-subtle)', overflowY: 'auto' }}>
          {selection.kind === 'header' ? (
            <HeaderInspector
              header={headerSettings}
              ui={headerUi}
              onHeaderChange={setHeaderSettings}
              onUiChange={setHeaderUi}
            />
          ) : selectedWidget && selectedWidget.widget.widget_type === 'metric' ? (
            <MetricCardInspector
              widget={selectedWidget.widget}
              variables={variables}
              onChange={(next) => patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next)}
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedWidget && (selectedWidget.widget.widget_type === 'object_set_title' || selectedWidget.widget.widget_type === 'button_group' || selectedWidget.widget.widget_type === 'property_list') ? (
            <DetailWidgetInspector
              widget={selectedWidget.widget}
              variables={variables}
              objectTypes={objectTypes}
              onChange={(next) => patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next)}
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedWidget && selectedWidget.widget.widget_type === 'chart_xy' ? (
            <ChartXyInspector
              widget={selectedWidget.widget}
              variables={variables}
              objectTypes={objectTypes}
              onChange={(next) => patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next)}
              onRetypeOutputs={(objectTypeId) => {
                const props = selectedWidget.widget.props as Record<string, unknown>;
                const outputIds = new Set([
                  typeof props.output_filter_variable_id === 'string' ? props.output_filter_variable_id : '',
                  typeof props.selected_object_set_variable_id === 'string' ? props.selected_object_set_variable_id : '',
                ].filter(Boolean));
                setVariables((current) => current.map((variable) => {
                  const belongsToWidget = variable.source_widget_id === selectedWidget.widget.id && (variable.kind === 'filter_output' || variable.kind === 'object_set_selection');
                  return outputIds.has(variable.id) || belongsToWidget ? { ...variable, object_type_id: objectTypeId } : variable;
                }));
              }}
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedWidget && selectedWidget.widget.widget_type === 'chart_pie' ? (
            <ChartPieInspector
              widget={selectedWidget.widget}
              variables={variables}
              objectTypes={objectTypes}
              onChange={(next) => patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next)}
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedWidget && selectedWidget.widget.widget_type === 'map' ? (
            <MapWidgetInspector
              widget={selectedWidget.widget}
              variables={variables}
              objectTypes={objectTypes}
              onChange={(next) => patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next)}
              onRenameOutput={(name, objectTypeId) => {
                const outputId = (selectedWidget.widget.props as { output_variable_id?: string })?.output_variable_id;
                const outputSetId = (selectedWidget.widget.props as { output_object_set_variable_id?: string })?.output_object_set_variable_id;
                const shapeSearchOutputId = (selectedWidget.widget.props as { shape_search_output_variable_id?: string })?.shape_search_output_variable_id;
                if (outputId || outputSetId || shapeSearchOutputId) {
                  setVariables((current) => current.map((v) => {
                    if (v.id === outputId) return { ...v, name, object_type_id: objectTypeId || v.object_type_id };
                    if (v.id === outputSetId) return { ...v, name: `${selectedWidget.widget.title} Selected object set`, object_type_id: objectTypeId || v.object_type_id };
                    if (v.id === shapeSearchOutputId) return { ...v, name: `${selectedWidget.widget.title} Shape search results`, object_type_id: objectTypeId || v.object_type_id };
                    return v;
                  }));
                }
              }}
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedWidget && selectedWidget.widget.widget_type === 'free_form_analysis' ? (
            <FreeFormAnalysisInspector
              widget={selectedWidget.widget}
              variables={variables}
              objectTypes={objectTypes}
              onChange={(next) => patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next)}
              onRetypeOutput={(objectTypeId) => {
                const outputId = (selectedWidget.widget.props as { output_variable_id?: string })?.output_variable_id;
                if (outputId) {
                  setVariables((current) => current.map((v) => (v.id === outputId ? { ...v, object_type_id: objectTypeId } : v)));
                }
              }}
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedWidget && selectedWidget.widget.widget_type === 'scenario' ? (
            <ScenarioWidgetInspector
              widget={selectedWidget.widget}
              variables={variables}
              onChange={(next) => {
                patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next);
                const outputId = (next.props as { output_variable_id?: string })?.output_variable_id;
                const parameters = (next.props as { parameters?: unknown })?.parameters ?? [];
                if (outputId) {
                  setVariables((current) => current.map((variable) => (
                    variable.id === outputId
                      ? { ...variable, metadata: { ...(variable.metadata ?? {}), parameters }, source_widget_id: next.id }
                      : variable
                  )));
                }
              }}
              onRenameOutput={(name) => {
                const outputId = (selectedWidget.widget.props as { output_variable_id?: string })?.output_variable_id;
                if (outputId) setVariables((current) => current.map((v) => (v.id === outputId ? { ...v, name } : v)));
              }}
              outputName={
                variables.find((v) => v.id === ((selectedWidget.widget.props as { output_variable_id?: string })?.output_variable_id))?.name ??
                `${selectedWidget.widget.title} Scenario`
              }
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedWidget && selectedWidget.widget.widget_type === 'filter_list' ? (
            <FilterListInspector
              widget={selectedWidget.widget}
              objectTypes={objectTypes}
              variables={variables}
              onChange={(next) => patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next)}
              onRenameOutput={(name) => {
                const outputId = (selectedWidget.widget.props as { output_variable_id?: string })?.output_variable_id;
                if (outputId) {
                  setVariables((current) => current.map((v) => (v.id === outputId ? { ...v, name } : v)));
                }
              }}
              onRetypeOutput={(objectTypeId) => {
                const outputId = (selectedWidget.widget.props as { output_variable_id?: string })?.output_variable_id;
                if (outputId) {
                  setVariables((current) => current.map((v) => (v.id === outputId ? { ...v, object_type_id: objectTypeId } : v)));
                }
              }}
              outputName={
                variables.find((v) => v.id === ((selectedWidget.widget.props as { output_variable_id?: string })?.output_variable_id))?.name ??
                `${selectedWidget.widget.title} Filter output`
              }
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedWidget ? (
            <WidgetInspector
              widget={selectedWidget.widget}
              section={selectedWidget.section}
              objectTypes={objectTypes}
              variables={variables}
              onChange={(next) => patchWidget(selectedWidget.section.id, selectedWidget.widget.id, () => next)}
              onRetypeOutputs={(objectTypeId: string) => {
                const activeId = (selectedWidget.widget.props as ObjectTableProps).active_object_variable_id;
                const selectedId = (selectedWidget.widget.props as ObjectTableProps).selected_object_set_variable_id;
                setVariables((current) => current.map((variable) => {
                  const belongsToTable =
                    variable.id === activeId ||
                    variable.id === selectedId ||
                    ((variable.kind === 'object_set_active_object' || variable.kind === 'object_set_selection') && variable.source_widget_id === selectedWidget.widget.id);
                  return belongsToTable ? { ...variable, object_type_id: objectTypeId } : variable;
                }));
              }}
              onDelete={() => {
                removeWidget(selectedWidget.section.id, selectedWidget.widget.id);
                setSelection({ kind: 'page', id: activePage.id });
              }}
            />
          ) : selectedSection ? (
            <SectionInspector
              section={selectedSection}
              onChange={(next) => patchSection(selectedSection.id, () => next)}
            />
          ) : (
            <PageInspector page={activePage} onChange={(next) => patchPage(next)} />
          )}
        </aside>
      </div>

      {editingVariableId ? (
        (variables.find((v) => v.id === editingVariableId)?.kind === 'function_output' ? (
          <FunctionVariableEditor
            variables={variables}
            objectTypes={objectTypes}
            variable={variables.find((v) => v.id === editingVariableId) ?? null}
            onClose={() => setEditingVariableId(null)}
            onChange={(next) => setVariables((current) => current.map((v) => (v.id === next.id ? next : v)))}
          />
        ) : (
          <ObjectSetDefinitionEditor
            variables={variables}
            objectTypes={objectTypes}
            variable={variables.find((v) => v.id === editingVariableId) ?? null}
            onClose={() => setEditingVariableId(null)}
            onChange={(next) => setVariables((current) => current.map((v) => (v.id === next.id ? next : v)))}
          />
        ))
      ) : null}

      {pickerOpen ? (
        <ObjectSetPicker
          objectTypes={objectTypes}
          onClose={() => setPickerOpen(null)}
          onSelect={(typeId) => {
            const target = activePage.widgets.flatMap((s) => s.children.map((w) => ({ s, w }))).find((x) => x.w.id === pickerOpen.widgetId);
            if (target) {
              patchWidget(target.s.id, target.w.id, (widget) => ({
                ...widget,
                title: `Object table 1`,
                props: { ...widget.props, object_type_id: typeId },
                binding: { source_type: 'ontology_object_type', source_id: typeId, fields: [], parameters: {} },
              }));
            }
            setPickerOpen(null);
          }}
        />
      ) : null}

      {error ? (
        <div role="alert" style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', padding: '8px 14px', background: 'rgba(180, 35, 24, 0.92)', color: '#fff', borderRadius: 4, fontSize: 12 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

function flexValue(section: AppWidget): number {
  const width = (section.props as { column_width?: number })?.column_width;
  if (typeof width === 'number') return Math.max(1, width);
  return 1;
}

function LayoutOutline({
  page,
  selection,
  onSelect,
}: {
  page: AppPage;
  selection: SelectionState;
  onSelect: (selection: SelectionState) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>LAYOUT</p>
      <button
        type="button"
        onClick={() => onSelect({ kind: 'header', id: 'header' })}
        style={outlineRow(selection.kind === 'header')}
      >
        <Glyph name="object" size={12} tone="#5c7080" />
        Header
      </button>
      <button
        type="button"
        onClick={() => onSelect({ kind: 'page', id: page.id })}
        style={outlineRow(selection.kind === 'page' && selection.id === page.id)}
      >
        <Glyph name="document" size={12} tone="#5c7080" />
        Page <span className="of-text-muted" style={{ fontSize: 11 }}>(DEFAULT)</span>
      </button>
      {page.widgets.map((section) => (
        <div key={section.id}>
          <button
            type="button"
            onClick={() => onSelect({ kind: 'section', id: section.id })}
            style={{ ...outlineRow(selection.kind === 'section' && selection.id === section.id), paddingLeft: 22 }}
          >
            <Glyph name="chevron-down" size={11} />
            <Glyph name="cube" size={12} tone="#5c7080" />
            {section.title}
            <span className="of-text-muted" style={{ marginLeft: 'auto', fontSize: 10 }}>ROWS</span>
          </button>
          {section.children.map((widget) => (
            <button
              key={widget.id}
              type="button"
              onClick={() => onSelect({ kind: 'widget', id: widget.id })}
              style={{ ...outlineRow(selection.kind === 'widget' && selection.id === widget.id), paddingLeft: 42 }}
            >
              <Glyph name="list" size={12} tone="#2d72d2" />
              {widget.title}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function outlineRow(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '6px 10px',
    border: 0,
    background: active ? 'rgba(45, 114, 210, 0.08)' : 'transparent',
    color: active ? 'var(--status-info)' : 'var(--text-strong)',
    fontWeight: active ? 600 : 500,
    fontSize: 13,
    borderRadius: 4,
    cursor: 'pointer',
    textAlign: 'left',
  };
}

function HeaderInspector({
  header,
  ui,
  onHeaderChange,
  onUiChange,
}: {
  header: WorkshopHeaderSettings;
  ui: HeaderUiState;
  onHeaderChange: (next: WorkshopHeaderSettings) => void;
  onUiChange: (next: HeaderUiState) => void;
}) {
  const [iconQuery, setIconQuery] = useState('');
  const filteredIcons = HEADER_ICON_OPTIONS.filter((option) =>
    `${option.label} ${option.id}`.toLowerCase().includes(iconQuery.toLowerCase()),
  );
  const selectedColor = colorByHex(header.color);
  return (
    <div style={inspectorStyle()}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Header</span>
      </div>
      <div style={{ padding: 14, display: 'grid', gap: 14 }}>
        <Toggle
          label="Enable module header"
          value={ui.enable_module_header}
          onChange={(checked) => onUiChange({ ...ui, enable_module_header: checked })}
        />

        <Section title="Header configuration" />
        <Field label="Title">
          <input
            value={header.title ?? ''}
            onChange={(event) => onHeaderChange({ ...header, title: event.target.value })}
            placeholder="Workshop title"
            style={inputStyle()}
            disabled={!ui.enable_module_header}
          />
        </Field>

        <Toggle
          label="Custom color"
          value={ui.custom_color}
          onChange={(checked) => onUiChange({ ...ui, custom_color: checked })}
        />

        <Toggle
          label="Enable app logo"
          value={ui.enable_app_logo}
          onChange={(checked) => onUiChange({ ...ui, enable_app_logo: checked })}
        />

        {ui.enable_app_logo ? (
          <>
            <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
              {(['icon', 'image'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onUiChange({ ...ui, logo_kind: kind })}
                  style={{
                    flex: 1,
                    padding: '6px 14px',
                    border: 0,
                    background: ui.logo_kind === kind ? '#1c2127' : '#fff',
                    color: ui.logo_kind === kind ? '#fff' : 'var(--text-strong)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {kind === 'icon' ? 'Icon' : 'Image'}
                </button>
              ))}
            </div>

            {ui.logo_kind === 'icon' ? (
              <Field label="Icon">
                <div style={{ display: 'grid', gap: 6 }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      border: '1px solid var(--border-default)',
                      borderRadius: 4,
                      background: '#fff',
                    }}
                  >
                    <Glyph name={(header.icon ?? 'cube') as GlyphName} size={14} tone={header.color ?? '#2d72d2'} />
                    <input
                      value={iconQuery}
                      onChange={(event) => setIconQuery(event.target.value)}
                      placeholder={HEADER_ICON_OPTIONS.find((option) => option.id === (header.icon as GlyphName))?.label ?? 'Cube'}
                      style={{ flex: 1, border: 0, outline: 'none', fontSize: 13 }}
                    />
                    {header.icon ? (
                      <button
                        type="button"
                        aria-label="Clear icon"
                        onClick={() => onHeaderChange({ ...header, icon: null })}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                      >
                        <Glyph name="x" size={11} />
                      </button>
                    ) : null}
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: 4,
                      maxHeight: 160,
                      overflowY: 'auto',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      padding: 6,
                    }}
                  >
                    {filteredIcons.length === 0 ? (
                      <p className="of-text-muted" style={{ gridColumn: '1 / -1', fontSize: 12, padding: 8, textAlign: 'center', margin: 0 }}>
                        No icons match "{iconQuery}".
                      </p>
                    ) : (
                      filteredIcons.map((option) => {
                        const active = header.icon === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            title={option.label}
                            aria-label={option.label}
                            onClick={() => onHeaderChange({ ...header, icon: option.id })}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 8,
                              border: active ? '2px solid var(--status-info)' : '1px solid var(--border-subtle)',
                              borderRadius: 4,
                              background: active ? 'rgba(45, 114, 210, 0.06)' : '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            <Glyph name={option.id} size={14} />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </Field>
            ) : (
              <Field label="Image URL">
                <input
                  value={ui.image_url}
                  onChange={(event) => onUiChange({ ...ui, image_url: event.target.value })}
                  placeholder="https://example.com/logo.png"
                  style={inputStyle()}
                />
              </Field>
            )}
          </>
        ) : null}

        <Toggle
          label="Color"
          value={Boolean(header.color)}
          onChange={(checked) => onHeaderChange({ ...header, color: checked ? (header.color ?? '#2d72d2') : null })}
        />

        {header.color ? (
          <Field label="">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
              {HEADER_COLORS.map((option) => {
                const active = selectedColor?.id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    title={option.label}
                    onClick={() => onHeaderChange({ ...header, color: option.hex })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 8,
                      border: active ? '2px solid var(--status-info)' : '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 18, height: 18, borderRadius: 4, background: option.hex, border: '1px solid rgba(0,0,0,0.08)' }} />
                  </button>
                );
              })}
            </div>
            <span className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>
              {selectedColor ? selectedColor.label : header.color}
            </span>
          </Field>
        ) : null}

        <Toggle
          label="Enable favoriting in view mode"
          value={ui.enable_favoriting}
          onChange={(checked) => onUiChange({ ...ui, enable_favoriting: checked })}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, color: 'var(--text-strong)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</span>
      <span
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        tabIndex={0}
        style={{
          display: 'inline-flex',
          width: 32,
          height: 18,
          borderRadius: 999,
          background: value ? 'var(--status-info)' : '#c5cdd9',
          padding: 2,
          cursor: 'pointer',
          transition: 'background 120ms',
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            transform: value ? 'translateX(14px)' : 'translateX(0)',
            transition: 'transform 120ms',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.16)',
          }}
        />
      </span>
    </label>
  );
}

function PageInspector({ page, onChange }: { page: AppPage; onChange: (patch: Partial<AppPage>) => void }) {
  return (
    <div style={inspectorStyle()}>
      <Section title="Page" />
      <Field label="Page name">
        <input value={page.name} onChange={(event) => onChange({ name: event.target.value })} style={inputStyle()} />
      </Field>
      <Field label="Page id (optional)">
        <input value={page.id} onChange={(event) => onChange({ id: event.target.value })} style={inputStyle()} />
      </Field>
      <Section title="Layout" />
      <Field label="Layout direction">
        <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
          {(['flex', 'grid'] as const).map((kind) => (
            <button key={kind} type="button" onClick={() => onChange({ layout: { ...page.layout, kind } })} style={{ padding: '6px 14px', border: 0, background: page.layout.kind === kind ? '#1c2127' : '#fff', color: page.layout.kind === kind ? '#fff' : 'var(--text-strong)', cursor: 'pointer', fontSize: 12 }}>{kind === 'flex' ? 'Columns' : 'Rows'}</button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function SectionInspector({ section, onChange }: { section: AppWidget; onChange: (next: AppWidget) => void }) {
  const widthKind = ((section.props as { column_width_kind?: string })?.column_width_kind) ?? 'flex';
  const widthValue = ((section.props as { column_width?: number })?.column_width) ?? 1;
  const headerEnabled = (section.props as { header_enabled?: boolean })?.header_enabled !== false;
  const collapsible = Boolean((section.props as { collapsible?: boolean })?.collapsible);
  const initiallyOpen = (section.props as { initially_open?: boolean })?.initially_open !== false;
  const iconExpand = (section.props as { icon_expand?: string })?.icon_expand ?? 'menu-closed';
  const iconCollapse = (section.props as { icon_collapse?: string })?.icon_collapse ?? 'menu-open';
  const iconName = (section.props as { icon?: string })?.icon ?? '';
  const headerFormat = (section.props as { header_format?: string })?.header_format ?? 'title';
  const backgroundColor = (section.props as { background_color?: string })?.background_color ?? 'white';
  const [iconQuery, setIconQuery] = useState('');
  const filteredIcons = HEADER_ICON_OPTIONS.filter((entry) => `${entry.label} ${entry.id}`.toLowerCase().includes(iconQuery.toLowerCase()));

  function patchProps(patch: Record<string, unknown>) {
    onChange({ ...section, props: { ...section.props, ...patch } });
  }

  return (
    <div style={inspectorStyle()}>
      <Section title="Section" />
      <Toggle label="Section header" value={headerEnabled} onChange={(checked) => patchProps({ header_enabled: checked })} />
      {headerEnabled ? (
        <>
          <Field label="Style">
            <select
              value={(section.props as { style?: string })?.style ?? 'subheader'}
              onChange={(event) => patchProps({ style: event.target.value })}
              style={inputStyle()}
            >
              <option value="header">Header</option>
              <option value="title">Title</option>
              <option value="subheader">Subheader</option>
              <option value="caption">Caption</option>
            </select>
          </Field>
          <Field label="Title">
            <input value={section.title} onChange={(event) => onChange({ ...section, title: event.target.value })} style={inputStyle()} />
          </Field>
          <Field label="Icon">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, background: '#fff' }}>
              {iconName ? <Glyph name={iconName as GlyphName} size={13} tone="#5c7080" /> : <Glyph name="search" size={12} tone="#aab4c0" />}
              <input value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder={HEADER_ICON_OPTIONS.find((option) => option.id === iconName)?.label ?? 'Select an icon…'} style={{ flex: 1, border: 0, outline: 'none', fontSize: 13 }} />
              {iconName ? (
                <button type="button" aria-label="Clear icon" onClick={() => patchProps({ icon: '' })} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <Glyph name="x" size={11} />
                </button>
              ) : null}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginTop: 6, maxHeight: 130, overflowY: 'auto' }}>
              {filteredIcons.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  title={option.label}
                  onClick={() => patchProps({ icon: option.id })}
                  style={{ padding: 6, border: iconName === option.id ? '2px solid var(--status-info)' : '1px solid var(--border-subtle)', background: '#fff', borderRadius: 4, cursor: 'pointer' }}
                >
                  <Glyph name={option.id} size={13} />
                </button>
              ))}
            </div>
          </Field>
        </>
      ) : null}

      <Toggle label="Collapsible" value={collapsible} onChange={(checked) => patchProps({ collapsible: checked })} />
      {collapsible ? (
        <>
          <Field label="Section is initially">
            <select value={initiallyOpen ? 'open' : 'closed'} onChange={(event) => patchProps({ initially_open: event.target.value === 'open' })} style={inputStyle()}>
              <option value="open">open</option>
              <option value="closed">closed</option>
            </select>
          </Field>
          <Field label="Icon to expand">
            <select value={iconExpand} onChange={(event) => patchProps({ icon_expand: event.target.value })} style={inputStyle()}>
              <option value="menu-closed">Menu closed</option>
              <option value="chevron-down">Chevron down</option>
              <option value="plus">Plus</option>
            </select>
          </Field>
          <Field label="Icon to collapse">
            <select value={iconCollapse} onChange={(event) => patchProps({ icon_collapse: event.target.value })} style={inputStyle()}>
              <option value="menu-open">Menu open</option>
              <option value="chevron-down">Chevron down</option>
              <option value="x">X</option>
            </select>
          </Field>
        </>
      ) : null}

      <Section title="Formatting" />
      <Field label="Header format">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {SECTION_HEADER_FORMATS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => patchProps({ header_format: option.id })}
              style={{ padding: '8px 4px', border: headerFormat === option.id ? '2px solid var(--status-info)' : '1px solid var(--border-default)', background: headerFormat === option.id ? 'rgba(45, 114, 210, 0.06)' : '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Background color">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {SECTION_BG_COLORS.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.label}
              onClick={() => patchProps({ background_color: option.id })}
              style={{ padding: 4, border: backgroundColor === option.id ? '2px solid var(--status-info)' : '1px solid var(--border-subtle)', background: '#fff', borderRadius: 4, cursor: 'pointer' }}
            >
              <span style={{ display: 'block', height: 18, background: option.hex, borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)' }} />
            </button>
          ))}
        </div>
      </Field>

      <Section title="Dimensions" />
      <Field label="Column width">
        <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
          {(['absolute', 'flex'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => patchProps({ column_width_kind: kind })}
              style={{ padding: '6px 14px', border: '1px solid var(--border-default)', background: widthKind === kind ? '#1c2127' : '#fff', color: widthKind === kind ? '#fff' : 'var(--text-strong)', cursor: 'pointer', fontSize: 12 }}
            >
              {kind === 'absolute' ? 'Absolute' : 'Flex'}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={widthValue}
            onChange={(event) => patchProps({ column_width: Number(event.target.value) })}
            style={{ ...inputStyle(), width: 80, marginLeft: 8 }}
          />
        </div>
      </Field>
      <Field label="Row height">
        <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
          {(['auto', 'absolute', 'flex'] as const).map((kind) => {
            const current = ((section.props as { row_height_kind?: string })?.row_height_kind) ?? 'auto';
            return (
              <button
                key={kind}
                type="button"
                onClick={() => patchProps({ row_height_kind: kind })}
                style={{ padding: '6px 12px', border: '1px solid var(--border-default)', background: current === kind ? '#1c2127' : '#fff', color: current === kind ? '#fff' : 'var(--text-strong)', cursor: 'pointer', fontSize: 12 }}
              >
                {kind === 'auto' ? 'Auto (max)' : kind === 'absolute' ? 'Absolute' : 'Flex'}
              </button>
            );
          })}
          <input
            type="number"
            min={1}
            value={Number((section.props as { row_height_value?: number })?.row_height_value ?? 1)}
            onChange={(event) => patchProps({ row_height_value: Number(event.target.value) })}
            style={{ ...inputStyle(), width: 80, marginLeft: 8 }}
          />
        </div>
      </Field>

      <Section title="Layout" />
      <Field label="Padding controls">
        <select
          value={((section.props as { padding_controls?: string })?.padding_controls) ?? 'no-padding'}
          onChange={(event) => patchProps({ padding_controls: event.target.value })}
          style={inputStyle()}
        >
          <option value="no-padding">No padding</option>
          <option value="regular">Regular</option>
          <option value="custom">Custom</option>
        </select>
      </Field>
      <Field label="Layout direction">
        <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
          {(['columns', 'rows'] as const).map((kind) => {
            const current = ((section.props as { layout_direction?: string })?.layout_direction) ?? 'columns';
            return (
              <button key={kind} type="button" onClick={() => patchProps({ layout_direction: kind })} style={{ padding: '6px 14px', border: 0, background: current === kind ? '#1c2127' : '#fff', color: current === kind ? '#fff' : 'var(--text-strong)', cursor: 'pointer', fontSize: 12 }}>
                {kind === 'columns' ? 'Columns' : 'Rows'}
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

function WidgetInspector({
  widget,
  objectTypes,
  variables,
  onChange,
  onRetypeOutputs,
  onDelete,
}: {
  widget: AppWidget;
  section: AppWidget;
  objectTypes: ObjectType[];
  variables: WorkshopVariable[];
  onChange: (next: AppWidget) => void;
  onRetypeOutputs?: (objectTypeId: string) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'setup' | 'metadata' | 'display'>('setup');
  const [properties, setProperties] = useState<Property[]>([]);
  const props = widget.props as ObjectTableProps;
  const sourceVariableId = props.source_variable_id ?? '';
  const sourceVariable = variables.find((v) => v.id === sourceVariableId) ?? null;
  const objectTypeId = sourceVariable?.object_type_id ?? props.object_type_id ?? '';
  const columns: string[] = props.columns ?? [];
  const sortProperty = props.default_sort_property ?? '';
  const sortDirection = props.default_sort_direction ?? 'asc';
  const multiSelect = Boolean(props.multi_select);
  const activeVariableId = props.active_object_variable_id || variables.find((v) => v.kind === 'object_set_active_object' && v.source_widget_id === widget.id)?.id || '';
  const selectedVariableId = props.selected_object_set_variable_id || variables.find((v) => v.kind === 'object_set_selection' && v.source_widget_id === widget.id)?.id || '';
  const rowHeightLines = Math.max(1, Math.min(6, Number(props.row_height_lines ?? 1) || 1));
  const rowActions = props.row_actions ?? [];
  const [availableActions, setAvailableActions] = useState<ActionType[]>([]);

  useEffect(() => {
    if (!objectTypeId) {
      setProperties([]);
      return;
    }
    let cancelled = false;
    void listProperties(objectTypeId)
      .then((response) => {
        if (cancelled) return;
        setProperties(response);
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, [objectTypeId]);

  useEffect(() => {
    if (widget.widget_type !== 'object_table') return;
    let cancelled = false;
    void listActionTypes({ per_page: 100 })
      .then((response) => {
        if (!cancelled) setAvailableActions(response.data);
      })
      .catch(() => {
        if (!cancelled) setAvailableActions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [widget.widget_type]);

  const objectType = objectTypes.find((entry) => entry.id === objectTypeId);

  function patchProps(patch: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patch } });
  }

  function setInputSource(next: string) {
    if (next.startsWith('var:')) {
      const variableId = next.slice(4);
      const variable = variables.find((entry) => entry.id === variableId);
      patchProps({ source_variable_id: variableId, object_type_id: '', columns: [], default_sort_property: '' });
      onRetypeOutputs?.(variable?.object_type_id ?? '');
    } else if (next.startsWith('type:')) {
      const typeId = next.slice(5);
      patchProps({ source_variable_id: '', object_type_id: typeId, columns: [], default_sort_property: '' });
      onRetypeOutputs?.(typeId);
    } else {
      patchProps({ source_variable_id: '', object_type_id: '', columns: [], default_sort_property: '' });
      onRetypeOutputs?.('');
    }
  }

  function toggleColumn(name: string) {
    const next = columns.includes(name) ? columns.filter((entry) => entry !== name) : [...columns, name];
    patchProps({ columns: next });
  }

  function addAllProperties() {
    patchProps({ columns: properties.map((property) => property.name) });
  }

  function removeAllProperties() {
    patchProps({ columns: [] });
  }

  function moveColumn(name: string, direction: -1 | 1) {
    const index = columns.indexOf(name);
    if (index === -1) return;
    const next = [...columns];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    patchProps({ columns: next });
  }

  function reorderColumns(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= columns.length || to >= columns.length) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    patchProps({ columns: next });
  }

  function patchRowAction(id: string, patch: Partial<ObjectTableRowAction>) {
    patchProps({ row_actions: rowActions.map((action) => (action.id === id ? { ...action, ...patch } : action)) });
  }

  function addRowAction() {
    patchProps({
      row_actions: [
        ...rowActions,
        {
          ...makeButton('Row action'),
          id: makeId('row_action'),
          on_click_kind: 'action',
          action_type_id: availableActions[0]?.id ?? '',
        },
      ],
    });
  }

  return (
    <div style={inspectorStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>OBJECT TABLE</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['setup', 'metadata', 'display'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: '8px 6px', border: 0, background: 'transparent', borderBottom: tab === value ? '2px solid var(--status-info)' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? 'var(--text-strong)' : 'var(--text-muted)', marginRight: 14 }}
          >
            {value === 'setup' ? 'Widget setup' : value === 'metadata' ? 'Metadata' : 'Display'}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Section title="Input data" />
          <Field label="Object set">
            <select
              value={sourceVariableId ? `var:${sourceVariableId}` : objectTypeId ? `type:${objectTypeId}` : ''}
              onChange={(event) => setInputSource(event.target.value)}
              style={inputStyle()}
            >
              <option value="">Select object set variable…</option>
              {variables
                .filter((v) => v.kind === 'object_set' || v.kind === 'object_set_definition' || v.kind === 'object_set_selection')
                .map((variable) => (
                  <option key={variable.id} value={`var:${variable.id}`}>
                    {variable.name} ({VARIABLE_KIND_LABEL[variable.kind]})
                  </option>
                ))}
              {objectTypes.map((type) => (
                <option key={type.id} value={`type:${type.id}`}>{type.display_name || type.name}</option>
              ))}
            </select>
            <span className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>Current value: {sourceVariable ? sourceVariable.name : objectType ? objectType.display_name || objectType.name : 'undefined'}</span>
          </Field>

          <Section title="Column configuration" />
          {properties.length === 0 ? (
            <p className="of-text-muted" style={{ fontSize: 12 }}>Pick an object set to configure columns.</p>
          ) : (
            <ColumnConfiguration
              objectType={objectType ?? null}
              properties={properties}
              columns={columns}
              onToggle={toggleColumn}
              onMove={moveColumn}
              onReorder={reorderColumns}
              onAddAll={addAllProperties}
              onRemoveAll={removeAllProperties}
            />
          )}

          <Section title="Default sort" />
          <Field label="Property">
            <select value={sortProperty} onChange={(event) => patchProps({ default_sort_property: event.target.value })} style={inputStyle()}>
              <option value="">Select a property to sort by</option>
              {properties.map((property) => (
                <option key={property.id} value={property.name}>{property.display_name || property.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Direction">
            <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 4, overflow: 'hidden' }}>
              {(['asc', 'desc'] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => patchProps({ default_sort_direction: direction })}
                  style={{ padding: '6px 14px', border: 0, background: sortDirection === direction ? '#1c2127' : '#fff', color: sortDirection === direction ? '#fff' : 'var(--text-strong)', cursor: 'pointer', fontSize: 12 }}
                >
                  {direction === 'asc' ? 'Ascending' : 'Descending'}
                </button>
              ))}
            </div>
          </Field>

          <Section title="Selection" />
          <Field label="Active object output">
            <select value={activeVariableId} onChange={(event) => patchProps({ active_object_variable_id: event.target.value })} style={inputStyle()}>
              <option value="">Auto-discover by widget</option>
              {variables.filter((v) => v.kind === 'object_set_active_object').map((variable) => (
                <option key={variable.id} value={variable.id}>{variable.name}</option>
              ))}
            </select>
          </Field>
          <Toggle label="Disable active object auto-selection" value={Boolean(props.disable_active_auto_selection)} onChange={(checked) => patchProps({ disable_active_auto_selection: checked })} />
          <Toggle label="Enable multi-select" value={multiSelect} onChange={(checked) => patchProps({ multi_select: checked })} />
          <Field label="Selected objects output">
            <select value={selectedVariableId} onChange={(event) => patchProps({ selected_object_set_variable_id: event.target.value })} style={inputStyle()} disabled={!multiSelect}>
              <option value="">Auto-discover by widget</option>
              {variables.filter((v) => v.kind === 'object_set_selection').map((variable) => (
                <option key={variable.id} value={variable.id}>{variable.name}</option>
              ))}
            </select>
          </Field>

          <Section title="Row actions" />
          {rowActions.length === 0 ? (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No row actions configured.</p>
          ) : rowActions.map((action) => (
            <div key={action.id} style={{ display: 'grid', gap: 6, padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
              <input
                value={action.label}
                onChange={(event) => patchRowAction(action.id, { label: event.target.value })}
                placeholder="Action label"
                style={inputStyle()}
              />
              <select
                value={action.action_type_id}
                onChange={(event) => patchRowAction(action.id, { on_click_kind: 'action', action_type_id: event.target.value })}
                style={inputStyle()}
              >
                <option value="">Select action type…</option>
                {availableActions.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.display_name || entry.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="of-link"
                onClick={() => patchProps({ row_actions: rowActions.filter((entry) => entry.id !== action.id) })}
                style={{ ...linkBtnStyle(), color: 'var(--status-danger)', justifySelf: 'start' }}
              >
                Remove row action
              </button>
            </div>
          ))}
          <button type="button" className="of-button" onClick={addRowAction} style={{ justifyContent: 'center', fontSize: 12 }}>
            <Glyph name="plus" size={11} /> Add row action
          </button>

          <button type="button" className="of-button" onClick={onDelete} style={{ color: 'var(--status-danger)', borderColor: '#fecaca' }}>
            <Glyph name="trash" size={12} /> Delete widget
          </button>
        </div>
      ) : tab === 'display' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Section title="Display & formatting" />
          <Field label="Lines per row">
            <input
              type="number"
              min={1}
              max={6}
              value={rowHeightLines}
              onChange={(event) => patchProps({ row_height_lines: Number(event.target.value) })}
              style={inputStyle()}
            />
          </Field>
          <Toggle label="Enable value wrapping" value={Boolean(props.wrap_values)} onChange={(checked) => patchProps({ wrap_values: checked })} />
          <Toggle label="Enable inline editing" value={Boolean(props.enable_inline_edit)} onChange={(checked) => patchProps({ enable_inline_edit: checked })} />
        </div>
      ) : (
        <div style={{ padding: 14 }}>
          <p className="of-text-muted" style={{ fontSize: 12 }}>Widget metadata coming soon.</p>
        </div>
      )}
    </div>
  );
}

function DragHandleGlyph() {
  return (
    <svg width={10} height={14} viewBox="0 0 10 14" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        [0, 1].map((col) => (
          <circle key={`${row}-${col}`} cx={2 + col * 6} cy={2 + row * 5} r={1.2} fill="#aab4c0" />
        ))
      ))}
    </svg>
  );
}

function ColumnConfiguration({
  objectType,
  properties,
  columns,
  onToggle,
  onReorder,
  onAddAll,
  onRemoveAll,
}: {
  objectType: ObjectType | null;
  properties: Property[];
  columns: string[];
  onToggle: (name: string) => void;
  onMove: (name: string, direction: -1 | 1) => void;
  onReorder: (from: number, to: number) => void;
  onAddAll: () => void;
  onRemoveAll: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const selected = useMemo(() => columns.map((name) => properties.find((p) => p.name === name)).filter((p): p is Property => Boolean(p)), [columns, properties]);
  const unselected = useMemo(() => properties.filter((p) => !columns.includes(p.name)), [properties, columns]);
  const filteredUnselected = unselected.filter((p) => `${p.display_name} ${p.name}`.toLowerCase().includes(search.toLowerCase()));

  function handleDragStart(index: number) {
    return (event: React.DragEvent<HTMLDivElement>) => {
      setDragIndex(index);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    };
  }
  function handleDragOver(index: number) {
    return (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropIndex !== index) setDropIndex(index);
    };
  }
  function handleDrop(index: number) {
    return (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const from = dragIndex ?? Number(event.dataTransfer.getData('text/plain'));
      if (Number.isFinite(from)) onReorder(from, index);
      setDragIndex(null);
      setDropIndex(null);
    };
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px' }}>
        <Glyph name="cube" size={13} tone="#2d72d2" />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{objectType?.display_name || objectType?.name || 'Object'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Columns <span aria-hidden="true">ⓘ</span>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {selected.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12, padding: '6px 8px' }}>No columns selected.</p>
        ) : selected.map((property, index) => (
          <div
            key={property.id}
            draggable
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver(index)}
            onDrop={handleDrop(index)}
            onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 8px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: dropIndex === index ? 'rgba(45, 114, 210, 0.06)' : '#fff',
              opacity: dragIndex === index ? 0.6 : 1,
              cursor: 'grab',
              fontSize: 13,
            }}
            role="listitem"
            aria-label={`Reorder ${property.display_name || property.name}`}
          >
            <span style={{ display: 'inline-flex', cursor: 'grab' }}><DragHandleGlyph /></span>
            <span style={{ flex: 1 }}>{property.display_name || property.name}</span>
            <button
              type="button"
              aria-label="Remove column"
              onClick={() => onToggle(property.name)}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--status-danger)', padding: 2 }}
            >
              <Glyph name="trash" size={11} />
            </button>
            <Glyph name="chevron-down" size={11} tone="#5c7080" />
          </div>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setAddOpen((open) => !open)}
          className="of-button"
          style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
        >
          <Glyph name="plus" size={11} /> Add column
        </button>
        {addOpen ? (
          <div
            role="menu"
            style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 4, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: 6, zIndex: 5, maxHeight: 280, overflowY: 'auto' }}
          >
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search property…"
              style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 13, marginBottom: 6 }}
            />
            <p className="of-text-muted" style={{ margin: '4px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current object ({filteredUnselected.length})
            </p>
            {filteredUnselected.length === 0 ? (
              <p className="of-text-muted" style={{ padding: 8, fontSize: 12, margin: 0 }}>No more properties.</p>
            ) : filteredUnselected.map((property) => (
              <button
                key={property.id}
                type="button"
                onClick={() => { onToggle(property.name); setAddOpen(false); setSearch(''); }}
                style={addWidgetItemStyle()}
              >
                <Glyph name="tag" size={11} tone="#5c7080" /> {property.display_name || property.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <button type="button" className="of-link" onClick={onAddAll} style={linkBtnStyle()}>Add all properties</button>
        <button type="button" className="of-link" onClick={onRemoveAll} style={{ ...linkBtnStyle(), color: 'var(--status-danger)' }}>Remove all properties</button>
      </div>
    </div>
  );
}

export function ObjectTableWidgetView({ widget, variables }: { widget: AppWidget; variables: WorkshopVariable[] }) {
  const props = widget.props as ObjectTableProps;
  const sourceVariableId = props.source_variable_id ?? '';
  const sourceVariable = variables.find((v) => v.id === sourceVariableId) ?? null;
  const objectTypeId = sourceVariable?.object_type_id ?? props.object_type_id ?? '';
  const columns: string[] = props.columns ?? [];
  const defaultSortProperty = props.default_sort_property ?? '';
  const defaultSortDirection = props.default_sort_direction ?? 'asc';
  const rowActions = props.row_actions ?? [];
  const multiSelect = Boolean(props.multi_select);
  const wrapValues = Boolean(props.wrap_values);
  const enableInlineEdit = Boolean(props.enable_inline_edit);
  const rowHeightLines = Math.max(1, Math.min(6, Number(props.row_height_lines ?? 1) || 1));
  const [properties, setProperties] = useState<Property[]>([]);
  const [rows, setRows] = useState<ObjectInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortState, setSortState] = useState<{ property: string; direction: ObjectTableSortDirection }>({
    property: defaultSortProperty,
    direction: defaultSortDirection,
  });
  const runtime = useRuntime();
  const selectedRows = sourceVariable?.kind === 'object_set_selection' ? runtime.variableEngine.getSelectedObjectSet(sourceVariableId) : null;
  const activeObjectVariable = useMemo(
    () => variables.find((v) => v.id === props.active_object_variable_id && v.kind === 'object_set_active_object') ?? variables.find((v) => v.kind === 'object_set_active_object' && v.source_widget_id === widget.id) ?? null,
    [props.active_object_variable_id, variables, widget.id],
  );
  const selectedObjectVariable = useMemo(
    () => variables.find((v) => v.id === props.selected_object_set_variable_id && v.kind === 'object_set_selection') ?? variables.find((v) => v.kind === 'object_set_selection' && v.source_widget_id === widget.id) ?? null,
    [props.selected_object_set_variable_id, variables, widget.id],
  );
  const activeObjectId = activeObjectVariable ? runtime.variableEngine.getActiveObject(activeObjectVariable.id)?.id ?? null : null;
  const selectedObjects = selectedObjectVariable ? runtime.variableEngine.getSelectedObjectSet(selectedObjectVariable.id) ?? [] : [];
  const selectedObjectIds = useMemo(() => {
    return new Set(selectedObjects.map((row) => row.id));
  }, [selectedObjects]);

  useEffect(() => {
    if (!objectTypeId) {
      setRows([]);
      setProperties([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const objectsPromise = selectedRows !== null
      ? Promise.resolve({ data: selectedRows, total: selectedRows.length })
      : runtime.executeObjectSet(sourceVariableId, { objectTypeId, limit: 5000 });
    void Promise.all([listProperties(objectTypeId), objectsPromise])
      .then(([propResponse, fetchResponse]) => {
        if (cancelled) return;
        setProperties(propResponse);
        setRows(fetchResponse.data);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setProperties([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objectTypeId, runtime.executeObjectSet, runtime.refreshKey, selectedRows, sourceVariableId]);

  useEffect(() => {
    setSortState({ property: defaultSortProperty, direction: defaultSortDirection });
  }, [defaultSortDirection, defaultSortProperty]);

  const visibleColumns = columns.length > 0 ? columns : properties.map((property) => property.name);
  const propertyByName = useMemo(() => new Map(properties.map((property) => [property.name, property])), [properties]);

  const filteredRows = useMemo(() => {
    if (!runtime.preview) return rows;
    return rows;
  }, [rows, runtime.preview]);

  const sortedRows = useMemo(() => {
    if (!sortState.property) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const compared = compareObjectTableValues(
        (a.properties as Record<string, unknown>)?.[sortState.property],
        (b.properties as Record<string, unknown>)?.[sortState.property],
      );
      return sortState.direction === 'desc' ? -compared : compared;
    });
  }, [filteredRows, sortState.direction, sortState.property]);

  useEffect(() => {
    if (!runtime.preview || !activeObjectVariable || props.disable_active_auto_selection || activeObjectId || sortedRows.length === 0) return;
    runtime.setActiveObject(activeObjectVariable.id, sortedRows[0]);
  }, [activeObjectId, activeObjectVariable, props.disable_active_auto_selection, runtime, sortedRows]);

  function publishSelectedObjects(next: ObjectInstance[]) {
    if (!selectedObjectVariable) return;
    runtime.setSelectedObjectSet(selectedObjectVariable.id, next);
    void runtime.dispatchEvents(widget, 'selection_change', objectTableSelectionPayload(next));
  }

  function toggleSelected(row: ObjectInstance, checked: boolean) {
    if (!selectedObjectVariable) return;
    const current = runtime.variableEngine.getSelectedObjectSet(selectedObjectVariable.id) ?? [];
    const next = checked
      ? [...current.filter((entry) => entry.id !== row.id), row]
      : current.filter((entry) => entry.id !== row.id);
    publishSelectedObjects(next);
  }

  function toggleAllSelected(checked: boolean) {
    publishSelectedObjects(checked ? sortedRows.slice(0, 100) : []);
  }

  function activateRow(row: ObjectInstance) {
    if (activeObjectVariable) runtime.setActiveObject(activeObjectVariable.id, row);
    void runtime.dispatchEvents(widget, 'select', objectTableRowPayload(row, selectedObjectVariable ? runtime.variableEngine.getSelectedObjectSet(selectedObjectVariable.id) ?? [] : []));
  }

  function updateLocalCell(row: ObjectInstance, column: string, value: unknown) {
    const updated = { ...row, properties: { ...(row.properties ?? {}), [column]: value } };
    setRows((current) => current.map((entry) => (entry.id === row.id ? updated : entry)));
    if (activeObjectVariable && activeObjectId === row.id) runtime.setActiveObject(activeObjectVariable.id, updated);
    if (selectedObjectVariable && selectedObjectIds.has(row.id)) {
      const current = runtime.variableEngine.getSelectedObjectSet(selectedObjectVariable.id) ?? [];
      runtime.setSelectedObjectSet(selectedObjectVariable.id, current.map((entry) => (entry.id === row.id ? updated : entry)));
    }
  }

  function runRowAction(row: ObjectInstance, action: ObjectTableRowAction) {
    activateRow(row);
    if (action.on_click_kind === 'action' && action.action_type_id) {
      runtime.onButtonClick({
        ...action,
        parameter_defaults: {
          object: { kind: 'active_object', variable_id: activeObjectVariable?.id, visibility: 'disabled' },
          target: { kind: 'active_object', variable_id: activeObjectVariable?.id, visibility: 'disabled' },
          target_object: { kind: 'active_object', variable_id: activeObjectVariable?.id, visibility: 'disabled' },
          ...(action.parameter_defaults ?? {}),
        },
      });
      return;
    }
    void runtime.dispatchEvents(widget, 'row_action', {
      ...objectTableRowPayload(row, selectedObjectVariable ? runtime.variableEngine.getSelectedObjectSet(selectedObjectVariable.id) ?? [] : []),
      row_action_id: action.id,
      row_action_label: action.label,
      row_action: action,
    });
  }

  function runSelectedAction(action: ObjectTableRowAction) {
    if (!selectedObjectVariable || selectedObjects.length === 0) return;
    if (action.on_click_kind === 'action' && action.action_type_id) {
      runtime.onButtonClick({
        ...action,
        parameter_defaults: {
          object: { kind: 'variable', variable_id: selectedObjectVariable.id, visibility: 'disabled' },
          objects: { kind: 'variable', variable_id: selectedObjectVariable.id, visibility: 'disabled' },
          target: { kind: 'variable', variable_id: selectedObjectVariable.id, visibility: 'disabled' },
          target_objects: { kind: 'variable', variable_id: selectedObjectVariable.id, visibility: 'disabled' },
          target_object_ids: { kind: 'variable', variable_id: selectedObjectVariable.id, visibility: 'disabled' },
          object_set: { kind: 'variable', variable_id: selectedObjectVariable.id, visibility: 'disabled' },
          selection: { kind: 'variable', variable_id: selectedObjectVariable.id, visibility: 'disabled' },
          ...(action.parameter_defaults ?? {}),
        },
      });
      return;
    }
    void runtime.dispatchEvents(widget, 'row_action', {
      ...objectTableSelectionPayload(selectedObjects),
      row_action_id: action.id,
      row_action_label: action.label,
      row_action: action,
    });
  }

  function toggleSort(column: string) {
    setSortState((current) => ({
      property: column,
      direction: current.property === column && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  const allVisibleSelected = multiSelect && selectedObjectVariable && sortedRows.slice(0, 100).length > 0 && sortedRows.slice(0, 100).every((row) => selectedObjectIds.has(row.id));
  const columnCount = visibleColumns.length + (multiSelect ? 1 : 0) + (rowActions.length > 0 ? 1 : 0);

  if (!objectTypeId) {
    return (
      <div style={{ padding: '36px 24px', textAlign: 'center' }}>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>Pick an Object set in the inspector to render this table.</p>
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: 360 }}>
      {multiSelect && selectedObjectVariable && selectedObjects.length > 0 && rowActions.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', background: '#f8fafc' }}>
          <span className="of-text-muted" style={{ fontSize: 12 }}>{selectedObjects.length} selected</span>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            {rowActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="of-button"
                onClick={() => runSelectedAction(action)}
                disabled={action.on_click_kind === 'action' && !action.action_type_id}
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                {action.label} selected
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <table className="of-table" style={{ width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            {multiSelect ? (
              <th style={{ width: 36, padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={Boolean(allVisibleSelected)}
                  disabled={!selectedObjectVariable || sortedRows.length === 0}
                  onChange={(event) => toggleAllSelected(event.target.checked)}
                />
              </th>
            ) : null}
            {visibleColumns.map((column) => (
              <th key={column} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => toggleSort(column)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontWeight: 600, color: 'inherit' }}
                >
                  {propertyByName.get(column)?.display_name || column}
                  {sortState.property === column ? <span style={{ color: 'var(--status-info)' }}>{sortState.direction === 'asc' ? '↑' : '↓'}</span> : null}
                </button>
              </th>
            ))}
            {rowActions.length > 0 ? (
              <th style={{ width: 1, whiteSpace: 'nowrap', padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-subtle)' }}>Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columnCount} style={{ padding: 16, textAlign: 'center' }}><span className="of-text-muted">Loading…</span></td></tr>
          ) : sortedRows.length === 0 ? (
            <tr><td colSpan={columnCount} style={{ padding: 16, textAlign: 'center' }}><span className="of-text-muted">No objects.</span></td></tr>
          ) : (
            sortedRows.slice(0, 100).map((row) => {
              const isActive = activeObjectId === row.id;
              const interactive = runtime.preview;
              const label = objectTableRowLabel(row, visibleColumns);
              return (
                <tr
                  key={row.id}
                  onClick={() => {
                    if (runtime.preview) activateRow(row);
                  }}
                  style={{ background: isActive ? 'rgba(45, 114, 210, 0.08)' : undefined, cursor: interactive ? 'pointer' : 'default' }}
                >
                  {multiSelect ? (
                    <td onClick={(event) => event.stopPropagation()} style={{ width: 36, padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${label}`}
                        checked={selectedObjectIds.has(row.id)}
                        disabled={!selectedObjectVariable}
                        onChange={(event) => toggleSelected(row, event.target.checked)}
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((column) => {
                    const property = propertyByName.get(column);
                    const value = (row.properties as Record<string, unknown>)?.[column];
                    return (
                      <td key={column} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', maxWidth: 260 }}>
                        {enableInlineEdit && property?.inline_edit_config ? (
                          <InlineEditCell
                            typeId={objectTypeId}
                            objectId={row.id}
                            property={property}
                            value={value}
                            onUpdated={(next) => updateLocalCell(row, column, next)}
                          />
                        ) : (
                          <span
                            title={formatObjectTableCell(value)}
                            style={{
                              display: '-webkit-box',
                              WebkitBoxOrient: 'vertical',
                              WebkitLineClamp: wrapValues ? rowHeightLines : 1,
                              overflow: 'hidden',
                              whiteSpace: wrapValues ? 'normal' : 'nowrap',
                              textOverflow: 'ellipsis',
                              lineHeight: '18px',
                              minHeight: `${18 * rowHeightLines}px`,
                            }}
                          >
                            {formatObjectTableCell(value)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {rowActions.length > 0 ? (
                    <td onClick={(event) => event.stopPropagation()} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {rowActions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            className="of-button of-button--ghost"
                            onClick={() => runRowAction(row, action)}
                            disabled={action.on_click_kind === 'action' && !action.action_type_id}
                            style={{ padding: '4px 8px', fontSize: 11 }}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatObjectTableCell(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function compareObjectTableValues(left: unknown, right: unknown) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  const leftNumber = typeof left === 'number' ? left : Number.parseFloat(String(left));
  const rightNumber = typeof right === 'number' ? right : Number.parseFloat(String(right));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function objectTableRowLabel(row: ObjectInstance, columns: string[]) {
  const props = row.properties ?? {};
  for (const column of columns) {
    const value = props[column];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return row.id;
}

function objectTableRowPayload(row: ObjectInstance, selectedObjects: ObjectInstance[]) {
  return {
    object_id: row.id,
    object_type_id: row.object_type_id,
    object: row,
    properties: row.properties,
    selected_object_ids: selectedObjects.map((entry) => entry.id),
    selected_objects: selectedObjects,
    selection_count: selectedObjects.length,
    ...(row.properties ?? {}),
  };
}

function objectTableSelectionPayload(selectedObjects: ObjectInstance[]) {
  return {
    object_ids: selectedObjects.map((entry) => entry.id),
    objects: selectedObjects,
    selected_object_ids: selectedObjects.map((entry) => entry.id),
    selected_objects: selectedObjects,
    selection_count: selectedObjects.length,
  };
}

export function MapWidgetView({ widget, variables }: { widget: AppWidget; variables: WorkshopVariable[] }) {
  const runtime = useRuntime();
  return (
    <div style={{ padding: 12, minHeight: 320 }}>
      <WorkshopMapWidget
        widget={widget}
        variables={variables}
        variableEngine={runtime.variableEngine}
        onSelectObject={(variableId, object) => runtime.setActiveObject(variableId, object)}
        onSelectObjectSet={(variableId, objects) => runtime.setSelectedObjectSet(variableId, objects)}
        onShapeChange={(variableId, shape) => runtime.setShapeOutput(variableId, shape)}
      />
    </div>
  );
}

function MapWidgetInspector({
  widget,
  variables,
  objectTypes,
  onChange,
  onRenameOutput,
  onDelete,
}: {
  widget: AppWidget;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onChange: (next: AppWidget) => void;
  onRenameOutput: (name: string, objectTypeId: string) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'setup' | 'metadata' | 'display'>('setup');
  const cfgLayers = readMapLayerConfigs(widget.props);
  const cfgOverlays = readMapOverlayConfigs(widget.props);
  const outputVariableId = (widget.props as { output_variable_id?: string })?.output_variable_id ?? '';
  const outputObjectSetVariableId = (widget.props as { output_object_set_variable_id?: string })?.output_object_set_variable_id ?? '';
  const outputShapeVariableId = (widget.props as { output_shape_variable_id?: string })?.output_shape_variable_id ?? '';
  const shapeSearchOutputVariableId = (widget.props as { shape_search_output_variable_id?: string })?.shape_search_output_variable_id ?? '';
  const outputVariable = variables.find((entry) => entry.id === outputVariableId) ?? null;
  const templateParameterValues = readMapTemplateParameterValuesForInspector(widget.props);
  const templateParameterMappings = readMapTemplateMappingsForInspector(widget.props);
  const booleanVariables = variables.filter((entry) => entry.kind === 'boolean' || entry.kind === 'primitive' || entry.kind === 'runtime_parameter' || entry.kind === 'url_parameter');
  const templateVariables = variables.filter((entry) => entry.id);

  function patchProps(patch: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patch } });
  }

  function patchLayers(layers: WorkshopMapLayerConfig[]) {
    patchProps({ layers });
  }

  function patchLayer(layerId: string, patch: Partial<WorkshopMapLayerConfig>) {
    const layers = cfgLayers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer));
    patchLayers(layers);
    const firstObjectTypeId = firstMapLayerObjectType(layers, variables);
    if (firstObjectTypeId) onRenameOutput(outputVariable?.name ?? `${widget.title} Selected object`, firstObjectTypeId);
  }

  function addLayer() {
    patchLayers([
      ...cfgLayers,
      {
        id: makeId('map_layer'),
        title: `Layer ${cfgLayers.length + 1}`,
        source: 'object_set',
        loading_mode: 'eager',
        source_variable_id: '',
        visibility_variable_id: '',
        object_type_id: '',
        tile_layer_id: '',
        tile_page_size: 500,
        tile_simplify_tolerance: 0,
        geometry_type: 'point',
        latitude_field: 'lat',
        longitude_field: 'lon',
        geometry_field: '',
        label_field: 'label',
        color: '#15803d',
        visible: true,
        locked: false,
        filter_field: '',
        filter_value: '',
        radius: 6,
        line_width: 3,
        fill_opacity: 0.22,
        cluster_enabled: false,
        cluster_radius: 64,
        cluster_max_zoom: 10,
        cluster_color: '#15803d',
      },
    ]);
  }

  function removeLayer(layerId: string) {
    patchLayers(cfgLayers.filter((layer) => layer.id !== layerId));
  }

  function patchOverlays(overlays: WorkshopMapOverlayLayerConfig[]) {
    patchProps({ overlay_layers: overlays });
  }

  function patchOverlay(overlayId: string, patch: Partial<WorkshopMapOverlayLayerConfig>) {
    patchOverlays(cfgOverlays.map((overlay) => (overlay.id === overlayId ? { ...overlay, ...patch } : overlay)));
  }

  function addOverlay() {
    patchOverlays([
      ...cfgOverlays,
      {
        id: makeId('map_overlay'),
        title: `Overlay ${cfgOverlays.length + 1}`,
        source: 'geojson_url',
        visibility_variable_id: '',
        url: '',
        resource_id: '',
        source_layer: '',
        geometry_type: 'auto',
        color: '#64748b',
        visible: true,
        opacity: 0.78,
        radius: 5,
        line_width: 2,
        fill_opacity: 0.14,
        min_zoom: 0,
        max_zoom: 22,
        attribution: '',
      },
    ]);
  }

  function removeOverlay(overlayId: string) {
    patchOverlays(cfgOverlays.filter((overlay) => overlay.id !== overlayId));
  }

  function patchTemplateParameterValue(index: number, patch: Partial<MapTemplateParameterValueEntry>) {
    const next = templateParameterValues.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry));
    patchProps({ template_parameter_values: Object.fromEntries(next.filter((entry) => entry.parameter_id.trim()).map((entry) => [entry.parameter_id.trim(), entry.value])) });
  }

  function addTemplateParameterValue() {
    const key = `parameter_${templateParameterValues.length + 1}`;
    patchProps({ template_parameter_values: { ...Object.fromEntries(templateParameterValues.map((entry) => [entry.parameter_id, entry.value])), [key]: '' } });
  }

  function removeTemplateParameterValue(index: number) {
    const next = templateParameterValues.filter((_, entryIndex) => entryIndex !== index);
    patchProps({ template_parameter_values: Object.fromEntries(next.map((entry) => [entry.parameter_id, entry.value])) });
  }

  function patchTemplateParameterMapping(index: number, patch: Partial<MapTemplateParameterMappingEntry>) {
    const next = templateParameterMappings.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry));
    patchProps({ template_parameter_mappings: next.filter((entry) => entry.parameter_id.trim() || entry.variable_id.trim()).map(({ parameter_id, variable_id }) => ({ parameter_id, variable_id })) });
  }

  function addTemplateParameterMapping() {
    patchProps({ template_parameter_mappings: [...templateParameterMappings, { parameter_id: `parameter_${templateParameterMappings.length + 1}`, variable_id: templateVariables[0]?.id ?? '' }].map(({ parameter_id, variable_id }) => ({ parameter_id, variable_id })) });
  }

  function removeTemplateParameterMapping(index: number) {
    const next = templateParameterMappings.filter((_, entryIndex) => entryIndex !== index);
    patchProps({ template_parameter_mappings: next.map(({ parameter_id, variable_id }) => ({ parameter_id, variable_id })) });
  }

  return (
    <div style={inspectorStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>MAP</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['setup', 'metadata', 'display'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: '8px 6px', border: 0, background: 'transparent', borderBottom: tab === value ? '2px solid var(--status-info)' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? 'var(--text-strong)' : 'var(--text-muted)', marginRight: 14 }}
          >
            {value === 'setup' ? 'Widget setup' : value === 'metadata' ? 'Metadata' : 'Display'}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Section title="Base map" />
          <Field label="Base layer">
            <select value={((widget.props as { base_layer_kind?: string })?.base_layer_kind) ?? 'blank'} onChange={(event) => patchProps({ base_layer_kind: event.target.value })} style={inputStyle()}>
              <option value="blank">OpenFoundry light background</option>
              <option value="raster">OpenStreetMap raster tiles</option>
            </select>
          </Field>
          {(((widget.props as { base_layer_kind?: string })?.base_layer_kind) ?? 'blank') !== 'blank' ? (
            <Field label="Base tile URL">
              <input value={((widget.props as { base_tile_url?: string })?.base_tile_url) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'} onChange={(event) => patchProps({ base_tile_url: event.target.value })} style={inputStyle()} />
            </Field>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Center latitude">
              <input type="number" step="0.000001" value={String((widget.props as { center_lat?: number })?.center_lat ?? 40.015)} onChange={(event) => patchProps({ center_lat: Number(event.target.value) })} style={inputStyle()} />
            </Field>
            <Field label="Center longitude">
              <input type="number" step="0.000001" value={String((widget.props as { center_lon?: number })?.center_lon ?? -105.2705)} onChange={(event) => patchProps({ center_lon: Number(event.target.value) })} style={inputStyle()} />
            </Field>
          </div>
          <Field label="Zoom">
            <input type="number" min={1} max={18} value={String((widget.props as { zoom?: number })?.zoom ?? 11)} onChange={(event) => patchProps({ zoom: Number(event.target.value) })} style={inputStyle()} />
          </Field>
          <Toggle label="Show legend" value={((widget.props as { show_legend?: boolean })?.show_legend) ?? true} onChange={(checked) => patchProps({ show_legend: checked })} />

          <Section title="Map template" />
          <Field label="Template resource ID">
            <input value={((widget.props as { map_template_id?: string; template_id?: string })?.map_template_id) ?? ((widget.props as { template_id?: string })?.template_id) ?? ''} onChange={(event) => patchProps({ map_template_id: event.target.value, template_id: undefined })} placeholder="Optional saved map template id" style={inputStyle()} />
          </Field>
          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Template parameter values</span>
            {templateParameterValues.map((entry, index) => (
              <div key={`${entry.parameter_id}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
                <input value={entry.parameter_id} onChange={(event) => patchTemplateParameterValue(index, { parameter_id: event.target.value })} placeholder="parameter" style={inputStyle()} />
                <input value={entry.value} onChange={(event) => patchTemplateParameterValue(index, { value: event.target.value })} placeholder="static value" style={inputStyle()} />
                <button type="button" aria-label="Remove template parameter value" onClick={() => removeTemplateParameterValue(index)} className="of-button of-button--ghost" style={{ padding: 6 }}>
                  <Glyph name="trash" size={11} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addTemplateParameterValue} className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
              <Glyph name="plus" size={11} /> Add parameter value
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Template variable mappings</span>
            {templateParameterMappings.map((entry, index) => (
              <div key={`${entry.parameter_id}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
                <input value={entry.parameter_id} onChange={(event) => patchTemplateParameterMapping(index, { parameter_id: event.target.value })} placeholder="template parameter" style={inputStyle()} />
                <select value={entry.variable_id} onChange={(event) => patchTemplateParameterMapping(index, { variable_id: event.target.value })} style={inputStyle()}>
                  <option value="">Select variable…</option>
                  {templateVariables.map((variable) => (
                    <option key={variable.id} value={variable.id}>{variable.name} ({VARIABLE_KIND_LABEL[variable.kind] ?? variable.kind})</option>
                  ))}
                </select>
                <button type="button" aria-label="Remove template variable mapping" onClick={() => removeTemplateParameterMapping(index)} className="of-button of-button--ghost" style={{ padding: 6 }}>
                  <Glyph name="trash" size={11} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addTemplateParameterMapping} className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
              <Glyph name="plus" size={11} /> Add variable mapping
            </button>
          </div>

          <Section title={`Object layers ${cfgLayers.length}`} />
          <div style={{ display: 'grid', gap: 8 }}>
            {cfgLayers.map((layer) => {
              const variable = variables.find((entry) => entry.id === layer.source_variable_id) ?? null;
              const objectTypeId = variable?.object_type_id || layer.object_type_id;
              const objectType = objectTypes.find((entry) => entry.id === objectTypeId) ?? null;
              return (
                <div key={layer.id} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Glyph name="graph" size={13} tone={layer.color} />
                    <input value={layer.title} onChange={(event) => patchLayer(layer.id, { title: event.target.value })} style={{ ...inputStyle(), flex: 1 }} />
                    {cfgLayers.length > 1 ? (
                      <button type="button" aria-label="Remove layer" onClick={() => removeLayer(layer.id)} style={{ border: 0, background: 'transparent', color: 'var(--status-danger)', cursor: 'pointer' }}>
                        <Glyph name="trash" size={11} />
                      </button>
                    ) : null}
                  </div>
                  <Field label="Input object set">
                    <select
                      value={layer.source === 'geospatial_tile' ? 'tile' : layer.source_variable_id ? `var:${layer.source_variable_id}` : layer.object_type_id ? `type:${layer.object_type_id}` : ''}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === 'tile') patchLayer(layer.id, { source: 'geospatial_tile', loading_mode: 'viewport_tiles', source_variable_id: '', object_type_id: '' });
                        else if (raw.startsWith('var:')) patchLayer(layer.id, { source: 'object_set', loading_mode: 'eager', source_variable_id: raw.slice(4), object_type_id: '', tile_layer_id: '' });
                        else if (raw.startsWith('type:')) patchLayer(layer.id, { source: 'object_type', loading_mode: 'eager', source_variable_id: '', object_type_id: raw.slice(5), tile_layer_id: '' });
                        else patchLayer(layer.id, { source: 'object_set', loading_mode: 'eager', source_variable_id: '', object_type_id: '', tile_layer_id: '' });
                      }}
                      style={inputStyle()}
                    >
                      <option value="">Select object set…</option>
                      <option value="tile">Viewport tile layer</option>
                      {variables
                        .filter((entry) => entry.kind === 'object_set' || entry.kind === 'object_set_definition' || entry.kind === 'filter_output')
                        .map((entry) => (
                          <option key={entry.id} value={`var:${entry.id}`}>{entry.name} ({VARIABLE_KIND_LABEL[entry.kind]})</option>
                        ))}
                      {objectTypes.map((type) => (
                        <option key={type.id} value={`type:${type.id}`}>{type.display_name || type.name}</option>
                      ))}
                    </select>
                    <span className="of-text-muted" style={{ marginTop: 4, fontSize: 11 }}>
                      Current value: {layer.source === 'geospatial_tile' ? (layer.tile_layer_id || 'tile layer not configured') : variable?.name ?? objectType?.display_name ?? objectType?.name ?? 'undefined'}
                    </span>
                  </Field>
                  <Field label="Visibility variable">
                    <select value={layer.visibility_variable_id} onChange={(event) => patchLayer(layer.id, { visibility_variable_id: event.target.value })} style={inputStyle()}>
                      <option value="">Static visibility</option>
                      {booleanVariables.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.name} ({VARIABLE_KIND_LABEL[entry.kind] ?? entry.kind})</option>
                      ))}
                    </select>
                  </Field>
                  {layer.source === 'geospatial_tile' ? (
                    <>
                      <Field label="Geospatial layer ID">
                        <input value={layer.tile_layer_id} onChange={(event) => patchLayer(layer.id, { tile_layer_id: event.target.value })} placeholder="geospatial layer UUID" style={inputStyle()} />
                      </Field>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Page size">
                          <input type="number" min={1} max={5000} value={String(layer.tile_page_size)} onChange={(event) => patchLayer(layer.id, { tile_page_size: Number(event.target.value) })} style={inputStyle()} />
                        </Field>
                        <Field label="Simplify tolerance">
                          <input type="number" min={0} step={0.0001} value={String(layer.tile_simplify_tolerance)} onChange={(event) => patchLayer(layer.id, { tile_simplify_tolerance: Number(event.target.value) })} style={inputStyle()} />
                        </Field>
                      </div>
                    </>
                  ) : null}
                  <Field label="Geometry">
                    <select value={layer.geometry_type} onChange={(event) => patchLayer(layer.id, { geometry_type: event.target.value as WorkshopMapLayerConfig['geometry_type'] })} style={inputStyle()}>
                      <option value="point">Point</option>
                      <option value="line">Line</option>
                      <option value="polygon">Polygon</option>
                      <option value="auto">Auto from GeoJSON</option>
                    </select>
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Latitude">
                      <input value={layer.latitude_field} onChange={(event) => patchLayer(layer.id, { latitude_field: event.target.value })} placeholder="lat" style={inputStyle()} />
                    </Field>
                    <Field label="Longitude">
                      <input value={layer.longitude_field} onChange={(event) => patchLayer(layer.id, { longitude_field: event.target.value })} placeholder="lon" style={inputStyle()} />
                    </Field>
                  </div>
                  <Field label="GeoJSON / geoshape">
                    <input value={layer.geometry_field} onChange={(event) => patchLayer(layer.id, { geometry_field: event.target.value })} placeholder="geometry" style={inputStyle()} />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8 }}>
                    <Field label="Label">
                      <input value={layer.label_field} onChange={(event) => patchLayer(layer.id, { label_field: event.target.value })} placeholder="name" style={inputStyle()} />
                    </Field>
                    <Field label="Color">
                      <input type="color" value={layer.color} onChange={(event) => patchLayer(layer.id, { color: event.target.value })} style={{ ...inputStyle(), padding: 2, height: 32 }} />
                    </Field>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Filter field">
                      <input value={layer.filter_field} onChange={(event) => patchLayer(layer.id, { filter_field: event.target.value })} placeholder="kind" style={inputStyle()} />
                    </Field>
                    <Field label="Filter value">
                      <input value={layer.filter_value} onChange={(event) => patchLayer(layer.id, { filter_value: event.target.value })} placeholder="trail_start" style={inputStyle()} />
                    </Field>
                  </div>
                  <Toggle label="Selectable" value={!layer.locked} onChange={(checked) => patchLayer(layer.id, { locked: !checked })} />
                  <Toggle label="Cluster points" value={layer.cluster_enabled} onChange={(checked) => patchLayer(layer.id, { cluster_enabled: checked })} />
                  {layer.cluster_enabled ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 96px', gap: 8 }}>
                      <Field label="Cluster radius">
                        <input type="number" min={24} max={160} value={String(layer.cluster_radius)} onChange={(event) => patchLayer(layer.id, { cluster_radius: Number(event.target.value) })} style={inputStyle()} />
                      </Field>
                      <Field label="Max cluster zoom">
                        <input type="number" min={1} max={18} value={String(layer.cluster_max_zoom)} onChange={(event) => patchLayer(layer.id, { cluster_max_zoom: Number(event.target.value) })} style={inputStyle()} />
                      </Field>
                      <Field label="Color">
                        <input type="color" value={layer.cluster_color || layer.color} onChange={(event) => patchLayer(layer.id, { cluster_color: event.target.value })} style={{ ...inputStyle(), padding: 2, height: 32 }} />
                      </Field>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <button type="button" onClick={addLayer} className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
              <Glyph name="plus" size={11} /> Add object layer
            </button>
          </div>

          <Section title={`Overlay layers ${cfgOverlays.length}`} />
          <div style={{ display: 'grid', gap: 8 }}>
            {cfgOverlays.map((overlay) => (
              <div key={overlay.id} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Glyph name="graph" size={13} tone={overlay.color} />
                  <input value={overlay.title} onChange={(event) => patchOverlay(overlay.id, { title: event.target.value })} style={{ ...inputStyle(), flex: 1 }} />
                  <button type="button" aria-label="Remove overlay" onClick={() => removeOverlay(overlay.id)} style={{ border: 0, background: 'transparent', color: 'var(--status-danger)', cursor: 'pointer' }}>
                    <Glyph name="trash" size={11} />
                  </button>
                </div>
                <Field label="Overlay source">
                  <select value={overlay.source} onChange={(event) => patchOverlay(overlay.id, { source: event.target.value as WorkshopMapOverlayLayerConfig['source'] })} style={inputStyle()}>
                    <option value="geojson_url">GeoJSON URL</option>
                    <option value="mvt_url">MVT URL</option>
                    <option value="saved_map_layer">Saved map layer resource</option>
                    <option value="raster_url">Raster tile URL</option>
                  </select>
                </Field>
                {overlay.source === 'saved_map_layer' ? (
                  <Field label="Saved layer resource ID">
                    <input value={overlay.resource_id} onChange={(event) => patchOverlay(overlay.id, { resource_id: event.target.value })} placeholder="geospatial layer id" style={inputStyle()} />
                  </Field>
                ) : (
                  <Field label={overlay.source === 'mvt_url' || overlay.source === 'raster_url' ? 'Tile URL template' : 'GeoJSON URL'}>
                    <input value={overlay.url} onChange={(event) => patchOverlay(overlay.id, { url: event.target.value })} placeholder={overlay.source === 'geojson_url' ? '/layers/trails.geojson' : 'https://tiles.example/{z}/{x}/{y}.pbf'} style={inputStyle()} />
                  </Field>
                )}
                {overlay.source === 'mvt_url' ? (
                  <Field label="MVT source layer">
                    <input value={overlay.source_layer} onChange={(event) => patchOverlay(overlay.id, { source_layer: event.target.value })} placeholder="layer name inside tile" style={inputStyle()} />
                  </Field>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 8 }}>
                  <Field label="Geometry">
                    <select value={overlay.geometry_type} onChange={(event) => patchOverlay(overlay.id, { geometry_type: event.target.value as WorkshopMapOverlayLayerConfig['geometry_type'] })} style={inputStyle()}>
                      <option value="auto">Auto</option>
                      <option value="point">Point</option>
                      <option value="line">Line</option>
                      <option value="polygon">Polygon</option>
                    </select>
                  </Field>
                  <Field label="Color">
                    <input type="color" value={overlay.color} onChange={(event) => patchOverlay(overlay.id, { color: event.target.value })} style={{ ...inputStyle(), padding: 2, height: 32 }} />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Opacity">
                    <input type="number" min={0} max={1} step={0.05} value={String(overlay.opacity)} onChange={(event) => patchOverlay(overlay.id, { opacity: Number(event.target.value) })} style={inputStyle()} />
                  </Field>
                  <Field label="Line width">
                    <input type="number" min={1} max={16} step={1} value={String(overlay.line_width)} onChange={(event) => patchOverlay(overlay.id, { line_width: Number(event.target.value) })} style={inputStyle()} />
                  </Field>
                </div>
                <Toggle label="Visible by default" value={overlay.visible} onChange={(checked) => patchOverlay(overlay.id, { visible: checked })} />
                <Field label="Visibility variable">
                  <select value={overlay.visibility_variable_id} onChange={(event) => patchOverlay(overlay.id, { visibility_variable_id: event.target.value })} style={inputStyle()}>
                    <option value="">Static visibility</option>
                    {booleanVariables.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name} ({VARIABLE_KIND_LABEL[entry.kind] ?? entry.kind})</option>
                    ))}
                  </select>
                </Field>
              </div>
            ))}
            <button type="button" onClick={addOverlay} className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
              <Glyph name="plus" size={11} /> Add overlay layer
            </button>
          </div>

          <Section title="Selected objects" />
          <Field label="Active object output">
            <select value={outputVariableId} onChange={(event) => patchProps({ output_variable_id: event.target.value })} style={inputStyle()}>
              <option value="">No selection output</option>
              {variables
                .filter((entry) => entry.kind === 'object_set_active_object')
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
            </select>
          </Field>
          <Field label="Selected object set output">
            <select value={outputObjectSetVariableId} onChange={(event) => patchProps({ output_object_set_variable_id: event.target.value })} style={inputStyle()}>
              <option value="">No object-set output</option>
              {variables
                .filter((entry) => entry.kind === 'object_set_selection')
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
            </select>
          </Field>
          <Toggle label="Shape drawing tools" value={((widget.props as { enable_shape_drawing?: boolean })?.enable_shape_drawing) ?? true} onChange={(checked) => patchProps({ enable_shape_drawing: checked })} />
          <Field label="Drawn shape output">
            <select value={outputShapeVariableId} onChange={(event) => patchProps({ output_shape_variable_id: event.target.value })} style={inputStyle()}>
              <option value="">No shape output</option>
              {variables
                .filter((entry) => entry.kind === 'shape_output')
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
            </select>
          </Field>
          <Field label="Shape search output">
            <select value={shapeSearchOutputVariableId} onChange={(event) => patchProps({ shape_search_output_variable_id: event.target.value })} style={inputStyle()}>
              <option value="">No search output</option>
              {variables
                .filter((entry) => entry.kind === 'object_set_selection')
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
            </select>
          </Field>
          <button type="button" className="of-button" onClick={onDelete} style={{ color: 'var(--status-danger)', borderColor: '#fecaca' }}>
            <Glyph name="trash" size={12} /> Delete widget
          </button>
        </div>
      ) : tab === 'display' ? (
        <DisplayTab widget={widget} onChange={onChange} />
      ) : (
        <div style={{ padding: 14 }}><p className="of-text-muted" style={{ fontSize: 12 }}>Widget metadata coming soon.</p></div>
      )}
    </div>
  );
}

function firstMapLayerObjectType(layers: WorkshopMapLayerConfig[], variables: WorkshopVariable[]) {
  for (const layer of layers) {
    const variable = variables.find((entry) => entry.id === layer.source_variable_id);
    if (variable?.object_type_id) return variable.object_type_id;
    if (layer.object_type_id) return layer.object_type_id;
  }
  return '';
}

interface MapTemplateParameterValueEntry {
  parameter_id: string;
  value: string;
}

interface MapTemplateParameterMappingEntry {
  parameter_id: string;
  variable_id: string;
}

function readMapTemplateParameterValuesForInspector(props: Record<string, unknown> | null | undefined): MapTemplateParameterValueEntry[] {
  const source = mapRecordProp(props?.template_parameter_values) ?? mapRecordProp(props?.parameter_values);
  if (!source) return [];
  return Object.entries(source).map(([parameter_id, value]) => ({
    parameter_id,
    value: value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function readMapTemplateMappingsForInspector(props: Record<string, unknown> | null | undefined): MapTemplateParameterMappingEntry[] {
  const source = props?.template_parameter_mappings ?? props?.parameter_mappings ?? props?.variable_mappings;
  const objectSource = mapRecordProp(source);
  if (objectSource) {
    return Object.entries(objectSource)
      .map(([parameter_id, value]) => ({ parameter_id, variable_id: typeof value === 'string' ? value : '' }))
      .filter((entry) => entry.parameter_id || entry.variable_id);
  }
  if (!Array.isArray(source)) return [];
  return source
    .filter(isMapRecord)
    .map((entry) => ({
      parameter_id: stringFromMapRecord(entry.parameter_id ?? entry.parameter_name ?? entry.id ?? entry.name),
      variable_id: stringFromMapRecord(entry.variable_id ?? entry.source_variable_id ?? entry.value),
    }))
    .filter((entry) => entry.parameter_id || entry.variable_id);
}

function mapRecordProp(value: unknown): Record<string, unknown> | null {
  return isMapRecord(value) ? value : null;
}

function isMapRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringFromMapRecord(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function ObjectSetPicker({ objectTypes, onClose, onSelect }: { objectTypes: ObjectType[]; onClose: () => void; onSelect: (typeId: string) => void }) {
  const [search, setSearch] = useState('');
  const filtered = objectTypes.filter((type) => `${type.display_name} ${type.name}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(17, 24, 39, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <section style={{ width: '100%', maxWidth: 720, height: 'min(540px, 90vh)', background: '#fff', borderRadius: 6, boxShadow: '0 20px 48px rgba(15, 23, 42, 0.2)', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Select starting object set</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="of-button of-button--ghost" style={{ padding: 4 }}><Glyph name="x" size={14} /></button>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
          <aside style={{ borderRight: '1px solid var(--border-subtle)', overflowY: 'auto', padding: 8 }}>
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 13, marginBottom: 8 }}
            />
            <p className="of-text-muted" style={{ margin: '4px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Search results</p>
            {filtered.map((type) => (
              <button key={type.id} type="button" onClick={() => onSelect(type.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, borderRadius: 4 }}>
                <Glyph name="cube" size={13} tone="var(--status-info)" />
                {type.display_name || type.name}
              </button>
            ))}
            {filtered.length === 0 ? (<p className="of-text-muted" style={{ padding: 12, fontSize: 12 }}>No results</p>) : null}
          </aside>
          <div style={{ padding: 18, overflowY: 'auto' }}>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>Pick an object type from the left to back the table.</p>
          </div>
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', padding: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" onClick={onClose} className="of-button">Cancel</button>
        </footer>
      </section>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{title}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

function inspectorStyle(): React.CSSProperties {
  return { display: 'grid', gap: 0 };
}

function inputStyle(): React.CSSProperties {
  return { padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, background: '#fff', fontSize: 13, color: 'var(--text-strong)', width: '100%' };
}

function linkBtnStyle(): React.CSSProperties {
  return { background: 'none', border: 0, padding: 0, color: 'var(--status-info)', cursor: 'pointer', fontSize: 12 };
}

function addWidgetItemStyle(): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13 };
}

export function ScenarioWidgetView({ widget }: { widget: AppWidget }) {
  const props = widget.props as Record<string, unknown>;
  const parameters = readScenarioParameters(props.parameters);
  const values = Object.fromEntries(parameters.map((parameter) => [parameter.name, scenarioValueString(parameter.default_value)]));
  const scenario = buildWorkshopScenarioValue({ parameters, values, status: 'draft', sourceWidgetId: widget.id });
  return (
    <div style={{ padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{typeof props.headline === 'string' ? props.headline : widget.title}</p>
          <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>Scenario variable {typeof props.output_variable_id === 'string' && props.output_variable_id ? props.output_variable_id : 'not configured'}</p>
        </div>
        <span className="of-chip">what-if</span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {parameters.map((parameter) => {
          const delta = scenario.deltas[parameter.name];
          return (
            <div key={parameter.name} style={{ display: 'grid', gap: 4, padding: 8, border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{parameter.label || parameter.name}</span>
              <input value={scenario.values[parameter.name] ?? ''} readOnly style={inputStyle()} />
              {delta?.delta_number !== undefined ? (
                <span style={{ fontSize: 11, color: delta.delta_number >= 0 ? '#15803d' : '#b42318' }}>Delta {delta.delta_number.toFixed(2)}</span>
              ) : null}
            </div>
          );
        })}
        {parameters.length === 0 ? <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Add scenario parameters in the inspector.</p> : null}
      </div>
    </div>
  );
}

function ScenarioWidgetInspector({
  widget,
  variables,
  outputName,
  onChange,
  onRenameOutput,
  onDelete,
}: {
  widget: AppWidget;
  variables: WorkshopVariable[];
  outputName: string;
  onChange: (next: AppWidget) => void;
  onRenameOutput: (name: string) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'setup' | 'metadata'>('setup');
  const props = widget.props as Record<string, unknown>;
  const parameters = readScenarioParameters(props.parameters);
  const outputVariableId = typeof props.output_variable_id === 'string' ? props.output_variable_id : '';
  const scenarioVariables = variables.filter((variable) => variable.kind === 'scenario');

  function patchProps(patch: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patch } });
  }

  function patchParameter(name: string, patch: Partial<WorkshopScenarioParameter>) {
    patchProps({
      parameters: parameters.map((parameter) => (parameter.name === name ? { ...parameter, ...patch } : parameter)),
    });
  }

  function removeParameter(name: string) {
    patchProps({ parameters: parameters.filter((parameter) => parameter.name !== name) });
  }

  function addParameter() {
    const nextName = `scenario_${parameters.length + 1}`;
    patchProps({
      parameters: [
        ...parameters,
        { name: nextName, label: `Scenario ${parameters.length + 1}`, type: 'number', default_value: '1.0', description: '' },
      ],
    });
  }

  return (
    <div style={inspectorStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>SCENARIO</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['setup', 'metadata'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: '8px 6px', border: 0, background: 'transparent', borderBottom: tab === value ? '2px solid var(--status-info)' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? 'var(--text-strong)' : 'var(--text-muted)', marginRight: 14 }}
          >
            {value === 'setup' ? 'Widget setup' : 'Metadata'}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Field label="Headline">
            <input value={typeof props.headline === 'string' ? props.headline : ''} onChange={(event) => patchProps({ headline: event.target.value })} style={inputStyle()} />
          </Field>
          <Field label="Output scenario variable">
            <select value={outputVariableId} onChange={(event) => patchProps({ output_variable_id: event.target.value })} style={inputStyle()}>
              <option value="">Select variable...</option>
              {scenarioVariables.map((variable) => (
                <option key={variable.id} value={variable.id}>{variable.name}</option>
              ))}
            </select>
          </Field>
          {outputVariableId ? (
            <Field label="Output variable name">
              <input value={outputName} onChange={(event) => onRenameOutput(event.target.value)} style={inputStyle()} />
            </Field>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="Apply label">
              <input value={typeof props.apply_label === 'string' ? props.apply_label : ''} onChange={(event) => patchProps({ apply_label: event.target.value })} style={inputStyle()} />
            </Field>
            <Field label="Reset label">
              <input value={typeof props.reset_label === 'string' ? props.reset_label : ''} onChange={(event) => patchProps({ reset_label: event.target.value })} style={inputStyle()} />
            </Field>
          </div>
          <Field label="Summary template">
            <input value={typeof props.summary_template === 'string' ? props.summary_template : ''} onChange={(event) => patchProps({ summary_template: event.target.value })} style={inputStyle()} />
          </Field>
          <Section title={`Parameters ${parameters.length}`} />
          <div style={{ display: 'grid', gap: 8 }}>
            {parameters.map((parameter) => (
              <div key={parameter.name} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Name">
                    <input value={parameter.name} onChange={(event) => patchParameter(parameter.name, { name: event.target.value.trim() || parameter.name })} style={inputStyle()} />
                  </Field>
                  <Field label="Label">
                    <input value={parameter.label ?? ''} onChange={(event) => patchParameter(parameter.name, { label: event.target.value })} style={inputStyle()} />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Type">
                    <select value={parameter.type ?? 'text'} onChange={(event) => patchParameter(parameter.name, { type: event.target.value })} style={inputStyle()}>
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="range">Range</option>
                      <option value="date">Date</option>
                    </select>
                  </Field>
                  <Field label="Baseline value">
                    <input value={scenarioValueString(parameter.default_value)} onChange={(event) => patchParameter(parameter.name, { default_value: event.target.value })} style={inputStyle()} />
                  </Field>
                </div>
                <Field label="Description">
                  <input value={parameter.description ?? ''} onChange={(event) => patchParameter(parameter.name, { description: event.target.value })} style={inputStyle()} />
                </Field>
                <button type="button" onClick={() => removeParameter(parameter.name)} className="of-link" style={{ ...linkBtnStyle(), justifySelf: 'end', color: 'var(--status-danger)' }}>
                  Remove parameter
                </button>
              </div>
            ))}
            <button type="button" onClick={addParameter} className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
              <Glyph name="plus" size={11} /> Add parameter
            </button>
          </div>
          <button type="button" onClick={onDelete} className="of-button" style={{ color: 'var(--status-danger)', borderColor: '#fecaca' }}>
            <Glyph name="trash" size={12} /> Delete widget
          </button>
        </div>
      ) : (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Field label="Title">
            <input value={widget.title} onChange={(event) => onChange({ ...widget, title: event.target.value })} style={inputStyle()} />
          </Field>
          <Field label="Description">
            <textarea value={widget.description ?? ''} onChange={(event) => onChange({ ...widget, description: event.target.value })} rows={3} style={{ ...inputStyle(), resize: 'vertical' }} />
          </Field>
        </div>
      )}
    </div>
  );
}

function readScenarioParameters(value: unknown): WorkshopScenarioParameter[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'parameter',
      label: typeof entry.label === 'string' ? entry.label : undefined,
      type: typeof entry.type === 'string' ? entry.type : 'text',
      default_value: entry.default_value ?? '',
      description: typeof entry.description === 'string' ? entry.description : undefined,
    }))
    .filter((entry) => entry.name.length > 0);
}

function scenarioValueString(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function FilterListGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 5h18l-7 9v6l-4-2v-4z" stroke="#5c7080" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function FreeFormAnalysisInspector({
  widget,
  variables,
  objectTypes,
  onChange,
  onRetypeOutput,
  onDelete,
}: {
  widget: AppWidget;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onChange: (next: AppWidget) => void;
  onRetypeOutput: (objectTypeId: string) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'setup' | 'metadata' | 'display'>('setup');
  const cfg = readFreeFormAnalysisProps(widget.props);
  const sourceVariable = variables.find((entry) => entry.id === cfg.sourceVariableId) ?? null;
  const objectTypeId = sourceVariable?.object_type_id || cfg.objectTypeId;
  const objectType = objectTypes.find((entry) => entry.id === objectTypeId) ?? null;

  function patchProps(patch: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patch } });
  }

  function setInputSource(next: string) {
    if (next.startsWith('var:')) {
      const variableId = next.slice(4);
      const variable = variables.find((entry) => entry.id === variableId);
      patchProps({ source_variable_id: variableId, object_type_id: '' });
      onRetypeOutput(variable?.object_type_id ?? '');
      return;
    }
    if (next.startsWith('type:')) {
      const typeId = next.slice(5);
      patchProps({ source_variable_id: '', object_type_id: typeId });
      onRetypeOutput(typeId);
      return;
    }
    patchProps({ source_variable_id: '', object_type_id: '' });
    onRetypeOutput('');
  }

  return (
    <div style={inspectorStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>FREE-FORM ANALYSIS</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['setup', 'metadata', 'display'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: '8px 6px', border: 0, background: 'transparent', borderBottom: tab === value ? '2px solid var(--status-info)' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? 'var(--text-strong)' : 'var(--text-muted)', marginRight: 14 }}
          >
            {value === 'setup' ? 'Widget setup' : value === 'metadata' ? 'Metadata' : 'Display'}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Section title="Input object set" />
          <Field label="Source">
            <select
              value={cfg.sourceVariableId ? `var:${cfg.sourceVariableId}` : cfg.objectTypeId ? `type:${cfg.objectTypeId}` : ''}
              onChange={(event) => setInputSource(event.target.value)}
              style={inputStyle()}
            >
              <option value="">Select object set...</option>
              {variables
                .filter((entry) => entry.kind === 'object_set' || entry.kind === 'object_set_definition' || entry.kind === 'object_set_selection')
                .map((variable) => (
                  <option key={variable.id} value={`var:${variable.id}`}>
                    {variable.name} ({VARIABLE_KIND_LABEL[variable.kind]})
                  </option>
                ))}
              {objectTypes.map((type) => (
                <option key={type.id} value={`type:${type.id}`}>{type.display_name || type.name}</option>
              ))}
            </select>
            <span className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>Current value: {sourceVariable ? sourceVariable.name : objectType ? objectType.display_name || objectType.name : 'undefined'}</span>
          </Field>

          <Section title="Output" />
          <Field label="Output object set variable">
            <select value={cfg.outputVariableId} onChange={(event) => patchProps({ output_variable_id: event.target.value })} style={inputStyle()}>
              <option value="">None</option>
              {variables.filter((entry) => entry.kind === 'object_set_selection').map((variable) => (
                <option key={variable.id} value={variable.id}>{variable.name}</option>
              ))}
            </select>
            <span className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>Filtered rows are published as an object set variable for downstream widgets.</span>
          </Field>

          <Section title="Exploration bounds" />
          <Field label="Max rows">
            <input type="number" min={1} max={10000} value={cfg.maxRows} onChange={(event) => patchProps({ max_rows: Number(event.target.value) })} style={inputStyle()} />
          </Field>
          <Toggle label="Enable path saving" value={cfg.enablePathSaving} onChange={(checked) => patchProps({ enable_path_saving: checked })} />

          <Section title="Empty state" />
          <Field label="Header">
            <input value={cfg.emptyStateHeader} onChange={(event) => patchProps({ empty_state_header: event.target.value })} style={inputStyle()} />
          </Field>
          <Field label="Description">
            <textarea rows={3} value={cfg.emptyStateDescription} onChange={(event) => patchProps({ empty_state_description: event.target.value })} style={inputStyle()} />
          </Field>

          <button type="button" onClick={onDelete} className="of-button" style={{ color: 'var(--status-danger)', borderColor: '#fecaca' }}>
            <Glyph name="trash" size={12} /> Delete widget
          </button>
        </div>
      ) : tab === 'display' ? (
        <DisplayTab widget={widget} onChange={onChange} />
      ) : (
        <div style={{ padding: 14 }}>
          <p className="of-text-muted" style={{ fontSize: 12 }}>Free-form analysis cards are added by users at runtime and constrained to the configured input object set.</p>
        </div>
      )}
    </div>
  );
}

export function FilterListWidgetView({ widget, variables = [] }: { widget: AppWidget; variables?: WorkshopVariable[] }) {
  const configuredFilters = ((widget.props as { filters?: FilterEntry[] })?.filters) ?? [];
  const layout = ((widget.props as { layout?: string })?.layout) ?? 'vertical';
  const allowAddRemove = Boolean((widget.props as { allow_add_remove?: boolean })?.allow_add_remove);
  const outputVariableId = (widget.props as { output_variable_id?: string })?.output_variable_id ?? '';
  const sourceVariableId = (widget.props as { source_variable_id?: string })?.source_variable_id ?? '';
  const sourceVariable = variables.find((entry) => entry.id === sourceVariableId) ?? null;
  const objectTypeId = sourceVariable?.object_type_id ?? (widget.props as { object_type_id?: string })?.object_type_id ?? '';
  const runtime = useRuntime();
  const [filters, setFilters] = useState<FilterEntry[]>(configuredFilters);
  const [properties, setProperties] = useState<Property[]>([]);
  const [sourceRows, setSourceRows] = useState<ObjectInstance[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [propertySearch, setPropertySearch] = useState('');

  useEffect(() => {
    setFilters(configuredFilters);
  }, [JSON.stringify(configuredFilters)]);

  useEffect(() => {
    if (!objectTypeId) {
      setProperties([]);
      setSourceRows([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      listProperties(objectTypeId),
      sourceVariableId
        ? runtime.executeObjectSet(sourceVariableId, { objectTypeId, limit: 5000 })
        : Promise.resolve({ data: [], total: 0, objectTypeId, source: 'object_type' as const, filters: [] }),
    ])
      .then(([propertyResponse, objectResponse]) => {
        if (cancelled) return;
        setProperties(propertyResponse);
        setSourceRows(objectResponse.data);
      })
      .catch(() => {
        if (cancelled) return;
        setProperties([]);
        setSourceRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [objectTypeId, runtime.executeObjectSet, sourceVariableId]);

  useEffect(() => {
    for (const filter of filters) {
      if (runtime.filterValues[filter.id]) continue;
      const defaults = filterDefaultRuntimeValue(filter);
      if (!filterRuntimeValueHasValue(defaults)) continue;
      runtime.setFilterValue(filter.id, defaults, filterRuntimeMetadata(widget.id, outputVariableId, filter));
    }
  }, [filters, outputVariableId, runtime, widget.id]);

  const availableProperties = useMemo(
    () => properties.filter((property) => !filters.some((filter) => filter.property_name === property.name)),
    [filters, properties],
  );
  const filteredProperties = availableProperties.filter((property) => `${property.display_name} ${property.name}`.toLowerCase().includes(propertySearch.toLowerCase()));

  function updateFilterValue(filter: FilterEntry, value: WorkshopFilterRuntimeValue) {
    runtime.setFilterValue(filter.id, value, filterRuntimeMetadata(widget.id, outputVariableId, filter));
    void runtime.dispatchEvents(widget, 'filter_change', {
      filter_id: filter.id,
      filter_name: filter.display_name,
      property_name: filter.property_name,
      value,
      filter_count: countActiveFilterValues({ ...runtime.filterValues, [filter.id]: value }, filters),
    });
  }

  function addRuntimeFilter(propertyName: string) {
    const property = properties.find((entry) => entry.name === propertyName);
    const next: FilterEntry = {
      id: makeId('runtime_filter'),
      property_name: propertyName,
      display_name: property?.display_name || propertyName,
      component: property && (property.property_type === 'integer' || property.property_type === 'float' || property.property_type === 'double' || property.property_type === 'long') ? 'range_numeric' : 'multi_select',
      values: [],
      range_min: '',
      range_max: '',
    };
    setFilters((current) => [...current, next]);
    setAddOpen(false);
    setPropertySearch('');
  }

  function removeRuntimeFilter(filter: FilterEntry) {
    updateFilterValue(filter, {});
    setFilters((current) => current.filter((entry) => entry.id !== filter.id));
  }

  function clearFilter(filter: FilterEntry) {
    updateFilterValue(filter, {});
  }

  function optionValuesFor(filter: FilterEntry) {
    const values = new Set<string>();
    for (const row of sourceRows) {
      const raw = row.properties?.[filter.property_name];
      if (raw === null || raw === undefined || raw === '') continue;
      values.add(String(raw));
    }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).slice(0, 30);
  }

  if (filters.length === 0 && !allowAddRemove) {
    return (
      <div style={{ padding: '36px 20px', textAlign: 'center' }}>
        <FilterListGlyph />
        <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600 }}>Filter list</p>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Select this widget to edit configuration.</p>
      </div>
    );
  }
  return (
    <div style={{ padding: 12, display: layout === 'pills' ? 'flex' : 'grid', flexWrap: layout === 'pills' ? 'wrap' : undefined, alignItems: layout === 'pills' ? 'flex-start' : undefined, gap: layout === 'pills' ? 8 : 12 }}>
      {filters.map((filter) => {
        const value = runtime.filterValues[filter.id] ?? filterDefaultRuntimeValue(filter);
        const interactive = runtime.preview;
        const selectedValues = value.values ?? [];
        const options = optionValuesFor(filter);
        return (
          <div
            key={filter.id}
            style={{
              display: 'grid',
              gap: 6,
              minWidth: layout === 'pills' ? 180 : undefined,
              padding: layout === 'pills' ? '8px 10px' : 0,
              border: layout === 'pills' ? '1px solid var(--border-subtle)' : 0,
              borderRadius: layout === 'pills' ? 999 : 0,
              background: layout === 'pills' ? '#fff' : 'transparent',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <span style={{ flex: 1 }}>{filter.display_name}</span>
              {filterRuntimeValueHasValue(value) ? (
                <button type="button" className="of-link" onClick={() => clearFilter(filter)} style={{ ...linkBtnStyle(), fontSize: 11 }}>Clear</button>
              ) : null}
              {allowAddRemove ? (
                <button type="button" aria-label={`Remove ${filter.display_name}`} onClick={() => removeRuntimeFilter(filter)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--status-danger)', padding: 0 }}>
                  <Glyph name="x" size={10} />
                </button>
              ) : null}
            </span>
            {filter.component === 'multi_select' ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <input
                  aria-label={`${filter.display_name} values`}
                  placeholder="Comma-separated values…"
                  value={selectedValues.join(', ')}
                  readOnly={!interactive}
                  onChange={(event) => updateFilterValue(filter, { ...value, values: splitFilterValues(event.target.value) })}
                  style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12, background: '#fff', minWidth: 0 }}
                />
                {options.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {options.map((option) => {
                      const active = selectedValues.map((entry) => entry.toLowerCase()).includes(option.toLowerCase());
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? selectedValues.filter((entry) => entry.toLowerCase() !== option.toLowerCase())
                              : [...selectedValues, option];
                            updateFilterValue(filter, { ...value, values: next });
                          }}
                          disabled={!interactive}
                          style={{ padding: '3px 8px', border: active ? '1px solid #2d72d2' : '1px solid var(--border-subtle)', borderRadius: 999, background: active ? 'rgba(45, 114, 210, 0.08)' : '#fff', cursor: interactive ? 'pointer' : 'default', fontSize: 11 }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : filter.component === 'search' ? (
              <input
                aria-label={filter.display_name}
                placeholder="Search…"
                value={value.search ?? ''}
                readOnly={!interactive}
                onChange={(event) => updateFilterValue(filter, { ...value, search: event.target.value })}
                style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12, background: '#fff' }}
              />
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  aria-label={`${filter.display_name} minimum`}
                  placeholder="Min"
                  value={value.range_min ?? ''}
                  readOnly={!interactive}
                  onChange={(event) => updateFilterValue(filter, { ...value, range_min: event.target.value })}
                  style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12, background: '#fff', flex: 1 }}
                />
                <input
                  aria-label={`${filter.display_name} maximum`}
                  placeholder="Max"
                  value={value.range_max ?? ''}
                  readOnly={!interactive}
                  onChange={(event) => updateFilterValue(filter, { ...value, range_max: event.target.value })}
                  style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 12, background: '#fff', flex: 1 }}
                />
              </div>
            )}
          </div>
        );
      })}
      {allowAddRemove ? (
        <div style={{ position: 'relative', alignSelf: layout === 'pills' ? 'stretch' : undefined }}>
          <button type="button" onClick={() => setAddOpen((open) => !open)} className="of-button" style={{ width: layout === 'pills' ? 'auto' : '100%', justifyContent: 'center', fontSize: 12 }}>
            <Glyph name="plus" size={11} /> Add filter
          </button>
          {addOpen ? (
            <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: 240, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 4, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: 6, zIndex: 20 }}>
              <input autoFocus value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} placeholder="Search property…" style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 13, marginBottom: 6 }} />
              {filteredProperties.length === 0 ? (
                <p className="of-text-muted" style={{ padding: 8, fontSize: 12, margin: 0 }}>No properties.</p>
              ) : filteredProperties.map((property) => (
                <button key={property.id} type="button" onClick={() => addRuntimeFilter(property.name)} style={addWidgetItemStyle()}>
                  <Glyph name="tag" size={11} tone="#5c7080" /> {property.display_name || property.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function filterRuntimeMetadata(sourceWidgetId: string, outputVariableId: string, filter: FilterEntry): WorkshopRuntimeFilterMetadata {
  return {
    outputVariableId,
    sourceWidgetId,
    propertyName: filter.property_name,
    component: filter.component,
  };
}

function filterDefaultRuntimeValue(filter: FilterEntry): WorkshopFilterRuntimeValue {
  if (filter.component === 'multi_select') return { values: splitFilterValues(filter.values ?? []) };
  if (filter.component === 'search') return { search: splitFilterValues(filter.values ?? [])[0] ?? '' };
  return {
    range_min: filter.range_min ?? '',
    range_max: filter.range_max ?? '',
  };
}

function splitFilterValues(value: string | string[]) {
  const parts = Array.isArray(value) ? value : value.split(',');
  return parts.map((entry) => entry.trim()).filter(Boolean);
}

function filterRuntimeValueHasValue(value: WorkshopFilterRuntimeValue | undefined) {
  if (!value) return false;
  return Boolean(
    value.search?.trim() ||
    value.range_min?.trim() ||
    value.range_max?.trim() ||
    (value.values ?? []).some((entry) => entry.trim()),
  );
}

function countActiveFilterValues(values: Record<string, WorkshopFilterRuntimeValue>, filters: FilterEntry[]) {
  return filters.reduce((count, filter) => count + (filterRuntimeValueHasValue(values[filter.id]) ? 1 : 0), 0);
}

function isObjectSetFilterVariable(variable: WorkshopVariable) {
  return variable.kind === 'object_set_filter' || variable.kind === 'filter_output';
}

function FilterListInspector({
  widget,
  variables,
  outputName,
  onChange,
  onRenameOutput,
  onRetypeOutput,
  onDelete,
}: {
  widget: AppWidget;
  objectTypes: ObjectType[];
  variables: WorkshopVariable[];
  outputName: string;
  onChange: (next: AppWidget) => void;
  onRenameOutput: (name: string) => void;
  onRetypeOutput: (objectTypeId: string) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'setup' | 'metadata' | 'display'>('setup');
  const sourceVariableId = (widget.props as { source_variable_id?: string })?.source_variable_id ?? '';
  const sourceVariable = variables.find((v) => v.id === sourceVariableId) ?? null;
  const objectTypeId = sourceVariable?.object_type_id ?? '';
  const filters: FilterEntry[] = ((widget.props as { filters?: FilterEntry[] })?.filters) ?? [];
  const allowAddRemove = Boolean((widget.props as { allow_add_remove?: boolean })?.allow_add_remove);
  const layout = ((widget.props as { layout?: 'vertical' | 'pills' })?.layout) ?? 'vertical';
  const [properties, setProperties] = useState<Property[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!objectTypeId) {
      setProperties([]);
      return;
    }
    let cancelled = false;
    void listProperties(objectTypeId)
      .then((response) => { if (!cancelled) setProperties(response); })
      .catch(() => { if (!cancelled) setProperties([]); });
    return () => { cancelled = true; };
  }, [objectTypeId]);

  function patchProps(patch: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patch } });
  }

  function addFilter(propertyName: string) {
    if (filters.some((entry) => entry.property_name === propertyName)) return;
    const property = properties.find((entry) => entry.name === propertyName);
    const next: FilterEntry = {
      id: makeId('filter'),
      property_name: propertyName,
      display_name: property?.display_name ?? propertyName,
      component: 'multi_select',
      values: [],
      range_min: '',
      range_max: '',
    };
    patchProps({ filters: [...filters, next] });
    setAddOpen(false);
    setSearch('');
  }

  function patchFilter(id: string, patch: Partial<FilterEntry>) {
    patchProps({ filters: filters.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) });
  }

  function removeFilter(id: string) {
    patchProps({ filters: filters.filter((entry) => entry.id !== id) });
  }

  const filteredProperties = properties.filter((entry) => `${entry.display_name} ${entry.name}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={inspectorStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>FILTER LIST</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['setup', 'metadata', 'display'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: '8px 6px', border: 0, background: 'transparent', borderBottom: tab === value ? '2px solid var(--status-info)' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? 'var(--text-strong)' : 'var(--text-muted)', marginRight: 14 }}
          >
            {value === 'setup' ? 'Widget setup' : value === 'metadata' ? 'Metadata' : 'Display'}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Display and update a filter variable that can be used to dynamically filter downstream object set variables.</p>
          <Section title="Input data" />
          <Field label="Object set">
            <select
              value={sourceVariableId}
              onChange={(event) => {
                const variableId = event.target.value;
                const variable = variables.find((entry) => entry.id === variableId) ?? null;
                patchProps({ source_variable_id: variableId, filters: [] });
                onRetypeOutput(variable?.object_type_id ?? '');
              }}
              style={inputStyle()}
            >
              <option value="">Select object set variable…</option>
              {variables
                .filter((v) => v.kind === 'object_set' || v.kind === 'object_set_definition')
                .map((variable) => (
                  <option key={variable.id} value={variable.id}>{variable.name}</option>
                ))}
            </select>
            {sourceVariable ? (
              <span className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>Current value: {sourceVariable.name}</span>
            ) : null}
          </Field>

          <Section title="Filters configuration" />
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>FILTER LIST</p>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Add, reorder and rename filters</p>
          {filters.length > 0 ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {filters.map((filter) => (
                <details key={filter.id} style={{ background: '#f4f6f9', border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
                  <summary style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer', listStyle: 'none', fontSize: 13 }}>
                    <Glyph name="move" size={12} tone="#aab4c0" />
                    <span style={{ flex: 1 }}>{filter.display_name}</span>
                    <Glyph name="chevron-down" size={11} />
                  </summary>
                  <div style={{ padding: '8px 12px', display: 'grid', gap: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <Field label="Filter name">
                      <input value={filter.display_name} onChange={(event) => patchFilter(filter.id, { display_name: event.target.value })} style={inputStyle()} />
                    </Field>
                    <Field label="Filter component">
                      <select value={filter.component} onChange={(event) => patchFilter(filter.id, { component: event.target.value as FilterComponent })} style={inputStyle()}>
                        {(Object.keys(FILTER_COMPONENT_LABEL) as FilterComponent[]).map((kind) => (
                          <option key={kind} value={kind}>{FILTER_COMPONENT_LABEL[kind]}</option>
                        ))}
                      </select>
                    </Field>
                    {filter.component === 'multi_select' ? (
                      <Field label="Default selected values">
                        <input
                          value={(filter.values ?? []).join(', ')}
                          onChange={(event) => patchFilter(filter.id, { values: splitFilterValues(event.target.value) })}
                          placeholder="Optional comma-separated defaults"
                          style={inputStyle()}
                        />
                      </Field>
                    ) : null}
                    {filter.component === 'search' ? (
                      <Field label="Default search">
                        <input
                          value={(filter.values ?? [])[0] ?? ''}
                          onChange={(event) => patchFilter(filter.id, { values: event.target.value.trim() ? [event.target.value] : [] })}
                          placeholder="Optional search text"
                          style={inputStyle()}
                        />
                      </Field>
                    ) : null}
                    {filter.component === 'range_numeric' || filter.component === 'range_date' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <Field label="Default min">
                          <input value={filter.range_min ?? ''} onChange={(event) => patchFilter(filter.id, { range_min: event.target.value })} style={inputStyle()} />
                        </Field>
                        <Field label="Default max">
                          <input value={filter.range_max ?? ''} onChange={(event) => patchFilter(filter.id, { range_max: event.target.value })} style={inputStyle()} />
                        </Field>
                      </div>
                    ) : null}
                    <button type="button" onClick={() => removeFilter(filter.id)} className="of-button" style={{ fontSize: 12, color: 'var(--status-danger)', borderColor: '#fecaca' }}>
                      <Glyph name="trash" size={11} /> Remove filter
                    </button>
                  </div>
                </details>
              ))}
            </div>
          ) : null}

          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setAddOpen((open) => !open)} className="of-button" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
              <Glyph name="plus" size={12} /> Add filter
            </button>
            {addOpen ? (
              <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 4, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: 6, zIndex: 5 }}>
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search property…" style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 13, marginBottom: 6 }} />
                <p className="of-text-muted" style={{ margin: '4px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter on a single property ({filteredProperties.length})</p>
                {filteredProperties.map((property) => (
                  <button key={property.id} type="button" onClick={() => addFilter(property.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
                    <Glyph name="tag" size={11} tone="#5c7080" />
                    {property.display_name || property.name}
                  </button>
                ))}
                {filteredProperties.length === 0 ? (<p className="of-text-muted" style={{ padding: 8, fontSize: 12 }}>No properties.</p>) : null}
              </div>
            ) : null}
          </div>

          <Toggle label="Allow users to add and remove filters" value={allowAddRemove} onChange={(checked) => patchProps({ allow_add_remove: checked })} />
          <Field label="Layout">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['vertical', 'pills'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => patchProps({ layout: kind })}
                  style={{ padding: '14px 10px', border: layout === kind ? '2px solid var(--status-info)' : '1px solid var(--border-default)', borderRadius: 6, background: layout === kind ? 'rgba(45, 114, 210, 0.04)' : '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'center' }}
                >
                  <div style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
                    <span style={{ width: 32, height: 8, background: '#aab4c0', borderRadius: kind === 'pills' ? 999 : 2 }} />
                    <span style={{ width: 32, height: 8, background: '#aab4c0', borderRadius: kind === 'pills' ? 999 : 2 }} />
                    <span style={{ width: 32, height: 8, background: '#aab4c0', borderRadius: kind === 'pills' ? 999 : 2 }} />
                  </div>
                  <p style={{ margin: '6px 0 0', fontWeight: 600 }}>{kind === 'vertical' ? 'Vertical' : 'Pills'}</p>
                </button>
              ))}
            </div>
          </Field>

          <Section title="Output data" />
          <Field label="Filter output">
            <input value={outputName} onChange={(event) => onRenameOutput(event.target.value)} style={inputStyle()} />
          </Field>

          <button type="button" onClick={onDelete} className="of-button" style={{ color: 'var(--status-danger)', borderColor: '#fecaca' }}>
            <Glyph name="trash" size={12} /> Delete widget
          </button>
        </div>
      ) : (
        <div style={{ padding: 14 }}><p className="of-text-muted" style={{ fontSize: 12 }}>{tab === 'metadata' ? 'Widget metadata' : 'Display options'} coming soon.</p></div>
      )}
    </div>
  );
}

function VariablesPanel({
  variables,
  widgets,
  addMenuOpen,
  onToggleAdd,
  onAdd,
  onRename,
  onSelect,
  onDelete,
}: {
  variables: WorkshopVariable[];
  widgets: AppWidget[];
  addMenuOpen: boolean;
  onToggleAdd: () => void;
  onAdd: (variable: WorkshopVariable) => void;
  onRename: (variableId: string, name: string) => void;
  onSelect: (variableId: string) => void;
  onDelete: (variableId: string) => void;
}) {
  function usedInCount(variableId: string) {
    let count = 0;
    for (const section of widgets) {
      for (const widget of section.children) {
        if ((widget.props as { source_variable_id?: string })?.source_variable_id === variableId) count += 1;
      }
    }
    return count;
  }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Variables ({variables.length})</p>
        <button type="button" onClick={onToggleAdd} className="of-button of-button--ghost" aria-label="Add variable" style={{ padding: 4 }}>
          <Glyph name="plus" size={14} />
        </button>
        {addMenuOpen ? (
          <div role="menu" style={{ position: 'absolute', top: '100%', right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 4, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)', padding: 6, zIndex: 5, minWidth: 240 }}>
            <p className="of-text-muted" style={{ margin: '4px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>OBJECT SET</p>
            <button
              type="button"
              onClick={() => onAdd({ id: makeId('var'), kind: 'object_set_definition', name: 'New object set', object_type_id: '' })}
              style={addWidgetItemStyle()}
            >
              <Glyph name="cube" size={13} tone="#2d72d2" />
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 13 }}>Object set definition</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Define an object set with filters and linked object traversals.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onAdd({ id: makeId('var'), kind: 'object_set_filter', name: 'New object set filter', object_type_id: '', static_filters: [] })}
              style={addWidgetItemStyle()}
            >
              <Glyph name="list" size={13} tone="#7c5dd6" />
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 13 }}>Object set filter</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Store filter state that can be applied to object sets.</span>
              </span>
            </button>
            <p className="of-text-muted" style={{ margin: '8px 6px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>VALUE</p>
            <button
              type="button"
              onClick={() => onAdd({ id: makeId('var'), kind: 'string', name: 'New string', object_type_id: '', default_value: '' })}
              style={addWidgetItemStyle()}
            >
              <Glyph name="tag" size={13} tone="#0891b2" />
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 13 }}>Primitive value</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Text, numeric, boolean, date, array, or struct value.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onAdd({ id: makeId('var'), kind: 'url_parameter', name: 'URL parameter', object_type_id: '', metadata: { parameter_name: 'param' } })}
              style={addWidgetItemStyle()}
            >
              <Glyph name="external-link" size={13} tone="#15803d" />
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 13 }}>URL/runtime parameter</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Read state from app URL or runtime parameters.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onAdd({ id: makeId('var'), kind: 'scenario', name: 'Scenario values', object_type_id: '', metadata: { parameters: [] } })}
              style={addWidgetItemStyle()}
            >
              <Glyph name="settings" size={13} tone="#c2410c" />
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 13 }}>Scenario variable</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Store what-if values, baselines, and deltas for charts, tables, and actions.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onAdd({ id: makeId('var'), kind: 'aggregation', name: 'New aggregation', object_type_id: '', metadata: { metric: 'count', source_variable_id: '' } })}
              style={addWidgetItemStyle()}
            >
              <Glyph name="graph" size={13} tone="#7c5dd6" />
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 13 }}>Aggregation</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Count or aggregate an object set variable.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onAdd({ id: makeId('var'), kind: 'function_output', name: 'Function output', object_type_id: NIL_OBJECT_TYPE_ID, metadata: { function_package_id: '', object_type_id: NIL_OBJECT_TYPE_ID, result_path: 'value', parameters: [] } })}
              style={addWidgetItemStyle()}
            >
              <Glyph name="code" size={13} tone="#c2410c" />
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 13 }}>Function output</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Call a Function with variable inputs and cache the result.</span>
              </span>
            </button>
          </div>
        ) : null}
      </div>
      <input type="search" placeholder="Search…" style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 13, width: '100%' }} />
      <div style={{ display: 'grid', gap: 4 }}>
        {variables.length === 0 ? (
          <p className="of-text-muted" style={{ fontSize: 12, padding: 8 }}>No variables yet.</p>
        ) : (
          variables.map((variable) => (
            <div
              key={variable.id}
              style={{ display: 'grid', gap: 4, padding: '6px 8px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#fff' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Glyph name={variable.kind === 'filter_output' || variable.kind === 'object_set_filter' ? 'list' : variable.kind === 'function_output' ? 'code' : variable.kind === 'scenario' ? 'settings' : 'cube'} size={13} tone={variable.kind === 'filter_output' || variable.kind === 'object_set_filter' ? '#7c5dd6' : variable.kind === 'function_output' || variable.kind === 'scenario' ? '#c2410c' : '#2d72d2'} />
                <input
                  value={variable.name}
                  onChange={(event) => onRename(variable.id, event.target.value)}
                  style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 600 }}
                />
                {variable.kind === 'object_set_definition' || variable.kind === 'function_output' ? (
                  <button type="button" aria-label="Edit definition" onClick={() => onSelect(variable.id)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <Glyph name="pencil" size={12} />
                  </button>
                ) : null}
                <button type="button" aria-label="Delete" onClick={() => onDelete(variable.id)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--status-danger)' }}>
                  <Glyph name="x" size={11} />
                </button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {VARIABLE_KIND_LABEL[variable.kind]} · Used in {usedInCount(variable.id)} widget{usedInCount(variable.id) === 1 ? '' : 's'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ObjectSetDefinitionEditor({
  variable,
  variables,
  objectTypes,
  onClose,
  onChange,
}: {
  variable: WorkshopVariable | null;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onClose: () => void;
  onChange: (next: WorkshopVariable) => void;
}) {
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  if (!variable) return null;
  const currentVariable = variable;
  const metadata = currentVariable.metadata ?? {};
  const searchAround = (metadata.search_around && typeof metadata.search_around === 'object' && !Array.isArray(metadata.search_around))
    ? metadata.search_around as Record<string, unknown>
    : {};
  function patchMetadata(patch: Record<string, unknown>) {
    onChange({ ...currentVariable, metadata: { ...(currentVariable.metadata ?? {}), ...patch } });
  }
  function patchSearchAround(patch: Record<string, unknown>) {
    patchMetadata({ search_around: { ...searchAround, ...patch } });
  }
  return (
    <aside
      style={{
        position: 'fixed',
        top: 56,
        left: 56,
        width: 460,
        maxHeight: 'calc(100vh - 100px)',
        background: '#fff',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
        zIndex: 80,
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <Glyph name="cube" size={14} tone="#2d72d2" />
        <input
          value={currentVariable.name}
          onChange={(event) => onChange({ ...currentVariable, name: event.target.value })}
          style={{ flex: 1, border: 0, outline: 'none', fontSize: 14, fontWeight: 600 }}
        />
        <button type="button" aria-label="Close" onClick={onClose} className="of-button of-button--ghost" style={{ padding: 4 }}>
          <Glyph name="x" size={12} />
        </button>
      </header>
      <div style={{ padding: 14, display: 'grid', gap: 14, overflowY: 'auto' }}>
        <Field label="Starting object set">
          <select
            value={currentVariable.object_type_id}
            onChange={(event) => onChange({ ...currentVariable, object_type_id: event.target.value })}
            style={inputStyle()}
          >
            <option value="">Select object type…</option>
            {objectTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
            ))}
          </select>
        </Field>
        <Field label="From variable">
          <select
            value={currentVariable.source_variable_id ?? ''}
            onChange={(event) => onChange({ ...currentVariable, source_variable_id: event.target.value })}
            style={inputStyle()}
          >
            <option value="">Start from object type</option>
            {variables
              .filter((entry) => entry.id !== currentVariable.id && (entry.kind === 'object_set' || entry.kind === 'object_set_definition' || entry.kind === 'object_set_selection'))
              .map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
          </select>
        </Field>
        <Field label="Saved object set ID">
          <input
            value={currentVariable.saved_object_set_id ?? String(currentVariable.metadata?.saved_object_set_id ?? '')}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ ...currentVariable, saved_object_set_id: value, metadata: { ...(currentVariable.metadata ?? {}), saved_object_set_id: value } });
            }}
            placeholder="Optional saved object set id"
            style={inputStyle()}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Filter…</span>
          <div style={{ display: 'grid', gap: 4 }}>
            <button type="button" disabled className="of-button" style={{ justifyContent: 'flex-start', fontSize: 12 }}>
              <Glyph name="plus" size={11} /> On a property
            </button>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setFilterMenuOpen((open) => !open)}
                className="of-button"
                style={{ justifyContent: 'flex-start', fontSize: 12, width: '100%' }}
              >
                <span style={{ fontFamily: 'serif', fontStyle: 'italic', color: '#7c5dd6' }}>(x)</span> Using a variable
                {currentVariable.filter_variable_id ? (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--status-info)' }}>
                    {variables.find((v) => v.id === currentVariable.filter_variable_id)?.name ?? ''}
                  </span>
                ) : null}
              </button>
              {filterMenuOpen ? (
                <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 4, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: 4, zIndex: 5 }}>
                  {variables.filter(isObjectSetFilterVariable).length === 0 ? (
                    <p className="of-text-muted" style={{ padding: 6, fontSize: 12 }}>No filter outputs available.</p>
                  ) : (
                    variables.filter(isObjectSetFilterVariable).map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => {
                          onChange({ ...currentVariable, filter_variable_id: source.id });
                          setFilterMenuOpen(false);
                        }}
                        style={addWidgetItemStyle()}
                      >
                        <Glyph name="list" size={12} tone="#7c5dd6" /> {source.name}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <button type="button" disabled className="of-button" style={{ justifyContent: 'flex-start', fontSize: 12 }}>
              <Glyph name="link" size={11} /> On a link
            </button>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Traverse to</span>
          <div style={{ display: 'grid', gap: 6 }}>
            <select
              value={String(searchAround.source_variable_id ?? '')}
              onChange={(event) => patchSearchAround({ source_variable_id: event.target.value })}
              style={inputStyle()}
            >
              <option value="">No search-around source</option>
              {variables
                .filter((entry) => entry.id !== currentVariable.id && (entry.kind === 'object_set' || entry.kind === 'object_set_definition' || entry.kind === 'object_set_selection'))
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
            </select>
            <input
              value={String(searchAround.radius_miles ?? '')}
              onChange={(event) => patchSearchAround({ radius_miles: event.target.value })}
              placeholder="Radius in miles"
              style={inputStyle()}
            />
          </div>
        </div>
        <button type="button" disabled className="of-button" style={{ justifyContent: 'flex-start', fontSize: 12 }}>
          <Glyph name="plus" size={11} /> Combine with another object set
        </button>
      </div>
    </aside>
  );
}

function FunctionVariableEditor({
  variable,
  variables,
  objectTypes,
  onClose,
  onChange,
}: {
  variable: WorkshopVariable | null;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onClose: () => void;
  onChange: (next: WorkshopVariable) => void;
}) {
  const [packages, setPackages] = useState<FunctionPackage[]>([]);
  const [search, setSearch] = useState('');
  const config = variable ? readFunctionVariableConfig(variable) : readFunctionVariableConfig({ id: '', kind: 'function_output', name: '', object_type_id: '' });
  useEffect(() => {
    let cancelled = false;
    void listFunctionPackages({ search: search || undefined, per_page: 100 })
      .then((response) => {
        if (!cancelled) setPackages(response.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setPackages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  if (!variable) return null;
  const currentVariable = variable;

  function patch(next: Partial<WorkshopVariable>) {
    onChange({ ...currentVariable, ...next });
  }
  function patchMetadata(patchObj: Record<string, unknown>) {
    patch({ metadata: { ...(currentVariable.metadata ?? {}), ...patchObj } });
  }
  function patchParameters(parameters: WorkshopFunctionParameterBinding[]) {
    patchMetadata({ parameters });
  }
  function patchParameter(index: number, patchObj: Partial<WorkshopFunctionParameterBinding>) {
    patchParameters(config.parameters.map((entry, idx) => (idx === index ? { ...entry, ...patchObj } : entry)));
  }
  const selectedPackage = packages.find((entry) => entry.id === config.function_package_id) ?? null;
  const valueVariables = variables.filter((entry) => entry.id !== currentVariable.id);

  return (
    <aside
      style={{
        position: 'fixed',
        top: 56,
        left: 56,
        width: 480,
        maxHeight: 'calc(100vh - 100px)',
        background: '#fff',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
        zIndex: 80,
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <Glyph name="code" size={14} tone="#c2410c" />
        <input
          value={currentVariable.name}
          onChange={(event) => patch({ name: event.target.value })}
          style={{ flex: 1, border: 0, outline: 'none', fontSize: 14, fontWeight: 600 }}
        />
        <button type="button" aria-label="Close" onClick={onClose} className="of-button of-button--ghost" style={{ padding: 4 }}>
          <Glyph name="x" size={12} />
        </button>
      </header>
      <div style={{ padding: 14, display: 'grid', gap: 14, overflowY: 'auto' }}>
        <Section title="Function" />
        <Field label="Search functions">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search packages…" style={inputStyle()} />
        </Field>
        <Field label="Function package">
          <select value={config.function_package_id} onChange={(event) => patchMetadata({ function_package_id: event.target.value })} style={inputStyle()}>
            <option value="">Select Function…</option>
            {selectedPackage && !packages.some((entry) => entry.id === selectedPackage.id) ? (
              <option value={selectedPackage.id}>{selectedPackage.display_name || selectedPackage.name}</option>
            ) : null}
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>{pkg.display_name || pkg.name} ({pkg.version})</option>
            ))}
          </select>
        </Field>
        <Field label="Object type context">
          <select
            value={config.object_type_id || NIL_OBJECT_TYPE_ID}
            onChange={(event) => {
              patch({ object_type_id: event.target.value, metadata: { ...(currentVariable.metadata ?? {}), object_type_id: event.target.value } });
            }}
            style={inputStyle()}
          >
            <option value={NIL_OBJECT_TYPE_ID}>No object context</option>
            {objectTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Result path">
          <input
            value={config.result_path}
            onChange={(event) => patchMetadata({ result_path: event.target.value })}
            placeholder="value, score, result.effort"
            style={inputStyle()}
          />
        </Field>
        <Field label="Target object variable">
          <select value={config.target_object_variable_id} onChange={(event) => patchMetadata({ target_object_variable_id: event.target.value })} style={inputStyle()}>
            <option value="">No target object</option>
            {variables
              .filter((entry) => entry.id !== currentVariable.id && (entry.kind === 'object_set_active_object' || entry.kind === 'object_set_selection' || entry.kind === 'object_set' || entry.kind === 'object_set_definition'))
              .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </Field>

        <Section title="Parameters" />
        <button type="button" className="of-button" onClick={() => patchParameters([...config.parameters, { name: `input_${config.parameters.length + 1}`, kind: 'static', value: '' }])} style={{ fontSize: 12, justifyContent: 'center' }}>
          <Glyph name="plus" size={11} /> Add parameter
        </button>
        {config.parameters.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No parameters configured.</p>
        ) : config.parameters.map((parameter, index) => (
          <div key={`${parameter.name}-${index}`} style={{ border: '1px solid var(--border-subtle)', borderRadius: 4, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                value={parameter.name}
                onChange={(event) => patchParameter(index, { name: event.target.value })}
                placeholder="parameter_name"
                style={{ ...inputStyle(), flex: 1 }}
              />
              <button type="button" aria-label="Remove parameter" onClick={() => patchParameters(config.parameters.filter((_, idx) => idx !== index))} style={{ border: 0, background: 'transparent', color: 'var(--status-danger)', cursor: 'pointer' }}>
                <Glyph name="trash" size={12} />
              </button>
            </div>
            <Field label="Value source">
              <select
                value={parameter.kind === 'variable' ? `var:${parameter.variable_id ?? ''}` : 'static'}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw.startsWith('var:')) patchParameter(index, { kind: 'variable', variable_id: raw.slice(4) });
                  else patchParameter(index, { kind: 'static', variable_id: '', value: '' });
                }}
                style={inputStyle()}
              >
                <option value="static">Static value</option>
                {valueVariables.map((entry) => <option key={entry.id} value={`var:${entry.id}`}>{entry.name}</option>)}
              </select>
            </Field>
            {parameter.kind === 'static' ? (
              <Field label="Static value">
                <input value={String(parameter.value ?? '')} onChange={(event) => patchParameter(index, { value: event.target.value })} style={inputStyle()} />
              </Field>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}


function SectionToolbar({ label, onAddSection, onSplit }: { label: string; onAddSection: () => void; onSplit: (direction: "above" | "below" | "left" | "right") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 4, marginBottom: 12, position: "relative" }}>
      <span className="of-text-muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>{label}</span>
      <button type="button" className="of-button" onClick={onAddSection} style={{ fontSize: 12 }}>
        <Glyph name="plus" size={12} /> Add section inside
      </button>
      <div style={{ width: 1, height: 18, background: "var(--border-subtle)", margin: "0 4px" }} />
      <span className="of-text-muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>SPLIT CURRENT SECTION</span>
      <button type="button" aria-label="Split above" onClick={() => onSplit("above")} className="of-button of-button--ghost" style={{ padding: 4 }}><SplitGlyph dir="above" /></button>
      <button type="button" aria-label="Split below" onClick={() => onSplit("below")} className="of-button of-button--ghost" style={{ padding: 4 }}><SplitGlyph dir="below" /></button>
      <button type="button" aria-label="Split left" onClick={() => onSplit("left")} className="of-button of-button--ghost" style={{ padding: 4 }}><SplitGlyph dir="left" /></button>
      <button type="button" aria-label="Split right" onClick={() => onSplit("right")} className="of-button of-button--ghost" style={{ padding: 4 }}><SplitGlyph dir="right" /></button>
      <button type="button" className="of-button" onClick={() => setOpen((value) => !value)} style={{ fontSize: 12 }}>
        <Glyph name="move" size={12} /> Split section <Glyph name="chevron-down" size={11} />
      </button>
      {open ? (
        <div role="menu" style={{ position: "absolute", top: "100%", right: 0, background: "#fff", border: "1px solid var(--border-default)", borderRadius: 4, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)", padding: 4, marginTop: 4, zIndex: 20, minWidth: 220 }}>
          {(["above", "below", "left", "right"] as const).map((dir) => (
            <button key={dir} type="button" onClick={() => { onSplit(dir); setOpen(false); }} style={addWidgetItemStyle()}>
              <SplitGlyph dir={dir} />
              New section on {dir === "above" ? "top" : dir === "below" ? "bottom" : dir}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SplitGlyph({ dir }: { dir: "above" | "below" | "left" | "right" }) {
  const map = {
    above: { x: 4, y: 4, w: 16, h: 7 },
    below: { x: 4, y: 13, w: 16, h: 7 },
    left: { x: 4, y: 4, w: 7, h: 16 },
    right: { x: 13, y: 4, w: 7, h: 16 },
  } as const;
  const r = map[dir];
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="1.5" stroke="#5c7080" strokeWidth="1.4" />
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#2d72d2" opacity="0.25" />
    </svg>
  );
}

export function ObjectSetTitleWidgetView({ widget, variables = [], objectTypes = [] }: { widget: AppWidget; variables?: WorkshopVariable[]; objectTypes?: ObjectType[] }) {
  const cfg = readObjectSetTitleProps(widget.props as Record<string, unknown>);
  const sourceVariableId = cfg.source_variable_id;
  const variable = variables.find((v) => v.id === sourceVariableId) ?? null;
  const emptyObjectType = objectTypes.find((t) => t.id === cfg.empty_object_type_id) ?? null;
  const objectTypeId = variable?.object_type_id || emptyObjectType?.id || "";
  const objectType = objectTypes.find((t) => t.id === objectTypeId) ?? emptyObjectType;
  const runtime = useRuntime();
  const selectedObjects = variable?.kind === "object_set_selection" ? runtime.variableEngine.getSelectedObjectSet(sourceVariableId) ?? EMPTY_SELECTED_OBJECTS : null;
  const activeObject = variable?.kind === 'object_set_active_object' ? runtime.variableEngine.getActiveObject(sourceVariableId) : null;
  const [result, setResult] = useState<{ objects: ObjectInstance[]; total: number; loading: boolean }>({ objects: [], total: 0, loading: Boolean(variable && objectTypeId) });
  useEffect(() => {
    if (!variable || !objectTypeId) {
      setResult({ objects: [], total: 0, loading: false });
      return;
    }
    if (activeObject) {
      setResult({ objects: [activeObject], total: 1, loading: false });
      return;
    }
    if (selectedObjects !== null) {
      setResult({ objects: selectedObjects, total: selectedObjects.length, loading: false });
      return;
    }
    let cancelled = false;
    setResult((current) => ({ ...current, loading: true }));
    void runtime.executeObjectSet(sourceVariableId, { objectTypeId, limit: cfg.contains_single_object ? 1 : 5000 })
      .then((response) => {
        if (!cancelled) setResult({ objects: response.data, total: response.total, loading: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ objects: [], total: 0, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [activeObject, cfg.contains_single_object, objectTypeId, runtime.executeObjectSet, selectedObjects, sourceVariableId, variable]);
  if (!variable) {
    return <div style={{ padding: 12 }}><p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Select an object set in the inspector.</p></div>;
  }
  const model = buildObjectSetTitleModel({
    props: cfg,
    variableName: variable.name,
    objectType,
    emptyObjectType,
    objects: result.objects,
    total: result.total,
    loading: result.loading,
  });
  if (!model.shouldRender) return null;
  const glyphName = safeGlyphName(model.icon);
  return (
    <div
      data-testid="object-set-title-widget"
      style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}
    >
      {model.showIcon ? (
        <span style={{ width: 30, height: 30, borderRadius: 6, display: 'grid', placeItems: 'center', background: `${model.color}18`, color: model.color, flex: '0 0 auto' }}>
          <Glyph name={glyphName} size={17} tone={model.color} />
        </span>
      ) : null}
      <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
        <strong style={{ fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.title}</strong>
        {model.subtitle ? <span className="of-text-muted" style={{ fontSize: 12 }}>{model.subtitle}</span> : null}
      </span>
    </div>
  );
}

const OBJECT_SET_TITLE_GLYPHS = new Set<GlyphName>([
  'cube',
  'object',
  'database',
  'list',
  'run',
  'tag',
  'project',
  'document',
  'spreadsheet',
  'image',
  'users',
  'graph',
]);

function safeGlyphName(name: string): GlyphName {
  return OBJECT_SET_TITLE_GLYPHS.has(name as GlyphName) ? name as GlyphName : 'cube';
}

export function MetricCardWidgetView({ widget, variables: _variables = [] }: { widget: AppWidget; variables?: WorkshopVariable[] }) {
  const runtime = useRuntime();
  const cfg = readMetricCardProps(widget.props as Record<string, unknown>);
  const metrics = useMemo(() => resolveMetricCardMetrics(cfg, runtime.variableEngine), [cfg, runtime.variableEngine]);
  const isTag = cfg.layout_style === 'tag';
  const isList = cfg.layout_style === 'list';
  const direction = cfg.direction === 'vertical' ? 'column' : 'row';
  const valueFontSize = cfg.metric_size === 'large' ? 34 : cfg.metric_size === 'compact' ? 20 : 28;

  if (metrics.length === 0) {
    return (
      <section aria-label={widget.title || 'Metric Card'} style={{ padding: 12 }}>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Add at least one metric in the inspector.</p>
      </section>
    );
  }

  return (
    <section aria-label={widget.title || 'Metric Card'} style={{ padding: 12, display: 'grid', gap: 10 }}>
      {(cfg.label || widget.title) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Glyph name="sparkles" size={13} tone="#15803d" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
            {cfg.label || widget.title}
          </span>
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: direction,
          flexWrap: cfg.direction === 'horizontal' ? 'wrap' : 'nowrap',
          gap: 8,
          alignItems: cfg.direction === 'horizontal' ? 'stretch' : 'stretch',
        }}
      >
        {metrics.map((metric) => {
          const metricStyle = metricCardMetricStyle(cfg.layout_style, metric.style.backgroundColor);
          const content = (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {metric.label}
                </span>
                {metric.description ? (
                  <span title={metric.description} aria-label={metric.description} style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                    <Glyph name="info" size={12} />
                  </span>
                ) : null}
              </div>
              <div style={{ display: cfg.template === 'side_by_side' && !isTag ? 'flex' : 'grid', alignItems: 'baseline', gap: cfg.template === 'side_by_side' ? 10 : 2 }}>
                <strong style={{ fontSize: isTag ? 16 : valueFontSize, lineHeight: 1.05, color: metric.style.color ?? 'var(--text-strong)', wordBreak: 'break-word' }}>
                  {metric.displayValue}
                </strong>
                {metric.secondary ? (
                  <span style={{ fontSize: isTag ? 12 : 13, color: metric.secondary.style.color ?? 'var(--text-muted)', fontWeight: 600 }}>
                    {metric.secondary.label ? `${metric.secondary.label}: ` : ''}{metric.secondary.displayValue}
                  </span>
                ) : null}
              </div>
            </>
          );
          if (isList) {
            return (
              <div key={metric.id} style={{ ...metricStyle, display: 'grid', gridTemplateColumns: cfg.template === 'side_by_side' ? 'minmax(0, 1fr) auto' : '1fr', gap: 6 }}>
                {content}
              </div>
            );
          }
          return (
            <div key={metric.id} style={{ ...metricStyle, flex: isTag ? '0 0 auto' : '1 1 180px' }}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function metricCardMetricStyle(layout: MetricCardLayoutStyle, conditionalBackground?: string): React.CSSProperties {
  if (layout === 'tag') {
    return {
      display: 'grid',
      gap: 3,
      padding: '7px 12px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 999,
      background: conditionalBackground ?? '#f7f9fa',
      minWidth: 120,
    };
  }
  if (layout === 'list') {
    return {
      padding: '8px 0',
      borderBottom: '1px solid var(--border-subtle)',
      background: conditionalBackground ?? 'transparent',
    };
  }
  return {
    display: 'grid',
    gap: 8,
    padding: '12px 14px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    background: conditionalBackground ?? '#fff',
    minWidth: 170,
  };
}

export function ButtonGroupWidgetView({ widget }: { widget: AppWidget }) {
  const buttons: ButtonGroupButton[] = ((widget.props as { buttons?: ButtonGroupButton[] })?.buttons) ?? [];
  const fillHorizontal = Boolean((widget.props as { fill_horizontal?: boolean })?.fill_horizontal);
  const orientation = (widget.props as { orientation?: "horizontal" | "vertical" })?.orientation ?? "horizontal";
  const runtime = useRuntime();
  // When the surrounding AppHeader is collapsed, swap labels for icon-only
  // square buttons. This is the OpenFoundry equivalent of Foundry's
  // "Button Group widgets show icons-only when header collapsed" behaviour.
  const collapsedHeader = useAppHeaderCollapsed();
  if (collapsedHeader) {
    return (
      <div
        data-testid={`button-group-${widget.id}-collapsed`}
        data-collapsed="true"
        style={{
          padding: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {buttons.map((btn) => {
          const icon = btn.icon && btn.icon.trim() ? btn.icon : (btn.label?.charAt(0) ?? '·');
          return (
            <button
              key={btn.id}
              type="button"
              className="of-button of-button--ghost"
              aria-label={btn.label}
              title={btn.label}
              data-button-id={btn.id}
              data-icon-only="true"
              onClick={(event) => {
                if (runtime.preview) {
                  event.stopPropagation();
                  void (async () => {
                    await runtime.dispatchEvents(widget, 'click', {
                      button_id: btn.id,
                      button_label: btn.label,
                      button: btn,
                    });
                    runtime.onButtonClick(btn);
                  })();
                }
              }}
              style={{
                width: 36,
                height: 36,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              <span aria-hidden="true">{icon}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ padding: 10, display: orientation === "horizontal" ? "flex" : "grid", gap: 6 }}>
      {buttons.map((btn) => (
        <button
          key={btn.id}
          type="button"
          className="of-button"
          onClick={(event) => {
            if (runtime.preview) {
              event.stopPropagation();
              void (async () => {
                await runtime.dispatchEvents(widget, 'click', {
                  button_id: btn.id,
                  button_label: btn.label,
                  button: btn,
                });
                runtime.onButtonClick(btn);
              })();
            }
          }}
          style={{ flex: fillHorizontal ? 1 : "0 0 auto", justifyContent: "center", fontSize: 12 }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

export function PropertyListWidgetView({ widget, variables }: { widget: AppWidget; variables: WorkshopVariable[] }) {
  const props = widget.props as PropertyListWidgetProps;
  const sourceVariableId = props.source_variable_id ?? "";
  const variable = variables.find((v) => v.id === sourceVariableId) ?? null;
  const numColumns = Math.max(1, Math.min(6, Number(props.number_of_columns ?? 2) || 2));
  const valueLayout = props.value_layout === 'below' ? 'below' : 'adjacent';
  const enableWrapping = Boolean(props.enable_value_wrapping);
  const objectTypeId = variable?.object_type_id ?? "";
  const runtime = useRuntime();
  const [properties, setProperties] = useState<Property[]>([]);
  const [sample, setSample] = useState<ObjectInstance | null>(null);
  const propertyNames = readPropertyListPropertyNames(props);
  const selectedObjects = variable?.kind === "object_set_selection" ? runtime.variableEngine.getSelectedObjectSet(sourceVariableId) : null;
  const activeObject = variable?.kind === "object_set_active_object" ? runtime.variableEngine.getActiveObject(sourceVariableId) : null;
  const shouldFetchSample = Boolean(variable && objectTypeId && sourceVariableId && variable.kind !== 'object_set_active_object' && variable.kind !== 'object_set_selection');
  useEffect(() => {
    if (!objectTypeId) {
      setProperties([]);
      setSample(null);
      return;
    }
    let cancelled = false;
    const objectPromise = shouldFetchSample
      ? runtime.executeObjectSet(sourceVariableId, { objectTypeId, limit: 1 })
      : Promise.resolve({ data: [], total: 0, objectTypeId, source: 'object_set' as const, filters: [] });
    void Promise.all([listProperties(objectTypeId), objectPromise])
      .then(([propResponse, listResponse]) => {
        if (cancelled) return;
        setProperties(propResponse);
        setSample(listResponse.data[0] ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setProperties([]);
        setSample(null);
      });
    return () => { cancelled = true; };
  }, [objectTypeId, runtime.executeObjectSet, runtime.refreshKey, shouldFetchSample, sourceVariableId]);
  if (!variable) {
    return <div style={{ padding: 12 }}><p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Select an object set in the inspector.</p></div>;
  }
  const object = variable.kind === "object_set_active_object" ? activeObject : variable.kind === "object_set_selection" ? selectedObjects?.[0] ?? null : sample;
  const entries = buildPropertyListEntries({ props, properties, object });
  return (
    <section aria-label={widget.title || 'Property list'} style={{ padding: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`, gap: "10px 18px" }}>
        {propertyNames.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12, gridColumn: "1 / -1" }}>No properties added. Use the inspector to add values.</p>
        ) : !object ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12, gridColumn: "1 / -1" }}>No object selected.</p>
        ) : entries.length === 0 ? (
          <p className="of-text-muted" style={{ margin: 0, fontSize: 12, gridColumn: "1 / -1" }}>No populated properties.</p>
        ) : entries.map((entry) => {
          return (
            <div
              key={entry.name}
              style={{
                display: "grid",
                gridTemplateColumns: valueLayout === 'adjacent' ? "minmax(96px, 140px) 1fr" : "1fr",
                gap: valueLayout === 'adjacent' ? 8 : 3,
                alignItems: valueLayout === 'adjacent' ? "center" : "start",
                fontSize: 12,
                minWidth: 0,
              }}
            >
              <span className="of-text-muted" style={{ minWidth: 0 }}>{entry.label}</span>
              <span
                title={entry.value}
                style={{
                  color: entry.isNull ? "var(--text-muted)" : "var(--text-strong)",
                  minWidth: 0,
                  whiteSpace: enableWrapping ? "normal" : "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: "18px",
                }}
              >
                {entry.value}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MetricCardInspector({
  widget,
  variables,
  onChange,
  onDelete,
}: {
  widget: AppWidget;
  variables: WorkshopVariable[];
  onChange: (next: AppWidget) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'setup' | 'display' | 'metadata'>('setup');
  const cfg = readMetricCardProps(widget.props as Record<string, unknown>);

  function patch(patchObj: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patchObj } });
  }

  function patchMetric(metricId: string, mutator: (metric: MetricCardMetric) => MetricCardMetric) {
    patch({ metrics: cfg.metrics.map((metric) => (metric.id === metricId ? mutator(metric) : metric)) });
  }

  function moveMetric(metricId: string, direction: -1 | 1) {
    const index = cfg.metrics.findIndex((metric) => metric.id === metricId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= cfg.metrics.length) return;
    const next = [...cfg.metrics];
    const [metric] = next.splice(index, 1);
    next.splice(nextIndex, 0, metric);
    patch({ metrics: next });
  }

  function addMetric() {
    patch({ metrics: [...cfg.metrics, makeMetricCardMetric(`Metric ${cfg.metrics.length + 1}`)] });
  }

  function removeMetric(metricId: string) {
    patch({ metrics: cfg.metrics.filter((metric) => metric.id !== metricId) });
  }

  return (
    <div style={inspectorStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>METRIC CARD</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['setup', 'display', 'metadata'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: '8px 6px', border: 0, background: 'transparent', borderBottom: tab === value ? '2px solid var(--status-info)' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? 'var(--text-strong)' : 'var(--text-muted)', marginRight: 14 }}
          >
            {value === 'setup' ? 'Widget setup' : value === 'display' ? 'Display' : 'Metadata'}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Field label="Label">
            <input value={cfg.label ?? ''} onChange={(event) => patch({ label: event.target.value })} placeholder={widget.title} style={inputStyle()} />
          </Field>

          <Section title={`Metrics ${cfg.metrics.length}`} />
          <div style={{ display: 'grid', gap: 10 }}>
            {cfg.metrics.map((metric, index) => (
              <MetricCardMetricEditor
                key={metric.id}
                metric={metric}
                variables={variables}
                canMoveUp={index > 0}
                canMoveDown={index < cfg.metrics.length - 1}
                onMoveUp={() => moveMetric(metric.id, -1)}
                onMoveDown={() => moveMetric(metric.id, 1)}
                onRemove={() => removeMetric(metric.id)}
                onChange={(next) => patchMetric(metric.id, () => next)}
              />
            ))}
            <button type="button" onClick={addMetric} className="of-button" style={{ justifyContent: 'center', fontSize: 12 }}>
              <Glyph name="plus" size={11} /> Add metric
            </button>
          </div>

          <button type="button" onClick={onDelete} className="of-button" style={{ color: 'var(--status-danger)', borderColor: '#fecaca' }}>
            <Glyph name="trash" size={12} /> Delete widget
          </button>
        </div>
      ) : tab === 'display' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Field label="Layout style">
            <select value={cfg.layout_style} onChange={(event) => patch({ layout_style: event.target.value as MetricCardLayoutStyle })} style={inputStyle()}>
              <option value="card">Card</option>
              <option value="tag">Tag</option>
              <option value="list">List</option>
            </select>
          </Field>
          <Field label="Direction">
            <select value={cfg.direction} onChange={(event) => patch({ direction: event.target.value as MetricCardDirection })} style={inputStyle()}>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </Field>
          <Field label="Template">
            <select value={cfg.template} onChange={(event) => patch({ template: event.target.value as MetricCardTemplate })} style={inputStyle()}>
              <option value="stacked">Stacked</option>
              <option value="side_by_side">Side-by-side</option>
            </select>
          </Field>
          <Field label="Metric size">
            <select value={cfg.metric_size} onChange={(event) => patch({ metric_size: event.target.value as MetricCardSize })} style={inputStyle()}>
              <option value="compact">Compact</option>
              <option value="regular">Regular</option>
              <option value="large">Large</option>
            </select>
          </Field>
        </div>
      ) : (
        <div style={{ padding: 14 }}><p className="of-text-muted" style={{ fontSize: 12 }}>Widget metadata coming soon.</p></div>
      )}
    </div>
  );
}

function MetricCardMetricEditor({
  metric,
  variables,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChange,
}: {
  metric: MetricCardMetric;
  variables: WorkshopVariable[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: (next: MetricCardMetric) => void;
}) {
  const format = metric.format ?? {};
  const firstRule = metric.conditional_formatting?.[0] ?? null;
  const candidateVariables = variables.filter((variable) => (
    variable.kind === 'primitive' ||
    variable.kind === 'string' ||
    variable.kind === 'numeric' ||
    variable.kind === 'boolean' ||
    variable.kind === 'date' ||
    variable.kind === 'timestamp' ||
    variable.kind === 'url_parameter' ||
    variable.kind === 'runtime_parameter' ||
    variable.kind === 'aggregation'
  ));

  function patch(patchObj: Partial<MetricCardMetric>) {
    onChange({ ...metric, ...patchObj });
  }

  function patchFormat(patchObj: Record<string, unknown>) {
    patch({ format: { ...format, ...patchObj } });
  }

  function patchRule(patchObj: Partial<MetricCardConditionalRule>) {
    const rule: MetricCardConditionalRule = {
      operator: 'gte',
      value: '',
      tone: 'success',
      ...(firstRule ?? {}),
      ...patchObj,
    };
    patch({ conditional_formatting: [rule] });
  }

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 10, display: 'grid', gap: 10, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Glyph name="sparkles" size={13} tone="#15803d" />
        <input value={metric.label} onChange={(event) => patch({ label: event.target.value })} style={{ flex: 1, border: 0, outline: 'none', fontSize: 13, fontWeight: 600 }} />
        <button type="button" aria-label="Move up" disabled={!canMoveUp} onClick={onMoveUp} className="of-button of-button--ghost" style={{ padding: 2, opacity: canMoveUp ? 1 : 0.35 }}><Glyph name="chevron-down" size={11} /></button>
        <button type="button" aria-label="Move down" disabled={!canMoveDown} onClick={onMoveDown} className="of-button of-button--ghost" style={{ padding: 2, opacity: canMoveDown ? 1 : 0.35 }}><Glyph name="chevron-down" size={11} /></button>
        <button type="button" aria-label="Remove metric" onClick={onRemove} className="of-button of-button--ghost" style={{ padding: 2, color: 'var(--status-danger)' }}><Glyph name="trash" size={11} /></button>
      </div>
      <Field label="Description">
        <input value={metric.description ?? ''} onChange={(event) => patch({ description: event.target.value })} style={inputStyle()} />
      </Field>
      <Field label="Value type">
        <select value={metric.value_type} onChange={(event) => patch({ value_type: event.target.value as MetricCardValueType })} style={inputStyle()}>
          <option value="number">Number</option>
          <option value="string">String</option>
        </select>
      </Field>
      <Field label="Value variable">
        <select value={metric.variable_id ?? ''} onChange={(event) => patch({ variable_id: event.target.value })} style={inputStyle()}>
          <option value="">Use static value…</option>
          {candidateVariables.map((variable) => (
            <option key={variable.id} value={variable.id}>{variable.name} ({VARIABLE_KIND_LABEL[variable.kind]})</option>
          ))}
        </select>
      </Field>
      <Field label="Static value">
        <input value={String(metric.value ?? '')} onChange={(event) => patch({ value: event.target.value })} disabled={Boolean(metric.variable_id)} style={inputStyle()} />
      </Field>
      {metric.value_type === 'number' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 8 }}>
          <Field label="Format">
            <select value={format.kind ?? 'number'} onChange={(event) => patchFormat({ kind: event.target.value as MetricCardFormatKind })} style={inputStyle()}>
              <option value="number">Number</option>
              <option value="integer">Integer</option>
              <option value="compact">Compact</option>
              <option value="percent">Percent</option>
              <option value="currency">Currency</option>
              <option value="unit">Unit</option>
            </select>
          </Field>
          <Field label="Precision">
            <input type="number" min={0} max={8} value={String(format.precision ?? '')} onChange={(event) => patchFormat({ precision: event.target.value })} style={inputStyle()} />
          </Field>
          <Field label="Unit / suffix">
            <input value={format.unit || format.suffix || ''} onChange={(event) => patchFormat(format.kind === 'unit' ? { unit: event.target.value } : { suffix: event.target.value })} placeholder="mph, Fahrenheit…" style={inputStyle()} />
          </Field>
          <Field label="Prefix">
            <input value={format.prefix ?? ''} onChange={(event) => patchFormat({ prefix: event.target.value })} style={inputStyle()} />
          </Field>
        </div>
      ) : null}
      <Toggle
        label="Conditional formatting"
        value={Boolean(firstRule)}
        onChange={(enabled) => patch({ conditional_formatting: enabled ? [{ operator: 'gte', value: '', tone: 'success' }] : [] })}
      />
      {firstRule ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Rule">
            <select value={firstRule.operator} onChange={(event) => patchRule({ operator: event.target.value as MetricCardConditionalRule['operator'] })} style={inputStyle()}>
              <option value="gte">Greater or equal</option>
              <option value="gt">Greater than</option>
              <option value="lte">Less or equal</option>
              <option value="lt">Less than</option>
              <option value="eq">Equals</option>
              <option value="neq">Not equals</option>
              <option value="contains">Contains</option>
              <option value="between">Between</option>
            </select>
          </Field>
          <Field label="Value">
            <input value={String(firstRule.value ?? '')} onChange={(event) => patchRule({ value: event.target.value })} style={inputStyle()} />
          </Field>
          <Field label="Tone">
            <select value={firstRule.tone ?? 'success'} onChange={(event) => patchRule({ tone: event.target.value as MetricCardConditionalRule['tone'] })} style={inputStyle()}>
              <option value="success">Success</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="danger">Danger</option>
              <option value="default">Default</option>
            </select>
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function DetailWidgetInspector({
  widget,
  variables,
  objectTypes,
  onChange,
  onDelete,
}: {
  widget: AppWidget;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onChange: (next: AppWidget) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<"setup" | "metadata" | "display">("setup");
  function patchProps(patch: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patch } });
  }
  const widgetTypeLabel = widget.widget_type === "object_set_title" ? "OBJECT SET TITLE" : widget.widget_type === "button_group" ? "BUTTON GROUP" : "PROPERTY LIST";
  return (
    <div style={inspectorStyle()}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{widgetTypeLabel}</span>
      </div>
      <div style={{ display: "flex", gap: 0, padding: "0 14px", borderBottom: "1px solid var(--border-subtle)" }}>
        {(["setup", "metadata", "display"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: "8px 6px", border: 0, background: "transparent", borderBottom: tab === value ? "2px solid var(--status-info)" : "2px solid transparent", cursor: "pointer", fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? "var(--text-strong)" : "var(--text-muted)", marginRight: 14 }}
          >
            {value === "setup" ? "Widget setup" : value === "metadata" ? "Metadata" : "Display"}
          </button>
        ))}
      </div>
      {tab === "setup" ? (
        <div style={{ padding: 14, display: "grid", gap: 14 }}>
          {(widget.widget_type === "object_set_title" || widget.widget_type === "property_list") ? (
            <Field label="Input object set">
              <select
                value={(widget.props as { source_variable_id?: string })?.source_variable_id ?? ""}
                onChange={(event) => patchProps({ source_variable_id: event.target.value })}
                style={inputStyle()}
              >
                <option value="">Select object set variable…</option>
                {variables.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({VARIABLE_KIND_LABEL[v.kind]})</option>
                ))}
              </select>
            </Field>
          ) : null}
          {widget.widget_type === "object_set_title" ? <ObjectSetTitleSetup widget={widget} variables={variables} objectTypes={objectTypes} onChange={onChange} /> : null}
          {widget.widget_type === "button_group" ? <ButtonGroupSetup widget={widget} variables={variables} onChange={onChange} /> : null}
          {widget.widget_type === "property_list" ? <PropertyListSetup widget={widget} variables={variables} onChange={onChange} /> : null}
          <button type="button" onClick={onDelete} className="of-button" style={{ color: "var(--status-danger)", borderColor: "#fecaca" }}>
            <Glyph name="trash" size={12} /> Delete widget
          </button>
        </div>
      ) : tab === "display" ? (
        <DisplayTab widget={widget} onChange={onChange} />
      ) : (
        <div style={{ padding: 14 }}><p className="of-text-muted" style={{ fontSize: 12 }}>Widget metadata coming soon.</p></div>
      )}
    </div>
  );
}

function ObjectSetTitleSetup({
  widget,
  variables,
  objectTypes,
  onChange,
}: {
  widget: AppWidget;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onChange: (next: AppWidget) => void;
}) {
  const cfg = readObjectSetTitleProps(widget.props as Record<string, unknown>);
  const sourceVariable = variables.find((entry) => entry.id === cfg.source_variable_id) ?? null;
  const inferredObjectTypeId = sourceVariable?.object_type_id ?? '';
  function patch(patchObj: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patchObj } });
  }
  return (
    <>
      <Section title="Title behavior" />
      <Toggle label="Contains single object" value={cfg.contains_single_object} onChange={(checked) => patch({ contains_single_object: checked })} />
      <Toggle label="Show object type icon" value={cfg.show_icon} onChange={(checked) => patch({ show_icon: checked })} />
      <Field label="Title override">
        <input
          value={cfg.title_override}
          onChange={(event) => patch({ title_override: event.target.value, title_template: event.target.value })}
          placeholder={cfg.contains_single_object ? 'Use selected object title' : 'Use object type and count'}
          style={inputStyle()}
        />
      </Field>
      <Section title="Empty object set" />
      <Toggle label="Render when empty" value={cfg.render_when_empty} onChange={(checked) => patch({ render_when_empty: checked })} />
      {cfg.render_when_empty ? (
        <>
          <Field label="Placeholder object type">
            <select value={cfg.empty_object_type_id || inferredObjectTypeId} onChange={(event) => patch({ empty_object_type_id: event.target.value })} style={inputStyle()}>
              <option value="">Infer from input object set</option>
              {objectTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Empty title">
            <input
              value={cfg.empty_title}
              onChange={(event) => patch({ empty_title: event.target.value })}
              placeholder={cfg.contains_single_object ? 'Select an object' : 'No objects'}
              style={inputStyle()}
            />
          </Field>
        </>
      ) : null}
    </>
  );
}

function ButtonGroupSetup({ widget, variables, onChange }: { widget: AppWidget; variables: WorkshopVariable[]; onChange: (next: AppWidget) => void }) {
  const buttons: ButtonGroupButton[] = ((widget.props as { buttons?: ButtonGroupButton[] })?.buttons) ?? [];
  const buttonType = ((widget.props as { button_type?: string })?.button_type) ?? "inline";
  const orientation = ((widget.props as { orientation?: "horizontal" | "vertical" })?.orientation) ?? "horizontal";
  const fillHorizontal = Boolean((widget.props as { fill_horizontal?: boolean })?.fill_horizontal);
  const [editingButtonId, setEditingButtonId] = useState<string | null>(null);
  function patch(patchObj: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patchObj } });
  }
  function patchButton(id: string, patchObj: Partial<ButtonGroupButton>) {
    patch({ buttons: buttons.map((b) => (b.id === id ? { ...b, ...patchObj } : b)) });
  }
  const editingButton = editingButtonId ? buttons.find((b) => b.id === editingButtonId) ?? null : null;

  if (editingButton) {
    return (
      <ButtonItemEditor
        button={editingButton}
        variables={variables}
        onBack={() => setEditingButtonId(null)}
        onChange={(next) => patchButton(editingButton.id, next)}
      />
    );
  }

  return (
    <>
      <Section title="Button type" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {(["inline", "menu", "two-part"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => patch({ button_type: kind })}
            style={{ padding: "8px 4px", border: buttonType === kind ? "2px solid var(--status-info)" : "1px solid var(--border-default)", background: buttonType === kind ? "rgba(45, 114, 210, 0.06)" : "#fff", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
          >
            {kind === "inline" ? "Inline" : kind === "menu" ? "Menu" : "Two-part"}
          </button>
        ))}
      </div>
      <Section title="Button configuration" />
      <div style={{ display: "grid", gap: 4 }}>
        {buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => setEditingButtonId(btn.id)}
            style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 10px", background: "#f4f6f9", border: "1px solid var(--border-subtle)", borderRadius: 4, cursor: "pointer", textAlign: "left" }}
          >
            <Glyph name="move" size={12} tone="#aab4c0" />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{btn.label}</span>
            <Glyph name="chevron-right" size={11} tone="#5c7080" />
          </button>
        ))}
        <button type="button" onClick={() => patch({ buttons: [...buttons, makeButton(`Button ${buttons.length + 1}`)] })} className="of-button" style={{ fontSize: 12, justifyContent: "center" }}>
          <Glyph name="plus" size={11} /> Add Button
        </button>
      </div>
      <Section title="Display & formatting" />
      <Field label="Orientation">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {(["horizontal", "vertical"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => patch({ orientation: kind })}
              style={{ padding: "6px 8px", border: orientation === kind ? "2px solid var(--status-info)" : "1px solid var(--border-default)", background: orientation === kind ? "rgba(45, 114, 210, 0.06)" : "#fff", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            >
              {kind === "horizontal" ? "Horizontal" : "Vertical"}
            </button>
          ))}
        </div>
      </Field>
      <Toggle label="Fill available horizontal space in row and column layouts" value={fillHorizontal} onChange={(checked) => patch({ fill_horizontal: checked })} />
    </>
  );
}

function ButtonItemEditor({
  button,
  variables,
  onBack,
  onChange,
}: {
  button: ButtonGroupButton;
  variables: WorkshopVariable[];
  onBack: () => void;
  onChange: (next: Partial<ButtonGroupButton>) => void;
}) {
  const [actions, setActions] = useState<ActionType[]>([]);
  const [actionSearch, setActionSearch] = useState('');
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [selectedActionType, setSelectedActionType] = useState<ActionType | null>(null);
  const [selectedActionInputs, setSelectedActionInputs] = useState<ActionInputField[]>([]);
  const [editingParameter, setEditingParameter] = useState<string>('');

  useEffect(() => {
    if (!button.action_type_id) {
      setSelectedActionType(null);
      setSelectedActionInputs([]);
      return;
    }
    let cancelled = false;
    void getActionType(button.action_type_id)
      .then((action) => {
        if (cancelled) return;
        setSelectedActionType(action);
        setSelectedActionInputs(action.input_schema ?? []);
        if (!editingParameter && (action.input_schema?.length ?? 0) > 0) {
          const objectParam = (action.input_schema ?? []).find((field) => field.property_type === 'object_reference' || field.name.toLowerCase().includes('order') || field.name === 'object');
          setEditingParameter(objectParam?.name ?? action.input_schema![0].name);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedActionType(null);
          setSelectedActionInputs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [button.action_type_id, editingParameter]);

  useEffect(() => {
    if (!actionPickerOpen) return;
    let cancelled = false;
    void listActionTypes({ per_page: 100, search: actionSearch || undefined }).then((response) => {
      if (!cancelled) setActions(response.data);
    }).catch(() => {
      if (!cancelled) setActions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [actionPickerOpen, actionSearch]);

  function patchParameter(parameterName: string, patch: Partial<ButtonParameterDefault>) {
    const current = button.parameter_defaults[parameterName] ?? { kind: 'none' };
    onChange({
      parameter_defaults: { ...button.parameter_defaults, [parameterName]: { ...current, ...patch } as ButtonParameterDefault },
    });
  }

  const editingParam = selectedActionInputs.find((f) => f.name === editingParameter) ?? null;
  const editingDefault = button.parameter_defaults[editingParameter] ?? { kind: 'none' as const };

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--status-info)', fontSize: 13, padding: 0, marginBottom: 6 }}
      >
        <Glyph name="chevron-left" size={11} /> {button.label}
      </button>

      <Field label="Text">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            value={button.label}
            onChange={(event) => onChange({ label: event.target.value })}
            style={{ ...inputStyle(), flex: 1 }}
          />
        </div>
        <button type="button" className="of-link" style={{ ...linkBtnStyle(), justifySelf: 'end' }}>Use variable</button>
      </Field>

      <Section title="Conditional visibility" />
      <Toggle label="Conditional visibility" value={button.conditional_visibility} onChange={(checked) => onChange({ conditional_visibility: checked })} />

      <Section title="On click" />
      <Field label="Action kind">
        <select
          value={button.on_click_kind}
          onChange={(event) => onChange({ on_click_kind: event.target.value as ButtonOnClickKind })}
          style={inputStyle()}
        >
          <option value="none">No action</option>
          <option value="action">Action</option>
          <option value="event">Event</option>
          <option value="export">Export data</option>
          <option value="url">Open URL</option>
        </select>
      </Field>

      {button.on_click_kind === 'action' ? (
        <>
          <div style={{ position: 'relative' }}>
            {selectedActionType ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
                <Glyph name="pencil" size={12} tone="#5c7080" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{selectedActionType.display_name || selectedActionType.name}</div>
                  <div className="of-text-muted" style={{ fontSize: 11 }}>on {selectedActionType.object_type_id}</div>
                </div>
                <button type="button" aria-label="Info" className="of-button of-button--ghost" style={{ padding: 2 }}>
                  <Glyph name="info" size={11} />
                </button>
                <button type="button" aria-label="Edit" onClick={() => setActionPickerOpen(true)} className="of-button of-button--ghost" style={{ padding: 2 }}>
                  <Glyph name="chevron-down" size={11} />
                </button>
                <button type="button" aria-label="Clear" onClick={() => onChange({ action_type_id: '', parameter_defaults: {} })} className="of-button of-button--ghost" style={{ padding: 2 }}>
                  <Glyph name="x" size={11} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setActionPickerOpen(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                <Glyph name="search" size={11} />
                <span style={{ flex: 1, color: 'var(--text-muted)', textAlign: 'left' }}>Select an Action…</span>
                <Glyph name="chevron-down" size={11} />
              </button>
            )}
            {actionPickerOpen ? (
              <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 4, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: 6, zIndex: 6, maxHeight: 280, overflowY: 'auto' }}>
                <input
                  autoFocus
                  value={actionSearch}
                  onChange={(event) => setActionSearch(event.target.value)}
                  placeholder="Search actions…"
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 13, marginBottom: 6 }}
                />
                {actions.length === 0 ? (
                  <p className="of-text-muted" style={{ padding: 8, fontSize: 12, margin: 0 }}>No actions match.</p>
                ) : actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => {
                      onChange({ action_type_id: action.id });
                      setActionPickerOpen(false);
                      setActionSearch('');
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, borderRadius: 4 }}
                  >
                    <Glyph name="pencil" size={11} tone="#5c7080" />
                    <span style={{ flex: 1 }}>{action.display_name || action.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {selectedActionType ? (
            <>
              <Field label="Default layout">
                <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
                  {(['form', 'table'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => onChange({ default_layout: kind })}
                      style={{ padding: '6px 14px', border: 0, background: button.default_layout === kind ? '#1c2127' : '#fff', color: button.default_layout === kind ? '#fff' : 'var(--text-strong)', cursor: 'pointer', fontSize: 12 }}
                    >
                      {kind === 'form' ? 'Form' : 'Table'}
                    </button>
                  ))}
                </div>
              </Field>
              <Section title="End-user features" />
              <Toggle label="Switch layout" value={button.switch_layout} onChange={(checked) => onChange({ switch_layout: checked })} />

              <Section title="Parameter defaults" />
              <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>Local default values for parameters</p>
              <Field label="Select parameter to configure">
                <select
                  value={editingParameter}
                  onChange={(event) => setEditingParameter(event.target.value)}
                  style={inputStyle()}
                >
                  <option value="">Select parameter…</option>
                  {selectedActionInputs.map((input) => (
                    <option key={input.name} value={input.name}>{input.display_name || input.name}</option>
                  ))}
                </select>
              </Field>

              {editingParam ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
                    <Glyph name={editingParam.property_type === 'object_reference' ? 'cube' : 'tag'} size={12} tone="#2d72d2" />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{editingParam.display_name || editingParam.name}</span>
                    <button type="button" aria-label="Required indicator" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--status-danger)' }}>*</button>
                    <button type="button" aria-label="Clear default" onClick={() => patchParameter(editingParam.name, { kind: 'none' })} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}><Glyph name="x" size={11} /></button>
                  </div>

                  <Field label="Local default value">
                    <select
                      value={editingDefault.kind === 'variable' ? `var:${editingDefault.variable_id ?? ''}` : editingDefault.kind === 'static' ? 'static' : editingDefault.kind === 'active_object' ? 'active_object' : 'none'}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw.startsWith('var:')) {
                          patchParameter(editingParam.name, { kind: 'variable', variable_id: raw.slice(4) });
                        } else if (raw === 'static') {
                          patchParameter(editingParam.name, { kind: 'static', static_value: '' });
                        } else if (raw === 'active_object') {
                          patchParameter(editingParam.name, { kind: 'active_object' });
                        } else {
                          patchParameter(editingParam.name, { kind: 'none' });
                        }
                      }}
                      style={inputStyle()}
                    >
                      <option value="none">No default</option>
                      <option value="static">Static value</option>
                      <option value="active_object">Active object</option>
                      {variables.filter((v) => v.kind === 'object_set_active_object').map((v) => (
                        <option key={v.id} value={`var:${v.id}`}>{v.name}</option>
                      ))}
                      {variables.filter((v) => v.kind === 'object_set' || v.kind === 'object_set_definition' || v.kind === 'filter_output' || v.kind === 'object_set_selection').map((v) => (
                        <option key={v.id} value={`var:${v.id}`}>{v.name}</option>
                      ))}
                      {variables.filter((v) => !['object_set_active_object', 'object_set', 'object_set_definition', 'filter_output', 'object_set_selection'].includes(v.kind)).map((v) => (
                        <option key={v.id} value={`var:${v.id}`}>{v.name}</option>
                      ))}
                    </select>
                  </Field>
                  {editingDefault.kind === 'static' ? (
                    <Field label="Static value">
                      <input
                        value={stringifyActionFormValue(editingDefault.static_value)}
                        onChange={(event) => patchParameter(editingParam.name, { static_value: event.target.value })}
                        style={inputStyle()}
                      />
                    </Field>
                  ) : null}
                  {editingDefault.kind === 'variable' ? (
                    <p className="of-text-muted" style={{ fontSize: 11, margin: 0 }}>Local override applied</p>
                  ) : null}

                  <Section title="Visibility in form" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
                    {(['visible', 'disabled', 'hidden'] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => patchParameter(editingParam.name, { visibility: kind })}
                        style={{ padding: '6px 8px', border: '1px solid var(--border-default)', background: (editingDefault.visibility ?? 'visible') === kind ? '#1c2127' : '#f4f6f9', color: (editingDefault.visibility ?? 'visible') === kind ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: (editingDefault.visibility ?? 'visible') === kind ? 600 : 500 }}
                      >
                        {kind === 'visible' ? 'Visible' : kind === 'disabled' ? 'Disabled' : 'Hidden'}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function PropertyListSetup({ widget, variables, onChange }: { widget: AppWidget; variables: WorkshopVariable[]; onChange: (next: AppWidget) => void }) {
  const props = widget.props as PropertyListWidgetProps;
  const sourceVariableId = props.source_variable_id ?? "";
  const variable = variables.find((v) => v.id === sourceVariableId) ?? null;
  const configuredItems = Array.isArray(props.items) ? props.items : [];
  const legacyProperties = Array.isArray(props.properties) ? props.properties : [];
  const items: PropertyListItem[] = configuredItems.length > 0 ? configuredItems : [{ id: 'legacy_properties', property_names: legacyProperties }];
  const numColumns = Number(props.number_of_columns ?? 2);
  const enableWrapping = Boolean(props.enable_value_wrapping);
  const hideNulls = Boolean(props.hide_nulls);
  const valueLayout = props.value_layout === 'below' ? 'below' : 'adjacent';
  const objectTypeId = variable?.object_type_id ?? "";
  const [properties, setProperties] = useState<Property[]>([]);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!objectTypeId) { setProperties([]); return; }
    let cancelled = false;
    void listProperties(objectTypeId).then((response) => { if (!cancelled) setProperties(response); }).catch(() => { if (!cancelled) setProperties([]); });
    return () => { cancelled = true; };
  }, [objectTypeId]);

  function patch(patchObj: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patchObj } });
  }

  function patchItems(nextItems: PropertyListItem[]) {
    patch({ items: nextItems, properties: nextItems.flatMap((item) => item.property_names) });
  }

  function patchItem(id: string, names: string[]) {
    patchItems(items.map((it) => (it.id === id ? { ...it, property_names: names } : it)));
  }

  function addAllProperties(itemId: string) {
    patchItem(itemId, properties.map((p) => p.name));
  }

  function removeAll(itemId: string) {
    patchItem(itemId, []);
  }

  function addItem() {
    patchItems([...items, { id: makeId("item"), property_names: [] }]);
  }

  function removeItem(id: string) {
    patchItems(items.filter((it) => it.id !== id));
  }

  const filteredProps = properties.filter((p) => `${p.display_name} ${p.name}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Section title="Items" />
      <button type="button" onClick={addItem} className="of-button" style={{ fontSize: 12, justifyContent: "center" }}>
        <Glyph name="plus" size={11} /> Add Item
      </button>
      {items.map((item, index) => (
        <div key={item.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 4, padding: 10, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Item {index + 1}</span>
            {items.length > 1 ? (
              <button type="button" aria-label="Remove item" onClick={() => removeItem(item.id)} style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--status-danger)" }}><Glyph name="x" size={12} /></button>
            ) : null}
          </div>
          <span className="of-text-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Properties</span>
          {item.property_names.map((name) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", border: "1px solid var(--border-subtle)", borderRadius: 4 }}>
              <Glyph name="tag" size={11} tone="#5c7080" />
              <span style={{ flex: 1, fontSize: 12 }}>{properties.find((p) => p.name === name)?.display_name || name}</span>
              <button type="button" aria-label="Remove" onClick={() => patchItem(item.id, item.property_names.filter((n) => n !== name))} style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--status-danger)" }}><Glyph name="trash" size={11} /></button>
            </div>
          ))}
          <div style={{ position: "relative" }}>
            <button type="button" onClick={() => setAddOpen(addOpen === item.id ? null : item.id)} className="of-button" style={{ fontSize: 12, justifyContent: "center", width: "100%" }}>
              <Glyph name="plus" size={11} /> Add value
            </button>
            {addOpen === item.id ? (
              <div role="menu" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid var(--border-default)", borderRadius: 4, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)", padding: 6, zIndex: 5 }}>
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search property…" style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--border-default)", borderRadius: 4, fontSize: 13, marginBottom: 6 }} />
                <p className="of-text-muted" style={{ margin: "4px 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current object ({filteredProps.length})</p>
                {filteredProps.map((p) => (
                  <button key={p.id} type="button" onClick={() => { if (!item.property_names.includes(p.name)) patchItem(item.id, [...item.property_names, p.name]); setAddOpen(null); setSearch(""); }} style={addWidgetItemStyle()}>
                    <Glyph name="tag" size={11} tone="#5c7080" /> {p.display_name || p.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button type="button" onClick={() => addAllProperties(item.id)} className="of-link" style={linkBtnStyle()}>Add all properties</button>
            <button type="button" onClick={() => removeAll(item.id)} className="of-link" style={{ ...linkBtnStyle(), color: "var(--status-danger)" }}>Remove all properties</button>
          </div>
        </div>
      ))}
      <Section title="Number of columns" />
      <input type="number" min={1} max={6} value={numColumns} onChange={(event) => patch({ number_of_columns: Number(event.target.value) })} style={inputStyle()} />
      <Section title="Layout" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {(['adjacent', 'below'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => patch({ value_layout: kind })}
            style={{ padding: '6px 8px', border: valueLayout === kind ? '2px solid var(--status-info)' : '1px solid var(--border-default)', background: valueLayout === kind ? 'rgba(45, 114, 210, 0.06)' : '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            {kind === 'adjacent' ? 'Adjacent' : 'Below'}
          </button>
        ))}
      </div>
      <Toggle label="Hide null properties" value={hideNulls} onChange={(checked) => patch({ hide_nulls: checked })} />
      <Toggle label="Enable value wrapping" value={enableWrapping} onChange={(checked) => patch({ enable_value_wrapping: checked })} />
    </>
  );
}

function DisplayTab({ widget, onChange }: { widget: AppWidget; onChange: (next: AppWidget) => void }) {
  const heightKind = ((widget.props as { row_height_kind?: string })?.row_height_kind) ?? "auto";
  const heightValue = Number((widget.props as { row_height_value?: number })?.row_height_value ?? 600);
  const overrideWidth = Boolean((widget.props as { override_section_width?: boolean })?.override_section_width);
  function patch(patchObj: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patchObj } });
  }
  return (
    <div style={{ padding: 14, display: "grid", gap: 14 }}>
      <Section title="Dimensions" />
      <Field label="Row height">
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {(["auto", "absolute", "flex"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => patch({ row_height_kind: kind })}
              style={{ padding: "6px 12px", border: "1px solid var(--border-default)", background: heightKind === kind ? "#1c2127" : "#fff", color: heightKind === kind ? "#fff" : "var(--text-strong)", cursor: "pointer", fontSize: 12 }}
            >
              {kind === "auto" ? "Auto (max)" : kind === "absolute" ? "Absolute" : "Flex"}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={heightValue}
            onChange={(event) => patch({ row_height_value: Number(event.target.value) })}
            style={{ ...inputStyle(), width: 100, marginLeft: 8 }}
          />
        </div>
      </Field>
      <Toggle label="Override section width" value={overrideWidth} onChange={(checked) => patch({ override_section_width: checked })} />
    </div>
  );
}



function SectionHeaderRender({ section }: { section: AppWidget }) {
  const headerEnabled = (section.props as { header_enabled?: boolean })?.header_enabled !== false;
  if (!headerEnabled) return null;
  const styleKind = ((section.props as { style?: string })?.style) ?? "subheader";
  const iconName = (section.props as { icon?: string })?.icon ?? "";
  const headerFormat = ((section.props as { header_format?: string })?.header_format) ?? "title";
  const backgroundColorId = ((section.props as { background_color?: string })?.background_color) ?? "white";
  const backgroundHex = SECTION_BG_COLORS.find((option) => option.id === backgroundColorId)?.hex ?? "#ffffff";
  const styleMap: Record<string, { fontSize: number; fontWeight: number; padding?: string }> = {
    header: { fontSize: 18, fontWeight: 700 },
    title: { fontSize: 16, fontWeight: 600 },
    subheader: { fontSize: 13, fontWeight: 600 },
    caption: { fontSize: 12, fontWeight: 500 },
  };
  const sty = styleMap[styleKind] ?? styleMap.subheader;
  const containerStyle: React.CSSProperties =
    headerFormat === "contained"
      ? { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: backgroundHex, border: "1px solid var(--border-subtle)", borderRadius: 4 }
      : headerFormat === "underline"
      ? { display: "flex", alignItems: "center", gap: 8, padding: "0 0 6px", borderBottom: "2px solid var(--border-default)" }
      : { display: "flex", alignItems: "center", gap: 8 };
  return (
    <div style={containerStyle}>
      {iconName ? (
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 4, background: "rgba(45, 114, 210, 0.08)" }}>
          <Glyph name={iconName as GlyphName} size={13} tone="#2d72d2" />
        </span>
      ) : null}
      <span style={{ margin: 0, fontSize: sty.fontSize, fontWeight: sty.fontWeight, color: "var(--text-strong)" }}>{section.title}</span>
    </div>
  );
}



function LayoutPreviewGlyph({ kind }: { kind: "columns" | "rows" | "tabs" | "flow" | "toolbar" | "loop" }) {
  const stroke = "#5c7080";
  return (
    <svg width={28} height={20} viewBox="0 0 36 24" aria-hidden="true">
      <rect x="2" y="2" width="32" height="20" rx="2" fill="none" stroke={stroke} strokeWidth="1.4" />
      {kind === "columns" ? (
        <>
          <rect x="5" y="6" width="11" height="12" rx="1" fill={stroke} opacity="0.25" />
          <rect x="20" y="6" width="11" height="12" rx="1" fill={stroke} opacity="0.25" />
        </>
      ) : null}
      {kind === "rows" ? (
        <>
          <rect x="5" y="5" width="26" height="6" rx="1" fill={stroke} opacity="0.25" />
          <rect x="5" y="13" width="26" height="6" rx="1" fill={stroke} opacity="0.25" />
        </>
      ) : null}
      {kind === "tabs" ? (
        <>
          <rect x="2" y="2" width="10" height="4" fill={stroke} opacity="0.4" />
          <rect x="2" y="6" width="32" height="16" fill="none" stroke={stroke} strokeWidth="1.4" />
        </>
      ) : null}
      {kind === "flow" ? (
        <>
          <rect x="5" y="5" width="6" height="6" rx="1" fill={stroke} opacity="0.25" />
          <rect x="13" y="5" width="6" height="6" rx="1" fill={stroke} opacity="0.25" />
          <rect x="21" y="5" width="6" height="6" rx="1" fill={stroke} opacity="0.25" />
          <rect x="5" y="13" width="6" height="6" rx="1" fill={stroke} opacity="0.25" />
          <rect x="13" y="13" width="6" height="6" rx="1" fill={stroke} opacity="0.25" />
        </>
      ) : null}
      {kind === "toolbar" ? (
        <>
          <rect x="5" y="5" width="6" height="3" rx="1" fill={stroke} opacity="0.4" />
          <rect x="13" y="5" width="6" height="3" rx="1" fill={stroke} opacity="0.4" />
          <rect x="5" y="11" width="26" height="8" rx="1" fill={stroke} opacity="0.18" />
        </>
      ) : null}
      {kind === "loop" ? (
        <>
          <rect x="5" y="5" width="26" height="4" rx="1" fill={stroke} opacity="0.18" />
          <rect x="5" y="11" width="26" height="4" rx="1" fill={stroke} opacity="0.18" />
          <rect x="5" y="17" width="26" height="2" rx="1" fill={stroke} opacity="0.18" />
        </>
      ) : null}
    </svg>
  );
}

const PIE_PADDING_PX: Record<string, number> = { none: 0, compact: 6, normal: 14, large: 24 };
const PIE_PALETTE = ['#2d72d2', '#cf923f', '#15803d', '#b42318', '#7c5dd6', '#5c7080', '#0d9488', '#db2777', '#ca8a04', '#1f4ea0'];

function readPieProps(widget: AppWidget) {
  const p = widget.props as Record<string, unknown>;
  return {
    sourceVariableId: (p.source_variable_id as string) ?? '',
    objectTypeId: (p.object_type_id as string) ?? '',
    groupBy: (p.group_by_property as string) ?? '',
    enableColors: p.enable_ontology_colors !== false,
    metric: ((p.aggregation_metric as string) ?? 'count') as 'count' | 'sum' | 'avg' | 'min' | 'max',
    metricProperty: (p.aggregation_property as string) ?? '',
    enableNumeric: Boolean(p.enable_numeric_formatting),
    radius: Number(p.radius ?? 0),
    padding: ((p.padding as string) ?? 'large') as 'none' | 'compact' | 'normal' | 'large',
    showLegend: p.show_legend !== false,
    legendPosition: ((p.legend_position as string) ?? 'next-to') as 'inside' | 'next-to',
    legendAnchor: ((p.legend_anchor as string) ?? 'right') as 'left' | 'right' | 'top' | 'bottom',
  };
}

export function ChartPieWidgetView({ widget, variables }: { widget: AppWidget; variables: WorkshopVariable[] }) {
  const cfg = readPieProps(widget);
  const sourceVariable = variables.find((v) => v.id === cfg.sourceVariableId) ?? null;
  const objectTypeId = sourceVariable?.object_type_id ?? cfg.objectTypeId ?? '';
  const [rows, setRows] = useState<ObjectInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const runtime = useRuntime();

  useEffect(() => {
    if (!objectTypeId || !cfg.groupBy) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void runtime.executeObjectSet(cfg.sourceVariableId, { objectTypeId, limit: 5000 })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objectTypeId, cfg.groupBy, cfg.sourceVariableId, runtime.executeObjectSet, sourceVariable]);

  const data = useMemo(() => {
    if (!cfg.groupBy) return [] as Array<{ name: string; value: number }>;
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const props = (row.properties as Record<string, unknown>) ?? {};
      const rawKey = props[cfg.groupBy];
      const key = rawKey == null || rawKey === '' ? 'No value' : String(rawKey);
      let increment = 1;
      if (cfg.metric !== 'count' && cfg.metricProperty) {
        const num = Number(props[cfg.metricProperty]);
        if (!Number.isFinite(num)) continue;
        increment = num;
      }
      const previous = buckets.get(key) ?? 0;
      if (cfg.metric === 'count' || cfg.metric === 'sum') {
        buckets.set(key, previous + increment);
      } else if (cfg.metric === 'avg') {
        buckets.set(key, previous + increment);
      } else if (cfg.metric === 'min') {
        buckets.set(key, previous === 0 ? increment : Math.min(previous, increment));
      } else if (cfg.metric === 'max') {
        buckets.set(key, Math.max(previous, increment));
      }
    }
    return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
  }, [rows, cfg.groupBy, cfg.metric, cfg.metricProperty]);

  const padPx = PIE_PADDING_PX[cfg.padding] ?? 14;
  const innerRadiusPercent = Math.min(99, Math.max(0, Math.round(cfg.radius)));
  const outerRadius = '70%';
  const innerRadius = `${Math.round(innerRadiusPercent * 0.7)}%`;

  const legendOption = !cfg.showLegend
    ? null
    : cfg.legendPosition === 'inside'
    ? { show: true, orient: 'vertical', left: 'center', top: 'center', textStyle: { fontSize: 11 } }
    : {
        show: true,
        orient: cfg.legendAnchor === 'top' || cfg.legendAnchor === 'bottom' ? 'horizontal' : 'vertical',
        left: cfg.legendAnchor === 'left' ? 8 : cfg.legendAnchor === 'right' ? 'right' : 'center',
        top: cfg.legendAnchor === 'top' ? 8 : cfg.legendAnchor === 'bottom' ? 'bottom' : 'middle',
        textStyle: { fontSize: 11 },
      };

  const echartsOption = useMemo(() => ({
    color: PIE_PALETTE,
    tooltip: { trigger: 'item' },
    legend: legendOption ?? { show: false },
    series: [
      {
        type: 'pie',
        radius: innerRadiusPercent === 0 ? outerRadius : [innerRadius, outerRadius],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        data,
      },
    ],
  }), [data, innerRadiusPercent, innerRadius, legendOption]);

  if (!objectTypeId) {
    return (
      <div style={{ padding: '36px 24px', textAlign: 'center' }}>
        <Glyph name="pie-chart" size={32} tone="#cf923f" />
        <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Pick an Input Object Set in the inspector to render this chart.</p>
      </div>
    );
  }
  if (!cfg.groupBy) {
    return (
      <div style={{ padding: '36px 24px', textAlign: 'center' }}>
        <Glyph name="pie-chart" size={32} tone="#cf923f" />
        <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Choose a property to Group By in the inspector.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: padPx }}>
      {loading ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12, textAlign: 'center', padding: 24 }}>Loading…</p>
      ) : data.length === 0 ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12, textAlign: 'center', padding: 24 }}>No data to display.</p>
      ) : (
        <EChartCanvas options={echartsOption} style={{ height: 280 }} />
      )}
    </div>
  );
}

function ChartPieInspector({
  widget,
  variables,
  objectTypes,
  onChange,
  onDelete,
}: {
  widget: AppWidget;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onChange: (next: AppWidget) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'setup' | 'metadata' | 'display'>('setup');
  const cfg = readPieProps(widget);
  const sourceVariable = variables.find((v) => v.id === cfg.sourceVariableId) ?? null;
  const objectTypeId = sourceVariable?.object_type_id ?? cfg.objectTypeId ?? '';
  const objectType = objectTypes.find((entry) => entry.id === objectTypeId) ?? null;
  const [properties, setProperties] = useState<Property[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!objectTypeId) {
      setProperties([]);
      return;
    }
    let cancelled = false;
    void listProperties(objectTypeId)
      .then((response) => {
        if (!cancelled) setProperties(response);
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, [objectTypeId]);

  function patch(patchObj: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patchObj } });
  }

  const inputCount = properties.length > 0 ? widget.props : {};
  void inputCount;
  const numericProperties = properties.filter((p) => ['number', 'integer', 'float', 'double', 'decimal'].includes(String(p.property_type).toLowerCase()));

  return (
    <div style={inspectorStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>CHART: PIE</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['setup', 'metadata', 'display'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: '8px 6px', border: 0, background: 'transparent', borderBottom: tab === value ? '2px solid var(--status-info)' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? 'var(--text-strong)' : 'var(--text-muted)', marginRight: 14 }}
          >
            {value === 'setup' ? 'Widget setup' : value === 'metadata' ? 'Metadata' : 'Display'}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        <div style={{ padding: 14, display: 'grid', gap: 14 }}>
          <Section title="Input object set" />
          <Field label="Source">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, background: '#f7f9fa' }}>
              <Glyph name="cube" size={13} tone="#2d72d2" />
              <span style={{ flex: 1, fontSize: 13 }}>{sourceVariable ? sourceVariable.name : objectType ? objectType.display_name || objectType.name : 'Select object set…'}</span>
              <button type="button" aria-label="Edit" onClick={() => setPickerOpen(true)} className="of-button of-button--ghost" style={{ padding: 2 }}>
                <Glyph name="pencil" size={11} />
              </button>
              {(cfg.sourceVariableId || cfg.objectTypeId) ? (
                <button type="button" aria-label="Clear" onClick={() => patch({ source_variable_id: '', object_type_id: '', group_by_property: '', aggregation_property: '' })} className="of-button of-button--ghost" style={{ padding: 2 }}>
                  <Glyph name="x" size={11} />
                </button>
              ) : null}
            </div>
            <span className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>Current value: {sourceVariable ? sourceVariable.name : objectType ? objectType.display_name || objectType.name : 'undefined'}</span>
          </Field>

          <Section title="Group by" />
          <Field label="Property">
            <select value={cfg.groupBy} onChange={(event) => patch({ group_by_property: event.target.value })} style={inputStyle()}>
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.name}>{p.display_name || p.name}</option>
              ))}
            </select>
          </Field>
          <Toggle label="Enable ontology colors" value={cfg.enableColors} onChange={(checked) => patch({ enable_ontology_colors: checked })} />

          <Section title="Aggregation" />
          <Field label="Metric">
            <select value={cfg.metric} onChange={(event) => patch({ aggregation_metric: event.target.value })} style={inputStyle()}>
              <option value="count">Count</option>
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </Field>
          {cfg.metric !== 'count' ? (
            <Field label="Metric property">
              <select value={cfg.metricProperty} onChange={(event) => patch({ aggregation_property: event.target.value })} style={inputStyle()}>
                <option value="">Select a numeric property…</option>
                {numericProperties.map((p) => (
                  <option key={p.id} value={p.name}>{p.display_name || p.name}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <Toggle label="Enable numeric formatting" value={cfg.enableNumeric} onChange={(checked) => patch({ enable_numeric_formatting: checked })} />

          <Section title="Radius" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min={0} max={99} value={cfg.radius} onChange={(event) => patch({ radius: Number(event.target.value) })} style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--text-strong)', minWidth: 36, textAlign: 'right' }}>{cfg.radius}%</span>
          </div>

          <Section title="Padding" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
            {(['none', 'compact', 'normal', 'large'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => patch({ padding: kind })}
                style={{ padding: '6px 8px', border: '1px solid var(--border-default)', background: cfg.padding === kind ? '#fff' : '#f4f6f9', color: cfg.padding === kind ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: cfg.padding === kind ? 600 : 500 }}
              >
                {kind === 'none' ? 'None' : kind === 'compact' ? 'Compact' : kind === 'normal' ? 'Normal' : 'Large'}
              </button>
            ))}
          </div>

          <Section title="Legend" />
          <Toggle label="Show legend" value={cfg.showLegend} onChange={(checked) => patch({ show_legend: checked })} />
          {cfg.showLegend ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                {(['inside', 'next-to'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => patch({ legend_position: kind })}
                    style={{ padding: '6px 8px', border: '1px solid var(--border-default)', background: cfg.legendPosition === kind ? '#fff' : '#f4f6f9', color: cfg.legendPosition === kind ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: cfg.legendPosition === kind ? 600 : 500 }}
                  >
                    {kind === 'inside' ? 'Inside chart' : 'Next to chart'}
                  </button>
                ))}
              </div>
              {cfg.legendPosition === 'next-to' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                  {(['left', 'right', 'top', 'bottom'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => patch({ legend_anchor: kind })}
                      style={{ padding: '6px 8px', border: '1px solid var(--border-default)', background: cfg.legendAnchor === kind ? '#fff' : '#f4f6f9', color: cfg.legendAnchor === kind ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: cfg.legendAnchor === kind ? 600 : 500 }}
                    >
                      {kind[0].toUpperCase() + kind.slice(1)}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <button type="button" onClick={onDelete} className="of-button" style={{ color: 'var(--status-danger)', borderColor: '#fecaca' }}>
            <Glyph name="trash" size={12} /> Delete widget
          </button>
        </div>
      ) : tab === 'display' ? (
        <DisplayTab widget={widget} onChange={onChange} />
      ) : (
        <div style={{ padding: 14 }}><p className="of-text-muted" style={{ fontSize: 12 }}>Widget metadata coming soon.</p></div>
      )}
      {pickerOpen ? (
        <ObjectSetPicker
          objectTypes={objectTypes}
          onClose={() => setPickerOpen(false)}
          onSelect={(typeId) => {
            patch({ source_variable_id: '', object_type_id: typeId, group_by_property: '', aggregation_property: '' });
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ChartXyGlyph() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="3" y1="20" x2="21" y2="20" stroke="#5c7080" strokeWidth="1.5" />
      <line x1="3" y1="20" x2="3" y2="4" stroke="#5c7080" strokeWidth="1.5" />
      <rect x="6" y="10" width="3" height="9" fill="#2d72d2" />
      <rect x="11" y="6" width="3" height="13" fill="#cf923f" />
      <rect x="16" y="13" width="3" height="6" fill="#2d72d2" />
    </svg>
  );
}

const XY_PALETTE = ['#2d72d2', '#cf923f', '#15803d', '#b42318', '#7c5dd6', '#5c7080', '#0d9488', '#db2777', '#ca8a04', '#1f4ea0'];

function readXyConfig(widget: AppWidget) {
  const p = widget.props as Record<string, unknown>;
  const rawLayers = (p.layers as ChartXyLayer[] | undefined) ?? [];
  const layers = rawLayers.length > 0
    ? rawLayers
    : typeof p.source_variable_id === 'string' && p.source_variable_id
      ? [{
        ...makeChartXyLayer(),
        id: 'default-layer',
        source_variable_id: p.source_variable_id,
        object_type_id: typeof p.object_type_id === 'string' ? p.object_type_id : '',
        x_property: typeof p.x_property === 'string' ? p.x_property : '',
        series_property: typeof p.y_property === 'string' ? p.y_property : '',
        layer_type: ((p.series_kind as string) === 'line' || (p.series_kind as string) === 'scatter' ? p.series_kind : 'bar') as ChartXyLayer['layer_type'],
      }]
      : rawLayers;
  return {
    layers,
    yAxisKind: ((p.y_axis_kind as string) ?? 'categorical') as 'categorical' | 'continuous',
    showTitle: Boolean(p.show_title),
    showColorMarkers: p.show_color_markers !== false,
    enableNumericalFormatting: Boolean(p.enable_numerical_formatting),
    sortBy: ((p.sort_by as string) ?? 'key_asc') as 'key_asc' | 'key_desc' | 'value_asc' | 'value_desc',
    enableOntologyColors: p.enable_ontology_colors !== false,
    showLegend: Boolean(p.show_legend),
    showTooltips: p.show_tooltips !== false,
    allowExports: p.allow_exports !== false,
    barOrientation: ((p.bar_orientation as string) ?? 'horizontal') as 'horizontal' | 'vertical',
    outputFilterVariableId: typeof p.output_filter_variable_id === 'string' ? p.output_filter_variable_id : '',
    selectedObjectSetVariableId: typeof p.selected_object_set_variable_id === 'string' ? p.selected_object_set_variable_id : '',
  };
}

export function ChartXyWidgetView({ widget, variables }: { widget: AppWidget; variables: WorkshopVariable[] }) {
  const cfg = readXyConfig(widget);
  const runtime = useRuntime();
  const validLayers = useMemo(() => cfg.layers
    .map((layer) => {
      const sourceVariable = variables.find((v) => v.id === layer.source_variable_id) ?? null;
      const objectTypeId = sourceVariable?.object_type_id ?? layer.object_type_id ?? '';
      return { ...layer, object_type_id: objectTypeId };
    })
    .filter((layer) => layer.object_type_id && layer.x_property), [cfg.layers, variables]);
  const firstLayerWithObjectType = validLayers[0] ?? cfg.layers.find((layer) => {
    const sourceVariable = variables.find((v) => v.id === layer.source_variable_id) ?? null;
    return Boolean(sourceVariable?.object_type_id ?? layer.object_type_id);
  }) ?? null;
  const hasObjectType = Boolean(firstLayerWithObjectType);
  const hasXAxis = validLayers.length > 0 || cfg.layers.some((layer) => layer.x_property);
  const outputFilterVariable = useMemo(() => (
    variables.find((v) => v.id === cfg.outputFilterVariableId && v.kind === 'filter_output')
    ?? variables.find((v) => v.kind === 'filter_output' && v.source_widget_id === widget.id)
    ?? null
  ), [cfg.outputFilterVariableId, variables, widget.id]);
  const selectedObjectSetVariable = useMemo(() => (
    variables.find((v) => v.id === cfg.selectedObjectSetVariableId && v.kind === 'object_set_selection')
    ?? variables.find((v) => v.kind === 'object_set_selection' && v.source_widget_id === widget.id)
    ?? null
  ), [cfg.selectedObjectSetVariableId, variables, widget.id]);
  const [rowsByLayer, setRowsByLayer] = useState<Record<string, ObjectInstance[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const layerQueryKey = useMemo(() => validLayers
    .map((layer) => `${layer.id}:${layer.source_variable_id}:${layer.object_type_id}:${layer.x_property}:${layer.series_metric}:${layer.series_property}:${layer.segment_by}`)
    .join('|'), [validLayers]);

  useEffect(() => {
    if (validLayers.length === 0) {
      setRowsByLayer({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all(validLayers.map(async (layer) => {
      const response = layer.source_variable_id
        ? await runtime.executeObjectSet(layer.source_variable_id, { objectTypeId: layer.object_type_id, limit: 5000 })
        : await executeWorkshopObjectSet({ objectTypeId: layer.object_type_id, limit: 5000 });
      return [layer.id, response.data] as const;
    }))
      .then((entries) => {
        if (cancelled) return;
        setRowsByLayer(Object.fromEntries(entries));
      })
      .catch(() => {
        if (cancelled) return;
        setRowsByLayer({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [layerQueryKey, runtime.executeObjectSet, runtime.refreshKey, validLayers]);

  const aggregation = useMemo(() => {
    if (validLayers.length === 0) return null;
    return buildChartXyAggregation(rowsByLayer, validLayers, {
      sortBy: cfg.sortBy,
      barOrientation: cfg.barOrientation,
    });
  }, [cfg.barOrientation, cfg.sortBy, rowsByLayer, validLayers]);

  const echartsOption = useMemo(() => (
    aggregation
      ? chartXyEChartsOption(aggregation, {
        barOrientation: cfg.barOrientation,
        showLegend: cfg.showLegend,
        showTooltips: cfg.showTooltips,
        showTitle: cfg.showTitle,
        palette: XY_PALETTE,
      })
      : null
  ), [aggregation, cfg.barOrientation, cfg.showLegend, cfg.showTitle, cfg.showTooltips]);

  const selectCategory = useCallback((category: string | null) => {
    setSelectedCategory(category);
    const objects = category && aggregation ? aggregation.objectsByCategory[category] ?? [] : [];
    if (selectedObjectSetVariable) runtime.setSelectedObjectSet(selectedObjectSetVariable.id, objects);
    if (outputFilterVariable) {
      runtime.setFilterValue(
        outputFilterVariable.id,
        category ? { values: [category] } : {},
        {
          outputVariableId: outputFilterVariable.id,
          sourceWidgetId: widget.id,
          propertyName: aggregation?.firstCategoryProperty ?? '',
          component: 'multi_select',
        },
      );
    }
    void runtime.dispatchEvents(widget, 'mark_select', {
      category,
      property_name: aggregation?.firstCategoryProperty ?? '',
      object_ids: objects.map((object) => object.id),
      objects,
    });
  }, [aggregation, outputFilterVariable, runtime, selectedObjectSetVariable, widget]);

  if (!hasObjectType) {
    return (
      <div style={{ padding: '36px 24px', textAlign: 'center' }}>
        <ChartXyGlyph />
        <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Pick an Input Object Set in the layer editor.</p>
      </div>
    );
  }
  if (!hasXAxis) {
    return (
      <div style={{ padding: '36px 24px', textAlign: 'center' }}>
        <ChartXyGlyph />
        <p className="of-text-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Choose an X axis property in the layer editor.</p>
      </div>
    );
  }
  return (
    <div style={{ padding: 12 }}>
      {loading ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12, textAlign: 'center', padding: 24 }}>Loading…</p>
      ) : !echartsOption ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12, textAlign: 'center', padding: 24 }}>No data to display.</p>
      ) : (
        <>
          <EChartCanvas
            options={echartsOption}
            style={{ height: 280 }}
            onClick={(params) => {
              const category = params.name === null || params.name === undefined ? '' : String(params.name);
              if (category) selectCategory(category);
            }}
          />
          {aggregation && aggregation.categories.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {aggregation.categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selectedCategory === category}
                  onClick={() => selectCategory(selectedCategory === category ? null : category)}
                  style={{ border: selectedCategory === category ? '1px solid var(--status-info)' : '1px solid var(--border-subtle)', borderRadius: 16, background: selectedCategory === category ? 'rgba(45, 114, 210, 0.08)' : '#fff', color: 'var(--text-strong)', cursor: 'pointer', fontSize: 12, padding: '4px 10px' }}
                >
                  Select {category}
                </button>
              ))}
              {selectedCategory ? (
                <button type="button" className="of-link" onClick={() => selectCategory(null)} style={{ ...linkBtnStyle(), fontSize: 12, padding: '4px 6px' }}>
                  Clear selection
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ChartXyInspector({
  widget,
  variables,
  objectTypes,
  onChange,
  onRetypeOutputs,
  onDelete,
}: {
  widget: AppWidget;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onChange: (next: AppWidget) => void;
  onRetypeOutputs?: (objectTypeId: string) => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<'setup' | 'metadata' | 'display'>('setup');
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [orientationCustomize, setOrientationCustomize] = useState(false);
  const cfg = readXyConfig(widget);

  function patch(patchObj: Record<string, unknown>) {
    onChange({ ...widget, props: { ...widget.props, ...patchObj } });
  }

  function patchLayer(layerId: string, mutator: (layer: ChartXyLayer) => ChartXyLayer) {
    const layers = cfg.layers.map((layer) => (layer.id === layerId ? mutator(layer) : layer));
    patch({ layers });
  }

  function addLayer() {
    patch({ layers: [...cfg.layers, makeChartXyLayer()] });
  }

  function removeLayer(id: string) {
    patch({ layers: cfg.layers.filter((layer) => layer.id !== id) });
  }

  const editingLayer = cfg.layers.find((layer) => layer.id === editingLayerId) ?? null;

  return (
    <div style={inspectorStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{widget.title}</span>
        <span className="of-text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>CHART: XY</span>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        {(['setup', 'metadata', 'display'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            style={{ padding: '8px 6px', border: 0, background: 'transparent', borderBottom: tab === value ? '2px solid var(--status-info)' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === value ? 600 : 500, color: tab === value ? 'var(--text-strong)' : 'var(--text-muted)', marginRight: 14 }}
          >
            {value === 'setup' ? 'Widget setup' : value === 'metadata' ? 'Metadata' : 'Display'}
          </button>
        ))}
      </div>
      {tab === 'setup' ? (
        editingLayer ? (
          <ChartXyLayerEditor
            layer={editingLayer}
            variables={variables}
            objectTypes={objectTypes}
            onBack={() => setEditingLayerId(null)}
            onChange={(next) => patchLayer(editingLayer.id, () => next)}
            onRetypeOutputs={onRetypeOutputs}
          />
        ) : (
          <div style={{ padding: 14, display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>Chart Editor</p>
            <Section title={`Plot Layers ${cfg.layers.length}`} />
            <div style={{ display: 'grid', gap: 4 }}>
              {cfg.layers.map((layer) => (
                <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
                  <ChartXyGlyph />
                  <button type="button" onClick={() => setEditingLayerId(layer.id)} style={{ flex: 1, border: 0, background: 'transparent', padding: 0, textAlign: 'left', fontSize: 13, cursor: 'pointer' }}>{layer.title}</button>
                  {cfg.layers.length > 1 ? (
                    <button type="button" aria-label="Remove layer" onClick={() => removeLayer(layer.id)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--status-danger)' }}><Glyph name="trash" size={11} /></button>
                  ) : null}
                  <button type="button" aria-label="Edit layer" onClick={() => setEditingLayerId(layer.id)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}><Glyph name="chevron-right" size={11} /></button>
                </div>
              ))}
              <button type="button" onClick={addLayer} className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
                <Glyph name="plus" size={11} /> Add a layer
              </button>
            </div>

            <Section title={`Annotations 0`} />
            <button type="button" className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
              <Glyph name="plus" size={11} /> Add annotation
            </button>

            <Section title="Y axis" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {(['categorical', 'continuous'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => patch({ y_axis_kind: kind })}
                  style={{ padding: '6px 8px', border: '1px solid var(--border-default)', background: cfg.yAxisKind === kind ? '#fff' : '#f4f6f9', color: cfg.yAxisKind === kind ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: cfg.yAxisKind === kind ? 600 : 500 }}
                >
                  {kind === 'categorical' ? 'Categorical' : 'Continuous'}
                </button>
              ))}
            </div>
            <Toggle label="Show title" value={cfg.showTitle} onChange={(checked) => patch({ show_title: checked })} />
            <Toggle label="Show color markers" value={cfg.showColorMarkers} onChange={(checked) => patch({ show_color_markers: checked })} />
            <Toggle label="Enable numerical formatting" value={cfg.enableNumericalFormatting} onChange={(checked) => patch({ enable_numerical_formatting: checked })} />
            <Field label="Sort by">
              <select value={cfg.sortBy} onChange={(event) => patch({ sort_by: event.target.value })} style={inputStyle()}>
                <option value="key_asc">Key Ascending</option>
                <option value="key_desc">Key Descending</option>
                <option value="value_asc">Value Ascending</option>
                <option value="value_desc">Value Descending</option>
              </select>
            </Field>

            <Section title="X axis" />
            <div style={{ padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Axes display settings are automatically generated by series data.</p>
              <button type="button" className="of-button" style={{ marginTop: 8, fontSize: 12, justifyContent: 'center', width: '100%' }}>
                <Glyph name="settings" size={11} /> Customize
              </button>
            </div>

            <Section title="Ontology formatting" />
            <Toggle label="Enable ontology colors" value={cfg.enableOntologyColors} onChange={(checked) => patch({ enable_ontology_colors: checked })} />

            <Section title="Legend" />
            <Toggle label="Show legend" value={cfg.showLegend} onChange={(checked) => patch({ show_legend: checked })} />

            <Section title="Tooltips" />
            <Toggle label="Show tooltips" value={cfg.showTooltips} onChange={(checked) => patch({ show_tooltips: checked })} />

            <Section title="Exports" />
            <Toggle label="Allow exports" value={cfg.allowExports} onChange={(checked) => patch({ allow_exports: checked })} />

            <Section title="Bar orientation" />
            {orientationCustomize ? (
              <div style={{ padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 4, display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                  {(['horizontal', 'vertical'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => patch({ bar_orientation: kind })}
                      style={{ padding: '6px 8px', border: '1px solid var(--border-default)', background: cfg.barOrientation === kind ? '#fff' : '#f4f6f9', color: cfg.barOrientation === kind ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: cfg.barOrientation === kind ? 600 : 500 }}
                    >
                      {kind === 'horizontal' ? 'Horizontal' : 'Vertical'}
                    </button>
                  ))}
                </div>
                <button type="button" className="of-link" onClick={() => setOrientationCustomize(false)} style={linkBtnStyle()}>Close</button>
              </div>
            ) : (
              <div style={{ padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f7f9fa' }}>
                <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Bar Orientation settings are automatically generated by series data.</p>
                <button type="button" className="of-button" onClick={() => setOrientationCustomize(true)} style={{ marginTop: 8, fontSize: 12, justifyContent: 'center', width: '100%' }}>
                  <Glyph name="settings" size={11} /> Customize
                </button>
              </div>
            )}

            <button type="button" onClick={onDelete} className="of-button" style={{ color: 'var(--status-danger)', borderColor: '#fecaca' }}>
              <Glyph name="trash" size={12} /> Delete widget
            </button>
          </div>
        )
      ) : tab === 'display' ? (
        <DisplayTab widget={widget} onChange={onChange} />
      ) : (
        <div style={{ padding: 14 }}><p className="of-text-muted" style={{ fontSize: 12 }}>Widget metadata coming soon.</p></div>
      )}
    </div>
  );
}

function PreviewRuntime({
  app,
  pages,
  activePage,
  variables,
  objectTypes,
  headerSettings,
  headerUi,
  onEdit,
  onOpenLineage,
  children,
}: {
  app: AppDefinition;
  pages: AppPage[];
  activePage: AppPage;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  headerSettings: WorkshopHeaderSettings;
  headerUi: HeaderUiState;
  onEdit: () => void;
  onOpenLineage: () => void;
  children: React.ReactNode;
}) {
  const [activeObjects, setActiveObjects] = useState<Record<string, ObjectInstance | null>>({});
  const [selectedObjectSets, setSelectedObjectSets] = useState<Record<string, ObjectInstance[]>>({});
  const [shapeOutputs, setShapeOutputs] = useState<Record<string, WorkshopMapFeatureCollection | null>>({});
  const [filterValues, setFilterValues] = useState<Record<string, WorkshopFilterRuntimeValue>>({});
  const [filterMetadata, setFilterMetadata] = useState<Record<string, WorkshopRuntimeFilterMetadata>>({});
  const [primitiveValues, setPrimitiveValues] = useState<Record<string, unknown>>({});
  const [functionValues, setFunctionValues] = useState<Record<string, WorkshopFunctionRuntimeValue>>({});
  const [runtimeParameters, setRuntimeParametersState] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionModal, setActionModal] = useState<{ button: ButtonGroupButton } | null>(null);
  const [toast, setToast] = useState<string | { message: string; href?: string; linkLabel?: string } | null>(null);
  const eventHandlersRef = useRef<WorkshopEventHandlers>({});

  const setActiveObject = useCallback((variableId: string, object: ObjectInstance | null) => {
    setActiveObjects((current) => ({ ...current, [variableId]: object }));
  }, []);
  const setSelectedObjectSet = useCallback((variableId: string, objects: ObjectInstance[]) => {
    setSelectedObjectSets((current) => {
      const existing = current[variableId] ?? [];
      if (sameRuntimeObjectSelection(existing, objects)) return current;
      return { ...current, [variableId]: objects };
    });
  }, []);
  const setShapeOutput = useCallback((variableId: string, shape: WorkshopMapFeatureCollection | null) => {
    setShapeOutputs((current) => {
      if (sameRuntimeShapeOutput(current[variableId] ?? null, shape)) return current;
      return { ...current, [variableId]: shape };
    });
  }, []);
  const setFilterValue = useCallback((filterId: string, value: WorkshopFilterRuntimeValue, metadata?: WorkshopRuntimeFilterMetadata) => {
    setFilterValues((current) => ({ ...current, [filterId]: value }));
    if (metadata) {
      setFilterMetadata((current) => ({ ...current, [filterId]: { ...(current[filterId] ?? {}), ...metadata } }));
    }
  }, []);
  const setPrimitiveValue = useCallback((variableId: string, value: unknown) => {
    setPrimitiveValues((current) => (Object.is(current[variableId], value) ? current : { ...current, [variableId]: value }));
  }, []);
  const setRuntimeParameters = useCallback((parameters: Record<string, string>) => {
    setRuntimeParametersState((current) => (sameStringRecord(current, parameters) ? current : { ...parameters }));
  }, []);
  const onButtonClick = useCallback((button: ButtonGroupButton) => {
    if (button.on_click_kind === 'action' && button.action_type_id) {
      setActionModal({ button });
    }
  }, []);
  const setEventHandlers = useCallback((handlers: WorkshopEventHandlers) => {
    eventHandlersRef.current = handlers;
    return () => {
      if (eventHandlersRef.current === handlers) eventHandlersRef.current = {};
    };
  }, []);
  const defaultEventHandlers = useMemo<WorkshopEventHandlers>(() => ({
    setVariable: (variableId, value) => setPrimitiveValue(variableId, value),
    setRuntimeParameters,
    navigate: (target, event) => setToast(event.label ? `${event.label}: ${target}` : `Navigate to ${target}`),
    openUrl: (url) => setToast(`Preview link: ${url}`),
    refresh: () => {
      clearWorkshopFunctionResultCache();
      setFunctionValues({});
      setRefreshKey((key) => key + 1);
      setToast('Runtime refreshed.');
    },
    applyAction: (actionTypeId, payload, event) => {
      setActionModal({
        button: {
          id: `event_${event.id}`,
          label: event.label ?? 'Apply action',
          on_click_kind: 'action',
          action_type_id: actionTypeId,
          parameter_defaults: scenarioPayloadToActionDefaults(payload),
          default_layout: 'form',
          switch_layout: false,
          conditional_visibility: false,
        },
      });
    },
    exportData: (format, payload, event) => {
      downloadWorkshopEventPayload(format, payload, event.label ?? event.id);
      setToast(`Exported ${format}.`);
    },
    command: (command) => setToast(`Command: ${command}`),
    setFilter: (value) => setToast(value ? `Filter applied: ${value}` : 'Filter cleared.'),
    seedPrompt: () => setToast('Prompt applied.'),
    notice: (message) => setToast(message),
  }), [setPrimitiveValue, setRuntimeParameters]);
  const variableEngine = useMemo(() => createWorkshopVariableEngine(variables, {
    activeObjects,
    selectedObjectSets,
    shapeOutputs,
    filterValues,
    filterMetadata,
    primitiveValues,
    functionValues,
    runtimeParameters,
  }), [activeObjects, filterMetadata, filterValues, functionValues, primitiveValues, runtimeParameters, selectedObjectSets, shapeOutputs, variables]);
  useEffect(() => {
    for (const variable of variables) {
      if (variable.kind !== 'function_output') continue;
      const invocation = buildFunctionInvocation(variable, variableEngine);
      if (!invocation) continue;
      const cached = getCachedFunctionVariableValue(invocation.cacheKey);
      if (cached) {
        if (functionValues[variable.id]?.cache_key !== invocation.cacheKey || functionValues[variable.id]?.status !== 'success') {
          setFunctionValues((state) => ({ ...state, [variable.id]: cached }));
        }
        continue;
      }
      const current = functionValues[variable.id];
      if (current?.cache_key === invocation.cacheKey && (current.status === 'loading' || current.status === 'success')) continue;
      setFunctionValues((state) => ({
        ...state,
        [variable.id]: {
          value: state[variable.id]?.value ?? null,
          status: 'loading',
          cache_key: invocation.cacheKey,
        },
      }));
      void executeCachedFunctionVariable(invocation)
        .then((next) => {
          setFunctionValues((state) => {
            if (state[variable.id]?.cache_key !== invocation.cacheKey) return state;
            return { ...state, [variable.id]: next };
          });
        })
        .catch((error: unknown) => {
          setFunctionValues((state) => {
            if (state[variable.id]?.cache_key !== invocation.cacheKey) return state;
            return {
              ...state,
              [variable.id]: {
                value: state[variable.id]?.value ?? null,
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                cache_key: invocation.cacheKey,
              },
            };
          });
        });
    }
  }, [functionValues, variableEngine, variables]);
  const executeObjectSet = useCallback((variableId: string, options: WorkshopObjectSetExecutionOptions = {}) => {
    const variable = variables.find((entry) => entry.id === variableId) ?? null;
    return executeWorkshopObjectSet({
      variableId,
      variable,
      variables,
      engine: variableEngine,
      objectTypeId: options.objectTypeId,
      limit: options.limit,
      sort: options.sort,
      aggregations: options.aggregations,
      includeCount: options.includeCount,
    });
  }, [variableEngine, variables]);
  const dispatchEvents = useCallback((widget: Pick<AppWidget, 'id' | 'events'>, trigger: string, payload: Record<string, unknown> = {}) => {
    return runWorkshopEvents({
      events: Array.isArray(widget.events) ? widget.events : [],
      trigger,
      payload,
      state: { runtimeParameters },
      handlers: { ...defaultEventHandlers, ...eventHandlersRef.current },
    });
  }, [defaultEventHandlers, runtimeParameters]);

  const runtime = useMemo<RuntimeApi>(() => ({
    preview: true,
    activeObjects,
    selectedObjectSets,
    shapeOutputs,
    filterValues,
    filterMetadata,
    primitiveValues,
    runtimeParameters,
    variableEngine,
    refreshKey,
    setActiveObject,
    setSelectedObjectSet,
    setShapeOutput,
    setFilterValue,
    setPrimitiveValue,
    setRuntimeParameters,
    executeObjectSet,
    dispatchEvents,
    setEventHandlers,
    onButtonClick,
  }), [activeObjects, dispatchEvents, executeObjectSet, filterMetadata, filterValues, primitiveValues, refreshKey, runtimeParameters, selectedObjectSets, setActiveObject, setEventHandlers, setFilterValue, setPrimitiveValue, setRuntimeParameters, setSelectedObjectSet, setShapeOutput, shapeOutputs, variableEngine, onButtonClick]);

  void pages;
  void activePage;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        onOpenLineage();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenLineage]);

  return (
    <WorkshopRuntimeContext.Provider value={runtime}>
      <WorkshopDataContext.Provider value={{ variables, objectTypes }}>
        <PreviewShell app={app} headerSettings={headerSettings} headerUi={headerUi} onEdit={onEdit}>
          {children}
        </PreviewShell>
        {actionModal ? (
          <ActionFormModal
            button={actionModal.button}
            variables={variables}
            activeObjects={activeObjects}
            selectedObjectSets={selectedObjectSets}
            objectTypes={objectTypes}
            variableEngine={variableEngine}
            onClose={() => setActionModal(null)}
            onSuccess={(result) => {
              setActionModal(null);
              const objectViewLink = buildObjectViewActionSuccessToastLink({ result, objectTypes });
              setToast(objectViewLink
                ? {
                    message: workshopActionSuccessMessage(result),
                    href: objectViewLink.href,
                    linkLabel: objectViewLink.label,
                  }
                : workshopActionSuccessMessage(result));
              setRefreshKey((key) => key + 1);
              window.setTimeout(() => setToast(null), 4000);
            }}
          />
        ) : null}
        {toast ? (
          <div role="status" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 6, background: '#15803d', color: '#fff', fontSize: 13, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)' }}>
            <Glyph name="check" size={13} tone="#fff" />
            <span>{typeof toast === 'string' ? toast : toast.message}</span>
            {typeof toast !== 'string' && toast.href ? (
              <Link to={toast.href} style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
                {toast.linkLabel ?? 'Open Object View'}
              </Link>
            ) : null}
            <button type="button" className="of-link" style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Revert</button>
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} style={{ border: 0, background: 'transparent', color: '#fff', cursor: 'pointer' }}><Glyph name="x" size={11} tone="#fff" /></button>
          </div>
        ) : null}
      </WorkshopDataContext.Provider>
    </WorkshopRuntimeContext.Provider>
  );
}

function sameRuntimeObjectSelection(left: ObjectInstance[], right: ObjectInstance[]) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry.id === right[index]?.id);
}

function sameRuntimeShapeOutput(left: WorkshopMapFeatureCollection | null, right: WorkshopMapFeatureCollection | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function resolveRuntimeObject(
  variableId: string,
  activeObjects: Record<string, ObjectInstance | null>,
  selectedObjectSets: Record<string, ObjectInstance[]>,
) {
  return activeObjects[variableId] ?? selectedObjectSets[variableId]?.[0] ?? null;
}

interface ActionFormIssue {
  source: 'local' | 'server';
  message: string;
  parameter?: string;
}

export function workshopActionSuccessMessage(result?: ExecuteActionResponse | ExecuteBatchActionResponse) {
  if (isBatchActionResponse(result)) {
    if (result.failed > 0) return `${result.succeeded} actions applied, ${result.failed} failed.`;
    return `${result.succeeded} actions applied successfully.`;
  }
  const operation = result?.action?.operation_kind;
  if (operation === 'invoke_webhook') return 'Webhook action successfully applied.';
  if (operation === 'invoke_function') return 'Function action successfully applied.';
  if (operation === 'create_object') return 'Object created successfully.';
  if (operation === 'create_or_modify_object') return 'Object saved successfully.';
  if (operation === 'delete_object') return 'Object deleted successfully.';
  if (operation === 'delete_link') return 'Link removed successfully.';
  return 'Edits successfully applied.';
}

function isBatchActionResponse(result: ExecuteActionResponse | ExecuteBatchActionResponse | undefined): result is ExecuteBatchActionResponse {
  return Boolean(result && typeof (result as ExecuteBatchActionResponse).total === 'number' && Array.isArray((result as ExecuteBatchActionResponse).results));
}

function actionOperationLabel(operation: ActionOperationKind) {
  if (operation === 'create_object') return 'Create action';
  if (operation === 'update_object') return 'Edit action';
  if (operation === 'modify_object') return 'Edit action';
  if (operation === 'create_or_modify_object') return 'Create or edit action';
  if (operation === 'delete_object') return 'Delete action';
  if (operation === 'create_link') return 'Link action';
  if (operation === 'delete_link') return 'Unlink action';
  if (operation === 'invoke_webhook') return 'Webhook action';
  if (operation === 'invoke_function') return 'Function action';
  return operation.replaceAll('_', ' ');
}

export function ActionFormModal({
  button,
  variables = [],
  activeObjects = {},
  selectedObjectSets = {},
  objectTypes = [],
  variableEngine,
  onClose,
  onSuccess,
}: {
  button: ButtonGroupButton;
  variables?: WorkshopVariable[];
  activeObjects?: Record<string, ObjectInstance | null>;
  selectedObjectSets?: Record<string, ObjectInstance[]>;
  objectTypes?: ObjectType[];
  variableEngine?: WorkshopVariableEngineResult;
  onClose: () => void;
  onSuccess: (result?: ExecuteActionResponse | ExecuteBatchActionResponse) => void;
}) {
  const [action, setAction] = useState<ActionType | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationInfo, setValidationInfo] = useState('');
  const [serverIssues, setServerIssues] = useState<ActionFormIssue[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [initialFormValues, setInitialFormValues] = useState<Record<string, string>>({});
  const [justification, setJustification] = useState('');
  const [batchInfo, setBatchInfo] = useState<ExecuteBatchActionResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setValidationInfo('');
    void getActionType(button.action_type_id)
      .then((fetched) => {
        if (cancelled) return;
        setAction(fetched);
        const initialValues = initialActionFormValues(fetched, button, variables, activeObjects, selectedObjectSets, variableEngine);
        setFormValues(initialValues);
        setInitialFormValues(initialValues);
        setJustification('');
        setServerIssues([]);
        setBatchInfo(null);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(actionErrorMessage(cause) || 'Failed to load action');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [button, variables, activeObjects, selectedObjectSets, variableEngine]);

  const defaultActiveObject = useMemo(() => {
    for (const def of Object.values(button.parameter_defaults ?? {})) {
      if ((def.kind === 'active_object' || def.kind === 'variable') && def.variable_id) {
        const engineObject = variableEngine?.getActiveObject(def.variable_id);
        if (engineObject) return engineObject;
        const object = activeObjects[def.variable_id];
        if (object) return object;
        const selected = selectedObjectSets[def.variable_id]?.[0] ?? null;
        if (selected) return selected;
      }
    }
    const objectVariable = variables.find((v) => v.kind === 'object_set_active_object') ?? variables.find((v) => v.kind === 'object_set_selection') ?? null;
    return objectVariable ? (variableEngine?.getActiveObject(objectVariable.id) ?? resolveRuntimeObject(objectVariable.id, activeObjects, selectedObjectSets)) : null;
  }, [activeObjects, button.parameter_defaults, selectedObjectSets, variableEngine, variables]);
  const objectType = action ? objectTypes.find((entry) => entry.id === action.object_type_id) ?? null : null;
  const targetField = action ? actionTargetField(action) : null;
  const visibleFields = action ? (action.input_schema ?? []).filter((field) => actionParameterVisibility(action, button, field) !== 'hidden') : [];
  const localIssues = useMemo<ActionFormIssue[]>(() => {
    if (!action || loading) return [];
    const request = buildActionExecutionRequest(action, formValues, defaultActiveObject, justification);
    return request.ok ? [] : request.errors.map((message) => ({ source: 'local', message }));
  }, [action, defaultActiveObject, formValues, justification, loading]);
  const requestPreview = useMemo(() => (
    action && !loading ? buildActionExecutionRequest(action, formValues, defaultActiveObject, justification) : null
  ), [action, defaultActiveObject, formValues, justification, loading]);
  const issues = [...localIssues, ...serverIssues];
  const canSubmit = Boolean(action && !loading && !submitting && localIssues.length === 0);

  function patchFormValue(name: string, value: string) {
    setFormValues((current) => ({ ...current, [name]: value }));
    setServerIssues([]);
    setValidationInfo('');
    setError('');
    setBatchInfo(null);
  }

  function patchJustification(value: string) {
    setJustification(value);
    setServerIssues([]);
    setValidationInfo('');
    setError('');
    setBatchInfo(null);
  }

  async function submit() {
    if (!action) return;
    const request = buildActionExecutionRequest(action, formValues, defaultActiveObject, justification);
    if (!request.ok) {
      setServerIssues([]);
      setError('');
      setValidationInfo('');
      return;
    }
    setSubmitting(true);
    setError('');
    setValidationInfo('');
    setServerIssues([]);
    setBatchInfo(null);
    try {
      const validation = await validateAction(action.id, {
        target_object_id: request.targetObjectId ?? request.targetObjectIds[0],
        parameters: request.parameters,
        execution_context: {
          surface: 'workshop_action_execution',
          action_execution_id: action.id,
          source: 'workshop',
        },
      });
      if (validation && validation.valid === false) {
        const nextIssues = normalizeActionValidationIssues(validation.errors);
        setServerIssues(nextIssues.length > 0 ? nextIssues : [{ source: 'server', message: 'Action validation failed.' }]);
        return;
      }
      setValidationInfo('Validation passed.');
      if (request.targetObjectIds.length > 1) {
        const result = await executeActionBatch(action.id, {
          target_object_ids: request.targetObjectIds,
          parameters: request.parameters,
          justification: request.justification,
          execution_context: {
            surface: 'workshop_action_execution',
            action_execution_id: action.id,
            source: 'workshop',
          },
        });
        if (result.failed > 0) {
          setBatchInfo(result);
          setValidationInfo(actionBatchSummary(result));
          setServerIssues(normalizeActionBatchIssues(result));
          return;
        }
        onSuccess(result);
        return;
      }
      const result = await executeAction(action.id, {
        target_object_id: request.targetObjectId,
        parameters: request.parameters,
        justification: request.justification,
        execution_context: {
          surface: 'workshop_action_execution',
          action_execution_id: action.id,
          source: 'workshop',
        },
      });
      onSuccess(result);
    } catch (cause) {
      setError(actionErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setFormValues(initialFormValues);
    setJustification('');
    setError('');
    setValidationInfo('');
    setServerIssues([]);
    setBatchInfo(null);
  }

  return (
    <div role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(17, 24, 39, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <section style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 6, boxShadow: '0 20px 48px rgba(15, 23, 42, 0.2)', overflow: 'hidden' }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{action?.display_name || action?.name || 'Action'}</h3>
            {action ? <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 11 }}>{actionOperationLabel(action.operation_kind)} on {objectType?.display_name || objectType?.name || action.object_type_id}</p> : null}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="of-button of-button--ghost" style={{ padding: 4 }}><Glyph name="x" size={12} /></button>
        </header>
        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
          {loading ? (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>Loading…</p>
          ) : !action ? (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>{error || 'Action not found.'}</p>
          ) : (
            <>
              {visibleFields.length === 0 ? (
                <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>This action does not require user parameters.</p>
              ) : visibleFields.map((field) => {
                const visibility = actionParameterVisibility(action, button, field);
                const required = actionParameterRequired(action, field);
                const isTarget = targetField?.name === field.name;
                return (
                  <label key={field.name} style={{ display: 'grid', gap: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      <span>
                        {field.display_name || field.name}
                        {required ? <span style={{ color: 'var(--status-danger)' }}> *</span> : null}
                      </span>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        {isTarget ? <span className="of-chip" style={{ fontSize: 10 }}>Target</span> : null}
                        {visibility === 'disabled' ? <span className="of-chip" style={{ fontSize: 10 }}>Read only</span> : null}
                      </span>
                    </span>
                    <ActionParameterControl
                      field={field}
                      value={formValues[field.name] ?? ''}
                      disabled={visibility === 'disabled' || submitting}
                      onChange={(value) => patchFormValue(field.name, value)}
                    />
                    {field.description ? <span className="of-text-muted" style={{ fontSize: 11 }}>{field.description}</span> : null}
                  </label>
                );
              })}

              {requestPreview?.ok && requestPreview.targetObjectIds.length > 1 ? (
                <div style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', fontSize: 12 }}>
                  Bulk action over {requestPreview.targetObjectIds.length} selected objects.
                </div>
              ) : null}

              {action.confirmation_required ? (
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Justification <span style={{ color: 'var(--status-danger)' }}>*</span></span>
                  <textarea
                    value={justification}
                    onChange={(event) => patchJustification(event.target.value)}
                    placeholder="Explain why this action should be applied"
                    rows={3}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 13, resize: 'vertical' }}
                  />
                </label>
              ) : null}

              {batchInfo ? (
                <div style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 12 }}>
                  <strong>{actionBatchSummary(batchInfo)}</strong>
                </div>
              ) : null}
              {issues.length > 0 ? (
                <div role="alert" style={{ padding: '8px 12px', borderRadius: 4, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 12 }}>
                  <strong>{issues.length} issue{issues.length === 1 ? '' : 's'} found</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {issues.map((issue, index) => (
                      <li key={`${issue.source}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : validationInfo ? (
                <div className="of-status-success" style={{ padding: '8px 12px', borderRadius: 4, fontSize: 12 }}>
                  {validationInfo}
                </div>
              ) : null}
              {error ? (
                <div role="alert" className="of-status-danger" style={{ whiteSpace: 'pre-wrap', padding: '8px 12px', borderRadius: 4, fontSize: 12 }}>
                  {error}
                </div>
              ) : null}
            </>
          )}
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" aria-label="Reset" className="of-button of-button--ghost" style={{ padding: 8 }} onClick={resetForm} disabled={submitting}><Glyph name="undo" size={12} /></button>
          <button type="button" className="of-button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            style={{ padding: '8px 16px', border: 0, borderRadius: 4, background: '#15803d', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.65 }}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ActionParameterControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ActionInputField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const type = field.property_type.toLowerCase();
  const baseStyle = { padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: 4, fontSize: 13, background: disabled ? '#f7f9fa' : '#fff' };
  if (type === 'boolean' || type === 'bool') {
    return (
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} style={baseStyle}>
        <option value="">Select…</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }
  if (type === 'integer' || type === 'long' || type === 'short' || type === 'byte' || type === 'double' || type === 'float' || type === 'decimal' || type === 'number') {
    return (
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.display_name || field.name}
        style={baseStyle}
      />
    );
  }
  if (type === 'struct' || type === 'array' || type === 'json' || isObjectListParameter(field)) {
    return (
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.display_name || field.name}
        rows={3}
        style={{ ...baseStyle, resize: 'vertical' }}
      />
    );
  }
  return (
    <input
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.property_type === 'object_reference' ? 'Object id' : (field.display_name || field.name)}
      style={baseStyle}
    />
  );
}

function initialActionFormValues(
  action: ActionType,
  button: ButtonGroupButton,
  variables: WorkshopVariable[],
  activeObjects: Record<string, ObjectInstance | null>,
  selectedObjectSets: Record<string, ObjectInstance[]>,
  variableEngine?: WorkshopVariableEngineResult,
) {
  const initialValues: Record<string, string> = {};
  for (const field of action.input_schema ?? []) {
    initialValues[field.name] = stringifyActionFormValue(resolveActionParameterDefault(
      action,
      button,
      field,
      variables,
      activeObjects,
      selectedObjectSets,
      variableEngine,
    ));
  }
  const targetField = actionTargetField(action);
  if (targetField && !initialValues[targetField.name]) {
    const objectVariable = variables.find((v) => v.kind === 'object_set_active_object') ?? variables.find((v) => v.kind === 'object_set_selection') ?? null;
    if (objectVariable) {
      const object = variableEngine?.getActiveObject(objectVariable.id) ?? resolveRuntimeObject(objectVariable.id, activeObjects, selectedObjectSets);
      if (object) initialValues[targetField.name] = object.id;
    }
  }
  return initialValues;
}

function resolveActionParameterDefault(
  action: ActionType,
  button: ButtonGroupButton,
  field: ActionInputField,
  variables: WorkshopVariable[],
  activeObjects: Record<string, ObjectInstance | null>,
  selectedObjectSets: Record<string, ObjectInstance[]>,
  variableEngine?: WorkshopVariableEngineResult,
) {
  const def = button.parameter_defaults?.[field.name];
  if (def?.kind === 'static') return def.static_value ?? '';
  if (def?.kind === 'active_object') {
    const object = def.variable_id
      ? (variableEngine?.getActiveObject(def.variable_id) ?? resolveRuntimeObject(def.variable_id, activeObjects, selectedObjectSets))
      : firstRuntimeObject(activeObjects, selectedObjectSets);
    return object?.id ?? '';
  }
  if (def?.kind === 'variable' && def.variable_id) {
    const variable = variables.find((entry) => entry.id === def.variable_id) ?? null;
    const engineValue = variableEngine?.getValue(def.variable_id);
    const engineObject = variableEngine?.getActiveObject(def.variable_id);
    if (isObjectListParameter(field)) {
      const selected = variableEngine?.getSelectedObjectSet(def.variable_id) ?? selectedObjectSets[def.variable_id] ?? [];
      if (selected.length > 0) return selected.map((entry) => entry.id);
      if (engineValue?.kind === 'object_set') return engineValue.objectIds ?? [];
    }
    if (engineObject && (field.property_type.toLowerCase() === 'object_reference' || variable?.kind.startsWith('object_set'))) return engineObject.id;
    if (engineValue?.kind === 'scenario') return engineValue.scenario;
    if (engineValue?.kind === 'primitive' || engineValue?.kind === 'aggregation' || engineValue?.kind === 'function_output') return engineValue.value;
    if (engineValue?.kind === 'object_set_filter') return engineValue.filters;
    if (engineValue?.kind === 'shape') return engineValue.shape;
    const selected = selectedObjectSets[def.variable_id] ?? [];
    const object = resolveRuntimeObject(def.variable_id, activeObjects, selectedObjectSets);
    if (isObjectListParameter(field)) {
      return selected.map((entry) => entry.id);
    }
    if (variable?.kind.startsWith('object_set') || object) return object?.id ?? selected[0]?.id ?? '';
  }
  const override = actionParameterOverride(action, field.name);
  if (override?.default_value !== undefined) return override.default_value;
  if (field.default_value !== undefined) return field.default_value;
  return '';
}

function firstRuntimeObject(
  activeObjects: Record<string, ObjectInstance | null>,
  selectedObjectSets: Record<string, ObjectInstance[]>,
) {
  return Object.values(activeObjects).find(Boolean) ?? Object.values(selectedObjectSets).find((items) => items.length > 0)?.[0] ?? null;
}

function actionParameterOverride(action: ActionType, parameterName: string) {
  return action.form_schema?.parameter_overrides?.find((entry) => entry.parameter_name === parameterName) ?? null;
}

function actionParameterVisibility(action: ActionType, button: ButtonGroupButton, field: ActionInputField): ParameterDefaultVisibility {
  const def = button.parameter_defaults?.[field.name];
  const override = actionParameterOverride(action, field.name);
  if (def?.visibility) return def.visibility;
  if (override?.hidden) return 'hidden';
  return 'visible';
}

function actionParameterRequired(action: ActionType, field: ActionInputField) {
  const override = actionParameterOverride(action, field.name);
  return override?.required ?? field.required;
}

type ActionExecutionBuildResult =
  | { ok: true; targetObjectId?: string; targetObjectIds: string[]; parameters: Record<string, unknown>; justification?: string }
  | { ok: false; errors: string[] };

function buildActionExecutionRequest(
  action: ActionType,
  formValues: Record<string, string>,
  defaultActiveObject: ObjectInstance | null,
  justification: string,
): ActionExecutionBuildResult {
  const errors: string[] = [];
  const parameters: Record<string, unknown> = {};
  const targetField = actionTargetField(action);

  for (const field of action.input_schema ?? []) {
    const raw = formValues[field.name] ?? '';
    if (!raw.trim()) {
      if (actionParameterRequired(action, field) && !(targetField?.name === field.name && defaultActiveObject?.id)) {
        errors.push(`${field.display_name || field.name} is required.`);
      }
      continue;
    }
    const parsed = coerceActionParameter(field, raw);
    if (!parsed.ok) {
      errors.push(`${field.display_name || field.name}: ${parsed.error}`);
      continue;
    }
    parameters[field.name] = parsed.value;
  }

  let targetObjectIds = targetField ? objectIdsFromParameter(parameters[targetField.name] ?? formValues[targetField.name]) : [];
  let targetObjectId = targetObjectIds[0] ?? '';
  if (!targetObjectId && defaultActiveObject) targetObjectId = defaultActiveObject.id;
  if (targetObjectIds.length === 0 && targetObjectId) targetObjectIds = [targetObjectId];
  if (actionRequiresTargetObject(action) && targetObjectIds.length === 0) {
    errors.push('Target object is required.');
  }
  if (action.confirmation_required && !justification.trim()) {
    errors.push('Justification is required.');
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    targetObjectId: targetObjectId || undefined,
    targetObjectIds,
    parameters,
    justification: justification.trim() || undefined,
  };
}

function actionRequiresTargetObject(action: ActionType) {
  return [
    'update_object',
    'modify_object',
    'delete_object',
    'create_link',
    'delete_link',
    'modify_interface',
    'delete_interface',
    'create_interface_link',
    'delete_interface_link',
  ].includes(action.operation_kind);
}

function actionTargetField(action: ActionType) {
  const config = actionOperationConfig(action);
  const configuredName = stringFromActionConfig(config, ['source_input_name', 'target_object_input_name', 'object_input_name']);
  if (configuredName) {
    const configured = (action.input_schema ?? []).find((field) => field.name === configuredName);
    if (configured) return configured;
  }
  const fields = action.input_schema ?? [];
  return (
    fields.find((field) => field.property_type.toLowerCase() === 'object_reference' && ['object', 'target', 'target_object', 'source', 'source_object', 'order'].includes(field.name.toLowerCase())) ??
    fields.find((field) => field.property_type.toLowerCase() === 'object_reference') ??
    fields.find((field) => isObjectListParameter(field) && ['objects', 'target_objects', 'target_object_ids', 'object_set', 'selection'].includes(field.name.toLowerCase())) ??
    fields.find((field) => isObjectListParameter(field)) ??
    null
  );
}

function actionOperationConfig(action: ActionType): Record<string, unknown> {
  if (!action.config || typeof action.config !== 'object' || Array.isArray(action.config)) return {};
  const config = action.config as Record<string, unknown>;
  const operation = config.operation;
  if (operation && typeof operation === 'object' && !Array.isArray(operation)) return operation as Record<string, unknown>;
  return config;
}

function isObjectListParameter(field: ActionInputField) {
  const type = field.property_type.toLowerCase();
  return [
    'object_set',
    'object_reference_list',
    'object_reference[]',
    'object_reference_array',
    'array<object_reference>',
  ].includes(type);
}

function stringFromActionConfig(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeActionValidationIssues(errors: unknown): ActionFormIssue[] {
  if (!Array.isArray(errors)) return [];
  return errors.map((entry) => {
    if (typeof entry === 'string') return { source: 'server' as const, message: entry };
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const parameter = typeof record.parameter === 'string' ? record.parameter : typeof record.field === 'string' ? record.field : undefined;
      const message = typeof record.message === 'string'
        ? record.message
        : typeof record.error === 'string'
          ? record.error
          : JSON.stringify(record);
      return { source: 'server' as const, parameter, message: parameter ? `${parameter}: ${message}` : message };
    }
    return { source: 'server' as const, message: String(entry) };
  }).filter((entry) => entry.message.trim());
}

function coerceActionParameter(field: ActionInputField, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const type = field.property_type.toLowerCase();
  const value = raw.trim();
  if (type === 'boolean' || type === 'bool') {
    if (['true', '1', 'yes', 'y'].includes(value.toLowerCase())) return { ok: true, value: true };
    if (['false', '0', 'no', 'n'].includes(value.toLowerCase())) return { ok: true, value: false };
    return { ok: false, error: 'expected true or false' };
  }
  if (type === 'integer' || type === 'long' || type === 'short' || type === 'byte') {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return { ok: false, error: 'expected an integer' };
    return { ok: true, value: parsed };
  }
  if (type === 'double' || type === 'float' || type === 'decimal' || type === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return { ok: false, error: 'expected a number' };
    return { ok: true, value: parsed };
  }
  if (type === 'array' || type === 'struct' || type === 'json' || isObjectListParameter(field)) {
    try {
      return { ok: true, value: JSON.parse(value) };
    } catch {
      if (isObjectListParameter(field)) return { ok: true, value: value.split(',').map((entry) => entry.trim()).filter(Boolean) };
      return { ok: false, error: 'expected valid JSON' };
    }
  }
  return { ok: true, value };
}

function objectIdsFromParameter(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return objectIdsFromParameter(parsed);
      } catch {
        return [trimmed];
      }
    }
    return trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap((entry): string[] => objectIdsFromParameter(entry)).filter(Boolean);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return typeof record.id === 'string' ? [record.id] : [];
  }
  return [];
}

function actionBatchSummary(result: ExecuteBatchActionResponse) {
  return `${result.succeeded} of ${result.total} actions applied${result.failed > 0 ? `; ${result.failed} failed` : ''}.`;
}

function normalizeActionBatchIssues(result: ExecuteBatchActionResponse): ActionFormIssue[] {
  const issues: ActionFormIssue[] = [];
  for (const entry of result.results) {
    const target = typeof entry.target_object_id === 'string' ? entry.target_object_id : 'target';
    const status = typeof entry.status === 'string' ? entry.status : '';
    if (status === 'succeeded' || status === 'success') continue;
    const message = typeof entry.error === 'string'
      ? entry.error
      : Array.isArray(entry.errors)
        ? entry.errors.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('; ')
        : 'Action failed.';
    issues.push({ source: 'server', message: `${target}: ${message}` });
  }
  return issues;
}

function stringifyActionFormValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function actionErrorMessage(cause: unknown) {
  if (cause instanceof Error && cause.message) return cause.message;
  return 'Submit failed';
}

function PreviewShell({
  app,
  headerSettings,
  headerUi,
  onEdit,
  children,
}: {
  app: AppDefinition;
  headerSettings: WorkshopHeaderSettings;
  headerUi: HeaderUiState;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const [pillOpen, setPillOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        onEdit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEdit]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 75, display: 'grid', gridTemplateRows: 'auto 1fr', background: '#f4f6f9' }}>
      <header style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {headerUi.enable_app_logo ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 4, background: `${headerSettings.color ?? '#2d72d2'}1a` }}>
              <Glyph name={(headerSettings.icon ?? 'cube') as GlyphName} size={16} tone={headerSettings.color ?? '#2d72d2'} />
            </span>
          ) : null}
          <span style={{ fontSize: 15, fontWeight: 600 }}>{headerSettings.title || app.name}</span>
          {headerUi.enable_favoriting ? <Glyph name="star" size={14} tone="#cf923f" /> : null}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" aria-label="More" onClick={() => setMoreOpen((open) => !open)} className="of-button of-button--ghost" style={{ padding: 6 }}>
            <span style={{ display: 'inline-flex', gap: 2 }}>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#5c7080' }} />
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#5c7080' }} />
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#5c7080' }} />
            </span>
          </button>
          {moreOpen ? (
            <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid var(--border-default)', borderRadius: 4, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)', padding: 4, zIndex: 6, minWidth: 180 }}>
              <button type="button" onClick={() => { setMoreOpen(false); onEdit(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, borderRadius: 4 }}>
                <Glyph name="pencil" size={12} tone="#5c7080" /> Edit
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>⌘E</span>
              </button>
              <button type="button" onClick={() => setMoreOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, borderRadius: 4 }}>
                <Glyph name="duplicate" size={12} tone="#5c7080" /> Copy link
              </button>
              <button type="button" onClick={() => setMoreOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13, borderRadius: 4 }}>
                <Glyph name="external-link" size={12} tone="#5c7080" /> Open in new tab
              </button>
            </div>
          ) : null}
        </div>

        {pillOpen ? (
          <div
            role="toolbar"
            style={{
              position: 'absolute',
              left: '50%',
              top: 'calc(100% + 8px)',
              transform: 'translateX(-50%)',
              display: 'inline-flex',
              alignItems: 'center',
              padding: 4,
              borderRadius: 8,
              background: '#1c2127',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.32)',
              gap: 0,
              zIndex: 6,
            }}
          >
            <button type="button" onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 0, background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 4 }}>
              <Glyph name="pencil" size={13} tone="#fff" /> Edit
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '1px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.12)', fontSize: 11, fontWeight: 500 }}>⌘E</span>
            </button>
            <span style={{ width: 1, height: 18, background: 'rgba(255, 255, 255, 0.12)' }} />
            <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 0, background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 4 }}>
              <Glyph name="object" size={13} tone="#fff" /> Main
              <span style={{ color: '#aab4c0', fontSize: 11 }}>Default</span>
              <Glyph name="chevron-down" size={11} tone="#aab4c0" />
            </button>
            <span style={{ width: 1, height: 18, background: 'rgba(255, 255, 255, 0.12)' }} />
            <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 0, background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 4 }}>
              <Glyph name="badge-check" size={13} tone="#fff" /> v0.1.0
              <Glyph name="chevron-down" size={11} tone="#aab4c0" />
            </button>
            <button type="button" aria-label="Hide toolbar" onClick={() => setPillOpen(false)} style={{ position: 'absolute', left: '50%', bottom: -10, transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 14, border: 0, borderRadius: '0 0 6px 6px', background: '#1c2127', color: '#aab4c0', cursor: 'pointer' }}>
              <Glyph name="chevron-down" size={9} tone="#aab4c0" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Show toolbar"
            onClick={() => setPillOpen(true)}
            style={{ position: 'absolute', left: '50%', top: 'calc(100% + 4px)', transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 16, border: 0, borderRadius: '0 0 6px 6px', background: '#1c2127', color: '#aab4c0', cursor: 'pointer', zIndex: 6 }}
          >
            <Glyph name="chevron-down" size={11} tone="#aab4c0" />
          </button>
        )}
      </header>
      {children}
    </div>
  );
}

function ChartXyLayerEditor({
  layer,
  variables,
  objectTypes,
  onBack,
  onChange,
  onRetypeOutputs,
}: {
  layer: ChartXyLayer;
  variables: WorkshopVariable[];
  objectTypes: ObjectType[];
  onBack: () => void;
  onChange: (next: ChartXyLayer) => void;
  onRetypeOutputs?: (objectTypeId: string) => void;
}) {
  const sourceVariable = variables.find((v) => v.id === layer.source_variable_id) ?? null;
  const objectTypeId = sourceVariable?.object_type_id ?? layer.object_type_id ?? '';
  const objectType = objectTypes.find((entry) => entry.id === objectTypeId) ?? null;
  const [properties, setProperties] = useState<Property[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!objectTypeId) {
      setProperties([]);
      return;
    }
    let cancelled = false;
    void listProperties(objectTypeId)
      .then((response) => {
        if (!cancelled) setProperties(response);
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, [objectTypeId]);

  function patch(patchObj: Partial<ChartXyLayer>) {
    onChange({ ...layer, ...patchObj });
  }

  const numericProperties = properties.filter((p) => ['number', 'integer', 'float', 'double', 'decimal'].includes(String(p.property_type).toLowerCase()));

  return (
    <div style={{ padding: 14, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={onBack} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--status-info)', fontSize: 13, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Glyph name="chevron-right" size={11} /> <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}></span>Chart Editor
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{layer.title}</span>
      </div>
      <Section title="Title" />
      <input value={layer.title} onChange={(event) => patch({ title: event.target.value })} style={inputStyle()} />

      <Section title="Data input" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
        {(['object_set', 'function', 'time_series'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => patch({ data_input: kind })}
            style={{ padding: '6px 8px', border: '1px solid var(--border-default)', background: layer.data_input === kind ? '#fff' : '#f4f6f9', color: layer.data_input === kind ? 'var(--text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: layer.data_input === kind ? 600 : 500 }}
          >
            {kind === 'object_set' ? 'Object set' : kind === 'function' ? 'Function' : 'Time series set'}
          </button>
        ))}
      </div>

      <Field label="Source">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: 4, background: '#f7f9fa' }}>
          <Glyph name="cube" size={13} tone="#2d72d2" />
          <span style={{ flex: 1, fontSize: 13 }}>{sourceVariable ? sourceVariable.name : objectType ? objectType.display_name || objectType.name : 'Select object set…'}</span>
          <button type="button" aria-label="Edit" onClick={() => setPickerOpen(true)} className="of-button of-button--ghost" style={{ padding: 2 }}>
            <Glyph name="pencil" size={11} />
          </button>
          {(layer.source_variable_id || layer.object_type_id) ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                patch({ source_variable_id: '', object_type_id: '', x_property: '', segment_by: '', series_property: '' });
                onRetypeOutputs?.('');
              }}
              className="of-button of-button--ghost"
              style={{ padding: 2 }}
            >
              <Glyph name="x" size={11} />
            </button>
          ) : null}
        </div>
        <span className="of-text-muted" style={{ fontSize: 11, marginTop: 4 }}>Current value: {sourceVariable ? sourceVariable.name : objectType ? objectType.display_name || objectType.name : 'undefined'}</span>
      </Field>
      <Field label="Variable">
        <select
          value={layer.source_variable_id}
          onChange={(event) => {
            const nextVariable = variables.find((v) => v.id === event.target.value) ?? null;
            patch({ source_variable_id: event.target.value, object_type_id: '', x_property: '', segment_by: '', series_property: '' });
            onRetypeOutputs?.(nextVariable?.object_type_id ?? '');
          }}
          style={inputStyle()}
        >
          <option value="">Select object set variable…</option>
          {variables
            .filter((v) => v.kind === 'object_set' || v.kind === 'object_set_definition' || v.kind === 'object_set_selection')
            .map((v) => (
              <option key={v.id} value={v.id}>{v.name} ({VARIABLE_KIND_LABEL[v.kind]})</option>
            ))}
        </select>
      </Field>

      <Section title="Layer type" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {(['bar', 'line', 'scatter'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => patch({ layer_type: kind, title: kind === 'bar' ? 'Layer (bar)' : kind === 'line' ? 'Layer (line)' : 'Layer (scatter)' })}
            style={{ padding: '10px 6px', border: layer.layer_type === kind ? '2px solid var(--status-info)' : '1px solid var(--border-default)', background: layer.layer_type === kind ? 'rgba(45, 114, 210, 0.06)' : '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 12, display: 'grid', justifyItems: 'center', gap: 4 }}
          >
            {kind === 'bar' ? <ChartXyGlyph /> : kind === 'line' ? <Glyph name="graph" size={13} tone="#5c7080" /> : <Glyph name="sparkles" size={13} tone="#5c7080" />}
            {kind === 'bar' ? 'Bar Chart' : kind === 'line' ? 'Line Chart' : 'Scatter Chart'}
          </button>
        ))}
      </div>
      <Toggle label="Show labels" value={layer.show_labels} onChange={(checked) => patch({ show_labels: checked })} />

      <Section title="X axis property" />
      <Field label="Property">
        <select value={layer.x_property} onChange={(event) => patch({ x_property: event.target.value })} style={inputStyle()}>
          <option value="">Select a property…</option>
          {properties.map((p) => (
            <option key={p.id} value={p.name}>{p.display_name || p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Bucketing">
        <select value={layer.x_bucketing} onChange={(event) => patch({ x_bucketing: event.target.value as ChartXyLayer['x_bucketing'] })} style={inputStyle()}>
          <option value="exact">Exact Value</option>
          <option value="range">Range</option>
        </select>
      </Field>
      <Field label="Limit">
        <input
          type="number"
          min={0}
          value={layer.x_limit}
          placeholder="Set category limit…"
          onChange={(event) => patch({ x_limit: event.target.value })}
          style={inputStyle()}
        />
      </Field>

      <Section title={layer.layer_type === 'bar' ? 'Bar series' : layer.layer_type === 'line' ? 'Line series' : 'Scatter series'} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid var(--border-subtle)', borderRadius: 4, background: '#f4f6f9' }}>
        <Glyph name="run" size={11} tone="#5c7080" />
        <select value={layer.series_metric} onChange={(event) => patch({ series_metric: event.target.value as ChartXyLayer['series_metric'] })} style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 13 }}>
          <option value="count">Count</option>
          <option value="sum">Sum</option>
          <option value="avg">Average</option>
          <option value="min">Min</option>
          <option value="max">Max</option>
          <option value="approx_unique">Approx unique</option>
        </select>
        {layer.series_metric !== 'count' ? (
          <select value={layer.series_property} onChange={(event) => patch({ series_property: event.target.value })} style={{ border: 0, background: 'transparent', outline: 'none', fontSize: 13 }}>
            <option value="">…</option>
            {(layer.series_metric === 'approx_unique' ? properties : numericProperties).map((p) => (
              <option key={p.id} value={p.name}>{p.display_name || p.name}</option>
            ))}
          </select>
        ) : null}
      </div>
      <button type="button" className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
        <Glyph name="plus" size={11} /> Add step
      </button>
      <Toggle label="Cumulative sum" value={layer.cumulative_sum} onChange={(checked) => patch({ cumulative_sum: checked })} />

      <Section title="Segment by (optional)" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <select value={layer.segment_by} onChange={(event) => patch({ segment_by: event.target.value })} style={{ ...inputStyle(), borderRadius: '4px 0 0 4px' }}>
          <option value="">Select a property…</option>
          {properties.map((p) => (
            <option key={p.id} value={p.name}>{p.display_name || p.name}</option>
          ))}
        </select>
        {layer.segment_by ? (
          <button type="button" aria-label="Clear" onClick={() => patch({ segment_by: '' })} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderLeft: 0, borderRadius: '0 4px 4px 0', background: '#fff', cursor: 'pointer' }}>
            <Glyph name="x" size={11} />
          </button>
        ) : null}
      </div>

      <Section title="Segment display overrides" />
      <button type="button" className="of-button" style={{ fontSize: 12, justifyContent: 'center' }}>
        <Glyph name="plus" size={11} /> Add segment
      </button>

      {pickerOpen ? (
        <ObjectSetPicker
          objectTypes={objectTypes}
          onClose={() => setPickerOpen(false)}
          onSelect={(typeId) => {
            patch({ source_variable_id: '', object_type_id: typeId, x_property: '', segment_by: '', series_property: '' });
            onRetypeOutputs?.(typeId);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
