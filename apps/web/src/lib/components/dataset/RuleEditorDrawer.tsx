import { useEffect, useMemo, useState } from 'react';

import { Drawer } from '@/lib/components/ui/Drawer';
import type {
  CreateDatasetQualityRuleParams,
  DatasetQualityRule,
  UpdateDatasetQualityRuleParams,
} from '@/lib/api/datasets';

type RuleEditorPayload = CreateDatasetQualityRuleParams | UpdateDatasetQualityRuleParams;

interface RuleEditorDrawerProps {
  open: boolean;
  rule: DatasetQualityRule | null;
  columns: string[];
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: RuleEditorPayload) => Promise<void> | void;
}

const RULE_TYPES = [
  { value: 'not_null', label: 'Not null', config: { column: 'id' } },
  { value: 'unique', label: 'Unique', config: { column: 'id' } },
  { value: 'range', label: 'Range', config: { column: 'amount', min: 0, max: 100 } },
  { value: 'regex', label: 'Regex', config: { column: 'email', pattern: '^[^@]+@[^@]+$' } },
  { value: 'accepted_values', label: 'Accepted values', config: { column: 'status', values: ['active', 'inactive'] } },
  { value: 'row_count_min', label: 'Minimum rows', config: { min_rows: 1 } },
  { value: 'custom', label: 'Custom', config: {} },
] as const;

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export function RuleEditorDrawer({
  open,
  rule,
  columns,
  saving = false,
  onClose,
  onSave,
}: RuleEditorDrawerProps) {
  const isEditing = Boolean(rule);
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState<string>(RULE_TYPES[0].value);
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('medium');
  const [enabled, setEnabled] = useState(true);
  const [configText, setConfigText] = useState('{}');
  const [localError, setLocalError] = useState('');

  const title = isEditing ? 'Edit quality rule' : 'New quality rule';
  const datalistId = useMemo(() => `quality-rule-columns-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? '');
    setRuleType(rule?.rule_type ?? RULE_TYPES[0].value);
    setSeverity(normalizeSeverity(rule?.severity));
    setEnabled(rule?.enabled ?? true);
    setConfigText(JSON.stringify(rule?.config ?? defaultConfig(RULE_TYPES[0].value, columns), null, 2));
    setLocalError('');
  }, [columns, open, rule]);

  function useTemplate(nextType: string) {
    setRuleType(nextType);
    if (!isEditing) {
      setConfigText(JSON.stringify(defaultConfig(nextType, columns), null, 2));
    }
  }

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setLocalError('Name is required.');
      return;
    }

    let config: Record<string, unknown>;
    try {
      const parsed = JSON.parse(configText || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setLocalError('Config must be a JSON object.');
        return;
      }
      config = parsed as Record<string, unknown>;
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Invalid JSON config.');
      return;
    }

    setLocalError('');
    try {
      if (isEditing) {
        await onSave({ name: trimmedName, severity, enabled, config });
        return;
      }
      await onSave({ name: trimmedName, rule_type: ruleType, severity, enabled, config });
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Quality rule save failed.');
    }
  }

  return (
    <Drawer open={open} title={title} width="520px" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        style={{ display: 'grid', gap: 12 }}
      >
        {localError && (
          <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            {localError}
          </div>
        )}

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="of-input"
            placeholder="non-null primary key"
          />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Rule type
          <select
            value={ruleType}
            onChange={(event) => useTemplate(event.target.value)}
            disabled={isEditing}
            className="of-input"
          >
            {RULE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {columns.length > 0 && (
          <>
            <datalist id={datalistId}>
              {columns.map((column) => <option key={column} value={column} />)}
            </datalist>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>
              Column names are available for copy/paste into the JSON config.
            </p>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Severity
            <select value={severity} onChange={(event) => setSeverity(normalizeSeverity(event.target.value))} className="of-input">
              {SEVERITIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 30, fontSize: 12 }}>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Enabled
          </label>
        </div>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Config JSON
          <textarea
            value={configText}
            onChange={(event) => setConfigText(event.target.value)}
            rows={12}
            className="of-input"
            spellCheck={false}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
          />
        </label>

        {columns.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {columns.slice(0, 8).map((column) => (
              <button
                type="button"
                key={column}
                className="of-button"
                onClick={() => setConfigText((current) => insertColumn(current, column))}
                style={{ fontSize: 11 }}
              >
                {column}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6 }}>
          <button type="button" onClick={onClose} className="of-button" disabled={saving}>Cancel</button>
          <button type="submit" className="of-button of-button--primary" disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Save rule' : 'Create rule'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

function normalizeSeverity(value: string | undefined): (typeof SEVERITIES)[number] {
  return SEVERITIES.includes(value as (typeof SEVERITIES)[number])
    ? (value as (typeof SEVERITIES)[number])
    : 'medium';
}

function defaultConfig(type: string, columns: string[]): Record<string, unknown> {
  const fallbackColumn = columns[0] ?? 'id';
  const option = RULE_TYPES.find((entry) => entry.value === type);
  const config = structuredClone(option?.config ?? {}) as Record<string, unknown>;
  if (typeof config.column === 'string') {
    config.column = fallbackColumn;
  }
  return config;
}

function insertColumn(current: string, column: string) {
  try {
    const parsed = JSON.parse(current || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return current;
    return JSON.stringify({ ...parsed, column }, null, 2);
  } catch {
    return current;
  }
}
