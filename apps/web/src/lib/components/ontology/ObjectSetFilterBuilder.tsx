import type { ObjectSetFilter } from '@/lib/api/ontology';

export interface ObjectSetFilterFieldOption {
  value: string;
  label: string;
  type?: string;
}

interface ObjectSetFilterBuilderProps {
  filters: ObjectSetFilter[];
  onChange: (next: ObjectSetFilter[]) => void;
  fields?: ObjectSetFilterFieldOption[];
  disabled?: boolean;
}

const OPERATORS: Array<{ value: string; label: string; placeholder: string }> = [
  { value: 'equals', label: 'equals', placeholder: 'string, number, boolean, or JSON' },
  { value: 'not_equals', label: 'not equals', placeholder: 'string, number, boolean, or JSON' },
  { value: 'contains', label: 'contains', placeholder: 'substring or JSON value' },
  { value: 'in', label: 'in', placeholder: 'JSON array or comma-separated values' },
  { value: 'exists', label: 'exists', placeholder: 'true or false' },
  { value: 'gte', label: '>=', placeholder: 'number, timestamp, or string' },
  { value: 'lte', label: '<=', placeholder: 'number, timestamp, or string' },
];

function parseScalar(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

function valueToText(operator: string, value: unknown): string {
  if (operator === 'exists') return value === false ? 'false' : 'true';
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function textToValue(operator: string, text: string): unknown {
  const trimmed = text.trim();
  if (operator === 'exists') return trimmed.toLowerCase() !== 'false';
  if (operator === 'in') {
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return text
        .split(',')
        .map((part) => parseScalar(part))
        .filter((part) => part !== '');
    }
  }
  return parseScalar(text);
}

function valueForOperator(operator: string, current: unknown): unknown {
  if (operator === 'exists') return typeof current === 'boolean' ? current : true;
  if (operator === 'in') {
    if (Array.isArray(current)) return current;
    if (current === null || current === undefined || current === '') return [];
    return [current];
  }
  return current ?? '';
}

function operatorPlaceholder(operator: string) {
  return OPERATORS.find((entry) => entry.value === operator)?.placeholder ?? 'value';
}

function defaultField(fields: ObjectSetFilterFieldOption[] | undefined) {
  return fields?.[0]?.value ?? 'status';
}

function defaultFilter(fields: ObjectSetFilterFieldOption[] | undefined): ObjectSetFilter {
  return { field: defaultField(fields), operator: 'equals', value: 'active' };
}

function booleanText(value: unknown) {
  return value === false ? 'false' : 'true';
}

export function ObjectSetFilterBuilder({ filters, onChange, fields, disabled }: ObjectSetFilterBuilderProps) {
  function patch(index: number, patchValue: Partial<ObjectSetFilter>) {
    onChange(filters.map((filter, i) => (i === index ? { ...filter, ...patchValue } : filter)));
  }

  function changeOperator(index: number, operator: string) {
    const current = filters[index];
    if (!current) return;
    patch(index, { operator, value: valueForOperator(operator, current.value) });
  }

  function add() {
    onChange([...filters, defaultFilter(fields)]);
  }

  function remove(index: number) {
    onChange(filters.filter((_, i) => i !== index));
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <p className="of-eyebrow">Filters ({filters.length})</p>
        <button type="button" onClick={add} disabled={disabled} className="of-button" style={{ fontSize: 11 }}>
          Add filter
        </button>
      </div>
      {fields && fields.length > 0 && (
        <datalist id="object-set-filter-fields">
          {fields.map((field) => (
            <option key={field.value} value={field.value}>
              {field.type ? `${field.label} (${field.type})` : field.label}
            </option>
          ))}
        </datalist>
      )}
      {filters.length === 0 ? (
        <p className="of-text-muted" style={{ fontSize: 12, fontStyle: 'italic', margin: 0 }}>No filters.</p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6, margin: 0 }}>
          {filters.map((filter, index) => (
            <li
              key={index}
              style={{
                display: 'grid',
                gap: 6,
                gridTemplateColumns: 'minmax(150px, 1.2fr) minmax(122px, 0.75fr) minmax(150px, 1fr) auto',
                alignItems: 'center',
                padding: 8,
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 3,
              }}
            >
              <input
                value={filter.field}
                onChange={(event) => patch(index, { field: event.target.value })}
                placeholder="field path"
                list={fields && fields.length > 0 ? 'object-set-filter-fields' : undefined}
                disabled={disabled}
                className="of-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
              <select
                value={filter.operator}
                onChange={(event) => changeOperator(index, event.target.value)}
                disabled={disabled}
                className="of-input"
                style={{ fontSize: 11 }}
              >
                {OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>{operator.label}</option>
                ))}
                {!OPERATORS.some((operator) => operator.value === filter.operator) && (
                  <option value={filter.operator}>{filter.operator}</option>
                )}
              </select>
              {filter.operator === 'exists' ? (
                <select
                  value={booleanText(filter.value)}
                  onChange={(event) => patch(index, { value: event.target.value === 'true' })}
                  disabled={disabled}
                  className="of-input"
                  style={{ fontSize: 11 }}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  value={valueToText(filter.operator, filter.value)}
                  onChange={(event) => patch(index, { value: textToValue(filter.operator, event.target.value) })}
                  placeholder={operatorPlaceholder(filter.operator)}
                  disabled={disabled}
                  className="of-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                />
              )}
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={disabled}
                className="of-button"
                style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
