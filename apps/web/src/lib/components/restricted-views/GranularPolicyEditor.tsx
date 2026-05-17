import {
  addPolicyRule,
  formatGranularPolicy,
  isArrayValueType,
  normalizeGranularPolicy,
  operandDefaultValueType,
  operandNeedsColumn,
  operandNeedsKey,
  operandNeedsValue,
  operandValueText,
  parseGranularPolicy,
  parseOperandValue,
  parseOperandValues,
  policyRules,
  removePolicyRule,
  setPolicyLogic,
  updatePolicyRule,
  validateGranularPolicy,
  type GranularPolicy,
  type GranularPolicyComparison,
  type GranularPolicyOperand,
  type GranularPolicyOperandKind,
  type GranularPolicyOperator,
  type GranularPolicyValueType,
} from '@/lib/restricted-views/granularPolicy';
import { Glyph } from '@/lib/components/ui/Glyph';

interface GranularPolicyEditorProps {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}

const OPERAND_OPTIONS: Array<{ value: GranularPolicyOperandKind; label: string }> = [
  { value: 'column', label: 'Column' },
  { value: 'user_attribute', label: 'User attribute' },
  { value: 'user_group_ids', label: 'User groups' },
  { value: 'user_organization_id', label: 'User organization' },
  { value: 'user_organization_ids', label: 'User organizations' },
  { value: 'user_id', label: 'User ID' },
  { value: 'constant', label: 'Constant' },
  { value: 'constant_array', label: 'Array' },
];

const OPERATOR_OPTIONS: Array<{ value: GranularPolicyOperator; label: string }> = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '!=' },
  { value: 'greater_than', label: '>' },
  { value: 'greater_than_or_equal', label: '>=' },
  { value: 'less_than', label: '<' },
  { value: 'less_than_or_equal', label: '<=' },
  { value: 'in', label: 'in' },
  { value: 'contains', label: 'contains' },
  { value: 'intersects', label: 'intersects' },
];

const VALUE_TYPE_OPTIONS: Array<{ value: GranularPolicyValueType; label: string }> = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'uuid', label: 'UUID' },
  { value: 'string_array', label: 'String[]' },
  { value: 'number_array', label: 'Number[]' },
  { value: 'boolean_array', label: 'Boolean[]' },
  { value: 'uuid_array', label: 'UUID[]' },
];

export function GranularPolicyEditor({ value, disabled, onChange }: GranularPolicyEditorProps) {
  const parsed = safePolicy(value);
  const rules = policyRules(parsed.policy);

  function emit(policy: GranularPolicy) {
    onChange(formatGranularPolicy(policy));
  }

  function emitRule(ruleID: string, nextRule: GranularPolicyComparison) {
    emit(updatePolicyRule(parsed.policy, ruleID, nextRule));
  }

  return (
    <section className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Granular policy</p>
          <h3 className="of-heading-md" style={{ marginTop: 4 }}>Rules</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="of-input"
            value={parsed.policy.root.operator}
            disabled={disabled}
            onChange={(event) => emit(setPolicyLogic(parsed.policy, event.target.value === 'or' ? 'or' : 'and'))}
            style={{ minWidth: 110 }}
          >
            <option value="and">AND</option>
            <option value="or">OR</option>
          </select>
          <button
            type="button"
            className="of-button"
            disabled={disabled}
            onClick={() => emit(addPolicyRule(parsed.policy))}
          >
            <Glyph name="plus" size={14} /> Rule
          </button>
        </div>
      </div>

      {parsed.parseError && (
        <div className="of-status-warning" style={{ padding: 10, borderRadius: 8, fontSize: 13 }}>
          {parsed.parseError}
        </div>
      )}
      {parsed.validationErrors.length > 0 && (
        <div className="of-status-danger" style={{ padding: 10, borderRadius: 8, fontSize: 13, display: 'grid', gap: 4 }}>
          {parsed.validationErrors.slice(0, 4).map((entry) => <span key={entry}>{entry}</span>)}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {rules.map((rule, index) => (
          <div
            key={rule.id}
            style={{
              display: 'grid',
              gap: 8,
              padding: 10,
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              background: 'var(--surface-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span className="of-chip">Rule {index + 1}</span>
              <button
                type="button"
                className="of-button of-btn-danger"
                disabled={disabled || rules.length <= 1}
                onClick={() => emit(removePolicyRule(parsed.policy, rule.id))}
                title="Remove rule"
                style={{ minHeight: 28, padding: '0 8px' }}
              >
                <Glyph name="trash" size={14} />
              </button>
            </div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <OperandEditor
                operand={rule.left}
                disabled={disabled}
                onChange={(left) => emitRule(rule.id, { ...rule, left })}
              />
              <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>Compare</span>
                <select
                  className="of-input"
                  value={rule.operator}
                  disabled={disabled}
                  onChange={(event) => emitRule(rule.id, { ...rule, operator: event.target.value as GranularPolicyOperator })}
                >
                  {OPERATOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <OperandEditor
                operand={rule.right}
                disabled={disabled}
                onChange={(right) => emitRule(rule.id, { ...rule, right })}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OperandEditor(props: {
  operand: GranularPolicyOperand;
  disabled: boolean;
  onChange: (next: GranularPolicyOperand) => void;
}) {
  const { operand, disabled, onChange } = props;
  const valueType = operand.value_type ?? operandDefaultValueType(operand.kind);

  function changeKind(kind: GranularPolicyOperandKind) {
    const next: GranularPolicyOperand = { kind };
    if (kind === 'user_attribute') next.key = operand.key ?? 'department';
    if (kind === 'column') next.column = operand.column ?? 'department';
    if (kind === 'constant' || kind === 'constant_array') {
      next.value_type = operandDefaultValueType(kind);
      if (kind === 'constant_array') next.values = [];
      else next.value = '';
    }
    onChange(next);
  }

  function changeValueType(nextType: GranularPolicyValueType) {
    if (isArrayValueType(nextType)) {
      onChange({ ...operand, kind: 'constant_array', value_type: nextType, values: parseOperandValues(operandValueText(operand), nextType), value: undefined });
    } else {
      onChange({ ...operand, kind: 'constant', value_type: nextType, value: parseOperandValue(operandValueText(operand), nextType), values: undefined });
    }
  }

  function changeValue(raw: string) {
    if (isArrayValueType(valueType)) {
      onChange({ ...operand, values: parseOperandValues(raw, valueType), value: undefined });
      return;
    }
    onChange({ ...operand, value: parseOperandValue(raw, valueType), values: undefined });
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>Operand</span>
        <select
          className="of-input"
          value={operand.kind}
          disabled={disabled}
          onChange={(event) => changeKind(event.target.value as GranularPolicyOperandKind)}
        >
          {OPERAND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {operandNeedsKey(operand) && (
        <input
          className="of-input"
          value={operand.key ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ ...operand, key: event.target.value })}
          placeholder="attribute key"
        />
      )}
      {operandNeedsColumn(operand) && (
        <input
          className="of-input"
          value={operand.column ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ ...operand, column: event.target.value })}
          placeholder="column name"
        />
      )}
      {operandNeedsValue(operand) && (
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: '120px 1fr' }}>
          <select
            className="of-input"
            value={valueType ?? 'string'}
            disabled={disabled}
            onChange={(event) => changeValueType(event.target.value as GranularPolicyValueType)}
          >
            {VALUE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input
            className="of-input"
            value={operandValueText(operand)}
            disabled={disabled}
            onChange={(event) => changeValue(event.target.value)}
            placeholder={isArrayValueType(valueType) ? 'comma separated' : 'value'}
          />
        </div>
      )}
    </div>
  );
}

function safePolicy(value: string): {
  policy: GranularPolicy;
  parseError: string;
  validationErrors: string[];
} {
  try {
    const policy = parseGranularPolicy(value);
    return { policy, parseError: '', validationErrors: validateGranularPolicy(policy) };
  } catch (cause) {
    const policy = normalizeGranularPolicy({});
    return {
      policy,
      parseError: cause instanceof Error ? cause.message : 'Policy JSON is invalid',
      validationErrors: validateGranularPolicy(policy),
    };
  }
}
