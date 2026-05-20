import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppWidget } from '@/lib/api/apps';
import type { ObjectInstance } from '@/lib/api/ontology';

import {
  buildTimelineEvents,
  gapBetweenEvents,
  readTimelineWidgetConfig,
  type TimelineEvent,
  type TimelineWidgetConfig,
} from './workshopTimeline';
import {
  executeWorkshopObjectSet,
} from './workshopObjectSets';
import type {
  WorkshopVariableEngineResult,
  WorkshopVariableLike,
} from './workshopVariables';

interface WorkshopTimelineWidgetProps {
  widget: AppWidget;
  variables?: WorkshopVariableLike[];
  variableEngine?: WorkshopVariableEngineResult | null;
  onSelectObject?: (variableId: string, object: ObjectInstance | null) => void;
  onSelectObjectSet?: (variableId: string, objects: ObjectInstance[]) => void;
  onSelectRecord?: (payload: Record<string, unknown>) => void | Promise<void>;
}

export function WorkshopTimelineWidget({
  widget,
  variables = [],
  variableEngine = null,
  onSelectObject,
  onSelectObjectSet,
  onSelectRecord,
}: WorkshopTimelineWidgetProps) {
  const config = useMemo<TimelineWidgetConfig>(() => readTimelineWidgetConfig(widget.props ?? {}), [widget.props]);
  const [objectsByLayer, setObjectsByLayer] = useState<Record<string, ObjectInstance[]>>({});
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError('');
      const next: Record<string, ObjectInstance[]> = {};
      try {
        for (const layer of config.layers) {
          const variable = layer.source_variable_id ? variables.find((entry) => entry.id === layer.source_variable_id) ?? null : null;
          const objectTypeId = variable?.object_type_id || layer.object_type_id;
          if (!objectTypeId) {
            next[layer.id] = [];
            continue;
          }
          const response = await executeWorkshopObjectSet({
            variable,
            variables,
            engine: variableEngine,
            objectTypeId,
            limit: Math.max(1, Math.min(config.max_events, 1000)),
          });
          if (cancelled) return;
          next[layer.id] = response.data;
        }
        if (!cancelled) setObjectsByLayer(next);
      } catch (cause) {
        if (!cancelled) {
          setObjectsByLayer({});
          setLoadError(cause instanceof Error ? cause.message : 'Timeline data load failed');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [config, variableEngine, variables]);

  const visibleLayers = useMemo(
    () => config.layers.filter((layer) => !hiddenLayers.has(layer.id)),
    [config.layers, hiddenLayers],
  );
  const events = useMemo(
    () => buildTimelineEvents(visibleLayers, objectsByLayer, { order: config.order, maxEvents: config.max_events }),
    [config.max_events, config.order, objectsByLayer, visibleLayers],
  );

  const toggleLayer = useCallback((layerId: string) => {
    setHiddenLayers((previous) => {
      const next = new Set(previous);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const handleEventClick = useCallback(
    async (event: TimelineEvent) => {
      setActiveEventId(event.id);
      if (config.selected_object_variable_id) onSelectObject?.(config.selected_object_variable_id, event.object);
      if (config.selected_objects_variable_id) onSelectObjectSet?.(config.selected_objects_variable_id, [event.object]);
      await onSelectRecord?.({
        object_id: event.id,
        object_type_id: event.object.object_type_id,
        layer_id: event.layerId,
        event_time_ms: event.timestampMs,
        selection_event_override: event.selectionEventOverride,
      });
    },
    [config.selected_object_variable_id, config.selected_objects_variable_id, onSelectObject, onSelectObjectSet, onSelectRecord],
  );

  if (loadError) {
    return (
      <div data-testid="workshop-timeline-widget" style={{ padding: 12, color: '#be123c', fontSize: 12 }}>
        {loadError}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div data-testid="workshop-timeline-widget" data-empty="true" style={{ padding: 24, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
        {config.empty_label}
      </div>
    );
  }

  return (
    <div
      data-testid="workshop-timeline-widget"
      data-orientation={config.orientation}
      style={{
        display: 'grid',
        gap: 8,
        padding: 12,
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        overflow: 'auto',
        maxHeight: '100%',
      }}
    >
      {config.show_legend ? (
        <div data-testid="workshop-timeline-legend" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingBottom: 6, borderBottom: '1px solid #e2e8f0' }}>
          {config.layers.map((layer) => {
            const visible = !hiddenLayers.has(layer.id);
            return (
              <button
                key={layer.id}
                type="button"
                data-testid={`workshop-timeline-legend-${layer.id}`}
                onClick={() => toggleLayer(layer.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 8px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 999,
                  background: visible ? '#fff' : '#f1f5f9',
                  color: visible ? '#0f172a' : '#94a3b8',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: layer.color }} />
                {layer.title}
              </button>
            );
          })}
        </div>
      ) : null}
      {config.orientation === 'horizontal' ? (
        <HorizontalTimeline
          events={events}
          activeEventId={activeEventId}
          highlightSelection={config.highlight_selection}
          showGap={config.show_time_between_events}
          onSelect={handleEventClick}
        />
      ) : (
        <VerticalTimeline
          events={events}
          activeEventId={activeEventId}
          highlightSelection={config.highlight_selection}
          showGap={config.show_time_between_events}
          onSelect={handleEventClick}
        />
      )}
    </div>
  );
}

interface TimelineBodyProps {
  events: TimelineEvent[];
  activeEventId: string | null;
  highlightSelection: boolean;
  showGap: boolean;
  onSelect: (event: TimelineEvent) => void | Promise<void>;
}

function VerticalTimeline({ events, activeEventId, highlightSelection, showGap, onSelect }: TimelineBodyProps) {
  return (
    <ol data-testid="workshop-timeline-vertical" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 0 }}>
      {events.map((event, index) => {
        const previous = index > 0 ? events[index - 1] : null;
        const isActive = highlightSelection && event.id === activeEventId;
        return (
          <li key={event.id} style={{ display: 'grid', gridTemplateColumns: '120px 32px 1fr', alignItems: 'start', columnGap: 12, padding: '10px 4px', borderTop: index === 0 ? 'none' : '1px solid #f1f5f9', background: isActive ? '#eff6ff' : 'transparent', cursor: 'pointer' }}
              data-testid={`workshop-timeline-event-${event.id}`}
              onClick={() => { void onSelect(event); }}
          >
            <span style={{ color: '#475569', fontSize: 12 }}>{formatTimestamp(event.timestampMs)}</span>
            <span style={{ display: 'grid', placeItems: 'center' }}>
              <span aria-hidden style={{ width: 26, height: 26, borderRadius: '50%', background: event.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>
                {event.icon ? iconGlyph(event.icon) : '●'}
              </span>
            </span>
            <div style={{ display: 'grid', gap: 4 }}>
              <strong style={{ color: event.color, fontSize: 13 }}>{event.title}</strong>
              {event.properties.map((property) => (
                <span key={property.name} style={{ color: '#334155', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>{property.name}</span>
                  {' • '}
                  {formatValue(property.value)}
                </span>
              ))}
              {showGap && previous ? (
                <span style={{ color: '#94a3b8', fontSize: 11 }} data-testid={`workshop-timeline-gap-${event.id}`}>
                  {gapBetweenEvents(previous, event)} from previous
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HorizontalTimeline({ events, activeEventId, highlightSelection, showGap, onSelect }: TimelineBodyProps) {
  return (
    <ol data-testid="workshop-timeline-horizontal" style={{ listStyle: 'none', margin: 0, padding: '4px 0 12px', display: 'flex', gap: 12, overflowX: 'auto' }}>
      {events.map((event, index) => {
        const previous = index > 0 ? events[index - 1] : null;
        const isActive = highlightSelection && event.id === activeEventId;
        return (
          <li
            key={event.id}
            data-testid={`workshop-timeline-event-${event.id}`}
            onClick={() => { void onSelect(event); }}
            style={{ minWidth: 180, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: isActive ? '#eff6ff' : '#fff', cursor: 'pointer', display: 'grid', gap: 6 }}
          >
            <span style={{ color: '#475569', fontSize: 11 }}>{formatTimestamp(event.timestampMs)}</span>
            <span aria-hidden style={{ alignSelf: 'flex-start', width: 22, height: 22, borderRadius: '50%', background: event.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
              {event.icon ? iconGlyph(event.icon) : '●'}
            </span>
            <strong style={{ color: event.color, fontSize: 12 }}>{event.title}</strong>
            {event.properties.slice(0, 3).map((property) => (
              <span key={property.name} style={{ color: '#334155', fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>{property.name}</span>
                {' • '}
                {formatValue(property.value)}
              </span>
            ))}
            {showGap && previous ? (
              <span style={{ color: '#94a3b8', fontSize: 10 }} data-testid={`workshop-timeline-gap-${event.id}`}>
                +{gapBetweenEvents(previous, event)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };
  return date.toLocaleString(undefined, opts);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function iconGlyph(icon: string): string {
  switch (icon.toLowerCase()) {
    case 'warning':
      return '!';
    case 'plane':
    case 'flight':
      return '✈';
    case 'star':
      return '★';
    case 'check':
      return '✓';
    case 'cross':
      return '✕';
    case 'calendar':
    default:
      return '●';
  }
}
