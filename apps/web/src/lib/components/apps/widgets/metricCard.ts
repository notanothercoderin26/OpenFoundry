import type { WorkshopVariableEngineResult } from './workshopVariables';

export type MetricCardValueType = 'number' | 'string';
export type MetricCardLayoutStyle = 'card' | 'tag' | 'list';
export type MetricCardDirection = 'horizontal' | 'vertical';
export type MetricCardTemplate = 'stacked' | 'side_by_side';
export type MetricCardSize = 'compact' | 'regular' | 'large';
export type MetricCardFormatKind = 'default' | 'number' | 'integer' | 'compact' | 'percent' | 'currency' | 'unit';
export type MetricCardConditionOperator =
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'eq'
  | 'neq'
  | 'between'
  | 'contains'
  | 'is_empty'
  | 'is_not_empty';

export interface MetricCardFormat {
  kind?: MetricCardFormatKind;
  precision?: number;
  unit?: string;
  currency?: string;
  locale?: string;
  prefix?: string;
  suffix?: string;
  empty_value?: string;
}

export interface MetricCardConditionalRule {
  id?: string;
  operator: MetricCardConditionOperator;
  value?: unknown;
  min?: unknown;
  max?: unknown;
  color?: string;
  background_color?: string;
  label?: string;
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger';
}

export interface MetricCardValueConfig {
  value_type: MetricCardValueType;
  variable_id?: string;
  value?: unknown;
  format?: MetricCardFormat;
  conditional_formatting?: MetricCardConditionalRule[];
}

export interface MetricCardMetric extends MetricCardValueConfig {
  id: string;
  label: string;
  description?: string;
  secondary_metric?: (MetricCardValueConfig & { label?: string }) | null;
}

export interface MetricCardProps {
  label?: string;
  metrics: MetricCardMetric[];
  layout_style: MetricCardLayoutStyle;
  direction: MetricCardDirection;
  template: MetricCardTemplate;
  metric_size: MetricCardSize;
  conditional_visibility?: unknown;
}

export interface MetricCardResolvedValue {
  rawValue: unknown;
  displayValue: string;
  numericValue: number | null;
  style: {
    color?: string;
    backgroundColor?: string;
  };
  matchedRule?: MetricCardConditionalRule | null;
}

export interface MetricCardResolvedMetric extends MetricCardResolvedValue {
  id: string;
  label: string;
  description: string;
  valueType: MetricCardValueType;
  secondary: (MetricCardResolvedValue & { label: string }) | null;
}

const DEFAULT_EMPTY_VALUE = '--';

export function readMetricCardProps(raw: Record<string, unknown> | null | undefined): MetricCardProps {
  const props = raw ?? {};
  const explicitMetrics = Array.isArray(props.metrics)
    ? props.metrics
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .map(readMetric)
      .filter((entry) => entry.id && entry.label)
    : [];

  const legacySourceVariable = typeof props.source_variable_id === 'string' ? props.source_variable_id : '';
  const legacyMetric: MetricCardMetric = {
    id: 'metric-1',
    label: typeof props.label === 'string' && props.label ? props.label : 'Metric',
    value_type: typeof props.value_type === 'string' && props.value_type === 'string' ? 'string' : 'number',
    variable_id: legacySourceVariable,
    value: props.value,
    format: readFormat(props.format),
    secondary_metric: props.delta === undefined
      ? null
      : {
        label: 'Delta',
        value_type: 'string',
        value: props.delta,
        format: {},
      },
    conditional_formatting: readRules(props.conditional_formatting),
  };

  return {
    label: typeof props.label === 'string' ? props.label : '',
    metrics: explicitMetrics.length > 0 ? explicitMetrics : [legacyMetric],
    layout_style: readEnum(props.layout_style, ['card', 'tag', 'list'], 'card'),
    direction: readEnum(props.direction, ['horizontal', 'vertical'], 'horizontal'),
    template: readEnum(props.template, ['stacked', 'side_by_side'], 'stacked'),
    metric_size: readEnum(props.metric_size, ['compact', 'regular', 'large'], 'regular'),
    conditional_visibility: props.conditional_visibility,
  };
}

export function resolveMetricCardMetrics(
  props: MetricCardProps,
  engine: Pick<WorkshopVariableEngineResult, 'getPrimitive'>,
): MetricCardResolvedMetric[] {
  return props.metrics.map((metric) => {
    const value = resolveValue(metric, engine);
    const secondary = metric.secondary_metric
      ? {
        ...resolveValue(metric.secondary_metric, engine),
        label: metric.secondary_metric.label ?? 'Secondary',
      }
      : null;
    return {
      id: metric.id,
      label: metric.label,
      description: metric.description ?? '',
      valueType: metric.value_type,
      ...value,
      secondary,
    };
  });
}

export function formatMetricValue(value: unknown, valueType: MetricCardValueType, format: MetricCardFormat = {}): string {
  if (value === null || value === undefined || value === '') return format.empty_value ?? DEFAULT_EMPTY_VALUE;
  if (valueType === 'string') return addAffixes(stringValue(value), format);

  const numericValue = numberValue(value);
  if (numericValue === null) return format.empty_value ?? DEFAULT_EMPTY_VALUE;
  const locale = format.locale || undefined;
  const precision = clampPrecision(format.precision);
  const kind = format.kind ?? 'default';
  let rendered: string;
  if (kind === 'integer') {
    rendered = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(numericValue);
  } else if (kind === 'compact') {
    rendered = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: precision ?? 1,
    }).format(numericValue);
  } else if (kind === 'percent') {
    rendered = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: precision ?? 1,
    }).format(numericValue);
  } else if (kind === 'currency') {
    rendered = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: format.currency || 'USD',
      maximumFractionDigits: precision ?? 0,
    }).format(numericValue);
  } else {
    rendered = new Intl.NumberFormat(locale, {
      maximumFractionDigits: precision ?? 2,
    }).format(numericValue);
  }

  const unit = kind === 'unit' && format.unit ? ` ${format.unit}` : '';
  return addAffixes(`${rendered}${unit}`, format);
}

export function metricCardRuleMatches(rule: MetricCardConditionalRule, rawValue: unknown, numericValue: number | null): boolean {
  const operator = rule.operator;
  if (operator === 'is_empty') return rawValue === null || rawValue === undefined || stringValue(rawValue) === '';
  if (operator === 'is_not_empty') return !(rawValue === null || rawValue === undefined || stringValue(rawValue) === '');
  if (operator === 'contains') return stringValue(rawValue).toLowerCase().includes(stringValue(rule.value).toLowerCase());
  if (operator === 'eq') return stringValue(rawValue) === stringValue(rule.value);
  if (operator === 'neq') return stringValue(rawValue) !== stringValue(rule.value);

  const compare = numericValue;
  if (compare === null) return false;
  const value = numberValue(rule.value);
  if (operator === 'between') {
    const min = numberValue(rule.min);
    const max = numberValue(rule.max);
    return (min === null || compare >= min) && (max === null || compare <= max);
  }
  if (value === null) return false;
  if (operator === 'lt') return compare < value;
  if (operator === 'lte') return compare <= value;
  if (operator === 'gt') return compare > value;
  if (operator === 'gte') return compare >= value;
  return false;
}

function resolveValue(
  config: MetricCardValueConfig,
  engine: Pick<WorkshopVariableEngineResult, 'getPrimitive'>,
): MetricCardResolvedValue {
  const rawValue = config.variable_id ? engine.getPrimitive(config.variable_id) : config.value;
  const numericValue = numberValue(rawValue);
  const matchedRule = (config.conditional_formatting ?? []).find((rule) => metricCardRuleMatches(rule, rawValue, numericValue)) ?? null;
  return {
    rawValue,
    displayValue: formatMetricValue(rawValue, config.value_type, config.format ?? {}),
    numericValue,
    matchedRule,
    style: styleForRule(matchedRule),
  };
}

function readMetric(entry: Record<string, unknown>): MetricCardMetric {
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : 'metric',
    label: typeof entry.label === 'string' && entry.label ? entry.label : 'Metric',
    description: typeof entry.description === 'string' ? entry.description : '',
    value_type: readEnum(entry.value_type, ['number', 'string'], 'number'),
    variable_id: typeof entry.variable_id === 'string' ? entry.variable_id : '',
    value: entry.value,
    format: readFormat(entry.format),
    conditional_formatting: readRules(entry.conditional_formatting),
    secondary_metric: isRecord(entry.secondary_metric) ? readSecondaryMetric(entry.secondary_metric) : null,
  };
}

function readSecondaryMetric(entry: Record<string, unknown>): MetricCardValueConfig & { label?: string } {
  return {
    label: typeof entry.label === 'string' ? entry.label : '',
    value_type: readEnum(entry.value_type, ['number', 'string'], 'number'),
    variable_id: typeof entry.variable_id === 'string' ? entry.variable_id : '',
    value: entry.value,
    format: readFormat(entry.format),
    conditional_formatting: readRules(entry.conditional_formatting),
  };
}

function readFormat(value: unknown): MetricCardFormat {
  if (typeof value === 'string') return { kind: readEnum(value, ['default', 'number', 'integer', 'compact', 'percent', 'currency', 'unit'] as const, 'default') };
  if (!isRecord(value)) return {};
  return {
    kind: readEnum(value.kind, ['default', 'number', 'integer', 'compact', 'percent', 'currency', 'unit'] as const, 'default'),
    precision: typeof value.precision === 'number' ? value.precision : numberValue(value.precision) ?? undefined,
    unit: typeof value.unit === 'string' ? value.unit : '',
    currency: typeof value.currency === 'string' ? value.currency : '',
    locale: typeof value.locale === 'string' ? value.locale : '',
    prefix: typeof value.prefix === 'string' ? value.prefix : '',
    suffix: typeof value.suffix === 'string' ? value.suffix : '',
    empty_value: typeof value.empty_value === 'string' ? value.empty_value : '',
  };
}

function readRules(value: unknown): MetricCardConditionalRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : undefined,
      operator: readEnum(entry.operator, ['lt', 'lte', 'gt', 'gte', 'eq', 'neq', 'between', 'contains', 'is_empty', 'is_not_empty'] as const, 'eq'),
      value: entry.value,
      min: entry.min,
      max: entry.max,
      color: typeof entry.color === 'string' ? entry.color : undefined,
      background_color: typeof entry.background_color === 'string' ? entry.background_color : undefined,
      label: typeof entry.label === 'string' ? entry.label : undefined,
      tone: readEnum(entry.tone, ['default', 'info', 'success', 'warning', 'danger'] as const, 'default'),
    }));
}

function styleForRule(rule: MetricCardConditionalRule | null): MetricCardResolvedValue['style'] {
  if (!rule) return {};
  const tone = rule.tone ?? 'default';
  const toneColor: Record<string, string> = {
    default: '#0f172a',
    info: '#1d4ed8',
    success: '#15803d',
    warning: '#a16207',
    danger: '#b42318',
  };
  const toneBackground: Record<string, string> = {
    default: '#f8fafc',
    info: '#eff6ff',
    success: '#f0fdf4',
    warning: '#fefce8',
    danger: '#fef2f2',
  };
  return {
    color: rule.color ?? toneColor[tone],
    backgroundColor: rule.background_color ?? toneBackground[tone],
  };
}

function addAffixes(value: string, format: MetricCardFormat) {
  return `${format.prefix ?? ''}${value}${format.suffix ?? ''}`;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function clampPrecision(value: unknown): number | undefined {
  const parsed = numberValue(value);
  if (parsed === null) return undefined;
  return Math.max(0, Math.min(8, Math.floor(parsed)));
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
