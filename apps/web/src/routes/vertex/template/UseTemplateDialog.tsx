import { useEffect, useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import {
  instantiateGraphTemplate,
  type GraphTemplate,
  type GraphTemplateNonObjectParameter,
  type GraphTemplateObjectParameter,
  type InstantiateGraphTemplateResponse,
} from '@/lib/api/vertexTemplates';

export interface UseTemplateDialogProps {
  open: boolean;
  template: GraphTemplate | null;
  onClose: () => void;
  onInstantiated?: (resp: InstantiateGraphTemplateResponse) => void;
  // Optional URL preloads — when the route has ?objectRid= or
  // ?objectSetRid= we surface them as ready-to-use seed values for
  // the first object parameter so the dialog opens pre-populated.
  preloadObjectRid?: string | null;
  preloadObjectSetRid?: string | null;
}

interface FieldState {
  objectValues: Record<string, string>; // param id -> comma-separated rids
  nonObjectValues: Record<string, string>; // param id -> raw text
}

export function UseTemplateDialog(props: UseTemplateDialogProps) {
  const { open, template, onClose, onInstantiated, preloadObjectRid, preloadObjectSetRid } = props;
  const [state, setState] = useState<FieldState>({ objectValues: {}, nonObjectValues: {} });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / re-seed when the template (or preloads) change.
  useEffect(() => {
    if (!template) return;
    const obj: Record<string, string> = {};
    const nonObj: Record<string, string> = {};
    template.object_parameters.forEach((p, idx) => {
      // Preload the first object parameter from the URL params if
      // present — this matches the Vertex contract that
      // `?objectRid=` and `?objectSetRid=` are honoured at open time.
      if (idx === 0 && (preloadObjectRid || preloadObjectSetRid)) {
        obj[p.id] = preloadObjectRid ?? preloadObjectSetRid ?? '';
      } else {
        obj[p.id] = '';
      }
    });
    template.non_object_parameters.forEach((p) => {
      if (p.default_value !== undefined && p.default_value !== null) {
        nonObj[p.id] = String(p.default_value);
      } else {
        nonObj[p.id] = '';
      }
    });
    setState({ objectValues: obj, nonObjectValues: nonObj });
    setError(null);
  }, [template, preloadObjectRid, preloadObjectSetRid]);

  const missingRequired = useMemo(() => {
    if (!template) return [];
    const issues: string[] = [];
    for (const p of template.object_parameters) {
      if (p.required && !state.objectValues[p.id]?.trim()) {
        issues.push(p.name || p.id);
      }
    }
    for (const p of template.non_object_parameters) {
      if (p.required && !state.nonObjectValues[p.id]?.trim()) {
        issues.push(p.name || p.id);
      }
    }
    return issues;
  }, [template, state]);

  if (!open || !template) return null;

  const updateObject = (paramId: string, value: string) =>
    setState((prev) => ({ ...prev, objectValues: { ...prev.objectValues, [paramId]: value } }));

  const updateNonObject = (paramId: string, value: string) =>
    setState((prev) => ({ ...prev, nonObjectValues: { ...prev.nonObjectValues, [paramId]: value } }));

  const onSubmit = async () => {
    if (missingRequired.length > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const objectValues: Record<string, string[]> = {};
      for (const p of template.object_parameters) {
        const raw = state.objectValues[p.id]?.trim();
        if (!raw) continue;
        const ids = raw
          .split(/[\s,;]+/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (p.single_object && ids.length > 1) {
          throw new Error(`${p.name || p.id} expects a single object reference.`);
        }
        objectValues[p.id] = ids;
      }
      const nonObjectValues: Record<string, unknown> = {};
      for (const p of template.non_object_parameters) {
        const raw = state.nonObjectValues[p.id]?.trim();
        if (!raw) continue;
        nonObjectValues[p.id] = coerceScalar(raw, p.value_type);
      }
      const resp = await instantiateGraphTemplate(template.id, {
        object_parameter_values: objectValues,
        non_object_parameter_values: nonObjectValues,
      });
      onInstantiated?.(resp);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Use template ${template.title}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 95,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.98)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          borderRadius: 12,
          width: 'min(520px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            padding: 14,
            borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>Use template</p>
            <h2 className="of-heading-md" style={{ margin: '4px 0 0' }}>{template.title}</h2>
          </div>
          <button type="button" className="of-btn of-btn-ghost" onClick={onClose} aria-label="Close">
            <Glyph name="x" size={14} />
          </button>
        </header>

        <div style={{ padding: 14, overflowY: 'auto', display: 'grid', gap: 12 }}>
          {template.description && (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              {template.description}
            </p>
          )}

          {template.object_parameters.length === 0 && template.non_object_parameters.length === 0 ? (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
              This template takes no parameters. Press <em>Generate</em> to produce the graph.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {template.object_parameters.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Object inputs</p>
                  {template.object_parameters.map((p) => (
                    <ObjectField
                      key={p.id}
                      parameter={p}
                      value={state.objectValues[p.id] ?? ''}
                      onChange={(v) => updateObject(p.id, v)}
                    />
                  ))}
                </div>
              )}
              {template.non_object_parameters.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Other inputs</p>
                  {template.non_object_parameters.map((p) => (
                    <NonObjectField
                      key={p.id}
                      parameter={p}
                      value={state.nonObjectValues[p.id] ?? ''}
                      onChange={(v) => updateNonObject(p.id, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {missingRequired.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: '#facc15' }}>
              Missing: {missingRequired.join(', ')}.
            </p>
          )}

          {error && (
            <p style={{ margin: 0, fontSize: 12, color: '#fecaca' }}>{error}</p>
          )}
        </div>

        <footer
          style={{
            padding: 14,
            borderTop: '1px solid rgba(148, 163, 184, 0.15)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button type="button" className="of-btn of-btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="of-btn of-btn-primary"
            disabled={missingRequired.length > 0 || submitting}
            onClick={onSubmit}
          >
            {submitting ? 'Generating…' : 'Generate graph'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ObjectField({
  parameter,
  value,
  onChange,
}: {
  parameter: GraphTemplateObjectParameter;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13 }}>
        <strong>{parameter.name || parameter.id}</strong>
        {parameter.required && <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}{' '}
        <span className="of-text-muted">→ {parameter.object_type_id || 'no type'}</span>
      </span>
      {parameter.description && (
        <span className="of-text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
          {parameter.description}
        </span>
      )}
      <input
        className="of-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          parameter.single_object
            ? 'Object RID, e.g. ri.ontology.main.shipment.123'
            : 'One or more RIDs (comma- or space-separated)'
        }
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}
      />
    </label>
  );
}

function NonObjectField({
  parameter,
  value,
  onChange,
}: {
  parameter: GraphTemplateNonObjectParameter;
  value: string;
  onChange: (v: string) => void;
}) {
  if (parameter.value_type === 'boolean') {
    return (
      <label className="of-panel-muted" style={{ padding: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        />
        <span style={{ fontSize: 13 }}>
          <strong>{parameter.name || parameter.id}</strong>
          {parameter.required && <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}
        </span>
      </label>
    );
  }
  return (
    <label className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13 }}>
        <strong>{parameter.name || parameter.id}</strong>
        {parameter.required && <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}{' '}
        <span className="of-text-muted">({parameter.value_type})</span>
      </span>
      {parameter.description && (
        <span className="of-text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
          {parameter.description}
        </span>
      )}
      <input
        className="of-input"
        value={value}
        type={parameter.value_type === 'integer' || parameter.value_type === 'double' ? 'number' : 'text'}
        step={parameter.value_type === 'double' ? 'any' : undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${parameter.value_type}`}
      />
    </label>
  );
}

function coerceScalar(raw: string, type: string): unknown {
  switch (type) {
    case 'integer': {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new Error(`Expected an integer for this parameter.`);
      }
      return n;
    }
    case 'double': {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new Error(`Expected a number for this parameter.`);
      }
      return n;
    }
    case 'boolean':
      return raw === 'true';
    default:
      return raw;
  }
}
