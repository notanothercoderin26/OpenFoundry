import { useMemo } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';
import type {
  SearchAroundFilter,
  SearchAroundFilterOp,
  SearchAroundParameter,
} from '@/lib/api/vertexSearchArounds';

const OPERATORS: { value: SearchAroundFilterOp; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'in', label: 'in' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'range', label: 'between' },
  { value: 'contains', label: 'contains' },
];

export interface PropertyOption {
  name: string;
  displayName: string;
}

interface FilterEditorProps {
  filter: SearchAroundFilter;
  properties: PropertyOption[];
  parameters: SearchAroundParameter[];
  onChange: (next: SearchAroundFilter) => void;
  onDelete: () => void;
}

// Single filter row inside one Search Around step. Lets the user
// pick a property, choose an operator, and supply either a literal
// value or a reference to a parameter defined elsewhere in the
// Search Around. Range/in operators show a small JSON hint instead
// of dedicated controls — keep it simple, the typical case is a
// single literal.
export function FilterEditor({ filter, properties, parameters, onChange, onDelete }: FilterEditorProps) {
  const isParam = Boolean(filter.parameter_ref);

  const literalText = useMemo(() => {
    if (filter.literal_json === undefined || filter.literal_json === null) return '';
    if (typeof filter.literal_json === 'string') return filter.literal_json;
    try {
      return JSON.stringify(filter.literal_json);
    } catch {
      return '';
    }
  }, [filter.literal_json]);

  function setLiteralFromText(raw: string) {
    // Try JSON-parse first so booleans / numbers / arrays come through
    // as native types; fall back to a plain string for free-form text.
    const trimmed = raw.trim();
    let literal: unknown = raw;
    if (trimmed.length > 0 && /^[\[\{\d"tfn-]/.test(trimmed)) {
      try {
        literal = JSON.parse(trimmed);
      } catch {
        literal = raw;
      }
    }
    onChange({ ...filter, literal_json: literal, parameter_ref: undefined });
  }

  return (
    <div
      className="of-panel"
      style={{
        padding: 8,
        display: 'grid',
        gridTemplateColumns: '1fr 80px 1fr auto',
        gap: 6,
        alignItems: 'center',
      }}
    >
      <select
        className="of-select"
        aria-label="Property"
        value={filter.property}
        onChange={(e) => onChange({ ...filter, property: e.target.value })}
      >
        <option value="">(property)</option>
        {properties.map((p) => (
          <option key={p.name} value={p.name}>
            {p.displayName}
          </option>
        ))}
      </select>

      <select
        className="of-select"
        aria-label="Operator"
        value={filter.op}
        onChange={(e) => onChange({ ...filter, op: e.target.value as SearchAroundFilterOp })}
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {isParam ? (
        <select
          className="of-select"
          aria-label="Parameter reference"
          value={filter.parameter_ref ?? ''}
          onChange={(e) => onChange({ ...filter, parameter_ref: e.target.value, literal_json: undefined })}
        >
          <option value="">(pick parameter)</option>
          {parameters.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.type})
            </option>
          ))}
        </select>
      ) : (
        <input
          className="of-input"
          aria-label="Literal value"
          placeholder={
            filter.op === 'in' || filter.op === 'range'
              ? '[1, 2] or ["a", "b"]'
              : filter.op === 'contains'
                ? 'substring'
                : 'value'
          }
          value={literalText}
          onChange={(e) => setLiteralFromText(e.target.value)}
        />
      )}

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          className="of-btn of-btn-ghost"
          title={isParam ? 'Switch to literal' : 'Switch to parameter'}
          onClick={() =>
            onChange(
              isParam
                ? { ...filter, parameter_ref: undefined, literal_json: '' }
                : { ...filter, parameter_ref: parameters[0]?.name ?? '', literal_json: undefined },
            )
          }
          style={{ minWidth: 28, padding: '0 6px' }}
        >
          <Glyph name={isParam ? 'tag' : 'code'} size={12} />
        </button>
        <button
          type="button"
          className="of-btn of-btn-ghost"
          title="Remove filter"
          onClick={onDelete}
          style={{ minWidth: 28, padding: '0 6px' }}
        >
          <Glyph name="x" size={12} />
        </button>
      </div>
    </div>
  );
}
