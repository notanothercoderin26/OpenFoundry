import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/restricted-views`
 * (apps/web/src/routes/control-panel/RestrictedViewsPage.tsx).
 *
 * **Reality check.** TanStack-Query-backed admin for SG.6 restricted
 * views — dataset-backed views with policy / placement / owners /
 * markings / build metadata / transaction history. The page is
 * permission-gated: the caller needs `restricted_view:read`,
 * `restricted_view_policy:read`, `policies:read`, or
 * `control_panel:write` (or the `admin` role). The check uses a
 * `canRestrictedView(roles, permissions, accepted)` helper that
 * also accepts `*:*` and `<resource>:*` wildcards.
 *
 * The page composes:
 *
 *   - Header + back link + (admin-only) "+ New view" button.
 *   - List panel with a search input + per-view chip buttons (name,
 *     backing dataset, build_status chip, transactions count).
 *   - "Edit/Create resource" form: typed fields (Name, Backing
 *     dataset RID, Dataset branch, Project RID, Folder RID, Path,
 *     Owners, Assumed markings, Allowed org IDs, Allowed markings,
 *     Hidden columns, Marking columns, Row filter), the
 *     `GranularPolicyEditor`, four JSON `<textarea>` fields (Policy
 *     JSON, Conditions JSON, Output metadata, View metadata), three
 *     toggle checkboxes (Enabled / Guest access / Consumer mode).
 *   - "Builds and transactions" sub-panel (admin/builder-only) with
 *     "Transform input" + "Build" buttons + a transactions table.
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (lista de vistas restringidas) ✅
 *   - Case 2 ("crear: dataset/object set + condición + roles
 *     autorizados") ⚠️ — backing is dataset-only (no object set);
 *     "condition" → free-form Conditions JSON; "roles autorizados"
 *     → owner_ids + allowed_markings + allowed_org_ids (not roles
 *     directly).
 *   - Case 3 (test con diferentes roles) ✅ — `viewerPage` lacks the
 *     required permissions and sees the "Permission required" gate.
 *   - Case 4 (eliminar) ✅
 *
 * Endpoints (mirrors `src/lib/api/restricted-views.ts`):
 *   - GET    /api/v1/restricted-views                → RestrictedViewRecord[]
 *   - POST   /api/v1/restricted-views                → RestrictedViewRecord
 *   - PATCH  /api/v1/restricted-views/:id            → RestrictedViewRecord
 *   - DELETE /api/v1/restricted-views/:id            → 204
 *   - POST   /api/v1/restricted-views/:id/build      → RestrictedViewRecord
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /^console\.error: %o$/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const E2E_NOW = '2026-05-11T00:00:00Z';

interface RestrictedViewRecord {
  id: string;
  name: string;
  description: string | null;
  backing_dataset_rid: string;
  backing_dataset_branch: string | null;
  project_rid: string | null;
  folder_rid: string | null;
  path: string | null;
  owner_ids: string[];
  resource: string;
  action: string;
  conditions: Record<string, unknown>;
  policy: Record<string, unknown>;
  row_filter: string | null;
  hidden_columns: string[];
  marking_columns: string[];
  allowed_org_ids: string[];
  allowed_markings: string[];
  assumed_markings: string[];
  transactions: { id: string; kind: string; status: string; branch_name?: string; completed_at?: string }[];
  output_metadata: Record<string, unknown>;
  view_metadata: Record<string, unknown>;
  transform_input_blocked: boolean;
  last_built_at: string | null;
  build_status: string;
  consumer_mode_enabled: boolean;
  allow_guest_access: boolean;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// `validateGranularPolicyText` requires policies to deserialize to
// `{ kind: 'granular_policy', version: 1, root: { ..., children: [≥1
// rules] } }` — otherwise the Save button stays disabled. Mirror the
// shipped DEFAULT_GRANULAR_POLICY here so seeded views are saveable.
const VALID_POLICY = {
  kind: 'granular_policy',
  version: 1,
  root: {
    id: 'root',
    type: 'group',
    operator: 'and',
    children: [
      {
        id: 'rule-1',
        type: 'comparison',
        left: { kind: 'column', column: 'organization_id' },
        operator: 'equals',
        right: { kind: 'user_organization_id' },
      },
    ],
  },
};

function makeView(overrides: Partial<RestrictedViewRecord> = {}): RestrictedViewRecord {
  return {
    id: 'rv-1',
    name: 'PII restricted',
    description: 'PII view with row filter',
    backing_dataset_rid: 'ri.datasets.acme.customers',
    backing_dataset_branch: 'master',
    project_rid: 'ri.projects.acme',
    folder_rid: null,
    path: '/customers/pii',
    owner_ids: ['user-owner-1'],
    resource: 'datasets',
    action: 'read',
    conditions: { subject: {}, resource: {} },
    policy: VALID_POLICY,
    row_filter: 'region = "us"',
    hidden_columns: ['ssn', 'dob'],
    marking_columns: [],
    allowed_org_ids: ['org-acme'],
    allowed_markings: ['public', 'pii-sensitive'],
    assumed_markings: ['public'],
    transactions: [
      { id: 'txn-1', kind: 'build', status: 'success', branch_name: 'master', completed_at: E2E_NOW },
    ],
    output_metadata: { output_kind: 'restricted_view' },
    view_metadata: { view_kind: 'dataset_backed' },
    transform_input_blocked: true,
    last_built_at: '2026-05-10T08:00:00Z',
    build_status: 'success',
    consumer_mode_enabled: false,
    allow_guest_access: false,
    enabled: true,
    created_by: 'admin-user',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const VIEW_PII = makeView({
  id: 'rv-pii',
  name: 'PII restricted',
});
const VIEW_FINANCE = makeView({
  id: 'rv-finance',
  name: 'Finance summary',
  backing_dataset_rid: 'ri.datasets.acme.finance',
  path: '/finance/summary',
  build_status: 'not_built',
  enabled: false,
  transactions: [],
  last_built_at: null,
});

// Endpoint patterns
const VIEWS_LIST = /\/api\/v1\/restricted-views$/;
const VIEW_BY_ID = (id: string) => new RegExp(`/api/v1/restricted-views/${id}$`);
const VIEW_BUILD = (id: string) => new RegExp(`/api/v1/restricted-views/${id}/build$`);

interface MockOpts {
  views?: RestrictedViewRecord[];
}

async function mockRestrictedViews(page: Page, opts: MockOpts = {}) {
  const views = opts.views ?? [];
  await page.route(VIEWS_LIST, async (route: Route) => {
    if (route.request().method() === 'GET') {
      // listRestrictedViews expects a raw array, NOT an envelope —
      // the catch-all's `{data: [], …}` would crash `views.find`.
      await route.fulfill({ json: views });
      return;
    }
    await route.fallback();
  });
  return captureRequests(page, VIEWS_LIST);
}

async function waitForRequest(
  cap: ReturnType<typeof captureRequests>,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
) {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === method).length)
    .toBeGreaterThanOrEqual(1);
  const matching = cap.calls.filter((c) => c.method === method);
  return matching[matching.length - 1];
}

// ---------------------------------------------------------------------------
// Case 1 — list + filter
// ---------------------------------------------------------------------------

test('lists restricted views with their status chips + filter narrows the list', async ({
  adminPage,
}) => {
  await mockRestrictedViews(adminPage, { views: [VIEW_PII, VIEW_FINANCE] });
  await adminPage.goto('/control-panel/restricted-views');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^restricted views$/i }),
  ).toBeVisible();

  // Both view chips render.
  const piiChip = adminPage.getByRole('button').filter({ hasText: /^PII restricted/ });
  const financeChip = adminPage.getByRole('button').filter({ hasText: /^Finance summary/ });
  await expect(piiChip).toBeVisible();
  await expect(financeChip).toBeVisible();

  // Chips carry status + transactions count.
  await expect(piiChip).toContainText(/Enabled/i);
  await expect(piiChip).toContainText(/transactions\s+1/i);
  await expect(financeChip).toContainText(/Disabled/i);
  await expect(financeChip).toContainText(/not_built/i);

  // Filter to "finance" → PII drops. The search input has no
  // accessible name (no <label>, only a placeholder).
  await adminPage.getByPlaceholder(/search restricted views/i).fill('finance');
  await expect(financeChip).toBeVisible();
  await expect(piiChip).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Case 2 — Create: POSTs the typed + JSON body
// ---------------------------------------------------------------------------

test('create restricted view: + New view → fill form → POST /restricted-views', async ({
  adminPage,
}) => {
  await mockRestrictedViews(adminPage, { views: [] });
  const cap = captureRequests(adminPage, VIEWS_LIST);
  await adminPage.route(VIEWS_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeView({ id: 'rv-new-1', name: 'Sales export', backing_dataset_rid: 'ri.datasets.sales' }),
    });
  });

  await adminPage.goto('/control-panel/restricted-views');
  await adminPage.getByRole('button', { name: /^new view$/i }).click();

  // Scope through the form's section to avoid colliding with the
  // top-bar Workshop chrome "Save" button.
  const form = adminPage
    .getByRole('heading', { level: 2, name: /^new restricted view$/i })
    .locator('xpath=ancestor::section[1]');
  await form.getByRole('textbox', { name: /^name$/i }).fill('Sales export');
  await form
    .getByRole('textbox', { name: /^backing dataset rid$/i })
    .fill('ri.datasets.sales');
  await form.getByRole('textbox', { name: /^owners$/i }).fill('user-owner-1, user-owner-2');
  await form.getByRole('textbox', { name: /^allowed markings$/i }).fill('public, finance');
  await form.getByRole('textbox', { name: /^allowed org ids$/i }).fill('org-acme');
  await form.getByRole('textbox', { name: /^hidden columns$/i }).fill('account_id');
  await form.getByRole('textbox', { name: /^row filter$/i }).fill('country = "US"');

  await form.getByRole('button', { name: /^save$/i }).click();

  const post = await waitForRequest(cap, 'POST');
  expect(post.body).toMatchObject({
    name: 'Sales export',
    backing_dataset_rid: 'ri.datasets.sales',
    owner_ids: ['user-owner-1', 'user-owner-2'],
    allowed_markings: ['public', 'finance'],
    allowed_org_ids: ['org-acme'],
    hidden_columns: ['account_id'],
    row_filter: 'country = "US"',
    resource: 'datasets',
    action: 'read',
    enabled: true,
    allow_guest_access: false,
    consumer_mode_enabled: false,
  });

  // Success banner appears after the mutation resolves.
  await expect(adminPage.locator('.of-status-success').first()).toContainText(/created/i);
});

// ---------------------------------------------------------------------------
// Edit + Save → PATCH
// ---------------------------------------------------------------------------

test('edit restricted view: selecting a view pre-populates the form; Save PATCHes /restricted-views/:id', async ({
  adminPage,
}) => {
  await mockRestrictedViews(adminPage, { views: [VIEW_PII] });
  const cap = captureRequests(adminPage, VIEW_BY_ID(VIEW_PII.id));
  await adminPage.route(VIEW_BY_ID(VIEW_PII.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({
      json: makeView({ ...VIEW_PII, allowed_markings: ['public', 'pii-restricted'] }),
    });
  });

  await adminPage.goto('/control-panel/restricted-views');

  // The first view auto-selects → the edit-form h2 carries the
  // view's name. Scope through that section.
  const form = adminPage
    .getByRole('heading', { level: 2, name: /^PII restricted$/ })
    .locator('xpath=ancestor::section[1]');
  await expect(form.getByRole('textbox', { name: /^name$/i })).toHaveValue('PII restricted');
  await expect(
    form.getByRole('textbox', { name: /^backing dataset rid$/i }),
  ).toHaveValue('ri.datasets.acme.customers');
  await expect(
    form.getByRole('textbox', { name: /^allowed markings$/i }),
  ).toHaveValue('public, pii-sensitive');

  // Edit allowed_markings + save.
  await form
    .getByRole('textbox', { name: /^allowed markings$/i })
    .fill('public, pii-restricted');
  await form.getByRole('button', { name: /^save$/i }).click();

  const patch = await waitForRequest(cap, 'PATCH');
  expect(patch.body).toMatchObject({
    name: 'PII restricted',
    backing_dataset_rid: 'ri.datasets.acme.customers',
    allowed_markings: ['public', 'pii-restricted'],
  });
  await expect(adminPage.locator('.of-status-success').first()).toContainText(/updated/i);
});

// ---------------------------------------------------------------------------
// Case 4 — Delete
// ---------------------------------------------------------------------------

test('delete restricted view: clicking Delete DELETEs /restricted-views/:id and surfaces the notice', async ({
  adminPage,
}) => {
  await mockRestrictedViews(adminPage, { views: [VIEW_PII] });
  const cap = captureRequests(adminPage, VIEW_BY_ID(VIEW_PII.id));
  await adminPage.route(VIEW_BY_ID(VIEW_PII.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  await adminPage.goto('/control-panel/restricted-views');
  await expect(adminPage.getByRole('textbox', { name: /^name$/i })).toHaveValue('PII restricted');

  await adminPage.getByRole('button', { name: /^delete$/i }).click();

  const del = await waitForRequest(cap, 'DELETE');
  expect(del.method).toBe('DELETE');
  await expect(adminPage.locator('.of-status-success').first()).toContainText(/deleted/i);
});

// ---------------------------------------------------------------------------
// Build action — admin/builder-only POST /build
// ---------------------------------------------------------------------------

test('rebuild: clicking Build POSTs /restricted-views/:id/build and refreshes the form', async ({
  adminPage,
}) => {
  await mockRestrictedViews(adminPage, { views: [VIEW_PII] });
  const cap = captureRequests(adminPage, VIEW_BUILD(VIEW_PII.id));
  await adminPage.route(VIEW_BUILD(VIEW_PII.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: makeView({ ...VIEW_PII, build_status: 'success', last_built_at: E2E_NOW }),
    });
  });

  await adminPage.goto('/control-panel/restricted-views');
  await expect(adminPage.getByRole('textbox', { name: /^name$/i })).toHaveValue('PII restricted');

  await adminPage.getByRole('button', { name: /^build$/i }).click();

  const post = await waitForRequest(cap, 'POST');
  expect(post.body).toMatchObject({
    branch_name: 'master',
    reason: 'manual rebuild from Control Panel',
  });
  await expect(adminPage.locator('.of-status-success').first()).toContainText(/build recorded/i);
});

// ---------------------------------------------------------------------------
// Case 3 — Different roles: viewer sees the "Permission required" gate
// ---------------------------------------------------------------------------

test('different roles: viewerPage (read:* only) sees "Permission required" instead of the form', async ({
  viewerPage,
}) => {
  // No list mock is needed — `useQuery` is disabled when `canRead` is
  // false (which is the case for the viewer's `permissions: ['read:*']`).
  await viewerPage.goto('/control-panel/restricted-views');

  // The fallback panel renders with the gate copy.
  await expect(
    viewerPage.getByRole('heading', { name: /^permission required$/i }),
  ).toBeVisible();
  await expect(
    viewerPage.getByText(/restricted_view:read.*restricted_view_policy:read.*policies:read.*control_panel:write/i),
  ).toBeVisible();

  // Neither the +New-view CTA nor the form is rendered for the viewer.
  expect(
    await viewerPage.getByRole('button', { name: /^new view$/i }).count(),
  ).toBe(0);
  expect(
    await viewerPage.getByRole('textbox', { name: /^backing dataset rid$/i }).count(),
  ).toBe(0);

  // The "Back to Control Panel" link IS rendered so the viewer can
  // bail out.
  await expect(
    viewerPage.getByRole('link', { name: /back to control panel/i }),
  ).toHaveAttribute('href', /\/control-panel$/);
});
