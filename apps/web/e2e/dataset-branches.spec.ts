import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/datasets/:id/branches`
 * (apps/web/src/routes/datasets/DatasetBranchesPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page uses Foundry's branch model,
 * which does NOT carry an `active / merged / abandoned` status enum:
 *
 *   - Branches carry `archived_at` (archived) and `has_open_transaction`
 *     (open) flags instead. The stats card row reports
 *     `Active branches / Open tx / Archived / Default` accordingly.
 *   - There is no "Merge to main" button anywhere on this page and no
 *     conflict-preview dialog — branch merges are not modelled in the
 *     dataset-versioning surface.
 *   - There is no "Abandon" action either. Branch removal is a plain
 *     `Delete` button (Table view only) that triggers `window.confirm`
 *     and DELETEs `/api/v1/datasets/{id}/branches/{name}`. No PATCH
 *     with `{ status: 'abandoned' }` is fired.
 *   - There is no status filter — only a Graph / Table view toggle.
 *   - Creating a branch opens the `CreateBranchDialog` (POST
 *     `/api/v1/datasets/{id}/branches`) with the v2 source shape:
 *     `{ source: { from_branch: '<base>' | from_transaction_rid: '…' | as_root: true } }`,
 *     NOT the `{ name, base: 'main' }` body from the roadmap.
 *
 * Endpoints exercised on mount:
 *   - GET /api/v1/datasets/{id}
 *   - GET /api/v1/datasets/{id}/branches
 *   - GET /api/v1/datasets/{id}/transactions
 *
 * Mutations:
 *   - POST   /api/v1/datasets/{id}/branches            (CreateBranchDialog)
 *   - DELETE /api/v1/datasets/{id}/branches/{name}     (per-row Delete)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
      // The Graph view mounts a Cytoscape canvas. WebGL / layout warnings
      // surface as console.error in some headless environments.
      /cytoscape/i,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';
const DATASET_ID = 'dataset-branches-1';

const DATASET_RESOURCE = new RegExp(`/api/v1/datasets/${DATASET_ID}(\\?|$)`);
const DATASET_BRANCHES = new RegExp(`/api/v1/datasets/${DATASET_ID}/branches(\\?|$)`);
const DATASET_BRANCH_DELETE = new RegExp(
  `/api/v1/datasets/${DATASET_ID}/branches/[^/?#]+`,
);
const DATASET_TRANSACTIONS = new RegExp(`/api/v1/datasets/${DATASET_ID}/transactions(\\?|$)`);

interface DatasetFixture {
  id: string;
  rid: string;
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

interface BranchFixture {
  id: string;
  dataset_id: string;
  name: string;
  version: number;
  description: string;
  is_default: boolean;
  parent_branch_id?: string | null;
  head_transaction_id?: string | null;
  has_open_transaction?: boolean;
  archived_at?: string | null;
  last_activity_at?: string;
  retention_policy?: 'INHERITED' | 'FOREVER' | 'TTL_DAYS';
  fallback_chain?: string[];
  labels?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

function makeDataset(overrides: Partial<DatasetFixture> = {}): DatasetFixture {
  return {
    id: DATASET_ID,
    rid: `ri.dataset.${DATASET_ID}`,
    name: 'orders_clean',
    description: '',
    format: 'parquet',
    storage_path: '/orders_clean',
    size_bytes: 0,
    row_count: 0,
    owner_id: '00000000-0000-0000-0000-000000000001',
    tags: [],
    current_version: 1,
    active_branch: 'master',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeBranch(overrides: Partial<BranchFixture> = {}): BranchFixture {
  return {
    id: 'branch-1',
    dataset_id: DATASET_ID,
    name: 'master',
    version: 1,
    description: '',
    is_default: true,
    parent_branch_id: null,
    head_transaction_id: 'ri.txn.master-head',
    has_open_transaction: false,
    archived_at: null,
    last_activity_at: E2E_NOW,
    retention_policy: 'INHERITED',
    fallback_chain: [],
    labels: {},
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface MockState {
  dataset: DatasetFixture;
  branches: BranchFixture[];
}

async function mockBranchesPage(page: Page, initial: MockState): Promise<MockState> {
  const state: MockState = {
    dataset: { ...initial.dataset },
    branches: initial.branches.slice(),
  };

  await page.route(DATASET_RESOURCE, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: state.dataset });
  });

  // GET list + POST create on `/datasets/{id}/branches`.
  await page.route(DATASET_BRANCHES, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: state.branches });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as {
        name?: string;
        source?: { from_branch?: string; from_transaction_rid?: string; as_root?: boolean };
        description?: string;
      };
      const created = makeBranch({
        id: `branch-${state.branches.length + 1}`,
        name: body.name ?? 'unnamed',
        description: body.description ?? '',
        is_default: false,
        parent_branch_id:
          state.branches.find((b) => b.name === body.source?.from_branch)?.id ?? null,
        head_transaction_id: null,
        has_open_transaction: false,
      });
      state.branches.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fallback();
  });

  // DELETE /branches/{name}.
  await page.route(DATASET_BRANCH_DELETE, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    const match = /\/branches\/([^/?#]+)/.exec(route.request().url());
    const branchName = match ? decodeURIComponent(match[1]) : '';
    state.branches = state.branches.filter((branch) => branch.name !== branchName);
    await route.fulfill({
      status: 200,
      json: { branch: branchName, branch_rid: `ri.branch.${branchName}`, reparented: [] },
    });
  });

  await page.route(DATASET_TRANSACTIONS, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: [] });
  });

  return state;
}

const DATASET = makeDataset();
const MASTER = makeBranch({
  id: 'b-master',
  name: 'master',
  is_default: true,
  has_open_transaction: false,
  head_transaction_id: 'ri.txn.master-head',
});
const STAGING = makeBranch({
  id: 'b-staging',
  name: 'staging',
  is_default: false,
  parent_branch_id: 'b-master',
  has_open_transaction: true,
  head_transaction_id: 'ri.txn.staging-head',
});
const ARCHIVED = makeBranch({
  id: 'b-old',
  name: 'old-experiment',
  is_default: false,
  parent_branch_id: 'b-master',
  has_open_transaction: false,
  archived_at: E2E_NOW,
  head_transaction_id: 'ri.txn.old-head',
});

test('renders the branches header, stats, and the branch table', async ({ adminPage }) => {
  await mockBranchesPage(adminPage, {
    dataset: DATASET,
    branches: [MASTER, STAGING, ARCHIVED],
  });
  await adminPage.goto(`/datasets/${DATASET_ID}/branches`);

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /dataset branches/i }),
  ).toBeVisible();

  // Stats card row reports the *shipped* counters: Active / Open tx /
  // Archived / Default. With 3 branches (1 archived, 1 open) we expect
  // Active=2, Open tx=1, Archived=1, Default=master.
  const stats = adminPage.locator('header.of-panel');
  await expect(stats.getByText('Active branches', { exact: true })).toBeVisible();
  await expect(stats.getByText('Open tx', { exact: true })).toBeVisible();
  await expect(stats.getByText('Archived', { exact: true })).toBeVisible();
  await expect(stats.getByText('Default', { exact: true })).toBeVisible();

  // Switch to the Table view so each branch row is asserted in DOM
  // (the Graph view renders via Cytoscape, which doesn't expose text).
  await adminPage.getByRole('button', { name: 'Table', exact: true }).click();

  // Branch name link is in the row's first cell (★ suffix on default).
  await expect(adminPage.getByRole('link', { name: /^master\s*★/ })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /^staging$/ })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /^old-experiment$/ })).toBeVisible();

  // The staging branch surfaces the "OPEN" marker; master does not.
  const stagingRow = adminPage.locator('tr').filter({ hasText: /^staging/ });
  await expect(stagingRow).toContainText(/OPEN/);
  const masterRow = adminPage.locator('tr').filter({ hasText: /^master/ });
  await expect(masterRow).not.toContainText(/OPEN/);
});

test('Graph / Table view toggle swaps the branch panel', async ({ adminPage }) => {
  await mockBranchesPage(adminPage, { dataset: DATASET, branches: [MASTER, STAGING] });
  await adminPage.goto(`/datasets/${DATASET_ID}/branches`);

  // Default view is Graph — the sidebar shows the selected branch detail
  // with an "Open branch detail" link, and there is no branch table.
  await expect(adminPage.getByText('Selected branch', { exact: true })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /open branch detail/i })).toBeVisible();
  expect(await adminPage.locator('table.of-table').count()).toBe(0);

  await adminPage.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(adminPage.locator('table.of-table')).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /open branch detail/i })).toHaveCount(0);

  await adminPage.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(adminPage.getByText('Selected branch', { exact: true })).toBeVisible();
  expect(await adminPage.locator('table.of-table').count()).toBe(0);
});

test('"+ New branch" opens the CreateBranchDialog and POSTs /branches with the v2 source shape', async ({
  adminPage,
}) => {
  await mockBranchesPage(adminPage, { dataset: DATASET, branches: [MASTER] });
  const cap = captureRequests(adminPage, DATASET_BRANCHES);

  await adminPage.goto(`/datasets/${DATASET_ID}/branches`);

  await adminPage.getByRole('button', { name: /\+ ?new branch/i }).click();

  const dialog = adminPage.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /^create branch$/i })).toBeVisible();

  await dialog.getByLabel(/branch name/i).fill('feature-x');

  // The default Source radio is "From another branch" with master pre-selected.
  await dialog.getByRole('button', { name: /^create$/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.url).toMatch(new RegExp(`/api/v1/datasets/${DATASET_ID}/branches$`));
  expect(post?.body).toMatchObject({
    name: 'feature-x',
    source: { from_branch: 'master' },
  });

  // Dialog closes; the stateful mock + reload surfaces the new row.
  await expect(dialog).toHaveCount(0);
  await adminPage.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(adminPage.getByRole('link', { name: /^feature-x$/ })).toBeVisible();
});

test('Table view Delete: window.confirm + DELETE /branches/:name removes the row', async ({
  adminPage,
}) => {
  await mockBranchesPage(adminPage, { dataset: DATASET, branches: [MASTER, STAGING] });
  const cap = captureRequests(adminPage, DATASET_BRANCH_DELETE);

  await adminPage.goto(`/datasets/${DATASET_ID}/branches`);
  await adminPage.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(adminPage.getByRole('link', { name: /^staging$/ })).toBeVisible();

  // The page calls window.confirm() before DELETE — auto-accept the
  // next dialog so the request fires.
  adminPage.once('dialog', (dialog) => {
    expect(dialog.message()).toMatch(/Delete branch staging\?/i);
    void dialog.accept();
  });

  const stagingRow = adminPage.locator('tr').filter({ hasText: /^staging/ });
  await stagingRow.getByRole('button', { name: /^delete$/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'DELETE').length)
    .toBeGreaterThanOrEqual(1);
  const del = cap.calls.find((c) => c.method === 'DELETE');
  expect(del?.url).toMatch(new RegExp(`/api/v1/datasets/${DATASET_ID}/branches/staging$`));

  // Stateful mock + reload drops the row.
  await expect(adminPage.getByRole('link', { name: /^staging$/ })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: /^master\s*★/ })).toBeVisible();
});

test('clicking a branch name in the Table view navigates to /datasets/:id/branches/:name', async ({
  adminPage,
}) => {
  await mockBranchesPage(adminPage, { dataset: DATASET, branches: [MASTER, STAGING] });
  await adminPage.goto(`/datasets/${DATASET_ID}/branches`);
  await adminPage.getByRole('button', { name: 'Table', exact: true }).click();

  const link = adminPage.getByRole('link', { name: /^staging$/ });
  await expect(link).toHaveAttribute(
    'href',
    `/datasets/${DATASET_ID}/branches/staging`,
  );
  await link.click();
  await expect(adminPage).toHaveURL(
    new RegExp(`/datasets/${DATASET_ID}/branches/staging$`),
  );
});

test('absent today: "Merge to main" button, Abandon (PATCH status) action, and status filter', async ({
  adminPage,
}) => {
  // Single regression guard for the three roadmap controls that don't
  // ship today. Each `count() === 0` flips when the feature lands,
  // forcing an update of this file.
  await mockBranchesPage(adminPage, {
    dataset: DATASET,
    branches: [MASTER, STAGING, ARCHIVED],
  });
  const cap = captureRequests(adminPage, DATASET_BRANCHES);

  await adminPage.goto(`/datasets/${DATASET_ID}/branches`);
  await adminPage.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(adminPage.getByRole('link', { name: /^staging$/ })).toBeVisible();

  // 1. No "Merge to main" / "Merge" button anywhere on the page —
  //    neither in the toolbar nor per-row.
  expect(
    await adminPage.getByRole('button', { name: /^merge( to main)?$/i }).count(),
  ).toBe(0);
  expect(await adminPage.getByRole('button', { name: /conflict/i }).count()).toBe(0);

  // 2. No "Abandon" action — the per-row mutation is "Delete" (DELETE
  //    /branches/:name), and Delete is firing no PATCH requests.
  expect(await adminPage.getByRole('button', { name: /^abandon$/i }).count()).toBe(0);

  // 3. No status filter dropdown / radio — `active / merged / abandoned`
  //    is not part of the wire shape, so no UI for it exists.
  expect(
    await adminPage.getByLabel(/status/i, { exact: false }).count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('combobox', { name: /status|state|filter/i })
      .count(),
  ).toBe(0);

  // 4. Sanity: no PATCH ever fires on the branches collection (delete is
  //    a DELETE on /branches/:name, not a PATCH with `{ status: ... }`).
  expect(cap.calls.filter((c) => c.method === 'PATCH').length).toBe(0);
});
