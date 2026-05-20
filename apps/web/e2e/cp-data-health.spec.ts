import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';

/**
 * E2E coverage for `/control-panel/data-health`
 * (apps/web/src/routes/control-panel/DataHealthPage.tsx, ~1.5k lines).
 *
 * **Reality check.** The page is a scope-based monitoring view, not
 * a check-detail / remediation workflow. It composes:
 *
 *   - 6 rollup cards (Overall / Resources / Critical / Warning /
 *     Healthy / Watched checks) computed from the loaded resource
 *     set.
 *   - A scoping panel (scope kind / scope value / check-filter /
 *     search) + a "Save view" CTA backed by localStorage.
 *   - A resource-class chip strip (Datasets / Schedules / Streaming
 *     datasets / Agents / Object types / Functions / Actions /
 *     Automations / Pipeline resources) with live per-class counts;
 *     clicking a chip flips the scope to `resource_type`.
 *   - One `ResourcePanel` per monitorable resource, each with a
 *     `<header>` block + per-check rows (kind label, status badge,
 *     message, observed-at timestamp, "Watch" / "Watched" toggle).
 *   - A right-side `aside` that pins every Watched check across the
 *     active scope.
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (dashboard with checks) ✅
 *   - Case 2 (drill-down a check específico) ⚠️ partial — the page
 *     exposes "Watch" + "Needs attention" + "Open" (per-resource
 *     deep link), but there is no `/control-panel/data-health/<id>`
 *     standalone detail route.
 *   - Case 3 (acción remediar) ❌ — each check carries a
 *     `recommendation` string but there is no "Remediate" button or
 *     auto-remediation hook today.
 *   - Case 4 (configurar thresholds) ❌ — thresholds are hard-coded
 *     (freshness 24h / 48h, txn-failure 0.15, stream lag 100_000).
 *     No threshold-config UI today.
 *
 * The spec PINS the rollup + scoping + watch + filter behaviour and
 * adds regression guards for cases 3 + 4.
 *
 * Endpoints (partial — Promise.allSettled allows defaults from the
 * catch-all envelope for everything we don't seed):
 *   - GET /api/v1/datasets[?…]                → { data: Dataset[] }
 *   - GET /api/v1/datasets/:rid/health        → DatasetHealthResponse
 *   - GET /api/v1/schedules?…                 → { data: Schedule[] }
 *   - GET /api/v1/pipelines?…                 → { data: Pipeline[] }
 *   - …data-connection + ontology + workflows + lineage (all
 *     handled by the catch-all empty envelope)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /^console\.error: %o$/,
      // Promise.allSettled on the page surfaces partialErrors when
      // any backend returns an empty/wrong envelope from the catch-
      // all; that lights up the `.of-status-warning` banner but is
      // not a test failure.
      /partial.*unavailable/i,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeDataset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dataset-1',
    rid: 'ri.datasets.acme.alpha',
    name: 'Customer events',
    display_name: 'Customer events',
    description: '',
    owner_id: 'user-owner-1',
    project_id: 'project-acme',
    project_rid: 'ri.projects.acme',
    format: 'parquet',
    size_bytes: 4096,
    row_count: 100_000,
    tags: [],
    folder_path: '/datasets/acme',
    active_branch: 'master',
    health_status: 'healthy',
    resource_visibility: 'tenant',
    created_at: E2E_NOW,
    updated_at: '2026-05-09T08:00:00Z',
    ...overrides,
  };
}

const DATASET_STALE = makeDataset({
  id: 'ds-stale',
  rid: 'ri.datasets.acme.stale',
  name: 'Stale orders',
  display_name: 'Stale orders',
  health_status: 'stale',
});

const DATASET_FRESH = makeDataset({
  id: 'ds-fresh',
  rid: 'ri.datasets.acme.fresh',
  name: 'Fresh telemetry',
  display_name: 'Fresh telemetry',
});

// Health responses — `Stale orders` is 3 days behind (critical
// freshness + drift), `Fresh telemetry` is 1h old + clean.
const HEALTH_STALE = {
  dataset_rid: DATASET_STALE.rid,
  dataset_id: DATASET_STALE.id,
  row_count: 50000,
  col_count: 12,
  null_pct_by_column: {},
  freshness_seconds: 3 * 86_400, // 3 days → critical
  last_commit_at: '2026-05-08T08:00:00Z',
  txn_failure_rate_24h: 0.21, // > 0.15 → critical
  last_build_status: 'failed' as const,
  schema_drift_flag: true,
  extras: {},
  last_computed_at: '2026-05-11T07:00:00Z',
};

const HEALTH_FRESH = {
  dataset_rid: DATASET_FRESH.rid,
  dataset_id: DATASET_FRESH.id,
  row_count: 99000,
  col_count: 8,
  null_pct_by_column: {},
  freshness_seconds: 1800, // 30 min → healthy
  last_commit_at: '2026-05-11T07:30:00Z',
  txn_failure_rate_24h: 0,
  last_build_status: 'success' as const,
  schema_drift_flag: false,
  extras: {},
  last_computed_at: '2026-05-11T07:30:00Z',
};

// Endpoint patterns
const DATASETS_LIST = /\/api\/v1\/datasets(?:\?|$)/;
const DATASET_HEALTH = /\/api\/v1\/datasets\/[^/]+\/health$/;

async function mockDataHealth(page: Page, datasets: ReturnType<typeof makeDataset>[]) {
  await page.route(DATASETS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: datasets, total: datasets.length, page: 1, per_page: 100 },
    });
  });

  // `dataConnection.listStreams()` returns the raw response (no
  // envelope-aware helper), so the catch-all's `{data: []}` envelope
  // crashes `streams.map(...)`. Return an empty array explicitly.
  await page.route(/\/api\/v1\/data-connection\/streams$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [] });
  });

  const healthByRid: Record<string, unknown> = {
    [DATASET_STALE.rid]: HEALTH_STALE,
    [DATASET_FRESH.rid]: HEALTH_FRESH,
  };
  await page.route(DATASET_HEALTH, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = route.request().url();
    const match = url.match(/\/datasets\/([^/]+)\/health$/);
    const rid = match ? decodeURIComponent(match[1]) : '';
    const payload = healthByRid[rid];
    if (!payload) {
      await route.fulfill({ status: 404, json: { error: 'no health snapshot' } });
      return;
    }
    await route.fulfill({ json: payload });
  });
}

function resourcePanel(page: Page, name: string) {
  return page
    .getByRole('heading', { level: 2, name })
    .locator('xpath=ancestor::article[1]');
}

// ---------------------------------------------------------------------------
// Case 1 — dashboard with rollup + resource-class chips + per-resource checks
// ---------------------------------------------------------------------------

test('renders rollup cards + resource-class chip strip + per-resource panels with checks', async ({
  adminPage,
}) => {
  await mockDataHealth(adminPage, [DATASET_STALE, DATASET_FRESH]);
  await adminPage.goto('/control-panel/data-health');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^data health$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^control panel$/i }).first(),
  ).toHaveAttribute('href', /\/control-panel$/);

  // The 6 rollup cards are `<article className="of-panel-muted">`s.
  // Scope through that class so the labels don't collide with the
  // matching text inside the per-resource ResourcePanel cards below.
  const rollupCards = adminPage.locator('.of-panel-muted');
  await expect(rollupCards.filter({ hasText: /^Resources/ })).toContainText('2');
  // One stale dataset critical-status → at least one Critical.
  await expect(rollupCards.filter({ hasText: /^Critical/ })).toContainText(/[1-9]/);
  await expect(rollupCards.filter({ hasText: /^Watched checks/ })).toContainText('0');

  // The resource-class chip strip renders 9 chips with live counts;
  // pin the Datasets chip carries "Datasets 2".
  await expect(
    adminPage.getByRole('button', { name: /^Datasets 2$/ }),
  ).toBeVisible();

  // ResourcePanel cards: both datasets render with their h2.
  const staleCard = resourcePanel(adminPage, 'Stale orders');
  const freshCard = resourcePanel(adminPage, 'Fresh telemetry');
  await expect(staleCard).toBeVisible();
  await expect(freshCard).toBeVisible();

  // Stale row carries the Critical badge + the freshness / schema
  // drift / failure-rate check messages.
  await expect(staleCard.getByText(/Critical/).first()).toBeVisible();
  await expect(staleCard).toContainText(/Last committed data is 3 day old\./i);
  await expect(staleCard).toContainText(/24h transaction failure rate is 21\.0%\./i);
  await expect(staleCard).toContainText(/schema drift detected/i);
  await expect(staleCard).toContainText(/last build status is failed/i);

  // Fresh row stays Healthy and the freshness check reads "30 min".
  await expect(freshCard.getByText(/Healthy/).first()).toBeVisible();
  await expect(freshCard).toContainText(/Last committed data is 30 min old\./i);
  await expect(freshCard).toContainText(/no schema drift detected\./i);
});

// ---------------------------------------------------------------------------
// Case 2 — drill-down via the Watch toggle (closest equivalent today)
// ---------------------------------------------------------------------------

test('watch a check: per-check Watch button pins it to the right-side Watched-checks aside', async ({
  adminPage,
}) => {
  await mockDataHealth(adminPage, [DATASET_STALE]);
  await adminPage.goto('/control-panel/data-health');

  const staleCard = resourcePanel(adminPage, 'Stale orders');
  await expect(staleCard).toBeVisible();

  // Aside starts empty (`0 in this view`).
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /0 in this view/i }),
  ).toBeVisible();

  // Click the Watch button on the Freshness check row. `datasetChecks`
  // emits checks in source order: resource_health, freshness,
  // last_build, transaction_failures, schema_drift — so Freshness is
  // the 2nd Watch button inside the stale card (index 1).
  await staleCard.getByRole('button', { name: /^Watch$/ }).nth(1).click();

  // The clicked button flips to "Watched"; the rest remain "Watch".
  await expect(staleCard.getByRole('button', { name: /^Watched$/ })).toHaveCount(1);
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /1 in this view/i }),
  ).toBeVisible();

  // The Watched-checks rollup card also bumps to 1.
  await expect(
    adminPage.locator('.of-panel-muted').filter({ hasText: /^Watched checks/ }),
  ).toContainText('1');
});

// ---------------------------------------------------------------------------
// Case 2 (filter) — "Needs attention" hides healthy checks
// ---------------------------------------------------------------------------

test('check filter "Needs attention" hides healthy checks and keeps only non-healthy ones', async ({
  adminPage,
}) => {
  await mockDataHealth(adminPage, [DATASET_STALE, DATASET_FRESH]);
  await adminPage.goto('/control-panel/data-health');

  // Both cards render in the default "All checks" mode.
  await expect(resourcePanel(adminPage, 'Stale orders')).toBeVisible();
  await expect(resourcePanel(adminPage, 'Fresh telemetry')).toBeVisible();

  await adminPage
    .getByRole('combobox', { name: /^check filter$/i })
    .selectOption('attention');

  // Fresh-telemetry has zero non-healthy checks → the card filters out.
  await expect(resourcePanel(adminPage, 'Fresh telemetry')).toHaveCount(0);
  // Stale-orders still has the critical freshness / failure / drift
  // checks → its card stays.
  await expect(resourcePanel(adminPage, 'Stale orders')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Resource-class chip strip flips scope to that resource_type
// ---------------------------------------------------------------------------

test('clicking a resource-class chip flips scope to resource_type and narrows the resource list', async ({
  adminPage,
}) => {
  await mockDataHealth(adminPage, [DATASET_STALE, DATASET_FRESH]);
  await adminPage.goto('/control-panel/data-health');
  await expect(resourcePanel(adminPage, 'Stale orders')).toBeVisible();

  // The Monitoring scope select reflects whatever scopeKind state is.
  const scopeSelect = adminPage.getByRole('combobox', { name: /monitoring scope/i });
  await expect(scopeSelect).toHaveValue('all');

  // Click the Datasets chip — the scope flips to `resource_type` and
  // the Resource-type select shows up with `dataset` selected.
  await adminPage.getByRole('button', { name: /^Datasets 2$/ }).click();
  await expect(scopeSelect).toHaveValue('resource_type');
  await expect(
    adminPage.getByRole('combobox', { name: /resource type/i }),
  ).toHaveValue('dataset');

  // The two dataset cards remain (they are of resource_type dataset).
  await expect(resourcePanel(adminPage, 'Stale orders')).toBeVisible();
  await expect(resourcePanel(adminPage, 'Fresh telemetry')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Saved monitoring view: save + apply
// ---------------------------------------------------------------------------

test('saved monitoring view: Save view stores the active scope and clicking the chip re-applies it', async ({
  adminPage,
}) => {
  await mockDataHealth(adminPage, [DATASET_STALE, DATASET_FRESH]);
  await adminPage.goto('/control-panel/data-health');
  await expect(resourcePanel(adminPage, 'Stale orders')).toBeVisible();

  // Save a view with the default scope (all + all checks) under a name.
  await adminPage
    .getByRole('textbox', { name: /monitoring view name/i })
    .fill('All datasets — full');
  await adminPage.getByRole('button', { name: /^save view$/i }).click();

  // The view appears as a chip button below the form.
  const viewChip = adminPage.getByRole('button', { name: /^All datasets — full$/ });
  await expect(viewChip).toBeVisible();

  // Change the scope to a different state so the apply has something to do.
  await adminPage
    .getByRole('combobox', { name: /^check filter$/i })
    .selectOption('attention');

  // Apply the saved view → check-filter resets to its saved value (all).
  await viewChip.click();
  await expect(
    adminPage.getByRole('combobox', { name: /^check filter$/i }),
  ).toHaveValue('all');
});

// ---------------------------------------------------------------------------
// Absent-today — cases 3 and 4
// ---------------------------------------------------------------------------

test('absent today: per-check Remediate CTA, threshold-config form, drill-down detail page', async ({
  adminPage,
}) => {
  await mockDataHealth(adminPage, [DATASET_STALE]);
  await adminPage.goto('/control-panel/data-health');
  await expect(resourcePanel(adminPage, 'Stale orders')).toBeVisible();

  // 1. Case 3 — no Remediate / Auto-fix / Repair CTAs on any check.
  //    The `recommendation` text is rendered inline as a muted
  //    paragraph, NOT a button.
  expect(
    await adminPage.getByRole('button', { name: /remediate|repair|auto[- ]?fix|run remediation/i }).count(),
  ).toBe(0);

  // 2. Case 4 — no threshold-config form. Freshness / failure-rate /
  //    lag thresholds are hard-coded in the page today.
  expect(
    await adminPage.getByRole('heading', { name: /thresholds|threshold config|alerting thresholds/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('spinbutton', { name: /freshness threshold|failure rate threshold|lag threshold/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /configure thresholds|edit thresholds|save thresholds/i }).count(),
  ).toBe(0);

  // 3. Case 2 (partial) — no standalone "/data-health/<id>" route.
  //    The per-check row has no "View detail" link; the closest is
  //    the per-resource "Open" link which jumps to the resource page
  //    (e.g. /datasets/:id).
  const staleCard = resourcePanel(adminPage, 'Stale orders');
  expect(
    await staleCard.getByRole('link', { name: /view check|check details|drill ?down/i }).count(),
  ).toBe(0);
  // Sanity: the per-resource "Open" link IS present and points at
  // the resource page (not a data-health sub-route).
  const openLink = staleCard.getByRole('link', { name: /^open$/i });
  await expect(openLink).toBeVisible();
  await expect(openLink).toHaveAttribute('href', /^\/datasets\//);
});
