import { describe, expect, it } from 'vitest';

import type { ObjectInstance } from '@/lib/api/ontology';

import {
  buildTimelineEvents,
  gapBetweenEvents,
  parseTimelineTimestampToMs,
  readTimelineWidgetConfig,
  type TimelineLayerConfig,
} from './workshopTimeline';

function makeObject(id: string, properties: Record<string, unknown>): ObjectInstance {
  return {
    id,
    object_type_id: 'Event',
    properties,
    created_by: 'system',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Workshop Timeline widget config parsing', () => {
  it('falls back to a default layer when none is configured', () => {
    const config = readTimelineWidgetConfig({});
    expect(config.layers).toHaveLength(1);
    expect(config.layers[0].title).toBe('Layer 1');
    expect(config.layers[0].title_mode).toBe('object_title');
    expect(config.layers[0].properties_mode).toBe('specific');
    expect(config.layers[0].color_mode).toBe('default');
    expect(config.layers[0].icon_mode).toBe('default');
    expect(config.orientation).toBe('vertical');
    expect(config.order).toBe('newest_first');
    expect(config.max_events).toBe(250);
  });

  it('clamps max_events to [1, 5000] and normalises invalid orientations', () => {
    const tooLow = readTimelineWidgetConfig({ max_events: 0, orientation: 'bogus' });
    expect(tooLow.max_events).toBe(1);
    expect(tooLow.orientation).toBe('vertical');
    const tooHigh = readTimelineWidgetConfig({ max_events: 999999, orientation: 'horizontal', order: 'oldest_first' });
    expect(tooHigh.max_events).toBe(5000);
    expect(tooHigh.orientation).toBe('horizontal');
    expect(tooHigh.order).toBe('oldest_first');
  });

  it('parses a fully populated layer including color rules and displayed_properties', () => {
    const config = readTimelineWidgetConfig({
      layers: [
        {
          id: 'alerts',
          title: 'Alerts',
          source_variable_id: 'alertsVar',
          object_type_id: 'FlightAlert',
          date_property: 'raised_at_utc',
          title_mode: 'property',
          title_property: 'subject',
          properties_mode: 'specific',
          displayed_properties: ['urgency', 'aircraft'],
          color_mode: 'dynamic',
          color: '#666',
          color_rules: [
            { property_name: 'urgency', operator: 'equals', value: 'HIGH', color: '#dc2626' },
            { property_name: 'urgency', operator: 'in', value: ['MEDIUM', 'LOW'], color: '#f59e0b' },
            { property_name: 'no_color' }, // dropped: missing color
          ],
          icon_mode: 'custom',
          icon: 'warning',
          selection_event_override: 'open_alert',
        },
      ],
    });
    const [layer] = config.layers;
    expect(layer.color_rules).toHaveLength(2);
    expect(layer.color_rules[0].operator).toBe('equals');
    expect(layer.displayed_properties).toEqual(['urgency', 'aircraft']);
    expect(layer.icon_mode).toBe('custom');
    expect(layer.icon).toBe('warning');
    expect(layer.selection_event_override).toBe('open_alert');
  });
});

describe('Workshop Timeline event building', () => {
  const layer: TimelineLayerConfig = {
    id: 'alerts',
    title: 'Alerts',
    source_variable_id: 'alertsVar',
    object_type_id: 'FlightAlert',
    scenario_variable_id: '',
    date_property: 'raised_at_utc',
    title_mode: 'property',
    title_property: 'subject',
    custom_title: '',
    properties_mode: 'specific',
    displayed_properties: ['urgency', 'aircraft'],
    color_mode: 'dynamic',
    color: '#94a3b8',
    color_rules: [
      { property_name: 'urgency', operator: 'equals', value: 'HIGH', color: '#dc2626' },
      { property_name: 'urgency', operator: 'in', value: ['MEDIUM'], color: '#f59e0b' },
    ],
    icon_mode: 'custom',
    icon: 'warning',
    selection_event_override: '',
  };

  it('projects objects into events with derived title, color, and properties; sorts newest first by default', () => {
    const events = buildTimelineEvents(
      [layer],
      {
        alerts: [
          makeObject('a-1', { raised_at_utc: '2026-05-20T10:00:00Z', subject: 'Alert one', urgency: 'HIGH', aircraft: 'A320' }),
          makeObject('a-2', { raised_at_utc: '2026-05-20T09:30:00Z', subject: 'Alert two', urgency: 'MEDIUM', aircraft: 'A321' }),
          makeObject('a-3', { raised_at_utc: 'invalid' }),
        ],
      },
      { order: 'newest_first', maxEvents: 100 },
    );
    expect(events.map((event) => event.id)).toEqual(['a-1', 'a-2']);
    expect(events[0].title).toBe('Alert one');
    expect(events[0].color).toBe('#dc2626');
    expect(events[1].color).toBe('#f59e0b');
    expect(events[0].icon).toBe('warning');
    expect(events[0].properties.map((property) => property.name)).toEqual(['urgency', 'aircraft']);
  });

  it('reorders oldest first and truncates to maxEvents', () => {
    const objects: ObjectInstance[] = [];
    for (let i = 0; i < 8; i += 1) {
      objects.push(makeObject(`o-${i}`, { raised_at_utc: `2026-05-${10 + i}T00:00:00Z`, subject: `s-${i}`, urgency: 'LOW' }));
    }
    const events = buildTimelineEvents([layer], { alerts: objects }, { order: 'oldest_first', maxEvents: 3 });
    expect(events.map((event) => event.id)).toEqual(['o-0', 'o-1', 'o-2']);
  });

  it('falls back to default title when title_mode=object_title', () => {
    const events = buildTimelineEvents(
      [{ ...layer, title_mode: 'object_title', icon_mode: 'none' }],
      {
        alerts: [makeObject('a-1', { raised_at_utc: '2026-05-20T10:00:00Z', display_name: 'Object display', urgency: 'HIGH' })],
      },
      { order: 'newest_first', maxEvents: 10 },
    );
    expect(events[0].title).toBe('Object display');
    expect(events[0].icon).toBeNull();
  });
});

describe('Workshop Timeline misc helpers', () => {
  it('parseTimelineTimestampToMs handles ms, ISO and Date inputs', () => {
    expect(parseTimelineTimestampToMs(1700000000000)).toBe(1700000000000);
    expect(parseTimelineTimestampToMs('2026-05-20T10:00:00Z')).toBe(Date.parse('2026-05-20T10:00:00Z'));
    expect(parseTimelineTimestampToMs(new Date('2026-05-20Z'))).toBe(Date.parse('2026-05-20Z'));
    expect(parseTimelineTimestampToMs('')).toBeNull();
  });

  it('gapBetweenEvents picks a sensible unit', () => {
    const base = { id: 'a', layerId: 'l', layerTitle: 'L', object: makeObject('a', {}), title: 't', color: '#000', icon: null, selectionEventOverride: '', properties: [] };
    expect(gapBetweenEvents({ ...base, timestampMs: 0 }, { ...base, timestampMs: 30_000 })).toBe('30s');
    expect(gapBetweenEvents({ ...base, timestampMs: 0 }, { ...base, timestampMs: 5 * 60_000 })).toBe('5m');
    expect(gapBetweenEvents({ ...base, timestampMs: 0 }, { ...base, timestampMs: 4 * 3_600_000 })).toBe('4h');
    expect(gapBetweenEvents({ ...base, timestampMs: 0 }, { ...base, timestampMs: 3 * 86_400_000 })).toBe('3d');
  });
});
