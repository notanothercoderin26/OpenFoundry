import { useEffect, useMemo, useState } from 'react';

import {
  updateObjectTypeAppCapabilities,
  type AppCapabilities,
  type ObjectType,
  type Property,
  type VertexEventCapability,
  type VertexEventIntent,
} from '@/lib/api/ontology';

export interface VertexEventCapabilityEditorProps {
  objectType: ObjectType;
  properties: Property[];
  onSaved?: (updated: ObjectType) => void;
}

const INTENT_OPTIONS: { id: VertexEventIntent; label: string; tone: string; description: string }[] = [
  { id: 'none', label: 'No badge', tone: '#94a3b8', description: 'Hide the event from the badge layer.' },
  { id: 'primary', label: 'Primary (blue)', tone: '#60a5fa', description: 'Neutral informational signal.' },
  { id: 'success', label: 'Success (green)', tone: '#34d399', description: 'Positive outcome — e.g. on-time arrivals.' },
  { id: 'warning', label: 'Warning (amber)', tone: '#fbbf24', description: 'Noteworthy but non-blocking — e.g. minor delays.' },
  { id: 'danger', label: 'Danger (red)', tone: '#f87171', description: 'Critical — e.g. SLA breach or outage.' },
];

const NUMERIC_PROPERTY_KINDS = new Set([
  'integer',
  'long',
  'double',
  'float',
  'decimal',
  'numeric',
  'number',
]);

function isNumericProperty(p: Property): boolean {
  const raw = (p.property_type ?? p.base_type ?? '').toLowerCase();
  return NUMERIC_PROPERTY_KINDS.has(raw);
}

export function VertexEventCapabilityEditor({ objectType, properties, onSaved }: VertexEventCapabilityEditorProps) {
  const initial = (objectType.app_capabilities?.vertex_event ?? {}) as VertexEventCapability;
  const [intent, setIntent] = useState<VertexEventIntent>(initial.event_intent ?? 'none');
  const [valuePropertyId, setValuePropertyId] = useState(initial.value_property_id ?? '');
  const [valueUnit, setValueUnit] = useState(initial.value_unit ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const next = (objectType.app_capabilities?.vertex_event ?? {}) as VertexEventCapability;
    setIntent(next.event_intent ?? 'none');
    setValuePropertyId(next.value_property_id ?? '');
    setValueUnit(next.value_unit ?? '');
  }, [objectType.id]);

  const numericProperties = useMemo(() => properties.filter(isNumericProperty), [properties]);

  const dirty = useMemo(() => {
    return (
      (initial.event_intent ?? 'none') !== intent ||
      (initial.value_property_id ?? '') !== valuePropertyId ||
      (initial.value_unit ?? '') !== valueUnit
    );
  }, [initial.event_intent, initial.value_property_id, initial.value_unit, intent, valuePropertyId, valueUnit]);

  async function onSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const previous = (objectType.app_capabilities ?? {}) as AppCapabilities;
      const nextEvent: VertexEventCapability = {
        event_intent: intent,
        value_property_id: valuePropertyId || undefined,
        value_unit: valueUnit || undefined,
      };
      const payload: AppCapabilities = { ...previous, vertex_event: nextEvent };
      const updated = await updateObjectTypeAppCapabilities(objectType.id, payload);
      onSaved?.(updated);
      setSavedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  const selectedIntent = INTENT_OPTIONS.find((o) => o.id === intent) ?? INTENT_OPTIONS[0];

  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <p className="of-eyebrow" style={{ margin: 0 }}>Vertex · event configuration</p>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Render this object type as a graph event</h2>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          When this object type represents an event in the data model (a delay, an alarm, an incident…), Vertex
          attaches a notification badge to the related node coloured by the chosen intent and shows the value
          property as the badge size and side-panel label.
        </p>
      </header>

      <div style={{ display: 'grid', gap: 6 }}>
        <p className="of-eyebrow" style={{ margin: 0 }}>Event intent</p>
        <div style={{ display: 'grid', gap: 6 }}>
          {INTENT_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="of-panel-muted"
              style={{
                padding: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                border: intent === opt.id ? `1px solid ${opt.tone}` : '1px solid rgba(148, 163, 184, 0.18)',
              }}
            >
              <input
                type="radio"
                name="vertex-event-intent"
                value={opt.id}
                checked={intent === opt.id}
                onChange={() => setIntent(opt.id)}
              />
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: opt.tone,
                  display: 'inline-block',
                }}
              />
              <span style={{ display: 'grid', gap: 2, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
                <span className="of-text-muted" style={{ fontSize: 12 }}>{opt.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="of-eyebrow">Value property (numeric)</span>
          <select
            className="of-select"
            value={valuePropertyId}
            onChange={(e) => setValuePropertyId(e.target.value)}
            disabled={intent === 'none'}
          >
            <option value="">(none)</option>
            {numericProperties.map((p) => (
              <option key={p.id} value={p.name || p.id}>
                {p.display_name || p.name}
              </option>
            ))}
          </select>
          {numericProperties.length === 0 && (
            <span className="of-text-muted" style={{ fontSize: 12 }}>
              No numeric properties on this type yet.
            </span>
          )}
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="of-eyebrow">Value unit</span>
          <input
            className="of-input"
            value={valueUnit}
            placeholder="e.g. minutes, ft, USD"
            onChange={(e) => setValueUnit(e.target.value)}
            disabled={intent === 'none'}
          />
        </label>
      </div>

      <div
        className="of-panel-muted"
        style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}
      >
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: selectedIntent.tone,
            color: '#0f172a',
            fontWeight: 700,
            fontSize: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          1
        </span>
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          Preview: a node that has one linked <code>{objectType.display_name}</code> shows a {selectedIntent.label.toLowerCase()} badge in Vertex.
        </span>
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: 12, color: '#fecaca' }}>{error}</p>
      )}
      {savedAt && !dirty && !error && (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
          Saved at {savedAt.toLocaleTimeString()}.
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="of-btn of-btn-primary" disabled={!dirty || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save configuration'}
        </button>
      </div>
    </section>
  );
}
