import { describe, expect, it, vi } from 'vitest';

import type { WidgetEvent } from '@/lib/api/apps';

import { runWorkshopEvents } from './workshopEvents';
import { buildWorkshopScenarioValue } from './workshopScenarios';

function event(id: string, trigger: string, action: string, config: Record<string, unknown> = {}): WidgetEvent {
  return { id, trigger, action, label: id, config };
}

describe('Workshop event engine', () => {
  it('runs matching events sequentially and preserves downstream order', async () => {
    const order: string[] = [];
    const trace = await runWorkshopEvents({
      trigger: 'click',
      events: [
        event('set-trail', 'click', 'set_variable', { variable_id: 'trail_id', value: '{{object_id}}' }),
        event('refresh-table', 'click', 'refresh'),
        event('ignored', 'select', 'refresh'),
      ],
      payload: { object_id: 'trail-1' },
      handlers: {
        setVariable: async (variableId, value) => {
          order.push(`set:${variableId}:${value}`);
        },
        refresh: async () => {
          order.push('refresh');
        },
      },
    });

    expect(order).toEqual(['set:trail_id:trail-1', 'refresh']);
    expect(trace.map((entry) => entry.event_id)).toEqual(['set-trail', 'refresh-table']);
    expect(trace.every((entry) => entry.status === 'executed')).toBe(true);
  });

  it('handles navigation, URL, export, command, and apply-action events', async () => {
    const navigate = vi.fn();
    const openUrl = vi.fn();
    const exportData = vi.fn();
    const command = vi.fn();
    const applyAction = vi.fn();

    await runWorkshopEvents({
      trigger: 'select',
      events: [
        event('nav', 'select', 'navigate', { page_id: 'details' }),
        event('url', 'select', 'open_url', { url: '/objects/{{object_id}}' }),
        event('export', 'select', 'export', { format: 'csv' }),
        event('cmd', 'select', 'command', { command: 'focus-search' }),
        event('action', 'select', 'apply_action', { action_type_id: 'EditTrail' }),
      ],
      payload: { object_id: 'trail-2' },
      handlers: { navigate, openUrl, exportData, command, applyAction },
    });

    expect(navigate).toHaveBeenCalledWith('details', expect.objectContaining({ id: 'nav' }));
    expect(openUrl).toHaveBeenCalledWith('/objects/trail-2', expect.objectContaining({ id: 'url' }));
    expect(exportData).toHaveBeenCalledWith('csv', { object_id: 'trail-2' }, expect.objectContaining({ id: 'export' }));
    expect(command).toHaveBeenCalledWith('focus-search', { object_id: 'trail-2' }, expect.objectContaining({ id: 'cmd' }));
    expect(applyAction).toHaveBeenCalledWith('EditTrail', { object_id: 'trail-2' }, expect.objectContaining({ id: 'action' }));
  });

  it('merges runtime parameters for scenario-style events', async () => {
    const setRuntimeParameters = vi.fn();
    const scenario = buildWorkshopScenarioValue({
      parameters: [
        { name: 'trail', label: 'Trail', default_value: 'betasso' },
        { name: 'demand_multiplier', label: 'Demand', default_value: '1.0' },
      ],
      values: { trail: 'mesa', demand_multiplier: '1.2' },
      status: 'applied',
    });
    await runWorkshopEvents({
      trigger: 'scenario_change',
      events: [event('scenario', 'scenario_change', 'set_parameters', { parameters: { unit: 'miles' } })],
      payload: scenario,
      state: { runtimeParameters: { user: 'ava' } },
      handlers: { setRuntimeParameters },
    });

    expect(setRuntimeParameters).toHaveBeenCalledWith(
      { user: 'ava', unit: 'miles', trail: 'mesa', demand_multiplier: '1.2' },
      expect.objectContaining({ id: 'scenario' }),
    );
  });

  it('resets runtime parameters from scenario baselines', async () => {
    const setRuntimeParameters = vi.fn();
    const scenario = buildWorkshopScenarioValue({
      parameters: [{ name: 'demand_multiplier', label: 'Demand', default_value: '1.0' }],
      values: { demand_multiplier: '1.0' },
      status: 'reset',
    });

    await runWorkshopEvents({
      trigger: 'scenario_reset',
      events: [event('scenario-reset', 'scenario_reset', 'clear_parameters')],
      payload: scenario,
      state: { runtimeParameters: { demand_multiplier: '1.4', unit: 'miles' } },
      handlers: { setRuntimeParameters },
    });

    expect(setRuntimeParameters).toHaveBeenCalledWith(
      { demand_multiplier: '1.0' },
      expect.objectContaining({ id: 'scenario-reset' }),
    );
  });
});
