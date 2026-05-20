import { type Page, type Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/object-databases`
 * (apps/web/src/routes/object-databases/ObjectDatabasesPage.tsx).
 *
 * **Reality vs roadmap.** Despite the name, the shipped page is a
 * **read-only OSv2 storage insights dashboard** — it visualises the
 * PostgreSQL-backed ontology runtime (object/link rows, search
 * projections, Funnel hydration, table inventory, indexes) instead of
 * letting the user CRUD database connections. The whole page is fed
 * by a single endpoint:
 *
 *     GET /api/v1/ontology/storage/insights
 *
 * The wishlist controls (create-database modal, connection config form
 * for Postgres/Cassandra/etc., test-connection button, edit/delete
 * row actions, connected/disconnected status indicator) do not ship
 * today and are pinned by the regression guard at the bottom of this
 * file.
 *
 * What this spec covers:
 *   - Page renders headline KPIs + storage runtime card.
 *   - Table inventory grid renders the mocked rows with role chips.
 *   - Role tab filter narrows the table list and updates the chip count.
 *   - Local search input filters tables by label/table_name.
 *   - Selecting a different table updates the detail panel + index list.
 *   - Refresh insights button re-issues the GET.
 *   - Error response from the API surfaces the alert + suppresses the
 *     dashboard.
 *   - Empty-distribution sections show their "no data yet" placeholders.
 *   - Single "absent today" regression guard for the wishlist controls.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Failed to load object database insights/,
    ],
  },
});

const INSIGHTS_URL = /\/api\/v1\/ontology\/storage\/insights$/;

interface TableMetric {
  key: string;
  table_name: string;
  label: string;
  role: string;
  record_count: number;
}

interface IndexDefinition {
  table_name: string;
  index_name: string;
  index_definition: string;
}

interface DistributionMetric {
  id: string;
  label: string;
  count: number;
}

interface SearchKindMetric {
  kind: string;
  count: number;
}

interface Insights {
  database_backend: string;
  access_driver: string;
  graph_projection: string;
  search_projection: string;
  funnel_runtime: string;
  table_metrics: TableMetric[];
  index_definitions: IndexDefinition[];
  object_type_distribution: DistributionMetric[];
  link_type_distribution: DistributionMetric[];
  search_documents_total: number;
  search_documents_by_kind: SearchKindMetric[];
  latest_object_write_at: string | null;
  latest_link_write_at: string | null;
  latest_funnel_run_at: string | null;
}

function makeInsights(overrides: Partial<Insights> = {}): Insights {
  return {
    database_backend: 'PostgreSQL 16',
    access_driver: 'sqlx',
    graph_projection: 'JanusGraph',
    search_projection: 'Elasticsearch',
    funnel_runtime: 'OpenFoundry Funnel',
    table_metrics: [
      {
        key: 'object_instances',
        table_name: 'ontology_object_instances',
        label: 'Object instances',
        role: 'Runtime',
        record_count: 1_240_000,
      },
      {
        key: 'link_instances',
        table_name: 'ontology_link_instances',
        label: 'Link instances',
        role: 'Runtime',
        record_count: 980_500,
      },
      {
        key: 'object_types',
        table_name: 'ontology_object_types',
        label: 'Object types',
        role: 'Schema',
        record_count: 87,
      },
      {
        key: 'funnel_sources',
        table_name: 'ontology_funnel_sources',
        label: 'Funnel sources',
        role: 'Ingestion',
        record_count: 14,
      },
      {
        key: 'funnel_runs',
        table_name: 'ontology_funnel_runs',
        label: 'Funnel runs',
        role: 'Ingestion',
        record_count: 3_204,
      },
      {
        key: 'projects',
        table_name: 'ontology_projects',
        label: 'Projects',
        role: 'Governance',
        record_count: 22,
      },
    ],
    index_definitions: [
      {
        table_name: 'ontology_object_instances',
        index_name: 'idx_object_instances_type_id',
        index_definition:
          'CREATE INDEX idx_object_instances_type_id ON ontology_object_instances (object_type_id)',
      },
      {
        table_name: 'ontology_link_instances',
        index_name: 'idx_link_instances_from_id',
        index_definition:
          'CREATE INDEX idx_link_instances_from_id ON ontology_link_instances (from_object_id)',
      },
      {
        table_name: 'ontology_object_instances',
        index_name: 'idx_object_instances_updated_at',
        index_definition:
          'CREATE INDEX idx_object_instances_updated_at ON ontology_object_instances (updated_at DESC)',
      },
    ],
    object_type_distribution: [
      { id: 'aircraft', label: 'Aircraft', count: 540_000 },
      { id: 'customer', label: 'Customer', count: 320_000 },
      { id: 'order', label: 'Order', count: 380_000 },
    ],
    link_type_distribution: [
      { id: 'placed_by', label: 'placed_by', count: 380_000 },
      { id: 'assigned_to', label: 'assigned_to', count: 600_500 },
    ],
    search_documents_total: 1_820_000,
    search_documents_by_kind: [
      { kind: 'object_instance', count: 1_240_000 },
      { kind: 'link_instance', count: 580_000 },
    ],
    latest_object_write_at: '2026-05-11T09:24:55Z',
    latest_link_write_at: '2026-05-11T09:18:02Z',
    latest_funnel_run_at: '2026-05-11T08:50:13Z',
    ...overrides,
  };
}

async function mockInsights(page: Page, body: Insights): Promise<void> {
  await page.route(INSIGHTS_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: body });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the header, headline KPIs, and storage runtime card', async ({ adminPage }) => {
  await mockInsights(adminPage, makeInsights());
  await adminPage.goto('/object-databases');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /object databases/i }),
  ).toBeVisible();

  // The four headline KPI cards render their `of-eyebrow` labels.
  for (const label of [
    /object rows/i,
    /link rows/i,
    /search documents/i,
    /funnel sources/i,
  ]) {
    await expect(adminPage.getByText(label).first()).toBeVisible();
  }

  // Storage runtime aside surfaces the backend + drivers from the mock.
  await expect(adminPage.getByText('PostgreSQL 16')).toBeVisible();
  await expect(adminPage.getByText('sqlx')).toBeVisible();
  await expect(adminPage.getByText('JanusGraph')).toBeVisible();
  await expect(adminPage.getByText('Elasticsearch')).toBeVisible();
});

test('renders the table inventory grid with role chips and row counts', async ({ adminPage }) => {
  await mockInsights(adminPage, makeInsights());
  await adminPage.goto('/object-databases');

  // Every mocked table label resolves to a row-trigger button.
  for (const label of [
    'Object instances',
    'Link instances',
    'Object types',
    'Funnel sources',
    'Funnel runs',
    'Projects',
  ]) {
    await expect(adminPage.getByRole('button', { name: label, exact: true })).toBeVisible();
  }

  // Role chips render for each row's role.
  await expect(adminPage.getByText('Runtime').first()).toBeVisible();
  await expect(adminPage.getByText('Schema').first()).toBeVisible();
  await expect(adminPage.getByText('Ingestion').first()).toBeVisible();
  await expect(adminPage.getByText('Governance').first()).toBeVisible();

  // The chip on the right of the toolbar reports the table count (6 mocked).
  await expect(adminPage.getByText(/^6 tables$/)).toBeVisible();
});

test('role tab filter narrows the inventory and the table-count chip', async ({ adminPage }) => {
  await mockInsights(adminPage, makeInsights());
  await adminPage.goto('/object-databases');

  // Start with all 6 tables.
  await expect(adminPage.getByText(/^6 tables$/)).toBeVisible();

  await adminPage.getByRole('tab', { name: /^ingestion$/i }).click();

  // Only the two Ingestion rows remain.
  await expect(adminPage.getByText(/^2 tables$/)).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Funnel sources', exact: true })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Funnel runs', exact: true })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Object instances', exact: true })).toHaveCount(0);

  // Back to "All" restores the full list.
  await adminPage.getByRole('tab', { name: /^all$/i }).click();
  await expect(adminPage.getByText(/^6 tables$/)).toBeVisible();
});

test('search input filters tables locally by label/table_name', async ({ adminPage }) => {
  await mockInsights(adminPage, makeInsights());
  const cap = captureRequests(adminPage, INSIGHTS_URL);

  await adminPage.goto('/object-databases');
  await expect(adminPage.getByText(/^6 tables$/)).toBeVisible();

  const callsBeforeSearch = cap.calls.filter((c) => c.method === 'GET').length;

  await adminPage.getByPlaceholder(/filter tables or indexes/i).fill('funnel');

  await expect(adminPage.getByText(/^2 tables$/)).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Funnel sources', exact: true })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Funnel runs', exact: true })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Object instances', exact: true })).toHaveCount(0);

  // Filtering is local — no extra GET fires.
  await adminPage.waitForTimeout(200);
  const callsAfterSearch = cap.calls.filter((c) => c.method === 'GET').length;
  expect(callsAfterSearch).toBe(callsBeforeSearch);
});

test('selecting a different row updates the detail panel + related indexes', async ({
  adminPage,
}) => {
  await mockInsights(adminPage, makeInsights());
  await adminPage.goto('/object-databases');

  // Scope to the right-hand "Selected database surface" article so we
  // don't collide with the global "Database access paths" section at
  // the bottom of the page, which lists every index definition.
  const detail = adminPage
    .locator('article')
    .filter({ hasText: /selected database surface/i });

  // First row (Object instances) is selected by default — two mocked
  // indexes target ontology_object_instances. Use exact match so the
  // bold `<p>` heading wins over the prose `<p>` that contains the
  // full CREATE INDEX statement.
  await expect(detail.getByText('idx_object_instances_type_id', { exact: true })).toBeVisible();
  await expect(detail.getByText('idx_object_instances_updated_at', { exact: true })).toBeVisible();
  await expect(detail.getByText('idx_link_instances_from_id', { exact: true })).toHaveCount(0);

  // Click the Link instances row trigger.
  await adminPage.getByRole('button', { name: 'Link instances', exact: true }).click();

  // The detail panel switches to the link table, including its single index.
  await expect(detail.getByRole('heading', { level: 2, name: 'Link instances' })).toBeVisible();
  await expect(detail.getByText('idx_link_instances_from_id', { exact: true })).toBeVisible();
  // The Object instances indexes disappear from the Related indexes block.
  await expect(detail.getByText('idx_object_instances_type_id', { exact: true })).toHaveCount(0);
});

test('"Refresh insights" button re-issues the GET', async ({ adminPage }) => {
  await mockInsights(adminPage, makeInsights());
  const cap = captureRequests(adminPage, INSIGHTS_URL);

  await adminPage.goto('/object-databases');
  await expect(adminPage.getByText(/^6 tables$/)).toBeVisible();

  const initial = cap.calls.filter((c) => c.method === 'GET').length;
  expect(initial).toBeGreaterThanOrEqual(1);

  await adminPage.getByRole('button', { name: /refresh insights/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'GET').length)
    .toBeGreaterThanOrEqual(initial + 1);
});

test('API error surfaces the alert and hides the dashboard sections', async ({ adminPage }) => {
  await adminPage.route(INSIGHTS_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 500, json: { error: 'storage backend unavailable' } });
  });

  await adminPage.goto('/object-databases');

  // The header always renders; the alert appears once the GET rejects.
  await expect(adminPage.getByRole('alert')).toBeVisible();
  await expect(adminPage.getByRole('alert')).toContainText('storage backend unavailable');

  // The dashboard sections (which need a non-null `insights`) are NOT
  // rendered when the GET fails.
  await expect(adminPage.getByText(/^6 tables$/)).toHaveCount(0);
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /persistent storage inventory/i }),
  ).toHaveCount(0);
});

test('empty distributions render the "no … yet" placeholders', async ({ adminPage }) => {
  await mockInsights(
    adminPage,
    makeInsights({
      object_type_distribution: [],
      link_type_distribution: [],
      search_documents_by_kind: [],
      index_definitions: [],
    }),
  );
  await adminPage.goto('/object-databases');

  await expect(adminPage.getByText(/^no object rows yet$/i)).toBeVisible();
  await expect(adminPage.getByText(/^no link rows yet$/i)).toBeVisible();
  await expect(adminPage.getByText(/no search projection documents/i)).toBeVisible();
  await expect(adminPage.getByText(/no database index metadata reported/i)).toBeVisible();
});

test('absent today: create-database modal, connection config form, test-connection, edit/delete, connected/disconnected status', async ({
  adminPage,
}) => {
  // Single regression guard for the wishlist controls that are NOT
  // part of the current OSv2 insights dashboard. When any of these
  // ships, the matching assertion flips and forces an update.
  await mockInsights(adminPage, makeInsights());
  await adminPage.goto('/object-databases');
  await expect(adminPage.getByText(/^6 tables$/)).toBeVisible();

  const main = adminPage.getByRole('main');

  // 1. No primary CTA to create a database / connection.
  expect(
    await main
      .getByRole('button', { name: /^(\+\s*)?(new|create|add).*(database|connection|source)/i })
      .count(),
  ).toBe(0);

  // 2. No modal/dialog opens unprompted, and there's no trigger that
  //    would open one.
  expect(await adminPage.getByRole('dialog').count()).toBe(0);

  // 3. No connection config form — no provider/type selector for
  //    Postgres/Cassandra/etc., and no credential fields.
  expect(
    await adminPage
      .getByRole('combobox', { name: /database type|provider|engine/i })
      .count(),
  ).toBe(0);
  expect(await adminPage.getByLabel(/password|username|secret|api key/i).count()).toBe(0);

  // 4. No Test connection button.
  expect(await adminPage.getByRole('button', { name: /test connection/i }).count()).toBe(0);

  // 5. No per-row Edit / Delete actions.
  expect(await main.getByRole('button', { name: /^edit$/i }).count()).toBe(0);
  expect(await main.getByRole('button', { name: /^delete$/i }).count()).toBe(0);

  // 6. No connected / disconnected / online / offline status chip.
  //    (The page does surface backend/driver labels, but never a
  //    health indicator.)
  expect(await main.getByText(/^connected$/i).count()).toBe(0);
  expect(await main.getByText(/^disconnected$/i).count()).toBe(0);
  expect(await main.getByText(/^offline$/i).count()).toBe(0);
});
