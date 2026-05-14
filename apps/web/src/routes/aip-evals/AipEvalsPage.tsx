import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type {
  EvaluationEvaluator,
  EvaluationSuiteColumn,
  EvaluationSuiteSourceSurface,
  EvaluationTestCase,
  EvaluationTargetFunction,
  EvaluationTargetFunctionKind,
} from '@/lib/api/evals';
import { Glyph } from '@/lib/components/ui/Glyph';
import {
  BUILT_IN_EVALUATOR_OPTIONS,
  builtInEvaluatorOption,
  customEvaluatorDebugDefinitions,
  customEvaluatorFunctionKind,
  customEvaluatorFunctionRid,
  customEvaluatorMetricDefinitions,
  defaultEvaluationTargetVersion,
  estimateEvaluationRunComputeUsage,
  evaluateEvaluationSuiteBuiltIns,
  buildEvaluationDebugView,
  buildEvaluationExperimentPlan,
  buildEvaluationMetricsDashboard,
  buildEvaluationResultsAnalyzer,
  buildEvaluationResultsTable,
  compareEvaluationRuns,
  createEvalScheduleConfig,
  evaluateLogicPublishGate,
  evaluatePromptSuggestionEvidence,
  evaluationRunMultiTargetCapabilities,
  runEvaluationExperiment,
  evaluationTargetVersionOptions,
  evaluatorDisplayName,
  isCustomEvaluationFunction,
  monitorEvaluationScheduleRun,
  nextEvalScheduleRunAt,
  recordLogicPublishGateWaiver,
  runEvaluationSuiteBuiltIns,
  trackPromptSuggestionApplication,
  validateCustomEvaluationFunction,
  type BuiltInEvaluationSummary,
  type BuiltInEvaluationRunResult,
  type BuiltInEvaluatorName,
  type EvaluationExperimentConfig,
  type EvaluationExperimentDimension,
  type EvaluationExperimentResults,
  type EvaluationMetricsDashboardFilters,
  type EvalScheduleAlert,
  type EvalScheduleCadence,
  type EvalScheduleConfig,
  type EvalScheduleRunOutcome,
  type EvaluationResultsAnalyzerCategory,
  type EvaluationResultsAnalyzerConfig,
  type LogicPublishGateRequirement,
  type LogicPublishGateSurface,
  type LogicPublishGateWaiver,
  type PromptSuggestionApplication,
} from '@/lib/evals/builtins';
import {
  recomputeObjectSetBackedTestCases,
  validateObjectSetColumnMappings,
  type EvaluationObjectSetBacking,
  type EvaluationObjectSetRow,
} from '@/lib/evals/objectSets';
import {
  DEFAULT_INSTALLED_MARKETPLACE_EVALUATOR_SLUGS,
  buildMarketplaceEvaluationFunction,
  installMarketplaceEvaluatorSlug,
  listMarketplaceEvaluatorProducts,
  marketplaceEvaluatorProductBySlug,
  marketplaceEvaluatorSetupPlan,
  type MarketplaceEvaluatorCatalogEntry,
  type MarketplaceEvaluatorProduct,
  type MarketplaceEvaluatorSlug,
} from '@/lib/evals/marketplaceEvaluators';
import type { LogicComputeUsageSummary } from '@/lib/logic/blocks';

interface LocalEvaluationSuite {
  id: string;
  name: string;
  description: string;
  projectId: string;
  folderId: string;
  ownerId: string;
  targetFunctions: EvaluationTargetFunction[];
  testCaseColumns: EvaluationSuiteColumn[];
  testCases: EvaluationTestCase[];
  objectSetBackings: EvaluationObjectSetBacking[];
  evaluators: EvaluationEvaluator[];
  runHistory: BuiltInEvaluationRunResult[];
  resultsDatasetRid: string;
  permissions: Record<string, string[]>;
  sourceSurface: EvaluationSuiteSourceSurface;
  sourceResourceId?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const DEMO_PROJECT_ID = '00000000-0000-0000-0000-00000000e017';
const DEMO_FOLDER_ID = '00000000-0000-0000-0000-00000000e107';
const MOVED_FOLDER_ID = '00000000-0000-0000-0000-00000000e108';
const CURRENT_USER_ID = 'casey-author';

const SOURCE_LABELS: Record<EvaluationSuiteSourceSurface, string> = {
  logic_preview: 'Logic preview',
  evals_sidebar: 'Evals sidebar',
  aip_evals_app: 'AIP Evals app',
  code_function_published: 'Published code function',
  api: 'API',
};

const TARGET_KIND_LABELS: Record<EvaluationTargetFunctionKind, string> = {
  logic: 'AIP Logic',
  agent_like: 'Agent-like',
  code_function: 'Code-authored',
};

const COLUMN_TYPES = ['string', 'integer', 'double', 'boolean', 'json', 'object', 'object_list', 'object_set', 'ontology_edit_bundle', 'date', 'timestamp'] as const;

const COLUMN_ROLE_LABELS: Record<string, string> = {
  input: 'Input',
  expected_output: 'Expected output',
  intermediate_parameter: 'Intermediate parameter',
  metadata: 'Metadata',
};

type CustomEvaluatorFunctionKind = 'typescript' | 'python' | 'logic';

const CUSTOM_EVALUATOR_KIND_OPTIONS: Array<{ value: CustomEvaluatorFunctionKind; label: string; rid: string }> = [
  { value: 'typescript', label: 'TypeScript function', rid: 'fn.eval-response-quality.ts' },
  { value: 'python', label: 'Python function', rid: 'fn.eval_response_quality.py' },
  { value: 'logic', label: 'Logic function', rid: 'logic.eval-response-quality' },
];

const OBJECT_SET_CASE_COLUMNS: EvaluationSuiteColumn[] = [
  { id: 'metadata-customer-object', name: 'Customer object', apiName: 'customerObject', type: 'object', role: 'metadata' },
  { id: 'metadata-customer-tier', name: 'Customer tier', apiName: 'customerTier', type: 'string', role: 'metadata' },
  { id: 'metadata-account-owner', name: 'Account owner', apiName: 'accountOwner', type: 'object', role: 'metadata' },
  { id: 'metadata-related-orders', name: 'Related orders', apiName: 'relatedOrders', type: 'object_set', role: 'metadata' },
  { id: 'metadata-owner-region', name: 'Owner region', apiName: 'ownerRegion', type: 'string', role: 'metadata' },
  { id: 'metadata-source-kind', name: 'Source kind', apiName: 'sourceKind', type: 'string', role: 'metadata' },
];

const DEMO_OBJECT_SET_ROWS: Record<string, EvaluationObjectSetRow[]> = {
  'object-set-open-customers': [
    {
      id: 'customer-4421',
      object_type_id: 'Customer',
      properties: {
        name: 'Acme Logistics',
        tier: 'Gold',
        complaintText: 'Shipment 4421 missed SLA and the customer asks for escalation.',
      },
      links: {
        accountOwner: { id: 'employee-avery', object_type_id: 'Employee', properties: { name: 'Avery', region: 'EMEA' } },
        relatedOrders: [
          { id: 'order-4421', object_type_id: 'Order', properties: { orderId: '4421', status: 'late' } },
          { id: 'order-4422', object_type_id: 'Order', properties: { orderId: '4422', status: 'recovering' } },
        ],
        expectedResolution: { id: 'resolution-escalate', object_type_id: 'Resolution', properties: { summary: 'Escalate with service recovery follow-up.' } },
      },
    },
    {
      id: 'customer-4428',
      object_type_id: 'Customer',
      properties: {
        name: 'Northwind Freight',
        tier: 'Silver',
        complaintText: 'Customer confirms the delivery issue is resolved and thanks the team.',
      },
      links: {
        accountOwner: { id: 'employee-morgan', object_type_id: 'Employee', properties: { name: 'Morgan', region: 'NA' } },
        relatedOrders: [{ id: 'order-4428', object_type_id: 'Order', properties: { orderId: '4428', status: 'closed' } }],
        expectedResolution: { id: 'resolution-close', object_type_id: 'Resolution', properties: { summary: 'Close without escalation' } },
      },
    },
  ],
  'object-set-vip-renewals': [
    {
      id: 'customer-9001',
      object_type_id: 'Customer',
      properties: {
        name: 'Contoso Retail',
        tier: 'Platinum',
        complaintText: 'VIP renewal is blocked by an unresolved fulfillment issue.',
      },
      links: {
        accountOwner: { id: 'employee-riley', object_type_id: 'Employee', properties: { name: 'Riley', region: 'APAC' } },
        relatedOrders: [{ id: 'order-9001', object_type_id: 'Order', properties: { orderId: '9001', status: 'blocked' } }],
        expectedResolution: { id: 'resolution-vip', object_type_id: 'Resolution', properties: { summary: 'Escalate with service recovery follow-up.' } },
      },
    },
  ],
};

function newSuiteId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `eval-suite-${Date.now().toString(36)}`;
}

function isSourceSurface(value: string | null): value is EvaluationSuiteSourceSurface {
  return Boolean(value && Object.prototype.hasOwnProperty.call(SOURCE_LABELS, value));
}

function targetRid(target: EvaluationTargetFunction) {
  return target.function_rid ?? target.functionRid ?? target.agent_id ?? target.agentId ?? target.id;
}

function signatureName(parameter: { apiName?: string; name?: string; id?: string }) {
  return parameter.apiName ?? parameter.name ?? parameter.id ?? '';
}

function normalizeValueType(value: string | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function typesCompatible(expected: string | undefined, actual: string | undefined) {
  const left = normalizeValueType(expected);
  const right = normalizeValueType(actual);
  if (!left || !right) return false;
  if (left === right || left === 'json' || right === 'json' || right === 'any') return true;
  const numeric = new Set(['integer', 'long', 'short', 'float', 'double', 'numeric']);
  if (numeric.has(left) && numeric.has(right)) return true;
  if (['list', 'array'].includes(left) && ['list', 'array'].includes(right)) return true;
  if (['object_list', 'object_set'].includes(left) && ['object_list', 'object_set', 'list', 'array'].includes(right)) return true;
  return false;
}

function firstOutputName(target: EvaluationTargetFunction) {
  return signatureName(target.signature.outputs[0] ?? {}) || 'finalAnswer';
}

function targetMappingsForTargets(targets: EvaluationTargetFunction[]) {
  return Object.fromEntries(targets.map((target) => [
    target.id,
    { actual: firstOutputName(target), expected: 'expectedAnswer' },
  ]));
}

function buildBuiltInEvaluator(evaluatorName: BuiltInEvaluatorName, targets: EvaluationTargetFunction[]): EvaluationEvaluator {
  const option = builtInEvaluatorOption(evaluatorName);
  const targetMappings = targetMappingsForTargets(targets);
  const firstTarget = targets[0];
  return {
    id: `${option.value}-${newSuiteId().slice(0, 8)}`,
    kind: 'built_in',
    evaluator: option.value,
    target_id: firstTarget?.id,
    mappings: firstTarget ? targetMappings[firstTarget.id] : undefined,
    target_mappings: targetMappings,
    objective: { ...option.defaultObjective },
    config: option.defaultConfig ? { ...option.defaultConfig } : {},
  };
}

function buildCustomEvaluator(functionKind: CustomEvaluatorFunctionKind, targets: EvaluationTargetFunction[]): EvaluationEvaluator {
  const option = CUSTOM_EVALUATOR_KIND_OPTIONS.find((entry) => entry.value === functionKind) ?? CUSTOM_EVALUATOR_KIND_OPTIONS[0];
  const targetMappings = targetMappingsForTargets(targets);
  const firstTarget = targets[0];
  return {
    id: `custom-${functionKind}-${newSuiteId().slice(0, 8)}`,
    kind: 'custom_function',
    evaluator: option.rid,
    function_rid: option.rid,
    function_kind: functionKind,
    version: 'published',
    target_id: firstTarget?.id,
    mappings: firstTarget ? targetMappings[firstTarget.id] : undefined,
    target_mappings: targetMappings,
    return_signature: {
      outputs: [
        {
          apiName: 'quality',
          type: 'struct',
          fields: [
            { apiName: 'isCorrect', type: 'boolean' },
            { apiName: 'qualityScore', type: 'double' },
            { apiName: 'debugNotes', type: 'string' },
          ],
        },
        { apiName: 'traceSummary', type: 'string' },
      ],
    },
    metric_objectives: {
      'quality.isCorrect': { target: true },
      'quality.qualityScore': { direction: 'maximize', threshold: 0.5 },
    },
  };
}

function buildOntologyEditTarget(): EvaluationTargetFunction {
  return {
    id: 'logic.service-case-editor',
    kind: 'logic',
    function_rid: 'logic.service-case-editor',
    version: 'published',
    signature: {
      inputs: [
        { apiName: 'complaintText', type: 'string' },
        { apiName: 'customerObject', type: 'object' },
        { apiName: 'staleTicketId', type: 'string' },
      ],
      outputs: [
        { apiName: 'finalAnswer', outputType: 'string', final: true },
        { apiName: 'actionEditPreview', outputType: 'ontology_edit_bundle', final: false },
        { apiName: 'riskScore', outputType: 'double', intermediateParameter: true, final: false },
      ],
    },
  };
}

function buildOntologyEditEvaluator(target: EvaluationTargetFunction): EvaluationEvaluator {
  return {
    id: 'custom-ontology-edit-simulation',
    kind: 'custom_function',
    evaluator: 'fn.eval-ontology-edits.ts',
    function_rid: 'fn.eval-ontology-edits.ts',
    function_kind: 'typescript',
    version: 'published',
    target_id: target.id,
    mappings: { actual: 'actionEditPreview', expected: 'expectedOntologyEdits' },
    target_mappings: { [target.id]: { actual: 'actionEditPreview', expected: 'expectedOntologyEdits' } },
    return_signature: {
      outputs: [
        {
          apiName: 'editChecks',
          type: 'struct',
          fields: [
            { apiName: 'createdObjectFound', type: 'boolean' },
            { apiName: 'editedObjectMatched', type: 'boolean' },
            { apiName: 'deletedObjectAbsent', type: 'boolean' },
            { apiName: 'debugSummary', type: 'string' },
          ],
        },
      ],
    },
    metric_objectives: {
      'editChecks.createdObjectFound': { target: true },
      'editChecks.editedObjectMatched': { target: true },
      'editChecks.deletedObjectAbsent': { target: true },
    },
  };
}

function ontologyEditExpectedValue() {
  return {
    edits: [
      {
        operation: 'create',
        objectTypeId: 'SupportTicket',
        properties: {
          ticketRequester: 'Acme Logistics',
          classification: 'service_recovery',
        },
      },
      {
        operation: 'edit',
        objectTypeId: 'Customer',
        objectId: 'customer-4421',
        properties: {
          nextStep: 'service_recovery_follow_up',
        },
      },
      {
        operation: 'delete',
        objectTypeId: 'SupportTicket',
        identifyBy: {
          ticketId: 'stale-4421',
        },
      },
    ],
  };
}

function targetForKind(
  kind: EvaluationTargetFunctionKind,
  rawRid: string,
  source: EvaluationSuiteSourceSurface,
): EvaluationTargetFunction {
  if (kind === 'agent_like') {
    const id = rawRid || 'chatbot.support-agent';
    return {
      id,
      kind,
      agent_id: id,
      version: 'current',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'answer', outputType: 'string' }],
      },
    };
  }
  if (kind === 'code_function') {
    const id = rawRid || 'fn.route-ticket.py';
    return {
      id,
      kind,
      function_rid: id,
      version: 'published',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'route', outputType: 'string' }],
      },
    };
  }
  const id = rawRid || 'logic.customer-triage';
  return {
    id,
    kind,
    function_rid: id,
    version: source === 'logic_preview' ? 'last_saved_or_preview' : 'published',
    signature: {
      inputs: [{ apiName: 'complaintText', type: 'string' }],
      outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
    },
  };
}

function defaultTargetKind(source: EvaluationSuiteSourceSurface): EvaluationTargetFunctionKind {
  return source === 'code_function_published' ? 'code_function' : 'logic';
}

function buildTestCaseColumns(targets: EvaluationTargetFunction[]): EvaluationSuiteColumn[] {
  const inputs = new Map<string, EvaluationSuiteColumn>();
  targets.forEach((target) => {
    target.signature.inputs.forEach((input) => {
      const apiName = signatureName(input);
      if (!apiName || inputs.has(apiName)) return;
      inputs.set(apiName, {
        id: `input-${apiName}`,
        name: input.name ?? apiName,
        apiName,
        type: input.type ?? 'string',
        role: 'input',
      });
    });
  });
  return [
    ...inputs.values(),
    { id: 'expected-answer', name: 'Expected answer', apiName: 'expectedAnswer', type: 'string', role: 'expected_output' },
    { id: 'metadata-scenario', name: 'Scenario', apiName: 'scenario', type: 'string', role: 'metadata' },
  ];
}

function mergeObjectSetColumns(columns: EvaluationSuiteColumn[]) {
  const existing = new Set(columns.map((column) => column.apiName));
  return [
    ...columns,
    ...OBJECT_SET_CASE_COLUMNS.filter((column) => !existing.has(column.apiName)),
  ];
}

function buildDemoObjectSetBacking(objectSetId: string, refreshMode: EvaluationObjectSetBacking['refreshMode']): EvaluationObjectSetBacking {
  const name = objectSetId === 'object-set-vip-renewals' ? 'VIP renewal customers' : 'Open customer cases';
  return {
    id: `${refreshMode}-${objectSetId}`,
    objectSetId,
    objectSetName: name,
    objectTypeId: 'Customer',
    refreshMode,
    rowLimit: objectSetId === 'object-set-vip-renewals' ? 10 : 25,
    mappings: [
      { columnApiName: 'customerObject', kind: 'backing_object' },
      { columnApiName: 'customerTier', kind: 'object_property', propertyApiName: 'tier' },
      { columnApiName: 'complaintText', kind: 'object_property', propertyApiName: 'complaintText' },
      { columnApiName: 'accountOwner', kind: 'linked_object', linkPath: ['accountOwner'] },
      { columnApiName: 'relatedOrders', kind: 'linked_object_set', linkPath: ['relatedOrders'] },
      { columnApiName: 'ownerRegion', kind: 'linked_property', linkPath: ['accountOwner'], linkedPropertyApiName: 'region' },
      { columnApiName: 'expectedAnswer', kind: 'linked_property', linkPath: ['expectedResolution'], linkedPropertyApiName: 'summary' },
      { columnApiName: 'sourceKind', kind: 'static_value', staticValue: `${refreshMode} object set` },
      { columnApiName: 'scenario', kind: 'static_value', staticValue: name },
    ],
  };
}

function buildEvaluatorsForTargets(targets: EvaluationTargetFunction[]): EvaluationEvaluator[] {
  if (targets.length === 0) return [];
  return [{ ...buildBuiltInEvaluator('exact_match', targets), id: 'exact-match' }];
}

function titleCaseWords(value: string) {
  return value
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function defaultValueForColumn(column: EvaluationSuiteColumn, index: number, source: EvaluationTestCase['source'] = 'manual'): unknown {
  const apiName = column.apiName.toLowerCase();
  if (apiName.includes('complaint') || apiName.includes('review')) {
    return source === 'logic_preview'
      ? 'Shipment 4421 missed its SLA. Recommend the next recovery step.'
      : index % 2 === 0
        ? 'Customer reports a late shipment and asks for escalation.'
        : 'Customer praises the delivery team and confirms the issue is resolved.';
  }
  if (apiName.includes('delay')) return source === 'logic_preview' ? 6 : 2 + index;
  if (column.role === 'expected_output') {
    return source === 'logic_preview' ? 'Escalate with service recovery follow-up.' : 'Escalate';
  }
  if (column.role === 'metadata') return source === 'logic_preview' ? 'preview' : 'manual';
  switch (normalizeValueType(column.type)) {
    case 'integer':
    case 'long':
    case 'short':
      return index + 1;
    case 'float':
    case 'double':
    case 'numeric':
      return index + 0.5;
    case 'boolean':
      return index % 2 === 0;
    case 'object_list':
    case 'object_set':
    case 'list':
    case 'array':
      return [];
    case 'object':
    case 'json':
      return {};
    default:
      return '';
  }
}

function suggestedNameFromValues(values: Record<string, unknown>) {
  const textValue = Object.values(values).find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const hint = textValue ? titleCaseWords(textValue) : '';
  return hint || 'Manual Evaluation Case';
}

function buildTestCase(columns: EvaluationSuiteColumn[], index: number, source: EvaluationTestCase['source'] = 'manual'): EvaluationTestCase {
  const values = Object.fromEntries(columns.flatMap((column) => {
    if (column.role === 'metadata' && !['string', 'json', 'any'].includes(String(column.type).toLowerCase())) return [];
    return [[column.apiName, defaultValueForColumn(column, index, source)]];
  }));
  const generatedNameHint = suggestedNameFromValues(values);
  return {
    id: `${source === 'logic_preview' ? 'preview' : 'manual'}-${newSuiteId().slice(0, 8)}`,
    name: source === 'logic_preview' ? generatedNameHint : `Test case ${index + 1}`,
    source,
    values,
    metadata: {
      created_by: CURRENT_USER_ID,
      source_surface: source,
    },
    generated_name_hint: generatedNameHint,
  };
}

function buildSuite(
  source: EvaluationSuiteSourceSurface,
  targetRidValue: string,
  name: string,
  description: string,
  targets: EvaluationTargetFunction[],
): LocalEvaluationSuite {
  const now = new Date().toISOString();
  const targetFunctions = targets.length > 0 ? targets : [targetForKind(defaultTargetKind(source), targetRidValue.trim(), source)];
  const testCaseColumns = buildTestCaseColumns(targetFunctions);
  return {
    id: newSuiteId(),
    name: name.trim() || `${SOURCE_LABELS[source]} regression suite`,
    description: description.trim() || 'Manual test cases and exact-match evaluator for first confidence checks.',
    projectId: DEMO_PROJECT_ID,
    folderId: DEMO_FOLDER_ID,
    ownerId: CURRENT_USER_ID,
    targetFunctions,
    testCaseColumns,
    testCases: [buildTestCase(testCaseColumns, 0, source === 'logic_preview' ? 'logic_preview' : 'manual')],
    objectSetBackings: [],
    evaluators: buildEvaluatorsForTargets(targetFunctions),
    runHistory: [],
    resultsDatasetRid: `ri.foundry.dataset.${newSuiteId().slice(0, 8)}`,
    permissions: { owners: [CURRENT_USER_ID], editors: [], viewers: [] },
    sourceSurface: source,
    sourceResourceId: targetRidValue.trim() || targetFunctions[0]?.id,
    createdAt: now,
    updatedAt: now,
  };
}

function buildOntologyEditSuite(): LocalEvaluationSuite {
  const now = new Date().toISOString();
  const target = buildOntologyEditTarget();
  const testCaseColumns: EvaluationSuiteColumn[] = [
    { id: 'input-complaintText', name: 'Complaint text', apiName: 'complaintText', type: 'string', role: 'input' },
    { id: 'input-customerObject', name: 'Customer object', apiName: 'customerObject', type: 'object', role: 'input' },
    { id: 'input-staleTicketId', name: 'Stale ticket id', apiName: 'staleTicketId', type: 'string', role: 'input' },
    { id: 'intermediate-riskScore', name: 'Risk score', apiName: 'riskScore', type: 'double', role: 'intermediate_parameter' },
    { id: 'expected-ontology-edits', name: 'Expected Ontology edits', apiName: 'expectedOntologyEdits', type: 'json', role: 'expected_output' },
    { id: 'expected-risk-score', name: 'Expected risk score', apiName: 'expectedRiskScore', type: 'double', role: 'expected_output' },
    { id: 'metadata-scenario', name: 'Scenario', apiName: 'scenario', type: 'string', role: 'metadata' },
  ];
  const testCases: EvaluationTestCase[] = [{
    id: 'case-ontology-edit-simulation',
    name: 'Create edit delete in simulation',
    source: 'manual',
    values: {
      complaintText: 'Acme Logistics has a late shipment and needs service recovery.',
      customerObject: {
        id: 'customer-4421',
        objectTypeId: 'Customer',
        properties: { name: 'Acme Logistics', nextStep: 'open' },
      },
      staleTicketId: 'stale-4421',
      expectedOntologyEdits: ontologyEditExpectedValue(),
      expectedRiskScore: 1,
      scenario: 'ontology simulation',
    },
    metadata: {
      simulation_required: true,
      source_surface: 'aip_evals_app',
    },
    generated_name_hint: 'Ontology Edit Simulation',
  }];
  return {
    id: newSuiteId(),
    name: 'Ontology edit simulation suite',
    description: 'Runs create, edit, and delete Ontology edits in a per-test-case simulation and verifies them with custom evaluator metrics plus an intermediate parameter.',
    projectId: DEMO_PROJECT_ID,
    folderId: DEMO_FOLDER_ID,
    ownerId: CURRENT_USER_ID,
    targetFunctions: [target],
    testCaseColumns,
    testCases,
    objectSetBackings: [],
    evaluators: [
      buildOntologyEditEvaluator(target),
      {
        ...buildBuiltInEvaluator('numeric_range', [target]),
        id: 'intermediate-risk-score-range',
        evaluator: 'numeric_range',
        mappings: { actual: 'riskScore', expected: 'expectedRiskScore' },
        target_mappings: { [target.id]: { actual: 'riskScore', expected: 'expectedRiskScore' } },
        objective: { metric: 'in_range', target: true },
        config: { min: 0, max: 1 },
      },
    ],
    runHistory: [],
    resultsDatasetRid: `ri.foundry.dataset.${newSuiteId().slice(0, 8)}`,
    permissions: { owners: [CURRENT_USER_ID], editors: [], viewers: [] },
    sourceSurface: 'aip_evals_app',
    sourceResourceId: target.id,
    createdAt: now,
    updatedAt: now,
  };
}

function validateTargets(targets: EvaluationTargetFunction[]) {
  const issues: string[] = [];
  const seen = new Set<string>();
  if (targets.length === 0) issues.push('Add at least one target function.');
  targets.forEach((target) => {
    if (seen.has(target.id)) issues.push(`Target ${target.id} is duplicated.`);
    seen.add(target.id);
    if (!target.id || !target.kind) issues.push('Each target needs an id and kind.');
    if (target.version === 'specific' && !target.version_id && !target.versionId) {
      issues.push(`Target ${target.id} uses a specific version without version_id.`);
    }
    if (!Array.isArray(target.signature.inputs) || !Array.isArray(target.signature.outputs)) {
      issues.push(`Target ${target.id} needs input and output signature arrays.`);
    }
    if (!target.signature.outputs.every((output) => signatureName(output) && (output.outputType || output.type))) {
      issues.push(`Target ${target.id} has an output without apiName/name or type/outputType.`);
    }
  });
  return issues;
}

function validateValueForType(value: unknown, type: string) {
  if (value === undefined || value === null) return false;
  switch (normalizeValueType(type)) {
    case 'string':
    case 'date':
    case 'timestamp':
    case 'media_reference':
    case 'model':
      return typeof value === 'string';
    case 'boolean':
    case 'bool':
      return typeof value === 'boolean';
    case 'integer':
    case 'long':
    case 'short':
      return typeof value === 'number' && Number.isInteger(value);
    case 'double':
    case 'float':
    case 'numeric':
      return typeof value === 'number' && Number.isFinite(value);
    case 'list':
    case 'array':
    case 'object_list':
    case 'object_set':
      return Array.isArray(value);
    default:
      return true;
  }
}

function evaluatorMappings(evaluator: EvaluationEvaluator, targets: EvaluationTargetFunction[]) {
  if (evaluator.target_mappings) return evaluator.target_mappings;
  if (evaluator.targetMappings) return evaluator.targetMappings;
  const targetId = evaluator.target_id ?? evaluator.targetId ?? targets[0]?.id;
  return targetId && evaluator.mappings ? { [targetId]: evaluator.mappings } : {};
}

function suiteValidationIssues(suite: LocalEvaluationSuite) {
  const issues = validateTargets(suite.targetFunctions);
  const columnsByName = new Map(suite.testCaseColumns.map((column) => [column.apiName, column]));
  suite.targetFunctions.forEach((target) => {
    target.signature.inputs.forEach((input) => {
      const apiName = signatureName(input);
      const column = columnsByName.get(apiName);
      if (!column) {
        issues.push(`Missing input column ${apiName} for ${target.id}.`);
      } else if (column.role !== 'input') {
        issues.push(`Column ${apiName} must be an input column.`);
      } else if (!typesCompatible(input.type, column.type)) {
        issues.push(`Column ${apiName} type ${column.type} is not compatible with target input ${input.type}.`);
      }
    });
    target.signature.outputs.forEach((output) => {
      const apiName = signatureName(output);
      const column = columnsByName.get(apiName);
      if (column?.role === 'intermediate_parameter' && !typesCompatible(output.outputType ?? output.type, column.type)) {
        issues.push(`Intermediate parameter ${apiName} type ${column.type} is not compatible with target output.`);
      }
    });
  });
  suite.evaluators.forEach((evaluator) => {
    const mappings = evaluatorMappings(evaluator, suite.targetFunctions);
    Object.entries(mappings ?? {}).forEach(([targetId, mapping]) => {
      const target = suite.targetFunctions.find((candidate) => candidate.id === targetId);
      if (!target) issues.push(`Evaluator ${evaluator.id} references unknown target ${targetId}.`);
      const expectedColumn = columnsByName.get(String(mapping.expected ?? ''));
      if (!expectedColumn) issues.push(`Evaluator ${evaluator.id} expected column ${String(mapping.expected ?? '')} is missing.`);
      else if (expectedColumn.role !== 'expected_output') issues.push(`Evaluator ${evaluator.id} expected mapping must point to an expected output column.`);
      const actualOutput = target?.signature.outputs.find((output) => signatureName(output) === mapping.actual);
      if (target && !actualOutput) {
        issues.push(`Evaluator ${evaluator.id} actual output ${String(mapping.actual ?? '')} is missing on ${target.id}.`);
      }
      if (actualOutput && normalizeValueType(actualOutput.outputType ?? actualOutput.type) === 'ontology_edit_bundle' && !isCustomEvaluationFunction(evaluator)) {
        issues.push(`Evaluator ${evaluator.id} must use a custom function for Ontology edit outputs or map an intermediate parameter.`);
      }
      if (actualOutput && expectedColumn && !typesCompatible(actualOutput.outputType ?? actualOutput.type, expectedColumn.type)) {
        issues.push(`Evaluator ${evaluator.id} expected column ${expectedColumn.apiName} type is not compatible with ${targetId}.`);
      }
    });
  });
  suite.testCases.forEach((testCase) => {
    if (!testCase.name.trim()) issues.push(`Test case ${testCase.id} needs a name.`);
    suite.testCaseColumns.forEach((column) => {
      if (column.role === 'metadata' || column.role === 'intermediate_parameter') return;
      if (!(column.apiName in testCase.values)) {
        issues.push(`Test case ${testCase.name} is missing ${column.apiName}.`);
      } else if (!validateValueForType(testCase.values[column.apiName], column.type)) {
        issues.push(`Test case ${testCase.name} value ${column.apiName} must be ${column.type}.`);
      }
    });
    Object.keys(testCase.values).forEach((apiName) => {
      if (!columnsByName.has(apiName)) issues.push(`Test case ${testCase.name} has value for removed column ${apiName}.`);
    });
  });
  suite.objectSetBackings.forEach((backing) => {
    issues.push(...validateObjectSetColumnMappings(backing, suite.testCaseColumns));
  });
  return Array.from(new Set(issues));
}

function valueToInput(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function coerceInputValue(raw: string, type: string): unknown {
  switch (normalizeValueType(type)) {
    case 'integer':
    case 'long':
    case 'short': {
      const value = Number(raw);
      return Number.isInteger(value) ? value : raw;
    }
    case 'double':
    case 'float':
    case 'numeric': {
      const value = Number(raw);
      return Number.isFinite(value) ? value : raw;
    }
    case 'boolean':
    case 'bool':
      return raw === 'true';
    case 'json':
    case 'object':
    case 'object_list':
    case 'object_set':
    case 'list':
    case 'array':
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    default:
      return raw;
  }
}

function reconcileTestCasesWithColumns(testCases: EvaluationTestCase[], columns: EvaluationSuiteColumn[]) {
  return testCases.map((testCase, index) => {
    const values = Object.fromEntries(columns.flatMap((column) => {
      if (column.apiName in testCase.values) return [[column.apiName, testCase.values[column.apiName]]];
      if (column.role === 'metadata') return [];
      return [[column.apiName, defaultValueForColumn(column, index, testCase.source)]];
    }));
    return { ...testCase, values };
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function AipEvalsPage() {
  const [searchParams] = useSearchParams();
  const sourceParam = searchParams.get('source');
  const initialSource: EvaluationSuiteSourceSurface = isSourceSurface(sourceParam) ? sourceParam : 'aip_evals_app';
  const initialTarget = searchParams.get('target') ?? '';
  const initialKind = defaultTargetKind(initialSource);
  const [source, setSource] = useState<EvaluationSuiteSourceSurface>(initialSource);
  const [targetKind, setTargetKind] = useState<EvaluationTargetFunctionKind>(initialKind);
  const [targetRidValue, setTargetRidValue] = useState(initialTarget);
  const [draftTargets, setDraftTargets] = useState<EvaluationTargetFunction[]>(() => [
    targetForKind(initialKind, initialTarget, initialSource),
  ]);
  const [name, setName] = useState(initialTarget ? `${initialTarget} evaluation suite` : 'Customer triage regression suite');
  const [description, setDescription] = useState('');
  const [suites, setSuites] = useState<LocalEvaluationSuite[]>(() => [
    buildOntologyEditSuite(),
    buildSuite('logic_preview', 'logic.customer-triage', 'Customer triage preview checks', 'Created from a Logic preview run with the first manual test case.', [
      targetForKind('logic', 'logic.customer-triage', 'logic_preview'),
    ]),
    buildSuite('aip_evals_app', 'logic.customer-triage', 'Multi-target comparison suite', 'Compare a Logic implementation, a chatbot function, and a code-authored function on shared cases.', [
      targetForKind('logic', 'logic.customer-triage', 'aip_evals_app'),
      targetForKind('agent_like', 'chatbot.support-agent', 'aip_evals_app'),
      targetForKind('code_function', 'fn.route-ticket.py', 'aip_evals_app'),
    ]),
  ]);
  const [selectedId, setSelectedId] = useState(suites[0]?.id ?? '');
  const [runVersionSelections, setRunVersionSelections] = useState<Record<string, string>>({});
  const [runModelSelections, setRunModelSelections] = useState<Record<string, string>>({});
  const [debugRowKey, setDebugRowKey] = useState<string | null>(null);
  const [compareBaseRunId, setCompareBaseRunId] = useState<string>('');
  const [compareHeadRunId, setCompareHeadRunId] = useState<string>('');
  const [dashboardFilters, setDashboardFilters] = useState<EvaluationMetricsDashboardFilters>({});
  const [analyzerConfig, setAnalyzerConfig] = useState<EvaluationResultsAnalyzerConfig>({
    model: 'openfoundry.analyzer.v1',
    maxCategories: 5,
    maxFailingTestCases: 5,
  });
  const [experimentDimensions, setExperimentDimensions] = useState<EvaluationExperimentDimension[]>([]);
  const [experimentMaxRuns, setExperimentMaxRuns] = useState(12);
  const [experimentResults, setExperimentResults] = useState<EvaluationExperimentResults | null>(null);
  const [promptSuggestionApplications, setPromptSuggestionApplications] = useState<PromptSuggestionApplication[]>([]);
  const [gateSurface, setGateSurface] = useState<LogicPublishGateSurface>('logic_publish');
  const [gateRequirement, setGateRequirement] = useState<LogicPublishGateRequirement>({
    suiteIds: [],
    minPassRate: 0.9,
    maxRunAgeHours: 24,
    criticalMetricNames: [],
  });
  const [gateWaivers, setGateWaivers] = useState<LogicPublishGateWaiver[]>([]);
  const [schedules, setSchedules] = useState<EvalScheduleConfig[]>([]);
  const [runIncludedTargetIds, setRunIncludedTargetIds] = useState<Record<string, string[] | undefined>>({});
  const [runIterations, setRunIterations] = useState(1);
  const [runParallelization, setRunParallelization] = useState(1);
  const [runExecutionMode, setRunExecutionMode] = useState<'user_scoped' | 'project_scoped'>('user_scoped');
  const [runCustomLabels, setRunCustomLabels] = useState('');
  const [runNotes, setRunNotes] = useState('');
  const [installedMarketplaceEvaluatorSlugs, setInstalledMarketplaceEvaluatorSlugs] = useState<string[]>(DEFAULT_INSTALLED_MARKETPLACE_EVALUATOR_SLUGS);
  const [marketplaceSetupSlug, setMarketplaceSetupSlug] = useState<MarketplaceEvaluatorSlug | ''>('');
  const selected = suites.find((suite) => suite.id === selectedId) ?? suites[0] ?? null;
  const activeSuites = useMemo(() => suites.filter((suite) => !suite.archivedAt), [suites]);
  const archivedSuites = useMemo(() => suites.filter((suite) => suite.archivedAt), [suites]);
  const marketplaceEvaluatorProducts = useMemo(() => listMarketplaceEvaluatorProducts(installedMarketplaceEvaluatorSlugs), [installedMarketplaceEvaluatorSlugs]);
  const marketplaceSetupProduct = marketplaceSetupSlug ? marketplaceEvaluatorProductBySlug(marketplaceSetupSlug) : undefined;
  const draftIssues = useMemo(() => validateTargets(draftTargets), [draftTargets]);
  const draftColumns = useMemo(() => buildTestCaseColumns(draftTargets), [draftTargets]);
  const draftEvaluators = useMemo(() => buildEvaluatorsForTargets(draftTargets), [draftTargets]);
  const selectedIssues = useMemo(() => (selected ? suiteValidationIssues(selected) : []), [selected]);
  const selectedEvaluationSummary = useMemo(() => (
    selected ? evaluateEvaluationSuiteBuiltIns(selected) : undefined
  ), [selected]);
  const selectedComputePlan = useMemo(() => (selected ? estimateEvaluationRunComputeUsage(selected, {
    source: 'aip_evals_app',
    targetVersions: Object.fromEntries(selected.targetFunctions.map((target) => [
      target.id,
      runVersionSelections[target.id] ?? defaultEvaluationTargetVersion(target),
    ])),
    attribution: {
      actorId: CURRENT_USER_ID,
      projectId: selected.projectId,
      permissionSubjectId: CURRENT_USER_ID,
      evalRunId: selected.id,
    },
  }) : undefined), [runVersionSelections, selected]);

  function selectedRunVersion(target: EvaluationTargetFunction) {
    return runVersionSelections[target.id] ?? defaultEvaluationTargetVersion(target);
  }

  function addTarget() {
    const next = targetForKind(targetKind, targetRidValue.trim(), source);
    setDraftTargets((current) => {
      if (current.some((target) => target.id === next.id)) {
        return current.map((target) => (target.id === next.id ? next : target));
      }
      return [...current, next];
    });
  }

  function createSuite() {
    if (draftIssues.length > 0) return;
    const suite = buildSuite(source, targetRidValue, name, description, draftTargets);
    setSuites((current) => [suite, ...current]);
    setSelectedId(suite.id);
  }

  function createOntologyEditSuite() {
    const suite = buildOntologyEditSuite();
    setSuites((current) => [suite, ...current]);
    setSelectedId(suite.id);
    setName(suite.name);
    setDescription(suite.description);
    setDraftTargets(suite.targetFunctions);
    setTargetKind('logic');
    setTargetRidValue(suite.targetFunctions[0]?.id ?? 'logic.service-case-editor');
    setSource('aip_evals_app');
  }

  function updateSelected() {
    if (!selected || draftIssues.length > 0) return;
    const now = new Date().toISOString();
    setSuites((current) => current.map((suite) => (suite.id === selected.id ? {
      ...(() => {
        const columns = suite.objectSetBackings.length > 0 ? mergeObjectSetColumns(draftColumns) : draftColumns;
        const recomputed = recomputeObjectSetBackedTestCases({
          existingTestCases: reconcileTestCasesWithColumns(suite.testCases, columns),
          objectSetBackings: suite.objectSetBackings,
          columns,
          rowsByObjectSetId: DEMO_OBJECT_SET_ROWS,
          now: new Date(now),
        });
        return {
          ...suite,
          name: name.trim() || suite.name,
          description: description.trim() || suite.description,
          targetFunctions: draftTargets,
          testCaseColumns: columns,
          testCases: recomputed.testCases,
          objectSetBackings: recomputed.objectSetBackings,
          evaluators: draftEvaluators,
          updatedAt: now,
        };
      })(),
    } : suite)));
  }

  function updateSuite(suiteId: string, updater: (suite: LocalEvaluationSuite) => LocalEvaluationSuite) {
    setSuites((current) => current.map((suite) => (suite.id === suiteId ? updater(suite) : suite)));
  }

  function addManualTestCase(sourceKind: EvaluationTestCase['source']) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      testCases: [...suite.testCases, buildTestCase(suite.testCaseColumns, suite.testCases.length, sourceKind)],
      updatedAt: now,
    }));
  }

  function addObjectSetBackedCases(objectSetId: string, refreshMode: EvaluationObjectSetBacking['refreshMode']) {
    if (!selected) return;
    const now = new Date();
    const backing = buildDemoObjectSetBacking(objectSetId, refreshMode);
    updateSuite(selected.id, (suite) => {
      const existingBacking = suite.objectSetBackings.find((candidate) => candidate.id === backing.id);
      const objectSetBackings = existingBacking
        ? suite.objectSetBackings.map((candidate) => (candidate.id === backing.id ? { ...candidate, refreshMode } : candidate))
        : [...suite.objectSetBackings, backing];
      const columns = mergeObjectSetColumns(suite.testCaseColumns);
      const recomputed = recomputeObjectSetBackedTestCases({
        existingTestCases: reconcileTestCasesWithColumns(suite.testCases, columns),
        objectSetBackings,
        columns,
        rowsByObjectSetId: DEMO_OBJECT_SET_ROWS,
        forceRefreshBackingIds: [backing.id],
        now,
      });
      return {
        ...suite,
        testCaseColumns: columns,
        testCases: recomputed.testCases,
        objectSetBackings: recomputed.objectSetBackings,
        updatedAt: now.toISOString(),
      };
    });
  }

  function refreshObjectSetBackedCases() {
    if (!selected) return;
    const now = new Date();
    updateSuite(selected.id, (suite) => {
      const recomputed = recomputeObjectSetBackedTestCases({
        existingTestCases: suite.testCases,
        objectSetBackings: suite.objectSetBackings,
        columns: suite.testCaseColumns,
        rowsByObjectSetId: DEMO_OBJECT_SET_ROWS,
        now,
      });
      return {
        ...suite,
        testCases: recomputed.testCases,
        objectSetBackings: recomputed.objectSetBackings,
        updatedAt: now.toISOString(),
      };
    });
  }

  function suggestNamesForSelected() {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      testCases: suite.testCases.map((testCase) => {
        const hint = suggestedNameFromValues(testCase.values);
        return { ...testCase, generated_name_hint: hint, name: testCase.name.startsWith('Test case') ? hint : testCase.name };
      }),
      updatedAt: now,
    }));
  }

  function updateTestCaseName(testCaseId: string, nameValue: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      testCases: suite.testCases.map((testCase) => (testCase.id === testCaseId ? { ...testCase, name: nameValue } : testCase)),
      updatedAt: now,
    }));
  }

  function updateTestCaseValue(testCaseId: string, column: EvaluationSuiteColumn, value: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      testCases: suite.testCases.map((testCase) => (testCase.id === testCaseId ? {
        ...testCase,
        values: { ...testCase.values, [column.apiName]: coerceInputValue(value, column.type) },
      } : testCase)),
      updatedAt: now,
    }));
  }

  function removeTestCase(testCaseId: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      testCases: suite.testCases.filter((testCase) => testCase.id !== testCaseId),
      updatedAt: now,
    }));
  }

  function moveColumn(apiName: string, direction: -1 | 1) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => {
      const index = suite.testCaseColumns.findIndex((column) => column.apiName === apiName);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= suite.testCaseColumns.length) return suite;
      const columns = [...suite.testCaseColumns];
      const [column] = columns.splice(index, 1);
      columns.splice(nextIndex, 0, column);
      return { ...suite, testCaseColumns: columns, updatedAt: now };
    });
  }

  function addColumn(role: EvaluationSuiteColumn['role']) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => {
      const suffix = suite.testCaseColumns.filter((column) => column.role === role).length + 1;
      const apiName = role === 'metadata' ? `metadata${suffix}` : `expectedAnswer${suffix}`;
      const column: EvaluationSuiteColumn = {
        id: `${role}-${suffix}`,
        name: role === 'metadata' ? `Metadata ${suffix}` : `Expected answer ${suffix}`,
        apiName,
        type: 'string',
        role,
      };
      const columns = [...suite.testCaseColumns, column];
      return {
        ...suite,
        testCaseColumns: columns,
        testCases: reconcileTestCasesWithColumns(suite.testCases, columns),
        updatedAt: now,
      };
    });
  }

  function updateColumn(apiName: string, patch: Partial<EvaluationSuiteColumn>) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => {
      const columns = suite.testCaseColumns.map((column) => (column.apiName === apiName ? { ...column, ...patch } : column));
      return {
        ...suite,
        testCaseColumns: columns,
        testCases: reconcileTestCasesWithColumns(suite.testCases, columns),
        updatedAt: now,
      };
    });
  }

  function removeColumn(apiName: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      testCaseColumns: suite.testCaseColumns.filter((column) => column.apiName !== apiName),
      testCases: suite.testCases.map((testCase) => ({
        ...testCase,
        values: Object.fromEntries(Object.entries(testCase.values).filter(([key]) => key !== apiName)),
      })),
      updatedAt: now,
    }));
  }

  function addBuiltInEvaluator(evaluatorName: BuiltInEvaluatorName) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: [...suite.evaluators, buildBuiltInEvaluator(evaluatorName, suite.targetFunctions)],
      updatedAt: now,
    }));
  }

  function addCustomEvaluator(functionKind: CustomEvaluatorFunctionKind) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: [...suite.evaluators, buildCustomEvaluator(functionKind, suite.targetFunctions)],
      updatedAt: now,
    }));
  }

  function addMarketplaceEvaluator(product: MarketplaceEvaluatorProduct) {
    if (!selected) return;
    if (!installedMarketplaceEvaluatorSlugs.includes(product.slug)) {
      setMarketplaceSetupSlug(product.slug);
      return;
    }
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: [...suite.evaluators, buildMarketplaceEvaluationFunction(product, targetMappingsForTargets(suite.targetFunctions))],
      updatedAt: now,
    }));
  }

  function installMarketplaceEvaluator(product: MarketplaceEvaluatorProduct, addAfterInstall = true) {
    setInstalledMarketplaceEvaluatorSlugs((current) => installMarketplaceEvaluatorSlug(current, product.slug));
    setMarketplaceSetupSlug('');
    if (!addAfterInstall || !selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => {
      const hasEvaluator = suite.evaluators.some((evaluator) => evaluator.marketplace_product_slug === product.slug || evaluator.marketplaceProductSlug === product.slug);
      return {
        ...suite,
        evaluators: hasEvaluator
          ? suite.evaluators
          : [...suite.evaluators, buildMarketplaceEvaluationFunction(product, targetMappingsForTargets(suite.targetFunctions))],
        updatedAt: now,
      };
    });
  }

  function updateCustomEvaluator(evaluatorId: string, patch: Partial<EvaluationEvaluator>) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: suite.evaluators.map((evaluator) => {
        if (evaluator.id !== evaluatorId) return evaluator;
        const nextFunctionRid = patch.function_rid ?? patch.functionRid ?? evaluator.function_rid ?? evaluator.functionRid ?? evaluator.evaluator;
        return {
          ...evaluator,
          ...patch,
          evaluator: String(nextFunctionRid),
          function_rid: String(nextFunctionRid),
        };
      }),
      updatedAt: now,
    }));
  }

  function updateEvaluatorKind(evaluatorId: string, evaluatorName: BuiltInEvaluatorName) {
    if (!selected) return;
    const option = builtInEvaluatorOption(evaluatorName);
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: suite.evaluators.map((evaluator) => (evaluator.id === evaluatorId ? {
        ...evaluator,
        evaluator: option.value,
        objective: { ...option.defaultObjective },
        config: option.defaultConfig ? { ...option.defaultConfig } : {},
      } : evaluator)),
      updatedAt: now,
    }));
  }

  function updateEvaluatorObjective(evaluatorId: string, patch: Record<string, unknown>) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: suite.evaluators.map((evaluator) => (evaluator.id === evaluatorId ? {
        ...evaluator,
        objective: { ...(evaluator.objective ?? {}), ...patch },
      } : evaluator)),
      updatedAt: now,
    }));
  }

  function updateEvaluatorConfig(evaluatorId: string, key: string, value: unknown) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: suite.evaluators.map((evaluator) => (evaluator.id === evaluatorId ? {
        ...evaluator,
        config: { ...(evaluator.config ?? {}), [key]: value },
      } : evaluator)),
      updatedAt: now,
    }));
  }

  function updateEvaluatorMapping(evaluatorId: string, targetId: string, field: 'actual' | 'expected', value: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: suite.evaluators.map((evaluator) => {
        if (evaluator.id !== evaluatorId) return evaluator;
        const currentMappings = evaluatorMappings(evaluator, suite.targetFunctions);
        const targetMapping = { ...(currentMappings[targetId] ?? {}), [field]: value };
        const targetMappings = { ...currentMappings, [targetId]: targetMapping };
        return {
          ...evaluator,
          target_id: suite.targetFunctions.length === 1 ? targetId : evaluator.target_id,
          mappings: suite.targetFunctions.length === 1 ? targetMapping : evaluator.mappings,
          target_mappings: targetMappings,
        };
      }),
      updatedAt: now,
    }));
  }

  function removeEvaluator(evaluatorId: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    updateSuite(selected.id, (suite) => ({
      ...suite,
      evaluators: suite.evaluators.filter((evaluator) => evaluator.id !== evaluatorId),
      updatedAt: now,
    }));
  }

  function updateRunVersion(targetId: string, version: string) {
    setRunVersionSelections((current) => ({ ...current, [targetId]: version }));
  }

  function updateRunModel(targetId: string, model: string) {
    setRunModelSelections((current) => ({ ...current, [targetId]: model }));
  }

  function selectedRunIncludedTargets(suiteId: string, allTargetIds: string[]): string[] {
    const requested = runIncludedTargetIds[suiteId];
    if (!requested) return allTargetIds;
    return requested.filter((id) => allTargetIds.includes(id));
  }

  function toggleRunIncludedTarget(suiteId: string, targetId: string, included: boolean) {
    setRunIncludedTargetIds((current) => {
      const allTargetIds = (suites.find((suite) => suite.id === suiteId)?.targetFunctions ?? []).map((target) => target.id);
      const next = new Set(current[suiteId] ?? allTargetIds);
      if (included) next.add(targetId);
      else next.delete(targetId);
      return { ...current, [suiteId]: Array.from(next) };
    });
  }

  function setRunIncludedTargets(suiteId: string, ids: string[] | undefined) {
    setRunIncludedTargetIds((current) => ({ ...current, [suiteId]: ids }));
  }

  function runSelectedSuite(testCaseId?: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    const allTargetIds = selected.targetFunctions.map((target) => target.id);
    const includedTargetIds = selectedRunIncludedTargets(selected.id, allTargetIds);
    const targetVersions = Object.fromEntries(selected.targetFunctions.map((target) => [target.id, selectedRunVersion(target)]));
    const targetModels = Object.fromEntries(Object.entries(runModelSelections).filter(([, value]) => typeof value === 'string' && value.trim() !== ''));
    const customLabels = runCustomLabels.split(',').map((label) => label.trim()).filter(Boolean);
    const run = runEvaluationSuiteBuiltIns(selected, {
      source: 'aip_evals_app',
      targetVersions,
      targetModels,
      targetIds: includedTargetIds,
      testCaseIds: testCaseId ? [testCaseId] : undefined,
      iterations: runIterations,
      parallelization: runParallelization,
      executionMode: runExecutionMode,
      suiteProjectId: selected.projectId,
      resultsDatasetRid: selected.resultsDatasetRid,
      attribution: {
        actorId: CURRENT_USER_ID,
        projectId: selected.projectId,
        permissionSubjectId: runExecutionMode === 'project_scoped' ? selected.projectId : CURRENT_USER_ID,
        evalRunId: selected.id,
      },
      metadata: {
        runInitiator: { id: CURRENT_USER_ID },
        branchName: 'main',
        customLabels,
        notes: runNotes.trim() ? runNotes.trim() : undefined,
      },
    });
    updateSuite(selected.id, (suite) => ({
      ...suite,
      runHistory: [run, ...suite.runHistory].slice(0, 8),
      updatedAt: now,
    }));
  }

  function duplicateSelected() {
    if (!selected) return;
    const now = new Date().toISOString();
    const copy: LocalEvaluationSuite = {
      ...selected,
      id: newSuiteId(),
      name: `${selected.name} (copy)`,
      ownerId: CURRENT_USER_ID,
      sourceSurface: 'aip_evals_app',
      archivedAt: undefined,
      createdAt: now,
      updatedAt: now,
    };
    setSuites((current) => [copy, ...current]);
    setSelectedId(copy.id);
  }

  function moveSelected() {
    if (!selected) return;
    const nextFolder = selected.folderId === DEMO_FOLDER_ID ? MOVED_FOLDER_ID : DEMO_FOLDER_ID;
    const now = new Date().toISOString();
    setSuites((current) => current.map((suite) => (suite.id === selected.id ? { ...suite, folderId: nextFolder, updatedAt: now } : suite)));
  }

  function setArchived(archived: boolean) {
    if (!selected) return;
    const now = new Date().toISOString();
    setSuites((current) => current.map((suite) => (suite.id === selected.id ? {
      ...suite,
      archivedAt: archived ? now : undefined,
      updatedAt: now,
    } : suite)));
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <header className="of-toolbar" style={{ justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">AIP Evals</p>
          <h1 className="of-heading-xl" style={{ margin: 0 }}>Evaluation suites</h1>
          <p className="of-text-muted" style={{ margin: '4px 0 0', maxWidth: 780 }}>
            Manage suite resources, target functions, target-specific evaluator mappings, run history, result datasets, and permissions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="of-chip of-status-success">{activeSuites.length} active</span>
          <span className="of-chip">{archivedSuites.length} archived</span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 0.9fr) minmax(540px, 1.1fr)', gap: 16, alignItems: 'start' }}>
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div>
            <p className="of-eyebrow">Create suite</p>
            <h2 className="of-heading-md" style={{ margin: 0 }}>Target functions</h2>
          </div>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Source</span>
            <select
              className="of-input"
              value={source}
              onChange={(event) => {
                const nextSource = event.target.value as EvaluationSuiteSourceSurface;
                setSource(nextSource);
                setTargetKind(defaultTargetKind(nextSource));
              }}
            >
              {(Object.keys(SOURCE_LABELS) as EvaluationSuiteSourceSurface[]).map((entry) => (
                <option key={entry} value={entry}>{SOURCE_LABELS[entry]}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 0.7fr) minmax(180px, 1fr) auto', gap: 8, alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Target kind</span>
              <select className="of-input" value={targetKind} onChange={(event) => setTargetKind(event.target.value as EvaluationTargetFunctionKind)}>
                {(Object.keys(TARGET_KIND_LABELS) as EvaluationTargetFunctionKind[]).map((entry) => (
                  <option key={entry} value={entry}>{TARGET_KIND_LABELS[entry]}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Function RID or id</span>
              <input className="of-input" value={targetRidValue} onChange={(event) => setTargetRidValue(event.target.value)} placeholder="logic.customer-triage" />
            </label>
            <button type="button" className="of-button" onClick={addTarget}>
              <Glyph name="plus" size={12} /> Add
            </button>
          </div>
          <TargetList targets={draftTargets} onRemove={(id) => setDraftTargets((current) => current.filter((target) => target.id !== id))} />
          {draftIssues.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 4, borderColor: 'var(--status-warning)' }}>
              {draftIssues.map((issue) => <span key={issue} className="of-text-muted" style={{ fontSize: 12 }}>{issue}</span>)}
            </div>
          ) : (
            <div className="of-panel-muted" style={{ padding: 10 }}>
              <strong style={{ fontSize: 13 }}>Evaluator mappings ready</strong>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                {draftTargets.length > 1 ? 'Each target has its own actual-output mapping.' : 'Single-target mapping uses the selected function output.'}
              </p>
            </div>
          )}
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Name</span>
            <input className="of-input" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Description</span>
            <textarea className="of-input" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          <button type="button" className="of-button of-button--primary" onClick={createSuite} disabled={draftIssues.length > 0}>
            <Glyph name="plus" size={12} /> Create suite
          </button>
          <button type="button" className="of-button" onClick={createOntologyEditSuite}>
            <Glyph name="shield-plus" size={12} /> Ontology edit suite
          </button>
        </section>

        <section className="of-panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow">Suites</p>
              <h2 className="of-heading-md" style={{ margin: 0 }}>List and lifecycle</h2>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={archivedSuites.length > 0} readOnly />
              Include archived
            </label>
          </div>
          <div style={{ display: 'grid', gap: 8, padding: 12 }}>
            {suites.map((suite) => (
              <button
                key={suite.id}
                type="button"
                className="of-panel-muted"
                onClick={() => {
                  setSelectedId(suite.id);
                  setName(suite.name);
                  setDescription(suite.description);
                  setDraftTargets(suite.targetFunctions);
                  setTargetKind(suite.targetFunctions[0]?.kind ?? 'logic');
                  setTargetRidValue(targetRid(suite.targetFunctions[0] ?? targetForKind('logic', '', suite.sourceSurface)));
                  setSource(suite.sourceSurface);
                }}
                style={{ padding: 10, textAlign: 'left', borderColor: selected?.id === suite.id ? 'var(--border-focus)' : 'var(--border-subtle)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong>{suite.name}</strong>
                  <span className={suite.archivedAt ? 'of-chip of-status-warning' : 'of-chip of-status-success'}>{suite.archivedAt ? 'archived' : 'active'}</span>
                </div>
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  {SOURCE_LABELS[suite.sourceSurface]} · {suite.targetFunctions.length} target{suite.targetFunctions.length === 1 ? '' : 's'} · {suite.testCases.length} case{suite.testCases.length === 1 ? '' : 's'} · {suite.objectSetBackings.length} object set{suite.objectSetBackings.length === 1 ? '' : 's'} · {suite.evaluators.length} evaluator{suite.evaluators.length === 1 ? '' : 's'}
                </p>
              </button>
            ))}
          </div>
        </section>
      </div>

      {selected ? (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow">Selected suite</p>
              <h2 className="of-heading-lg" style={{ margin: 0 }}>{selected.name}</h2>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Project {selected.projectId} · Folder {selected.folderId} · Updated {formatDate(selected.updatedAt)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' }}>
              <button type="button" className="of-button" onClick={updateSelected} disabled={draftIssues.length > 0}><Glyph name="autosaved" size={12} /> Update</button>
              <button type="button" className="of-button" onClick={moveSelected}><Glyph name="move" size={12} /> Move</button>
              <button type="button" className="of-button" onClick={duplicateSelected}><Glyph name="duplicate" size={12} /> Duplicate</button>
              {selected.archivedAt ? (
                <button type="button" className="of-button of-button--primary" onClick={() => setArchived(false)}><Glyph name="history" size={12} /> Restore</button>
              ) : (
                <button type="button" className="of-button of-btn-danger" onClick={() => setArchived(true)}><Glyph name="trash" size={12} /> Archive</button>
              )}
            </div>
          </div>

          <TestCaseEditor
            suite={selected}
            issues={selectedIssues}
            onAddManual={() => addManualTestCase('manual')}
            onAddPreview={() => addManualTestCase('logic_preview')}
            onAddSnapshotObjectSet={() => addObjectSetBackedCases('object-set-open-customers', 'snapshot')}
            onAddRefreshObjectSet={() => addObjectSetBackedCases('object-set-vip-renewals', 'refresh')}
            onRefreshObjectSets={refreshObjectSetBackedCases}
            onSuggestNames={suggestNamesForSelected}
            onMoveColumn={moveColumn}
            onAddColumn={addColumn}
            onUpdateColumn={updateColumn}
            onRemoveColumn={removeColumn}
            onUpdateTestCaseName={updateTestCaseName}
            onUpdateTestCaseValue={updateTestCaseValue}
            onRemoveTestCase={removeTestCase}
          />

          {selectedEvaluationSummary ? (
            <BuiltInEvaluatorPanel
              suite={selected}
              summary={selectedEvaluationSummary}
              marketplaceProducts={marketplaceEvaluatorProducts}
              onAddEvaluator={addBuiltInEvaluator}
              onAddCustomEvaluator={addCustomEvaluator}
              onAddMarketplaceEvaluator={addMarketplaceEvaluator}
              onOpenMarketplaceSetup={(slug) => setMarketplaceSetupSlug(slug)}
              onUpdateCustomEvaluator={updateCustomEvaluator}
              onUpdateEvaluatorKind={updateEvaluatorKind}
              onUpdateEvaluatorObjective={updateEvaluatorObjective}
              onUpdateEvaluatorConfig={updateEvaluatorConfig}
              onUpdateEvaluatorMapping={updateEvaluatorMapping}
              onRemoveEvaluator={removeEvaluator}
            />
          ) : null}

          <EvaluationRunPanel
            suite={selected}
            targetVersions={Object.fromEntries(selected.targetFunctions.map((target) => [target.id, selectedRunVersion(target)]))}
            targetModels={runModelSelections}
            includedTargetIds={selectedRunIncludedTargets(selected.id, selected.targetFunctions.map((target) => target.id))}
            computePlan={selectedComputePlan}
            iterations={runIterations}
            parallelization={runParallelization}
            executionMode={runExecutionMode}
            customLabels={runCustomLabels}
            notes={runNotes}
            onTargetVersionChange={updateRunVersion}
            onTargetModelChange={updateRunModel}
            onTargetIncludedChange={(targetId, included) => toggleRunIncludedTarget(selected.id, targetId, included)}
            onIncludeAllTargets={() => setRunIncludedTargets(selected.id, undefined)}
            onRunSuite={() => runSelectedSuite()}
            onRunTestCase={runSelectedSuite}
            onIterationsChange={setRunIterations}
            onParallelizationChange={setRunParallelization}
            onExecutionModeChange={setRunExecutionMode}
            onCustomLabelsChange={setRunCustomLabels}
            onNotesChange={setRunNotes}
          />

          {marketplaceSetupProduct ? (
            <MarketplaceEvaluatorSetupPanel
              product={marketplaceSetupProduct}
              onInstall={() => installMarketplaceEvaluator(marketplaceSetupProduct)}
              onClose={() => setMarketplaceSetupSlug('')}
            />
          ) : null}

          <ResultsTableAndDebugPanel
            suite={selected}
            debugRowKey={debugRowKey}
            onSelectDebugRow={setDebugRowKey}
            onCloseDebugRow={() => setDebugRowKey(null)}
          />

          <RunComparisonPanel
            suite={selected}
            baseRunId={compareBaseRunId}
            headRunId={compareHeadRunId}
            onBaseRunIdChange={setCompareBaseRunId}
            onHeadRunIdChange={setCompareHeadRunId}
          />

          <ResultsAnalyzerPanel
            suite={selected}
            config={analyzerConfig}
            onConfigChange={setAnalyzerConfig}
            applications={promptSuggestionApplications}
            onApplySuggestion={(category, suggestionId, notes) => {
              const latestRun = selected.runHistory[0];
              if (!latestRun) return;
              const application = trackPromptSuggestionApplication(
                { id: latestRun.id, evaluationSuiteId: selected.id },
                suggestionId,
                category,
                {
                  appliedBy: { id: CURRENT_USER_ID },
                  appliedTo: { functionRid: selected.targetFunctions[0]?.id },
                  notes,
                },
              );
              setPromptSuggestionApplications((current) => [application, ...current]);
            }}
            onLinkFollowUpRun={(applicationId, followUpRunId) => {
              setPromptSuggestionApplications((current) => current.map((application) => (application.id === applicationId ? { ...application, followUpRunId } : application)));
            }}
            onRemoveApplication={(applicationId) => {
              setPromptSuggestionApplications((current) => current.filter((application) => application.id !== applicationId));
            }}
          />

          <EvalExperimentsPanel
            suite={selected}
            dimensions={experimentDimensions}
            maxRuns={experimentMaxRuns}
            results={experimentResults?.plan && experimentResults.runs[0]?.combination ? experimentResults : undefined}
            onDimensionsChange={setExperimentDimensions}
            onMaxRunsChange={setExperimentMaxRuns}
            onRunExperiment={(config) => setExperimentResults(runEvaluationExperiment(selected, config))}
            onClearResults={() => setExperimentResults(null)}
          />

          <PublishGatesPanel
            suites={suites}
            surface={gateSurface}
            requirement={gateRequirement}
            waivers={gateWaivers}
            onSurfaceChange={setGateSurface}
            onRequirementChange={setGateRequirement}
            onAddWaiver={(ruleField, reason) => {
              const waiver = recordLogicPublishGateWaiver({
                ruleField,
                reviewerId: CURRENT_USER_ID,
                reason,
              });
              setGateWaivers((current) => [waiver, ...current.filter((entry) => entry.ruleField !== ruleField)]);
            }}
            onRemoveWaiver={(waiverId) => setGateWaivers((current) => current.filter((entry) => entry.id !== waiverId))}
          />

          <EvalScheduleMonitoringPanel
            suites={suites}
            schedules={schedules}
            onAddSchedule={(input) => setSchedules((current) => [createEvalScheduleConfig(input), ...current])}
            onRemoveSchedule={(id) => setSchedules((current) => current.filter((schedule) => schedule.id !== id))}
            onToggleSchedule={(id) => setSchedules((current) => current.map((schedule) => schedule.id === id ? { ...schedule, enabled: !schedule.enabled } : schedule))}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <SuiteJsonBlock title="Target functions" value={selected.targetFunctions} />
            <SuiteJsonBlock title="Test case columns" value={selected.testCaseColumns} />
            <SuiteJsonBlock title="Test cases" value={selected.testCases} />
            <SuiteJsonBlock title="Object set sources" value={selected.objectSetBackings} />
            <SuiteJsonBlock title="Evaluators" value={selected.evaluators} />
            <SuiteJsonBlock title="Run history" value={selected.runHistory} />
            <SuiteJsonBlock title="Results dataset" value={{ rid: selected.resultsDatasetRid }} />
            <SuiteJsonBlock title="Permissions" value={selected.permissions} />
          </div>
        </section>
      ) : null}

      <MetricsDashboardPanel
        suites={suites}
        filters={dashboardFilters}
        onFiltersChange={setDashboardFilters}
      />
    </section>
  );
}

function TargetList({ targets, onRemove }: {
  targets: EvaluationTargetFunction[];
  onRemove: (id: string) => void;
}) {
  if (targets.length === 0) {
    return <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No target functions configured.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {targets.map((target) => (
        <div key={target.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
            <div>
              <strong>{target.id}</strong>
              <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                {TARGET_KIND_LABELS[target.kind]} · {target.version} · {target.signature.inputs.length} input{target.signature.inputs.length === 1 ? '' : 's'} / {target.signature.outputs.length} output{target.signature.outputs.length === 1 ? '' : 's'}
              </p>
            </div>
            <button type="button" className="of-button" onClick={() => onRemove(target.id)}>
              <Glyph name="trash" size={12} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {target.signature.outputs.map((output) => (
              <span key={signatureName(output)} className="of-chip">{signatureName(output)}:{output.outputType ?? output.type}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TestCaseEditor({ suite, issues, onAddManual, onAddPreview, onAddSnapshotObjectSet, onAddRefreshObjectSet, onRefreshObjectSets, onSuggestNames, onMoveColumn, onAddColumn, onUpdateColumn, onRemoveColumn, onUpdateTestCaseName, onUpdateTestCaseValue, onRemoveTestCase }: {
  suite: LocalEvaluationSuite;
  issues: string[];
  onAddManual: () => void;
  onAddPreview: () => void;
  onAddSnapshotObjectSet: () => void;
  onAddRefreshObjectSet: () => void;
  onRefreshObjectSets: () => void;
  onSuggestNames: () => void;
  onMoveColumn: (apiName: string, direction: -1 | 1) => void;
  onAddColumn: (role: EvaluationSuiteColumn['role']) => void;
  onUpdateColumn: (apiName: string, patch: Partial<EvaluationSuiteColumn>) => void;
  onRemoveColumn: (apiName: string) => void;
  onUpdateTestCaseName: (testCaseId: string, value: string) => void;
  onUpdateTestCaseValue: (testCaseId: string, column: EvaluationSuiteColumn, value: string) => void;
  onRemoveTestCase: (testCaseId: string) => void;
}) {
  const objectSetCaseCount = suite.testCases.filter((testCase) => testCase.source === 'object_set').length;
  return (
    <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <p className="of-eyebrow">Test cases</p>
          <strong>{suite.testCases.length} cases · {objectSetCaseCount} object-set backed · {suite.testCaseColumns.length} columns</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="of-button" onClick={onAddManual}><Glyph name="plus" size={12} /> Add case</button>
          <button type="button" className="of-button" onClick={onAddPreview}><Glyph name="run" size={12} /> Add preview case</button>
          <button type="button" className="of-button" onClick={onAddSnapshotObjectSet}><Glyph name="database" size={12} /> Snapshot object set</button>
          <button type="button" className="of-button" onClick={onAddRefreshObjectSet}><Glyph name="database" size={12} /> Refresh object set</button>
          <button type="button" className="of-button" onClick={onRefreshObjectSets} disabled={suite.objectSetBackings.length === 0}><Glyph name="history" size={12} /> Recompute object rows</button>
          <button type="button" className="of-button" onClick={onSuggestNames}><Glyph name="sparkles" size={12} /> Suggest names</button>
          <button type="button" className="of-button" onClick={() => onAddColumn('expected_output')}><Glyph name="plus" size={12} /> Expected column</button>
          <button type="button" className="of-button" onClick={() => onAddColumn('metadata')}><Glyph name="plus" size={12} /> Metadata column</button>
        </div>
      </div>

      {issues.length > 0 ? (
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4, borderColor: 'var(--status-warning)' }}>
          {issues.slice(0, 5).map((issue) => <span key={issue} className="of-text-muted" style={{ fontSize: 12 }}>{issue}</span>)}
          {issues.length > 5 ? <span className="of-text-muted" style={{ fontSize: 12 }}>{issues.length - 5} more validation issues</span> : null}
        </div>
      ) : (
        <span className="of-chip of-status-success">Columns and cases validate against target signatures</span>
      )}

      {suite.objectSetBackings.length > 0 ? (
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <p className="of-eyebrow">Object set sources</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {suite.objectSetBackings.map((backing) => (
              <span key={backing.id} className="of-chip">
                {backing.objectSetName} · {backing.refreshMode} · {suite.testCases.filter((testCase) => testCase.object_set_backing_id === backing.id).length} rows
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
        {suite.testCaseColumns.map((column, index) => (
          <div key={column.apiName} className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
              <div>
                <strong>{column.name}</strong>
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{column.apiName}</p>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="of-button" onClick={() => onMoveColumn(column.apiName, -1)} disabled={index === 0}>Up</button>
                <button type="button" className="of-button" onClick={() => onMoveColumn(column.apiName, 1)} disabled={index === suite.testCaseColumns.length - 1}>Down</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <select className="of-input" value={column.type} onChange={(event) => onUpdateColumn(column.apiName, { type: event.target.value })}>
                {COLUMN_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select className="of-input" value={column.role} onChange={(event) => onUpdateColumn(column.apiName, { role: event.target.value })}>
                {Object.entries(COLUMN_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <button type="button" className="of-button" onClick={() => onRemoveColumn(column.apiName)}>
              <Glyph name="trash" size={12} /> Remove
            </button>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border-subtle)', minWidth: 180 }}>Name</th>
              {suite.testCaseColumns.map((column) => (
                <th key={column.apiName} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border-subtle)', minWidth: 160 }}>
                  {column.name}
                </th>
              ))}
              <th style={{ width: 72, borderBottom: '1px solid var(--border-subtle)' }} />
            </tr>
          </thead>
          <tbody>
            {suite.testCases.map((testCase) => (
              <tr key={testCase.id}>
                <td style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' }}>
                  <input className="of-input" value={testCase.name} onChange={(event) => onUpdateTestCaseName(testCase.id, event.target.value)} />
                  {testCase.generated_name_hint ? <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>{testCase.generated_name_hint}</p> : null}
                  {testCase.source === 'object_set' ? (
                    <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>
                      {String(testCase.metadata?.object_set_name ?? 'Object set')} · {String(testCase.metadata?.object_id ?? '')}
                    </p>
                  ) : null}
                </td>
                {suite.testCaseColumns.map((column) => (
                  <td key={`${testCase.id}-${column.apiName}`} style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' }}>
                    <input
                      className="of-input"
                      value={valueToInput(testCase.values[column.apiName] ?? '')}
                      onChange={(event) => onUpdateTestCaseValue(testCase.id, column, event.target.value)}
                    />
                  </td>
                ))}
                <td style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' }}>
                  <button type="button" className="of-button" onClick={() => onRemoveTestCase(testCase.id)}>
                    <Glyph name="trash" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function percentLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

function computeSecondsLabel(value: number) {
  return `${Math.round(value).toLocaleString()} compute-sec`;
}

function numericInputValue(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function numberOrUndefined(value: string) {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function statusChipClass(passed: boolean) {
  return `of-chip ${passed ? 'of-status-success' : 'of-status-danger'}`;
}

function metricResultLabel(metric: { evaluator: string; metricName?: string; customFunctionRid?: string }) {
  if (metric.customFunctionRid) return `${metric.customFunctionRid} · ${metric.metricName ?? 'metric'}`;
  return evaluatorDisplayName(metric.evaluator);
}

function evaluatorConfig(evaluator: EvaluationEvaluator) {
  return evaluator.config ?? {};
}

function evaluatorObjective(evaluator: EvaluationEvaluator) {
  return evaluator.objective ?? {};
}

function EvaluationRunPanel({
  suite,
  targetVersions,
  targetModels,
  includedTargetIds,
  computePlan,
  iterations,
  parallelization,
  executionMode,
  customLabels,
  notes,
  onTargetVersionChange,
  onTargetModelChange,
  onTargetIncludedChange,
  onIncludeAllTargets,
  onRunSuite,
  onRunTestCase,
  onIterationsChange,
  onParallelizationChange,
  onExecutionModeChange,
  onCustomLabelsChange,
  onNotesChange,
}: {
  suite: LocalEvaluationSuite;
  targetVersions: Record<string, string>;
  targetModels: Record<string, string>;
  includedTargetIds: string[];
  computePlan?: LogicComputeUsageSummary;
  iterations: number;
  parallelization: number;
  executionMode: 'user_scoped' | 'project_scoped';
  customLabels: string;
  notes: string;
  onTargetVersionChange: (targetId: string, version: string) => void;
  onTargetModelChange: (targetId: string, model: string) => void;
  onTargetIncludedChange: (targetId: string, included: boolean) => void;
  onIncludeAllTargets: () => void;
  onRunSuite: () => void;
  onRunTestCase: (testCaseId: string) => void;
  onIterationsChange: (value: number) => void;
  onParallelizationChange: (value: number) => void;
  onExecutionModeChange: (value: 'user_scoped' | 'project_scoped') => void;
  onCustomLabelsChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  const latestRun = suite.runHistory[0];
  const simulationRows = latestRun?.resultDatasetRows.filter((row) => row.ontologySimulation) ?? [];
  const includedSet = new Set(includedTargetIds);
  const multiTargetCapabilities = evaluationRunMultiTargetCapabilities(suite, { targetIds: includedTargetIds });
  const comparison = latestRun?.multiTargetComparison;
  const resultsDatasetWrite = latestRun?.resultsDatasetWrite;
  return (
    <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <p className="of-eyebrow">Run configuration</p>
          <strong>{latestRun ? `${percentLabel(latestRun.passRate)} latest pass rate` : 'No suite run yet'}</strong>
          {computePlan ? (
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
              Estimated {computeSecondsLabel(computePlan.totalComputeSeconds)} before run · {computePlan.runCount} invocation{computePlan.runCount === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
        <button type="button" className="of-button of-button--primary" onClick={onRunSuite}>
          <Glyph name="run" size={12} /> Run evaluation suite
        </button>
      </div>

      {computePlan?.warnings.length ? (
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4, borderColor: 'var(--status-warning)' }}>
          {computePlan.warnings.map((warning) => (
            <span key={`${warning.field}-${warning.message}`} className="of-text-muted" style={{ fontSize: 12 }}>{warning.message}</span>
          ))}
        </div>
      ) : null}

      {latestRun?.warnings?.length ? (
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4, borderColor: 'var(--status-warning)' }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Run warnings</p>
          {latestRun.warnings.map((warning) => (
            <span key={`${warning.code}-${warning.targetId ?? ''}`} className="of-text-muted" style={{ fontSize: 12 }}>{warning.message}</span>
          ))}
        </div>
      ) : null}

      <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 10 }}>
        <p className="of-eyebrow">Run options</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Iterations</span>
            <input
              className="of-input"
              type="number"
              min={1}
              max={10}
              value={iterations}
              onChange={(event) => onIterationsChange(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Test parallelization</span>
            <input
              className="of-input"
              type="number"
              min={1}
              max={32}
              value={parallelization}
              onChange={(event) => onParallelizationChange(Math.max(1, Math.min(32, Number(event.target.value) || 1)))}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Execution mode</span>
            <select
              className="of-input"
              value={executionMode}
              onChange={(event) => onExecutionModeChange(event.target.value as 'user_scoped' | 'project_scoped')}
            >
              <option value="user_scoped">User scoped</option>
              <option value="project_scoped">Project scoped</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Custom labels (comma-separated)</span>
            <input
              className="of-input"
              type="text"
              placeholder="regression, sla-checks"
              value={customLabels}
              onChange={(event) => onCustomLabelsChange(event.target.value)}
            />
          </label>
        </div>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Run notes</span>
          <input
            className="of-input"
            type="text"
            placeholder="Why this run is being scheduled"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
          />
        </label>
      </div>

      <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Included targets ({includedTargetIds.length}/{suite.targetFunctions.length})</p>
          <button
            type="button"
            className="of-button"
            onClick={onIncludeAllTargets}
            disabled={includedTargetIds.length === suite.targetFunctions.length}
          >
            Include all targets
          </button>
        </div>
        {multiTargetCapabilities.multiTarget ? (
          <div className="of-text-muted" style={{ fontSize: 12 }}>
            Multi-target run · the following experiment options are disabled: {multiTargetCapabilities.disabledExperimentOptions.map((option) => option.option).join(', ')}.
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {suite.targetFunctions.map((target) => {
            const isIncluded = includedSet.has(target.id);
            return (
              <div key={target.id} className="of-panel" style={{ padding: 10, display: 'grid', gap: 6, opacity: isIncluded ? 1 : 0.55 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isIncluded}
                    onChange={(event) => onTargetIncludedChange(target.id, event.target.checked)}
                  />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{target.id}</span>
                </label>
                <span className="of-text-muted" style={{ fontSize: 12 }}>{TARGET_KIND_LABELS[target.kind]}</span>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span className="of-eyebrow" style={{ fontSize: 11 }}>Target version</span>
                  <select
                    className="of-input"
                    value={targetVersions[target.id] ?? defaultEvaluationTargetVersion(target)}
                    onChange={(event) => onTargetVersionChange(target.id, event.target.value)}
                    disabled={!isIncluded}
                  >
                    {evaluationTargetVersionOptions(target).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span className="of-eyebrow" style={{ fontSize: 11 }}>Model override</span>
                  <input
                    className="of-input"
                    type="text"
                    value={targetModels[target.id] ?? ''}
                    onChange={(event) => onTargetModelChange(target.id, event.target.value)}
                    placeholder="e.g. gpt-4.1-mini"
                    disabled={!isIncluded}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <p className="of-eyebrow">Single test case execution</p>
        {suite.testCases.map((testCase) => {
          const result = latestRun?.testCaseResults.find((candidate) => candidate.testCaseId === testCase.id);
          return (
            <div key={testCase.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto auto', gap: 8, alignItems: 'center' }}>
              <div>
                <strong>{testCase.name}</strong>
                <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>{testCase.id}</p>
              </div>
              <span className={result ? statusChipClass(result.passed) : 'of-chip'}>{result ? (result.passed ? 'passed' : 'failed') : 'not run'}</span>
              <button type="button" className="of-button" onClick={() => onRunTestCase(testCase.id)}>
                <Glyph name="run" size={12} /> Run case
              </button>
            </div>
          );
        })}
      </div>

      {latestRun ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.8fr) minmax(320px, 1fr) minmax(260px, 0.8fr)', gap: 10 }}>
          <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <p className="of-eyebrow">Run result</p>
            <span className={latestRun.status === 'error' ? 'of-chip of-status-danger' : latestRun.passed ? 'of-chip of-status-success' : 'of-chip of-status-warning'}>
              {latestRun.status === 'error' ? 'error' : latestRun.passed ? 'passed' : 'failed'}
            </span>
            <strong>{latestRun.passCount}/{latestRun.totalCount} test cases</strong>
            <span className="of-text-muted" style={{ fontSize: 12 }}>{latestRun.durationMs} ms · {formatDate(latestRun.completedAtIso)}</span>
            <span className="of-text-muted" style={{ fontSize: 12 }}>{computeSecondsLabel(latestRun.computeUsage.totalComputeSeconds)} metered · {computeSecondsLabel(latestRun.computeUsage.evaluatorComputeSeconds)} evaluator work</span>
            <span className="of-text-muted" style={{ fontSize: 12 }}>Iterations {latestRun.config.iterations} · parallelization {latestRun.config.parallelization} · {latestRun.config.executionMode.replaceAll('_', ' ')} · {latestRun.config.source.replaceAll('_', ' ')}</span>
            {latestRun.config.metadata?.runInitiator ? (
              <span className="of-text-muted" style={{ fontSize: 12 }}>Run initiator {latestRun.config.metadata.runInitiator.id}{latestRun.config.metadata.runInitiator.name ? ` (${latestRun.config.metadata.runInitiator.name})` : ''}</span>
            ) : null}
            {latestRun.config.metadata?.customLabels?.length ? (
              <span className="of-text-muted" style={{ fontSize: 12 }}>Labels: {latestRun.config.metadata.customLabels.join(', ')}</span>
            ) : null}
            {latestRun.errors.map((error) => <span key={error.message} className="of-status-danger" style={{ padding: '6px 8px', borderRadius: 4, fontSize: 12 }}>{error.message}</span>)}
          </div>
          <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <p className="of-eyebrow">Metric results</p>
            {latestRun.metricResults.map((metric) => (
              <div key={`${latestRun.id}-${metric.evaluatorId}-${metric.targetId}-${metric.metricName ?? metric.evaluator}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                <span>{metricResultLabel(metric)} · {metric.targetId}</span>
                <span className={statusChipClass(metric.passed)}>{metric.passCount}/{metric.totalCount}</span>
              </div>
            ))}
          </div>
          <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <p className="of-eyebrow">Debugger links</p>
            {latestRun.debuggerLinks.map((link) => (
              <a key={`${link.testCaseId}-${link.targetId}`} className="of-button" href={link.href} style={{ justifyContent: 'space-between' }}>
                <span>{link.testCaseId} · {link.targetId}</span>
                <span className="of-text-soft">Open</span>
              </a>
            ))}
            {latestRun.customEvaluatorDebugOutputs?.length ? (
              <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 4 }}>
                <p className="of-eyebrow">Custom evaluator debug outputs</p>
                {latestRun.customEvaluatorDebugOutputs.slice(0, 6).map((debugOutput) => (
                  <span key={`${debugOutput.evaluatorId}-${debugOutput.testCaseId}-${debugOutput.targetId}-${debugOutput.iteration ?? 1}-${debugOutput.name}`} className="of-text-muted" style={{ fontSize: 11 }}>
                    {debugOutput.name} · {debugOutput.testCaseId} · {debugOutput.value}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {comparison && comparison.targetSummaries.length > 0 ? (
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow">Multi-target comparison</p>
              <strong>{comparison.multiTarget ? `${comparison.targetSummaries.length} targets compared` : 'Single-target run'}</strong>
              {comparison.bestTargetId ? (
                <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
                  Best: {comparison.bestTargetId}{comparison.worstTargetId ? ` · Worst: ${comparison.worstTargetId}` : ''}
                </p>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {comparison.targetSummaries.map((target) => (
              <div key={`${latestRun?.id}-summary-${target.targetId}`} className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 5 }}>
                <strong>{target.targetId}</strong>
                <span className="of-text-muted" style={{ fontSize: 12 }}>
                  {TARGET_KIND_LABELS[target.kind] ?? target.kind} · version {target.version}{target.model ? ` · ${target.model}` : ''}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className={statusChipClass(target.passCount === target.totalCount && target.totalCount > 0)}>{target.passCount}/{target.totalCount} passed</span>
                  <span className="of-chip">{percentLabel(target.passRate)} pass rate</span>
                </div>
              </div>
            ))}
          </div>
          {comparison.metricComparisons.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 5 }}>
              <p className="of-eyebrow">Metric comparison</p>
              {comparison.metricComparisons.slice(0, 6).map((metric) => (
                <div key={`${latestRun?.id}-metric-${metric.evaluatorId}-${metric.metricName}`} style={{ display: 'grid', gap: 3 }}>
                  <strong style={{ fontSize: 12 }}>{metric.metricName} · {metric.evaluatorId}</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {metric.perTarget.map((row) => (
                      <span
                        key={`${latestRun?.id}-metric-${metric.evaluatorId}-${metric.metricName}-${row.targetId}`}
                        className={statusChipClass(row.passCount === row.totalCount && row.totalCount > 0)}
                      >
                        {row.targetId}: {row.passCount}/{row.totalCount}{row.average !== undefined ? ` (avg ${row.average.toFixed(2)})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {resultsDatasetWrite ? (
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow">Results dataset</p>
              <strong>{resultsDatasetWrite.written ? `${resultsDatasetWrite.rows.length} row${resultsDatasetWrite.rows.length === 1 ? '' : 's'} written` : 'No rows written'}</strong>
              <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
                {resultsDatasetWrite.config.datasetRid}
                {resultsDatasetWrite.config.projectId ? ` · project ${resultsDatasetWrite.config.projectId}` : ''}
                {' · max '}
                {resultsDatasetWrite.config.maxRows.toLocaleString()} rows
              </p>
            </div>
            <span className={`of-chip ${resultsDatasetWrite.written ? 'of-status-success' : 'of-status-warning'}`}>
              {resultsDatasetWrite.written
                ? 'project-scoped run'
                : resultsDatasetWrite.reason === 'user_scoped_execution_skipped'
                  ? 'skipped: user-scoped'
                  : resultsDatasetWrite.reason === 'no_project_id'
                    ? 'skipped: no project'
                    : resultsDatasetWrite.reason === 'no_supported_target_outputs'
                      ? 'skipped: ontology edits only'
                      : 'pending'}
            </span>
          </div>
          {resultsDatasetWrite.config.unsupportedTargets.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Unsupported targets</p>
              {resultsDatasetWrite.config.unsupportedTargets.map((target) => (
                <span key={target.targetId} className="of-text-muted" style={{ fontSize: 12 }}>
                  {target.targetId} · {target.message}
                </span>
              ))}
            </div>
          ) : null}
          <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Schema ({resultsDatasetWrite.config.schema.length} columns)</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {resultsDatasetWrite.config.schema.map((column) => (
                <span key={column.name} className="of-chip">{column.name}{column.permissionScoped ? ' · scoped' : ''}</span>
              ))}
            </div>
          </div>
          {resultsDatasetWrite.written && resultsDatasetWrite.rows[0] ? (
            <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Latest dataset row</p>
              <pre style={{ margin: 0, maxHeight: 220, overflow: 'auto', fontSize: 12 }}>
                {JSON.stringify(resultsDatasetWrite.rows[0], null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
      {simulationRows.length > 0 ? (
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow">Ontology simulation</p>
              <strong>{simulationRows.length} simulated target execution{simulationRows.length === 1 ? '' : 's'}</strong>
            </div>
            <span className="of-chip of-status-success">real Ontology unchanged</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
            {simulationRows.slice(0, 4).map((row) => {
              const simulation = row.ontologySimulation;
              return simulation ? (
                <div key={`${row.id}-${simulation.id}`} className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 5 }}>
                  <strong>{row.testCaseId}</strong>
                  <span className="of-text-muted" style={{ fontSize: 12 }}>{simulation.id}</span>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <span className="of-chip">{simulation.createdObjects.length} created</span>
                    <span className="of-chip">{simulation.editedObjects.length} edited</span>
                    <span className="of-chip">{simulation.deletedObjects.length} deleted</span>
                    <span className="of-chip">{simulation.safety.writesCommitted ? 'writes committed' : 'no writes'}</span>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BuiltInEvaluatorPanel({
  suite,
  summary,
  marketplaceProducts,
  onAddEvaluator,
  onAddCustomEvaluator,
  onAddMarketplaceEvaluator,
  onOpenMarketplaceSetup,
  onUpdateCustomEvaluator,
  onUpdateEvaluatorKind,
  onUpdateEvaluatorObjective,
  onUpdateEvaluatorConfig,
  onUpdateEvaluatorMapping,
  onRemoveEvaluator,
}: {
  suite: LocalEvaluationSuite;
  summary: BuiltInEvaluationSummary;
  marketplaceProducts: MarketplaceEvaluatorCatalogEntry[];
  onAddEvaluator: (evaluatorName: BuiltInEvaluatorName) => void;
  onAddCustomEvaluator: (functionKind: CustomEvaluatorFunctionKind) => void;
  onAddMarketplaceEvaluator: (product: MarketplaceEvaluatorProduct) => void;
  onOpenMarketplaceSetup: (slug: MarketplaceEvaluatorSlug) => void;
  onUpdateCustomEvaluator: (evaluatorId: string, patch: Partial<EvaluationEvaluator>) => void;
  onUpdateEvaluatorKind: (evaluatorId: string, evaluatorName: BuiltInEvaluatorName) => void;
  onUpdateEvaluatorObjective: (evaluatorId: string, patch: Record<string, unknown>) => void;
  onUpdateEvaluatorConfig: (evaluatorId: string, key: string, value: unknown) => void;
  onUpdateEvaluatorMapping: (evaluatorId: string, targetId: string, field: 'actual' | 'expected', value: string) => void;
  onRemoveEvaluator: (evaluatorId: string) => void;
}) {
  const [selectedEvaluator, setSelectedEvaluator] = useState<BuiltInEvaluatorName>('regex');
  const expectedColumns = suite.testCaseColumns.filter((column) => column.role === 'expected_output');
  return (
    <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <p className="of-eyebrow">Evaluators</p>
          <strong>{suite.evaluators.length} evaluators · {summary.passCount}/{summary.totalCount} cases passed</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={summary.passRate === 1 ? 'of-chip of-status-success' : 'of-chip of-status-warning'}>{percentLabel(summary.passRate)} suite pass rate</span>
          <select className="of-input" value={selectedEvaluator} onChange={(event) => setSelectedEvaluator(event.target.value as BuiltInEvaluatorName)} style={{ minWidth: 180 }}>
            {BUILT_IN_EVALUATOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" className="of-button" onClick={() => onAddEvaluator(selectedEvaluator)}>
            <Glyph name="plus" size={12} /> Add built-in
          </button>
          {CUSTOM_EVALUATOR_KIND_OPTIONS.map((option) => (
            <button key={option.value} type="button" className="of-button" onClick={() => onAddCustomEvaluator(option.value)}>
              <Glyph name="code" size={12} /> Add {option.value}
            </button>
          ))}
        </div>
      </div>

      <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p className="of-eyebrow">Marketplace deployed evaluators</p>
            <strong>{marketplaceProducts.filter((product) => product.installed).length}/{marketplaceProducts.length} installed</strong>
          </div>
          <a className="of-button" href="/marketplace?category=ai-agent">
            <Glyph name="external-link" size={12} /> Marketplace
          </a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
          {marketplaceProducts.map((product) => (
            <div key={product.slug} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
                <div>
                  <strong>{product.name}</strong>
                  <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>{product.summary}</p>
                </div>
                <span className={product.installed ? 'of-chip of-status-success' : 'of-chip of-status-warning'}>
                  {product.installed ? 'installed' : 'setup'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {product.capabilities.slice(0, 3).map((capability) => <span key={capability} className="of-chip">{capability}</span>)}
              </div>
              <button
                type="button"
                className={product.installed ? 'of-button' : 'of-button of-button--primary'}
                onClick={() => (product.installed ? onAddMarketplaceEvaluator(product) : onOpenMarketplaceSetup(product.slug))}
              >
                <Glyph name={product.installed ? 'plus' : 'shield-plus'} size={12} />
                {product.installed ? 'Add evaluator' : 'Setup package'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {suite.evaluators.map((evaluator) => {
          if (isCustomEvaluationFunction(evaluator)) {
            const functionKind = customEvaluatorFunctionKind(evaluator);
            const selectedFunctionKind = CUSTOM_EVALUATOR_KIND_OPTIONS.some((option) => option.value === functionKind) ? functionKind as CustomEvaluatorFunctionKind : 'typescript';
            const mappings = evaluatorMappings(evaluator, suite.targetFunctions);
            const metricDefinitions = customEvaluatorMetricDefinitions(evaluator);
            const debugDefinitions = customEvaluatorDebugDefinitions(evaluator);
            const validationIssues = validateCustomEvaluationFunction(evaluator);
            const marketplaceSlug = String(evaluator.marketplace_product_slug ?? evaluator.marketplaceProductSlug ?? '');
            const marketplaceProduct = marketplaceEvaluatorProductBySlug(marketplaceSlug);
            return (
              <div key={evaluator.id} className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(170px, 0.7fr) minmax(140px, 0.45fr) auto', gap: 8, alignItems: 'end' }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Published evaluator function</span>
                    <input
                      className="of-input"
                      value={customEvaluatorFunctionRid(evaluator)}
                      onChange={(event) => onUpdateCustomEvaluator(evaluator.id, { evaluator: event.target.value, function_rid: event.target.value })}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Function kind</span>
                    <select className="of-input" value={selectedFunctionKind} onChange={(event) => onUpdateCustomEvaluator(evaluator.id, { function_kind: event.target.value })}>
                      {CUSTOM_EVALUATOR_KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Version</span>
                    <select className="of-input" value={String(evaluator.version ?? 'published')} onChange={(event) => onUpdateCustomEvaluator(evaluator.id, { version: event.target.value })}>
                      <option value="published">published</option>
                    </select>
                  </label>
                  <button type="button" className="of-button of-btn-danger" onClick={() => onRemoveEvaluator(evaluator.id)}>
                    <Glyph name="trash" size={12} /> Remove
                  </button>
                </div>
                {marketplaceProduct ? (
                  <div className="of-panel-muted" style={{ padding: 8, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="of-chip of-status-success">Marketplace · {marketplaceProduct.name}</span>
                    <span className="of-text-muted" style={{ fontSize: 12 }}>
                      {marketplaceProduct.dependencies.length} package dependencies · {String(evaluator.marketplace_install_status ?? 'installed')}
                    </span>
                  </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                  <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 5 }}>
                    <p className="of-eyebrow">Metric returns</p>
                    {metricDefinitions.length ? metricDefinitions.map((definition) => (
                      <span key={`${evaluator.id}-${definition.name}`} className="of-chip of-status-success">
                        {definition.name} · {definition.metricKind}
                      </span>
                    )) : <span className="of-status-danger" style={{ padding: '6px 8px', borderRadius: 4, fontSize: 12 }}>needs Boolean or numeric metric</span>}
                  </div>
                  <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 5 }}>
                    <p className="of-eyebrow">Debug returns</p>
                    {debugDefinitions.length ? debugDefinitions.map((definition) => (
                      <span key={`${evaluator.id}-${definition.name}`} className="of-chip">
                        {definition.name} · debug string
                      </span>
                    )) : <span className="of-text-muted" style={{ fontSize: 12 }}>No string debug outputs</span>}
                  </div>
                  {validationIssues.length ? (
                    <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 4, borderColor: 'var(--status-danger)' }}>
                      <p className="of-eyebrow">Validation</p>
                      {validationIssues.map((issue) => <span key={issue} className="of-text-muted" style={{ fontSize: 12 }}>{issue}</span>)}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {suite.targetFunctions.map((target) => {
                    const mapping = mappings[target.id] ?? { actual: firstOutputName(target), expected: expectedColumns[0]?.apiName ?? '' };
                    return (
                      <div key={`${evaluator.id}-${target.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.8fr) 1fr 1fr', gap: 8, alignItems: 'center' }}>
                        <span className="of-chip">{target.id}</span>
                        <select className="of-input" value={mapping.actual ?? ''} onChange={(event) => onUpdateEvaluatorMapping(evaluator.id, target.id, 'actual', event.target.value)}>
                          {target.signature.outputs.map((output) => {
                            const outputName = signatureName(output);
                            return <option key={outputName} value={outputName}>{outputName}</option>;
                          })}
                        </select>
                        <select className="of-input" value={mapping.expected ?? ''} onChange={(event) => onUpdateEvaluatorMapping(evaluator.id, target.id, 'expected', event.target.value)}>
                          {expectedColumns.map((column) => <option key={column.apiName} value={column.apiName}>{column.apiName}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
          const option = builtInEvaluatorOption(evaluator.evaluator);
          const objective = evaluatorObjective(evaluator);
          const config = evaluatorConfig(evaluator);
          const mappings = evaluatorMappings(evaluator, suite.targetFunctions);
          const booleanObjective = typeof objective.target === 'boolean' || typeof option.defaultObjective.target === 'boolean';
          const rangeEvaluator = ['integer_range', 'numeric_range', 'floating_point_range'].includes(option.value);
          return (
            <div key={evaluator.id} className="of-panel" style={{ padding: 12, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 0.7fr) minmax(220px, 1fr) auto', gap: 8, alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Evaluator</span>
                  <select className="of-input" value={option.value} onChange={(event) => onUpdateEvaluatorKind(evaluator.id, event.target.value as BuiltInEvaluatorName)}>
                    {BUILT_IN_EVALUATOR_OPTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                  </select>
                </label>
                <div style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Objective</span>
                  {booleanObjective ? (
                    <select className="of-input" value={String(objective.target ?? true)} onChange={(event) => onUpdateEvaluatorObjective(evaluator.id, { target: event.target.value === 'true' })}>
                      <option value="true">metric is true</option>
                      <option value="false">metric is false</option>
                    </select>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <select className="of-input" value={String(objective.direction ?? 'maximize')} onChange={(event) => onUpdateEvaluatorObjective(evaluator.id, { direction: event.target.value })}>
                        <option value="maximize">maximize</option>
                        <option value="minimize">minimize</option>
                      </select>
                      <input
                        className="of-input"
                        type="number"
                        value={numericInputValue(objective.threshold)}
                        onChange={(event) => onUpdateEvaluatorObjective(evaluator.id, { threshold: numberOrUndefined(event.target.value) })}
                        placeholder="threshold"
                      />
                    </div>
                  )}
                </div>
                <button type="button" className="of-button of-btn-danger" onClick={() => onRemoveEvaluator(evaluator.id)}>
                  <Glyph name="trash" size={12} /> Remove
                </button>
              </div>

              {option.value === 'regex' ? (
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Regex pattern</span>
                  <input className="of-input" value={String(config.pattern ?? '')} onChange={(event) => onUpdateEvaluatorConfig(evaluator.id, 'pattern', event.target.value)} />
                </label>
              ) : null}
              {option.value === 'keyword' ? (
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Keywords</span>
                  <input className="of-input" value={Array.isArray(config.keywords) ? config.keywords.join(', ') : String(config.keywords ?? '')} onChange={(event) => onUpdateEvaluatorConfig(evaluator.id, 'keywords', event.target.value)} />
                </label>
              ) : null}
              {rangeEvaluator || option.value === 'temporal_range' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Minimum</span>
                    <input
                      className="of-input"
                      type={option.value === 'temporal_range' ? 'text' : 'number'}
                      value={numericInputValue(config.min)}
                      onChange={(event) => onUpdateEvaluatorConfig(evaluator.id, 'min', option.value === 'temporal_range' ? event.target.value : numberOrUndefined(event.target.value))}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Maximum</span>
                    <input
                      className="of-input"
                      type={option.value === 'temporal_range' ? 'text' : 'number'}
                      value={numericInputValue(config.max)}
                      onChange={(event) => onUpdateEvaluatorConfig(evaluator.id, 'max', option.value === 'temporal_range' ? event.target.value : numberOrUndefined(event.target.value))}
                    />
                  </label>
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 8 }}>
                {suite.targetFunctions.map((target) => {
                  const mapping = mappings[target.id] ?? { actual: firstOutputName(target), expected: expectedColumns[0]?.apiName ?? '' };
                  return (
                    <div key={`${evaluator.id}-${target.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.8fr) 1fr 1fr', gap: 8, alignItems: 'center' }}>
                      <span className="of-chip">{target.id}</span>
                      <select className="of-input" value={mapping.actual ?? ''} onChange={(event) => onUpdateEvaluatorMapping(evaluator.id, target.id, 'actual', event.target.value)}>
                        {target.signature.outputs.map((output) => {
                          const outputName = signatureName(output);
                          return <option key={outputName} value={outputName}>{outputName}</option>;
                        })}
                      </select>
                      <select className="of-input" value={mapping.expected ?? ''} onChange={(event) => onUpdateEvaluatorMapping(evaluator.id, target.id, 'expected', event.target.value)}>
                        {expectedColumns.map((column) => <option key={column.apiName} value={column.apiName}>{column.apiName}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow">Metric level</p>
          {summary.metricResults.map((metric) => (
            <div key={`${metric.evaluatorId}-${metric.targetId}-${metric.metricName ?? metric.evaluator}`} style={{ display: 'grid', gap: 3 }}>
              <span className={statusChipClass(metric.passed)}>{metricResultLabel(metric)} · {percentLabel(metric.passRate)}</span>
              <span className="of-text-muted" style={{ fontSize: 11 }}>{metric.targetId} · {metric.passCount}/{metric.totalCount}</span>
            </div>
          ))}
        </div>
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow">Iteration level</p>
          {summary.iterationResults.slice(0, 8).map((iteration) => (
            <span key={iteration.id} className={statusChipClass(iteration.passed)}>
              {iteration.testCaseId} · {iteration.targetId} · {iteration.metrics.length} metrics{iteration.debugOutputs.length ? ` · ${iteration.debugOutputs.length} debug` : ''}
            </span>
          ))}
        </div>
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow">Test-case level</p>
          {summary.testCaseResults.map((testCase) => (
            <span key={testCase.testCaseId} className={statusChipClass(testCase.passed)}>
              {testCase.name} · {testCase.iterations.length} iteration{testCase.iterations.length === 1 ? '' : 's'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketplaceEvaluatorSetupPanel({ product, onInstall, onClose }: {
  product: MarketplaceEvaluatorProduct;
  onInstall: () => void;
  onClose: () => void;
}) {
  const setupPlan = marketplaceEvaluatorSetupPlan(product);
  return (
    <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 12, borderColor: 'var(--status-warning)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
        <div>
          <p className="of-eyebrow">Marketplace setup wizard</p>
          <h3 style={{ margin: 0, fontSize: 16 }}>{product.name}</h3>
          <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{product.summary}</p>
        </div>
        <button type="button" className="of-button" onClick={onClose}>
          <Glyph name="x" size={12} /> Close
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(260px, 1fr)', gap: 10 }}>
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow">Install steps</p>
          {setupPlan.steps.map((step, index) => (
            <span key={step} className="of-text-muted" style={{ fontSize: 12 }}>
              {index + 1}. {step}
            </span>
          ))}
        </div>
        <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow">Dependency plan</p>
          {setupPlan.dependencies.map((dependency) => (
            <div key={`${dependency.package_slug}-${dependency.version_req}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span>{dependency.package_slug}</span>
              <span className={dependency.required ? 'of-chip of-status-warning' : 'of-chip'}>{dependency.version_req}{dependency.required ? ' · required' : ''}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="of-button of-button--primary" onClick={onInstall}>
          <Glyph name="shield-plus" size={12} /> Install and add evaluator
        </button>
        <a className="of-button" href={setupPlan.setupHref}>
          <Glyph name="external-link" size={12} /> Open product
        </a>
      </div>
    </div>
  );
}

function formatTraceValue(value: unknown) {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ResultsTableAndDebugPanel({ suite, debugRowKey, onSelectDebugRow, onCloseDebugRow }: {
  suite: LocalEvaluationSuite;
  debugRowKey: string | null;
  onSelectDebugRow: (key: string | null) => void;
  onCloseDebugRow: () => void;
}) {
  const latestRun = suite.runHistory[0];
  const resultsTable = useMemo(() => (latestRun ? buildEvaluationResultsTable(suite, latestRun) : undefined), [latestRun, suite]);
  const activeDebug = useMemo(() => {
    if (!latestRun || !debugRowKey || !resultsTable) return undefined;
    const row = resultsTable.rows.find((candidate) => candidate.id === debugRowKey);
    if (!row) return undefined;
    return buildEvaluationDebugView(suite, latestRun, row.testCaseId, row.targetId, row.iteration);
  }, [debugRowKey, latestRun, resultsTable, suite]);
  if (!latestRun || !resultsTable) {
    return (
      <div className="of-panel" style={{ padding: 12, display: 'grid', gap: 6 }}>
        <p className="of-eyebrow">Results table</p>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Run the suite to see per-iteration results, evaluator outputs, debug strings, and errors.</p>
      </div>
    );
  }
  return (
    <div className="of-panel" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Results table</p>
          <strong>{resultsTable.passCount}/{resultsTable.totalCount} iterations passed</strong>
          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>{percentLabel(resultsTable.passRate)} pass rate · {resultsTable.failureCount} failures · {resultsTable.aggregateMetrics.length} aggregate metric{resultsTable.aggregateMetrics.length === 1 ? '' : 's'}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {resultsTable.aggregateMetrics.slice(0, 4).map((metric) => (
            <span
              key={`${resultsTable.runId}-aggregate-${metric.evaluatorId}-${metric.targetId}-${metric.metricName ?? metric.evaluator}`}
              className={statusChipClass(metric.passed)}
            >
              {metric.metricName ?? metric.evaluator} · {metric.targetId} · {metric.passCount}/{metric.totalCount}
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="of-table" style={{ minWidth: 720, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Test case</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Target</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Iter.</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Actual outputs</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Expected</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Evaluators</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Debug / errors</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>Open</th>
            </tr>
          </thead>
          <tbody>
            {resultsTable.rows.map((row) => {
              const isActive = debugRowKey === row.id;
              return (
                <tr key={row.id} style={{ borderTop: '1px solid var(--of-border-subtle, #e5e7eb)', background: isActive ? 'var(--of-surface-soft, #f5f7fa)' : undefined }}>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <strong>{row.testCaseName}</strong>
                    <div className="of-text-muted" style={{ fontSize: 11 }}>{row.testCaseId}</div>
                  </td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <div>{row.targetId}</div>
                    <div className="of-text-muted" style={{ fontSize: 11 }}>{TARGET_KIND_LABELS[row.targetKind] ?? row.targetKind} · {row.targetVersion}{row.targetModel ? ` · ${row.targetModel}` : ''}</div>
                  </td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>{row.iteration}</td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <span className={statusChipClass(row.status === 'passed')}>{row.status}</span>
                  </td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', maxWidth: 220 }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 80, overflow: 'auto' }}>{formatTraceValue(row.actualOutputs)}</pre>
                  </td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', maxWidth: 220 }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 80, overflow: 'auto' }}>{formatTraceValue(row.expectedValues)}</pre>
                  </td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', maxWidth: 220 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {row.evaluatorOutputs.map((evaluator) => (
                        <span
                          key={`${row.id}-${evaluator.evaluatorId}-${evaluator.metricName}`}
                          className={statusChipClass(evaluator.passed)}
                          title={evaluator.reason}
                        >
                          {evaluator.metricName}
                        </span>
                      ))}
                      {row.evaluatorOutputs.length === 0 ? <span className="of-text-muted" style={{ fontSize: 11 }}>—</span> : null}
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top', maxWidth: 220 }}>
                    {row.errors.length > 0 ? (
                      <div className="of-status-danger" style={{ padding: 4, borderRadius: 4, fontSize: 11 }}>
                        {row.errors.map((error, index) => (
                          <div key={`${row.id}-error-${index}`}>{error.message}</div>
                        ))}
                      </div>
                    ) : null}
                    {row.customEvaluatorDebugOutputs.length > 0 ? (
                      <div className="of-text-muted" style={{ fontSize: 11, display: 'grid', gap: 2 }}>
                        {row.customEvaluatorDebugOutputs.slice(0, 2).map((debugOutput) => (
                          <span key={`${row.id}-debug-${debugOutput.evaluatorId}-${debugOutput.name}`}>
                            {debugOutput.name}: {debugOutput.value}
                          </span>
                        ))}
                        {row.customEvaluatorDebugOutputs.length > 2 ? (
                          <span>… +{row.customEvaluatorDebugOutputs.length - 2} more</span>
                        ) : null}
                      </div>
                    ) : null}
                    {row.errors.length === 0 && row.customEvaluatorDebugOutputs.length === 0 ? (
                      <span className="of-text-muted" style={{ fontSize: 11 }}>—</span>
                    ) : null}
                  </td>
                  <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    <button
                      type="button"
                      className="of-button"
                      onClick={() => onSelectDebugRow(isActive ? null : row.id)}
                    >
                      {isActive ? 'Close' : 'Debug'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeDebug ? (
        <div className="of-panel-muted" style={{ padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow">Debug view</p>
              <strong>{activeDebug.testCaseName} · {activeDebug.targetId} · iteration {activeDebug.iteration}</strong>
              <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
                {TARGET_KIND_LABELS[activeDebug.targetKind] ?? activeDebug.targetKind} · {activeDebug.targetVersion}{activeDebug.targetModel ? ` · ${activeDebug.targetModel}` : ''} · status {activeDebug.status}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <a className="of-button" href={activeDebug.href}>Open run debugger</a>
              <button type="button" className="of-button" onClick={onCloseDebugRow}>Close debug view</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
            <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Inputs</p>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 200, overflow: 'auto' }}>{formatTraceValue(activeDebug.inputs)}</pre>
            </div>
            <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Expected</p>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 200, overflow: 'auto' }}>{formatTraceValue(activeDebug.expectedValues)}</pre>
            </div>
            <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Actual outputs</p>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 200, overflow: 'auto' }}>{formatTraceValue(activeDebug.actualOutputs)}</pre>
            </div>
          </div>

          {Object.keys(activeDebug.intermediateParameters).length > 0 ? (
            <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Intermediate parameters</p>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 150, overflow: 'auto' }}>{formatTraceValue(activeDebug.intermediateParameters)}</pre>
            </div>
          ) : null}

          <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Trace steps</p>
            {activeDebug.traceSteps.map((step) => (
              <details key={step.id} className="of-panel-muted" style={{ padding: 8 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  {step.label} <span className="of-text-muted" style={{ fontSize: 11 }}>({step.kind.replaceAll('_', ' ')})</span>
                </summary>
                <p className="of-text-muted" style={{ margin: '4px 0', fontSize: 11 }}>{step.description}</p>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 240, overflow: 'auto' }}>{formatTraceValue(step.payload)}</pre>
              </details>
            ))}
          </div>

          {activeDebug.evaluatorOutputs.length > 0 ? (
            <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Evaluator trace</p>
              <div style={{ display: 'grid', gap: 6 }}>
                {activeDebug.evaluatorOutputs.map((evaluator) => (
                  <div key={`${activeDebug.runId}-${evaluator.evaluatorId}-${evaluator.metricName}`} className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 12 }}>{evaluator.metricName} · {evaluator.evaluator}</strong>
                      <span className={statusChipClass(evaluator.passed)}>{evaluator.passed ? 'passed' : 'failed'}</span>
                    </div>
                    <span className="of-text-muted" style={{ fontSize: 11 }}>{evaluator.reason}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                      <div>
                        <p className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Actual{evaluator.actualName ? ` (${evaluator.actualName})` : ''}</p>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 100, overflow: 'auto' }}>{formatTraceValue(evaluator.actual)}</pre>
                      </div>
                      <div>
                        <p className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Expected{evaluator.expectedName ? ` (${evaluator.expectedName})` : ''}</p>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 100, overflow: 'auto' }}>{formatTraceValue(evaluator.expected)}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeDebug.customEvaluatorDebugOutputs.length > 0 ? (
            <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Custom evaluator debug outputs</p>
              {activeDebug.customEvaluatorDebugOutputs.map((debugOutput, index) => (
                <span key={`${activeDebug.runId}-debug-${debugOutput.evaluatorId}-${debugOutput.name}-${index}`} className="of-text-muted" style={{ fontSize: 12 }}>
                  <strong>{debugOutput.name}</strong> · {debugOutput.evaluatorRid} ({debugOutput.evaluatorKind}) · {debugOutput.value}
                </span>
              ))}
            </div>
          ) : null}

          {activeDebug.errors.length > 0 ? (
            <div className="of-panel" style={{ padding: 10, display: 'grid', gap: 4, borderColor: 'var(--status-danger)' }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Errors</p>
              {activeDebug.errors.map((error, index) => (
                <span key={`${activeDebug.runId}-error-${index}`} className="of-status-danger" style={{ fontSize: 12 }}>{error.message}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatDelta(delta: number) {
  if (Number.isNaN(delta) || !Number.isFinite(delta)) return '—';
  const formatted = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
  return formatted;
}

function changeKindClass(changeKind: 'newly_passed' | 'newly_failed' | 'still_passed' | 'still_failed' | 'only_in_base' | 'only_in_head') {
  if (changeKind === 'newly_passed') return 'of-chip of-status-success';
  if (changeKind === 'newly_failed') return 'of-chip of-status-danger';
  if (changeKind === 'still_passed') return 'of-chip of-status-success';
  if (changeKind === 'still_failed') return 'of-chip of-status-warning';
  return 'of-chip of-text-muted';
}

function changeKindLabel(changeKind: 'newly_passed' | 'newly_failed' | 'still_passed' | 'still_failed' | 'only_in_base' | 'only_in_head') {
  return changeKind.replaceAll('_', ' ');
}

function aggregateMetricChangeClass(changeKind: 'improved' | 'regressed' | 'unchanged' | 'only_in_base' | 'only_in_head') {
  if (changeKind === 'improved') return 'of-chip of-status-success';
  if (changeKind === 'regressed') return 'of-chip of-status-danger';
  return 'of-chip';
}

function RunComparisonPanel({ suite, baseRunId, headRunId, onBaseRunIdChange, onHeadRunIdChange }: {
  suite: LocalEvaluationSuite;
  baseRunId: string;
  headRunId: string;
  onBaseRunIdChange: (id: string) => void;
  onHeadRunIdChange: (id: string) => void;
}) {
  const runs = suite.runHistory;
  const baseRun = runs.find((run) => run.id === baseRunId);
  const headRun = runs.find((run) => run.id === headRunId);
  const comparison = useMemo(() => (baseRun && headRun ? compareEvaluationRuns(suite, baseRun, headRun) : undefined), [baseRun, headRun, suite]);

  if (runs.length < 2) {
    return (
      <div className="of-panel" style={{ padding: 12, display: 'grid', gap: 6 }}>
        <p className="of-eyebrow">Run-to-run comparison</p>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Run the suite at least twice to compare aggregate metrics, status changes, and evaluator output differences.</p>
      </div>
    );
  }

  return (
    <div className="of-panel" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Run-to-run comparison</p>
          <strong>{comparison ? `${comparison.summary.newlyPassed} newly passed · ${comparison.summary.newlyFailed} newly failed` : 'Pick two runs to compare'}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="of-eyebrow" style={{ fontSize: 11 }}>Base</span>
            <select className="of-input" value={baseRunId} onChange={(event) => onBaseRunIdChange(event.target.value)}>
              <option value="">— select run —</option>
              {runs.map((run) => (
                <option key={`base-${run.id}`} value={run.id}>{run.id} · {formatDate(run.completedAtIso)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="of-eyebrow" style={{ fontSize: 11 }}>Head</span>
            <select className="of-input" value={headRunId} onChange={(event) => onHeadRunIdChange(event.target.value)}>
              <option value="">— select run —</option>
              {runs.map((run) => (
                <option key={`head-${run.id}`} value={run.id}>{run.id} · {formatDate(run.completedAtIso)}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!comparison ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Select a base run and head run to see the comparison.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Pass rate</p>
              <strong>{percentLabel(comparison.basePassRate)} → {percentLabel(comparison.headPassRate)}</strong>
              <span className={comparison.passRateDelta >= 0 ? 'of-chip of-status-success' : 'of-chip of-status-danger'}>{formatDelta(comparison.passRateDelta)}</span>
            </div>
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Iterations</p>
              <strong>{comparison.basePassCount}/{comparison.baseTotal} → {comparison.headPassCount}/{comparison.headTotal}</strong>
              <span className="of-text-muted" style={{ fontSize: 12 }}>{comparison.passCountDelta >= 0 ? '+' : ''}{comparison.passCountDelta} passed</span>
            </div>
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 4 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Status changes</p>
              <span className="of-text-muted" style={{ fontSize: 12 }}>{comparison.summary.newlyPassed} newly passed · {comparison.summary.newlyFailed} newly failed</span>
              <span className="of-text-muted" style={{ fontSize: 12 }}>{comparison.summary.stillPassed} still passed · {comparison.summary.stillFailed} still failed</span>
              <span className="of-text-muted" style={{ fontSize: 12 }}>{comparison.summary.onlyInBase} only in base · {comparison.summary.onlyInHead} only in head</span>
            </div>
          </div>

          {comparison.targetMetadataChanges.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Target metadata changes</p>
              {comparison.targetMetadataChanges.map((row) => (
                <div key={row.targetId} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) repeat(2, minmax(140px, 1fr)) repeat(2, auto)', gap: 6, alignItems: 'center' }}>
                  <strong style={{ fontSize: 12 }}>{row.targetId}</strong>
                  <span className="of-text-muted" style={{ fontSize: 12 }}>v {row.baseVersion ?? '—'} → {row.headVersion ?? '—'}</span>
                  <span className="of-text-muted" style={{ fontSize: 12 }}>model {row.baseModel ?? '—'} → {row.headModel ?? '—'}</span>
                  <span className={row.versionChanged ? 'of-chip of-status-warning' : 'of-chip'}>{row.versionChanged ? 'version changed' : 'same version'}</span>
                  <span className={row.modelChanged ? 'of-chip of-status-warning' : 'of-chip'}>{row.modelChanged ? 'model changed' : 'same model'}</span>
                </div>
              ))}
            </div>
          ) : null}

          {comparison.aggregateMetricChanges.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Aggregate metric changes</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="of-table" style={{ minWidth: 540, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Metric · target</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Base pass rate</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Head pass rate</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Δ</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.aggregateMetricChanges.map((row) => (
                      <tr key={`${row.evaluatorId}-${row.targetId}-${row.metricName}`} style={{ borderTop: '1px solid var(--of-border-subtle, #e5e7eb)' }}>
                        <td style={{ padding: '4px 6px' }}>{row.metricName} · {row.targetId}</td>
                        <td style={{ padding: '4px 6px' }}>{row.basePassCount}/{row.baseTotalCount} ({percentLabel(row.basePassRate)})</td>
                        <td style={{ padding: '4px 6px' }}>{row.headPassCount}/{row.headTotalCount} ({percentLabel(row.headPassRate)})</td>
                        <td style={{ padding: '4px 6px' }}>{formatDelta(row.passRateDelta)}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <span className={aggregateMetricChangeClass(row.changeKind)}>{row.changeKind.replaceAll('_', ' ')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {comparison.testCaseChanges.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Per-test-case status changes</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="of-table" style={{ minWidth: 720, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Test case</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Target</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Iter.</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Base → Head</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Change</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Output diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.testCaseChanges.slice(0, 60).map((row) => (
                      <tr key={`${row.testCaseId}-${row.targetId}-${row.iteration}`} style={{ borderTop: '1px solid var(--of-border-subtle, #e5e7eb)' }}>
                        <td style={{ padding: '4px 6px' }}>
                          <strong>{row.testCaseName}</strong>
                          <div className="of-text-muted" style={{ fontSize: 11 }}>{row.testCaseId}</div>
                        </td>
                        <td style={{ padding: '4px 6px' }}>{row.targetId}</td>
                        <td style={{ padding: '4px 6px' }}>{row.iteration}</td>
                        <td style={{ padding: '4px 6px' }}>
                          {row.baseStatus ?? '—'} → {row.headStatus ?? '—'}
                          {row.baseDebuggerHref || row.headDebuggerHref ? (
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              {row.baseDebuggerHref ? <a className="of-text-soft" style={{ fontSize: 11 }} href={row.baseDebuggerHref}>base trace</a> : null}
                              {row.headDebuggerHref ? <a className="of-text-soft" style={{ fontSize: 11 }} href={row.headDebuggerHref}>head trace</a> : null}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <span className={changeKindClass(row.changeKind)}>{changeKindLabel(row.changeKind)}</span>
                        </td>
                        <td style={{ padding: '4px 6px', maxWidth: 260 }}>
                          {row.outputDiff.length > 0 ? (
                            <div style={{ display: 'grid', gap: 3 }}>
                              {row.outputDiff.slice(0, 3).map((diff) => (
                                <div key={`${row.testCaseId}-${row.targetId}-${row.iteration}-${diff.key}`} style={{ fontSize: 11 }}>
                                  <strong>{diff.key}</strong>: {formatTraceValue(diff.baseValue)} → {formatTraceValue(diff.headValue)}
                                </div>
                              ))}
                              {row.outputDiff.length > 3 ? <span className="of-text-muted" style={{ fontSize: 11 }}>… +{row.outputDiff.length - 3} more</span> : null}
                            </div>
                          ) : (
                            <span className="of-text-muted" style={{ fontSize: 11 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {comparison.testCaseChanges.length > 60 ? (
                  <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Showing first 60 changes of {comparison.testCaseChanges.length}.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {comparison.evaluatorDiffs.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Evaluator output differences</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="of-table" style={{ minWidth: 640, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Metric · target · test case</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Iter.</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Base</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Head</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.evaluatorDiffs.slice(0, 60).map((diff) => (
                      <tr key={`${diff.evaluatorId}-${diff.targetId}-${diff.testCaseId}-${diff.iteration}-${diff.metricName}`} style={{ borderTop: '1px solid var(--of-border-subtle, #e5e7eb)' }}>
                        <td style={{ padding: '4px 6px' }}>
                          <strong>{diff.metricName}</strong>
                          <div className="of-text-muted" style={{ fontSize: 11 }}>{diff.targetId} · {diff.testCaseId}</div>
                        </td>
                        <td style={{ padding: '4px 6px' }}>{diff.iteration}</td>
                        <td style={{ padding: '4px 6px' }}>{diff.basePassed === undefined ? '—' : `${diff.basePassed ? 'passed' : 'failed'} (${formatTraceValue(diff.baseMetricValue)})`}</td>
                        <td style={{ padding: '4px 6px' }}>{diff.headPassed === undefined ? '—' : `${diff.headPassed ? 'passed' : 'failed'} (${formatTraceValue(diff.headMetricValue)})`}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <span className={diff.changeKind === 'passed_changed' ? 'of-chip of-status-warning' : 'of-chip'}>{diff.changeKind.replaceAll('_', ' ')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {comparison.evaluatorDiffs.length > 60 ? (
                  <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Showing first 60 evaluator diffs of {comparison.evaluatorDiffs.length}.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const SCHEDULE_CADENCE_OPTIONS: Array<{ value: EvalScheduleCadence; label: string }> = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'cron', label: 'Cron expression' },
];

function alertSeverityClass(severity: EvalScheduleAlert['severity']): string {
  if (severity === 'critical') return 'of-chip of-status-danger';
  if (severity === 'warning') return 'of-chip of-status-warning';
  return 'of-chip';
}

function describeNotificationChannel(channel: EvalScheduleRunOutcome['notifications'][number]['channel']): string {
  if (channel.kind === 'data_health') return `Data Health · ${channel.healthCheckId}`;
  if (channel.kind === 'automate') return `Automate · ${channel.automationId}`;
  if (channel.kind === 'slack') return `Slack · ${channel.channel}`;
  return `Email · ${channel.recipients.join(', ')}`;
}

function EvalScheduleMonitoringPanel({ suites, schedules, onAddSchedule, onRemoveSchedule, onToggleSchedule }: {
  suites: LocalEvaluationSuite[];
  schedules: EvalScheduleConfig[];
  onAddSchedule: (input: Parameters<typeof createEvalScheduleConfig>[0]) => void;
  onRemoveSchedule: (id: string) => void;
  onToggleSchedule: (id: string) => void;
}) {
  const [draftSuiteId, setDraftSuiteId] = useState<string>(suites[0]?.id ?? '');
  const [draftCadence, setDraftCadence] = useState<EvalScheduleCadence>('daily');
  const [draftCron, setDraftCron] = useState<string>('0 6 * * *');
  const [draftAutomationId, setDraftAutomationId] = useState<string>('');
  const [draftHealthCheckId, setDraftHealthCheckId] = useState<string>('');
  const [draftPassRateDrop, setDraftPassRateDrop] = useState<number>(5);
  const [draftCostSpikePct, setDraftCostSpikePct] = useState<number>(30);

  const outcomes = useMemo(() => schedules.map((schedule) => {
    const suite = suites.find((entry) => entry.id === schedule.suiteId);
    if (!suite) return { schedule, outcome: undefined as EvalScheduleRunOutcome | undefined };
    const head = suite.runHistory[0];
    const baseline = schedule.baselineRunId
      ? suite.runHistory.find((run) => run.id === schedule.baselineRunId)
      : suite.runHistory[1] ?? suite.runHistory[0];
    const headReport = head ? buildEvaluationResultsAnalyzer(suite, head) : undefined;
    const baselineReport = baseline ? buildEvaluationResultsAnalyzer(suite, baseline) : undefined;
    const outcome = monitorEvaluationScheduleRun({
      schedule,
      baseline: baseline && baseline.id !== head?.id ? baseline : undefined,
      head,
      baselineReport,
      headReport,
    });
    return { schedule, outcome };
  }), [schedules, suites]);

  function submitDraft() {
    if (!draftSuiteId) return;
    const notificationChannels: Array<{ kind: 'data_health'; healthCheckId: string } | { kind: 'automate'; automationId: string }> = [];
    if (draftHealthCheckId.trim()) notificationChannels.push({ kind: 'data_health', healthCheckId: draftHealthCheckId.trim() });
    if (draftAutomationId.trim()) notificationChannels.push({ kind: 'automate', automationId: draftAutomationId.trim() });
    onAddSchedule({
      suiteId: draftSuiteId,
      cadence: draftCadence,
      cron: draftCadence === 'cron' ? draftCron.trim() : undefined,
      notificationChannels,
      remediationFlow: draftAutomationId.trim() ? { automationId: draftAutomationId.trim(), rollbackOnRegression: true } : undefined,
      regressionThresholds: {
        passRateDropThreshold: Math.max(0, Math.min(100, draftPassRateDrop)) / 100,
        costSpikeThresholdPct: Math.max(0, Math.min(500, draftCostSpikePct)) / 100,
      },
    });
  }

  return (
    <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Scheduling & regression monitoring</p>
          <strong>{schedules.length} schedule{schedules.length === 1 ? '' : 's'} configured</strong>
          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>Schedule evaluation suites against published versions, alert on regressions, and route notifications to Data Health or Automate.</p>
        </div>
      </header>

      <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <p className="of-eyebrow" style={{ margin: 0 }}>Add schedule</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Suite</span>
            <select className="of-input" value={draftSuiteId} onChange={(event) => setDraftSuiteId(event.target.value)}>
              {suites.map((suite) => <option key={suite.id} value={suite.id}>{suite.id}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Cadence</span>
            <select className="of-input" value={draftCadence} onChange={(event) => setDraftCadence(event.target.value as EvalScheduleCadence)}>
              {SCHEDULE_CADENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {draftCadence === 'cron' ? (
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Cron expression</span>
              <input className="of-input" value={draftCron} onChange={(event) => setDraftCron(event.target.value)} placeholder="0 6 * * *" />
            </label>
          ) : null}
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Data Health check id</span>
            <input className="of-input" value={draftHealthCheckId} placeholder="optional" onChange={(event) => setDraftHealthCheckId(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Automate automation id</span>
            <input className="of-input" value={draftAutomationId} placeholder="optional remediation" onChange={(event) => setDraftAutomationId(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Pass-rate drop alert (%)</span>
            <input className="of-input" type="number" min={0} max={100} value={draftPassRateDrop} onChange={(event) => setDraftPassRateDrop(Number(event.target.value) || 0)} />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Cost spike alert (%)</span>
            <input className="of-input" type="number" min={0} max={500} value={draftCostSpikePct} onChange={(event) => setDraftCostSpikePct(Number(event.target.value) || 0)} />
          </label>
        </div>
        <div>
          <button type="button" className="of-button of-button--primary" onClick={submitDraft} disabled={!draftSuiteId}>
            <Glyph name="plus" size={12} /> Add schedule
          </button>
        </div>
      </div>

      {schedules.length === 0 ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No schedules yet. Add one above to start monitoring scheduled runs.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {outcomes.map(({ schedule, outcome }) => {
            const nextRunIso = nextEvalScheduleRunAt(schedule);
            return (
              <div key={schedule.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{schedule.suiteId}</strong>
                    <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
                      Cadence: {schedule.cadence}{schedule.cron ? ` (${schedule.cron})` : ''} · Pin: {schedule.targetVersionPin} · Next run {nextRunIso ? formatDate(nextRunIso) : 'paused'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="of-button" onClick={() => onToggleSchedule(schedule.id)}>
                      {schedule.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button type="button" className="of-button" onClick={() => onRemoveSchedule(schedule.id)}>
                      <Glyph name="trash" size={12} /> Remove
                    </button>
                  </div>
                </div>
                {outcome ? (
                  <div className="of-panel" style={{ padding: 8, display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="of-chip">Run {outcome.runId ?? '—'}</span>
                      <span className="of-chip">{percentLabel(outcome.passRate)} pass rate</span>
                      <span className="of-chip">{outcome.totalIterations} iteration{outcome.totalIterations === 1 ? '' : 's'}</span>
                      {outcome.baselinePassRate !== undefined ? (
                        <span className="of-chip">Baseline {percentLabel(outcome.baselinePassRate)}</span>
                      ) : null}
                      {outcome.headCostSeconds !== undefined ? (
                        <span className="of-chip">Compute {outcome.headCostSeconds}s</span>
                      ) : null}
                    </div>
                    {outcome.alerts.length > 0 ? (
                      <div style={{ display: 'grid', gap: 4 }}>
                        {outcome.alerts.map((alert) => (
                          <div key={`${schedule.id}-alert-${alert.kind}-${alert.metricName ?? alert.failureCategoryKind ?? ''}`} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span className={alertSeverityClass(alert.severity)}>{alert.kind.replaceAll('_', ' ')}</span>
                            <span style={{ fontSize: 12 }}>{alert.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="of-text-muted" style={{ fontSize: 12 }}>No alerts triggered against the configured baseline.</span>
                    )}
                    {outcome.notifications.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {outcome.notifications.map((notification, index) => (
                          <span
                            key={`${schedule.id}-notify-${index}`}
                            className={notification.status === 'queued' ? 'of-chip of-status-warning' : notification.status === 'sent' ? 'of-chip of-status-success' : 'of-chip'}
                          >
                            {describeNotificationChannel(notification.channel)} · {notification.status}{notification.reason ? ` (${notification.reason})` : ''}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {outcome.remediation ? (
                      <span
                        className={outcome.remediation.status === 'triggered' ? 'of-chip of-status-danger' : outcome.remediation.status === 'planned' ? 'of-chip of-status-warning' : 'of-chip'}
                      >
                        Remediation {outcome.remediation.automationId} · {outcome.remediation.status}{outcome.remediation.reason ? ` (${outcome.remediation.reason})` : ''}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const GATE_SURFACE_OPTIONS: Array<{ value: LogicPublishGateSurface; label: string }> = [
  { value: 'logic_publish', label: 'Logic publish' },
  { value: 'automation_enable', label: 'Automation enablement' },
  { value: 'action_rollout', label: 'Action rollout' },
];

function PublishGatesPanel({ suites, surface, requirement, waivers, onSurfaceChange, onRequirementChange, onAddWaiver, onRemoveWaiver }: {
  suites: LocalEvaluationSuite[];
  surface: LogicPublishGateSurface;
  requirement: LogicPublishGateRequirement;
  waivers: LogicPublishGateWaiver[];
  onSurfaceChange: (next: LogicPublishGateSurface) => void;
  onRequirementChange: (next: LogicPublishGateRequirement) => void;
  onAddWaiver: (ruleField: string, reason: string) => void;
  onRemoveWaiver: (waiverId: string) => void;
}) {
  const [waiverDraft, setWaiverDraft] = useState<{ ruleField: string; reason: string } | null>(null);
  const gateInputSuites = useMemo(() => suites.map((suite) => ({
    id: suite.id,
    targetFunctions: suite.targetFunctions,
    testCases: suite.testCases,
    runs: suite.runHistory,
  })), [suites]);
  const evaluatedAtIso = useMemo(() => new Date().toISOString(), [suites, surface, requirement, waivers]);
  const result = useMemo(() => evaluateLogicPublishGate(
    gateInputSuites,
    requirement,
    { surface, evaluatedAtIso },
    waivers,
  ), [evaluatedAtIso, gateInputSuites, requirement, surface, waivers]);

  function toggleSuiteId(suiteId: string) {
    const set = new Set(requirement.suiteIds);
    if (set.has(suiteId)) set.delete(suiteId); else set.add(suiteId);
    onRequirementChange({ ...requirement, suiteIds: Array.from(set) });
  }

  function updateCriticalMetrics(value: string) {
    const metrics = value.split(',').map((token) => token.trim()).filter(Boolean);
    onRequirementChange({ ...requirement, criticalMetricNames: metrics });
  }

  return (
    <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Production readiness gates</p>
          <strong>{result.ready ? 'Ready to roll out' : result.rolloutBlocked ? 'Rollout blocked' : 'Rollout requires waivers'}</strong>
          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
            {GATE_SURFACE_OPTIONS.find((option) => option.value === surface)?.label} · {result.findings.length} finding{result.findings.length === 1 ? '' : 's'} · {result.bypassedFindingCount} waived
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={result.rolloutBlocked ? 'of-chip of-status-danger' : result.ready ? 'of-chip of-status-success' : 'of-chip of-status-warning'}>
            {result.rolloutBlocked ? 'blocked' : result.ready ? 'ready' : 'waivers applied'}
          </span>
        </div>
      </header>

      <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <p className="of-eyebrow" style={{ margin: 0 }}>Gate configuration</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Surface</span>
            <select className="of-input" value={surface} onChange={(event) => onSurfaceChange(event.target.value as LogicPublishGateSurface)}>
              {GATE_SURFACE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Min pass rate (%)</span>
            <input
              className="of-input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round(requirement.minPassRate * 100)}
              onChange={(event) => onRequirementChange({ ...requirement, minPassRate: Math.max(0, Math.min(100, Number(event.target.value) || 0)) / 100 })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Max run age (hours)</span>
            <input
              className="of-input"
              type="number"
              min={0}
              max={720}
              value={requirement.maxRunAgeHours}
              onChange={(event) => onRequirementChange({ ...requirement, maxRunAgeHours: Math.max(0, Math.min(720, Number(event.target.value) || 0)) })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Critical metrics (comma-separated)</span>
            <input
              className="of-input"
              placeholder="matches, in_range"
              value={(requirement.criticalMetricNames ?? []).join(', ')}
              onChange={(event) => updateCriticalMetrics(event.target.value)}
            />
          </label>
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <span className="of-eyebrow" style={{ fontSize: 11 }}>Required suites</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {suites.length === 0 ? <span className="of-text-muted" style={{ fontSize: 12 }}>No suites available.</span> : null}
            {suites.map((suite) => {
              const active = requirement.suiteIds.includes(suite.id);
              return (
                <button
                  key={`gate-suite-${suite.id}`}
                  type="button"
                  className={active ? 'of-chip of-status-success' : 'of-chip'}
                  onClick={() => toggleSuiteId(suite.id)}
                >
                  {suite.id}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {result.runSummaries.length > 0 ? (
        <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Run summaries</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="of-table" style={{ minWidth: 540, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Suite</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Run</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Pass rate</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Age (h)</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Critical failures</th>
                </tr>
              </thead>
              <tbody>
                {result.runSummaries.map((row) => (
                  <tr key={`${row.suiteId}-${row.runId ?? 'none'}`} style={{ borderTop: '1px solid var(--of-border-subtle, #e5e7eb)' }}>
                    <td style={{ padding: '4px 6px' }}>{row.suiteId}</td>
                    <td style={{ padding: '4px 6px', fontSize: 11 }}>{row.runId ?? '—'}</td>
                    <td style={{ padding: '4px 6px' }}>{row.totalCount > 0 ? `${row.passCount}/${row.totalCount} (${percentLabel(row.passRate)})` : '—'}</td>
                    <td style={{ padding: '4px 6px' }}>{row.ageHours === undefined ? '—' : Number.isFinite(row.ageHours) ? row.ageHours.toFixed(1) : '∞'}</td>
                    <td style={{ padding: '4px 6px' }}>{row.criticalFailureCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {result.findings.length > 0 ? (
        <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Findings</p>
          {result.findings.map((finding) => (
            <div key={finding.ruleField} className="of-panel" style={{ padding: 8, display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12 }}>{finding.message}</strong>
                <span className={finding.severity === 'critical' ? 'of-chip of-status-danger' : finding.severity === 'warning' ? 'of-chip of-status-warning' : 'of-chip'}>{finding.severity}</span>
              </div>
              {finding.suiteId ? <span className="of-text-muted" style={{ fontSize: 11 }}>Suite {finding.suiteId}{finding.runId ? ` · run ${finding.runId}` : ''}{finding.metricName ? ` · metric ${finding.metricName}` : ''}</span> : null}
              {finding.waived ? (
                <div className="of-text-muted" style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span>Waived by {finding.waiver?.reviewerId} on {finding.waiver?.approvedAtIso ? formatDate(finding.waiver.approvedAtIso) : '—'} · {finding.waiver?.reason}</span>
                  {finding.waiver ? (
                    <button type="button" className="of-button" onClick={() => onRemoveWaiver(finding.waiver!.id)}>Remove waiver</button>
                  ) : null}
                </div>
              ) : waiverDraft?.ruleField === finding.ruleField ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    className="of-input"
                    placeholder="Waiver reason"
                    value={waiverDraft.reason}
                    onChange={(event) => setWaiverDraft({ ruleField: finding.ruleField, reason: event.target.value })}
                  />
                  <button
                    type="button"
                    className="of-button of-button--primary"
                    disabled={!waiverDraft.reason.trim()}
                    onClick={() => {
                      onAddWaiver(finding.ruleField, waiverDraft.reason.trim());
                      setWaiverDraft(null);
                    }}
                  >
                    Save waiver
                  </button>
                  <button type="button" className="of-button" onClick={() => setWaiverDraft(null)}>Cancel</button>
                </div>
              ) : (
                <div>
                  <button type="button" className="of-button" onClick={() => setWaiverDraft({ ruleField: finding.ruleField, reason: '' })}>Waive finding</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No findings — gate requirements satisfied for {GATE_SURFACE_OPTIONS.find((option) => option.value === surface)?.label}.</p>
      )}
    </section>
  );
}

const EXPERIMENT_DIMENSION_KINDS: Array<{ value: EvaluationExperimentDimension['kind']; label: string; needsTarget: boolean; needsEvaluator: boolean; needsParameterName: boolean }> = [
  { value: 'target_model', label: 'Target model', needsTarget: true, needsEvaluator: false, needsParameterName: false },
  { value: 'target_version', label: 'Target version', needsTarget: true, needsEvaluator: false, needsParameterName: false },
  { value: 'prompt_variable', label: 'Prompt variable', needsTarget: true, needsEvaluator: false, needsParameterName: true },
  { value: 'evaluator_threshold', label: 'Evaluator threshold', needsTarget: false, needsEvaluator: true, needsParameterName: false },
  { value: 'evaluator_config', label: 'Evaluator config field', needsTarget: false, needsEvaluator: true, needsParameterName: true },
  { value: 'iterations', label: 'Iterations sweep', needsTarget: false, needsEvaluator: false, needsParameterName: false },
  { value: 'parallelization', label: 'Parallelization sweep', needsTarget: false, needsEvaluator: false, needsParameterName: false },
];

function parseExperimentDimensionValues(raw: string, kind: EvaluationExperimentDimension['kind']): unknown[] {
  return raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      if (kind === 'iterations' || kind === 'parallelization' || kind === 'evaluator_threshold') {
        const numeric = Number(token);
        return Number.isFinite(numeric) ? numeric : token;
      }
      if (token === 'true') return true;
      if (token === 'false') return false;
      const numeric = Number(token);
      return Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(token) ? numeric : token;
    });
}

function EvalExperimentsPanel({ suite, dimensions, maxRuns, results, onDimensionsChange, onMaxRunsChange, onRunExperiment, onClearResults }: {
  suite: LocalEvaluationSuite;
  dimensions: EvaluationExperimentDimension[];
  maxRuns: number;
  results?: EvaluationExperimentResults;
  onDimensionsChange: (next: EvaluationExperimentDimension[]) => void;
  onMaxRunsChange: (value: number) => void;
  onRunExperiment: (config: EvaluationExperimentConfig) => void;
  onClearResults: () => void;
}) {
  const plan = useMemo(() => buildEvaluationExperimentPlan(suite, { dimensions, maxRuns }), [suite, dimensions, maxRuns]);
  const evaluatorOptions = suite.evaluators.map((evaluator) => evaluator.id);
  const targetOptions = suite.targetFunctions.map((target) => target.id);

  function updateDimension(id: string, patch: Partial<EvaluationExperimentDimension>) {
    onDimensionsChange(dimensions.map((dimension) => (dimension.id === id ? { ...dimension, ...patch } : dimension)));
  }

  function removeDimension(id: string) {
    onDimensionsChange(dimensions.filter((dimension) => dimension.id !== id));
  }

  function addDimension() {
    const baseId = `dim-${dimensions.length + 1}`;
    onDimensionsChange([
      ...dimensions,
      {
        id: baseId,
        kind: 'target_model',
        label: 'Target model sweep',
        targetId: targetOptions[0],
        values: [],
      },
    ]);
  }

  return (
    <div className="of-panel" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Eval experiments</p>
          <strong>Grid-search over Logic / function parameters</strong>
          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>Configure dimensions (model, prompt variable, threshold, iterations, parallelization), preview combinations, and run the grid.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="of-button" onClick={addDimension}>
            <Glyph name="plus" size={12} /> Add dimension
          </button>
          <button
            type="button"
            className="of-button of-button--primary"
            disabled={plan.executedCombinations === 0 || dimensions.length === 0}
            onClick={() => onRunExperiment({ dimensions, maxRuns })}
          >
            <Glyph name="run" size={12} /> Run experiment ({plan.executedCombinations} run{plan.executedCombinations === 1 ? '' : 's'})
          </button>
          {results ? (
            <button type="button" className="of-button" onClick={onClearResults}>Clear results</button>
          ) : null}
        </div>
      </div>

      {dimensions.length === 0 ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Add an experiment dimension to start configuring the grid.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {dimensions.map((dimension) => {
            const kindDefinition = EXPERIMENT_DIMENSION_KINDS.find((option) => option.value === dimension.kind);
            return (
              <div key={dimension.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Label</span>
                    <input className="of-input" value={dimension.label} onChange={(event) => updateDimension(dimension.id, { label: event.target.value })} />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Kind</span>
                    <select
                      className="of-input"
                      value={dimension.kind}
                      onChange={(event) => {
                        const next = event.target.value as EvaluationExperimentDimension['kind'];
                        updateDimension(dimension.id, { kind: next });
                      }}
                    >
                      {EXPERIMENT_DIMENSION_KINDS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {kindDefinition?.needsTarget ? (
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Target</span>
                      <select
                        className="of-input"
                        value={dimension.targetId ?? ''}
                        onChange={(event) => updateDimension(dimension.id, { targetId: event.target.value || undefined })}
                      >
                        {targetOptions.map((id) => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {kindDefinition?.needsEvaluator ? (
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Evaluator</span>
                      <select
                        className="of-input"
                        value={dimension.evaluatorId ?? ''}
                        onChange={(event) => updateDimension(dimension.id, { evaluatorId: event.target.value || undefined })}
                      >
                        {evaluatorOptions.map((id) => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {kindDefinition?.needsParameterName ? (
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Parameter name</span>
                      <input
                        className="of-input"
                        value={dimension.parameterName ?? ''}
                        placeholder="e.g. tone or min"
                        onChange={(event) => updateDimension(dimension.id, { parameterName: event.target.value || undefined })}
                      />
                    </label>
                  ) : null}
                  <label style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Values (comma-separated)</span>
                    <input
                      className="of-input"
                      value={Array.isArray(dimension.values) ? dimension.values.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(', ') : ''}
                      placeholder="gpt-4.1-mini, claude-haiku-4-5"
                      onChange={(event) => updateDimension(dimension.id, { values: parseExperimentDimensionValues(event.target.value, dimension.kind) })}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="of-button" onClick={() => removeDimension(dimension.id)}>
                    <Glyph name="trash" size={12} /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Max runs</span>
            <input
              className="of-input"
              type="number"
              min={1}
              max={200}
              value={maxRuns}
              onChange={(event) => onMaxRunsChange(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
            />
          </label>
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="of-eyebrow" style={{ fontSize: 11 }}>Plan preview</span>
            <strong>{plan.executedCombinations}/{plan.totalCombinations} combinations</strong>
            <span className="of-text-muted" style={{ fontSize: 11 }}>{plan.truncated ? 'truncated by max_runs' : 'all combinations included'}</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="of-eyebrow" style={{ fontSize: 11 }}>Estimated compute</span>
            <strong>{computeSecondsLabel(plan.estimatedComputeSeconds)}</strong>
            <span className="of-text-muted" style={{ fontSize: 11 }}>across {plan.executedCombinations} runs</span>
          </div>
        </div>
        {plan.warnings.length > 0 ? (
          <div className="of-panel" style={{ padding: 8, display: 'grid', gap: 4, borderColor: 'var(--status-warning)' }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Plan warnings</p>
            {plan.warnings.map((warning, index) => (
              <span key={`${warning.code}-${index}`} className="of-text-muted" style={{ fontSize: 12 }}>{warning.message}</span>
            ))}
          </div>
        ) : null}
        {plan.combinations.length > 0 ? (
          <div className="of-panel" style={{ padding: 8, display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Combinations preview</p>
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12 }}>
              {plan.combinations.slice(0, 8).map((combination) => (
                <li key={combination.id}>{combination.parameters.map((parameter) => `${parameter.dimensionLabel}=${formatTraceValue(parameter.value)}`).join(' · ')}</li>
              ))}
              {plan.combinations.length > 8 ? (
                <li className="of-text-muted">… +{plan.combinations.length - 8} more</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>

      {results ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Experiment summary</p>
            <strong>{percentLabel(results.averagePassRate)} average pass rate · {results.totalPassCount}/{results.totalIterationCount} iterations passed across {results.runs.length} run{results.runs.length === 1 ? '' : 's'}</strong>
            {results.bestCombinationId ? (
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Best: {results.bestCombinationId}{results.worstCombinationId ? ` · Worst: ${results.worstCombinationId}` : ''}</p>
            ) : null}
          </div>

          {results.groupsByDimension.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Group by dimension</p>
              {results.groupsByDimension.map((dimensionGroup) => (
                <div key={dimensionGroup.dimensionId} style={{ display: 'grid', gap: 4 }}>
                  <strong style={{ fontSize: 12 }}>{dimensionGroup.dimensionLabel}</strong>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {dimensionGroup.groups.map((group, index) => (
                      <div key={`${dimensionGroup.dimensionId}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 1fr auto', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12 }}>{formatTraceValue(group.value)}</span>
                        <div style={{ background: 'var(--of-surface-soft, #f5f7fa)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round(group.averagePassRate * 100)}%`, height: 8, background: group.averagePassRate >= 0.8 ? 'var(--status-success, #16a34a)' : group.averagePassRate >= 0.5 ? 'var(--status-warning, #f59e0b)' : 'var(--status-danger, #dc2626)' }} />
                        </div>
                        <span style={{ fontSize: 12 }}>{group.passCount}/{group.iterationCount} ({percentLabel(group.averagePassRate)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Per-combination runs</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="of-table" style={{ minWidth: 540, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Combination</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Pass</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Pass rate</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Run id</th>
                  </tr>
                </thead>
                <tbody>
                  {results.runs.map((entry) => (
                    <tr key={entry.combination.id} style={{ borderTop: '1px solid var(--of-border-subtle, #e5e7eb)' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <strong>#{entry.combination.index + 1}</strong>
                        <div className="of-text-muted" style={{ fontSize: 11 }}>{entry.combination.parameters.map((parameter) => `${parameter.dimensionLabel}=${formatTraceValue(parameter.value)}`).join(' · ')}</div>
                      </td>
                      <td style={{ padding: '4px 6px' }}>{entry.run.passCount}/{entry.run.totalCount}</td>
                      <td style={{ padding: '4px 6px' }}>{percentLabel(entry.run.passRate)}</td>
                      <td style={{ padding: '4px 6px', fontFamily: 'var(--of-mono, monospace)', fontSize: 11 }}>{entry.run.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResultsAnalyzerPanel({ suite, config, onConfigChange, applications, onApplySuggestion, onLinkFollowUpRun, onRemoveApplication }: {
  suite: LocalEvaluationSuite;
  config: EvaluationResultsAnalyzerConfig;
  onConfigChange: (next: EvaluationResultsAnalyzerConfig) => void;
  applications: PromptSuggestionApplication[];
  onApplySuggestion: (category: EvaluationResultsAnalyzerCategory, suggestionId: string, notes?: string) => void;
  onLinkFollowUpRun: (applicationId: string, followUpRunId: string) => void;
  onRemoveApplication: (applicationId: string) => void;
}) {
  const latestRun = suite.runHistory[0];
  const report = useMemo(() => (latestRun ? buildEvaluationResultsAnalyzer(suite, latestRun, config) : undefined), [config, latestRun, suite]);
  const runsById = useMemo(() => new Map(suite.runHistory.map((run) => [run.id, run])), [suite.runHistory]);
  const reportCategoriesByKind = useMemo(() => {
    const map = new Map<string, EvaluationResultsAnalyzerCategory>();
    report?.categories.forEach((category) => map.set(category.kind, category));
    return map;
  }, [report]);
  const suiteApplications = applications.filter((application) => application.source.evaluationSuiteId === suite.id);

  if (!latestRun) {
    return (
      <div className="of-panel" style={{ padding: 12, display: 'grid', gap: 6 }}>
        <p className="of-eyebrow">Results analyzer</p>
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Run the suite to generate a failure-pattern report with root-cause categories and prompt suggestions.</p>
      </div>
    );
  }

  return (
    <div className="of-panel" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Results analyzer</p>
          <strong>{report?.summary ?? 'No report yet.'}</strong>
          {report ? (
            <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
              {report.totalFailingIterations} failing iteration{report.totalFailingIterations === 1 ? '' : 's'} · {report.totalFailingTestCases} test case{report.totalFailingTestCases === 1 ? '' : 's'}
              {report.truncatedFailingTestCases > 0 ? ` (${report.truncatedFailingTestCases} truncated per category)` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <p className="of-eyebrow" style={{ margin: 0 }}>Analyzer configuration</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Analyzer model</span>
            <input
              className="of-input"
              type="text"
              value={config.model ?? ''}
              placeholder="openfoundry.analyzer.v1"
              onChange={(event) => onConfigChange({ ...config, model: event.target.value || undefined })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Max categories</span>
            <input
              className="of-input"
              type="number"
              min={1}
              max={20}
              value={config.maxCategories ?? 5}
              onChange={(event) => onConfigChange({ ...config, maxCategories: Math.max(1, Math.min(20, Number(event.target.value) || 5)) })}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Max failing test cases / category</span>
            <input
              className="of-input"
              type="number"
              min={1}
              max={50}
              value={config.maxFailingTestCases ?? 5}
              onChange={(event) => onConfigChange({ ...config, maxFailingTestCases: Math.max(1, Math.min(50, Number(event.target.value) || 5)) })}
            />
          </label>
        </div>
      </div>

      {report?.unsupportedReason === 'no_failures' ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>All iterations passed in the latest run — nothing to analyze.</p>
      ) : null}
      {report?.unsupportedReason === 'no_iterations' ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No iterations recorded; run the suite first.</p>
      ) : null}

      {report && report.categories.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {report.categories.map((category) => (
            <div key={category.id} className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong>{category.name}</strong>
                  <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{category.description}</p>
                </div>
                <span className="of-chip of-status-warning">{category.failureCount} failure{category.failureCount === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="of-text-muted" style={{ fontSize: 12 }}>Test cases ({category.affectedTestCaseIds.length}):</span>
                {category.affectedTestCaseIds.slice(0, 8).map((id) => (
                  <span key={`${category.id}-${id}`} className="of-chip">{id}</span>
                ))}
                {category.affectedTestCaseIds.length > 8 ? (
                  <span className="of-text-muted" style={{ fontSize: 12 }}>… +{category.affectedTestCaseIds.length - 8} more</span>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="of-text-muted" style={{ fontSize: 12 }}>Targets:</span>
                {category.affectedTargetIds.map((targetId) => (
                  <span key={`${category.id}-target-${targetId}`} className="of-chip">{targetId}</span>
                ))}
              </div>
              {category.examples.length > 0 ? (
                <div className="of-panel" style={{ padding: 8, display: 'grid', gap: 4 }}>
                  <p className="of-eyebrow" style={{ margin: 0 }}>Examples</p>
                  {category.examples.map((example) => (
                    <div key={`${category.id}-example-${example.testCaseId}-${example.targetId}-${example.iteration}`} style={{ display: 'grid', gap: 2, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>{example.testCaseName} · {example.targetId} · iteration {example.iteration}</strong>
                        <a className="of-button" href={example.debuggerHref}>Open debug</a>
                      </div>
                      {example.metricName ? (
                        <span className="of-text-muted" style={{ fontSize: 11 }}>{example.metricName} · {example.reason}</span>
                      ) : null}
                      {example.errorMessage ? (
                        <span className="of-status-danger" style={{ fontSize: 11 }}>{example.errorMessage}</span>
                      ) : null}
                      {example.actual !== undefined ? (
                        <span className="of-text-muted" style={{ fontSize: 11 }}>actual={formatTraceValue(example.actual)} · expected={formatTraceValue(example.expected)}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="of-panel" style={{ padding: 8, display: 'grid', gap: 6, borderColor: 'var(--status-success)' }}>
                <p className="of-eyebrow" style={{ margin: 0 }}>Prompt suggestion</p>
                <p style={{ margin: 0, fontSize: 12 }}>{category.promptSuggestion}</p>
                <div>
                  <button
                    type="button"
                    className="of-button"
                    onClick={() => onApplySuggestion(category, category.id, undefined)}
                  >
                    Apply suggestion
                  </button>
                </div>
              </div>
            </div>
          ))}
          {report.remainingCategoriesCount > 0 ? (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>{report.remainingCategoriesCount} additional categor{report.remainingCategoriesCount === 1 ? 'y' : 'ies'} truncated by max categories limit.</p>
          ) : null}
        </div>
      ) : null}

      {suiteApplications.length > 0 ? (
        <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <p className="of-eyebrow" style={{ margin: 0 }}>Applied prompt suggestions</p>
          {suiteApplications.map((application) => {
            const baseRun = runsById.get(application.source.runId);
            const followUpRun = application.followUpRunId ? runsById.get(application.followUpRunId) : undefined;
            const category = reportCategoriesByKind.get(application.categoryKind);
            const evidence = baseRun && category
              ? evaluatePromptSuggestionEvidence(application, baseRun, category, followUpRun)
              : undefined;
            return (
              <div key={application.id} className="of-panel" style={{ padding: 10, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{application.categoryName}</strong>
                    <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Applied {formatDate(application.appliedAt)}{application.appliedBy ? ` by ${application.appliedBy.id}` : ''}{application.appliedTo?.functionRid ? ` to ${application.appliedTo.functionRid}` : ''}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span className="of-eyebrow" style={{ fontSize: 11 }}>Follow-up run</span>
                      <select
                        className="of-input"
                        value={application.followUpRunId ?? ''}
                        onChange={(event) => onLinkFollowUpRun(application.id, event.target.value)}
                      >
                        <option value="">— select run —</option>
                        {suite.runHistory.filter((run) => run.id !== application.source.runId).map((run) => (
                          <option key={`${application.id}-followup-${run.id}`} value={run.id}>{run.id} · {formatDate(run.completedAtIso)}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="of-button" onClick={() => onRemoveApplication(application.id)}>Remove</button>
                  </div>
                </div>
                {evidence ? (
                  <div className="of-panel-muted" style={{ padding: 8, display: 'grid', gap: 4 }}>
                    <p className="of-eyebrow" style={{ margin: 0 }}>Follow-up evidence</p>
                    <span className="of-text-muted" style={{ fontSize: 12 }}>
                      Base run {evidence.baseRunSummary.runId}: {percentLabel(evidence.baseRunSummary.passRate)} pass rate · {evidence.baseRunSummary.affectedFailureCount} affected failure{evidence.baseRunSummary.affectedFailureCount === 1 ? '' : 's'}
                    </span>
                    {evidence.followUpRunSummary && evidence.improvement ? (
                      <>
                        <span className="of-text-muted" style={{ fontSize: 12 }}>
                          Follow-up run {evidence.followUpRunSummary.runId}: {percentLabel(evidence.followUpRunSummary.passRate)} pass rate · {evidence.followUpRunSummary.affectedFailureCount} affected failure{evidence.followUpRunSummary.affectedFailureCount === 1 ? '' : 's'}
                        </span>
                        <span className={evidence.improvement.passRateDelta >= 0 ? 'of-chip of-status-success' : 'of-chip of-status-danger'}>
                          Δ {formatDelta(evidence.improvement.passRateDelta)} · {evidence.improvement.affectedFailureDelta >= 0 ? '+' : ''}{evidence.improvement.affectedFailureDelta} affected failures{evidence.improvement.resolved ? ' · resolved' : ''}
                        </span>
                      </>
                    ) : (
                      <span className="of-text-muted" style={{ fontSize: 12 }}>Run a follow-up evaluation and select it here to record improvement evidence.</span>
                    )}
                  </div>
                ) : (
                  <span className="of-text-muted" style={{ fontSize: 12 }}>Open the analyzer for the source run to view follow-up evidence.</span>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MultiSelectFilter({ label, options, selected, onChange }: {
  label: string;
  options: string[];
  selected: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
}) {
  if (options.length === 0) return null;
  const all = !selected || selected.length === 0;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <span className="of-eyebrow" style={{ fontSize: 11 }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <button
          type="button"
          className={all ? 'of-chip of-status-success' : 'of-chip'}
          onClick={() => onChange(undefined)}
        >
          all
        </button>
        {options.slice(0, 20).map((value) => {
          const active = selected?.includes(value) ?? false;
          return (
            <button
              key={`${label}-${value}`}
              type="button"
              className={active ? 'of-chip of-status-success' : 'of-chip'}
              onClick={() => {
                const next = new Set(selected ?? []);
                if (active) next.delete(value); else next.add(value);
                const arr = Array.from(next);
                onChange(arr.length === 0 ? undefined : arr);
              }}
            >
              {value}
            </button>
          );
        })}
        {options.length > 20 ? (
          <span className="of-text-muted" style={{ fontSize: 11 }}>… +{options.length - 20} more</span>
        ) : null}
      </div>
    </div>
  );
}

function MetricsDashboardPanel({ suites, filters, onFiltersChange }: {
  suites: LocalEvaluationSuite[];
  filters: EvaluationMetricsDashboardFilters;
  onFiltersChange: (next: EvaluationMetricsDashboardFilters) => void;
}) {
  const dashboardInput = useMemo(() => suites.map((suite) => ({
    suite: {
      id: suite.id,
      targetFunctions: suite.targetFunctions,
      testCases: suite.testCases,
    },
    runs: suite.runHistory,
  })), [suites]);

  const dashboard = useMemo(() => buildEvaluationMetricsDashboard(dashboardInput, filters), [dashboardInput, filters]);

  function updateFilter<K extends keyof EvaluationMetricsDashboardFilters>(key: K, value: EvaluationMetricsDashboardFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Metrics dashboard</p>
          <h2 className="of-heading-md" style={{ margin: 0 }}>Aggregate evaluator metrics</h2>
          <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
            {dashboard.totalRuns} run{dashboard.totalRuns === 1 ? '' : 's'} · {dashboard.totalIterations} iteration{dashboard.totalIterations === 1 ? '' : 's'} · {percentLabel(dashboard.overallPassRate)} pass rate · avg {dashboard.averageDurationMs} ms/iteration
          </p>
        </div>
        <button
          type="button"
          className="of-button"
          onClick={() => onFiltersChange({})}
          disabled={Object.keys(filters).length === 0}
        >
          Clear filters
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <MultiSelectFilter label="Suite" options={dashboard.filterOptions.suiteIds} selected={filters.suiteIds} onChange={(next) => updateFilter('suiteIds', next)} />
        <MultiSelectFilter label="Run" options={dashboard.filterOptions.runIds} selected={filters.runIds} onChange={(next) => updateFilter('runIds', next)} />
        <MultiSelectFilter label="Target" options={dashboard.filterOptions.targetIds} selected={filters.targetIds} onChange={(next) => updateFilter('targetIds', next)} />
        <MultiSelectFilter label="Version" options={dashboard.filterOptions.versions} selected={filters.versions} onChange={(next) => updateFilter('versions', next)} />
        <MultiSelectFilter label="Model" options={dashboard.filterOptions.models} selected={filters.models} onChange={(next) => updateFilter('models', next)} />
        <MultiSelectFilter label="Metric" options={dashboard.filterOptions.metricNames} selected={filters.metricNames} onChange={(next) => updateFilter('metricNames', next)} />
        <MultiSelectFilter label="Test case" options={dashboard.filterOptions.testCaseIds} selected={filters.testCaseIds} onChange={(next) => updateFilter('testCaseIds', next)} />
        <div style={{ display: 'grid', gap: 4 }}>
          <span className="of-eyebrow" style={{ fontSize: 11 }}>Status</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['passed', 'failed'] as const).map((statusOption) => {
              const active = filters.status?.includes(statusOption) ?? false;
              return (
                <button
                  key={`status-${statusOption}`}
                  type="button"
                  className={active ? 'of-chip of-status-success' : 'of-chip'}
                  onClick={() => {
                    const next = new Set(filters.status ?? []);
                    if (active) next.delete(statusOption); else next.add(statusOption);
                    const arr = Array.from(next);
                    updateFilter('status', arr.length === 0 ? undefined : arr);
                  }}
                >
                  {statusOption}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <span className="of-eyebrow" style={{ fontSize: 11 }}>Time window</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="of-input"
              type="datetime-local"
              value={filters.timeWindow?.startIso ? filters.timeWindow.startIso.slice(0, 16) : ''}
              onChange={(event) => updateFilter('timeWindow', { ...filters.timeWindow, startIso: event.target.value ? new Date(event.target.value).toISOString() : undefined })}
            />
            <input
              className="of-input"
              type="datetime-local"
              value={filters.timeWindow?.endIso ? filters.timeWindow.endIso.slice(0, 16) : ''}
              onChange={(event) => updateFilter('timeWindow', { ...filters.timeWindow, endIso: event.target.value ? new Date(event.target.value).toISOString() : undefined })}
            />
          </div>
        </div>
      </div>

      {dashboard.totalRuns === 0 ? (
        <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No runs match the selected filters. Run an evaluation suite or relax the filters.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Pass-rate trend</p>
              <div style={{ display: 'grid', gap: 4 }}>
                {dashboard.trend.slice(-12).map((point) => (
                  <div key={point.runId} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 1fr auto', gap: 6, alignItems: 'center' }}>
                    <span className="of-text-muted" style={{ fontSize: 11 }}>{formatDate(point.completedAtIso)}</span>
                    <div style={{ background: 'var(--of-surface-soft, #f5f7fa)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(point.passRate * 100)}%`, height: 8, background: 'var(--status-success, #16a34a)' }} />
                    </div>
                    <span style={{ fontSize: 11 }}>{point.passCount}/{point.totalCount} ({percentLabel(point.passRate)})</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Aggregate metric pass rates</p>
              <div style={{ display: 'grid', gap: 4 }}>
                {dashboard.metricStats.slice(0, 8).map((metric) => (
                  <div key={`${metric.evaluatorId}-${metric.metricName}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 1fr auto', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11 }}>{metric.metricName}</span>
                    <div style={{ background: 'var(--of-surface-soft, #f5f7fa)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(metric.passRate * 100)}%`, height: 8, background: metric.passRate >= 0.8 ? 'var(--status-success, #16a34a)' : metric.passRate >= 0.5 ? 'var(--status-warning, #f59e0b)' : 'var(--status-danger, #dc2626)' }} />
                    </div>
                    <span style={{ fontSize: 11 }}>{metric.passCount}/{metric.totalCount}{metric.averageValue !== undefined ? ` (avg ${metric.averageValue.toFixed(2)})` : ''}</span>
                  </div>
                ))}
                {dashboard.metricStats.length === 0 ? <span className="of-text-muted" style={{ fontSize: 11 }}>No evaluator metrics match the filters.</span> : null}
              </div>
            </div>

            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Per-target stats</p>
              {dashboard.targetStats.map((target) => (
                <div key={target.targetId} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) auto auto', gap: 6, alignItems: 'center' }}>
                  <strong style={{ fontSize: 12 }}>{target.targetId}</strong>
                  <span className={statusChipClass(target.passRate >= 0.8)}>{target.passCount}/{target.iterations}</span>
                  <span className="of-text-muted" style={{ fontSize: 11 }}>{percentLabel(target.passRate)} · avg {target.averageDurationMs} ms</span>
                </div>
              ))}
              {dashboard.targetStats.length === 0 ? <span className="of-text-muted" style={{ fontSize: 11 }}>No targets match the filters.</span> : null}
            </div>
          </div>

          {dashboard.testCaseStats.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Worst-performing test cases</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="of-table" style={{ minWidth: 540, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Test case</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Iterations</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Pass rate</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Last status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.testCaseStats.slice(0, 8).map((row) => (
                      <tr key={row.testCaseId} style={{ borderTop: '1px solid var(--of-border-subtle, #e5e7eb)' }}>
                        <td style={{ padding: '4px 6px' }}>
                          <strong>{row.testCaseName}</strong>
                          <div className="of-text-muted" style={{ fontSize: 11 }}>{row.testCaseId}</div>
                        </td>
                        <td style={{ padding: '4px 6px' }}>{row.passCount}/{row.totalIterations}</td>
                        <td style={{ padding: '4px 6px' }}>{percentLabel(row.passRate)}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <span className={statusChipClass(row.lastStatus === 'passed')}>{row.lastStatus}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {dashboard.drillDownLinks.length > 0 ? (
            <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Drill-down · LLM trace + evaluator trace</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="of-table" style={{ minWidth: 640, width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Test case</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Target</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Iter.</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Traces</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.drillDownLinks.slice(0, 24).map((link) => (
                      <tr key={`${link.runId}-${link.testCaseId}-${link.targetId}-${link.iteration}`} style={{ borderTop: '1px solid var(--of-border-subtle, #e5e7eb)' }}>
                        <td style={{ padding: '4px 6px' }}>
                          <strong>{link.testCaseName}</strong>
                          <div className="of-text-muted" style={{ fontSize: 11 }}>{link.testCaseId}</div>
                        </td>
                        <td style={{ padding: '4px 6px' }}>{link.targetId}</td>
                        <td style={{ padding: '4px 6px' }}>{link.iteration}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <span className={statusChipClass(link.status === 'passed')}>{link.status}</span>
                        </td>
                        <td style={{ padding: '4px 6px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <a className="of-button" href={link.debugHref}>Debug view</a>
                          {link.llmTraceHref ? <a className="of-button" href={link.llmTraceHref}>LLM trace</a> : null}
                          <a className="of-button" href={link.evaluatorTraceHref}>Evaluator trace</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dashboard.drillDownLinks.length > 24 ? (
                  <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Showing first 24 of {dashboard.drillDownLinks.length} iterations.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function SuiteJsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 6 }}>
      <p className="of-eyebrow">{title}</p>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11, maxHeight: 180, overflow: 'auto' }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
