import type { EvaluationEvaluator, EvaluationSignatureParameter } from '@/lib/api/evals';
import type { DependencyRequirement } from '@/lib/api/marketplace';

export type MarketplaceEvaluatorSlug = 'rubric-grader' | 'contains-key-details' | 'rouge-score';
export type MarketplaceEvaluatorFunctionKind = 'typescript' | 'python' | 'logic';

export interface MarketplaceEvaluatorProduct {
  slug: MarketplaceEvaluatorSlug;
  listingId: string;
  name: string;
  summary: string;
  functionRid: string;
  functionKind: MarketplaceEvaluatorFunctionKind;
  version: string;
  capabilities: string[];
  dependencies: DependencyRequirement[];
  returnSignature: { outputs: EvaluationSignatureParameter[] };
  metricObjectives: Record<string, Record<string, unknown>>;
  defaultConfig?: Record<string, unknown>;
}

export interface MarketplaceEvaluatorCatalogEntry extends MarketplaceEvaluatorProduct {
  installed: boolean;
  setupHref: string;
}

export interface MarketplaceEvaluatorSetupPlan {
  product: MarketplaceEvaluatorProduct;
  setupHref: string;
  steps: string[];
  dependencies: DependencyRequirement[];
}

export const DEFAULT_INSTALLED_MARKETPLACE_EVALUATOR_SLUGS: MarketplaceEvaluatorSlug[] = ['rubric-grader'];

export const MARKETPLACE_EVALUATOR_PRODUCTS: MarketplaceEvaluatorProduct[] = [
  {
    slug: 'rubric-grader',
    listingId: '0196f31e-0000-7000-8000-000000310001',
    name: 'Rubric grader',
    summary: 'LLM-backed evaluator that grades generated text against a dynamic rubric.',
    functionRid: 'logic.marketplace.rubric-grader',
    functionKind: 'logic',
    version: 'published',
    capabilities: ['llm-as-judge', 'numeric-score', 'debug-rationale'],
    dependencies: [
      { package_slug: 'openfoundry-llm-judge-runtime', version_req: '^1.2', required: true },
      { package_slug: 'eval-debug-viewer', version_req: '^1.0', required: true },
    ],
    returnSignature: {
      outputs: [
        {
          apiName: 'rubric',
          type: 'struct',
          fields: [
            { apiName: 'passed', type: 'boolean' },
            { apiName: 'score', type: 'double' },
            { apiName: 'rationale', type: 'string' },
          ],
        },
      ],
    },
    metricObjectives: {
      'rubric.passed': { target: true },
      'rubric.score': { direction: 'maximize', threshold: 0.8 },
    },
    defaultConfig: {
      rubric: 'Answer must be correct, grounded, complete, and concise.',
      model: 'default-eval-judge',
    },
  },
  {
    slug: 'contains-key-details',
    listingId: '0196f31e-0000-7000-8000-000000310002',
    name: 'Contains key details',
    summary: 'LLM-backed evaluator that checks whether all required details are present.',
    functionRid: 'logic.marketplace.contains-key-details',
    functionKind: 'logic',
    version: 'published',
    capabilities: ['llm-as-judge', 'boolean-pass', 'coverage-score'],
    dependencies: [
      { package_slug: 'openfoundry-llm-judge-runtime', version_req: '^1.2', required: true },
      { package_slug: 'key-detail-template-pack', version_req: '^1.0', required: false },
    ],
    returnSignature: {
      outputs: [
        {
          apiName: 'details',
          type: 'struct',
          fields: [
            { apiName: 'containsAll', type: 'boolean' },
            { apiName: 'coverage', type: 'double' },
            { apiName: 'missingDetails', type: 'string' },
          ],
        },
      ],
    },
    metricObjectives: {
      'details.containsAll': { target: true },
      'details.coverage': { direction: 'maximize', threshold: 1 },
    },
    defaultConfig: {
      requiredDetails: ['escalation decision', 'next action', 'customer-facing rationale'],
    },
  },
  {
    slug: 'rouge-score',
    listingId: '0196f31e-0000-7000-8000-000000310003',
    name: 'ROUGE score',
    summary: 'Python evaluator for ROUGE-style similarity metrics on summaries and generated text.',
    functionRid: 'fn.marketplace.rouge_score.py',
    functionKind: 'python',
    version: 'published',
    capabilities: ['rouge-1', 'rouge-l', 'summarization'],
    dependencies: [
      { package_slug: 'python-text-eval-runtime', version_req: '^2.0', required: true },
      { package_slug: 'rouge-metrics-wheel', version_req: '~0.1', required: true },
    ],
    returnSignature: {
      outputs: [
        {
          apiName: 'rouge',
          type: 'struct',
          fields: [
            { apiName: 'rouge1', type: 'double' },
            { apiName: 'rougeL', type: 'double' },
            { apiName: 'debugSummary', type: 'string' },
          ],
        },
      ],
    },
    metricObjectives: {
      'rouge.rouge1': { direction: 'maximize', threshold: 0.4 },
      'rouge.rougeL': { direction: 'maximize', threshold: 0.35 },
    },
    defaultConfig: {
      tokenizer: 'standard',
      stemming: true,
    },
  },
];

export function marketplaceEvaluatorProductBySlug(slug: string | undefined) {
  return MARKETPLACE_EVALUATOR_PRODUCTS.find((product) => product.slug === slug);
}

export function marketplaceEvaluatorSetupHref(product: MarketplaceEvaluatorProduct) {
  return `/marketplace/${encodeURIComponent(product.listingId)}?install=evaluator`;
}

export function listMarketplaceEvaluatorProducts(installedSlugs: Iterable<string> = DEFAULT_INSTALLED_MARKETPLACE_EVALUATOR_SLUGS): MarketplaceEvaluatorCatalogEntry[] {
  const installed = new Set(installedSlugs);
  return MARKETPLACE_EVALUATOR_PRODUCTS.map((product) => ({
    ...product,
    installed: installed.has(product.slug),
    setupHref: marketplaceEvaluatorSetupHref(product),
  }));
}

export function marketplaceEvaluatorSetupPlan(product: MarketplaceEvaluatorProduct): MarketplaceEvaluatorSetupPlan {
  return {
    product,
    setupHref: marketplaceEvaluatorSetupHref(product),
    dependencies: product.dependencies,
    steps: [
      `Install ${product.name} from Marketplace.`,
      'Resolve required evaluator runtime dependencies.',
      `Activate published function ${product.functionRid}.`,
      'Return to the evaluation suite and map actual/expected values.',
    ],
  };
}

export function buildMarketplaceEvaluationFunction(
  product: MarketplaceEvaluatorProduct,
  targetMappings: Record<string, Record<string, string>>,
): EvaluationEvaluator {
  const firstTargetId = Object.keys(targetMappings)[0];
  return {
    id: `marketplace-${product.slug}-${Math.random().toString(36).slice(2, 10)}`,
    kind: 'marketplace_function',
    evaluator: product.functionRid,
    function_rid: product.functionRid,
    function_kind: product.functionKind,
    version: product.version,
    marketplace_product_slug: product.slug,
    marketplace_listing_id: product.listingId,
    marketplace_install_status: 'installed',
    marketplace_dependency_plan: product.dependencies.map((dependency) => ({ ...dependency })),
    target_id: firstTargetId,
    mappings: firstTargetId ? targetMappings[firstTargetId] : undefined,
    target_mappings: targetMappings,
    return_signature: {
      outputs: product.returnSignature.outputs.map((output) => ({ ...output })),
    },
    metric_objectives: { ...product.metricObjectives },
    config: product.defaultConfig ? { ...product.defaultConfig } : {},
  };
}

export function installMarketplaceEvaluatorSlug(current: Iterable<string>, slug: MarketplaceEvaluatorSlug) {
  return Array.from(new Set([...current, slug]));
}
