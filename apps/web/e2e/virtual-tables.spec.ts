import { type Page, type Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/virtual-tables` and `/virtual-tables/:rid`
 * (apps/web/src/routes/virtual-tables/{VirtualTablesPage,VirtualTableDetailPage}.tsx).
 *
 * **Reality vs roadmap.** The Foundry pattern is to register virtual
 * tables FROM a Data Connection source — the list page itself is
 * read-only over `GET /v1/virtual-tables` and the detail page hangs
 * actions off of `POST /v1/virtual-tables/{rid}/{...}`. Several
 * requested controls do not ship today and are pinned by the regression
 * guards at the bottom of this file:
 *
 *   - No "+ New virtual table" button on `/virtual-tables`. Registration
 *     happens via the data-connection source detail; the page only
 *     surfaces a "→ Configure on a source" hint link.
 *   - No inline metadata edit on the list rows.
 *   - No delete-from-list confirm. Delete lives ONLY on the detail page
 *     (`vt-action-delete` → `vt-confirm-delete`).
 *   - The detail Query tab is a "Run preview" affordance over the
 *     pushdown plan, NOT a Monaco SQL editor with Validate / Save. The
 *     selector is auto-derived from the external reference.
 *   - The "Schedule refresh" feature is shipped as `Update detection`
 *     (interval in SECONDS via a number input), not a cron picker.
 *   - Lineage renders INLINE inside the `vt-tab-lineage` tab — it does
 *     NOT navigate to a separate `/lineage/...` page. The lineage data
 *     comes from `GET /v1/virtual-tables/{rid}/lineage`.
 *
 * Endpoints exercised (the `virtual-tables.ts` client embeds an extra
 * `/v1` segment on top of the global `/api/v1` base, so requests land
 * at `/api/v1/v1/virtual-tables…` — that's what the mocks have to
 * match):
 *   - GET    /api/v1/v1/virtual-tables                              (list + filters)
 *   - GET    /api/v1/v1/virtual-tables/{rid}                        (detail)
 *   - POST   /api/v1/v1/virtual-tables/{rid}/query                  (preview tab)
 *   - DELETE /api/v1/v1/virtual-tables/{rid}                        (delete confirm)
 *   - GET    /api/v1/v1/virtual-tables/{rid}/lineage                (lineage tab)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // The detail page makes its initial GET unconditionally — when a
      // test mocks an error response, React's error boundary logs to
      // console.error before the alert renders. The alert assertion
      // covers correctness; the console line is noise.
      /Failed to load virtual table/,
    ],
  },
});

const SOURCE_RID = 'ri.magritte..source.bigquery-eu';
const PROJECT_RID = 'ri.compass..project.analytics';
const VT_RID_A = 'ri.virtualtable..table.customers';
const VT_RID_B = 'ri.virtualtable..table.orders';
const VT_RID_C = 'ri.virtualtable..table.events_csv';

const E2E_NOW = '2026-05-11T00:00:00Z';

interface VirtualTableFixture {
  id: string;
  rid: string;
  source_rid: string;
  project_rid: string;
  name: string;
  parent_folder_rid: string | null;
  locator: Record<string, unknown>;
  table_type: string;
  schema_inferred: Array<{
    name: string;
    source_type: string;
    inferred_type: string;
    nullable: boolean;
  }>;
  capabilities: {
    read: boolean;
    write: boolean;
    incremental: boolean;
    versioning: boolean;
    compute_pushdown: 'ibis' | 'pyspark' | 'snowpark' | null;
    snapshot_supported: boolean;
    append_only_supported: boolean;
    foundry_compute: {
      python_single_node: boolean;
      python_spark: boolean;
      pipeline_builder_single_node: boolean;
      pipeline_builder_spark: boolean;
    };
  };
  update_detection_enabled: boolean;
  update_detection_interval_seconds: number | null;
  last_observed_version: string | null;
  last_polled_at: string | null;
  markings: string[];
  properties: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function makeVirtualTable(overrides: Partial<VirtualTableFixture> = {}): VirtualTableFixture {
  return {
    id: overrides.rid ?? VT_RID_A,
    rid: VT_RID_A,
    source_rid: SOURCE_RID,
    project_rid: PROJECT_RID,
    name: 'customers',
    parent_folder_rid: null,
    locator: { kind: 'tabular', database: 'warehouse', schema: 'public', table: 'customers' },
    table_type: 'TABLE',
    schema_inferred: [
      { name: 'id', source_type: 'INT64', inferred_type: 'integer', nullable: false },
      { name: 'email', source_type: 'STRING', inferred_type: 'string', nullable: true },
    ],
    capabilities: {
      read: true,
      write: true,
      incremental: true,
      versioning: false,
      compute_pushdown: 'ibis',
      snapshot_supported: true,
      append_only_supported: true,
      foundry_compute: {
        python_single_node: true,
        python_spark: true,
        pipeline_builder_single_node: false,
        pipeline_builder_spark: true,
      },
    },
    update_detection_enabled: false,
    update_detection_interval_seconds: null,
    last_observed_version: null,
    last_polled_at: null,
    markings: [],
    properties: { provider: 'BIGQUERY' },
    created_by: 'runner@example.com',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const CUSTOMERS = makeVirtualTable({
  id: VT_RID_A,
  rid: VT_RID_A,
  name: 'customers',
});

const ORDERS = makeVirtualTable({
  id: VT_RID_B,
  rid: VT_RID_B,
  name: 'orders',
  source_rid: 'ri.magritte..source.snowflake-prod',
  table_type: 'VIEW',
  locator: { kind: 'tabular', database: 'sales', schema: 'public', table: 'orders' },
  properties: { provider: 'SNOWFLAKE' },
  capabilities: {
    read: true,
    write: true,
    incremental: true,
    versioning: false,
    compute_pushdown: 'snowpark',
    snapshot_supported: true,
    append_only_supported: true,
    foundry_compute: {
      python_single_node: true,
      python_spark: true,
      pipeline_builder_single_node: false,
      pipeline_builder_spark: true,
    },
  },
});

const EVENTS_CSV = makeVirtualTable({
  id: VT_RID_C,
  rid: VT_RID_C,
  name: 'events_csv',
  source_rid: 'ri.magritte..source.s3-events',
  table_type: 'CSV_FILES',
  locator: { kind: 'file', bucket: 'events-prod', prefix: 'csv/', format: 'csv' },
  properties: { provider: 'AMAZON_S3' },
  update_detection_enabled: true,
  update_detection_interval_seconds: 3600,
  last_polled_at: E2E_NOW,
  last_observed_version: 'v42',
  capabilities: {
    read: true,
    write: true,
    incremental: false,
    versioning: false,
    compute_pushdown: null,
    snapshot_supported: false,
    append_only_supported: false,
    foundry_compute: {
      python_single_node: false,
      python_spark: false,
      pipeline_builder_single_node: false,
      pipeline_builder_spark: false,
    },
  },
});

/**
 * Mock `GET /api/v1/virtual-tables` with a server-side filter over
 * `project|source|name|type` query params (so the spec can assert the
 * page actually re-queries when a filter changes). All other methods
 * fall through to the catch-all.
 */
const VT_LIST_URL = /\/api\/v1\/v1\/virtual-tables(\?[^/]*)?$/;

async function mockVirtualTablesList(
  page: Page,
  items: VirtualTableFixture[],
): Promise<void> {
  await page.route(VT_LIST_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const project = url.searchParams.get('project') ?? '';
    const source = url.searchParams.get('source') ?? '';
    const name = url.searchParams.get('name') ?? '';
    const type = url.searchParams.get('type') ?? '';
    const filtered = items.filter((row) => {
      if (project && row.project_rid !== project) return false;
      if (source && row.source_rid !== source) return false;
      if (name && !row.name.toLowerCase().includes(name.toLowerCase())) return false;
      if (type && row.table_type !== type) return false;
      return true;
    });
    await route.fulfill({ json: { items: filtered, next_cursor: null } });
  });
}

function vtDetailUrl(rid: string): RegExp {
  // RID contains `.` which is a regex metachar — escape before embedding.
  return new RegExp(`/api/v1/v1/virtual-tables/${encodeURIComponent(rid).replace(/\./g, '\\.')}$`);
}

async function mockVirtualTableDetail(
  page: Page,
  item: VirtualTableFixture,
): Promise<void> {
  await page.route(vtDetailUrl(item.rid), async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: item });
      return;
    }
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

test('list: renders the mocked virtual tables grid with one row per item', async ({
  adminPage,
}) => {
  await mockVirtualTablesList(adminPage, [CUSTOMERS, ORDERS, EVENTS_CSV]);
  await adminPage.goto('/virtual-tables');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /virtual tables/i }),
  ).toBeVisible();
  await expect(adminPage.getByTestId('virtual-tables-grid')).toBeVisible();

  await expect(adminPage.getByRole('link', { name: 'customers' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'orders' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'events_csv' })).toBeVisible();

  // External-reference column joins locator parts: warehouse.public.customers
  await expect(adminPage.getByText('warehouse.public.customers')).toBeVisible();
  // Provider chip from row.properties.provider.
  await expect(adminPage.getByText('BigQuery').first()).toBeVisible();
});

test('list: filter by source rid re-queries with ?source= and syncs the URL', async ({
  adminPage,
}) => {
  await mockVirtualTablesList(adminPage, [CUSTOMERS, ORDERS, EVENTS_CSV]);
  const cap = captureRequests(adminPage, /\/api\/v1\/v1\/virtual-tables(\?|$)/);

  await adminPage.goto('/virtual-tables');
  await expect(adminPage.getByRole('link', { name: 'customers' })).toBeVisible();

  await adminPage.getByTestId('vt-filter-source').fill(ORDERS.source_rid);
  await adminPage.getByRole('button', { name: /^apply$/i }).click();

  // URL has the source filter persisted via setSearchParams.
  await expect(adminPage).toHaveURL(
    new RegExp(`\\?[^#]*source=${encodeURIComponent(ORDERS.source_rid).replace(/\./g, '\\.')}`),
  );

  // The server-side filter mock only returns the row that matches.
  await expect(adminPage.getByRole('link', { name: 'orders' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'customers' })).toHaveCount(0);

  // At least one GET fired with the source param.
  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'GET' && c.url.includes(`source=`)).length)
    .toBeGreaterThanOrEqual(1);
});

test('list: filter by table type select re-queries with ?type=', async ({ adminPage }) => {
  await mockVirtualTablesList(adminPage, [CUSTOMERS, ORDERS, EVENTS_CSV]);
  const cap = captureRequests(adminPage, /\/api\/v1\/v1\/virtual-tables(\?|$)/);

  await adminPage.goto('/virtual-tables');
  await expect(adminPage.getByRole('link', { name: 'customers' })).toBeVisible();

  // The select's onChange fires `applyFilters()` synchronously, which
  // closes over the pre-change state — so changing the value alone does
  // not actually re-query. A second Apply click flushes the new state
  // through `syncFiltersToUrl` + `refresh`.
  await adminPage.getByTestId('vt-filter-type').selectOption('VIEW');
  await adminPage.getByRole('button', { name: /^apply$/i }).click();

  await expect(adminPage).toHaveURL(/\?[^#]*type=VIEW/);
  await expect(adminPage.getByRole('link', { name: 'orders' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'customers' })).toHaveCount(0);

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'GET' && c.url.includes('type=VIEW')).length)
    .toBeGreaterThanOrEqual(1);
});

test('list: "Update detection on" checkbox filters rows client-side', async ({ adminPage }) => {
  await mockVirtualTablesList(adminPage, [CUSTOMERS, ORDERS, EVENTS_CSV]);

  await adminPage.goto('/virtual-tables');
  await expect(adminPage.getByRole('link', { name: 'customers' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'events_csv' })).toBeVisible();

  // Same stale-closure quirk as the type filter — check the box, then
  // click Apply to flush the new state through the filter pipeline.
  await adminPage.getByTestId('vt-filter-updates').check();
  await adminPage.getByRole('button', { name: /^apply$/i }).click();

  // Only EVENTS_CSV has update_detection_enabled === true.
  await expect(adminPage.getByRole('link', { name: 'events_csv' })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'customers' })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: 'orders' })).toHaveCount(0);
  await expect(adminPage).toHaveURL(/\?[^#]*updates=1/);
});

test('list: empty response renders the "no virtual tables yet" guidance', async ({
  adminPage,
}) => {
  await mockVirtualTablesList(adminPage, []);

  await adminPage.goto('/virtual-tables');

  await expect(adminPage.getByTestId('vt-empty')).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /go to data connection sources/i }),
  ).toBeVisible();
  // The grid is NOT rendered when items is empty.
  await expect(adminPage.getByTestId('virtual-tables-grid')).toHaveCount(0);
});

test('list: clicking a row link navigates to /virtual-tables/:rid', async ({ adminPage }) => {
  await mockVirtualTablesList(adminPage, [CUSTOMERS]);
  // Detail mock so the destination page also resolves without a 404 race.
  await mockVirtualTableDetail(adminPage, CUSTOMERS);

  await adminPage.goto('/virtual-tables');

  const link = adminPage.getByRole('link', { name: 'customers' });
  await expect(link).toHaveAttribute(
    'href',
    new RegExp(`^/virtual-tables/${encodeURIComponent(CUSTOMERS.rid).replace(/\./g, '\\.')}$`),
  );
  await link.click();

  await expect(adminPage).toHaveURL(
    new RegExp(`/virtual-tables/${encodeURIComponent(CUSTOMERS.rid).replace(/\./g, '\\.')}$`),
  );
  await expect(adminPage.getByTestId('vt-detail-page')).toBeVisible();
});

// ---------------------------------------------------------------------------
// DETAIL
// ---------------------------------------------------------------------------

test('detail: renders the header, capability chips, and Overview tab by default', async ({
  adminPage,
}) => {
  await mockVirtualTableDetail(adminPage, CUSTOMERS);

  await adminPage.goto(`/virtual-tables/${encodeURIComponent(CUSTOMERS.rid)}`);

  await expect(adminPage.getByTestId('vt-detail-page')).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: 'customers' }),
  ).toBeVisible();

  // Provider + table-type + capability chips.
  await expect(adminPage.getByText('BigQuery').first()).toBeVisible();
  await expect(adminPage.getByText('Table').first()).toBeVisible();
  await expect(adminPage.getByTestId('vt-detail-cap-chip').first()).toBeVisible();

  // Overview cards render the source rid + project rid + locator JSON.
  await expect(adminPage.getByTestId('vt-overview-source-link')).toContainText(SOURCE_RID);
  await expect(adminPage.getByTestId('vt-overview-project')).toContainText(PROJECT_RID);
  await expect(adminPage.getByTestId('vt-overview-locator')).toContainText('customers');

  // The detail page has 8 tabs.
  await expect(adminPage.getByTestId('vt-detail-tabs')).toBeVisible();
  for (const id of ['overview', 'schema', 'query', 'lineage', 'permissions', 'activity', 'update-detection', 'imports']) {
    await expect(adminPage.getByTestId(`vt-tab-${id}`)).toBeVisible();
  }
});

test('detail: Query tab "Run preview" POSTs /query and renders the returned rows', async ({
  adminPage,
}) => {
  await mockVirtualTableDetail(adminPage, CUSTOMERS);

  const queryUrl = new RegExp(
    `/api/v1/v1/virtual-tables/${encodeURIComponent(CUSTOMERS.rid).replace(/\./g, '\\.')}/query$`,
  );
  const cap = captureRequests(adminPage, queryUrl);

  await adminPage.route(queryUrl, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        selector: 'warehouse.public.customers',
        mode: 'direct',
        columns: ['id', 'email'],
        row_count: 2,
        rows: [
          { id: 1, email: 'alice@example.com' },
          { id: 2, email: 'bob@example.com' },
        ],
        metadata: {},
        compute_location: 'source_system',
        pushdown: {
          compute_location: 'source_system',
          pushdown_engine: 'ibis',
          foundry_engine: 'openfoundry_spark',
          pushed_operations: ['scan', 'limit'],
          foundry_operations: [],
          direct_query: true,
          uses_copied_dataset: false,
          interactive_preview: true,
        },
        limitations: [
          {
            code: 'interactive_performance',
            severity: 'info',
            message: 'Interactive reads query the external table directly.',
          },
        ],
      },
    });
  });

  await adminPage.goto(`/virtual-tables/${encodeURIComponent(CUSTOMERS.rid)}`);
  await adminPage.getByTestId('vt-tab-query').click();

  // Pre-run, the pushdown plan + selector hint are visible.
  await expect(adminPage.getByText(/Direct preview/i)).toBeVisible();
  await expect(adminPage.getByText('warehouse.public.customers').first()).toBeVisible();

  await adminPage.getByRole('button', { name: /run preview/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.body).toMatchObject({
    selector: 'warehouse.public.customers',
    limit: 50,
    requires_foundry_compute: false,
  });

  await expect(adminPage.getByText('alice@example.com')).toBeVisible();
  await expect(adminPage.getByText('bob@example.com')).toBeVisible();
  await expect(adminPage.getByText(/2 rows · direct/i)).toBeVisible();
});

test('detail: Delete button opens the confirm dialog, DELETEs, and redirects to /virtual-tables', async ({
  adminPage,
}) => {
  await mockVirtualTablesList(adminPage, [CUSTOMERS]);
  await mockVirtualTableDetail(adminPage, CUSTOMERS);

  const cap = captureRequests(adminPage, vtDetailUrl(CUSTOMERS.rid));

  await adminPage.goto(`/virtual-tables/${encodeURIComponent(CUSTOMERS.rid)}`);
  await expect(adminPage.getByRole('heading', { level: 1, name: 'customers' })).toBeVisible();

  await adminPage.getByTestId('vt-action-delete').click();

  const dialog = adminPage.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/delete virtual table/i)).toBeVisible();
  await expect(dialog.getByText(/the remote source table is not touched/i)).toBeVisible();

  await adminPage.getByTestId('vt-confirm-delete').click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'DELETE').length)
    .toBeGreaterThanOrEqual(1);

  // confirmDelete() navigates back to the list on success.
  await expect(adminPage).toHaveURL(/\/virtual-tables(\?|$)/);
});

test('detail: Lineage tab loads via GET /lineage and renders nodes + edges inline', async ({
  adminPage,
}) => {
  await mockVirtualTableDetail(adminPage, CUSTOMERS);

  const lineageUrl = new RegExp(
    `/api/v1/v1/virtual-tables/${encodeURIComponent(CUSTOMERS.rid).replace(/\./g, '\\.')}/lineage$`,
  );
  const cap = captureRequests(adminPage, lineageUrl);

  await adminPage.route(lineageUrl, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        virtual_table_rid: CUSTOMERS.rid,
        source_rid: CUSTOMERS.source_rid,
        update_detection_enabled: false,
        last_observed_version: null,
        nodes: [
          { rid: CUSTOMERS.source_rid, kind: 'source', display_name: 'BigQuery EU', status: 'connected' },
          { rid: CUSTOMERS.rid, kind: 'virtual_table', display_name: 'customers', status: 'active' },
          { rid: 'ri.compass..dataset.downstream', kind: 'dataset', display_name: 'downstream_dataset', status: 'ready' },
        ],
        edges: [
          { from_rid: CUSTOMERS.source_rid, to_rid: CUSTOMERS.rid, kind: 'backs' },
          { from_rid: CUSTOMERS.rid, to_rid: 'ri.compass..dataset.downstream', kind: 'feeds' },
        ],
        downstream_builds: [
          {
            target_rid: 'ri.compass..dataset.downstream',
            target_kind: 'dataset',
            display_name: 'downstream_dataset',
            action: 'skipped',
            reason: 'Update detection disabled.',
          },
        ],
      },
    });
  });

  await adminPage.goto(`/virtual-tables/${encodeURIComponent(CUSTOMERS.rid)}`);
  await adminPage.getByTestId('vt-tab-lineage').click();

  await expect(adminPage.getByTestId('vt-lineage-tab')).toBeVisible();

  // Lineage GET fires once on tab activation.
  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);

  // Node display names + edge endpoints render.
  await expect(adminPage.getByText('BigQuery EU').first()).toBeVisible();
  await expect(adminPage.getByText('downstream_dataset').first()).toBeVisible();
  // Downstream-build decision row.
  await expect(adminPage.getByText('Update detection disabled.')).toBeVisible();

  // Regression: the lineage tab does NOT navigate to a separate /lineage page.
  await expect(adminPage).toHaveURL(
    new RegExp(`/virtual-tables/${encodeURIComponent(CUSTOMERS.rid).replace(/\./g, '\\.')}$`),
  );
});

test('detail: Update detection tab exposes the toggle + interval (seconds), NOT a cron picker', async ({
  adminPage,
}) => {
  await mockVirtualTableDetail(adminPage, EVENTS_CSV);

  await adminPage.goto(`/virtual-tables/${encodeURIComponent(EVENTS_CSV.rid)}`);
  await adminPage.getByTestId('vt-tab-update-detection').click();

  await expect(adminPage.getByTestId('vt-details-panel')).toBeVisible();
  await expect(adminPage.getByTestId('vt-update-detection-toggle')).toBeChecked();
  await expect(adminPage.getByTestId('vt-update-detection-interval')).toHaveValue('3600');
  await expect(adminPage.getByTestId('vt-update-detection-poll-now')).toBeVisible();

  // Regression: no cron input on the page today.
  expect(await adminPage.getByPlaceholder(/cron/i).count()).toBe(0);
  expect(await adminPage.getByLabel(/^cron$/i).count()).toBe(0);
});

test('absent today: list-level Create / inline-edit / delete-confirm, and detail-level Monaco / Validate / Save / cron / Lineage page', async ({
  adminPage,
}) => {
  // Single regression guard for the requested controls that aren't shipped
  // yet. When each lands, the matching assertion flips and forces an update.
  await mockVirtualTablesList(adminPage, [CUSTOMERS, ORDERS]);
  await mockVirtualTableDetail(adminPage, CUSTOMERS);

  await adminPage.goto('/virtual-tables');
  await expect(adminPage.getByRole('link', { name: 'customers' })).toBeVisible();

  // 1. No "+ New virtual table" CTA — registration happens FROM a source.
  expect(
    await adminPage
      .getByRole('button', { name: /^(\+\s*)?(new|create)\s*(virtual\s*)?table/i })
      .count(),
  ).toBe(0);

  // 2. No inline metadata edit on rows.
  expect(await adminPage.getByRole('button', { name: /edit|rename/i }).count()).toBe(0);

  // 3. No delete-from-list confirm — DELETE only fires from the detail page.
  expect(
    await adminPage
      .getByRole('button', { name: /^delete$/i })
      .count(),
  ).toBe(0);

  // Detail-level regressions. Scope assertions to the page section so
  // they don't collide with AppShell chrome (the shell has its own
  // "Save" button on every authed page).
  await adminPage.goto(`/virtual-tables/${encodeURIComponent(CUSTOMERS.rid)}`);
  await expect(adminPage.getByRole('heading', { level: 1, name: 'customers' })).toBeVisible();
  await adminPage.getByTestId('vt-tab-query').click();
  const detail = adminPage.getByTestId('vt-detail-page');

  // 4. The query tab has NO Monaco editor today.
  expect(await detail.locator('.monaco-editor').count()).toBe(0);

  // 5. No "Validate" / "Save" buttons inside the detail page content.
  expect(await detail.getByRole('button', { name: /^validate$/i }).count()).toBe(0);
  expect(await detail.getByRole('button', { name: /^save$/i }).count()).toBe(0);

  // 6. No "View lineage" link that navigates AWAY — lineage is a tab on
  //    the same page. Confirm no anchor pointing at the standalone
  //    `/lineage/...` route is rendered from the detail page.
  expect(await detail.locator('a[href^="/lineage"]').count()).toBe(0);
});
