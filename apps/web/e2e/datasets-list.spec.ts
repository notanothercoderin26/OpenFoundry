import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/datasets`
 * (apps/web/src/routes/datasets/DatasetsListPage.tsx).
 *
 * **Reality vs roadmap.**
 *   - Search is submit-on-Enter (the `<form role="search">` has no submit
 *     button), NOT a live/debounced query.
 *   - Tag and Owner facets trigger a backend re-query (`tag=`,
 *     `owner_id=`). Format is a CLIENT-SIDE filter: clicking a format
 *     facet still calls `applyFilters` (and so re-loads), but the
 *     resulting request does NOT include `format=` — the filter is
 *     applied locally in `filteredByFormat` (see lines 136–139).
 *   - Delete is per-row only; the toolbar offers no bulk-select.
 *   - The "Name" column header chevron is decorative; no sort wired up.
 *   - Pagination is PAGE-based (`page=`, `per_page=`), NOT cursor-based.
 *     `DatasetListResponse` has no `next_cursor` field.
 *   - The Collections / Files tabs reshape the same rows by primary
 *     tag; there is no grid/list view toggle.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/datasets?page=&per_page=&limit=&search=&tag=&owner_id=
 *   - GET    /api/v1/datasets/catalog/facets
 *   - POST   /api/v1/datasets
 *   - DELETE /api/v1/datasets/{id}
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

const E2E_NOW = '2026-05-11T00:00:00Z';

// `/api/v1/datasets` exactly — the list endpoint (GET) + create (POST).
// `(\?|$)` excludes `/datasets/<id>` and `/datasets/catalog/facets`.
const DATASETS_LIST = /\/api\/v1\/datasets(\?|$)/;
const DATASETS_FACETS = /\/api\/v1\/datasets\/catalog\/facets(\?|$)/;
// Single-resource path: `/datasets/<id>` with no further segments.
const DATASET_RESOURCE = /\/api\/v1\/datasets\/[^/?#]+(?:\?|$)/;

interface DatasetFixture {
  id: string;
  rid?: string;
  name: string;
  description: string;
  format: string;
  storage_path: string;
  size_bytes: number;
  row_count: number;
  owner_id: string;
  tags: string[];
  current_version: number;
  active_branch: string;
  created_at: string;
  updated_at: string;
}

function makeDataset(overrides: Partial<DatasetFixture> = {}): DatasetFixture {
  return {
    id: 'dataset-1',
    name: 'sample-dataset',
    description: 'Deterministic E2E dataset',
    format: 'parquet',
    storage_path: '/sample-dataset',
    size_bytes: 1024,
    row_count: 100,
    owner_id: '00000000-0000-0000-0000-000000000001',
    tags: [],
    current_version: 1,
    active_branch: 'master',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface FacetsFixture {
  tags: Array<{ value: string; count: number }>;
  owners: Array<{ owner_id: string; count: number }>;
}

interface MockOptions {
  datasets: DatasetFixture[];
  facets: FacetsFixture;
  /**
   * Optional custom GET responder. Receives the parsed request URL and
   * returns the slice to send back. Lets pagination/filter tests stub
   * different page slices without rewriting the mock.
   */
  listResponder?: (url: URL) => { data: DatasetFixture[]; total: number };
}

interface MockState {
  datasets: DatasetFixture[];
  facets: FacetsFixture;
}

async function mockDatasets(page: Page, initial: MockOptions): Promise<MockState> {
  const state: MockState = {
    datasets: initial.datasets.slice(),
    facets: {
      tags: initial.facets.tags.slice(),
      owners: initial.facets.owners.slice(),
    },
  };

  // Facets endpoint — register before the broader DATASETS_LIST so that
  // Playwright's most-recent-first dispatch picks this one for the
  // `/datasets/catalog/facets` URL. (Belt-and-braces: the regexes don't
  // actually overlap, but routing order is the cheaper safety net.)
  await page.route(DATASETS_FACETS, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: state.facets });
  });

  // GET list + POST create on `/datasets` exactly.
  await page.route(DATASETS_LIST, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = new URL(route.request().url());
      const perPage = Number(url.searchParams.get('per_page') ?? 20);
      const requestedPage = Number(url.searchParams.get('page') ?? 1);
      if (initial.listResponder) {
        const { data, total } = initial.listResponder(url);
        await route.fulfill({
          json: {
            data,
            page: requestedPage,
            per_page: perPage,
            total,
            total_pages: Math.max(1, Math.ceil(total / perPage)),
          },
        });
        return;
      }
      await route.fulfill({
        json: {
          data: state.datasets,
          page: requestedPage,
          per_page: perPage,
          total: state.datasets.length,
          total_pages: Math.max(1, Math.ceil(state.datasets.length / perPage)),
        },
      });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as {
        name?: string;
        description?: string;
        format?: string;
        tags?: string[];
      };
      const created = makeDataset({
        id: 'dataset-new-1',
        name: body.name ?? 'unnamed',
        description: body.description ?? '',
        format: body.format ?? 'parquet',
        tags: body.tags ?? [],
      });
      state.datasets.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fallback();
  });

  // DELETE /datasets/:id (the soft-delete the row trash button drives).
  await page.route(DATASET_RESOURCE, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    const match = /\/api\/v1\/datasets\/([^/?#]+)/.exec(route.request().url());
    if (match) {
      state.datasets = state.datasets.filter((entry) => entry.id !== match[1]);
    }
    await route.fulfill({ status: 204, body: '' });
  });

  return state;
}

const PARQUET = makeDataset({
  id: 'dataset-parquet',
  name: 'orders_clean',
  format: 'parquet',
  owner_id: 'owner-alpha',
  tags: ['finance', 'daily'],
});
const CSV = makeDataset({
  id: 'dataset-csv',
  name: 'customers_raw',
  format: 'csv',
  owner_id: 'owner-beta',
  tags: ['support'],
});
const ICEBERG = makeDataset({
  id: 'dataset-iceberg',
  name: 'events_history',
  format: 'iceberg',
  owner_id: 'owner-alpha',
  tags: ['analytics', 'daily'],
});

const FACETS: FacetsFixture = {
  tags: [
    { value: 'daily', count: 2 },
    { value: 'finance', count: 1 },
    { value: 'support', count: 1 },
    { value: 'analytics', count: 1 },
  ],
  owners: [
    { owner_id: 'owner-alpha', count: 2 },
    { owner_id: 'owner-beta', count: 1 },
  ],
};

function countGet(cap: ReturnType<typeof captureRequests>): number {
  return cap.calls.filter((c) => c.method === 'GET').length;
}

function lastGet(cap: ReturnType<typeof captureRequests>) {
  const gets = cap.calls.filter((c) => c.method === 'GET');
  return gets[gets.length - 1];
}

test('renders the mocked datasets in the catalog table with row metadata', async ({
  adminPage,
}) => {
  await mockDatasets(adminPage, { datasets: [PARQUET, CSV, ICEBERG], facets: FACETS });
  await adminPage.goto('/datasets');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /dataset preview/i }),
  ).toBeVisible();

  // Each dataset name renders as a Link in the row's first cell. The link's
  // accessible name concatenates the dataset name with an "(<format>)" suffix.
  await expect(adminPage.getByRole('link', { name: /orders_clean/i })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /customers_raw/i })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /events_history/i })).toBeVisible();

  // Toolbar breadcrumb chip shows the total count from the list envelope.
  await expect(adminPage.getByLabel('count')).toContainText('3');
});

test('typing in the search box and pressing Enter re-queries /datasets with search=', async ({
  adminPage,
}) => {
  await mockDatasets(adminPage, { datasets: [PARQUET, CSV], facets: FACETS });
  const cap = captureRequests(adminPage, DATASETS_LIST);
  await adminPage.goto('/datasets');

  await expect(adminPage.getByRole('link', { name: /orders_clean/i })).toBeVisible();
  const initial = countGet(cap);

  const searchBox = adminPage.getByLabel(/search datasets/i);
  await searchBox.fill('orders');
  await searchBox.press('Enter');

  await expect.poll(() => countGet(cap)).toBeGreaterThan(initial);
  expect(lastGet(cap)?.url).toMatch(/[?&]search=orders\b/);
});

test('selecting a tag in the facets sidebar re-queries with tag=', async ({ adminPage }) => {
  await mockDatasets(adminPage, { datasets: [PARQUET, CSV, ICEBERG], facets: FACETS });
  const cap = captureRequests(adminPage, DATASETS_LIST);
  await adminPage.goto('/datasets');

  await expect(adminPage.getByRole('link', { name: /orders_clean/i })).toBeVisible();
  const initial = countGet(cap);

  // The Tags FilterGroup is open by default. Each facet button renders the
  // tag value + count, so we scope to the aside to avoid colliding with the
  // identical-text tag chips inside the row cells.
  const facets = adminPage.locator('aside.of-catalog-filters');
  await facets.getByRole('button', { name: /^finance/i }).click();

  await expect.poll(() => countGet(cap)).toBeGreaterThan(initial);
  expect(lastGet(cap)?.url).toMatch(/[?&]tag=finance\b/);
});

test('selecting a format applies a CLIENT-SIDE filter — request omits format=', async ({
  adminPage,
}) => {
  await mockDatasets(adminPage, { datasets: [PARQUET, CSV, ICEBERG], facets: FACETS });
  const cap = captureRequests(adminPage, DATASETS_LIST);
  await adminPage.goto('/datasets');

  await expect(adminPage.getByRole('link', { name: /orders_clean/i })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /customers_raw/i })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /events_history/i })).toBeVisible();
  const initial = countGet(cap);

  // Format facets are computed locally from the loaded rows; the "Type"
  // FilterGroup is open by default.
  const facets = adminPage.locator('aside.of-catalog-filters');
  await facets.getByRole('button', { name: /^parquet/i }).click();

  // `applyFilters` always re-loads on page 1, so a new GET fires — but
  // `listDatasets` never sets `format=` (the page filters `filteredByFormat`
  // locally), so the request URL must not contain a format parameter.
  await expect.poll(() => countGet(cap)).toBeGreaterThan(initial);
  expect(lastGet(cap)?.url).not.toMatch(/[?&]format=/);

  // Only the parquet row remains visible.
  await expect(adminPage.getByRole('link', { name: /orders_clean/i })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /customers_raw/i })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: /events_history/i })).toHaveCount(0);
});

test('selecting an owner in the facets sidebar re-queries with owner_id=', async ({
  adminPage,
}) => {
  await mockDatasets(adminPage, { datasets: [PARQUET, CSV, ICEBERG], facets: FACETS });
  const cap = captureRequests(adminPage, DATASETS_LIST);
  await adminPage.goto('/datasets');

  await expect(adminPage.getByRole('link', { name: /orders_clean/i })).toBeVisible();
  const initial = countGet(cap);

  // The Owner FilterGroup is COLLAPSED by default — open it first. The
  // group's toggle button accessible name is just "Owner" (the +/− sign
  // is `aria-hidden`).
  const facets = adminPage.locator('aside.of-catalog-filters');
  await facets.getByRole('button', { name: 'Owner', exact: true }).click();
  await facets.getByRole('button', { name: /owner-alpha/i }).click();

  await expect.poll(() => countGet(cap)).toBeGreaterThan(initial);
  expect(lastGet(cap)?.url).toMatch(/[?&]owner_id=owner-alpha\b/);
});

test('the "Upload data" link navigates to /datasets/upload', async ({ adminPage }) => {
  await mockDatasets(adminPage, { datasets: [PARQUET], facets: FACETS });
  await adminPage.goto('/datasets');

  const upload = adminPage.getByRole('link', { name: /upload data/i });
  await expect(upload).toHaveAttribute('href', '/datasets/upload');
  await upload.click();
  await expect(adminPage).toHaveURL(/\/datasets\/upload$/);
});

test('clicking a dataset row navigates to /datasets/:id', async ({ adminPage }) => {
  await mockDatasets(adminPage, { datasets: [PARQUET], facets: FACETS });
  await adminPage.goto('/datasets');

  const link = adminPage.getByRole('link', { name: /orders_clean/i });
  await expect(link).toHaveAttribute('href', /\/datasets\/dataset-parquet$/);
  await link.click();
  await expect(adminPage).toHaveURL(/\/datasets\/dataset-parquet$/);
});

test('"New" opens the CreateDatasetModal, POSTs /datasets, then redirects to the new dataset', async ({
  adminPage,
}) => {
  await mockDatasets(adminPage, { datasets: [], facets: { tags: [], owners: [] } });
  const cap = captureRequests(adminPage, DATASETS_LIST);
  await adminPage.goto('/datasets');

  await adminPage.getByRole('button', { name: /^New$/ }).click();

  const dialog = adminPage.getByRole('dialog', { name: /new dataset/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^name$/i).fill('orders_clean');
  await dialog.getByRole('button', { name: /create dataset/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({ name: 'orders_clean', format: 'parquet' });

  // The page's `onCreated` callback navigates to /datasets/<new-id>.
  await expect(adminPage).toHaveURL(/\/datasets\/dataset-new-1$/);
});

test('per-row delete: trash button opens the Soft-delete confirm and DELETEs the dataset', async ({
  adminPage,
}) => {
  await mockDatasets(adminPage, { datasets: [PARQUET, CSV], facets: FACETS });
  const cap = captureRequests(adminPage, DATASET_RESOURCE);
  await adminPage.goto('/datasets');

  const row = adminPage.locator('tr').filter({ hasText: /orders_clean/ });
  await row.getByRole('button', { name: /^delete$/i }).click();

  const dialog = adminPage.getByRole('dialog', { name: /delete dataset/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/orders_clean/);
  await dialog.getByRole('button', { name: /soft-delete/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'DELETE').length)
    .toBeGreaterThanOrEqual(1);
  const del = cap.calls.find((c) => c.method === 'DELETE');
  expect(del?.url).toMatch(/\/api\/v1\/datasets\/dataset-parquet(?:\?|$)/);

  // Stateful mock + reload removes the row.
  await expect(adminPage.getByRole('link', { name: /orders_clean/i })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: /customers_raw/i })).toBeVisible();
});

test('paginating to page 2 fires a new fetch with page=2 and renders the next slice', async ({
  adminPage,
}) => {
  const all = Array.from({ length: 25 }, (_, i) =>
    makeDataset({
      id: `dataset-${i + 1}`,
      name: `bulk_${String(i + 1).padStart(2, '0')}`,
    }),
  );

  await mockDatasets(adminPage, {
    datasets: [],
    facets: { tags: [], owners: [] },
    listResponder: (url) => {
      const requestedPage = Number(url.searchParams.get('page') ?? 1);
      const perPage = 20;
      const start = (requestedPage - 1) * perPage;
      return { data: all.slice(start, start + perPage), total: all.length };
    },
  });

  const cap = captureRequests(adminPage, DATASETS_LIST);
  await adminPage.goto('/datasets');

  await expect(adminPage.getByRole('link', { name: /^bulk_01/i })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /^bulk_21/i })).toHaveCount(0);
  const initial = countGet(cap);

  await adminPage
    .getByRole('navigation', { name: /pagination/i })
    .getByRole('button', { name: /next/i })
    .click();

  await expect.poll(() => countGet(cap)).toBeGreaterThan(initial);
  expect(lastGet(cap)?.url).toMatch(/[?&]page=2\b/);
  await expect(adminPage.getByRole('link', { name: /^bulk_21/i })).toBeVisible();
});

test('renders the empty-state cell when the dataset list is empty', async ({ adminPage }) => {
  await mockDatasets(adminPage, { datasets: [], facets: { tags: [], owners: [] } });
  await adminPage.goto('/datasets');

  await expect(
    adminPage.getByText(/no datasets matched the current filters/i),
  ).toBeVisible();

  // No dataset links exist (sanity check for the empty render).
  expect(await adminPage.getByRole('link', { name: /\.(parquet|csv|iceberg)\b/i }).count()).toBe(0);
});

test('absent today: sort UI, bulk-select, grid/list view toggle, cursor pagination', async ({
  adminPage,
}) => {
  // Single regression guard for the four roadmap controls that don't ship
  // today. When each one lands, the matching assertion flips and forces an
  // update of this file.
  await mockDatasets(adminPage, { datasets: [PARQUET, CSV], facets: FACETS });
  const cap = captureRequests(adminPage, DATASETS_LIST);
  await adminPage.goto('/datasets');

  await expect(adminPage.getByRole('link', { name: /orders_clean/i })).toBeVisible();

  // 1. No sort UI — the Name column header is a plain <th> with a
  //    decorative chevron, not an interactive sort button.
  expect(
    await adminPage
      .getByRole('columnheader', { name: /^name/i })
      .getByRole('button')
      .count(),
  ).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^sort\b/i }).count()).toBe(0);

  // 2. No bulk-select — no header "select all" checkbox, no per-row
  //    checkbox, no "Delete selected" toolbar action.
  expect(await adminPage.getByRole('checkbox').count()).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /delete selected|bulk delete/i }).count(),
  ).toBe(0);

  // 3. No grid/list view toggle. The Collections/Files tabs reshape rows
  //    by primary tag — that's different from a grid switcher.
  expect(
    await adminPage.getByRole('button', { name: /grid view|list view|switch view/i }).count(),
  ).toBe(0);

  // 4. Pagination is page-based, not cursor-based. The initial GET uses
  //    `page=` + `per_page=`, never `cursor=` / `next_cursor=`.
  const initial = lastGet(cap);
  expect(initial?.url).toMatch(/[?&]page=1\b/);
  expect(initial?.url).toMatch(/[?&]per_page=20\b/);
  expect(initial?.url).not.toMatch(/[?&]cursor=/);
  expect(initial?.url).not.toMatch(/[?&]next_cursor=/);
});
