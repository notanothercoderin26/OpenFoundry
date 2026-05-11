export type WorkshopScenarioStatus = 'draft' | 'applied' | 'reset';

export interface WorkshopScenarioParameter {
  name: string;
  label?: string;
  type?: string;
  default_value?: unknown;
  description?: string;
}

export interface WorkshopScenarioDelta {
  name: string;
  label: string;
  baseline: string;
  current: string;
  changed: boolean;
  baseline_number?: number;
  current_number?: number;
  delta_number?: number;
}

export interface WorkshopScenarioValue {
  [key: string]: unknown;
  kind: 'scenario';
  version: 1;
  source_widget_id?: string;
  status: WorkshopScenarioStatus;
  values: Record<string, string>;
  baseline: Record<string, string>;
  deltas: Record<string, WorkshopScenarioDelta>;
  changed_parameter_names: string[];
}

export function buildWorkshopScenarioValue({
  parameters,
  values = {},
  status = 'draft',
  sourceWidgetId,
}: {
  parameters: WorkshopScenarioParameter[];
  values?: Record<string, unknown>;
  status?: WorkshopScenarioStatus;
  sourceWidgetId?: string;
}): WorkshopScenarioValue {
  const baseline: Record<string, string> = {};
  const normalizedValues: Record<string, string> = {};
  const deltas: Record<string, WorkshopScenarioDelta> = {};

  for (const parameter of parameters) {
    const name = parameter.name?.trim();
    if (!name) continue;
    const base = stringifyScenarioValue(parameter.default_value);
    const current = Object.prototype.hasOwnProperty.call(values, name)
      ? stringifyScenarioValue(values[name])
      : base;
    baseline[name] = base;
    normalizedValues[name] = current;
    deltas[name] = buildScenarioDelta(name, parameter.label || name, base, current);
  }

  for (const [name, value] of Object.entries(values)) {
    if (!name || Object.prototype.hasOwnProperty.call(normalizedValues, name)) continue;
    const current = stringifyScenarioValue(value);
    baseline[name] = '';
    normalizedValues[name] = current;
    deltas[name] = buildScenarioDelta(name, name, '', current);
  }

  return {
    kind: 'scenario',
    version: 1,
    source_widget_id: sourceWidgetId,
    status,
    values: normalizedValues,
    baseline,
    deltas,
    changed_parameter_names: Object.values(deltas).filter((delta) => delta.changed).map((delta) => delta.name),
  };
}

export function normalizeWorkshopScenarioValue(
  value: unknown,
  parameters: WorkshopScenarioParameter[] = [],
  status: WorkshopScenarioStatus = 'draft',
): WorkshopScenarioValue {
  if (isRecord(value) && value.kind === 'scenario' && isRecord(value.values)) {
    const sourceWidgetId = typeof value.source_widget_id === 'string' ? value.source_widget_id : undefined;
    const nextStatus = isScenarioStatus(value.status) ? value.status : status;
    const baselineSource = isRecord(value.baseline) ? value.baseline : {};
    const enrichedParameters = mergeScenarioParameters(parameters, baselineSource, value.values);
    return buildWorkshopScenarioValue({
      parameters: enrichedParameters,
      values: value.values,
      status: nextStatus,
      sourceWidgetId,
    });
  }
  if (isRecord(value) && isRecord(value.values)) {
    return buildWorkshopScenarioValue({ parameters: mergeScenarioParameters(parameters, {}, value.values), values: value.values, status });
  }
  if (isRecord(value)) {
    return buildWorkshopScenarioValue({ parameters: mergeScenarioParameters(parameters, {}, value), values: value, status });
  }
  return buildWorkshopScenarioValue({ parameters, status });
}

export function scenarioRuntimeParameters(value: unknown): Record<string, string> {
  const scenario = normalizeWorkshopScenarioValue(value);
  return { ...scenario.values };
}

export function scenarioPayloadToActionDefaults(value: unknown) {
  const scenario = normalizeWorkshopScenarioValue(value);
  const defaults: Record<string, { kind: 'static'; static_value: unknown; visibility: 'visible' }> = {};
  for (const [name, entry] of Object.entries(scenario.values)) {
    defaults[name] = { kind: 'static', static_value: entry, visibility: 'visible' };
  }
  defaults.scenario_payload = { kind: 'static', static_value: scenario, visibility: 'visible' };
  defaults.scenario_values = { kind: 'static', static_value: scenario.values, visibility: 'visible' };
  return defaults;
}

export function isWorkshopScenarioPayload(value: unknown): value is WorkshopScenarioValue {
  return isRecord(value) && value.kind === 'scenario' && isRecord(value.values);
}

function buildScenarioDelta(name: string, label: string, baseline: string, current: string): WorkshopScenarioDelta {
  const baselineNumber = Number(baseline);
  const currentNumber = Number(current);
  const delta: WorkshopScenarioDelta = {
    name,
    label,
    baseline,
    current,
    changed: current !== baseline,
  };
  if (Number.isFinite(baselineNumber) && Number.isFinite(currentNumber)) {
    delta.baseline_number = baselineNumber;
    delta.current_number = currentNumber;
    delta.delta_number = currentNumber - baselineNumber;
  }
  return delta;
}

function mergeScenarioParameters(
  parameters: WorkshopScenarioParameter[],
  baseline: Record<string, unknown>,
  values: Record<string, unknown>,
): WorkshopScenarioParameter[] {
  const byName = new Map<string, WorkshopScenarioParameter>();
  for (const parameter of parameters) {
    if (parameter.name) byName.set(parameter.name, parameter);
  }
  for (const name of [...Object.keys(baseline), ...Object.keys(values)]) {
    if (!byName.has(name)) byName.set(name, { name, label: name, default_value: baseline[name] ?? '' });
  }
  return [...byName.values()];
}

function stringifyScenarioValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isScenarioStatus(value: unknown): value is WorkshopScenarioStatus {
  return value === 'draft' || value === 'applied' || value === 'reset';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
