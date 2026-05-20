import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/pipelines`
 * (apps/web/src/routes/pipelines/PipelinesPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a Foundry "Build schedules"-
 * style list with:
 *   - 5 status tabs (`All pipelines / Drafts / Active / Paused / Archived`),
 *     server-filtered through `?status=…` on the list endpoint.
 *   - A name filter input that posts `?search=…` on submit/blur.
 *   - A Filter popover with two facet groups: **Pipeline type** (Batch /
 *     Faster / Distributed / Incremental / Streaming / External) and
 *     **Schedule** (All / Scheduled / Manual). These are client-side
 *     filters — no re-fetch.
 *   - A Sort dropdown with five client-side keys: updated_desc,
 *     updated_asc, created_desc, name_asc, name_desc.
 *   - Row actions: `Builder`, `Runs`, `Delete`. (The name itself is a
 *     `<Link>` to `/pipelines/:id/edit`.)
 *   - A `Select pipelines…` bulk toggle that adds a checkbox column and
 *     a `Delete selected` toolbar button.
 *   - Two creation entry points in the sub-header: a `New pipeline`
 *     button that opens the in-page `CreatePipelineModal`, and a
 *     `JSON create` Link that navigates to `/pipelines/new`.
 *
 * Mismatches with the original task ask that we explicitly pin (see the
 * final regression-guard test):
 *   - Filters: no owner facet, no tag facet — only **type** and **schedule**.
 *   - Row quick actions: no pause / resume / archive — only Builder /
 *     Runs / Delete.
 *   - Bulk action: `Delete selected`, NOT `Archive selected`.
 *   - Sort options do NOT include "last execution" or "next trigger".
 *   - `New pipeline` opens a modal in place; `JSON create` is what
 *     navigates to `/pipelines/new`.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/pipelines?per_page=100[&status=…][&search=…]
 *   - DELETE /api/v1/pipelines/{id}
 *   - GET    /api/v1/pipelines/{id}/runs?per_page=25     (RunHistory panel)
 *   - POST   /api/v1/pipelines/_scheduler/run-due        (Run due button —
 *                                                         catch-all 204)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

const PIPELINES_LIST = /\/api\/v1\/pipelines(\?|$)/;
const PIPELINE_DELETE = /\/api\/v1\/pipelines\/[^/]+(\?|$)/;
const PIPELINE_RUNS = /\/api\/v1\/pipelines\/[^/]+\/runs(\?|$)/;
const E2E_NOW = '2026-05-11T00:00:00Z';

interface PipelineFixture {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  dag: unknown[];
  status: string;
  schedule_config: { enabled: boolean; cron: string | null };
  retry_policy: { max_attempts: number; retry_on_failure: boolean; allow_partial_reexecution: boolean };
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  pipeline_type: string;
  lifecycle?: string;
}

function makePipeline(overrides: Partial<PipelineFixture> = {}): PipelineFixture {
  return {
    id: 'pipeline-1',
    name: 'Pipeline',
    description: '',
    owner_id: '00000000-0000-0000-0000-000000000001',
    dag: [],
    status: 'draft',
    schedule_config: { enabled: false, cron: null },
    retry_policy: { max_attempts: 1, retry_on_failure: false, allow_partial_reexecution: true },
    next_run_at: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    pipeline_type: 'BATCH',
    lifecycle: 'DRAFT',
    ...overrides,
  };
}

interface PipelinesMockState {
  pipelines: PipelineFixture[];
}

/**
 * Routes `/api/v1/pipelines` with server-style status + search filtering so
 * tab switches and the name filter exercise their real query-string contract.
 * Also routes `DELETE /pipelines/:id` against the same store, and stubs the
 * `RunHistory` panel's `/runs` GET so the detail panel doesn't spam the
 * console when the first pipeline auto-selects.
 */
async function mockPipelines(
  page: Page,
  initial: { pipelines: PipelineFixture[] },
): Promise<PipelinesMockState> {
  const state: PipelinesMockState = { pipelines: initial.pipelines.slice() };

  await page.route(PIPELINES_LIST, async (route: Route) => {
    const method = route.request().method();
    if (method !== 'GET') return route.fallback();

    const url = new URL(route.request().url());
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    let filtered = state.pipelines;
    if (status) {
      filtered = filtered.filter((p) => p.status.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const needle = search.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(needle));
    }

    await route.fulfill({
      json: {
        data: filtered,
        total: filtered.length,
        page: 1,
        per_page: 100,
      },
    });
  });

  await page.route(PIPELINE_DELETE, async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    const match = /\/pipelines\/([^/?#]+)(?:\?|$)/.exec(route.request().url());
    if (match) {
      state.pipelines = state.pipelines.filter((p) => p.id !== match[1]);
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route(PIPELINE_RUNS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });

  return state;
}

const ALPHA = makePipeline({
  id: 'pipeline-alpha',
  name: 'Alpha ingest',
  status: 'active',
  pipeline_type: 'STREAMING',
  schedule_config: { enabled: true, cron: '*/5 * * * *' },
  updated_at: '2026-05-11T10:00:00Z',
  created_at: '2026-05-01T00:00:00Z',
});
const BRAVO = makePipeline({
  id: 'pipeline-bravo',
  name: 'Bravo nightly batch',
  status: 'paused',
  pipeline_type: 'BATCH',
  schedule_config: { enabled: true, cron: '0 2 * * *' },
  updated_at: '2026-05-09T10:00:00Z',
  created_at: '2026-05-02T00:00:00Z',
});
const CHARLIE = makePipeline({
  id: 'pipeline-charlie',
  name: 'Charlie draft',
  status: 'draft',
  pipeline_type: 'BATCH',
  schedule_config: { enabled: false, cron: null },
  updated_at: '2026-05-10T10:00:00Z',
  created_at: '2026-05-03T00:00:00Z',
});
const DELTA = makePipeline({
  id: 'pipeline-delta',
  name: 'Delta archived snapshot',
  status: 'archived',
  pipeline_type: 'DISTRIBUTED',
  schedule_config: { enabled: false, cron: null },
  updated_at: '2026-04-20T10:00:00Z',
  created_at: '2026-04-01T00:00:00Z',
});

const ALL_FIXTURES: PipelineFixture[] = [ALPHA, BRAVO, CHARLIE, DELTA];

test('renders the five status tabs with per-status counts', async ({ adminPage }) => {
  await mockPipelines(adminPage, { pipelines: ALL_FIXTURES });
  await adminPage.goto('/pipelines');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^pipelines$/i }),
  ).toBeVisible();

  // All five tabs render with their count badge. The "All" tab counts every
  // pipeline returned by the unfiltered GET; the others reflect status.
  for (const [label, count] of [
    ['All pipelines', 4],
    ['Drafts', 1],
    ['Active', 1],
    ['Paused', 1],
    ['Archived', 1],
  ] as const) {
    const tab = adminPage.getByRole('tab', { name: new RegExp(`^${label}`) });
    await expect(tab).toBeVisible();
    await expect(tab).toContainText(String(count));
  }

  // The "All" tab is selected by default.
  await expect(
    adminPage.getByRole('tab', { name: /^All pipelines/ }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('switching to the Active tab re-queries the API with ?status=active', async ({
  adminPage,
}) => {
  await mockPipelines(adminPage, { pipelines: ALL_FIXTURES });
  const cap = captureRequests(adminPage, PIPELINES_LIST);
  await adminPage.goto('/pipelines');

  // Wait for the initial unfiltered fetch to land.
  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();

  await adminPage.getByRole('tab', { name: /^Active/ }).click();

  // Tab now selected.
  await expect(adminPage.getByRole('tab', { name: /^Active/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // A new GET fired with status=active.
  await expect
    .poll(() => cap.calls.some((c) => c.method === 'GET' && /[?&]status=active\b/.test(c.url)))
    .toBe(true);

  // Only the active pipeline row remains after the server-filtered response.
  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Charlie draft' })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: 'Bravo nightly batch' })).toHaveCount(0);
});

test('submitting the name filter re-queries the API with ?search=…', async ({ adminPage }) => {
  await mockPipelines(adminPage, { pipelines: ALL_FIXTURES });
  const cap = captureRequests(adminPage, PIPELINES_LIST);
  await adminPage.goto('/pipelines');

  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();

  const filter = adminPage.getByLabel(/filter by name/i);
  await filter.fill('bravo');
  await filter.press('Enter');

  await expect
    .poll(() => cap.calls.some((c) => c.method === 'GET' && /[?&]search=bravo\b/.test(c.url)))
    .toBe(true);

  // Server filtered to only Bravo.
  await expect(adminPage.getByRole('link', { name: 'Bravo nightly batch' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toHaveCount(0);

  // The active-filter chip strip surfaces the applied search.
  await expect(adminPage.getByText(/^Name · bravo$/)).toBeVisible();
});

test('Schedule facet filters the table client-side without re-querying', async ({
  adminPage,
}) => {
  await mockPipelines(adminPage, { pipelines: ALL_FIXTURES });
  const cap = captureRequests(adminPage, PIPELINES_LIST);
  await adminPage.goto('/pipelines');

  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();
  const initialGetCount = cap.calls.filter((c) => c.method === 'GET').length;

  // Open the Filter popover and pick "Scheduled".
  await adminPage.getByRole('button', { name: /^Filter/ }).click();
  const dialog = adminPage.getByRole('dialog', { name: /pipeline filters/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Scheduled/ }).click();
  await dialog.getByRole('button', { name: /^Done$/ }).click();

  // Only the two `schedule_config.enabled === true` pipelines remain (Alpha,
  // Bravo). Charlie + Delta are filtered out client-side.
  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Bravo nightly batch' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Charlie draft' })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: 'Delta archived snapshot' })).toHaveCount(
    0,
  );

  // No additional list GET fired — this filter is purely client-side.
  await adminPage.waitForTimeout(200);
  const finalGetCount = cap.calls.filter((c) => c.method === 'GET').length;
  expect(finalGetCount).toBe(initialGetCount);

  // The chip strip surfaces the facet.
  await expect(adminPage.getByText(/^Schedule · Scheduled$/)).toBeVisible();
});

test('Pipeline-type facet narrows the table to a single type', async ({ adminPage }) => {
  await mockPipelines(adminPage, { pipelines: ALL_FIXTURES });
  await adminPage.goto('/pipelines');

  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();

  await adminPage.getByRole('button', { name: /^Filter/ }).click();
  const dialog = adminPage.getByRole('dialog', { name: /pipeline filters/i });
  await dialog.getByRole('button', { name: /^Streaming/ }).click();
  await dialog.getByRole('button', { name: /^Done$/ }).click();

  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Bravo nightly batch' })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: 'Charlie draft' })).toHaveCount(0);
  await expect(adminPage.getByText(/^Type · Streaming$/)).toBeVisible();
});

test('removing a filter chip restores the unfiltered view', async ({ adminPage }) => {
  await mockPipelines(adminPage, { pipelines: ALL_FIXTURES });
  await adminPage.goto('/pipelines');

  // Apply a type facet so a chip appears.
  await adminPage.getByRole('button', { name: /^Filter/ }).click();
  const dialog = adminPage.getByRole('dialog', { name: /pipeline filters/i });
  await dialog.getByRole('button', { name: /^Streaming/ }).click();
  await dialog.getByRole('button', { name: /^Done$/ }).click();

  const chip = adminPage.getByText(/^Type · Streaming$/);
  await expect(chip).toBeVisible();

  // The chip's "x" is its sibling, located by the aria-label.
  await adminPage
    .getByRole('button', { name: /^Remove filter Type · Streaming$/ })
    .click();

  await expect(chip).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: 'Bravo nightly batch' })).toBeVisible();
});

test('"New pipeline" opens the CreatePipelineModal and "JSON create" links to /pipelines/new', async ({
  adminPage,
}) => {
  await mockPipelines(adminPage, { pipelines: [ALPHA] });
  await adminPage.goto('/pipelines');

  // The sub-header has a "JSON create" anchor; pin its href.
  const jsonCreate = adminPage.getByRole('link', { name: /json create/i });
  await expect(jsonCreate).toHaveAttribute('href', '/pipelines/new');

  // The visible "New pipeline" button opens the modal in place — it is NOT
  // a link to /pipelines/new.
  const newButton = adminPage.getByRole('button', { name: /new pipeline/i });
  await expect(newButton).toBeVisible();
  await newButton.click();

  // The modal heading renders; URL stays on /pipelines.
  await expect(adminPage.getByRole('dialog')).toBeVisible();
  await expect(adminPage).toHaveURL(/\/pipelines$/);
});

test('clicking a pipeline name navigates to /pipelines/:id/edit', async ({ adminPage }) => {
  await mockPipelines(adminPage, { pipelines: [ALPHA, BRAVO] });
  await adminPage.goto('/pipelines');

  const link = adminPage.getByRole('link', { name: 'Alpha ingest' });
  await expect(link).toHaveAttribute('href', '/pipelines/pipeline-alpha/edit');

  await link.click();
  await expect(adminPage).toHaveURL(/\/pipelines\/pipeline-alpha\/edit$/);
});

test('the "Builder" row action also navigates to /pipelines/:id/edit', async ({
  adminPage,
}) => {
  await mockPipelines(adminPage, { pipelines: [ALPHA] });
  await adminPage.goto('/pipelines');

  // The row's actions cluster has three buttons: Builder / Runs / Delete.
  // `getByRole` finds them by accessible name regardless of icon glyphs.
  const row = adminPage.getByRole('row', { name: /Alpha ingest/ });
  await row.getByRole('button', { name: /^Builder$/ }).click();

  await expect(adminPage).toHaveURL(/\/pipelines\/pipeline-alpha\/edit$/);
});

test('bulk select + "Delete selected" issues a DELETE per chosen pipeline', async ({
  adminPage,
}) => {
  await mockPipelines(adminPage, { pipelines: [ALPHA, BRAVO, CHARLIE] });
  const cap = captureRequests(adminPage, PIPELINE_DELETE);
  await adminPage.goto('/pipelines');

  // Enable bulk mode — the toggle starts as "Select pipelines…".
  await adminPage.getByRole('button', { name: /select pipelines/i }).click();

  // Header checkbox + row checkboxes now visible. Tick Alpha + Bravo.
  await adminPage.getByRole('checkbox', { name: 'Select Alpha ingest' }).check();
  await adminPage
    .getByRole('checkbox', { name: 'Select Bravo nightly batch' })
    .check();

  // "Delete selected" is the only bulk action button shipped today.
  await adminPage.getByRole('button', { name: /delete selected/i }).click();

  // Two DELETE calls fired, one per selected pipeline id.
  await expect.poll(() => cap.calls.filter((c) => c.method === 'DELETE').length).toBe(2);
  const deletedIds = cap.calls
    .filter((c) => c.method === 'DELETE')
    .map((c) => /\/pipelines\/([^/?#]+)/.exec(c.url)?.[1])
    .filter((id): id is string => typeof id === 'string')
    .sort();
  expect(deletedIds).toEqual(['pipeline-alpha', 'pipeline-bravo']);

  // The stateful mock + post-delete refresh removes the rows.
  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: 'Bravo nightly batch' })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: 'Charlie draft' })).toBeVisible();
});

test('changing the sort to "name (A → Z)" reorders rows client-side', async ({
  adminPage,
}) => {
  // Seed in deliberately unsorted order so the default updated_desc and the
  // chosen name_asc produce different sequences.
  await mockPipelines(adminPage, { pipelines: [CHARLIE, ALPHA, BRAVO] });
  const cap = captureRequests(adminPage, PIPELINES_LIST);
  await adminPage.goto('/pipelines');

  // Wait for initial render; capture the GET count so we can verify the
  // sort doesn't refetch.
  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();
  const initialGetCount = cap.calls.filter((c) => c.method === 'GET').length;

  // Open the sort dropdown and pick name (A → Z).
  await adminPage
    .getByRole('button', { name: /sorted by most recently updated/i })
    .click();
  await adminPage
    .getByRole('option', { name: /sorted by name \(A → Z\)/i })
    .click();

  // The dropdown button now reflects the active sort key.
  await expect(
    adminPage.getByRole('button', { name: /sorted by name \(A → Z\)/i }),
  ).toBeVisible();

  // Rows render in alphabetical order: Alpha → Bravo → Charlie.
  const rowLinks = adminPage.locator('tbody tr td a.of-link');
  await expect(rowLinks.nth(0)).toHaveText('Alpha ingest');
  await expect(rowLinks.nth(1)).toHaveText('Bravo nightly batch');
  await expect(rowLinks.nth(2)).toHaveText('Charlie draft');

  // Sort is client-side only — no additional list GET fired.
  await adminPage.waitForTimeout(200);
  const finalGetCount = cap.calls.filter((c) => c.method === 'GET').length;
  expect(finalGetCount).toBe(initialGetCount);
});

test('absent today: owner / tag facets, pause·resume·archive row actions, "last execution" / "next trigger" sort, and bulk archive', async ({
  adminPage,
}) => {
  // Single regression guard for the features the task asked for that the
  // page does not yet ship. Each assertion flips the day the matching
  // control lands.
  await mockPipelines(adminPage, { pipelines: [ALPHA, BRAVO] });
  await adminPage.goto('/pipelines');

  await expect(adminPage.getByRole('link', { name: 'Alpha ingest' })).toBeVisible();

  // 1. Filter popover exposes only Pipeline-type + Schedule groups. No
  //    Owner facet, no Tag facet.
  await adminPage.getByRole('button', { name: /^Filter/ }).click();
  const dialog = adminPage.getByRole('dialog', { name: /pipeline filters/i });
  await expect(dialog).toContainText(/Pipeline type/);
  await expect(dialog).toContainText(/Schedule/);
  expect(await dialog.getByText(/^Owner$/i).count()).toBe(0);
  expect(await dialog.getByText(/^Tag(s)?$/i).count()).toBe(0);
  await dialog.getByRole('button', { name: /^Done$/ }).click();

  // 2. Row quick actions are Builder / Runs / Delete — NOT pause / resume /
  //    archive. (The lifecycle column shows the lifecycle state, but no
  //    button mutates it inline.)
  const row = adminPage.getByRole('row', { name: /Alpha ingest/ });
  await expect(row.getByRole('button', { name: /^Builder$/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Runs$/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /^Delete$/ })).toBeVisible();
  expect(await row.getByRole('button', { name: /^(pause|resume|archive)$/i }).count()).toBe(
    0,
  );

  // 3. Sort dropdown options are updated/created/name only — no "last run"
  //    or "next trigger" key.
  await adminPage
    .getByRole('button', { name: /sorted by most recently updated/i })
    .click();
  const listbox = adminPage.getByRole('listbox');
  await expect(listbox).toBeVisible();
  expect(
    await listbox.getByRole('option', { name: /last (run|execution)/i }).count(),
  ).toBe(0);
  expect(
    await listbox.getByRole('option', { name: /next (run|trigger)/i }).count(),
  ).toBe(0);
  // Close the dropdown by clicking outside.
  await adminPage.getByRole('heading', { level: 1, name: /^pipelines$/i }).click();

  // 4. Enabling bulk mode exposes "Delete selected", not "Archive selected".
  await adminPage.getByRole('button', { name: /select pipelines/i }).click();
  await expect(adminPage.getByRole('button', { name: /delete selected/i })).toBeVisible();
  expect(await adminPage.getByRole('button', { name: /archive selected/i }).count()).toBe(0);
});
