export type DashboardWidgetType = 'chart' | 'table' | 'kpi' | 'text';
export type DashboardChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter';
export type DashboardNumberFormat = 'number' | 'currency' | 'percent';
export type DashboardDatePreset = 'last_7_days' | 'last_30_days' | 'last_90_days' | 'this_month' | 'quarter_to_date' | 'custom';
export type DashboardLayoutDensity = 'default' | 'compact' | 'stretched';
export type DashboardTemplateId = 'blank' | 'executive' | 'operations' | 'quality';

export interface DashboardDateRange {
  mode: 'relative' | 'absolute';
  preset: DashboardDatePreset;
  from: string;
  to: string;
}

export interface DashboardFilterState {
  search: string;
  dateRange: DashboardDateRange;
}

export interface DashboardWidgetLayout {
  colSpan: number;
  rowSpan: number;
}

export interface DashboardWidgetQuery {
  sql: string;
  limit: number;
}

interface DashboardWidgetBase {
  id: string;
  type: DashboardWidgetType;
  title: string;
  description: string;
  layout: DashboardWidgetLayout;
  query: DashboardWidgetQuery;
}

export interface DashboardChartWidget extends DashboardWidgetBase {
  type: 'chart';
  chartType: DashboardChartType;
  categoryColumn: string;
  seriesColumns: string[];
  stacked: boolean;
}

export interface DashboardTableWidget extends DashboardWidgetBase {
  type: 'table';
  pageSize: number;
  defaultSortColumn: string;
  defaultSortDirection: 'asc' | 'desc';
  columns?: Array<{ key: string; label: string }>;
}

export interface DashboardKpiWidget extends DashboardWidgetBase {
  type: 'kpi';
  valueColumn: string;
  deltaColumn: string;
  sparklineColumn: string;
  valueFormat: DashboardNumberFormat;
}

export interface DashboardTextWidget extends DashboardWidgetBase {
  type: 'text';
  content: string;
  tone: 'note' | 'callout' | 'warning';
}

export type DashboardWidget = DashboardChartWidget | DashboardTableWidget | DashboardKpiWidget | DashboardTextWidget;

export interface DashboardDefinition {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  layout: {
    density: DashboardLayoutDensity;
  };
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardTemplateSummary {
  id: DashboardTemplateId;
  name: string;
  category: string;
  description: string;
  dashboardDescription: string;
  recommendedFor: string;
  widgetTypes: DashboardWidgetType[];
}

export const DASHBOARD_TEMPLATES: DashboardTemplateSummary[] = [
  {
    id: 'blank',
    name: 'Blank dashboard',
    category: 'Custom',
    description: 'A clean canvas with a KPI, chart, and table ready to edit.',
    dashboardDescription: 'Compose charts, tables, and KPI cards on a responsive grid.',
    recommendedFor: 'Ad hoc analysis and embedded Quiver views',
    widgetTypes: ['kpi', 'chart', 'table'],
  },
  {
    id: 'executive',
    name: 'Executive control room',
    category: 'Leadership',
    description: 'KPI-first dashboard for health, revenue, and account coverage.',
    dashboardDescription: 'A shareable baseline dashboard for pipeline health, revenue, and account coverage.',
    recommendedFor: 'Weekly operating reviews',
    widgetTypes: ['text', 'kpi', 'kpi', 'chart', 'table'],
  },
  {
    id: 'operations',
    name: 'Operations review',
    category: 'Operations',
    description: 'Run volume, successful runs, and escalations in one review surface.',
    dashboardDescription: 'Operational dashboard for run volume, successful runs, and open escalations.',
    recommendedFor: 'Platform and data operations',
    widgetTypes: ['chart', 'kpi', 'table'],
  },
  {
    id: 'quality',
    name: 'Production quality dashboard',
    category: 'Quality',
    description: 'Quality scorecards, defect trends, and failing checks for release readiness.',
    dashboardDescription: 'Production quality view for scorecards, defect trends, and failing checks.',
    recommendedFor: 'Quality gates and release readiness',
    widgetTypes: ['text', 'kpi', 'chart', 'table'],
  },
];

function createId() {
  return crypto.randomUUID();
}

function createDateLabel(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function createDefaultDateRange(): DashboardDateRange {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 29);

  return {
    mode: 'relative',
    preset: 'last_30_days',
    from: formatDate(from),
    to: formatDate(today),
  };
}

export function createDefaultFilters(): DashboardFilterState {
  return {
    search: '',
    dateRange: createDefaultDateRange(),
  };
}

export function resolveDateRange(value: DashboardDateRange) {
  const today = new Date();

  if (value.mode === 'absolute' || value.preset === 'custom') {
    return {
      from: value.from,
      to: value.to,
      label: `${value.from} -> ${value.to}`,
    };
  }

  const end = formatDate(today);
  const start = new Date(today);

  switch (value.preset) {
    case 'last_7_days':
      start.setDate(today.getDate() - 6);
      break;
    case 'last_30_days':
      start.setDate(today.getDate() - 29);
      break;
    case 'last_90_days':
      start.setDate(today.getDate() - 89);
      break;
    case 'this_month':
      start.setDate(1);
      break;
    case 'quarter_to_date': {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      start.setMonth(quarterStartMonth, 1);
      break;
    }
    default:
      start.setDate(today.getDate() - 29);
      break;
  }

  const from = formatDate(start);
  return {
    from,
    to: end,
    label: `${from} -> ${end}`,
  };
}

function escapeSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function applyDashboardQueryTemplate(sql: string, filters: DashboardFilterState) {
  const resolvedRange = resolveDateRange(filters.dateRange);
  const replacements: Record<string, string> = {
    search: escapeSqlLiteral(filters.search),
    date_from: escapeSqlLiteral(resolvedRange.from),
    date_to: escapeSqlLiteral(resolvedRange.to),
  };

  return sql.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => replacements[key] ?? match);
}

export function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function formatMetricValue(value: unknown, format: DashboardNumberFormat) {
  const numeric = toNumber(value);

  if (numeric === null) {
    return String(value ?? '--');
  }

  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(numeric);
  }

  if (format === 'percent') {
    return `${numeric.toFixed(1)}%`;
  }

  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numeric);
}

export function parseSparklineSeries(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => toNumber(entry)).filter((entry): entry is number => entry !== null);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => toNumber(entry))
          .filter((entry): entry is number => entry !== null);
      }
    } catch {
      return [];
    }
  }

  return [];
}

export function cloneDashboard<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createWidget(type: 'chart'): DashboardChartWidget;
export function createWidget(type: 'table'): DashboardTableWidget;
export function createWidget(type: 'kpi'): DashboardKpiWidget;
export function createWidget(type: 'text'): DashboardTextWidget;
export function createWidget(type: DashboardWidgetType): DashboardWidget;
export function createWidget(type: DashboardWidgetType): DashboardWidget {
  if (type === 'text') {
    return {
      id: createId(),
      type,
      title: 'Executive Note',
      description: 'Context block for the current dashboard view.',
      layout: { colSpan: 4, rowSpan: 1 },
      query: {
        limit: 1,
        sql: "SELECT 'text widget' AS kind",
      },
      content:
        'Use this space for assumptions, incident notes, or interpretation that should travel with the dashboard.',
      tone: 'note',
    };
  }

  if (type === 'table') {
    return {
      id: createId(),
      type,
      title: 'Account Coverage',
      description: 'Sortable operational table with local filtering and pagination.',
      layout: { colSpan: 8, rowSpan: 2 },
      query: {
        limit: 100,
        sql: [
          "SELECT 'Northwind' AS account, 'Enterprise' AS segment, 5820 AS arr, 'Healthy' AS status",
          "UNION ALL SELECT 'Lakehouse Co', 'Mid-market', 4380, 'Watch'",
          "UNION ALL SELECT 'Mercury Health', 'Enterprise', 9010, 'Healthy'",
          "UNION ALL SELECT 'Atlas Retail', 'SMB', 1920, 'Needs follow-up'",
          "UNION ALL SELECT 'Vertex Energy', 'Enterprise', 6640, 'Healthy'",
          "UNION ALL SELECT 'North Star', 'Mid-market', 3270, 'Expansion'",
        ].join(' '),
      },
      pageSize: 5,
      defaultSortColumn: 'arr',
      defaultSortDirection: 'desc',
    };
  }

  if (type === 'kpi') {
    return {
      id: createId(),
      type,
      title: 'Net Revenue',
      description: 'Single-number KPI with delta and sparkline.',
      layout: { colSpan: 4, rowSpan: 1 },
      query: {
        limit: 1,
        sql: "SELECT 18240 AS total_revenue, 12.8 AS delta_pct, '[14200,14880,15120,16050,16820,17640,18240]' AS sparkline",
      },
      valueColumn: 'total_revenue',
      deltaColumn: 'delta_pct',
      sparklineColumn: 'sparkline',
      valueFormat: 'currency',
    };
  }

  return {
    id: createId(),
    type: 'chart',
    title: 'Pipeline Throughput',
    description: 'ECharts-powered trend view sourced from SQL.',
    layout: { colSpan: 8, rowSpan: 2 },
    query: {
      limit: 50,
      sql: [
        "SELECT 'Mon' AS bucket, 124 AS ingested, 108 AS published",
        "UNION ALL SELECT 'Tue', 152, 131",
        "UNION ALL SELECT 'Wed', 148, 140",
        "UNION ALL SELECT 'Thu', 166, 150",
        "UNION ALL SELECT 'Fri', 190, 172",
        "UNION ALL SELECT 'Sat', 142, 134",
        "UNION ALL SELECT 'Sun', 118, 109",
      ].join(' '),
    },
    chartType: 'area',
    categoryColumn: 'bucket',
    seriesColumns: ['ingested', 'published'],
    stacked: false,
  };
}

export function createDashboard(name = 'New Dashboard'): DashboardDefinition {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name,
    description: 'Compose charts, tables, and KPI cards on a responsive grid.',
    widgets: [createWidget('kpi'), createWidget('chart'), createWidget('table')],
    layout: { density: 'default' },
    version: 1,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function getDashboardTemplate(templateId: string) {
  return DASHBOARD_TEMPLATES.find((template) => template.id === templateId) ?? DASHBOARD_TEMPLATES[0];
}

export function createDashboardFromTemplate(templateId: string = 'blank', name?: string): DashboardDefinition {
  const template = getDashboardTemplate(templateId);
  const dashboard = createDashboard(name?.trim() || template.name);
  dashboard.description = template.dashboardDescription;

  if (template.id === 'executive') {
    dashboard.widgets = [
      {
        ...createWidget('text'),
        title: 'Operating context',
        content:
          'Use this dashboard to align leadership on revenue, delivery health, and the accounts that need attention this week.',
      },
      {
        ...createWidget('kpi'),
        title: 'Revenue Attainment',
        valueColumn: 'total_revenue',
        deltaColumn: 'delta_pct',
        valueFormat: 'percent',
        description: 'Latest attainment against the current reporting target.',
        query: {
          limit: 1,
          sql: "SELECT 92.4 AS total_revenue, 3.6 AS delta_pct, '[84.0,86.2,88.1,89.4,90.6,91.2,92.4]' AS sparkline",
        },
      },
      {
        ...createWidget('kpi'),
        title: 'Open Risk',
        valueColumn: 'total_revenue',
        deltaColumn: 'delta_pct',
        valueFormat: 'number',
        description: 'Active risks that need leadership review.',
        query: {
          limit: 1,
          sql: "SELECT 14 AS total_revenue, -8.1 AS delta_pct, '[22,21,20,19,17,15,14]' AS sparkline",
        },
      },
      {
        ...createWidget('chart'),
        title: 'Weekly Throughput',
        chartType: 'area',
        seriesColumns: ['ingested', 'published'],
        description: 'Published data products compared with total ingestion.',
      },
      {
        ...createWidget('table'),
        title: 'Priority Accounts',
        description: 'Accounts with current health, ARR, and operating status.',
      },
    ];
  } else if (template.id === 'operations') {
    dashboard.widgets = [
      {
        ...createWidget('chart'),
        title: 'Run Volume by Day',
        chartType: 'bar',
        seriesColumns: ['ingested'],
        description: 'Daily run volume for the current reporting window.',
      },
      {
        ...createWidget('kpi'),
        title: 'Successful Runs',
        valueColumn: 'total_revenue',
        valueFormat: 'number',
        description: 'Successful pipeline runs in the active reporting window.',
        query: {
          limit: 1,
          sql: "SELECT 842 AS total_revenue, 4.2 AS delta_pct, '[790,802,815,821,829,836,842]' AS sparkline",
        },
      },
      {
        ...createWidget('table'),
        title: 'Escalations Queue',
        defaultSortColumn: 'priority',
        description: 'Open operational exceptions with severity and owner context.',
        query: {
          limit: 100,
          sql: [
            "SELECT 'PIPE-1042' AS incident, 'High' AS priority, 'SLA breach risk' AS summary",
            "UNION ALL SELECT 'AUTH-288', 'Medium', 'SSO callback drift'",
            "UNION ALL SELECT 'DATA-931', 'Low', 'Late-arriving file partition'",
            "UNION ALL SELECT 'OPS-512', 'High', 'Backfill validation pending'",
          ].join(' '),
        },
      },
    ];
  } else if (template.id === 'quality') {
    dashboard.widgets = [
      {
        ...createWidget('text'),
        title: 'Release quality context',
        content:
          'Production quality is tracked across scorecards, defect ratings, and the failing checks that currently block promotion.',
      },
      {
        ...createWidget('kpi'),
        title: 'Quality Score',
        valueColumn: 'total_revenue',
        deltaColumn: 'delta_pct',
        valueFormat: 'percent',
        description: 'Composite score across active release checks.',
        query: {
          limit: 1,
          sql: "SELECT 96.8 AS total_revenue, 1.9 AS delta_pct, '[91.2,92.8,93.5,94.1,95.4,96.0,96.8]' AS sparkline",
        },
      },
      {
        ...createWidget('chart'),
        title: 'Defects by Rating',
        chartType: 'bar',
        categoryColumn: 'bucket',
        seriesColumns: ['ingested'],
        description: 'Count of checks grouped by production quality rating.',
        query: {
          limit: 50,
          sql: [
            "SELECT 'Critical' AS bucket, 4 AS ingested, 4 AS published",
            "UNION ALL SELECT 'High', 11, 10",
            "UNION ALL SELECT 'Medium', 28, 24",
            "UNION ALL SELECT 'Low', 47, 40",
            "UNION ALL SELECT 'Passed', 154, 154",
          ].join(' '),
        },
      },
      {
        ...createWidget('table'),
        title: 'Failing Checks',
        defaultSortColumn: 'priority',
        description: 'Open quality checks that currently block promotion.',
        query: {
          limit: 100,
          sql: [
            "SELECT 'Schema drift' AS check_name, 'High' AS priority, 'orders_silver' AS dataset",
            "UNION ALL SELECT 'Null threshold', 'Medium', 'customers_gold'",
            "UNION ALL SELECT 'Late partition', 'Medium', 'events_bronze'",
            "UNION ALL SELECT 'Lineage gap', 'Low', 'billing_rollup'",
          ].join(' '),
        },
      },
    ];
  }

  return dashboard;
}

export function createStarterDashboards() {
  const executive = createDashboardFromTemplate('executive', 'Executive Control Room');
  const operations = createDashboardFromTemplate('operations', 'Operations Review');

  return [executive, operations];
}

export function duplicateDashboardDefinition(dashboard: DashboardDefinition) {
  const copy = cloneDashboard(dashboard);
  const now = new Date().toISOString();

  return {
    ...copy,
    id: createId(),
    name: `${dashboard.name} Copy`,
    version: 1,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    widgets: copy.widgets.map((widget) => ({ ...widget, id: createId() })),
  };
}

export function normalizeDashboardDefinition(value: Partial<DashboardDefinition>): DashboardDefinition {
  const now = new Date().toISOString();
  const fallback = createDashboard(value.name || 'New Dashboard');

  return {
    ...fallback,
    ...value,
    id: value.id || fallback.id,
    name: value.name || fallback.name,
    description: value.description ?? fallback.description,
    widgets: Array.isArray(value.widgets) ? (value.widgets as DashboardWidget[]) : fallback.widgets,
    layout: {
      density: value.layout?.density ?? 'default',
    },
    version: Number.isFinite(value.version) && value.version ? Number(value.version) : 1,
    publishedAt: value.publishedAt ?? null,
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || now,
  };
}

function base64Encode(value: string) {
  return btoa(value);
}

function base64Decode(value: string) {
  return atob(value);
}

export function serializeDashboardSnapshot(dashboard: DashboardDefinition) {
  return encodeURIComponent(base64Encode(JSON.stringify(dashboard)));
}

export function deserializeDashboardSnapshot(snapshot: string) {
  const decoded = base64Decode(decodeURIComponent(snapshot));
  return normalizeDashboardDefinition(JSON.parse(decoded) as Partial<DashboardDefinition>);
}

export function formatDashboardTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function createWidgetPreviewSql(type: DashboardWidgetType) {
  return createWidget(type).query.sql;
}

export function defaultAbsoluteRange() {
  return {
    from: createDateLabel(-29),
    to: createDateLabel(0),
  };
}
