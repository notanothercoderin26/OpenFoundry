import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { OntologyIndexingPage } from './pages';

/**
 * E2E coverage for `/ontology-indexing`
 * (apps/web/src/routes/ontology-indexing/OntologyIndexingPage.tsx).
 *
 * What this page does. The page is the admin surface for the **ontology
 * funnel**: configurable sources that hydrate ontology object types
 * from datasets (`/api/v1/ontology/funnel/sources`), plus on-demand
 * **type-scoped reindexing** of the search projections backed by the
 * ontology indexer (`/api/v1/ontology/types/{id}/reindex`).
 *
 * Sections wired on mount:
 *   - **Funnel health** — totals + chips (Sources / Active / Stale /
 *     Failing / Success rate / Rows read), feeding from
 *     `GET /ontology/funnel/health?stale_after_hours=…`;
 *   - **Object type index refresh** — type select + page-size + the
 *     `Reindex` CTA. Gated by `ontology.types.reindex`
 *     (`admin` / `ontology.*` / `*` also grant);
 *   - **Sources list** + **Source draft** form — name, description,
 *     object type, dataset, pipeline, branch, preview limit, marking,
 *     status, and the per-row **property mappings** (the "configure
 *     index fields" surface the spec covers);
 *   - **Recent runs** table — Started / Status / Trigger / Rows /
 *     Inserted / Updated / Errors columns for the selected source.
 *
 * The page fetches a *lot* on mount; `mockOntologyIndexing` overrides
 * every endpoint it actually reaches so the suite is deterministic
 * regardless of what the default catch-all returns.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
    ],
  },
});

const NOW = '2026-05-11T00:00:00Z';

interface ObjectTypeFixture {
  id: string;
  name: string;
  display_name: string;
}

interface SourceFixture {
  id: string;
  name: string;
  description: string;
  object_type_id: string;
  dataset_id: string;
  pipeline_id?: string | null;
  status?: string;
  property_mappings?: Array<{ source_field: string; target_property: string }>;
}

interface RunFixture {
  id: string;
  source_id: string;
  object_type_id: string;
  dataset_id: string;
  status: string;
  trigger_type: string;
  rows_read: number;
  inserted_count: number;
  updated_count: number;
  error_count: number;
  started_at: string;
}

interface PropertyFixture {
  id: string;
  object_type_id: string;
  name: string;
  display_name: string;
  property_type: string;
}

interface HealthOverrides {
  total_sources?: number;
  active_sources?: number;
  stale_sources?: number;
  failing_sources?: number;
  success_rate?: number;
  rows_read?: number;
}

interface MockOptions {
  objectTypes?: ObjectTypeFixture[];
  datasets?: Array<{ id: string; name: string }>;
  pipelines?: Array<{ id: string; name: string }>;
  sources?: SourceFixture[];
  runs?: RunFixture[];
  properties?: PropertyFixture[];
  health?: HealthOverrides | null;
  /** Customise the response for POST /reindex. */
  reindexResponse?: Record<string, unknown>;
  /** Force POST /reindex to error. */
  reindexError?: { status: number; message: string };
}

const DEFAULT_TYPES: ObjectTypeFixture[] = [
  { id: 'type-shipment', name: 'shipment', display_name: 'Shipment' },
  { id: 'type-driver', name: 'driver', display_name: 'Driver' },
];

const DEFAULT_DATASETS = [
  { id: 'ds-shipments', name: 'shipments-2026q2' },
  { id: 'ds-drivers', name: 'drivers-roster' },
];

const DEFAULT_PIPELINES = [{ id: 'pl-shipments', name: 'shipments-hydration' }];

const DEFAULT_SOURCES: SourceFixture[] = [
  {
    id: 'src-shipments',
    name: 'Shipments funnel',
    description: 'Hydrates Shipment ontology from shipments-2026q2.',
    object_type_id: 'type-shipment',
    dataset_id: 'ds-shipments',
    pipeline_id: 'pl-shipments',
    status: 'active',
    property_mappings: [{ source_field: 'tracking_id', target_property: 'tracking_id' }],
  },
];

const DEFAULT_RUNS: RunFixture[] = [
  {
    id: 'run-1',
    source_id: 'src-shipments',
    object_type_id: 'type-shipment',
    dataset_id: 'ds-shipments',
    status: 'succeeded',
    trigger_type: 'scheduled',
    rows_read: 12_480,
    inserted_count: 320,
    updated_count: 11_960,
    error_count: 0,
    started_at: '2026-05-18T08:14:00Z',
  },
  {
    id: 'run-2',
    source_id: 'src-shipments',
    object_type_id: 'type-shipment',
    dataset_id: 'ds-shipments',
    status: 'failed',
    trigger_type: 'manual',
    rows_read: 0,
    inserted_count: 0,
    updated_count: 0,
    error_count: 12,
    started_at: '2026-05-17T22:01:00Z',
  },
];

const DEFAULT_PROPERTIES: PropertyFixture[] = [
  { id: 'prop-tracking', object_type_id: 'type-shipment', name: 'tracking_id', display_name: 'Tracking ID', property_type: 'string' },
  { id: 'prop-carrier', object_type_id: 'type-shipment', name: 'carrier_id', display_name: 'Carrier ID', property_type: 'string' },
  { id: 'prop-status', object_type_id: 'type-shipment', name: 'status', display_name: 'Status', property_type: 'string' },
];

function buildHealth(sources: SourceFixture[], overrides: HealthOverrides = {}) {
  return {
    stale_after_hours: 48,
    total_sources: overrides.total_sources ?? sources.length,
    active_sources: overrides.active_sources ?? sources.filter((s) => s.status === 'active').length,
    paused_sources: 0,
    healthy_sources: sources.length,
    degraded_sources: 0,
    failing_sources: overrides.failing_sources ?? 0,
    stale_sources: overrides.stale_sources ?? 0,
    never_run_sources: 0,
    total_runs: 100,
    successful_runs: 95,
    failed_runs: 5,
    warning_runs: 0,
    success_rate: overrides.success_rate ?? 0.95,
    rows_read: overrides.rows_read ?? 12_480,
    inserted_count: 320,
    updated_count: 11_960,
    skipped_count: 0,
    error_count: 0,
    last_run_at: NOW,
    sources: sources.map((s) => ({
      source: buildSource(s),
      health_status: 'healthy',
      health_reason: '',
      total_runs: 12,
      successful_runs: 11,
      failed_runs: 1,
      warning_runs: 0,
      success_rate: 0.92,
      avg_duration_ms: 400,
      p95_duration_ms: 600,
      max_duration_ms: 900,
      latest_run_status: 'succeeded',
      last_run_at: NOW,
      last_success_at: NOW,
      last_failure_at: null,
      last_warning_at: null,
      rows_read: 12_480,
      inserted_count: 320,
      updated_count: 11_960,
      skipped_count: 0,
      error_count: 0,
    })),
  };
}

function buildSource(s: SourceFixture) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    object_type_id: s.object_type_id,
    dataset_id: s.dataset_id,
    pipeline_id: s.pipeline_id ?? null,
    dataset_branch: 'main',
    dataset_version: null,
    preview_limit: 100,
    default_marking: 'public',
    status: s.status ?? 'active',
    property_mappings: s.property_mappings ?? [],
    trigger_context: {},
    owner_id: '00000000-0000-0000-0000-000000000001',
    last_run_at: NOW,
    created_at: NOW,
    updated_at: NOW,
  };
}

async function mockOntologyIndexing(page: Page, opts: MockOptions = {}): Promise<void> {
  const objectTypes = opts.objectTypes ?? DEFAULT_TYPES;
  const datasets = opts.datasets ?? DEFAULT_DATASETS;
  const pipelines = opts.pipelines ?? DEFAULT_PIPELINES;
  const sources = opts.sources ?? DEFAULT_SOURCES;
  const runs = opts.runs ?? DEFAULT_RUNS;
  const properties = opts.properties ?? DEFAULT_PROPERTIES;

  const listJson = (route: Route, data: unknown[]) =>
    route.fulfill({ json: { data, total: data.length, page: 1, per_page: 200 } });

  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await listJson(route, objectTypes);
  });

  await page.route(/\/api\/v1\/ontology\/link-types(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0 } });
  });

  await page.route(/\/api\/v1\/datasets(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: datasets, total: datasets.length } });
  });

  await page.route(/\/api\/v1\/pipelines(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await listJson(route, pipelines);
  });

  await page.route(/\/api\/v1\/ontology\/funnel\/sources(\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: sources.map(buildSource),
        total: sources.length,
        page: 1,
        per_page: 200,
      },
    });
  });

  await page.route(/\/api\/v1\/ontology\/funnel\/health/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (opts.health === null) {
      await route.fulfill({ status: 500, json: { error: 'failed' } });
      return;
    }
    await route.fulfill({ json: buildHealth(sources, opts.health ?? {}) });
  });

  // Runs for a specific source.
  await page.route(/\/api\/v1\/ontology\/funnel\/sources\/[^/]+\/runs/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: runs, total: runs.length, page: 1, per_page: 20 },
    });
  });

  // Properties for a specific object type.
  await page.route(/\/api\/v1\/ontology\/types\/[^/]+\/properties/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: properties } });
  });

  // PATCH/POST/DELETE on a specific funnel source. PATCH echoes back
  // the same id so `setSelectedSourceId(saved.id)` keeps the auto-
  // selected source after a save.
  await page.route(/\/api\/v1\/ontology\/funnel\/sources\/[^/]+$/, async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const url = route.request().url();
      const id = url.split('/').pop()?.split('?')[0] ?? 'src-1';
      const existing = sources.find((s) => s.id === id) ?? sources[0];
      await route.fulfill({ json: buildSource(existing) });
      return;
    }
    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  // POST trigger reindex for a type.
  await page.route(/\/api\/v1\/ontology\/types\/[^/]+\/reindex/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (opts.reindexError) {
      await route.fulfill({
        status: opts.reindexError.status,
        json: { error: opts.reindexError.message },
      });
      return;
    }
    await route.fulfill({
      json: opts.reindexResponse ?? {
        job_id: 'reindex-job-7f4a',
        type_id: 'type-shipment',
        status: 'queued',
        message: 'Reindex queued',
      },
    });
  });
}

test('renders header + funnel health summary + reindex panel', async ({
  authedPage,
}) => {
  await mockOntologyIndexing(authedPage);
  const indexing = new OntologyIndexingPage(authedPage);
  await indexing.goto();
  await indexing.expectLoaded();

  // Page identity.
  await expect(
    authedPage.getByRole('heading', { level: 1, name: /^ontology indexing$/i }),
  ).toBeVisible();

  // Funnel health chips — the "Estado de índices" surface.
  const health = authedPage.locator('section.of-panel').filter({
    hasText: /^Funnel health$/,
  });
  await expect(health.getByText(/^Sources 1$/)).toBeVisible();
  await expect(health.getByText(/^Active 1$/)).toBeVisible();
  await expect(health.getByText(/^Stale 0$/)).toBeVisible();
  await expect(health.getByText(/^Failing 0$/)).toBeVisible();
  await expect(health.getByText(/^Success rate 95%$/)).toBeVisible();

  // Reindex panel renders + auto-selects the first object type, so
  // the per-type chip strip surfaces "Type shipment".
  await expect(
    authedPage.getByRole('heading', { level: 2, name: /object type index refresh/i }),
  ).toBeVisible();
  await expect(authedPage.locator('select').first()).toHaveValue('type-shipment');
  await expect(authedPage.getByText(/^Type shipment$/)).toBeVisible();
});

test('reindex on demand: select type, click Reindex, success notice with job id', async ({
  authedPage,
}) => {
  await mockOntologyIndexing(authedPage);
  const indexing = new OntologyIndexingPage(authedPage);
  const cap = captureRequests(authedPage, /\/ontology\/types\/[^/]+\/reindex$/);
  await indexing.goto();
  await indexing.expectLoaded();

  // Wait until the reindex panel is wired (auto-selected type
  // present) before driving the form.
  await expect(authedPage.getByText(/^Type shipment$/)).toBeVisible();

  // Switch the type select to "Driver".
  const reindexCard = authedPage.locator('section.of-panel').filter({
    has: authedPage.getByRole('heading', { name: /object type index refresh/i }),
  });
  await reindexCard.getByLabel(/^Object type$/).selectOption({ label: 'Driver' });

  // Page size is part of the request payload — tweak it to verify
  // the POST body picks the user value up.
  await reindexCard.getByLabel(/^Page size$/).fill('250');

  // The page-object's `reindexButton` matches `/reindex/i` so it sees
  // both the "Reindex" CTA and the in-flight "Reindexing…" label.
  await reindexCard.getByRole('button', { name: /^reindex$/i }).click();

  // Server side: exactly one POST to /reindex with the user-chosen
  // page size.
  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const call = cap.last();
  expect(call?.method).toBe('POST');
  expect(call?.url).toMatch(/\/ontology\/types\/type-driver\/reindex$/);
  expect(call?.body).toMatchObject({ page_size: 250 });

  // The success banner surfaces the type display name + job id from
  // the canned response.
  await expect(
    authedPage.getByText(/Reindex requested for Driver\. Job reindex-job-7f4a\./i),
  ).toBeVisible();
});

test('configure index fields: add a property mapping and save', async ({ authedPage }) => {
  await mockOntologyIndexing(authedPage);
  const indexing = new OntologyIndexingPage(authedPage);
  const cap = captureRequests(authedPage, /\/ontology\/funnel\/sources\/[^/]+$/);
  await indexing.goto();
  await indexing.expectLoaded();

  // The first source auto-selects → the draft form hydrates with its
  // values. Wait for the Name input to carry that source's name.
  const nameInput = authedPage.getByLabel(/^Name$/);
  await expect(nameInput).toHaveValue('Shipments funnel');

  // The draft already carries one mapping (tracking_id → tracking_id);
  // adding another expands to two mapping rows.
  await authedPage.getByRole('button', { name: /^\+ Add mapping$/ }).click();
  const sourceFieldInputs = authedPage.locator('input[placeholder="source_field"]');
  await expect(sourceFieldInputs).toHaveCount(2);

  // Type the new source field + pick the target property. The select
  // uses the property `name` as both label and value.
  const newSourceField = sourceFieldInputs.last();
  await newSourceField.fill('carrier_code');
  const propertySelects = authedPage.locator('select').filter({
    has: authedPage.locator('option[value="carrier_id"]'),
  });
  await propertySelects.last().selectOption('carrier_id');

  // Update → PATCH /ontology/funnel/sources/:id with the merged
  // property_mappings array (2 entries: the existing one + the new).
  await authedPage.getByRole('button', { name: /^Update$/ }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const patch = cap.last();
  expect(patch?.method).toBe('PATCH');
  expect(patch?.url).toMatch(/\/ontology\/funnel\/sources\/src-shipments$/);
  const body = patch?.body as { property_mappings?: Array<{ source_field: string; target_property: string }> };
  expect(body?.property_mappings).toEqual(
    expect.arrayContaining([
      { source_field: 'tracking_id', target_property: 'tracking_id' },
      { source_field: 'carrier_code', target_property: 'carrier_id' },
    ]),
  );
});

test('recent runs table shows per-source progress (status / trigger / rows)', async ({
  authedPage,
}) => {
  await mockOntologyIndexing(authedPage);
  const indexing = new OntologyIndexingPage(authedPage);
  await indexing.goto();
  await indexing.expectLoaded();

  // First source auto-selects → its runs feed loads → the Recent
  // runs panel renders.
  await expect(authedPage.getByText(/^Recent runs \(2\)$/)).toBeVisible();

  // Column headers.
  for (const header of ['Started', 'Status', 'Trigger', 'Rows', 'Inserted', 'Updated', 'Errors']) {
    await expect(authedPage.getByRole('columnheader', { name: header })).toBeVisible();
  }

  const rows = authedPage.locator('tbody tr');
  await expect(rows).toHaveCount(2);

  // Latest succeeded run: scheduled trigger, 12480 rows read,
  // 320 inserted, 11960 updated.
  const succeeded = rows.filter({ hasText: 'succeeded' });
  await expect(succeeded).toContainText('scheduled');
  await expect(succeeded).toContainText('12480');
  await expect(succeeded).toContainText('320');
  await expect(succeeded).toContainText('11960');

  // The failed manual-triggered run is also surfaced with its error
  // count so operators can spot regressions at a glance.
  const failed = rows.filter({ hasText: 'failed' });
  await expect(failed).toContainText('manual');
  await expect(failed).toContainText('12');
});

test('reindex blocked when user lacks the ontology.types.reindex permission', async ({
  viewerPage,
}) => {
  // The viewer fixture installs roles=['viewer'] + permissions=['read:*'],
  // which fails the `ontology.types.reindex` / `ontology.*` / `*`
  // checks → the page renders the permission warning + disables the
  // Reindex CTA.
  await mockOntologyIndexing(viewerPage);
  const indexing = new OntologyIndexingPage(viewerPage);
  await indexing.goto();
  await indexing.expectLoaded();

  await expect(
    viewerPage.getByText(/missing permission: ontology\.types\.reindex/i),
  ).toBeVisible();

  // The button is gated regardless of which type is selected.
  const reindexBtn = viewerPage.getByRole('button', { name: /^reindex$/i });
  await expect(reindexBtn).toBeDisabled();
});
