import { type Page, type Route } from '@playwright/test';
import { test, expect, DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/model-catalog`
 * (apps/web/src/routes/ml/MlPage.tsx — formerly `/ml`, which now redirects).
 *
 * **Reality vs roadmap.** The shipped page is a tabbed "ML Studio" wrapper
 * around the experiments / models / features / training / deployments /
 * batch endpoints. Each tab is a thin JSON-driven CRUD surface, NOT the
 * polished model-catalog described in the roadmap. Concretely:
 *
 *   - Models render as a bullet list with `<strong>name</strong> ·
 *     problem_type · status`. There is no `framework` column, no
 *     `version` column on the model row, no rich table, no card grid.
 *   - Versions are expanded INLINE under a model via a "Versions"
 *     button — there is no drawer, no `/model-catalog/:id` detail
 *     page, and no metrics/artifacts panel.
 *   - Promote and rollback share a single "⇄ stage" toggle button:
 *     when the version's `stage` is `Production` it transitions to
 *     `Staging`; otherwise it transitions to `Production`. There is
 *     no separate "Promote" / "Rollback" CTA, no stage picker, no
 *     audit-trail panel.
 *   - Deployment "create" is a free-form JSON editor + a "Deploy"
 *     button — there is no model-row "Deploy" toggle, no "Undeploy"
 *     button, and no per-model deployment state on the list row.
 *   - There is no per-row delete, no "..." menu, no destructive
 *     confirm dialog. Models cannot be removed from the UI today.
 *   - There are no filter controls (framework / owner / deployed) and
 *     no search input — the page renders whatever the API returns.
 *
 * The seven cases the roadmap calls out are spread across two
 * concerns: (1) pin the shipped behaviour for the slices that DO
 * ship (list rendering, promote ↔ rollback via the toggle, deploy
 * create); (2) regression-guard the controls that DON'T ship yet
 * (filters, drawer/detail, undeploy, delete). When each missing
 * control lands, the matching assertion flips and forces an update.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/ml/overview
 *   - GET    /api/v1/ml/experiments
 *   - GET    /api/v1/ml/models
 *   - GET    /api/v1/ml/models/{id}/versions
 *   - POST   /api/v1/ml/model-versions/{id}/transition  (promote / rollback)
 *   - GET    /api/v1/ml/features
 *   - GET    /api/v1/ml/training-jobs
 *   - GET    /api/v1/ml/deployments
 *   - POST   /api/v1/ml/deployments                     (deploy)
 *   - GET    /api/v1/ml/batch-predictions
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // The page swallows refresh errors into a status banner — the
      // catch-all fixture mock already returns empty envelopes, but a
      // few sub-resource fetches can still surface as `console.error`
      // when a Promise.all branch rejects during navigation. Allowlist
      // them so they don't mask real regressions.
      /Failed to load ML studio/i,
      /Failed to load (runs|versions)/i,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

interface ModelFixture {
  id: string;
  name: string;
  description: string;
  problem_type: string;
  status: string;
  tags: string[];
  owner_id: string | null;
  current_stage: string;
  latest_version_number: number | null;
  active_deployment_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ModelVersionFixture {
  id: string;
  model_id: string;
  version_number: number;
  version_label: string;
  stage: string;
  source_run_id: string | null;
  training_job_id: string | null;
  hyperparameters: Record<string, unknown>;
  metrics: Array<{ name: string; value: number }>;
  artifact_uri: string | null;
  schema: Record<string, unknown>;
  created_at: string;
  promoted_at: string | null;
}

interface DeploymentFixture {
  id: string;
  model_id: string;
  name: string;
  status: string;
  strategy_type: string;
  endpoint_path: string;
  traffic_split: Array<{ model_version_id: string; label: string; allocation: number }>;
  monitoring_window: string;
  baseline_dataset_id: string | null;
  drift_report: null;
  created_at: string;
  updated_at: string;
}

function makeModel(overrides: Partial<ModelFixture> = {}): ModelFixture {
  return {
    id: 'model-1',
    name: 'risk-scorer',
    description: 'Deterministic E2E model',
    problem_type: 'classification',
    status: 'active',
    tags: ['risk'],
    owner_id: 'user-1',
    current_stage: 'Staging',
    latest_version_number: 1,
    active_deployment_id: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeVersion(overrides: Partial<ModelVersionFixture> = {}): ModelVersionFixture {
  return {
    id: 'mv-1',
    model_id: 'model-1',
    version_number: 1,
    version_label: 'v1',
    stage: 'Staging',
    source_run_id: null,
    training_job_id: null,
    hyperparameters: {},
    metrics: [{ name: 'accuracy', value: 0.92 }],
    artifact_uri: 's3://artifacts/model-1/v1',
    schema: {},
    created_at: E2E_NOW,
    promoted_at: null,
    ...overrides,
  };
}

function makeDeployment(overrides: Partial<DeploymentFixture> = {}): DeploymentFixture {
  return {
    id: 'deployment-1',
    model_id: 'model-1',
    name: 'risk-scorer-shadow',
    status: 'running',
    strategy_type: 'shadow',
    endpoint_path: '/api/v1/ml/runtime/risk-scorer',
    traffic_split: [],
    monitoring_window: '24h',
    baseline_dataset_id: null,
    drift_report: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface MlMockState {
  models: ModelFixture[];
  versionsByModel: Record<string, ModelVersionFixture[]>;
  deployments: DeploymentFixture[];
}

/**
 * Install the ML-studio mocks needed for the model-catalog flows. Returns
 * the mutable state object so individual tests can mutate it (e.g. to
 * flip a version's stage server-side after the transition POST fires).
 */
async function mockMlStudio(
  page: Page,
  initial: Partial<MlMockState> = {},
): Promise<MlMockState> {
  const state: MlMockState = {
    models: initial.models ?? [makeModel()],
    versionsByModel: initial.versionsByModel ?? {},
    deployments: initial.deployments ?? [],
  };

  // Overview — the page renders the JSON blob, so any non-null payload
  // keeps the "overview" tab from blanking out.
  await page.route('**/api/v1/ml/overview', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        experiment_count: 0,
        active_run_count: 0,
        model_count: state.models.length,
        production_model_count: state.models.filter((m) => m.current_stage === 'Production').length,
        feature_count: 0,
        online_feature_count: 0,
        deployment_count: state.deployments.length,
        ab_test_count: 0,
        drift_alert_count: 0,
        queued_training_jobs: 0,
      },
    });
  });

  // Models list.
  await page.route(/\/api\/v1\/ml\/models(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: state.models } });
  });

  // Versions list per model.
  await page.route(/\/api\/v1\/ml\/models\/[^/]+\/versions(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const match = /\/ml\/models\/([^/]+)\/versions/.exec(route.request().url());
    const modelId = match?.[1] ?? '';
    await route.fulfill({ json: { data: state.versionsByModel[modelId] ?? [] } });
  });

  // Version stage transition (promote / rollback share this endpoint).
  await page.route(/\/api\/v1\/ml\/model-versions\/[^/]+\/transition/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = route.request().url();
    const idMatch = /\/ml\/model-versions\/([^/]+)\/transition/.exec(url);
    const versionId = idMatch?.[1] ?? '';
    const body = route.request().postDataJSON() as { stage?: string } | null;
    const nextStage = body?.stage ?? 'Staging';

    // Flip the stage in our stateful mock so the next versions GET
    // reflects the transition.
    for (const modelId of Object.keys(state.versionsByModel)) {
      state.versionsByModel[modelId] = state.versionsByModel[modelId].map((v) =>
        v.id === versionId
          ? { ...v, stage: nextStage, promoted_at: nextStage === 'Production' ? E2E_NOW : v.promoted_at }
          : v,
      );
    }

    await route.fulfill({
      status: 200,
      json: { ...makeVersion(), id: versionId, stage: nextStage },
    });
  });

  // Deployments list + create.
  await page.route(/\/api\/v1\/ml\/deployments(\?|$)/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: state.deployments } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<DeploymentFixture>;
      const created = makeDeployment({
        id: `deployment-${state.deployments.length + 1}`,
        ...body,
      });
      state.deployments.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  // Quiet stubs for the other tab fetches that fire on mount via
  // Promise.all. Without these the catch-all returns an empty envelope
  // and the "Failed to load ML studio" banner can surface.
  for (const path of [
    /\/api\/v1\/ml\/experiments(\?|$)/,
    /\/api\/v1\/ml\/features(\?|$)/,
    /\/api\/v1\/ml\/training-jobs(\?|$)/,
    /\/api\/v1\/ml\/batch-predictions(\?|$)/,
  ]) {
    await page.route(path, async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { data: [] } });
    });
  }

  return state;
}

// ---------------------------------------------------------------------------
// Fixtures shared by multiple tests
// ---------------------------------------------------------------------------

const RISK = makeModel({
  id: 'model-risk',
  name: 'risk-scorer',
  problem_type: 'classification',
  status: 'active',
});
const FRAUD = makeModel({
  id: 'model-fraud',
  name: 'fraud-detector',
  problem_type: 'classification',
  status: 'archived',
});

const RISK_V1_STAGING = makeVersion({
  id: 'mv-risk-1',
  model_id: 'model-risk',
  version_label: 'v1',
  stage: 'Staging',
});
const RISK_V2_PRODUCTION = makeVersion({
  id: 'mv-risk-2',
  model_id: 'model-risk',
  version_number: 2,
  version_label: 'v2',
  stage: 'Production',
  promoted_at: E2E_NOW,
});

// ===========================================================================
// 1. List
// ===========================================================================

test('models tab lists each model with its name, problem_type and status', async ({
  adminPage,
}) => {
  await mockMlStudio(adminPage, { models: [RISK, FRAUD] });
  await adminPage.goto('/model-catalog');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^ml studio$/i }),
  ).toBeVisible();

  await adminPage.getByRole('tab', { name: /^models$/i }).click();

  // Header reflects the count.
  await expect(adminPage.getByText(/^Models \(2\)$/)).toBeVisible();

  // Both rows render with the shipped `name · problem_type · status` triple.
  const riskRow = adminPage.locator('li', { hasText: 'risk-scorer' }).first();
  await expect(riskRow).toContainText('classification');
  await expect(riskRow).toContainText('active');

  const fraudRow = adminPage.locator('li', { hasText: 'fraud-detector' }).first();
  await expect(fraudRow).toContainText('classification');
  await expect(fraudRow).toContainText('archived');

  // Each row exposes the inline Versions + Add version buttons.
  await expect(adminPage.getByRole('button', { name: /^Versions$/ })).toHaveCount(2);
  await expect(adminPage.getByRole('button', { name: /^Add version$/ })).toHaveCount(2);
});

// ===========================================================================
// 2. Filters — regression guard
// ===========================================================================

test('absent today: framework / owner / deployed filter controls (and free-text search)', async ({
  adminPage,
}) => {
  // The shipped models tab has no filter UI at all — the page renders
  // whatever the API returns. Pin that explicitly so the day someone
  // wires up filters, the assertions below flip and force coverage to
  // catch up with the new UI.
  await mockMlStudio(adminPage, { models: [RISK, FRAUD] });
  await adminPage.goto('/model-catalog');
  await adminPage.getByRole('tab', { name: /^models$/i }).click();

  // No combobox / dropdown for framework or owner.
  expect(await adminPage.getByRole('combobox', { name: /framework/i }).count()).toBe(0);
  expect(await adminPage.getByRole('combobox', { name: /owner/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^framework/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^owner/i }).count()).toBe(0);

  // No "deployed" toggle / checkbox / chip.
  expect(await adminPage.getByRole('switch', { name: /deployed/i }).count()).toBe(0);
  expect(await adminPage.getByRole('checkbox', { name: /deployed/i }).count()).toBe(0);

  // No search box scoped to the models tab.
  expect(
    await adminPage.getByPlaceholder(/search (models|model catalog)/i).count(),
  ).toBe(0);
});

// ===========================================================================
// 3. Detail (drawer / page) — regression guard + the inline-expand reality
// ===========================================================================

test('clicking "Versions" expands version metadata inline (no drawer, no /model-catalog/:id route)', async ({
  adminPage,
}) => {
  await mockMlStudio(adminPage, {
    models: [RISK],
    versionsByModel: { 'model-risk': [RISK_V1_STAGING, RISK_V2_PRODUCTION] },
  });
  await adminPage.goto('/model-catalog');
  await adminPage.getByRole('tab', { name: /^models$/i }).click();

  // Open the inline versions section.
  await adminPage.getByRole('button', { name: /^Versions$/ }).click();

  // Versions render with `version_label · stage` inline under the row.
  const row = adminPage.locator('li', { hasText: 'risk-scorer' }).first();
  await expect(row).toContainText('v1');
  await expect(row).toContainText('Staging');
  await expect(row).toContainText('v2');
  await expect(row).toContainText('Production');

  // The shipped flow does NOT open a drawer.
  expect(await adminPage.getByRole('dialog').count()).toBe(0);
  // Nor does it navigate to a `/model-catalog/:id` detail route.
  await expect(adminPage).toHaveURL(/\/model-catalog\/?(\?|#|$)/);

  // No dedicated metrics / artifacts panel anywhere on the page yet —
  // metrics are buried inside the raw version JSON, never rendered.
  expect(await adminPage.getByRole('heading', { name: /^metrics$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('heading', { name: /^artifacts$/i }).count()).toBe(0);
});

// ===========================================================================
// 4. Promote (Staging → Production)
// ===========================================================================

test('promote: ⇄ stage on a Staging version POSTs { stage: "Production" }', async ({
  adminPage,
}) => {
  await mockMlStudio(adminPage, {
    models: [RISK],
    versionsByModel: { 'model-risk': [RISK_V1_STAGING] },
  });
  const cap = captureRequests(
    adminPage,
    /\/api\/v1\/ml\/model-versions\/[^/]+\/transition/,
  );

  await adminPage.goto('/model-catalog');
  await adminPage.getByRole('tab', { name: /^models$/i }).click();
  await adminPage.getByRole('button', { name: /^Versions$/ }).click();

  // The toggle button label is literally "⇄ stage" — match loosely so the
  // unicode arrow doesn't sink the locator on weird font fallbacks.
  await adminPage.getByRole('button', { name: /stage$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const call = cap.last();
  expect(call?.method).toBe('POST');
  expect(call?.url).toMatch(/\/ml\/model-versions\/mv-risk-1\/transition$/);
  expect(call?.body).toEqual({ stage: 'Production' });

  // After the refresh, the version row reflects the new stage.
  const row = adminPage.locator('li', { hasText: 'risk-scorer' }).first();
  await expect(row).toContainText('Production');
});

// ===========================================================================
// 5. Rollback (Production → Staging)
// ===========================================================================

test('rollback: ⇄ stage on a Production version POSTs { stage: "Staging" }', async ({
  adminPage,
}) => {
  await mockMlStudio(adminPage, {
    models: [RISK],
    versionsByModel: { 'model-risk': [RISK_V2_PRODUCTION] },
  });
  const cap = captureRequests(
    adminPage,
    /\/api\/v1\/ml\/model-versions\/[^/]+\/transition/,
  );

  await adminPage.goto('/model-catalog');
  await adminPage.getByRole('tab', { name: /^models$/i }).click();
  await adminPage.getByRole('button', { name: /^Versions$/ }).click();

  await adminPage.getByRole('button', { name: /stage$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const call = cap.last();
  expect(call?.method).toBe('POST');
  expect(call?.url).toMatch(/\/ml\/model-versions\/mv-risk-2\/transition$/);
  expect(call?.body).toEqual({ stage: 'Staging' });

  const row = adminPage.locator('li', { hasText: 'risk-scorer' }).first();
  await expect(row).toContainText('Staging');
});

// ===========================================================================
// 6. Deploy (deployments tab "Deploy" button)
// ===========================================================================

test('deploy: the deployments tab Deploy button POSTs a deployment with the editor payload', async ({
  adminPage,
}) => {
  await mockMlStudio(adminPage, { models: [RISK], deployments: [] });
  const cap = captureRequests(adminPage, /\/api\/v1\/ml\/deployments(\?|$)/);

  await adminPage.goto('/model-catalog');
  await adminPage.getByRole('tab', { name: /^deployments$/i }).click();

  // Populate the JSON editor with a deployable payload (the default in the
  // page has `model_id: ''` which would 422 on the real server).
  const editor = adminPage.locator('textarea').first();
  await editor.fill(
    JSON.stringify(
      {
        model_id: 'model-risk',
        name: 'risk-scorer-prod',
        endpoint_path: '/api/v1/ml/runtime/risk-scorer-prod',
        strategy_type: 'shadow',
        traffic_split: [],
      },
      null,
      2,
    ),
  );

  await adminPage.getByRole('button', { name: /^Deploy$/ }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = cap.calls.filter((c) => c.method === 'POST').at(-1);
  expect(post?.url).toMatch(/\/ml\/deployments$/);
  expect(post?.body).toMatchObject({
    model_id: 'model-risk',
    name: 'risk-scorer-prod',
    endpoint_path: '/api/v1/ml/runtime/risk-scorer-prod',
    strategy_type: 'shadow',
  });

  // The refresh wires the new deployment into the list.
  await expect(adminPage.locator('li', { hasText: 'risk-scorer-prod' })).toBeVisible();
});

// ===========================================================================
// 6b. Undeploy — regression guard
// ===========================================================================

test('absent today: per-row Undeploy / Stop / Decommission CTA on a running deployment', async ({
  adminPage,
}) => {
  await mockMlStudio(adminPage, {
    models: [RISK],
    deployments: [makeDeployment({ id: 'deployment-risk', name: 'risk-scorer-shadow', status: 'running' })],
  });
  await adminPage.goto('/model-catalog');
  await adminPage.getByRole('tab', { name: /^deployments$/i }).click();

  // Row is visible with its shipped triple (`name · status · endpoint · strategy`).
  const row = adminPage.locator('li', { hasText: 'risk-scorer-shadow' }).first();
  await expect(row).toContainText('running');
  await expect(row).toContainText('shadow');

  // The shipped per-row controls today are Predict + Drift only.
  await expect(row.getByRole('button', { name: /^Predict$/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Drift$/ })).toBeVisible();

  // No Undeploy / Stop / Decommission button anywhere on the page.
  expect(await adminPage.getByRole('button', { name: /^undeploy$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^stop$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^decommission$/i }).count()).toBe(0);
});

// ===========================================================================
// 7. Delete — regression guard
// ===========================================================================

test('absent today: per-row delete / archive control on a model row', async ({
  adminPage,
}) => {
  await mockMlStudio(adminPage, { models: [RISK] });
  const cap = captureRequests(adminPage, /\/api\/v1\/ml\/models\/[^/]+(\?|$)/);

  await adminPage.goto('/model-catalog');
  await adminPage.getByRole('tab', { name: /^models$/i }).click();

  const row = adminPage.locator('li', { hasText: 'risk-scorer' }).first();

  // No per-row "..." / "More actions" trigger.
  expect(await row.getByRole('button', { name: /more actions/i }).count()).toBe(0);

  // No delete / remove / archive button on the row itself.
  expect(await row.getByRole('button', { name: /^delete$/i }).count()).toBe(0);
  expect(await row.getByRole('button', { name: /^remove$/i }).count()).toBe(0);
  expect(await row.getByRole('button', { name: /^archive$/i }).count()).toBe(0);

  // And the page never fires a DELETE on the model resource.
  await adminPage.waitForTimeout(250);
  expect(cap.calls.some((c) => c.method === 'DELETE')).toBe(false);
});
