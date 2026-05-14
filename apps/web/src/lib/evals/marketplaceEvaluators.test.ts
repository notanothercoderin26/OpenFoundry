import { describe, expect, it } from 'vitest';

import type { EvaluationTargetFunction, EvaluationTestCase } from '@/lib/api/evals';
import { customEvaluatorDebugDefinitions, customEvaluatorMetricDefinitions, runEvaluationSuiteBuiltIns, validateCustomEvaluationFunction } from '@/lib/evals/builtins';
import {
  buildMarketplaceEvaluationFunction,
  installMarketplaceEvaluatorSlug,
  listMarketplaceEvaluatorProducts,
  marketplaceEvaluatorProductBySlug,
  marketplaceEvaluatorSetupPlan,
} from '@/lib/evals/marketplaceEvaluators';

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

const testCases: EvaluationTestCase[] = [
  {
    id: 'case-1',
    name: 'Escalation',
    values: {
      complaintText: 'Shipment missed SLA',
      finalAnswer: 'Escalate with service recovery follow-up.',
      expectedAnswer: 'Escalate with service recovery follow-up.',
    },
  },
];

describe('marketplace evaluator handoff helpers', () => {
  it('distinguishes installed evaluator packages from setup-required packages', () => {
    const products = listMarketplaceEvaluatorProducts(['rubric-grader']);

    expect(products.find((product) => product.slug === 'rubric-grader')?.installed).toBe(true);
    expect(products.find((product) => product.slug === 'contains-key-details')?.installed).toBe(false);

    const nextInstalled = installMarketplaceEvaluatorSlug(['rubric-grader'], 'contains-key-details');
    expect(nextInstalled).toEqual(['rubric-grader', 'contains-key-details']);
  });

  it('builds installed Marketplace products as runnable published evaluator functions', () => {
    const product = marketplaceEvaluatorProductBySlug('rubric-grader');
    expect(product).toBeDefined();
    const evaluator = buildMarketplaceEvaluationFunction(product!, {
      [target.id]: { actual: 'finalAnswer', expected: 'expectedAnswer' },
    });

    expect(evaluator).toMatchObject({
      kind: 'marketplace_function',
      function_rid: 'logic.marketplace.rubric-grader',
      function_kind: 'logic',
      version: 'published',
      marketplace_install_status: 'installed',
    });
    expect(validateCustomEvaluationFunction(evaluator)).toEqual([]);
    expect(customEvaluatorMetricDefinitions(evaluator).map((definition) => definition.name)).toEqual(['rubric.passed', 'rubric.score']);
    expect(customEvaluatorDebugDefinitions(evaluator).map((definition) => definition.name)).toEqual(['rubric.rationale']);

    const run = runEvaluationSuiteBuiltIns({
      id: 'suite-marketplace',
      targetFunctions: [target],
      testCases,
      evaluators: [evaluator],
    });

    expect(run.status).toBe('completed');
    expect(run.metricResults.map((metric) => metric.metricName).sort()).toEqual(['rubric.passed', 'rubric.score']);
    expect(run.customEvaluatorDebugOutputs.map((debugOutput) => debugOutput.name)).toContain('rubric.rationale');
  });

  it('returns setup and dependency plans for missing evaluator packages', () => {
    const product = marketplaceEvaluatorProductBySlug('rouge-score');
    expect(product).toBeDefined();
    const plan = marketplaceEvaluatorSetupPlan(product!);

    expect(plan.setupHref).toContain('/marketplace/');
    expect(plan.dependencies.map((dependency) => dependency.package_slug)).toEqual(['python-text-eval-runtime', 'rouge-metrics-wheel']);
    expect(plan.steps.some((step) => step.includes(product!.functionRid))).toBe(true);
  });
});
