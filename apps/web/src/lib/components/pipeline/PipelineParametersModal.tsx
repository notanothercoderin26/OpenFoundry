import { useEffect, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import type {
  PipelineParameter,
  PipelineParameterType,
} from '@/lib/api/pipelines';

const PARAMETER_TYPES: PipelineParameterType[] = ['string', 'integer', 'float', 'boolean'];

interface PipelineParametersModalProps {
  open: boolean;
  parameters: PipelineParameter[];
  onClose: () => void;
  onSave: (parameters: PipelineParameter[]) => Promise<void> | void;
  busy?: boolean;
}

interface DraftRow {
  key: string;
  name: string;
  type: PipelineParameterType;
  defaultValueText: string;
  description: string;
  required: boolean;
}

function rowFromParameter(parameter: PipelineParameter, index: number): DraftRow {
  return {
    key: `${parameter.name}-${index}`,
    name: parameter.name,
    type: parameter.type,
    defaultValueText: stringifyDefault(parameter.default_value, parameter.type),
    description: parameter.description ?? '',
    required: Boolean(parameter.required),
  };
}

function emptyRow(): DraftRow {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    type: 'string',
    defaultValueText: '',
    description: '',
    required: false,
  };
}

function stringifyDefault(value: unknown, type: PipelineParameterType): string {
  if (value === undefined || value === null) return '';
  if (type === 'boolean') return value === true ? 'true' : 'false';
  if (type === 'string') return typeof value === 'string' ? value : String(value);
  return String(value);
}

function parseDefault(value: string, type: PipelineParameterType): unknown {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  switch (type) {
    case 'integer': {
      if (!/^-?\d+$/.test(trimmed)) throw new Error(`Default for integer must be a whole number (got "${trimmed}")`);
      return Number(trimmed);
    }
    case 'float': {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) throw new Error(`Default for float must be a number (got "${trimmed}")`);
      return parsed;
    }
    case 'boolean': {
      const lower = trimmed.toLowerCase();
      if (lower === 'true') return true;
      if (lower === 'false') return false;
      throw new Error('Default for boolean must be "true" or "false"');
    }
    default:
      return trimmed;
  }
}

function validRowName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function PipelineParametersModal({
  open,
  parameters,
  onClose,
  onSave,
  busy,
}: PipelineParametersModalProps) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows(parameters.map(rowFromParameter));
    setError('');
  }, [open, parameters]);

  if (!open) return null;

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()]);
  }

  async function handleSave() {
    setError('');
    const out: PipelineParameter[] = [];
    const names = new Set<string>();
    for (const row of rows) {
      const name = row.name.trim();
      if (!name) {
        setError('Every parameter needs a name.');
        return;
      }
      if (!validRowName(name)) {
        setError(`Parameter "${name}" must match [A-Za-z_][A-Za-z0-9_]*.`);
        return;
      }
      if (names.has(name)) {
        setError(`Parameter "${name}" is defined twice.`);
        return;
      }
      names.add(name);
      let defaultValue: unknown;
      try {
        defaultValue = parseDefault(row.defaultValueText, row.type);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Invalid default value');
        return;
      }
      if (row.required && defaultValue === undefined) {
        setError(`Parameter "${name}" is required but has no default value.`);
        return;
      }
      out.push({
        name,
        type: row.type,
        default_value: defaultValue,
        description: row.description.trim() || undefined,
        required: row.required || undefined,
      });
    }
    try {
      await onSave(out);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    }
  }

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.32)', zIndex: 70 }}
      />
      <div
        role="dialog"
        aria-label="Pipeline parameters"
        style={{
          position: 'fixed',
          top: '8vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(720px, 92vw)',
          maxHeight: '84vh',
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.24)',
          zIndex: 71,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <strong style={{ fontSize: 14 }}>Parameters</strong>
          <span className="of-text-muted" style={{ fontSize: 12 }}>
            Define reusable values; reference them inside transforms via{' '}
            <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>{'${params.NAME}'}</code>.
          </span>
          <button type="button" className="of-button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', padding: '2px 6px' }}>
            <Glyph name="x" size={12} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gap: 10 }}>
          {rows.length === 0 ? (
            <p className="of-text-muted" style={{ fontSize: 13 }}>
              No parameters yet. Add one to start parameterizing your transforms.
            </p>
          ) : (
            rows.map((row) => (
              <ParameterRow
                key={row.key}
                row={row}
                onChange={(patch) => updateRow(row.key, patch)}
                onRemove={() => removeRow(row.key)}
              />
            ))
          )}
          <button type="button" className="of-button" onClick={addRow} style={{ alignSelf: 'flex-start', fontSize: 12 }}>
            <Glyph name="plus" size={12} /> Add parameter
          </button>
        </div>

        <footer
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {error ? (
            <span className="of-status-danger" style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4 }}>
              {error}
            </span>
          ) : (
            <span className="of-text-muted" style={{ fontSize: 11 }}>{rows.length} parameter{rows.length === 1 ? '' : 's'}</span>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="of-button" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="of-button of-button--primary"
              onClick={() => void handleSave()}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}

interface ParameterRowProps {
  row: DraftRow;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
}

function ParameterRow({ row, onChange, onRemove }: ParameterRowProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 1fr auto',
        gap: 8,
        alignItems: 'start',
        padding: 10,
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
      }}
    >
      <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
        Name
        <input
          value={row.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="region"
          className="of-input"
          style={{ fontSize: 12 }}
        />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
        Type
        <select
          value={row.type}
          onChange={(event) => onChange({ type: event.target.value as PipelineParameterType })}
          className="of-select"
          style={{ fontSize: 12 }}
        >
          {PARAMETER_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
        Default value
        <input
          value={row.defaultValueText}
          onChange={(event) => onChange({ defaultValueText: event.target.value })}
          placeholder={row.type === 'boolean' ? 'true / false' : row.type === 'string' ? 'value' : '0'}
          className="of-input"
          style={{ fontSize: 12 }}
        />
      </label>
      <button
        type="button"
        className="of-button"
        onClick={onRemove}
        aria-label={`Remove ${row.name || 'parameter'}`}
        style={{ alignSelf: 'end', fontSize: 11, color: '#b91c1c', height: 28 }}
      >
        Remove
      </button>
      <label style={{ gridColumn: '1 / 4', display: 'grid', gap: 4, fontSize: 11 }}>
        Description (optional)
        <input
          value={row.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Free-text hint shown to pipeline authors"
          className="of-input"
          style={{ fontSize: 12 }}
        />
      </label>
      <label style={{ gridColumn: '4', alignSelf: 'end', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <input
          type="checkbox"
          checked={row.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        />
        required
      </label>
    </div>
  );
}
