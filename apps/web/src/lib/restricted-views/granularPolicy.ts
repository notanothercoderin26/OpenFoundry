export type GranularPolicyLogic = 'and' | 'or';

export type GranularPolicyOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'in'
  | 'contains'
  | 'intersects';

export type GranularPolicyOperandKind =
  | 'user_attribute'
  | 'user_group_ids'
  | 'user_organization_id'
  | 'user_organization_ids'
  | 'user_id'
  | 'column'
  | 'constant'
  | 'constant_array';

export type GranularPolicyValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'uuid'
  | 'string_array'
  | 'number_array'
  | 'boolean_array'
  | 'uuid_array';

export interface GranularPolicyOperand {
  kind: GranularPolicyOperandKind;
  key?: string;
  column?: string;
  value_type?: GranularPolicyValueType;
  value?: string | number | boolean;
  values?: Array<string | number | boolean>;
}

export interface GranularPolicyComparison {
  id: string;
  type: 'comparison';
  left: GranularPolicyOperand;
  operator: GranularPolicyOperator;
  right: GranularPolicyOperand;
}

export interface GranularPolicyGroup {
  id: string;
  type: 'group';
  operator: GranularPolicyLogic;
  children: GranularPolicyExpression[];
}

export type GranularPolicyExpression = GranularPolicyComparison | GranularPolicyGroup;

export interface GranularPolicy {
  kind: 'granular_policy';
  version: 1;
  root: GranularPolicyGroup;
}

export const DEFAULT_GRANULAR_POLICY: GranularPolicy = {
  kind: 'granular_policy',
  version: 1,
  root: {
    id: 'root',
    type: 'group',
    operator: 'and',
    children: [
      {
        id: 'rule-1',
        type: 'comparison',
        left: { kind: 'column', column: 'organization_id' },
        operator: 'equals',
        right: { kind: 'user_organization_id' },
      },
    ],
  },
};

export function createPolicyRule(index: number): GranularPolicyComparison {
  return {
    id: `rule-${Date.now()}-${index}`,
    type: 'comparison',
    left: { kind: 'column', column: 'region' },
    operator: 'equals',
    right: { kind: 'user_attribute', key: 'region' },
  };
}

export function parseGranularPolicy(text: string): GranularPolicy {
  const parsed = JSON.parse(text || '{}') as unknown;
  return normalizeGranularPolicy(parsed);
}

export function normalizeGranularPolicy(value: unknown): GranularPolicy {
  if (isRecord(value) && value.kind === 'granular_policy' && isRecord(value.root)) {
    return {
      kind: 'granular_policy',
      version: 1,
      root: normalizeGroup(value.root, DEFAULT_GRANULAR_POLICY.root),
    };
  }
  if (isRecord(value) && Array.isArray(value.rules)) {
    return {
      kind: 'granular_policy',
      version: 1,
      root: {
        id: 'root',
        type: 'group',
        operator: value.operator === 'or' ? 'or' : 'and',
        children: value.rules.map((entry, index) => normalizeComparison(entry, index)),
      },
    };
  }
  return clonePolicy(DEFAULT_GRANULAR_POLICY);
}

export function formatGranularPolicy(policy: GranularPolicy): string {
  return JSON.stringify(policy, null, 2);
}

export function validateGranularPolicyText(text: string): string[] {
  try {
    return validateGranularPolicy(parseGranularPolicy(text));
  } catch (cause) {
    return [cause instanceof Error ? cause.message : 'Policy JSON is invalid'];
  }
}

export function validateGranularPolicy(policy: GranularPolicy): string[] {
  const errors: string[] = [];
  validateExpression(policy.root, errors, 'Policy');
  if (policy.root.children.length === 0) {
    errors.push('Policy must contain at least one rule.');
  }
  return errors;
}

export function policyRules(policy: GranularPolicy): GranularPolicyComparison[] {
  return policy.root.children.filter((entry): entry is GranularPolicyComparison => entry.type === 'comparison');
}

export function updatePolicyRule(policy: GranularPolicy, ruleID: string, nextRule: GranularPolicyComparison): GranularPolicy {
  return {
    ...policy,
    root: {
      ...policy.root,
      children: policy.root.children.map((entry) => entry.id === ruleID ? nextRule : entry),
    },
  };
}

export function removePolicyRule(policy: GranularPolicy, ruleID: string): GranularPolicy {
  return {
    ...policy,
    root: {
      ...policy.root,
      children: policy.root.children.filter((entry) => entry.id !== ruleID),
    },
  };
}

export function addPolicyRule(policy: GranularPolicy): GranularPolicy {
  return {
    ...policy,
    root: {
      ...policy.root,
      children: [...policy.root.children, createPolicyRule(policy.root.children.length + 1)],
    },
  };
}

export function setPolicyLogic(policy: GranularPolicy, operator: GranularPolicyLogic): GranularPolicy {
  return {
    ...policy,
    root: { ...policy.root, operator },
  };
}

export function operandNeedsKey(operand: GranularPolicyOperand) {
  return operand.kind === 'user_attribute';
}

export function operandNeedsColumn(operand: GranularPolicyOperand) {
  return operand.kind === 'column';
}

export function operandNeedsValue(operand: GranularPolicyOperand) {
  return operand.kind === 'constant' || operand.kind === 'constant_array';
}

export function operandDefaultValueType(kind: GranularPolicyOperandKind): GranularPolicyValueType | undefined {
  if (kind === 'constant_array') return 'string_array';
  if (kind === 'constant') return 'string';
  return undefined;
}

export function isArrayValueType(valueType: GranularPolicyValueType | undefined) {
  return valueType === 'string_array' ||
    valueType === 'number_array' ||
    valueType === 'boolean_array' ||
    valueType === 'uuid_array';
}

export function parseOperandValues(raw: string, valueType: GranularPolicyValueType | undefined): Array<string | number | boolean> {
  const parts = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  return parts.map((entry) => parseScalar(entry, arrayElementType(valueType)));
}

export function parseOperandValue(raw: string, valueType: GranularPolicyValueType | undefined): string | number | boolean {
  return parseScalar(raw.trim(), valueType);
}

export function operandValueText(operand: GranularPolicyOperand) {
  if (Array.isArray(operand.values)) return operand.values.join(', ');
  if (operand.value === undefined || operand.value === null) return '';
  return String(operand.value);
}

function validateExpression(expression: GranularPolicyExpression, errors: string[], path: string) {
  if (expression.type === 'group') {
    if (expression.operator !== 'and' && expression.operator !== 'or') {
      errors.push(`${path} must use AND or OR logic.`);
    }
    expression.children.forEach((child, index) => validateExpression(child, errors, `${path} rule ${index + 1}`));
    return;
  }
  validateOperand(expression.left, errors, `${path} left operand`);
  validateOperand(expression.right, errors, `${path} right operand`);
  validateIdentityComparison(expression, errors, path);
  if (!VALID_OPERATORS.has(expression.operator)) {
    errors.push(`${path} uses an unsupported comparison.`);
  }
}

function validateOperand(operand: GranularPolicyOperand, errors: string[], path: string) {
  if (operandNeedsKey(operand) && !operand.key?.trim()) {
    errors.push(`${path} requires an attribute key.`);
  }
  if (operandNeedsColumn(operand) && !operand.column?.trim()) {
    errors.push(`${path} requires a column name.`);
  }
  if (!operandNeedsValue(operand)) return;
  if (!operand.value_type) {
    errors.push(`${path} requires a value type.`);
    return;
  }
  if (isArrayValueType(operand.value_type)) {
    if (!Array.isArray(operand.values) || operand.values.length === 0) {
      errors.push(`${path} requires at least one array value.`);
      return;
    }
    if (operand.value_type === 'uuid_array') {
      operand.values.forEach((entry) => {
        if (typeof entry !== 'string' || !isUuid(entry)) {
          errors.push(`${path} must use stable UUID values.`);
        }
      });
    }
    return;
  }
  if (operand.value === undefined || operand.value === '') {
    errors.push(`${path} requires a value.`);
  }
  if (operand.value_type === 'uuid' && (typeof operand.value !== 'string' || !isUuid(operand.value))) {
    errors.push(`${path} must use a stable UUID value.`);
  }
}

function validateIdentityComparison(expression: GranularPolicyComparison, errors: string[], path: string) {
  const pairs: Array<[GranularPolicyOperand, GranularPolicyOperand]> = [
    [expression.left, expression.right],
    [expression.right, expression.left],
  ];
  for (const [identity, other] of pairs) {
    if (!isIdentityOperand(identity) || !operandNeedsValue(other)) continue;
    if (identity.kind === 'user_group_ids' || identity.kind === 'user_organization_ids') {
      if (other.value_type !== 'uuid_array') {
        errors.push(`${path} must compare ${identity.kind} with UUID array values.`);
      }
      continue;
    }
    if (other.value_type !== 'uuid') {
      errors.push(`${path} must compare ${identity.kind} with a UUID value.`);
    }
  }
}

function isIdentityOperand(operand: GranularPolicyOperand) {
  return operand.kind === 'user_group_ids' ||
    operand.kind === 'user_organization_id' ||
    operand.kind === 'user_organization_ids' ||
    operand.kind === 'user_id';
}

function normalizeGroup(value: Record<string, unknown>, fallback: GranularPolicyGroup): GranularPolicyGroup {
  const children = Array.isArray(value.children)
    ? value.children.map((entry, index) => normalizeExpression(entry, index))
    : fallback.children;
  return {
    id: typeof value.id === 'string' ? value.id : fallback.id,
    type: 'group',
    operator: value.operator === 'or' ? 'or' : 'and',
    children,
  };
}

function normalizeExpression(value: unknown, index: number): GranularPolicyExpression {
  if (isRecord(value) && value.type === 'group') {
    return normalizeGroup(value, { id: `group-${index + 1}`, type: 'group', operator: 'and', children: [] });
  }
  return normalizeComparison(value, index);
}

function normalizeComparison(value: unknown, index: number): GranularPolicyComparison {
  if (!isRecord(value)) {
    return createPolicyRule(index + 1);
  }
  return {
    id: typeof value.id === 'string' ? value.id : `rule-${index + 1}`,
    type: 'comparison',
    left: normalizeOperand(value.left ?? legacyLeftOperand(value)),
    operator: VALID_OPERATORS.has(value.operator as GranularPolicyOperator) ? value.operator as GranularPolicyOperator : 'equals',
    right: normalizeOperand(value.right ?? legacyRightOperand(value)),
  };
}

function normalizeOperand(value: unknown): GranularPolicyOperand {
  if (!isRecord(value)) return { kind: 'constant', value_type: 'string', value: '' };
  const kind = VALID_OPERANDS.has(value.kind as GranularPolicyOperandKind)
    ? value.kind as GranularPolicyOperandKind
    : 'constant';
  const valueType = VALID_VALUE_TYPES.has(value.value_type as GranularPolicyValueType)
    ? value.value_type as GranularPolicyValueType
    : operandDefaultValueType(kind);
  const operand: GranularPolicyOperand = { kind };
  if (typeof value.key === 'string') operand.key = value.key;
  if (typeof value.column === 'string') operand.column = value.column;
  if (valueType) operand.value_type = valueType;
  if (Array.isArray(value.values)) operand.values = value.values.filter(isScalar);
  if (isScalar(value.value)) operand.value = value.value;
  return operand;
}

function legacyLeftOperand(value: Record<string, unknown>) {
  if (typeof value.field === 'string') return { kind: 'column', column: value.field };
  return { kind: 'column', column: '' };
}

function legacyRightOperand(value: Record<string, unknown>) {
  if (typeof value.subject_attribute === 'string') {
    if (value.subject_attribute === 'org_id') return { kind: 'user_organization_id' };
    return { kind: 'user_attribute', key: value.subject_attribute };
  }
  if (Array.isArray(value.values)) return { kind: 'constant_array', value_type: 'string_array', values: value.values };
  if (value.value !== undefined) return { kind: 'constant', value_type: typeof value.value === 'number' ? 'number' : typeof value.value === 'boolean' ? 'boolean' : 'string', value: value.value };
  return { kind: 'constant', value_type: 'string', value: '' };
}

function parseScalar(raw: string, valueType: GranularPolicyValueType | undefined): string | number | boolean {
  switch (valueType) {
    case 'number':
    case 'number_array':
      return Number(raw);
    case 'boolean':
    case 'boolean_array':
      return raw === 'true';
    default:
      return raw;
  }
}

function arrayElementType(valueType: GranularPolicyValueType | undefined): GranularPolicyValueType | undefined {
  switch (valueType) {
    case 'number_array':
      return 'number';
    case 'boolean_array':
      return 'boolean';
    case 'uuid_array':
      return 'uuid';
    default:
      return 'string';
  }
}

function clonePolicy(policy: GranularPolicy): GranularPolicy {
  return JSON.parse(JSON.stringify(policy)) as GranularPolicy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

const VALID_OPERATORS = new Set<GranularPolicyOperator>([
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'in',
  'contains',
  'intersects',
]);

const VALID_OPERANDS = new Set<GranularPolicyOperandKind>([
  'user_attribute',
  'user_group_ids',
  'user_organization_id',
  'user_organization_ids',
  'user_id',
  'column',
  'constant',
  'constant_array',
]);

const VALID_VALUE_TYPES = new Set<GranularPolicyValueType>([
  'string',
  'number',
  'boolean',
  'uuid',
  'string_array',
  'number_array',
  'boolean_array',
  'uuid_array',
]);
