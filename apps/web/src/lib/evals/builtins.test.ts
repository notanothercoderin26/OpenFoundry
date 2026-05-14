import { describe, expect, it } from 'vitest';

import type { EvaluationEvaluator, EvaluationSuiteColumn, EvaluationTargetFunction, EvaluationTestCase } from '@/lib/api/evals';
import {
  applyMetricsDashboardFilters,
  buildEvaluationDebugView,
  buildEvaluationExperimentPlan,
  buildEvaluationMetricsDashboard,
  buildEvaluationResultsAnalyzer,
  buildEvaluationResultsDatasetWrite,
  buildEvaluationResultsTable,
  buildMultiTargetRunComparison,
  compareEvaluationRuns,
  computeEvaluationRunWarnings,
  createEvaluationResultsDatasetConfig,
  customEvaluatorDebugDefinitions,
  customEvaluatorMetricDefinitions,
  defaultEvaluationTargetVersion,
  estimateEvaluationRunComputeUsage,
  evaluateBuiltInEvaluator,
  evaluateEvaluationSuiteBuiltIns,
  evaluationEvaluatorIsLLMBacked,
  evaluationResultsDatasetRid,
  evaluationResultsDatasetUnsupportedTargets,
  evaluationRunMultiTargetCapabilities,
  evaluationTargetIsLLMBacked,
  createEvalScheduleConfig,
  evaluateLogicPublishGate,
  evaluatePromptSuggestionEvidence,
  evaluationTargetVersionOptions,
  monitorEvaluationScheduleRun,
  nextEvalScheduleRunAt,
  recordLogicPublishGateWaiver,
  runEvaluationExperiment,
  runEvaluationSuiteBuiltIns,
  trackPromptSuggestionApplication,
  validateCustomEvaluationFunction,
} from '@/lib/evals/builtins';

const target: EvaluationTargetFunction = {
  id: 'logic.customer-triage',
  kind: 'logic',
  function_rid: 'logic.customer-triage',
  version: 'published',
  signature: {
    inputs: [{ apiName: 'complaintText', type: 'string' }],
    outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
  },
};

const cases: EvaluationTestCase[] = [
  {
    id: 'case-1',
    name: 'Escalation',
    values: {
      finalAnswer: 'Escalate with service recovery',
      expectedAnswer: 'Escalate with service recovery',
      expectedRoute: 'Escalate',
      score: 7,
      expectedRange: { min: 5, max: 10 },
      dueDate: '2026-05-13',
      expectedWindow: { min: '2026-05-01', max: '2026-05-31' },
    },
  },
  {
    id: 'case-2',
    name: 'Recovery',
    values: {
      finalAnswer: 'Close without escalation',
      expectedAnswer: 'Escalate with service recovery',
      expectedRoute: 'Escalate',
      score: 12,
      expectedRange: { min: 5, max: 10 },
      dueDate: '2026-06-15',
      expectedWindow: { min: '2026-05-01', max: '2026-05-31' },
    },
  },
];

function evaluator(patch: Partial<EvaluationEvaluator>): EvaluationEvaluator {
  return {
    id: patch.id ?? 'evaluator-1',
    kind: 'built_in',
    evaluator: patch.evaluator ?? 'exact_match',
    target_mappings: {
      [target.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
    },
    objective: { metric: 'matches', target: true },
    ...patch,
  };
}

describe('built-in evaluation helpers', () => {
  it('evaluates boolean exact and regex objectives', () => {
    const exact = evaluator({ evaluator: 'exact_match' });
    const regex = evaluator({
      id: 'regex-1',
      evaluator: 'regex',
      config: { pattern: '^Escalate' },
      objective: { metric: 'matches_regex', target: true },
    });

    expect(evaluateBuiltInEvaluator(exact, target.id, cases[0], { actual: 'finalAnswer', expected: 'expectedAnswer' }).passed).toBe(true);
    expect(evaluateBuiltInEvaluator(exact, target.id, cases[1], { actual: 'finalAnswer', expected: 'expectedAnswer' }).passed).toBe(false);
    expect(evaluateBuiltInEvaluator(regex, target.id, cases[0], { actual: 'finalAnswer', expected: 'expectedRoute' }).passed).toBe(true);
    expect(evaluateBuiltInEvaluator(regex, target.id, cases[1], { actual: 'finalAnswer', expected: 'expectedRoute' }).passed).toBe(false);
  });

  it('evaluates numeric and temporal range objectives', () => {
    const numericRange = evaluator({
      id: 'range-1',
      evaluator: 'numeric_range',
      target_mappings: { [target.id]: { actual: 'score', expected: 'expectedRange' } },
      objective: { metric: 'in_range', target: true },
    });
    const temporalRange = evaluator({
      id: 'temporal-1',
      evaluator: 'temporal_range',
      target_mappings: { [target.id]: { actual: 'dueDate', expected: 'expectedWindow' } },
      objective: { metric: 'in_temporal_range', target: true },
    });

    expect(evaluateBuiltInEvaluator(numericRange, target.id, cases[0], { actual: 'score', expected: 'expectedRange' }).passed).toBe(true);
    expect(evaluateBuiltInEvaluator(numericRange, target.id, cases[1], { actual: 'score', expected: 'expectedRange' }).passed).toBe(false);
    expect(evaluateBuiltInEvaluator(temporalRange, target.id, cases[0], { actual: 'dueDate', expected: 'expectedWindow' }).passed).toBe(true);
    expect(evaluateBuiltInEvaluator(temporalRange, target.id, cases[1], { actual: 'dueDate', expected: 'expectedWindow' }).passed).toBe(false);
  });

  it('aggregates metric, iteration, and test-case pass status', () => {
    const summary = evaluateEvaluationSuiteBuiltIns({
      targetFunctions: [target],
      testCases: cases,
      evaluators: [
        evaluator({ id: 'exact-1', evaluator: 'exact_match' }),
        evaluator({
          id: 'distance-1',
          evaluator: 'distance',
          objective: { metric: 'distance', direction: 'minimize', threshold: 0 },
        }),
      ],
    });

    expect(summary.metricResults).toHaveLength(2);
    expect(summary.iterationResults).toHaveLength(2);
    expect(summary.testCaseResults).toHaveLength(2);
    expect(summary.testCaseResults[0].passed).toBe(true);
    expect(summary.testCaseResults[1].passed).toBe(false);
    expect(summary.passCount).toBe(1);
    expect(summary.passRate).toBe(0.5);
  });

  it('runs full suites and single test cases with target version selection and debugger links', () => {
    const suite = {
      id: 'suite-1',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };

    expect(defaultEvaluationTargetVersion({ ...target, version: 'last_saved_or_preview' })).toBe('last_saved');
    expect(evaluationTargetVersionOptions(target).map((option) => option.value)).toEqual(['last_saved', 'published']);

    const fullRun = runEvaluationSuiteBuiltIns(suite, {
      source: 'aip_evals_app',
      targetVersions: { [target.id]: 'published' },
    });

    expect(fullRun.status).toBe('completed');
    expect(fullRun.totalCount).toBe(2);
    expect(fullRun.passCount).toBe(1);
    expect(fullRun.metricResults[0].passRate).toBe(0.5);
    expect(fullRun.debuggerLinks[0].href).toContain('/aip-evals/runs/');
    expect(fullRun.computeUsage).toMatchObject({
      totalComputeSeconds: 26,
      runCount: 2,
      evaluatorComputeSeconds: 2,
    });

    const singleRun = runEvaluationSuiteBuiltIns(suite, {
      source: 'logic_sidebar',
      targetVersions: { [target.id]: 'last_saved' },
      testCaseIds: ['case-2'],
    });

    expect(singleRun.totalCount).toBe(1);
    expect(singleRun.passed).toBe(true);
    expect(singleRun.config.testCaseIds).toEqual(['case-2']);

    const expensiveRun = estimateEvaluationRunComputeUsage({
      ...suite,
      targetFunctions: [
        target,
        { ...target, id: 'agent.support', kind: 'agent_like', version: 'published' },
        { ...target, id: 'fn.route-ticket.py', kind: 'code_function', version: 'published' },
      ],
      testCases: Array.from({ length: 10 }, (_, index) => ({ ...cases[index % cases.length], id: `case-${index}` })),
      evaluators: [
        evaluator({ id: 'exact-1', evaluator: 'exact_match' }),
        evaluator({ id: 'regex-1', evaluator: 'regex' }),
      ],
    }, { iterations: 2, attribution: { projectId: 'customer-operations', evalRunId: 'eval-run-big' } });

    expect(expensiveRun.totalComputeSeconds).toBeGreaterThan(250);
    expect(expensiveRun.warnings.map((warning) => warning.field)).toContain('compute.totalComputeSeconds');
  });

  it('writes intermediate parameter values to evaluation result dataset rows', () => {
    const targetWithIntermediate: EvaluationTargetFunction = {
      ...target,
      signature: {
        ...target.signature,
        outputs: [
          ...target.signature.outputs,
          { apiName: 'riskScore', outputType: 'double', intermediateParameter: true },
        ],
      },
    };
    const columns: EvaluationSuiteColumn[] = [
      { id: 'complaintText', name: 'Complaint', apiName: 'complaintText', type: 'string', role: 'input' },
      { id: 'riskScore', name: 'Risk score', apiName: 'riskScore', type: 'double', role: 'intermediate_parameter' },
      { id: 'expectedRiskScore', name: 'Expected risk score', apiName: 'expectedRiskScore', type: 'double', role: 'expected_output' },
    ];
    const run = runEvaluationSuiteBuiltIns({
      id: 'suite-intermediate',
      targetFunctions: [targetWithIntermediate],
      testCaseColumns: columns,
      testCases: [{
        id: 'case-intermediate',
        name: 'Risk block',
        values: { complaintText: 'Shipment missed SLA', expectedRiskScore: 47 },
      }],
      evaluators: [evaluator({
        id: 'exact-risk',
        target_mappings: { [target.id]: { actual: 'riskScore', expected: 'expectedRiskScore' } },
      })],
    }, {
      targetVersions: { [target.id]: 'published' },
    });

    expect(run.status).toBe('completed');
    expect(run.resultDatasetRows[0]).toMatchObject({
      testCaseId: 'case-intermediate',
      outputs: { riskScore: 47 },
      intermediateParameters: { riskScore: 47 },
    });
    expect(run.resultDatasetRows[0].metrics[0]).toMatchObject({ actualName: 'riskScore', expectedName: 'expectedRiskScore' });
  });

  it('runs Ontology edit outputs inside an isolated simulation with custom and intermediate evaluators', () => {
    const ontologyTarget: EvaluationTargetFunction = {
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
          { apiName: 'actionEditPreview', outputType: 'ontology_edit_bundle' },
          { apiName: 'riskScore', outputType: 'double', intermediateParameter: true },
        ],
      },
    };
    const expectedOntologyEdits = {
      edits: [
        {
          operation: 'create',
          objectTypeId: 'SupportTicket',
          properties: { ticketRequester: 'Acme Logistics', classification: 'service_recovery' },
        },
        {
          operation: 'edit',
          objectTypeId: 'Customer',
          objectId: 'customer-4421',
          properties: { nextStep: 'service_recovery_follow_up' },
        },
        {
          operation: 'delete',
          objectTypeId: 'SupportTicket',
          identifyBy: { ticketId: 'stale-4421' },
        },
      ],
    };
    const customOntologyEvaluator: EvaluationEvaluator = {
      id: 'custom-ontology-edits',
      kind: 'custom_function',
      evaluator: 'fn.eval-ontology-edits.ts',
      function_rid: 'fn.eval-ontology-edits.ts',
      function_kind: 'typescript',
      version: 'published',
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
      target_mappings: {
        [ontologyTarget.id]: { actual: 'actionEditPreview', expected: 'expectedOntologyEdits' },
      },
    };
    const intermediateEvaluator = evaluator({
      id: 'risk-score',
      evaluator: 'numeric_range',
      objective: { metric: 'in_range', target: true },
      config: { min: 0, max: 1 },
      target_mappings: { [ontologyTarget.id]: { actual: 'riskScore', expected: 'expectedRiskScore' } },
    });

    const run = runEvaluationSuiteBuiltIns({
      id: 'suite-ontology-edits',
      targetFunctions: [ontologyTarget],
      testCaseColumns: [
        { id: 'complaintText', name: 'Complaint', apiName: 'complaintText', type: 'string', role: 'input' },
        { id: 'customerObject', name: 'Customer object', apiName: 'customerObject', type: 'object', role: 'input' },
        { id: 'staleTicketId', name: 'Stale ticket id', apiName: 'staleTicketId', type: 'string', role: 'input' },
        { id: 'riskScore', name: 'Risk score', apiName: 'riskScore', type: 'double', role: 'intermediate_parameter' },
        { id: 'expectedOntologyEdits', name: 'Expected edits', apiName: 'expectedOntologyEdits', type: 'json', role: 'expected_output' },
        { id: 'expectedRiskScore', name: 'Expected risk score', apiName: 'expectedRiskScore', type: 'double', role: 'expected_output' },
      ],
      testCases: [{
        id: 'case-ontology',
        name: 'Ontology edit simulation',
        values: {
          complaintText: 'Acme Logistics has a late shipment and needs recovery.',
          customerObject: { id: 'customer-4421', objectTypeId: 'Customer', properties: { name: 'Acme Logistics', nextStep: 'open' } },
          staleTicketId: 'stale-4421',
          expectedOntologyEdits,
          expectedRiskScore: 1,
        },
      }],
      evaluators: [customOntologyEvaluator, intermediateEvaluator],
    }, {
      targetVersions: { [ontologyTarget.id]: 'published' },
    });

    expect(run.status).toBe('completed');
    expect(run.passed).toBe(true);
    expect(run.metricResults.map((metric) => metric.metricName).sort()).toEqual([
      'editChecks.createdObjectFound',
      'editChecks.deletedObjectAbsent',
      'editChecks.editedObjectMatched',
      'in_range',
    ]);
    expect(run.resultDatasetRows[0].outputs.actionEditPreview).toMatchObject({
      kind: 'ontology_edit_bundle',
      realOntologyMutated: false,
      committed: false,
    });
    expect(run.resultDatasetRows[0].intermediateParameters).toEqual({ riskScore: 1 });
    expect(run.resultDatasetRows[0].ontologySimulation).toMatchObject({
      mode: 'ontology_simulation',
      isolated: true,
      realOntologyMutated: false,
      safety: { writesCommitted: false },
    });
    expect(run.resultDatasetRows[0].ontologySimulation?.createdObjects).toHaveLength(1);
    expect(run.resultDatasetRows[0].ontologySimulation?.editedObjects).toHaveLength(1);
    expect(run.resultDatasetRows[0].ontologySimulation?.deletedObjects).toHaveLength(1);
  });

  it('runs custom function evaluators with struct metrics and string debug outputs', () => {
    const customEvaluator: EvaluationEvaluator = {
      id: 'custom-quality',
      kind: 'custom_function',
      evaluator: 'fn.eval-response-quality.ts',
      function_rid: 'fn.eval-response-quality.ts',
      function_kind: 'typescript',
      version: 'published',
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
      target_mappings: {
        [target.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
      },
      metric_objectives: {
        'quality.isCorrect': { target: true },
        'quality.qualityScore': { direction: 'maximize', threshold: 0.5 },
      },
    };

    expect(validateCustomEvaluationFunction(customEvaluator)).toEqual([]);
    expect(customEvaluatorMetricDefinitions(customEvaluator).map((definition) => definition.name)).toEqual(['quality.isCorrect', 'quality.qualityScore']);
    expect(customEvaluatorDebugDefinitions(customEvaluator).map((definition) => definition.name)).toEqual(['quality.debugNotes', 'traceSummary']);

    const run = runEvaluationSuiteBuiltIns({
      id: 'suite-custom',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [customEvaluator],
    }, {
      targetVersions: { [target.id]: 'published' },
    });

    expect(run.status).toBe('completed');
    expect(run.metricResults).toHaveLength(2);
    expect(run.metricResults.map((metric) => metric.metricName).sort()).toEqual(['quality.isCorrect', 'quality.qualityScore']);
    expect(run.metricResults.some((metric) => metric.metricName === 'quality.debugNotes')).toBe(false);
    expect(run.customEvaluatorDebugOutputs).toHaveLength(4);
    expect(run.customEvaluatorDebugOutputs.map((debugOutput) => debugOutput.name)).toContain('quality.debugNotes');
    expect(run.iterationResults[0].debugOutputs).toHaveLength(2);
    expect(run.computeUsage).toMatchObject({
      evaluatorComputeSeconds: 8,
      totalComputeSeconds: 32,
    });

    const invalidEvaluator = {
      ...customEvaluator,
      id: 'debug-only',
      return_signature: { outputs: [{ apiName: 'reasoning', type: 'string' }] },
    };
    expect(validateCustomEvaluationFunction(invalidEvaluator).join(' ')).toContain('Boolean or numeric metric');
    expect(runEvaluationSuiteBuiltIns({
      id: 'suite-invalid-custom',
      targetFunctions: [target],
      testCases: cases.slice(0, 1),
      evaluators: [invalidEvaluator],
    }).status).toBe('error');
  });

  it('captures eval run configuration: input mapping, execution mode, iterations, parallelization, and run metadata', () => {
    const suite = {
      id: 'suite-run-config',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };

    const run = runEvaluationSuiteBuiltIns(suite, {
      source: 'aip_evals_app',
      targetVersions: { [target.id]: 'published' },
      iterations: 3,
      parallelization: 4,
      executionMode: 'project_scoped',
      inputMappings: { [target.id]: { complaintText: 'complaintText' } },
      metadata: {
        runInitiator: { id: 'user-7', name: 'On-call' },
        branchName: 'main',
        model: 'gpt-4.1-mini',
        customLabels: ['regression', 'sla-checks'],
        customMetadata: { ticketId: 'TKT-42' },
        notes: 'Weekly regression for SLA detection',
      },
    });

    expect(run.status).toBe('completed');
    expect(run.config).toMatchObject({
      iterations: 3,
      parallelization: 4,
      executionMode: 'project_scoped',
      inputMappings: { [target.id]: { complaintText: 'complaintText' } },
      targetVersions: { [target.id]: 'published' },
    });
    expect(run.config.metadata).toMatchObject({
      runInitiator: { id: 'user-7', name: 'On-call' },
      branchName: 'main',
      model: 'gpt-4.1-mini',
      customLabels: ['regression', 'sla-checks'],
    });
  });

  it('warns when LLM-backed targets run with a single iteration and at high parallelization', () => {
    const llmTarget: EvaluationTargetFunction = {
      ...target,
      id: 'logic.llm-summary',
      // Logic targets are LLM-backed by default in this codebase.
    };
    const suite = {
      id: 'suite-llm-warnings',
      targetFunctions: [llmTarget],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match', target_mappings: { [llmTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } } })],
    };

    expect(evaluationTargetIsLLMBacked(llmTarget)).toBe(true);
    expect(evaluationEvaluatorIsLLMBacked(suite.evaluators[0])).toBe(false);

    const singleIteration = runEvaluationSuiteBuiltIns(suite, { iterations: 1, parallelization: 1 });
    const codes = singleIteration.warnings.map((warning) => warning.code);
    expect(codes).toContain('llm_iteration_recommendation');
    expect(codes).not.toContain('parallelization_rate_limit');

    const tooParallel = runEvaluationSuiteBuiltIns(suite, { iterations: 3, parallelization: 16 });
    const parallelCodes = tooParallel.warnings.map((warning) => warning.code);
    expect(parallelCodes).toContain('parallelization_rate_limit');
    expect(parallelCodes).not.toContain('llm_iteration_recommendation');
  });

  it('flags unmapped target inputs in input mapping configuration', () => {
    const multiInputTarget: EvaluationTargetFunction = {
      ...target,
      id: 'logic.triage-with-context',
      signature: {
        inputs: [
          { apiName: 'complaintText', type: 'string' },
          { apiName: 'priorityHint', type: 'string' },
        ],
        outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
      },
    };
    const warnings = computeEvaluationRunWarnings(
      {
        targetFunctions: [multiInputTarget],
        testCases: cases,
        evaluators: [],
      },
      { inputMappings: { [multiInputTarget.id]: { complaintText: 'complaintText' } } },
      [multiInputTarget],
      2,
      1,
    );
    const missingMapping = warnings.find((warning) => warning.code === 'input_mapping_missing');
    expect(missingMapping?.message).toContain('priorityHint');
  });

  it('runs multi-target suites with included-target filtering and produces cross-target comparison', () => {
    const logicTarget: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const agentTarget: EvaluationTargetFunction = {
      id: 'chatbot.support-agent',
      kind: 'agent_like',
      version: 'published',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
      },
    };
    const codeTarget: EvaluationTargetFunction = {
      id: 'fn.route-ticket.py',
      kind: 'code_function',
      version: 'published',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
      },
    };
    const suite = {
      id: 'suite-multi-target',
      targetFunctions: [logicTarget, agentTarget, codeTarget],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: {
          [logicTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
          [agentTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
          [codeTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
        },
      })],
    };

    // Include only two of three targets and set per-target models for comparison
    const run = runEvaluationSuiteBuiltIns(suite, {
      source: 'aip_evals_app',
      targetIds: [logicTarget.id, agentTarget.id],
      targetVersions: { [logicTarget.id]: 'published', [agentTarget.id]: 'published' },
      targetModels: { [logicTarget.id]: 'gpt-4.1-mini', [agentTarget.id]: 'claude-haiku-4-5' },
    });

    expect(run.status).toBe('completed');
    expect(run.config.targetIds).toEqual([logicTarget.id, agentTarget.id]);
    expect(run.config.targetModels).toEqual({ [logicTarget.id]: 'gpt-4.1-mini', [agentTarget.id]: 'claude-haiku-4-5' });
    expect(run.multiTargetComparison).toBeDefined();
    const comparison = run.multiTargetComparison!;
    expect(comparison.multiTarget).toBe(true);
    expect(comparison.targetSummaries.map((row) => row.targetId).sort()).toEqual([agentTarget.id, logicTarget.id].sort());
    const logicSummary = comparison.targetSummaries.find((row) => row.targetId === logicTarget.id)!;
    expect(logicSummary.model).toBe('gpt-4.1-mini');
    expect(logicSummary.version).toBe('published');
    expect(comparison.metricComparisons).toHaveLength(1);
    expect(comparison.metricComparisons[0].perTarget.map((row) => row.targetId).sort()).toEqual([agentTarget.id, logicTarget.id].sort());
    expect(comparison.bestTargetId).toBeDefined();

    // Warns about disabled multi-target experiment options
    const disabledCodes = run.warnings.filter((warning) => warning.code === 'multi_target_experiment_disabled').map((warning) => warning.message);
    expect(disabledCodes.some((message) => message.includes('per_target_prompt_sweep'))).toBe(true);
    expect(disabledCodes.some((message) => message.includes('single_target_grid_search'))).toBe(true);
  });

  it('warns when only one target is included from a multi-target suite', () => {
    const logicTarget: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const agentTarget: EvaluationTargetFunction = {
      id: 'chatbot.support-agent',
      kind: 'agent_like',
      version: 'published',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
      },
    };
    const suite = {
      id: 'suite-multi-target-single-run',
      targetFunctions: [logicTarget, agentTarget],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: {
          [logicTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
          [agentTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
        },
      })],
    };

    const run = runEvaluationSuiteBuiltIns(suite, {
      targetIds: [logicTarget.id],
      targetVersions: { [logicTarget.id]: 'published' },
    });
    expect(run.warnings.some((warning) => warning.code === 'multi_target_single_target_run')).toBe(true);
    expect(run.multiTargetComparison?.multiTarget).toBe(false);
  });

  it('reports disabled multi-target experiment options via capability helper', () => {
    const logicTarget: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const agentTarget: EvaluationTargetFunction = {
      id: 'chatbot.support-agent',
      kind: 'agent_like',
      version: 'published',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
      },
    };
    const suite = { targetFunctions: [logicTarget, agentTarget] };

    const singleTarget = evaluationRunMultiTargetCapabilities(suite, { targetIds: [logicTarget.id] });
    expect(singleTarget.multiTarget).toBe(false);
    expect(singleTarget.disabledExperimentOptions).toEqual([]);

    const both = evaluationRunMultiTargetCapabilities(suite);
    expect(both.multiTarget).toBe(true);
    const codes = both.disabledExperimentOptions.map((option) => option.option);
    expect(codes).toContain('per_target_prompt_sweep');
    expect(codes).toContain('single_target_grid_search');
    expect(codes).toContain('per_target_evaluator_threshold_sweep');
  });

  it('produces empty comparison when no targets were included in the run', () => {
    const comparison = buildMultiTargetRunComparison(
      { targetFunctions: [target] },
      {
        iterationResults: [],
        metricResults: [],
        testCaseResults: [],
        config: {
          source: 'aip_evals_app',
          iterations: 1,
          parallelization: 1,
          executionMode: 'user_scoped',
          targetVersions: {},
          targetModels: {},
          targetIds: [],
          testCaseIds: [],
          inputMappings: {},
          metadata: {},
        },
      },
    );
    expect(comparison.multiTarget).toBe(false);
    expect(comparison.targetSummaries).toEqual([]);
    expect(comparison.metricComparisons).toEqual([]);
  });

  it('configures the results dataset in the same project as the suite and writes rows for project-scoped runs', () => {
    const suite = {
      id: 'suite-results-dataset',
      projectId: 'project-customer-ops',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };
    const datasetRid = evaluationResultsDatasetRid('project-customer-ops', suite.id);
    expect(datasetRid).toContain('project-customer-ops');
    expect(datasetRid).toContain(suite.id);

    const config = createEvaluationResultsDatasetConfig(suite);
    expect(config.projectId).toBe('project-customer-ops');
    expect(config.datasetRid).toBe(datasetRid);
    expect(config.schema.map((column) => column.name)).toContain('user_metadata');
    expect(config.schema.map((column) => column.name)).toContain('auto_captured_metadata');
    expect(config.schema.map((column) => column.name)).toContain('intermediate_parameters');
    expect(config.schema.map((column) => column.name)).toContain('evaluator_results');
    expect(config.schema.map((column) => column.name)).toContain('errors');
    expect(config.unsupportedTargets).toEqual([]);

    const run = runEvaluationSuiteBuiltIns(suite, {
      source: 'aip_evals_app',
      executionMode: 'project_scoped',
      targetVersions: { [target.id]: 'published' },
      targetModels: { [target.id]: 'gpt-4.1-mini' },
      metadata: {
        runInitiator: { id: 'user-1', name: 'On-call' },
        branchName: 'main',
        customLabels: ['regression'],
        customMetadata: { ticketId: 'TKT-9' },
        notes: 'Daily regression',
      },
    });

    expect(run.resultsDatasetWrite).toBeDefined();
    const write = run.resultsDatasetWrite!;
    expect(write.written).toBe(true);
    expect(write.reason).toBe('project_scoped_execution');
    expect(write.config.projectId).toBe('project-customer-ops');
    expect(write.rows.length).toBeGreaterThan(0);
    const firstRow = write.rows[0];
    expect(firstRow.runId).toBe(run.id);
    expect(firstRow.evaluationSuiteId).toBe(suite.id);
    expect(firstRow.userMetadata.runInitiator?.id).toBe('user-1');
    expect(firstRow.userMetadata.customLabels).toEqual(['regression']);
    expect(firstRow.userMetadata.customMetadata).toEqual({ ticketId: 'TKT-9' });
    expect(firstRow.userMetadata.notes).toBe('Daily regression');
    expect(firstRow.autoCapturedMetadata.executionMode).toBe('project_scoped');
    expect(firstRow.autoCapturedMetadata.branchName).toBe('main');
    expect(firstRow.autoCapturedMetadata.model).toBe('gpt-4.1-mini');
    expect(firstRow.autoCapturedMetadata.projectId).toBe('project-customer-ops');
    expect(firstRow.evaluatorResults.length).toBeGreaterThan(0);
    expect(firstRow.targetModel).toBe('gpt-4.1-mini');
    expect(firstRow.targetVersion).toBe('published');
  });

  it('skips the results dataset write for user-scoped runs and emits a warning', () => {
    const suite = {
      id: 'suite-user-scoped',
      projectId: 'project-customer-ops',
      targetFunctions: [target],
      testCases: cases.slice(0, 1),
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };
    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'user_scoped',
      targetVersions: { [target.id]: 'published' },
    });
    expect(run.resultsDatasetWrite?.written).toBe(false);
    expect(run.resultsDatasetWrite?.reason).toBe('user_scoped_execution_skipped');
    expect(run.warnings.some((warning) => warning.code === 'results_dataset_skipped_user_scoped')).toBe(true);
  });

  it('warns when the suite has no project id', () => {
    const suite = {
      id: 'suite-no-project',
      targetFunctions: [target],
      testCases: cases.slice(0, 1),
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };
    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target.id]: 'published' },
    });
    expect(run.resultsDatasetWrite?.written).toBe(false);
    expect(run.resultsDatasetWrite?.reason).toBe('no_project_id');
    expect(run.warnings.some((warning) => warning.code === 'results_dataset_missing_project')).toBe(true);
  });

  it('skips ontology-edits-only targets and documents them in unsupportedTargets', () => {
    const ontologyOnlyTarget: EvaluationTargetFunction = {
      id: 'logic.service-case-editor',
      kind: 'logic',
      version: 'published',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'editBundle', outputType: 'ontology_edit_bundle' }],
      },
    };
    const supportedTarget: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-mixed-targets',
      projectId: 'project-customer-ops',
      targetFunctions: [ontologyOnlyTarget, supportedTarget],
      testCases: cases.slice(0, 1),
      evaluators: [
        evaluator({
          id: 'exact-1',
          evaluator: 'exact_match',
          target_mappings: {
            [supportedTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
          },
        }),
        {
          id: 'ontology-edit-eval',
          kind: 'custom_function',
          evaluator: 'fn.eval-ontology-edits.ts',
          function_rid: 'fn.eval-ontology-edits.ts',
          function_kind: 'typescript',
          version: 'published',
          return_signature: {
            outputs: [{ apiName: 'edited', type: 'boolean' }],
          },
          target_mappings: {
            [ontologyOnlyTarget.id]: { actual: 'editBundle', expected: 'expectedEdits' },
          },
        },
      ],
    };

    const unsupported = evaluationResultsDatasetUnsupportedTargets(suite);
    expect(unsupported.map((row) => row.targetId)).toEqual([ontologyOnlyTarget.id]);

    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetIds: [ontologyOnlyTarget.id, supportedTarget.id],
      targetVersions: { [ontologyOnlyTarget.id]: 'published', [supportedTarget.id]: 'published' },
    });

    const write = run.resultsDatasetWrite!;
    expect(write.config.unsupportedTargets.map((row) => row.targetId)).toEqual([ontologyOnlyTarget.id]);
    expect(write.rows.every((row) => row.targetId !== ontologyOnlyTarget.id)).toBe(true);
    expect(write.skippedRows.find((row) => row.targetId === ontologyOnlyTarget.id)?.reason).toBe('ontology_edits_only');
    expect(run.warnings.some((warning) => warning.code === 'results_dataset_unsupported_target' && warning.targetId === ontologyOnlyTarget.id)).toBe(true);
  });

  it('emits no_supported_target_outputs warning when every included target only returns Ontology edits', () => {
    const ontologyOnlyTarget: EvaluationTargetFunction = {
      id: 'logic.service-case-editor',
      kind: 'logic',
      version: 'published',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'editBundle', outputType: 'ontology_edit_bundle' }],
      },
    };
    const suite = {
      id: 'suite-ontology-only',
      projectId: 'project-customer-ops',
      targetFunctions: [ontologyOnlyTarget],
      testCases: cases.slice(0, 1),
      evaluators: [{
        id: 'ontology-edit-eval',
        kind: 'custom_function',
        evaluator: 'fn.eval-ontology-edits.ts',
        function_rid: 'fn.eval-ontology-edits.ts',
        function_kind: 'typescript',
        version: 'published',
        return_signature: { outputs: [{ apiName: 'edited', type: 'boolean' }] },
        target_mappings: { [ontologyOnlyTarget.id]: { actual: 'editBundle', expected: 'expectedEdits' } },
      }],
    };
    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [ontologyOnlyTarget.id]: 'published' },
    });
    expect(run.resultsDatasetWrite?.written).toBe(false);
    expect(run.resultsDatasetWrite?.reason).toBe('no_supported_target_outputs');
    expect(run.warnings.some((warning) => warning.code === 'results_dataset_no_target_outputs')).toBe(true);
  });

  it('builds a results table with inputs, expected values, actual outputs, evaluator outputs, debug strings, and errors', () => {
    const customEvaluator: EvaluationEvaluator = {
      id: 'custom-quality',
      kind: 'custom_function',
      evaluator: 'fn.eval-response-quality.ts',
      function_rid: 'fn.eval-response-quality.ts',
      function_kind: 'typescript',
      version: 'published',
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
        ],
      },
      metric_objectives: {
        'quality.isCorrect': { target: true },
        'quality.qualityScore': { direction: 'maximize', threshold: 0.5 },
      },
      target_mappings: { [target.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
    };
    const suite = {
      id: 'suite-results-table',
      projectId: 'project-customer-ops',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [
        evaluator({ id: 'exact-1', evaluator: 'exact_match' }),
        customEvaluator,
      ],
    };
    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target.id]: 'published' },
      targetModels: { [target.id]: 'gpt-4.1-mini' },
    });

    const table = buildEvaluationResultsTable(suite, run);
    expect(table.runId).toBe(run.id);
    expect(table.totalCount).toBe(run.totalCount);
    expect(table.passCount).toBe(run.passCount);
    expect(table.failureCount).toBe(Math.max(0, run.totalCount - run.passCount));
    expect(table.aggregateMetrics).toEqual(run.metricResults);
    expect(table.rows.length).toBe(cases.length);

    const escalationRow = table.rows.find((row) => row.testCaseId === 'case-1');
    expect(escalationRow).toBeDefined();
    expect(escalationRow!.testCaseName).toBe('Escalation');
    expect(escalationRow!.status).toBe('passed');
    expect(escalationRow!.targetVersion).toBe('published');
    expect(escalationRow!.targetModel).toBe('gpt-4.1-mini');
    expect(escalationRow!.inputs).toEqual(expect.any(Object));
    expect(escalationRow!.expectedValues).toMatchObject({ expectedAnswer: 'Escalate with service recovery' });
    expect(escalationRow!.actualOutputs).toMatchObject({ finalAnswer: expect.any(String) });
    expect(escalationRow!.evaluatorOutputs.length).toBeGreaterThan(0);
    expect(escalationRow!.customEvaluatorDebugOutputs.some((debugOutput) => debugOutput.name.endsWith('debugNotes'))).toBe(true);
    expect(escalationRow!.debuggerHref).toContain(run.id);

    const recoveryRow = table.rows.find((row) => row.testCaseId === 'case-2');
    expect(recoveryRow).toBeDefined();
    expect(recoveryRow!.status).toBe('failed');
  });

  it('opens a debug view for a specific test case + target + iteration with logic trace and evaluator trace steps', () => {
    const suite = {
      id: 'suite-debug-view',
      projectId: 'project-customer-ops',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };
    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      iterations: 2,
      targetVersions: { [target.id]: 'published' },
      targetModels: { [target.id]: 'gpt-4.1-mini' },
    });

    const debugView = buildEvaluationDebugView(suite, run, 'case-1', target.id, 2);
    expect(debugView).toBeDefined();
    expect(debugView!.iteration).toBe(2);
    expect(debugView!.targetModel).toBe('gpt-4.1-mini');
    expect(debugView!.evaluatorOutputs.length).toBeGreaterThan(0);
    expect(debugView!.evaluatorOutputs[0].reason).toBeTruthy();
    expect(debugView!.expectedValues).toMatchObject({ expectedAnswer: 'Escalate with service recovery' });
    const kinds = debugView!.traceSteps.map((step) => step.kind);
    expect(kinds).toContain('logic_trace');
    expect(kinds).toContain('evaluator_trace');
    expect(debugView!.href).toContain(run.id);
    expect(debugView!.href).toContain('iteration=2');

    const missing = buildEvaluationDebugView(suite, run, 'case-1', 'fn.unknown', 1);
    expect(missing).toBeUndefined();
  });

  it('produces a code function preview trace step for code-authored targets', () => {
    const codeTarget: EvaluationTargetFunction = {
      id: 'fn.route-ticket.py',
      kind: 'code_function',
      function_rid: 'fn.route-ticket.py',
      version: 'published',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
      },
    };
    const suite = {
      id: 'suite-code-target',
      projectId: 'project-customer-ops',
      targetFunctions: [codeTarget],
      testCases: cases.slice(0, 1),
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [codeTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    const run = runEvaluationSuiteBuiltIns(suite, { executionMode: 'project_scoped' });
    const debugView = buildEvaluationDebugView(suite, run, 'case-1', codeTarget.id);
    expect(debugView).toBeDefined();
    const codeStep = debugView!.traceSteps.find((step) => step.kind === 'code_function_preview');
    expect(codeStep).toBeDefined();
    expect(codeStep!.payload['function_rid']).toBe('fn.route-ticket.py');
    expect(codeStep!.payload['signature']).toEqual(codeTarget.signature);
  });

  it('compares two evaluation runs side by side and highlights aggregate, status, metadata, and evaluator differences', () => {
    const target2: EvaluationTargetFunction = {
      ...target,
      id: 'logic.customer-triage',
    };
    const suite = {
      id: 'suite-compare',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [
        evaluator({
          id: 'exact-1',
          evaluator: 'exact_match',
          target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
        }),
      ],
    };

    // Base run: published version, no model override — recovery case fails because
    // the simulated published output is 'Close without escalation'.
    const baseRun = runEvaluationSuiteBuiltIns(suite, {
      source: 'aip_evals_app',
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });
    // Head run: last_saved version + new model — Logic last_saved emits the
    // expected answer so the recovery case flips to passing.
    const headRun = runEvaluationSuiteBuiltIns(suite, {
      source: 'aip_evals_app',
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'last_saved' },
      targetModels: { [target2.id]: 'gpt-4.1-mini' },
    });

    const comparison = compareEvaluationRuns(suite, baseRun, headRun);

    expect(comparison.baseRunId).toBe(baseRun.id);
    expect(comparison.headRunId).toBe(headRun.id);
    expect(comparison.basePassRate).toBeLessThan(comparison.headPassRate);
    expect(comparison.passCountDelta).toBeGreaterThan(0);
    expect(comparison.summary.newlyPassed).toBeGreaterThan(0);
    expect(comparison.summary.newlyFailed).toBe(0);

    // Aggregate metric changes include the exact-match evaluator improving.
    const aggregateExact = comparison.aggregateMetricChanges.find((row) => row.evaluatorId === 'exact-1');
    expect(aggregateExact).toBeDefined();
    expect(aggregateExact!.passRateDelta).toBeGreaterThan(0);
    expect(aggregateExact!.changeKind).toBe('improved');

    // Target metadata diff highlights version + model changes.
    const targetMetadata = comparison.targetMetadataChanges.find((row) => row.targetId === target2.id);
    expect(targetMetadata).toBeDefined();
    expect(targetMetadata!.versionChanged).toBe(true);
    expect(targetMetadata!.modelChanged).toBe(true);
    expect(targetMetadata!.baseVersion).toBe('published');
    expect(targetMetadata!.headVersion).toBe('last_saved');
    expect(targetMetadata!.headModel).toBe('gpt-4.1-mini');

    // The recovery test case flipped newly_passed, with an output diff on finalAnswer.
    const flippedCase = comparison.testCaseChanges.find((row) => row.testCaseId === 'case-2');
    expect(flippedCase).toBeDefined();
    expect(flippedCase!.changeKind).toBe('newly_passed');
    expect(flippedCase!.outputDiff.find((diff) => diff.key === 'finalAnswer')).toBeDefined();
    expect(flippedCase!.baseDebuggerHref).toContain(baseRun.id);
    expect(flippedCase!.headDebuggerHref).toContain(headRun.id);

    // Evaluator diffs include the flipped exact-match metric for case-2.
    const flippedEvaluator = comparison.evaluatorDiffs.find((diff) => diff.evaluatorId === 'exact-1' && diff.testCaseId === 'case-2');
    expect(flippedEvaluator).toBeDefined();
    expect(flippedEvaluator!.changeKind === 'passed_changed' || flippedEvaluator!.changeKind === 'metric_value_changed').toBe(true);
  });

  it('reports only-in-base / only-in-head iterations when test case sets differ', () => {
    const suite = {
      id: 'suite-compare-disjoint',
      projectId: 'project-customer-ops',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };
    const baseRun = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      testCaseIds: ['case-1'],
      targetVersions: { [target.id]: 'published' },
    });
    const headRun = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      testCaseIds: ['case-2'],
      targetVersions: { [target.id]: 'published' },
    });
    const comparison = compareEvaluationRuns(suite, baseRun, headRun);
    expect(comparison.summary.onlyInBase).toBeGreaterThan(0);
    expect(comparison.summary.onlyInHead).toBeGreaterThan(0);
    expect(comparison.testCaseChanges.some((row) => row.changeKind === 'only_in_base')).toBe(true);
    expect(comparison.testCaseChanges.some((row) => row.changeKind === 'only_in_head')).toBe(true);
  });

  it('reports unchanged aggregate metrics when two identical runs are compared', () => {
    const suite = {
      id: 'suite-compare-identical',
      projectId: 'project-customer-ops',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };
    const config = {
      executionMode: 'project_scoped' as const,
      targetVersions: { [target.id]: 'published' },
    };
    const baseRun = runEvaluationSuiteBuiltIns(suite, config);
    const headRun = runEvaluationSuiteBuiltIns(suite, config);
    const comparison = compareEvaluationRuns(suite, baseRun, headRun);
    expect(comparison.passRateDelta).toBe(0);
    expect(comparison.summary.newlyPassed).toBe(0);
    expect(comparison.summary.newlyFailed).toBe(0);
    expect(comparison.evaluatorDiffs).toEqual([]);
    expect(comparison.aggregateMetricChanges.every((row) => row.changeKind === 'unchanged')).toBe(true);
  });

  it('builds a metrics dashboard with charts, stats, filter options, and drill-down links', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suiteA = {
      id: 'suite-dashboard-a',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match', target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } } })],
    };
    const codeTarget: EvaluationTargetFunction = {
      id: 'fn.route-ticket.py',
      kind: 'code_function',
      version: 'published',
      function_rid: 'fn.route-ticket.py',
      signature: {
        inputs: [{ apiName: 'complaintText', type: 'string' }],
        outputs: [{ apiName: 'finalAnswer', outputType: 'string' }],
      },
    };
    const suiteB = {
      id: 'suite-dashboard-b',
      projectId: 'project-customer-ops',
      targetFunctions: [codeTarget],
      testCases: cases.slice(0, 1),
      evaluators: [evaluator({
        id: 'exact-2',
        evaluator: 'exact_match',
        target_mappings: { [codeTarget.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };

    const runA1 = runEvaluationSuiteBuiltIns(suiteA, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });
    const runA2 = runEvaluationSuiteBuiltIns(suiteA, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'last_saved' },
      targetModels: { [target2.id]: 'gpt-4.1-mini' },
    });
    const runB1 = runEvaluationSuiteBuiltIns(suiteB, {
      executionMode: 'project_scoped',
      targetModels: { [codeTarget.id]: 'gpt-4.1-mini' },
    });

    const entries = [
      { suite: { id: suiteA.id, targetFunctions: suiteA.targetFunctions, testCases: suiteA.testCases }, runs: [runA1, runA2] },
      { suite: { id: suiteB.id, targetFunctions: suiteB.targetFunctions, testCases: suiteB.testCases }, runs: [runB1] },
    ];

    const dashboard = buildEvaluationMetricsDashboard(entries);
    expect(dashboard.totalRuns).toBe(3);
    expect(dashboard.totalIterations).toBeGreaterThan(0);
    expect(dashboard.trend.length).toBe(3);
    expect(dashboard.filterOptions.suiteIds).toEqual([suiteA.id, suiteB.id].sort());
    expect(dashboard.filterOptions.targetIds.sort()).toEqual([codeTarget.id, target2.id].sort());
    expect(dashboard.filterOptions.versions.sort()).toEqual(['last_saved', 'published'].sort());
    expect(dashboard.filterOptions.models).toEqual(['gpt-4.1-mini']);
    expect(dashboard.targetStats.some((row) => row.targetId === target2.id)).toBe(true);
    expect(dashboard.targetStats.some((row) => row.targetId === codeTarget.id)).toBe(true);
    expect(dashboard.metricStats.length).toBeGreaterThan(0);

    // Drill-down: logic targets should have LLM trace href, code function should not.
    const logicDrill = dashboard.drillDownLinks.find((link) => link.targetId === target2.id);
    expect(logicDrill?.llmTraceHref).toBeDefined();
    expect(logicDrill?.debugHref).toContain('/aip-evals/runs/');
    expect(logicDrill?.evaluatorTraceHref).toContain('evaluator-trace');
    const codeDrill = dashboard.drillDownLinks.find((link) => link.targetId === codeTarget.id);
    expect(codeDrill).toBeDefined();
    expect(codeDrill?.llmTraceHref).toBeUndefined();
    expect(codeDrill?.evaluatorTraceHref).toContain('evaluator-trace');
  });

  it('filters dashboard runs by suite, version, model, target, status, metric, test case, and time window', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suiteA = {
      id: 'suite-dashboard-filter-a',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match', target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } } })],
    };
    const runPublished = runEvaluationSuiteBuiltIns(suiteA, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });
    const runLastSaved = runEvaluationSuiteBuiltIns(suiteA, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'last_saved' },
      targetModels: { [target2.id]: 'claude-haiku-4-5' },
    });
    const entries = [{
      suite: { id: suiteA.id, targetFunctions: suiteA.targetFunctions, testCases: suiteA.testCases },
      runs: [runPublished, runLastSaved],
    }];

    // Filter by version=published → only the published run remains
    const filtered = applyMetricsDashboardFilters(entries, { versions: ['published'] });
    expect(filtered[0].runs.map((run) => run.id)).toEqual([runPublished.id]);

    // Dashboard with status=failed filter only counts failed iterations
    const onlyFailed = buildEvaluationMetricsDashboard(entries, { status: ['failed'] });
    expect(onlyFailed.totalIterations).toBeGreaterThan(0);
    expect(onlyFailed.drillDownLinks.every((link) => link.status === 'failed')).toBe(true);

    // Dashboard with test case filter scopes to a single test case
    const onlyCase1 = buildEvaluationMetricsDashboard(entries, { testCaseIds: ['case-1'] });
    expect(onlyCase1.testCaseStats.every((row) => row.testCaseId === 'case-1')).toBe(true);
    expect(onlyCase1.drillDownLinks.every((link) => link.testCaseId === 'case-1')).toBe(true);

    // Dashboard with model filter excludes runs without that model
    const onlyHaiku = buildEvaluationMetricsDashboard(entries, { models: ['claude-haiku-4-5'] });
    expect(onlyHaiku.totalRuns).toBe(1);
    expect(onlyHaiku.trend[0].runId).toBe(runLastSaved.id);

    // Dashboard with target filter ignores runs that don't include the target
    const onlyOtherTarget = buildEvaluationMetricsDashboard(entries, { targetIds: ['logic.unknown'] });
    expect(onlyOtherTarget.totalRuns).toBe(0);

    // Dashboard with metric filter restricts metric stats
    const onlyExact = buildEvaluationMetricsDashboard(entries, { metricNames: ['matches'] });
    expect(onlyExact.metricStats.every((row) => row.metricName === 'matches')).toBe(true);

    // Time window filtering — far-future window excludes both runs
    const futureWindow = buildEvaluationMetricsDashboard(entries, {
      timeWindow: { startIso: '2099-01-01T00:00:00.000Z' },
    });
    expect(futureWindow.totalRuns).toBe(0);
  });

  it('groups failed iterations into root-cause categories with examples and prompt suggestions', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-analyzer',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [
        evaluator({
          id: 'exact-1',
          evaluator: 'exact_match',
          target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
        }),
        evaluator({
          id: 'numeric-1',
          evaluator: 'numeric_range',
          config: { min: 0, max: 5 },
          objective: { metric: 'in_range', target: true },
          target_mappings: { [target2.id]: { actual: 'score', expected: 'expectedRange' } },
        }),
      ],
    };
    // Published run causes case-2 to fail exact-match; case-1 has score=7 outside [0,5] so numeric fails too.
    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });
    expect(run.passCount).toBeLessThan(run.totalCount);

    const report = buildEvaluationResultsAnalyzer(suite, run, { maxCategories: 5, maxFailingTestCases: 3 });

    expect(report.runId).toBe(run.id);
    expect(report.evaluationSuiteId).toBe(suite.id);
    expect(report.config.model).toBe('openfoundry.analyzer.v1');
    expect(report.config.maxCategories).toBe(5);
    expect(report.config.maxFailingTestCases).toBe(3);
    expect(report.totalFailingIterations).toBeGreaterThan(0);
    expect(report.categories.length).toBeGreaterThan(0);
    const kinds = report.categories.map((category) => category.kind);
    expect(kinds).toContain('exact_mismatch');
    expect(kinds).toContain('numeric_out_of_range');
    expect(report.categories.every((category) => category.promptSuggestion.length > 0)).toBe(true);
    expect(report.categories.every((category) => category.affectedTestCaseIds.length > 0)).toBe(true);
    expect(report.categories[0].examples.length).toBeLessThanOrEqual(3);
    const firstExample = report.categories[0].examples[0];
    expect(firstExample.debuggerHref).toContain(run.id);
    expect(report.summary).toContain('failing iteration');
  });

  it('reports no_failures when all iterations passed', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-analyzer-pass',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    // last_saved makes both cases pass exact match.
    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'last_saved' },
    });
    const report = buildEvaluationResultsAnalyzer(suite, run);
    expect(report.unsupportedReason).toBe('no_failures');
    expect(report.categories).toEqual([]);
    expect(report.summary).toContain('All iterations passed');
  });

  it('caps categories with maxCategories and reports remainingCategoriesCount', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-analyzer-cap',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [
        evaluator({
          id: 'exact-1',
          evaluator: 'exact_match',
          target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
        }),
        evaluator({
          id: 'numeric-1',
          evaluator: 'numeric_range',
          config: { min: 0, max: 5 },
          objective: { metric: 'in_range', target: true },
          target_mappings: { [target2.id]: { actual: 'score', expected: 'expectedRange' } },
        }),
        evaluator({
          id: 'temporal-1',
          evaluator: 'temporal_range',
          config: { min: '2026-05-01', max: '2026-05-31' },
          objective: { metric: 'in_temporal_range', target: true },
          target_mappings: { [target2.id]: { actual: 'dueDate', expected: 'expectedWindow' } },
        }),
      ],
    };
    const run = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });
    const report = buildEvaluationResultsAnalyzer(suite, run, { maxCategories: 1 });
    expect(report.categories).toHaveLength(1);
    expect(report.remainingCategoriesCount).toBeGreaterThan(0);
  });

  it('previews experiment plan combinations, estimated compute, and truncation warning', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-experiment-plan',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    const plan = buildEvaluationExperimentPlan(suite, {
      dimensions: [
        { id: 'dim-model', kind: 'target_model', label: 'Target model', targetId: target2.id, values: ['gpt-4.1-mini', 'claude-haiku-4-5', 'gpt-4.1'] },
        { id: 'dim-iter', kind: 'iterations', label: 'Iterations', values: [1, 2] },
      ],
      maxRuns: 4,
    });
    expect(plan.totalCombinations).toBe(6);
    expect(plan.executedCombinations).toBe(4);
    expect(plan.truncated).toBe(true);
    expect(plan.estimatedComputeSeconds).toBeGreaterThan(0);
    expect(plan.warnings.some((warning) => warning.code === 'parallelization_rate_limit')).toBe(true);
    expect(plan.combinations).toHaveLength(4);
    expect(plan.combinations[0].parameters).toHaveLength(2);
  });

  it('flags experiments with missing dimensions or empty values', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-experiment-invalid',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases.slice(0, 1),
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match', target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } } })],
    };
    const emptyPlan = buildEvaluationExperimentPlan(suite, { dimensions: [] });
    expect(emptyPlan.totalCombinations).toBe(0);
    expect(emptyPlan.warnings.some((warning) => warning.message.includes('At least one experiment dimension'))).toBe(true);

    const missingValues = buildEvaluationExperimentPlan(suite, {
      dimensions: [{ id: 'dim', kind: 'iterations', label: 'Iterations', values: [] }],
    });
    expect(missingValues.totalCombinations).toBe(0);
    expect(missingValues.warnings.some((warning) => warning.message.includes('at least one value'))).toBe(true);
  });

  it('runs a grid experiment and groups results by dimension with best/worst combination ids', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-experiment-run',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    const experiment = runEvaluationExperiment(suite, {
      dimensions: [
        { id: 'dim-version', kind: 'target_version', label: 'Target version', targetId: target2.id, values: ['published', 'last_saved'] },
        { id: 'dim-model', kind: 'target_model', label: 'Target model', targetId: target2.id, values: ['gpt-4.1-mini', 'claude-haiku-4-5'] },
      ],
      maxRuns: 4,
    });
    expect(experiment.runs).toHaveLength(4);
    expect(experiment.totalIterationCount).toBeGreaterThan(0);
    // last_saved should produce a perfect pass run (the expected output matches), pushed to the front.
    const lastSavedRuns = experiment.runs.filter((entry) => entry.combination.parameters.some((parameter) => parameter.kind === 'target_version' && parameter.value === 'last_saved'));
    expect(lastSavedRuns.every((entry) => entry.run.passRate >= experiment.runs.find((other) => other.combination.parameters.some((parameter) => parameter.kind === 'target_version' && parameter.value === 'published'))!.run.passRate)).toBe(true);

    const versionGroup = experiment.groupsByDimension.find((row) => row.dimensionId === 'dim-version');
    expect(versionGroup).toBeDefined();
    expect(versionGroup!.groups).toHaveLength(2);
    expect(versionGroup!.groups[0].averagePassRate).toBeGreaterThanOrEqual(versionGroup!.groups[1].averagePassRate);
    expect(experiment.bestCombinationId).toBeDefined();
    expect(experiment.worstCombinationId).toBeDefined();
    // The first run should set experiment combination metadata on the underlying run.
    expect(experiment.runs[0].run.config.metadata.customMetadata?.['experimentCombinationId']).toBe(experiment.runs[0].combination.id);
  });

  it('tracks prompt suggestion applications and compares follow-up runs for improvement evidence', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-prompt-suggestion',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    // Base run uses published version → case-2 fails exact match.
    const baseRun = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });
    // Follow-up run uses last_saved → case-2 passes.
    const followUpRun = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'last_saved' },
    });

    // Analyzer should produce an exact_mismatch category for case-2.
    const report = buildEvaluationResultsAnalyzer(suite, baseRun);
    const exactCategory = report.categories.find((category) => category.kind === 'exact_mismatch')!;
    expect(exactCategory).toBeDefined();

    const application = trackPromptSuggestionApplication(
      { id: baseRun.id, evaluationSuiteId: suite.id },
      exactCategory.id,
      exactCategory,
      {
        appliedBy: { id: 'user-1', name: 'On-call' },
        appliedTo: { functionRid: target2.id },
        notes: 'Pinned expected wording in prompt.',
      },
    );
    expect(application.suggestionId).toBe(exactCategory.id);
    expect(application.categoryKind).toBe('exact_mismatch');
    expect(application.source.runId).toBe(baseRun.id);
    expect(application.appliedBy?.id).toBe('user-1');

    const evidenceWithoutFollowUp = evaluatePromptSuggestionEvidence(application, baseRun, exactCategory);
    expect(evidenceWithoutFollowUp.baseRunSummary.affectedFailureCount).toBeGreaterThan(0);
    expect(evidenceWithoutFollowUp.followUpRunSummary).toBeUndefined();

    const evidence = evaluatePromptSuggestionEvidence(application, baseRun, exactCategory, followUpRun);
    expect(evidence.followUpRunSummary?.affectedFailureCount).toBe(0);
    expect(evidence.improvement?.passRateDelta).toBeGreaterThan(0);
    expect(evidence.improvement?.affectedFailureDelta).toBeLessThan(0);
    expect(evidence.improvement?.resolved).toBe(true);
  });

  it('blocks rollout when required suites are missing runs or fall below the pass-rate gate', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suiteA = {
      id: 'suite-gate-a',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    const baseRun = runEvaluationSuiteBuiltIns(suiteA, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });
    const evaluatedAt = new Date(Date.parse(baseRun.completedAtIso) + 60 * 60 * 1000).toISOString();
    const gateInput = [
      { id: suiteA.id, targetFunctions: suiteA.targetFunctions, testCases: suiteA.testCases, runs: [baseRun] },
      { id: 'suite-missing', targetFunctions: [target2], testCases: [], runs: [] },
    ];
    const result = evaluateLogicPublishGate(gateInput, {
      suiteIds: [suiteA.id, 'suite-missing'],
      minPassRate: 0.95,
      maxRunAgeHours: 24,
      criticalMetricNames: ['matches'],
    }, { surface: 'logic_publish', evaluatedAtIso: evaluatedAt });

    expect(result.ready).toBe(false);
    expect(result.rolloutBlocked).toBe(true);
    const fields = result.findings.map((finding) => finding.ruleField);
    expect(fields.some((field) => field.startsWith('no_run::suite-missing'))).toBe(true);
    expect(fields.some((field) => field.startsWith('low_pass_rate::suite-gate-a'))).toBe(true);
    expect(fields.some((field) => field.startsWith('critical_metric_failed::suite-gate-a'))).toBe(true);
    expect(result.runSummaries.find((row) => row.suiteId === suiteA.id)?.passRate).toBeLessThan(0.95);
  });

  it('warns about stale runs without blocking and clears findings when waivers cover criticals', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suiteA = {
      id: 'suite-gate-stale',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    const baseRun = runEvaluationSuiteBuiltIns(suiteA, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });
    const evaluatedAt = new Date(Date.parse(baseRun.completedAtIso) + 72 * 60 * 60 * 1000).toISOString();
    const gateInput = [{ id: suiteA.id, targetFunctions: suiteA.targetFunctions, testCases: suiteA.testCases, runs: [baseRun] }];
    const requirement = {
      suiteIds: [suiteA.id],
      minPassRate: 0.95,
      maxRunAgeHours: 24,
      criticalMetricNames: ['matches'],
    };
    const beforeWaiver = evaluateLogicPublishGate(gateInput, requirement, { surface: 'automation_enable', evaluatedAtIso: evaluatedAt });
    expect(beforeWaiver.findings.some((finding) => finding.severity === 'warning' && finding.ruleField.startsWith('stale_run'))).toBe(true);
    expect(beforeWaiver.rolloutBlocked).toBe(true);

    const lowPassRateWaiver = recordLogicPublishGateWaiver({
      ruleField: `low_pass_rate::${suiteA.id}`,
      reviewerId: 'reviewer-1',
      reviewerName: 'On-call lead',
      reason: 'Manual sign-off; recovery case verified out-of-band.',
    });
    const criticalWaiver = recordLogicPublishGateWaiver({
      ruleField: `critical_metric_failed::${suiteA.id}::matches`,
      reviewerId: 'reviewer-1',
      reason: 'Manual sign-off',
    });
    const afterWaivers = evaluateLogicPublishGate(gateInput, requirement, { surface: 'automation_enable', evaluatedAtIso: evaluatedAt }, [lowPassRateWaiver, criticalWaiver]);
    expect(afterWaivers.rolloutBlocked).toBe(false);
    expect(afterWaivers.ready).toBe(false);
    expect(afterWaivers.bypassedFindingCount).toBeGreaterThan(0);
    expect(afterWaivers.findings.some((finding) => finding.waived && finding.ruleField.startsWith('low_pass_rate'))).toBe(true);
  });

  it('reports gate ready when a suite meets the pass-rate, freshness, and critical-metric requirements', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suiteA = {
      id: 'suite-gate-ready',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    const baseRun = runEvaluationSuiteBuiltIns(suiteA, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'last_saved' },
    });
    const evaluatedAt = new Date(Date.parse(baseRun.completedAtIso) + 60 * 60 * 1000).toISOString();
    const gateInput = [{ id: suiteA.id, targetFunctions: suiteA.targetFunctions, testCases: suiteA.testCases, runs: [baseRun] }];
    const result = evaluateLogicPublishGate(gateInput, {
      suiteIds: [suiteA.id],
      minPassRate: 0.9,
      maxRunAgeHours: 24,
      criticalMetricNames: ['matches'],
    }, { surface: 'action_rollout', evaluatedAtIso: evaluatedAt });
    expect(result.ready).toBe(true);
    expect(result.rolloutBlocked).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it('creates schedule configs, computes the next run at, and detects pass-rate, variance, cost, and new-failure regressions', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-schedule',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [
        evaluator({
          id: 'exact-1',
          evaluator: 'exact_match',
          target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
        }),
      ],
    };
    // Baseline: last_saved → both cases pass exact match.
    const baseline = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'last_saved' },
    });
    // Head: published → case-2 fails exact match, dropping pass rate.
    const head = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'published' },
    });

    const schedule = createEvalScheduleConfig({
      suiteId: suite.id,
      cadence: 'daily',
      startsAtIso: '2026-05-14T06:00:00.000Z',
      notificationChannels: [
        { kind: 'data_health', healthCheckId: 'health-evals-customer-ops' },
        { kind: 'automate', automationId: 'automation-rollback-customer-ops' },
      ],
      remediationFlow: { automationId: 'automation-rollback-customer-ops', rollbackOnRegression: true },
      regressionThresholds: { passRateDropThreshold: 0.1, costSpikeThresholdPct: 0.001, varianceSpikeThreshold: 0.1 },
    });
    expect(schedule.id).toContain('eval-schedule-');
    expect(schedule.cadence).toBe('daily');
    expect(schedule.regressionThresholds.passRateDropThreshold).toBe(0.1);

    expect(nextEvalScheduleRunAt(schedule, '2026-05-14T05:00:00.000Z')).toBe('2026-05-14T06:00:00.000Z');
    expect(nextEvalScheduleRunAt(schedule, '2026-05-14T07:00:00.000Z')).toBe('2026-05-15T06:00:00.000Z');

    const baselineReport = buildEvaluationResultsAnalyzer(suite, baseline);
    const headReport = buildEvaluationResultsAnalyzer(suite, head);
    const outcome = monitorEvaluationScheduleRun({
      schedule,
      runAtIso: '2026-05-14T06:00:00.000Z',
      baseline,
      head,
      baselineReport,
      headReport,
    });
    const kinds = outcome.alerts.map((alert) => alert.kind);
    expect(kinds).toContain('pass_rate_regression');
    expect(kinds).toContain('new_failure_category');
    expect(outcome.notifications).toHaveLength(2);
    expect(outcome.notifications.every((notification) => notification.status === 'queued')).toBe(true);
    expect(outcome.remediation?.status).toBe('triggered');
    expect(outcome.headCostSeconds).toBeGreaterThanOrEqual(0);
  });

  it('emits a scheduled_run_missing alert when no head run is provided', () => {
    const schedule = createEvalScheduleConfig({
      suiteId: 'suite-missing-head',
      cadence: 'hourly',
      startsAtIso: '2026-05-14T06:00:00.000Z',
      notificationChannels: [{ kind: 'slack', channel: '#evals-alerts' }],
    });
    const outcome = monitorEvaluationScheduleRun({ schedule, runAtIso: '2026-05-14T06:00:00.000Z' });
    expect(outcome.alerts).toHaveLength(1);
    expect(outcome.alerts[0].kind).toBe('scheduled_run_missing');
    expect(outcome.alerts[0].severity).toBe('critical');
    expect(outcome.notifications[0].status).toBe('queued');
  });

  it('warns about missing baselines and skips notifications when no alerts are raised', () => {
    const target2: EvaluationTargetFunction = { ...target, id: 'logic.customer-triage' };
    const suite = {
      id: 'suite-no-baseline',
      projectId: 'project-customer-ops',
      targetFunctions: [target2],
      testCases: cases,
      evaluators: [evaluator({
        id: 'exact-1',
        evaluator: 'exact_match',
        target_mappings: { [target2.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' } },
      })],
    };
    const head = runEvaluationSuiteBuiltIns(suite, {
      executionMode: 'project_scoped',
      targetVersions: { [target2.id]: 'last_saved' },
    });
    const schedule = createEvalScheduleConfig({
      suiteId: suite.id,
      cadence: 'weekly',
      notificationChannels: [{ kind: 'slack', channel: '#evals-alerts' }],
    });
    const outcome = monitorEvaluationScheduleRun({ schedule, head });
    expect(outcome.alerts.some((alert) => alert.kind === 'baseline_missing')).toBe(true);
    // A baseline_missing alert is a warning, so notifications should still queue.
    expect(outcome.notifications[0].status).toBe('queued');
    // No critical alerts → remediation flow should not trigger when present.
    const scheduleWithRemediation = createEvalScheduleConfig({
      suiteId: suite.id,
      cadence: 'weekly',
      notificationChannels: [],
      remediationFlow: { automationId: 'automation-rollback', rollbackOnRegression: true },
    });
    const calmOutcome = monitorEvaluationScheduleRun({ schedule: scheduleWithRemediation, head });
    expect(calmOutcome.remediation?.status).toBe('planned');
  });

  it('honors a custom dataset rid + max rows override and clamps to the configured limit', () => {
    const suite = {
      id: 'suite-custom-rid',
      projectId: 'project-customer-ops',
      targetFunctions: [target],
      testCases: cases,
      evaluators: [evaluator({ id: 'exact-1', evaluator: 'exact_match' })],
    };
    const customRid = 'ri.foundry.dataset.custom-eval-results';
    const write = buildEvaluationResultsDatasetWrite(
      suite,
      {
        id: 'eval-run-static',
        config: {
          source: 'aip_evals_app',
          iterations: 1,
          parallelization: 1,
          executionMode: 'project_scoped',
          targetVersions: { [target.id]: 'published' },
          targetModels: {},
          targetIds: [target.id],
          testCaseIds: cases.map((testCase) => testCase.id),
          inputMappings: {},
          metadata: { customLabels: [], customMetadata: {} },
        },
        startedAtIso: '2026-05-14T00:00:00.000Z',
        completedAtIso: '2026-05-14T00:00:01.000Z',
        resultDatasetRows: cases.map((testCase, index) => ({
          id: `${target.id}:${testCase.id}:1`,
          testCaseId: testCase.id,
          targetId: target.id,
          iteration: 1,
          status: index === 0 ? 'passed' : 'failed',
          inputs: {},
          outputs: {},
          intermediateParameters: {},
          metrics: [],
          debugOutputs: [],
        })),
        errors: [],
      },
      { datasetRid: customRid, maxRows: 1 },
    );
    expect(write.config.datasetRid).toBe(customRid);
    expect(write.config.maxRows).toBe(1);
    expect(write.rows).toHaveLength(1);
  });
});
