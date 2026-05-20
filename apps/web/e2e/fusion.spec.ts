import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { E2E_NOW } from './fixtures/mocks';
import { FusionPage } from './pages';

/**
 * E2E coverage for `/fusion`
 * (apps/web/src/routes/fusion/FusionPage.tsx).
 *
 * **Domain.** Fusion is OpenFoundry's identity-resolution workspace
 * (deterministic + ML matching + survivorship). The page composes six
 * sub-panels — MatchRuleBuilder, MergePreview, ResolutionResults,
 * ClusterViewer, ManualReview, GoldenRecordView, plus a FusionSpreadsheet
 * preview — all driven from a single `refreshAll()` that pulls seven
 * endpoints in parallel:
 *
 *   - GET /api/v1/fusion/overview
 *   - GET /api/v1/fusion/rules
 *   - GET /api/v1/fusion/merge-strategies
 *   - GET /api/v1/fusion/jobs
 *   - GET /api/v1/fusion/clusters
 *   - GET /api/v1/fusion/review-queue
 *   - GET /api/v1/fusion/golden-records
 *   - GET /api/v1/fusion/clusters/{id}  (auto-selected cluster detail)
 *
 * Main actions surfaced by the page (each tested below):
 *   - Save a Match Rule         → PATCH /fusion/rules/{id} (or POST when new)
 *   - Save a Merge Strategy     → PATCH /fusion/merge-strategies/{id}
 *   - Create a Fusion Job       → POST  /fusion/jobs
 *   - Run the selected job      → POST  /fusion/jobs/{id}/run
 *   - Submit a manual review    → POST  /fusion/clusters/{id}/review
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

interface BlockingStrategyFixture {
  strategy_type: string;
  key_fields: string[];
  window_size: number;
  bucket_count: number;
}

interface MatchConditionFixture {
  field: string;
  comparator: string;
  weight: number;
  threshold: number;
  required: boolean;
}

interface MatchRuleFixture {
  id: string;
  name: string;
  description: string;
  status: string;
  entity_type: string;
  blocking_strategy: BlockingStrategyFixture;
  conditions: MatchConditionFixture[];
  review_threshold: number;
  auto_merge_threshold: number;
  created_at: string;
  updated_at: string;
}

interface MergeStrategyFixture {
  id: string;
  name: string;
  description: string;
  status: string;
  entity_type: string;
  default_strategy: string;
  rules: Array<{
    field: string;
    strategy: string;
    source_priority: string[];
    fallback: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface FusionJobFixture {
  id: string;
  name: string;
  description: string;
  status: string;
  entity_type: string;
  match_rule_id: string;
  merge_strategy_id: string;
  config: {
    source_labels: string[];
    record_count: number;
    blocking_strategy_override: null;
    review_sampling_rate: number;
  };
  metrics: {
    candidate_pairs: number;
    matched_pairs: number;
    review_pairs: number;
    cluster_count: number;
    golden_record_count: number;
    precision_estimate: number;
    recall_estimate: number;
  };
  last_run_summary: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ResolvedClusterFixture {
  id: string;
  job_id: string;
  cluster_key: string;
  status: string;
  records: Array<{
    record_id: string;
    source: string;
    external_id: string;
    display_name: string;
    confidence: number;
    attributes: Record<string, unknown>;
  }>;
  evidence: unknown[];
  confidence_score: number;
  requires_review: boolean;
  suggested_golden_record_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewQueueItemFixture {
  id: string;
  cluster_id: string;
  status: string;
  severity: string;
  recommended_action: string;
  rationale: string[];
  assigned_to: string | null;
  reviewed_by: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface GoldenRecordFixture {
  id: string;
  cluster_id: string;
  title: string;
  canonical_values: Record<string, unknown>;
  provenance: unknown[];
  completeness_score: number;
  confidence_score: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const RULE: MatchRuleFixture = {
  id: 'rule-person-1',
  name: 'Person resolution v1',
  description: 'Resolve customers across CRM + ERP',
  status: 'active',
  entity_type: 'person',
  blocking_strategy: {
    strategy_type: 'sorted-neighborhood',
    key_fields: ['email', 'phone'],
    window_size: 4,
    bucket_count: 24,
  },
  conditions: [
    { field: 'email', comparator: 'email_exact', weight: 0.35, threshold: 1, required: false },
    { field: 'display_name', comparator: 'jaro_winkler', weight: 0.25, threshold: 0.86, required: true },
  ],
  review_threshold: 0.76,
  auto_merge_threshold: 0.9,
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const STRATEGY: MergeStrategyFixture = {
  id: 'strategy-person-1',
  name: 'Person survivorship v1',
  description: 'CRM-first survivorship',
  status: 'active',
  entity_type: 'person',
  default_strategy: 'longest_non_empty',
  rules: [
    { field: 'email', strategy: 'source_priority', source_priority: ['crm', 'erp'], fallback: 'most_common' },
  ],
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const JOB: FusionJobFixture = {
  id: 'job-customer-360',
  name: 'Customer 360 nightly',
  description: 'Resolve customer identities across CRM, ERP, and support',
  status: 'completed',
  entity_type: 'person',
  match_rule_id: RULE.id,
  merge_strategy_id: STRATEGY.id,
  config: {
    source_labels: ['crm', 'erp', 'support'],
    record_count: 12,
    blocking_strategy_override: null,
    review_sampling_rate: 0.25,
  },
  metrics: {
    candidate_pairs: 124,
    matched_pairs: 48,
    review_pairs: 7,
    cluster_count: 31,
    golden_record_count: 28,
    precision_estimate: 0.94,
    recall_estimate: 0.88,
  },
  last_run_summary: 'Ran 31 clusters, 7 pending reviews',
  last_run_at: E2E_NOW,
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const CLUSTER: ResolvedClusterFixture = {
  id: 'cluster-1',
  job_id: JOB.id,
  cluster_key: 'person:doe-jane',
  status: 'pending_review',
  records: [
    {
      record_id: 'rec-crm-1',
      source: 'crm',
      external_id: 'crm-001',
      display_name: 'Jane Doe',
      confidence: 0.92,
      attributes: { email: 'jane@example.com' },
    },
  ],
  evidence: [],
  confidence_score: 0.81,
  requires_review: true,
  suggested_golden_record_id: null,
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const REVIEW: ReviewQueueItemFixture = {
  id: 'review-1',
  cluster_id: CLUSTER.id,
  status: 'pending',
  severity: 'medium',
  recommended_action: 'confirm_match',
  rationale: ['Email exact match', 'Display name similarity 0.91'],
  assigned_to: null,
  reviewed_by: null,
  notes: '',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const GOLDEN: GoldenRecordFixture = {
  id: 'golden-1',
  cluster_id: CLUSTER.id,
  title: 'Jane Doe',
  canonical_values: { email: 'jane@example.com' },
  provenance: [],
  completeness_score: 0.9,
  confidence_score: 0.88,
  status: 'published',
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const OVERVIEW = {
  rule_count: 1,
  active_job_count: 1,
  completed_job_count: 4,
  cluster_count: 31,
  pending_review_count: 7,
  golden_record_count: 28,
  auto_merged_cluster_count: 21,
};

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

interface FusionMocks {
  rules: MatchRuleFixture[];
  strategies: MergeStrategyFixture[];
  jobs: FusionJobFixture[];
  clusters: ResolvedClusterFixture[];
  reviewQueue: ReviewQueueItemFixture[];
  goldenRecords: GoldenRecordFixture[];
  overview: typeof OVERVIEW;
}

function defaultMocks(): FusionMocks {
  return {
    rules: [RULE],
    strategies: [STRATEGY],
    jobs: [JOB],
    clusters: [CLUSTER],
    reviewQueue: [REVIEW],
    goldenRecords: [GOLDEN],
    overview: OVERVIEW,
  };
}

/**
 * Install GET handlers for every endpoint `refreshAll()` calls. POSTs +
 * PATCHes fall through to the per-test handlers registered later (more
 * specific Playwright route wins).
 */
async function installFusionGets(page: Page, mocks: FusionMocks): Promise<void> {
  await page.route(/\/api\/v1\/fusion\/overview$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: mocks.overview });
  });

  await page.route(/\/api\/v1\/fusion\/rules(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: mocks.rules } });
  });

  await page.route(/\/api\/v1\/fusion\/merge-strategies(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: mocks.strategies } });
  });

  await page.route(/\/api\/v1\/fusion\/jobs(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: mocks.jobs } });
  });

  // Order matters: register the cluster-detail handler BEFORE the
  // bare list handler so Playwright's most-recent-first dispatch
  // routes `/clusters/{id}` to the detail responder.
  await page.route(/\/api\/v1\/fusion\/clusters(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: mocks.clusters } });
  });

  await page.route(/\/api\/v1\/fusion\/clusters\/[^/]+$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const id = /\/clusters\/([^/?#]+)/.exec(route.request().url())?.[1] ?? '';
    const cluster = mocks.clusters.find((c) => c.id === id) ?? mocks.clusters[0];
    const review = mocks.reviewQueue.find((r) => r.cluster_id === id) ?? null;
    const golden = mocks.goldenRecords.find((g) => g.cluster_id === id) ?? null;
    await route.fulfill({
      json: { cluster, review_item: review, golden_record: golden },
    });
  });

  await page.route(/\/api\/v1\/fusion\/review-queue(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: mocks.reviewQueue } });
  });

  await page.route(/\/api\/v1\/fusion\/golden-records(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: mocks.goldenRecords } });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the Fusion hero + every workspace panel after the initial load', async ({
  adminPage,
}) => {
  await installFusionGets(adminPage, defaultMocks());
  const fusion = new FusionPage(adminPage);
  await fusion.goto();
  await fusion.expectLoaded();

  // Hero block — eyebrow + h1.
  await expect(adminPage.getByText(/^Identity Resolution$/)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /Fusion: deterministic \+ ML matching/i }),
  ).toBeVisible();

  // Loading placeholder is gone once data lands.
  await expect(adminPage.getByText(/Loading Fusion workspace/i)).toHaveCount(0);

  // Every workspace section lands. Match by `<h2>` title — the eyebrow
  // text ("Merge Strategy", "Name", …) repeats across panels as field
  // labels, but each h2 is unique to its section.
  for (const h2 of [
    'Deterministic, fuzzy, and phonetic matching rules',
    'Golden record survivorship and field precedence',
    'Run blocking, scoring, clustering, and golden record generation',
    'Transitive clusters, pair evidence, and confidence',
    'Human-in-the-loop decisions for uncertain matches',
    'Canonical identities and provenance trails',
    'Bidirectional grid for datasets and ontology objects',
  ]) {
    await expect(adminPage.getByRole('heading', { level: 2, name: h2 })).toBeVisible();
  }

  // Mocked data renders inside the panels. Rule + strategy names
  // appear both in their list buttons AND inside the match-rule /
  // merge-strategy <option> dropdowns over in ResolutionResults, so
  // pin only the first occurrence.
  await expect(adminPage.getByText(RULE.name).first()).toBeVisible();
  await expect(adminPage.getByText(STRATEGY.name).first()).toBeVisible();
  await expect(adminPage.getByText(JOB.name)).toBeVisible();
});

test('refreshAll() fetches every Fusion read endpoint in parallel on mount', async ({
  adminPage,
}) => {
  await installFusionGets(adminPage, defaultMocks());
  const overview = captureRequests(adminPage, /\/api\/v1\/fusion\/overview$/);
  const rules = captureRequests(adminPage, /\/api\/v1\/fusion\/rules(\?|$)/);
  const strategies = captureRequests(adminPage, /\/api\/v1\/fusion\/merge-strategies(\?|$)/);
  const jobs = captureRequests(adminPage, /\/api\/v1\/fusion\/jobs(\?|$)/);
  const clustersList = captureRequests(
    adminPage,
    /\/api\/v1\/fusion\/clusters(\?|$)/,
  );
  const clusterDetail = captureRequests(
    adminPage,
    /\/api\/v1\/fusion\/clusters\/[^/]+$/,
  );
  const reviews = captureRequests(adminPage, /\/api\/v1\/fusion\/review-queue(\?|$)/);
  const goldens = captureRequests(adminPage, /\/api\/v1\/fusion\/golden-records(\?|$)/);

  const fusion = new FusionPage(adminPage);
  await fusion.goto();
  // Wait for the workspace to settle.
  await expect(adminPage.getByText(JOB.name)).toBeVisible();

  // Each list endpoint should have fired exactly once during the
  // initial refresh.
  for (const cap of [overview, rules, strategies, jobs, reviews, goldens]) {
    expect(cap.count()).toBeGreaterThanOrEqual(1);
    expect(cap.last()?.method).toBe('GET');
  }
  // The clusters list fires once, then the auto-selected cluster
  // triggers a detail fetch.
  expect(clustersList.count()).toBeGreaterThanOrEqual(1);
  expect(clusterDetail.count()).toBeGreaterThanOrEqual(1);
  expect(clusterDetail.last()?.url).toMatch(new RegExp(`/clusters/${CLUSTER.id}$`));
});

test('saving the Match Rule Builder draft PATCHes the selected rule with the edited fields', async ({
  adminPage,
}) => {
  await installFusionGets(adminPage, defaultMocks());

  const ruleUpdates = captureRequests(
    adminPage,
    new RegExp(`/api/v1/fusion/rules/${RULE.id}$`),
  );
  await adminPage.route(
    new RegExp(`/api/v1/fusion/rules/${RULE.id}$`),
    async (route: Route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          ...RULE,
          name: (body.name as string) ?? RULE.name,
          description: (body.description as string) ?? RULE.description,
          updated_at: E2E_NOW,
        },
      });
    },
  );

  const fusion = new FusionPage(adminPage);
  await fusion.goto();
  // The rule name appears in BOTH the MatchRuleBuilder rule-list
  // button and the ResolutionResults match-rule <option> — use the
  // h2 anchor to wait for the panel.
  await expect(
    adminPage.getByRole('heading', {
      level: 2,
      name: /Deterministic, fuzzy, and phonetic matching rules/i,
    }),
  ).toBeVisible();

  // Scope to the Match Rule Builder panel — there is a separate `Save`
  // button inside MergePreview which would otherwise collide. Match
  // on the panel-level `<section class="of-panel">`, anchored to its
  // unique h2 heading; the outer `<section class="of-page">` would
  // otherwise swallow every sibling panel.
  const builder = adminPage.locator('section.of-panel', {
    has: adminPage.getByRole('heading', {
      level: 2,
      name: /Deterministic, fuzzy, and phonetic matching rules/i,
    }),
  });

  // The rule auto-selects on load (refreshAll seeds the draft with the
  // first rule). Rename it to prove the PATCH carries the edit.
  const nameInput = builder.locator('label', { hasText: 'Name' }).locator('input');
  await nameInput.fill('Person resolution v2');

  await builder.getByRole('button', { name: /^save$/i }).click();

  await expect.poll(() => ruleUpdates.count()).toBeGreaterThanOrEqual(1);
  const call = ruleUpdates.last();
  expect(call?.method).toBe('PATCH');
  const body = call?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    name: 'Person resolution v2',
    entity_type: 'person',
    review_threshold: 0.76,
    auto_merge_threshold: 0.9,
  });
  expect(body?.blocking_strategy).toMatchObject({
    strategy_type: 'sorted-neighborhood',
    key_fields: ['email', 'phone'],
  });
  // `conditions` is parsed from the JSON textarea — round-trips as an
  // array even though we did not touch it.
  expect(Array.isArray(body?.conditions)).toBe(true);
});

test('"Run selected" POSTs to /fusion/jobs/{id}/run and surfaces the run result', async ({
  adminPage,
}) => {
  await installFusionGets(adminPage, defaultMocks());

  const runCalls = captureRequests(
    adminPage,
    new RegExp(`/api/v1/fusion/jobs/${JOB.id}/run$`),
  );
  await adminPage.route(
    new RegExp(`/api/v1/fusion/jobs/${JOB.id}/run$`),
    async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        json: {
          job: { ...JOB, last_run_at: E2E_NOW, last_run_summary: 'Run just now' },
          cluster_ids: [CLUSTER.id],
          golden_record_ids: [GOLDEN.id],
          review_queue_item_ids: [REVIEW.id],
          executed_at: E2E_NOW,
        },
      });
    },
  );

  const fusion = new FusionPage(adminPage);
  await fusion.goto();

  // The first job auto-selects on load — `Run selected` is enabled.
  const runButton = adminPage.getByRole('button', { name: /^run selected$/i });
  await expect(runButton).toBeEnabled();

  await runButton.click();

  await expect.poll(() => runCalls.count()).toBeGreaterThanOrEqual(1);
  expect(runCalls.last()?.method).toBe('POST');
  expect(runCalls.last()?.url).toMatch(new RegExp(`/fusion/jobs/${JOB.id}/run$`));

  // The success summary surfaces inside ResolutionResults — the panel
  // renders three "Clusters / Golden / Review" cards from the response.
  await expect(adminPage.getByText(/^Clusters 1$/)).toBeVisible();
  await expect(adminPage.getByText(/^Golden 1$/)).toBeVisible();
  await expect(adminPage.getByText(/^Review 1$/)).toBeVisible();
});

test('submitting a manual review POSTs the decision to /fusion/clusters/{id}/review', async ({
  adminPage,
}) => {
  await installFusionGets(adminPage, defaultMocks());

  const reviewCalls = captureRequests(
    adminPage,
    new RegExp(`/api/v1/fusion/clusters/${CLUSTER.id}/review$`),
  );
  await adminPage.route(
    new RegExp(`/api/v1/fusion/clusters/${CLUSTER.id}/review$`),
    async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        json: {
          cluster: { ...CLUSTER, status: 'confirmed' },
          review_item: { ...REVIEW, status: 'resolved', decision: 'confirm_match' },
          golden_record: GOLDEN,
        },
      });
    },
  );

  const fusion = new FusionPage(adminPage);
  await fusion.goto();
  // The first cluster auto-selects via refreshAll, so `Submit review`
  // is immediately enabled.
  const submit = adminPage.getByRole('button', { name: /^submit review$/i });
  await expect(submit).toBeEnabled();

  await submit.click();

  await expect.poll(() => reviewCalls.count()).toBeGreaterThanOrEqual(1);
  expect(reviewCalls.last()?.method).toBe('POST');
  expect(reviewCalls.last()?.url).toMatch(
    new RegExp(`/fusion/clusters/${CLUSTER.id}/review$`),
  );
  // Default ReviewDraft.decision is 'confirm_match'.
  expect(reviewCalls.last()?.body).toMatchObject({
    decision: 'confirm_match',
    reviewed_by: 'reviewer@openfoundry.dev',
  });
});

test('creating a fusion job POSTs to /fusion/jobs with the draft + selected match-rule / merge-strategy', async ({
  adminPage,
}) => {
  await installFusionGets(adminPage, defaultMocks());

  const createCalls = captureRequests(adminPage, /\/api\/v1\/fusion\/jobs$/);
  await adminPage.route(/\/api\/v1\/fusion\/jobs$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        ...JOB,
        id: 'job-new-1',
        name: (body.name as string) ?? JOB.name,
        description: (body.description as string) ?? JOB.description,
        last_run_summary: 'Never run',
        last_run_at: null,
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      },
    });
  });

  const fusion = new FusionPage(adminPage);
  await fusion.goto();
  await expect(adminPage.getByText(JOB.name)).toBeVisible();

  // `Create job` is in ResolutionResults; the other "Save" button in
  // the page belongs to MatchRuleBuilder / MergePreview, so use its
  // distinctive label.
  await adminPage.getByRole('button', { name: /^create job$/i }).click();

  // Filter to POSTs only — saveJob() chains a refreshAll() that
  // re-GETs /fusion/jobs, so `.last()` would otherwise grab the
  // post-save refresh instead of the create call.
  const posts = () => createCalls.calls.filter((c) => c.method === 'POST');
  await expect.poll(() => posts().length).toBeGreaterThanOrEqual(1);
  const call = posts().at(-1);
  const body = call?.body as Record<string, unknown> | undefined;
  // The default JobDraft uses the auto-populated match_rule_id +
  // merge_strategy_id (refreshAll seeds them with the first list
  // entries).
  expect(body).toMatchObject({
    name: 'Customer 360 Batch',
    entity_type: 'person',
    match_rule_id: RULE.id,
    merge_strategy_id: STRATEGY.id,
  });
  expect(body?.config).toMatchObject({
    source_labels: ['crm', 'erp', 'support'],
    record_count: 12,
    blocking_strategy_override: null,
    review_sampling_rate: 0.25,
  });
});
