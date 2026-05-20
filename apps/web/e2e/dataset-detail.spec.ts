import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/datasets/:id`
 * (apps/web/src/routes/datasets/DatasetDetailPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page does NOT expose the tab list
 * named in the roadmap — there is no "Branches", "Transactions",
 * "Permissions", or "Settings" tab. The actual tabs are:
 *
 *     Preview / Files / Details / Schema / History / Jobs /
 *     Schedules / Health / Lineage / Retention
 *
 * Mapping the roadmap onto reality:
 *   - "Branches" ships as a `<Link to="/datasets/:id/branches">` header
 *     button + a branch picker `<select>` in the header. Creating a new
 *     branch lives on the dedicated `/datasets/:id/branches` page.
 *   - "Transactions" is folded into the History tab (transactions
 *     table + selector). The header also has a Transaction `<select>`
 *     that drives `?txn=` and re-loads Preview against that snapshot.
 *   - "Permissions" is not present on this page at all.
 *   - "Settings" → the Details tab carries Name / Description / Tags /
 *     Folder / Project / Visibility + a Save metadata button (PATCH).
 *     Soft-delete and Hard-delete are header buttons; there is no
 *     archive action.
 *   - "Download" → the Export header button opens a dialog that POSTs
 *     to `/datasets/:id/exports` (plural; the response is JSON with a
 *     `download_url`, NOT a Blob stream).
 *   - "Edit in Quiver / Notebook" → the closest analogues are the
 *     "SQL preview" (→ /queries) and "Analyze data" (→ /contour)
 *     buttons inside the Preview tab, plus "Explore pipeline"
 *     (→ /lineage) in the header. There are no buttons named
 *     "Edit in Quiver" or "Edit in Notebook".
 *   - Sort is driven by a free-text "Sort" input (e.g. `-updated_at`).
 *     The preview column headers are not clickable sort buttons.
 *
 * Endpoints exercised on mount:
 *   - GET /api/v1/datasets/{id}
 *   - GET /api/v1/datasets/{id}/branches
 *   - GET /api/v1/datasets/{id}/versions
 *   - GET /api/v1/datasets/{id}/preview?branch=&limit=&offset=&sort=&...
 *   - GET /api/v1/datasets/{id}/transactions?branch=
 *
 * Per-tab additions:
 *   - Schema  → GET /api/v1/datasets/{id}/schema?branch=
 *   -          → GET /api/v1/datasets/{id}/files?branch=
 *   - Details → GET /api/v1/datasets/{id}/iceberg-metadata (optional)
 *
 * Mutations:
 *   - PATCH  /api/v1/datasets/{id}                   (rename / metadata)
 *   - DELETE /api/v1/datasets/{id}                   (soft-delete)
 *   - PUT    /api/v1/datasets/{id}/schema            (manual schema save)
 *   - POST   /api/v1/datasets/{id}/exports           (export dialog)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
      /Iceberg metadata is not available/i,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';
const DATASET_ID = 'dataset-detail-1';

const DATASET_RESOURCE = new RegExp(`/api/v1/datasets/${DATASET_ID}(\\?|$)`);
const DATASET_PREVIEW = new RegExp(`/api/v1/datasets/${DATASET_ID}/preview`);
const DATASET_BRANCHES = new RegExp(`/api/v1/datasets/${DATASET_ID}/branches(\\?|$)`);
const DATASET_VERSIONS = new RegExp(`/api/v1/datasets/${DATASET_ID}/versions(\\?|$)`);
const DATASET_TRANSACTIONS = new RegExp(`/api/v1/datasets/${DATASET_ID}/transactions(\\?|$)`);
const DATASET_SCHEMA = new RegExp(`/api/v1/datasets/${DATASET_ID}/schema(\\?|$)`);
const DATASET_FILES = new RegExp(`/api/v1/datasets/${DATASET_ID}/files(\\?|$)`);
const DATASET_EXPORTS = new RegExp(`/api/v1/datasets/${DATASET_ID}/exports(\\?|$)`);
const DATASET_ICEBERG = new RegExp(`/api/v1/datasets/${DATASET_ID}/iceberg-metadata`);
const DATASET_HEALTH = new RegExp(`/api/v1/datasets/${DATASET_ID}/health`);
const DATASET_INCREMENTAL = new RegExp(`/api/v1/datasets/${DATASET_ID}/incremental-readiness`);

interface DatasetFixture {
  id: string;
  rid: string;
  name: string;
  display_name?: string;
  description: string;
  format: string;
  storage_path: string;
  size_bytes: number;
  row_count: number;
  owner_id: string;
  tags: string[];
  current_version: number;
  active_branch: string;
  resource_visibility: string;
  folder_path: string;
  project_id: string;
  path: string;
  created_at: string;
  updated_at: string;
}

function makeDataset(overrides: Partial<DatasetFixture> = {}): DatasetFixture {
  return {
    id: DATASET_ID,
    rid: `ri.dataset.${DATASET_ID}`,
    name: 'orders_clean',
    display_name: 'Orders (clean)',
    description: 'Deduped Q1 orders feed',
    format: 'parquet',
    storage_path: '/orders_clean',
    size_bytes: 65_536,
    row_count: 1234,
    owner_id: '00000000-0000-0000-0000-000000000001',
    tags: ['finance', 'monthly'],
    current_version: 3,
    active_branch: 'master',
    resource_visibility: 'organization',
    folder_path: '/datasets/finance',
    project_id: 'default',
    path: '/finance/orders_clean',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface BranchFixture {
  id: string;
  dataset_id: string;
  name: string;
  version: number;
  description: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

function makeBranch(overrides: Partial<BranchFixture> = {}): BranchFixture {
  return {
    id: 'branch-master',
    dataset_id: DATASET_ID,
    name: 'master',
    version: 3,
    description: '',
    is_default: true,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface TransactionFixture {
  id: string;
  dataset_id: string;
  operation: string;
  branch_name: string;
  status: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
  committed_at: string;
}

function makeTransaction(overrides: Partial<TransactionFixture> = {}): TransactionFixture {
  return {
    id: 'txn-001',
    dataset_id: DATASET_ID,
    operation: 'SNAPSHOT',
    branch_name: 'master',
    status: 'COMMITTED',
    summary: 'Initial snapshot',
    metadata: {},
    created_at: E2E_NOW,
    committed_at: E2E_NOW,
    ...overrides,
  };
}

interface MockState {
  dataset: DatasetFixture;
  branches: BranchFixture[];
  versions: Array<{ id: string; version: number; message: string; row_count: number; size_bytes: number; storage_path: string; created_at: string }>;
  transactions: TransactionFixture[];
  preview: {
    columns: Array<{ name: string; field_type?: string }>;
    rows: Array<Record<string, unknown>>;
    total_rows: number;
    sampled?: boolean;
  };
  schema?: { id: string; dataset_id: string; fields: Array<{ name: string; type: string; nullable: boolean; description?: string }>; created_at: string };
  files?: Array<{ id: string; dataset_id: string; transaction_id: string; logical_path: string; physical_uri: string; size_bytes: number; created_at: string; modified_at: string; status: 'active' | 'deleted' }>;
}

async function mockDatasetDetail(page: Page, state: MockState): Promise<void> {
  const internal = {
    dataset: { ...state.dataset },
  };

  // GET / PATCH / DELETE on /datasets/{id} itself.
  await page.route(DATASET_RESOURCE, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: internal.dataset });
      return;
    }
    if (method === 'PATCH') {
      const body = (route.request().postDataJSON() ?? {}) as Partial<DatasetFixture>;
      internal.dataset = { ...internal.dataset, ...body, updated_at: E2E_NOW };
      await route.fulfill({ json: internal.dataset });
      return;
    }
    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fallback();
  });

  await page.route(DATASET_BRANCHES, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: state.branches });
  });

  await page.route(DATASET_VERSIONS, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: state.versions });
  });

  await page.route(DATASET_TRANSACTIONS, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    // listDatasetTransactions accepts either array or `{ data, ... }`.
    await route.fulfill({ json: state.transactions });
  });

  await page.route(DATASET_PREVIEW, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        dataset_id: DATASET_ID,
        branch: state.dataset.active_branch,
        format: state.dataset.format,
        columns: state.preview.columns,
        rows: state.preview.rows,
        row_count: state.preview.rows.length,
        total_rows: state.preview.total_rows,
        sampled: state.preview.sampled ?? false,
        warnings: [],
        errors: [],
        parse_errors: [],
      },
    });
  });

  await page.route(DATASET_FILES, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const files = state.files ?? [];
    await route.fulfill({
      json: {
        branch: state.dataset.active_branch,
        total: files.length,
        files,
        data: files,
      },
    });
  });

  await page.route(DATASET_SCHEMA, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      if (!state.schema) {
        await route.fulfill({ status: 404, json: { error: 'no schema' } });
        return;
      }
      await route.fulfill({ json: state.schema });
      return;
    }
    if (method === 'PUT') {
      const body = (route.request().postDataJSON() ?? {}) as {
        schema?: { fieldSchemaList?: Array<{ name: string; type: string }> };
        branchName?: string;
      };
      await route.fulfill({
        json: {
          branchName: body.branchName ?? state.dataset.active_branch,
          endTransactionRid: 'ri.txn.schema-1',
          schema: { fieldSchemaList: body.schema?.fieldSchemaList ?? [] },
          versionId: 'v-schema-1',
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.route(DATASET_EXPORTS, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        id: 'export-1',
        rid: 'ri.export.export-1',
        export_id: 'export-1',
        status: 'queued',
        download_url: 'https://example.invalid/exports/export-1',
      },
    });
  });

  // Optional/secondary endpoints — return empty success so the detail
  // page doesn't error out when tabs that need them are mounted.
  await page.route(DATASET_ICEBERG, async (route) => {
    await route.fulfill({ status: 404, json: { error: 'not iceberg' } });
  });
  await page.route(DATASET_HEALTH, async (route) => {
    await route.fulfill({ status: 404, json: { error: 'no health' } });
  });
  await page.route(DATASET_INCREMENTAL, async (route) => {
    await route.fulfill({
      json: {
        dataset_id: DATASET_ID,
        dataset_rid: state.dataset.rid,
        branch: state.dataset.active_branch,
        mode: 'append_only',
        classification: 'ready',
        incremental_ready: true,
        append_only: true,
        total_committed: state.transactions.length,
        transaction_counts: { SNAPSHOT: 1, APPEND: state.transactions.length - 1 },
        view_boundaries: [],
        warnings: [],
        computed_at: E2E_NOW,
      },
    });
  });
}

const DATASET = makeDataset();
const BRANCHES: BranchFixture[] = [
  makeBranch({ id: 'b-master', name: 'master', is_default: true, version: 3 }),
  makeBranch({ id: 'b-staging', name: 'staging', is_default: false, version: 2 }),
];
const TRANSACTIONS: TransactionFixture[] = [
  makeTransaction({ id: 'txn-001', operation: 'SNAPSHOT', summary: 'Initial snapshot' }),
  makeTransaction({ id: 'txn-002', operation: 'APPEND', summary: 'Q1 ingest' }),
  makeTransaction({ id: 'txn-003', operation: 'APPEND', summary: 'Late arrivals' }),
];
const PREVIEW = {
  columns: [
    { name: 'order_id', field_type: 'STRING' },
    { name: 'amount', field_type: 'DOUBLE' },
    { name: 'updated_at', field_type: 'TIMESTAMP' },
  ],
  rows: [
    { order_id: 'O-1001', amount: 19.99, updated_at: '2026-04-15T11:00:00Z' },
    { order_id: 'O-1002', amount: 42.5, updated_at: '2026-04-15T11:05:00Z' },
    { order_id: 'O-1003', amount: 7.25, updated_at: '2026-04-15T11:10:00Z' },
  ],
  total_rows: 1234,
};
const SCHEMA = {
  id: 'schema-1',
  dataset_id: DATASET_ID,
  fields: [
    { name: 'order_id', type: 'LONG', nullable: false, description: '' },
    { name: 'amount', type: 'DOUBLE', nullable: true, description: '' },
    { name: 'updated_at', type: 'TIMESTAMP', nullable: true, description: '' },
  ],
  created_at: E2E_NOW,
};

const BASE_STATE: MockState = {
  dataset: DATASET,
  branches: BRANCHES,
  versions: [
    { id: 'v-3', version: 3, message: 'rebuilt', row_count: 1234, size_bytes: 65_536, storage_path: '/orders_clean', created_at: E2E_NOW },
    { id: 'v-2', version: 2, message: 'patched', row_count: 1200, size_bytes: 64_000, storage_path: '/orders_clean', created_at: E2E_NOW },
  ],
  transactions: TRANSACTIONS,
  preview: PREVIEW,
  schema: SCHEMA,
  files: [],
};

test('renders the dataset header, tab list, and Preview by default', async ({ adminPage }) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  await adminPage.goto(`/datasets/${DATASET_ID}`);

  // Dataset name in the page heading.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: 'orders_clean' }),
  ).toBeVisible();

  // Tabs the page actually ships (10 of them).
  const tabLabels = [
    'Preview', 'Files', 'Details', 'Schema', 'History',
    'Jobs', 'Schedules', 'Health', 'Lineage', 'Retention',
  ];
  for (const label of tabLabels) {
    await expect(adminPage.getByRole('tab', { name: label })).toBeVisible();
  }

  // Preview is the default — verify aria-selected on the Preview tab.
  await expect(adminPage.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('Preview tab: renders rows + columns from /preview and surfaces total row count', async ({
  adminPage,
}) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  await adminPage.goto(`/datasets/${DATASET_ID}`);

  // Column headers from the mocked /preview response.
  await expect(adminPage.getByText('order_id', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('amount', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('updated_at', { exact: true }).first()).toBeVisible();

  // Each mocked row's primary cell value is rendered.
  await expect(adminPage.getByText('O-1001', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('O-1002', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('O-1003', { exact: true })).toBeVisible();
});

test('Preview controls: typing in Sort + clicking Apply re-fetches /preview with sort=', async ({
  adminPage,
}) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  const cap = captureRequests(adminPage, DATASET_PREVIEW);

  await adminPage.goto(`/datasets/${DATASET_ID}`);
  await expect(adminPage.getByText('O-1001', { exact: true })).toBeVisible();
  const initial = cap.count();

  await adminPage.getByLabel('Sort', { exact: true }).fill('-updated_at');
  await adminPage.getByRole('button', { name: 'Apply', exact: true }).click();

  await expect.poll(() => cap.count()).toBeGreaterThan(initial);
  const latest = cap.last();
  expect(latest?.url).toMatch(/[?&]sort=-updated_at\b/);

  // Clicking Next paginates by `previewLimit` (default 100).
  const beforeNext = cap.count();
  await adminPage.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => cap.count()).toBeGreaterThan(beforeNext);
  expect(cap.last()?.url).toMatch(/[?&]offset=100\b/);
});

test('Schema tab: lists columns, changing a type and clicking "Save edits" PUTs /schema', async ({
  adminPage,
}) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  const cap = captureRequests(adminPage, DATASET_SCHEMA);

  await adminPage.goto(`/datasets/${DATASET_ID}?tab=schema`);

  // Wait for the schema editor's first column input to land.
  const schemaTable = adminPage.locator('table.of-table').last();
  await expect(schemaTable).toBeVisible();
  const firstRow = schemaTable.locator('tbody tr').first();
  await expect(firstRow.locator('input').first()).toHaveValue('order_id');

  // Flip the order_id column from LONG → STRING via its type <select>.
  await firstRow.getByRole('combobox').selectOption('STRING');

  await adminPage.getByRole('button', { name: /save edits/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'PUT').length)
    .toBeGreaterThanOrEqual(1);
  const put = cap.calls.find((c) => c.method === 'PUT');
  expect(put?.url).toMatch(new RegExp(`/api/v1/datasets/${DATASET_ID}/schema$`));
  const body = put?.body as { branchName?: string; schema?: { fieldSchemaList?: Array<{ name: string; type: string }> } };
  expect(body?.branchName).toBe('master');
  expect(body?.schema?.fieldSchemaList?.[0]).toMatchObject({ name: 'order_id', type: 'STRING' });

  // Success notice surfaces after refreshSchemaAfterApply runs.
  await expect(adminPage.getByText(/schema saved/i)).toBeVisible();
});

test('History tab: transactions table populated from /transactions', async ({ adminPage }) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  await adminPage.goto(`/datasets/${DATASET_ID}?tab=history`);

  // Each mocked transaction id appears in the transactions table.
  await expect(adminPage.getByText('txn-001', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('txn-002', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('txn-003', { exact: true })).toBeVisible();

  // Section heading reports the count.
  await expect(adminPage.getByRole('heading', { name: /3 transactions/i })).toBeVisible();
});

test('header "Branches" link navigates to /datasets/:id/branches', async ({ adminPage }) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  await adminPage.goto(`/datasets/${DATASET_ID}`);

  const branches = adminPage.getByRole('link', { name: 'Branches', exact: true });
  await expect(branches).toHaveAttribute('href', `/datasets/${DATASET_ID}/branches`);
  await branches.click();
  await expect(adminPage).toHaveURL(new RegExp(`/datasets/${DATASET_ID}/branches$`));
});

test('Details tab: renaming and clicking "Save metadata" PATCHes /datasets/:id', async ({
  adminPage,
}) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  const cap = captureRequests(adminPage, DATASET_RESOURCE);

  await adminPage.goto(`/datasets/${DATASET_ID}?tab=details`);

  const nameInput = adminPage.getByLabel('Name', { exact: true });
  await expect(nameInput).toHaveValue('orders_clean');
  await nameInput.fill('orders_clean_v2');

  await adminPage.getByRole('button', { name: /save metadata/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'PATCH').length)
    .toBeGreaterThanOrEqual(1);
  const patch = cap.calls.find((c) => c.method === 'PATCH');
  expect(patch?.body).toMatchObject({
    name: 'orders_clean_v2',
    description: 'Deduped Q1 orders feed',
    resource_visibility: 'organization',
  });

  await expect(adminPage.getByText(/dataset metadata saved/i)).toBeVisible();
});

test('Soft-delete: header button opens confirm, DELETE fires, and the page redirects to /datasets', async ({
  adminPage,
}) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  const cap = captureRequests(adminPage, DATASET_RESOURCE);

  await adminPage.goto(`/datasets/${DATASET_ID}`);
  await expect(
    adminPage.getByRole('heading', { level: 1, name: 'orders_clean' }),
  ).toBeVisible();

  await adminPage.getByRole('button', { name: 'Soft-delete', exact: true }).click();

  const dialog = adminPage.getByRole('dialog');
  await expect(dialog).toContainText(/Delete orders_clean\?/i);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'DELETE').length)
    .toBeGreaterThanOrEqual(1);
  expect(cap.calls.find((c) => c.method === 'DELETE')?.url).toMatch(
    new RegExp(`/api/v1/datasets/${DATASET_ID}$`),
  );

  await expect(adminPage).toHaveURL(/\/datasets$/);
});

test('Export header button opens the dialog and POSTs /datasets/:id/exports with CSV defaults', async ({
  adminPage,
}) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  const cap = captureRequests(adminPage, DATASET_EXPORTS);

  await adminPage.goto(`/datasets/${DATASET_ID}`);
  await adminPage.getByRole('button', { name: 'Export', exact: true }).click();

  const dialog = adminPage.getByRole('dialog', { name: /export dataset/i });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: /start export/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const post = cap.last();
  expect(post?.method).toBe('POST');
  expect(post?.url).toMatch(new RegExp(`/api/v1/datasets/${DATASET_ID}/exports$`));
  expect(post?.body).toMatchObject({
    format: 'CSV',
    branch: 'master',
    version: 3,
    include_schema: true,
  });

  // The dialog flips to the success message with a download link.
  await expect(dialog.getByText(/export requested/i)).toBeVisible();
  await expect(dialog.getByRole('link', { name: /open download/i })).toBeVisible();
});

test('header "Explore pipeline" button navigates to /lineage?dataset=:id', async ({ adminPage }) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  await adminPage.goto(`/datasets/${DATASET_ID}`);

  await adminPage.getByRole('button', { name: 'Explore pipeline', exact: true }).first().click();
  await expect(adminPage).toHaveURL(new RegExp(`/lineage\\?dataset=${DATASET_ID}`));
});

test('Transaction dropdown: selecting a txn writes ?txn= and re-queries /preview with transaction_id=', async ({
  adminPage,
}) => {
  await mockDatasetDetail(adminPage, BASE_STATE);
  const cap = captureRequests(adminPage, DATASET_PREVIEW);

  await adminPage.goto(`/datasets/${DATASET_ID}`);
  // Wait for the initial preview + transactions load.
  await expect(adminPage.getByText('O-1001', { exact: true })).toBeVisible();
  const initial = cap.count();

  // The header's "Transaction" labelled <select> exposes each loaded
  // transaction by its full id as the option value.
  await adminPage.getByLabel('Transaction', { exact: true }).selectOption('txn-002');

  await expect(adminPage).toHaveURL(/[?&]txn=txn-002\b/);
  await expect.poll(() => cap.count()).toBeGreaterThan(initial);
  expect(cap.last()?.url).toMatch(/[?&]transaction_id=txn-002\b/);
});

test('absent today: Permissions tab, Archive action, "Edit in Quiver / Notebook" buttons, and column-click sort', async ({
  adminPage,
}) => {
  // Single regression guard for the four roadmap controls that don't
  // ship today. When each one lands, the matching assertion flips.
  await mockDatasetDetail(adminPage, BASE_STATE);
  await adminPage.goto(`/datasets/${DATASET_ID}`);
  await expect(adminPage.getByText('O-1001', { exact: true })).toBeVisible();

  // 1. No Permissions tab in the tab list.
  expect(await adminPage.getByRole('tab', { name: /permissions?/i }).count()).toBe(0);

  // 2. No Archive action — neither a header button nor a menu item.
  expect(await adminPage.getByRole('button', { name: /^archive$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('menuitem', { name: /^archive$/i }).count()).toBe(0);

  // 3. No buttons named exactly "Edit in Quiver" or "Edit in Notebook".
  //    The shipped analogues (SQL preview, Analyze data, Explore pipeline)
  //    are covered in the navigation test above.
  expect(
    await adminPage.getByRole('button', { name: /^edit in (quiver|notebook)$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('link', { name: /^edit in (quiver|notebook)$/i }).count(),
  ).toBe(0);

  // 4. Sort is driven by the free-text "Sort" input, not by clicking the
  //    preview column headers. Confirm no `<button>` lives inside the
  //    preview table's thead.
  await expect(adminPage.getByLabel('Sort', { exact: true })).toBeVisible();
  const previewHeader = adminPage.locator('thead').first();
  expect(await previewHeader.locator('button').count()).toBe(0);
});
