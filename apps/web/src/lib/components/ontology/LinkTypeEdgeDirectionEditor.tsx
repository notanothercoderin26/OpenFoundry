import { useEffect, useMemo, useState } from 'react';

import {
  updateLinkTypeAppCapabilities,
  type LinkAppCapabilities,
  type LinkType,
  type ObjectType,
  type VertexEdgeDirectionCapability,
  type VertexEdgeDirectionMode,
  type VertexEdgeDirectionSide,
} from '@/lib/api/ontology';

export interface LinkTypeEdgeDirectionEditorProps {
  linkType: LinkType;
  // Used to display the source / target object type names next to
  // the directional radio buttons so the choice reads naturally.
  objectTypeNameById: Map<string, string>;
  onSaved?: (updated: LinkType) => void;
}

const MODE_DESCRIPTIONS: Record<VertexEdgeDirectionMode, string> = {
  primary: 'Single arrow pointing toward one fixed side of the link.',
  undirected: 'No arrows. Edges read as symmetric relationships.',
  bidirectional: 'Arrows on both ends. Reads as a two-way relationship.',
};

export function LinkTypeEdgeDirectionEditor({ linkType, objectTypeNameById, onSaved }: LinkTypeEdgeDirectionEditorProps) {
  const initial = (linkType.app_capabilities?.vertex_edge_direction ?? null) as VertexEdgeDirectionCapability | null;
  const [mode, setMode] = useState<VertexEdgeDirectionMode | ''>(initial?.mode ?? '');
  const [primarySide, setPrimarySide] = useState<VertexEdgeDirectionSide | ''>(
    (initial?.primary_side as VertexEdgeDirectionSide | null) ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const next = (linkType.app_capabilities?.vertex_edge_direction ?? null) as VertexEdgeDirectionCapability | null;
    setMode(next?.mode ?? '');
    setPrimarySide((next?.primary_side as VertexEdgeDirectionSide | null) ?? '');
  }, [linkType.id, linkType.app_capabilities]);

  const sourceName = objectTypeNameById.get(linkType.source_type_id) ?? 'Source';
  const targetName = objectTypeNameById.get(linkType.target_type_id) ?? 'Target';

  const dirty = useMemo(() => {
    const prevMode = initial?.mode ?? '';
    const prevSide = (initial?.primary_side as VertexEdgeDirectionSide | null) ?? '';
    return prevMode !== mode || prevSide !== primarySide;
  }, [initial?.mode, initial?.primary_side, mode, primarySide]);

  const requiresSide = mode === 'primary';
  const sideIssue = requiresSide && !primarySide;
  const canSave = dirty && !saving && !sideIssue;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const previous = (linkType.app_capabilities ?? {}) as LinkAppCapabilities;
      let nextDirection: VertexEdgeDirectionCapability | null = null;
      if (mode) {
        nextDirection = {
          mode,
          primary_side: mode === 'primary' ? (primarySide as VertexEdgeDirectionSide) : undefined,
        };
      }
      const payload: LinkAppCapabilities = { ...previous };
      if (nextDirection) {
        payload.vertex_edge_direction = nextDirection;
      } else {
        delete payload.vertex_edge_direction;
      }
      const updated = await updateLinkTypeAppCapabilities(linkType.id, payload);
      onSaved?.(updated);
      setSavedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <p className="of-eyebrow" style={{ margin: 0 }}>Vertex · edge direction</p>
        <h3 className="of-heading-md" style={{ margin: 0 }}>Arrow rendering for this link type</h3>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Tells Vertex how to draw arrows on edges backed by this link type. Overrides the global
          "Show arrows" toggle when set.
        </p>
      </header>

      <div style={{ display: 'grid', gap: 6 }}>
        {([
          { id: 'primary', label: 'Primary direction' },
          { id: 'undirected', label: 'Undirected' },
          { id: 'bidirectional', label: 'Bidirectional' },
        ] as Array<{ id: VertexEdgeDirectionMode; label: string }>).map((opt) => (
          <label
            key={opt.id}
            className="of-panel-muted"
            style={{
              padding: 10,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              cursor: 'pointer',
              border: mode === opt.id ? '1px solid #67e8f9' : '1px solid rgba(148, 163, 184, 0.18)',
            }}
          >
            <input
              type="radio"
              name={`vertex-direction-${linkType.id}`}
              value={opt.id}
              checked={mode === opt.id}
              onChange={() => setMode(opt.id)}
              style={{ marginTop: 3 }}
            />
            <span style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
              <span className="of-text-muted" style={{ fontSize: 12 }}>{MODE_DESCRIPTIONS[opt.id]}</span>
            </span>
          </label>
        ))}
        <label
          className="of-panel-muted"
          style={{
            padding: 10,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            cursor: 'pointer',
            border: mode === '' ? '1px solid #67e8f9' : '1px solid rgba(148, 163, 184, 0.18)',
          }}
        >
          <input
            type="radio"
            name={`vertex-direction-${linkType.id}`}
            value=""
            checked={mode === ''}
            onChange={() => setMode('')}
            style={{ marginTop: 3 }}
          />
          <span style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Use canvas default</span>
            <span className="of-text-muted" style={{ fontSize: 12 }}>
              Fall back to the global "Show arrows" / "Show reversed" toggles in Vertex.
            </span>
          </span>
        </label>
      </div>

      {mode === 'primary' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Primary side</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <label className="of-chip" style={{ display: 'inline-flex', gap: 6, padding: '6px 10px', cursor: 'pointer' }}>
              <input
                type="radio"
                name={`vertex-direction-side-${linkType.id}`}
                value="source"
                checked={primarySide === 'source'}
                onChange={() => setPrimarySide('source')}
              />
              <span>{sourceName} (source)</span>
            </label>
            <label className="of-chip" style={{ display: 'inline-flex', gap: 6, padding: '6px 10px', cursor: 'pointer' }}>
              <input
                type="radio"
                name={`vertex-direction-side-${linkType.id}`}
                value="target"
                checked={primarySide === 'target'}
                onChange={() => setPrimarySide('target')}
              />
              <span>{targetName} (target)</span>
            </label>
          </div>
          {sideIssue && (
            <span style={{ color: '#f87171', fontSize: 12 }}>Pick which side of the link the arrow should point to.</span>
          )}
        </div>
      )}

      {error && <p style={{ margin: 0, fontSize: 12, color: '#fecaca' }}>{error}</p>}
      {savedAt && !dirty && !error && (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Saved at {savedAt.toLocaleTimeString()}.</p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="of-btn of-btn-primary" disabled={!canSave} onClick={onSave}>
          {saving ? 'Saving…' : 'Save direction'}
        </button>
      </div>
    </section>
  );
}

// Helper exposed for the parent so the same name lookup can be
// reused (e.g. by the link-types table that renders the editor
// inline).
export function buildObjectTypeNameMap(types: ObjectType[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of types) map.set(t.id, t.display_name || t.name);
  return map;
}
