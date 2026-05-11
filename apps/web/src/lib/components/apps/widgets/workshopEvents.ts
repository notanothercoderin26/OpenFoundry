import type { WidgetEvent } from '@/lib/api/apps';
import { isWorkshopScenarioPayload, scenarioRuntimeParameters } from './workshopScenarios';

export interface WorkshopEventRuntimeState {
  runtimeParameters?: Record<string, string>;
  initialRuntimeParameters?: Record<string, string>;
}

export interface WorkshopEventHandlers {
  setVariable?: (variableId: string, value: unknown, event: WidgetEvent) => void | Promise<void>;
  setRuntimeParameters?: (parameters: Record<string, string>, event: WidgetEvent) => void | Promise<void>;
  navigate?: (target: string, event: WidgetEvent) => void | Promise<void>;
  openUrl?: (url: string, event: WidgetEvent) => void | Promise<void>;
  refresh?: (event: WidgetEvent) => void | Promise<void>;
  applyAction?: (actionTypeId: string, payload: Record<string, unknown>, event: WidgetEvent) => void | Promise<void>;
  exportData?: (format: string, payload: Record<string, unknown>, event: WidgetEvent) => void | Promise<void>;
  command?: (command: string, payload: Record<string, unknown>, event: WidgetEvent) => void | Promise<void>;
  setFilter?: (value: string, event: WidgetEvent) => void | Promise<void>;
  seedPrompt?: (prompt: string, event: WidgetEvent) => void | Promise<void>;
  notice?: (message: string, tone: 'info' | 'success' | 'warning', event: WidgetEvent) => void | Promise<void>;
}

export interface WorkshopEventExecution {
  event_id: string;
  action: string;
  status: 'executed' | 'skipped';
  detail?: string;
}

export interface WorkshopEventRunOptions {
  events: WidgetEvent[];
  trigger: string;
  payload?: Record<string, unknown>;
  state?: WorkshopEventRuntimeState;
  handlers?: WorkshopEventHandlers;
}

export async function runWorkshopEvents({
  events,
  trigger,
  payload = {},
  state = {},
  handlers = {},
}: WorkshopEventRunOptions): Promise<WorkshopEventExecution[]> {
  const trace: WorkshopEventExecution[] = [];
  const matching = events.filter((event) => event.trigger === trigger);
  for (const event of matching) {
    const action = normalizeAction(event.action);
    const config = event.config ?? {};
    if (!action) {
      trace.push({ event_id: event.id, action: event.action, status: 'skipped', detail: 'empty_action' });
      continue;
    }
    await runOneEvent(action, event, config, payload, state, handlers, trace);
  }
  return trace;
}

export function downloadWorkshopEventPayload(format: string, payload: Record<string, unknown>, filename = 'workshop-export') {
  if (typeof document === 'undefined') return;
  const normalizedFormat = format.trim().toLowerCase() || 'json';
  const content = normalizedFormat === 'csv' ? payloadToCsv(payload) : JSON.stringify(payload, null, 2);
  const mime = normalizedFormat === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.${normalizedFormat === 'csv' ? 'csv' : 'json'}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function runOneEvent(
  action: string,
  event: WidgetEvent,
  config: Record<string, unknown>,
  payload: Record<string, unknown>,
  state: WorkshopEventRuntimeState,
  handlers: WorkshopEventHandlers,
  trace: WorkshopEventExecution[],
) {
  if (action === 'set_variable') {
    const variableId = readString(config, ['variable_id', 'variableId', 'target_variable_id', 'targetVariableId']);
    if (!variableId) {
      trace.push({ event_id: event.id, action, status: 'skipped', detail: 'missing_variable_id' });
      return;
    }
    const value = resolveEventValue(config, payload, state);
    await handlers.setVariable?.(variableId, value, event);
    trace.push({ event_id: event.id, action, status: 'executed', detail: variableId });
    return;
  }

  if (action === 'set_parameters') {
    const payloadParameters = isWorkshopScenarioPayload(payload) ? scenarioRuntimeParameters(payload) : toRuntimeParameters(payload);
    const next = {
      ...(state.runtimeParameters ?? {}),
      ...toRuntimeParameters(config.parameters),
      ...payloadParameters,
    };
    await handlers.setRuntimeParameters?.(next, event);
    trace.push({ event_id: event.id, action, status: 'executed' });
    return;
  }

  if (action === 'clear_parameters') {
    const payloadParameters = isWorkshopScenarioPayload(payload) ? scenarioRuntimeParameters(payload) : toRuntimeParameters(payload);
    const next = Object.keys(payload).length > 0
      ? payloadParameters
      : { ...(state.initialRuntimeParameters ?? {}) };
    await handlers.setRuntimeParameters?.(next, event);
    trace.push({ event_id: event.id, action, status: 'executed' });
    return;
  }

  if (action === 'navigate') {
    const target = interpolate(readString(config, ['page_id', 'page_path', 'path', 'url', 'target']), state.runtimeParameters ?? {}, payload);
    if (!target) {
      trace.push({ event_id: event.id, action, status: 'skipped', detail: 'missing_target' });
      return;
    }
    await handlers.navigate?.(target, event);
    trace.push({ event_id: event.id, action, status: 'executed', detail: target });
    return;
  }

  if (action === 'open_url') {
    const url = interpolate(readString(config, ['url', 'href']), state.runtimeParameters ?? {}, payload);
    if (!url) {
      trace.push({ event_id: event.id, action, status: 'skipped', detail: 'missing_url' });
      return;
    }
    await handlers.openUrl?.(url, event);
    trace.push({ event_id: event.id, action, status: 'executed', detail: url });
    return;
  }

  if (action === 'filter') {
    const value = stringifyRuntimeValue(
      readPayloadValue(payload, readString(config, ['payload_path', 'path'])) ??
      payload.value ??
      payload.filter ??
      payload.query ??
      readString(config, ['value', 'filter', 'query']),
    );
    await handlers.setFilter?.(value, event);
    trace.push({ event_id: event.id, action, status: 'executed', detail: value });
    return;
  }

  if (action === 'seed_agent_prompt') {
    const template = readString(config, ['prompt_template', 'prompt', 'message']);
    const prompt = template
      ? interpolate(template, state.runtimeParameters ?? {}, payload)
      : stringifyRuntimeValue(payload.prompt ?? '');
    await handlers.seedPrompt?.(prompt, event);
    trace.push({ event_id: event.id, action, status: 'executed' });
    return;
  }

  if (action === 'refresh') {
    await handlers.refresh?.(event);
    trace.push({ event_id: event.id, action, status: 'executed' });
    return;
  }

  if (action === 'apply_action') {
    const actionTypeId = readString(config, ['action_type_id', 'actionTypeId']);
    if (!actionTypeId) {
      trace.push({ event_id: event.id, action, status: 'skipped', detail: 'missing_action_type_id' });
      return;
    }
    await handlers.applyAction?.(actionTypeId, payload, event);
    trace.push({ event_id: event.id, action, status: 'executed', detail: actionTypeId });
    return;
  }

  if (action === 'export') {
    const format = readString(config, ['format', 'type']) || 'json';
    await handlers.exportData?.(format, payload, event);
    trace.push({ event_id: event.id, action, status: 'executed', detail: format });
    return;
  }

  if (action === 'command') {
    const command = readString(config, ['command', 'name']) || event.label || event.id;
    await handlers.command?.(command, payload, event);
    trace.push({ event_id: event.id, action, status: 'executed', detail: command });
    return;
  }

  await handlers.command?.(event.action, payload, event);
  await handlers.notice?.(`${event.label ?? event.action} is not wired to a runtime handler yet.`, 'warning', event);
  trace.push({ event_id: event.id, action, status: 'skipped', detail: 'unsupported_action' });
}

function normalizeAction(action: string) {
  const normalized = action.trim().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
  if (normalized === 'open_link') return 'open_url';
  if (normalized === 'openurl') return 'open_url';
  if (normalized === 'setvariable') return 'set_variable';
  if (normalized === 'applyaction' || normalized === 'action') return 'apply_action';
  if (normalized === 'export_data' || normalized === 'download') return 'export';
  return normalized;
}

function resolveEventValue(
  config: Record<string, unknown>,
  payload: Record<string, unknown>,
  state: WorkshopEventRuntimeState,
) {
  const payloadPath = readString(config, ['payload_path', 'payloadPath', 'value_path', 'valuePath']);
  const value = payloadPath ? readPayloadValue(payload, payloadPath) : config.value;
  if (typeof value === 'string') return interpolate(value, state.runtimeParameters ?? {}, payload);
  if (value !== undefined) return value;
  const source = readString(config, ['payload_key', 'payloadKey']);
  if (source) return payload[source];
  return payload.value ?? payload;
}

function readPayloadValue(payload: Record<string, unknown>, path: string) {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((current, part) => {
    if (!isRecord(current)) return undefined;
    return current[part];
  }, payload);
}

function readString(config: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toRuntimeParameters(value: unknown) {
  if (!isRecord(value)) return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .map(([key, entry]) => [key, stringifyRuntimeValue(entry)]),
  );
}

function stringifyRuntimeValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function interpolate(template: string, params: Record<string, string>, payload: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const payloadValue = readPayloadValue(payload, key);
    if (payloadValue !== undefined) return stringifyRuntimeValue(payloadValue);
    return params[key] ?? '';
  });
}

function payloadToCsv(payload: Record<string, unknown>) {
  const rows = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.data)
      ? payload.data
      : [payload];
  const records = rows.filter(isRecord);
  const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
  if (headers.length === 0) return '';
  return [
    headers.join(','),
    ...records.map((record) => headers.map((header) => csvCell(record[header])).join(',')),
  ].join('\n');
}

function csvCell(value: unknown) {
  const raw = stringifyRuntimeValue(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
