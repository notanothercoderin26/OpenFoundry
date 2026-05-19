import { useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import type { GlyphName } from '@/lib/components/ui/Glyph';
import type {
  SearchAroundParameter,
  SearchAroundParameterType,
} from '@/lib/api/vertexSearchArounds';

const TYPES: SearchAroundParameterType[] = ['string', 'number', 'boolean', 'date', 'timestamp'];

const TYPE_GLYPH: Record<SearchAroundParameterType, GlyphName> = {
  string: 'tag',
  number: 'asterisk',
  boolean: 'check',
  date: 'history',
  timestamp: 'history',
};

interface ParameterEditorProps {
  parameters: SearchAroundParameter[];
  onChange: (next: SearchAroundParameter[]) => void;
}

// Inline parameter management. Mirrors the right-side "(x) Parameters"
// panel from the Palantir docs: list of {Type, Name, Value, Edit},
// `Add parameter` dropdown that picks a type, and an `Edit Parameter`
// drawer with Name / Description / Default Value / Required.
//
// Parameter values are JSON-encoded so the same shape works for any
// type without per-type input widgets. Date/timestamp accept ISO
// strings (`"2018-01-01"`); booleans accept `true`/`false`; numbers
// accept any JSON number.
export function ParameterEditor({ parameters, onChange }: ParameterEditorProps) {
  const [hidden, setHidden] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addingType, setAddingType] = useState<SearchAroundParameterType | ''>('');

  function addParameter(type: SearchAroundParameterType) {
    const name = uniqueName(parameters, type);
    const next: SearchAroundParameter = {
      name,
      type,
      description: '',
      required: false,
    };
    onChange([...parameters, next]);
    setEditingIdx(parameters.length);
  }

  function patchParameter(idx: number, patch: Partial<SearchAroundParameter>) {
    const next = parameters.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  }

  function deleteParameter(idx: number) {
    onChange(parameters.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  }

  function setValueFromText(idx: number, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      patchParameter(idx, { default_value_json: undefined });
      return;
    }
    let value: unknown = raw;
    try {
      value = JSON.parse(trimmed);
    } catch {
      value = raw;
    }
    patchParameter(idx, { default_value_json: value });
  }

  return (
    <section
      className="of-panel"
      style={{ padding: 8, marginBottom: 8, background: 'var(--surface-subtle, #fafafa)' }}
    >
      <header
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hidden ? 0 : 6 }}
      >
        <Glyph name="code" size={12} />
        <strong style={{ fontSize: 12 }}>Parameters</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Define values reusable across filters
        </span>
        <button
          type="button"
          className="of-btn of-btn-ghost"
          style={{ marginLeft: 'auto', minHeight: 24, fontSize: 11, padding: '0 8px' }}
          onClick={() => setHidden((h) => !h)}
        >
          {hidden ? 'Show' : 'Hide'} parameters
        </button>
      </header>

      {!hidden && (
        <>
          {parameters.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
              No parameters yet.
            </div>
          )}

          <table style={{ width: '100%', fontSize: 11 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ width: 24 }}>Type</th>
                <th>Name</th>
                <th>Value</th>
                <th style={{ width: 40 }}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {parameters.map((p, i) => {
                const valueText = p.default_value_json === undefined
                  ? ''
                  : typeof p.default_value_json === 'string'
                    ? p.default_value_json
                    : JSON.stringify(p.default_value_json);
                return (
                  <tr key={p.name + '-' + i} style={{ borderTop: '1px solid var(--border-default)' }}>
                    <td title={p.type}>
                      <Glyph name={TYPE_GLYPH[p.type]} size={12} />
                    </td>
                    <td>
                      <strong>{p.name}</strong>
                      {p.required ? <span style={{ color: 'var(--accent-danger)' }}>*</span> : null}
                    </td>
                    <td>
                      <input
                        className="of-input"
                        aria-label={`${p.name} value`}
                        value={valueText}
                        placeholder={p.type === 'string' ? 'value' : '(json)'}
                        onChange={(e) => setValueFromText(i, e.target.value)}
                        style={{ width: '100%', fontSize: 11 }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="of-btn of-btn-ghost"
                        onClick={() => setEditingIdx(editingIdx === i ? null : i)}
                        style={{ minWidth: 24, padding: '0 4px' }}
                        title="Edit parameter"
                      >
                        <Glyph name="pencil" size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {editingIdx !== null && parameters[editingIdx] && (
            <EditDrawer
              parameter={parameters[editingIdx]}
              onSave={(patch) => {
                patchParameter(editingIdx, patch);
                setEditingIdx(null);
              }}
              onDelete={() => deleteParameter(editingIdx)}
              onCancel={() => setEditingIdx(null)}
            />
          )}

          <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              className="of-select"
              value={addingType}
              onChange={(e) => setAddingType(e.target.value as SearchAroundParameterType | '')}
              style={{ fontSize: 11 }}
            >
              <option value="">+ Add parameter…</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="of-btn"
              disabled={!addingType}
              onClick={() => {
                if (addingType) addParameter(addingType);
                setAddingType('');
              }}
            >
              Add
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function uniqueName(existing: SearchAroundParameter[], type: SearchAroundParameterType): string {
  const base = `${type[0]?.toUpperCase()}${type.slice(1)}Param`;
  let i = 1;
  let name = base;
  const taken = new Set(existing.map((p) => p.name));
  while (taken.has(name)) {
    i += 1;
    name = `${base}${i}`;
  }
  return name;
}

interface EditDrawerProps {
  parameter: SearchAroundParameter;
  onSave: (patch: Partial<SearchAroundParameter>) => void;
  onDelete: () => void;
  onCancel: () => void;
}

function EditDrawer({ parameter, onSave, onDelete, onCancel }: EditDrawerProps) {
  const [name, setName] = useState(parameter.name);
  const [description, setDescription] = useState(parameter.description);
  const [defaultText, setDefaultText] = useState(() => {
    if (parameter.default_value_json === undefined || parameter.default_value_json === null) return '';
    if (typeof parameter.default_value_json === 'string') return parameter.default_value_json;
    return JSON.stringify(parameter.default_value_json);
  });
  const [required, setRequired] = useState(parameter.required);

  function commit() {
    const trimmed = defaultText.trim();
    let parsedDefault: unknown;
    if (trimmed === '') {
      parsedDefault = undefined;
    } else {
      try {
        parsedDefault = JSON.parse(trimmed);
      } catch {
        parsedDefault = defaultText;
      }
    }
    onSave({
      name: name.trim() || parameter.name,
      description,
      default_value_json: parsedDefault,
      required,
    });
  }

  return (
    <div
      className="of-panel"
      style={{ marginTop: 8, padding: 10, background: '#fff', display: 'grid', gap: 6 }}
    >
      <strong style={{ fontSize: 12 }}>Edit parameter</strong>
      <label style={{ fontSize: 11 }}>
        Name
        <input className="of-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label style={{ fontSize: 11 }}>
        Description
        <input
          className="of-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label style={{ fontSize: 11 }}>
        Default Value
        <input
          className="of-input"
          value={defaultText}
          onChange={(e) => setDefaultText(e.target.value)}
          placeholder='e.g. "NY" or 5 or true'
        />
      </label>
      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        Required
      </label>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" className="of-btn of-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="of-btn of-btn-danger" onClick={onDelete}>
          Delete
        </button>
        <button type="button" className="of-btn of-btn-primary" onClick={commit}>
          Save
        </button>
      </div>
    </div>
  );
}
