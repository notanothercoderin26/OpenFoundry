import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/datasets/:id/branches/:branch`
 * (apps/web/src/routes/datasets/DatasetBranchDetailPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a 5-tab branch surface
 * (Overview / Compare / History / Retention / Security) and does NOT
 * carry the roadmap's promote / commit primitives:
 *
 *   - "Divergence" is exposed via the Compare tab's
 *     `BranchCompareSummary`: `a_only_transactions`,
 *     `b_only_transactions`, and `conflicting_files`. There is no
 *     "X commits ahead/behind" badge in the header.
 *   - The diff is SCHEMA + FILES only (via /schema?branch= and
 *     /files?branch= per side). There is no row-level / data diff.
 *   - There is no "Promote to main" action and no commit-creation UI
 *     (no message textarea, no file picker). Branch mutations on this
 *     page are: Restore (if archived), Delete (with type-to-confirm),
 *     and Save retention (PATCH /branches/:name/retention).
 *   - The Compare tab takes TWO arbitrary branches via Side A / Side B
 *     `<select>`s — comparing against the parent is just the default,
 *     not a hard-wired "main vs current".
 *
 * Endpoints exercised on mount:
 *   - GET /api/v1/datasets/{id}
 *   - GET /api/v1/datasets/{id}/branches
 *   - GET /api/v1/datasets/{id}/transactions
 *   - GET /api/v1/datasets/{id}/branches/{name}/markings
 *
 * Per-tab additions:
 *   - Compare → GET /api/v1/datasets/{id}/schema?branch=
 *             → GET /api/v1/datasets/{id}/files?branch=
 *             → GET /api/v1/datasets/{id}/branches/compare?base=&compare=
 *   - Delete  → GET /api/v1/datasets/{id}/branches/{name}/preview-delete
 *
 * Mutations:
 *   - PATCH  /api/v1/datasets/{id}/branches/{name}/retention
 *   - DELETE /api/v1/datasets/{id}/branches/{name}
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
const DATASET_ID = 'dataset-branch-detail-1';
const BRANCH_NAME = 'staging';

const DATASET_RESOURCE = new RegExp(`/api/v1/datasets/${DATASET_ID}(\\?|$)`);
const DATASET_BRANCHES = new RegExp(`/api/v1/datasets/${DATASET_ID}/branches(\\?|$)`);
const DATASET_BRANCHES_COMPARE = new RegExp(`/api/v1/datasets/${DATASET_ID}/branches/compare`);
const DATASET_BRANCH_MARKINGS = new RegExp(
  `/api/v1/datasets/${DATASET_ID}/branches/[^/?#]+/markings`,
);
const DATASET_BRANCH_RETENTION = new RegExp(
  `/api/v1/datasets/${DATASET_ID}/branches/[^/?#]+/retention`,
);
const DATASET_BRANCH_PREVIEW_DELETE = new RegExp(
  `/api/v1/datasets/${DATASET_ID}/branches/[^/?#]+/preview-delete`,
);
const DATASET_BRANCH_RESOURCE = new RegExp(
  `/api/v1/datasets/${DATASET_ID}/branches/[^/?#]+(\\?|$)`,
);
const DATASET_TRANSACTIONS = new RegExp(`/api/v1/datasets/${DATASET_ID}/transactions(\\?|$)`);
const DATASET_SCHEMA = new RegExp(`/api/v1/datasets/${DATASET_ID}/schema(\\?|$)`);
const DATASET_FILES = new RegExp(`/api/v1/datasets/${DATASET_ID}/files(\\?|$)`);

interface BranchFixture {
  id: string;
  dataset_id: string;
  name: string;
  version: number;
  description: string;
  is_default: boolean;
  parent_branch_id?: string | null;
  head_transaction_id?: string | null;
  created_from_transaction_id?: string | null;
  has_open_transaction?: boolean;
  archived_at?: string | null;
  last_activity_at?: string;
  retention_policy?: 'INHERITED' | 'FOREVER' | 'TTL_DAYS';
  retention_ttl_days?: number | null;
  fallback_chain?: string[];
  labels?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

function makeBranch(overrides: Partial<BranchFixture> = {}): BranchFixture {
  return {
    id: 'b-1',
    dataset_id: DATASET_ID,
    name: 'master',
    version: 1,
    description: '',
    is_default: true,
    parent_branch_id: null,
    head_transaction_id: 'ri.txn.master-head',
    created_from_transaction_id: null,
    has_open_transaction: false,
    archived_at: null,
    last_activity_at: E2E_NOW,
    retention_policy: 'INHERITED',
    retention_ttl_days: null,
    fallback_chain: [],
    labels: {},
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const DATASET = {
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
};

const MASTER = makeBranch({
  id: 'b-master',
  name: 'master',
  is_default: true,
  parent_branch_id: null,
  head_transaction_id: 'ri.txn.master-head',
});
const STAGING = makeBranch({
  id: 'b-staging',
  name: BRANCH_NAME,
  is_default: false,
  parent_branch_id: 'b-master',
  head_transaction_id: 'ri.txn.staging-head',
  created_from_transaction_id: 'ri.txn.master-head',
  has_open_transaction: true,
  description: 'Pre-prod branch for the Q1 cleanup',
  labels: { ticket: 'PR-123' },
  fallback_chain: ['master'],
});

const TRANSACTIONS = [
  {
    id: 'txn-staging-001',
    dataset_id: DATASET_ID,
    branch_name: BRANCH_NAME,
    operation: 'APPEND',
    status: 'COMMITTED',
    summary: 'Late arrivals batch',
    metadata: {},
    created_at: E2E_NOW,
    committed_at: E2E_NOW,
  },
  {
    id: 'txn-staging-002',
    dataset_id: DATASET_ID,
    branch_name: BRANCH_NAME,
    operation: 'UPDATE',
    status: 'COMMITTED',
    summary: 'Repair miscoded SKUs',
    metadata: {},
    created_at: E2E_NOW,
    committed_at: E2E_NOW,
  },
  {
    id: 'txn-master-100',
    dataset_id: DATASET_ID,
    branch_name: 'master',
    operation: 'SNAPSHOT',
    status: 'COMMITTED',
    summary: 'Master snapshot',
    metadata: {},
    created_at: E2E_NOW,
    committed_at: E2E_NOW,
  },
];

interface MockOptions {
  branches?: BranchFixture[];
  transactions?: typeof TRANSACTIONS;
}

async function mockBranchDetail(page: Page, opts: MockOptions = {}): Promise<void> {
  const branches = opts.branches ?? [MASTER, STAGING];
  const transactions = opts.transactions ?? TRANSACTIONS;

  await page.route(DATASET_RESOURCE, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: DATASET });
  });

  // Compare endpoint is `/branches/compare` — register it BEFORE the
  // broader `/branches/{name}/...` patterns so the most-recent dispatch
  // doesn't accidentally treat it like a single-branch sub-path.
  await page.route(DATASET_BRANCHES_COMPARE, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    await route.fulfill({
      json: {
        base_branch: url.searchParams.get('base') ?? 'master',
        compare_branch: url.searchParams.get('compare') ?? BRANCH_NAME,
        lca_branch_rid: 'ri.branch.master',
        a_only_transactions: [
          {
            transaction_rid: 'ri.txn.a1',
            transaction_id: 'txn-a1',
            branch: 'master',
            tx_type: 'APPEND',
            status: 'COMMITTED',
            committed_at: E2E_NOW,
            files_changed: 2,
          },
        ],
        b_only_transactions: [
          {
            transaction_rid: 'ri.txn.b1',
            transaction_id: 'txn-b1',
            branch: BRANCH_NAME,
            tx_type: 'APPEND',
            status: 'COMMITTED',
            committed_at: E2E_NOW,
            files_changed: 1,
          },
          {
            transaction_rid: 'ri.txn.b2',
            transaction_id: 'txn-b2',
            branch: BRANCH_NAME,
            tx_type: 'UPDATE',
            status: 'COMMITTED',
            committed_at: E2E_NOW,
            files_changed: 1,
          },
        ],
        conflicting_files: [
          {
            logical_path: 'data/orders.csv',
            a_transaction_rid: 'ri.txn.a1',
            b_transaction_rid: 'ri.txn.b1',
            content_hash_a: 'sha256:aaa',
            content_hash_b: 'sha256:bbb',
          },
        ],
      },
    });
  });

  // Schema endpoint is shared across both sides of Compare — return
  // different fields based on the `branch` query so the schema diff
  // panel surfaces the added column.
  await page.route(DATASET_SCHEMA, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const branchParam = url.searchParams.get('branch') ?? 'master';
    const baseFields = [
      { name: 'order_id', type: 'LONG', nullable: false },
      { name: 'amount', type: 'DOUBLE', nullable: true },
    ];
    const stagingFields = [
      ...baseFields,
      { name: 'note', type: 'STRING', nullable: true },
    ];
    await route.fulfill({
      json: {
        id: `schema-${branchParam}`,
        dataset_id: DATASET_ID,
        fields: branchParam === BRANCH_NAME ? stagingFields : baseFields,
        created_at: E2E_NOW,
      },
    });
  });

  await page.route(DATASET_FILES, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { branch: 'master', total: 0, files: [], data: [] },
    });
  });

  // Markings endpoint — empty markings keeps the Security tab happy.
  await page.route(DATASET_BRANCH_MARKINGS, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { effective: [], explicit: [], inherited_from_parent: [] },
    });
  });

  // PATCH /branches/{name}/retention — return a normal success body.
  await page.route(DATASET_BRANCH_RETENTION, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = (route.request().postDataJSON() ?? {}) as { policy?: string; ttl_days?: number | null };
    await route.fulfill({
      json: { branch: BRANCH_NAME, policy: body.policy ?? 'INHERITED', ttl_days: body.ttl_days ?? null },
    });
  });

  // GET /branches/{name}/preview-delete (DeleteBranchDialog).
  await page.route(DATASET_BRANCH_PREVIEW_DELETE, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        branch: BRANCH_NAME,
        branch_rid: 'ri.branch.staging',
        current_parent: 'master',
        current_parent_rid: 'ri.branch.master',
        children_to_reparent: [],
        transactions_preserved: true,
        head_transaction: { id: 'ri.txn.staging-head', rid: 'ri.txn.staging-head' },
      },
    });
  });

  // The branch resource itself: GET list, DELETE one. Order matters —
  // `/branches/(?:[^/?#]+)` matches both `/branches/compare`, `/branches/{name}`,
  // and `/branches/{name}/markings`. Specific routes above already
  // intercept the latter; this catch handles the bare DELETE.
  await page.route(DATASET_BRANCHES, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: branches });
      return;
    }
    await route.fallback();
  });

  await page.route(DATASET_BRANCH_RESOURCE, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    const match = /\/branches\/([^/?#]+)/.exec(route.request().url());
    const name = match ? decodeURIComponent(match[1]) : BRANCH_NAME;
    await route.fulfill({
      json: { branch: name, branch_rid: `ri.branch.${name}`, reparented: [] },
    });
  });

  await page.route(DATASET_TRANSACTIONS, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: transactions });
  });
}

test('Overview: renders branch name, parent subtitle, status chips, and the 5 tabs', async ({
  adminPage,
}) => {
  await mockBranchDetail(adminPage);
  await adminPage.goto(`/datasets/${DATASET_ID}/branches/${BRANCH_NAME}`);

  // Branch name is the h1; the subtitle exposes the dataset + parent.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: BRANCH_NAME }),
  ).toBeVisible();
  await expect(adminPage.getByText(/parent master/i)).toBeVisible();
  await expect(adminPage.getByText(/head ri\.txn\./i)).toBeVisible();

  // Status chips: NOT default + Open transaction (the staging fixture
  // is_default=false, has_open_transaction=true).
  await expect(adminPage.getByText('Open transaction', { exact: true })).toBeVisible();
  await expect(adminPage.getByText(/Policy INHERITED/i)).toBeVisible();

  // Tab list.
  for (const label of ['Overview', 'Compare', 'History', 'Retention', 'Security']) {
    await expect(adminPage.getByRole('tab', { name: label, exact: true })).toBeVisible();
  }

  // Overview content surfaces description + parent + head from the dl.
  await expect(adminPage.getByText(/pre-prod branch for the q1 cleanup/i)).toBeVisible();
  await expect(adminPage.getByText('Fallback chain', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('ticket=PR-123', { exact: true })).toBeVisible();
});

test('Compare tab: two-branch picker loads schema/files + divergence summary', async ({
  adminPage,
}) => {
  await mockBranchDetail(adminPage);
  const cap = captureRequests(adminPage, DATASET_BRANCHES_COMPARE);

  await adminPage.goto(`/datasets/${DATASET_ID}/branches/${BRANCH_NAME}`);
  await adminPage.getByRole('tab', { name: 'Compare', exact: true }).click();

  // Side A defaults to the parent (master), Side B to the current branch.
  await expect(adminPage.getByText('Schema and file diff', { exact: true })).toBeVisible();
  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const compareUrl = cap.last()?.url ?? '';
  expect(compareUrl).toMatch(/[?&]base=master\b/);
  expect(compareUrl).toMatch(new RegExp(`[?&]compare=${BRANCH_NAME}\\b`));

  // BranchCompareSummary surfaces counts + conflict path from the mock.
  await expect(adminPage.getByText(/^Only on master \(1\)$/)).toBeVisible();
  await expect(adminPage.getByText(`Only on ${BRANCH_NAME} (2)`)).toBeVisible();
  await expect(adminPage.getByText(/^Conflicts \(1\)$/)).toBeVisible();
  await expect(adminPage.getByText('data/orders.csv', { exact: true })).toBeVisible();

  // Schema diff panel highlights the staging-only `note` column as added.
  await expect(adminPage.getByText('Schema diff', { exact: true })).toBeVisible();
  await expect(adminPage.getByText('note', { exact: true })).toBeVisible();
});

test('Compare tab: swapping Side A to a third branch re-fires /branches/compare with the new base', async ({
  adminPage,
}) => {
  const dev = makeBranch({
    id: 'b-dev',
    name: 'dev',
    is_default: false,
    parent_branch_id: 'b-master',
    head_transaction_id: 'ri.txn.dev-head',
  });
  await mockBranchDetail(adminPage, { branches: [MASTER, STAGING, dev] });
  const cap = captureRequests(adminPage, DATASET_BRANCHES_COMPARE);

  await adminPage.goto(`/datasets/${DATASET_ID}/branches/${BRANCH_NAME}`);
  await adminPage.getByRole('tab', { name: 'Compare', exact: true }).click();
  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const initial = cap.count();

  // The Side A picker option values look like `branch:<name>`.
  const sideA = adminPage.getByRole('combobox').first();
  await sideA.selectOption('branch:dev');

  await expect.poll(() => cap.count()).toBeGreaterThan(initial);
  expect(cap.last()?.url).toMatch(/[?&]base=dev\b/);
});

test('History tab: renders only the transactions for this branch', async ({ adminPage }) => {
  await mockBranchDetail(adminPage);
  await adminPage.goto(`/datasets/${DATASET_ID}/branches/${BRANCH_NAME}`);
  await adminPage.getByRole('tab', { name: 'History', exact: true }).click();

  // Two staging transactions visible; the master-only row is filtered out.
  await expect(adminPage.getByText('Late arrivals batch')).toBeVisible();
  await expect(adminPage.getByText('Repair miscoded SKUs')).toBeVisible();
  await expect(adminPage.getByText('Master snapshot')).toHaveCount(0);
});

test('Retention tab: switching to TTL_DAYS + Save PATCHes /branches/:name/retention', async ({
  adminPage,
}) => {
  await mockBranchDetail(adminPage);
  const cap = captureRequests(adminPage, DATASET_BRANCH_RETENTION);

  await adminPage.goto(`/datasets/${DATASET_ID}/branches/${BRANCH_NAME}`);
  await adminPage.getByRole('tab', { name: 'Retention', exact: true }).click();

  await adminPage.getByRole('radio', { name: /TTL_DAYS/ }).check();
  const ttlInput = adminPage.getByLabel(/TTL \(days\)/i);
  await ttlInput.fill('30');
  await adminPage.getByRole('button', { name: /save retention/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'PATCH').length)
    .toBeGreaterThanOrEqual(1);
  const patch = cap.calls.find((c) => c.method === 'PATCH');
  expect(patch?.url).toMatch(
    new RegExp(`/api/v1/datasets/${DATASET_ID}/branches/${BRANCH_NAME}/retention$`),
  );
  expect(patch?.body).toMatchObject({ policy: 'TTL_DAYS', ttl_days: 30 });
});

test('Delete branch: dialog requires typing the branch name, then DELETEs and navigates to /branches', async ({
  adminPage,
}) => {
  await mockBranchDetail(adminPage);
  const cap = captureRequests(adminPage, DATASET_BRANCH_RESOURCE);

  await adminPage.goto(`/datasets/${DATASET_ID}/branches/${BRANCH_NAME}`);
  await adminPage.getByRole('button', { name: /delete branch/i }).click();

  const dialog = adminPage.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(new RegExp(`Delete branch.+${BRANCH_NAME}`, 'i'))).toBeVisible();

  // Delete is disabled until the typed text exactly matches the branch name.
  const deleteBtn = dialog.getByRole('button', { name: /^delete$/i });
  await expect(deleteBtn).toBeDisabled();

  await dialog.getByLabel(/type .* to confirm/i).fill(BRANCH_NAME);
  await expect(deleteBtn).toBeEnabled();
  await deleteBtn.click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'DELETE').length)
    .toBeGreaterThanOrEqual(1);
  expect(cap.calls.find((c) => c.method === 'DELETE')?.url).toMatch(
    new RegExp(`/api/v1/datasets/${DATASET_ID}/branches/${BRANCH_NAME}$`),
  );

  // onDeleted navigates back to the branches list.
  await expect(adminPage).toHaveURL(
    new RegExp(`/datasets/${DATASET_ID}/branches$`),
  );
});

test('absent today: "Promote to main" action, commit-create UI, and row-level data diff', async ({
  adminPage,
}) => {
  // Single regression guard for the three roadmap controls that don't
  // ship on this page. Each `count() === 0` flips when the feature
  // lands and forces an update of this file.
  await mockBranchDetail(adminPage);
  await adminPage.goto(`/datasets/${DATASET_ID}/branches/${BRANCH_NAME}`);

  // 1. No "Promote to main" / "Promote" button.
  expect(
    await adminPage.getByRole('button', { name: /^promote( to main)?$/i }).count(),
  ).toBe(0);
  // 2. No "Merge" action either — the page has no merge primitive.
  expect(
    await adminPage.getByRole('button', { name: /^merge( to main)?$/i }).count(),
  ).toBe(0);
  // 3. No commit-creation surface: no "Create commit" / "Commit" button
  //    and no "Commit message" textbox.
  expect(
    await adminPage.getByRole('button', { name: /^(create )?commit$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('textbox', { name: /commit message/i }).count(),
  ).toBe(0);

  // 4. No row-level / data diff. The Compare tab exposes Schema diff +
  //    Files diff only; there is no "Rows added / modified / deleted"
  //    breakdown anywhere.
  await adminPage.getByRole('tab', { name: 'Compare', exact: true }).click();
  await expect(adminPage.getByText('Schema diff', { exact: true })).toBeVisible();
  expect(
    await adminPage.getByText(/rows? (added|modified|deleted|removed)/i).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /^(data|row) diff$/i }).count(),
  ).toBe(0);
});
