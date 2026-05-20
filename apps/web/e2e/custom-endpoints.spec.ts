import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { CustomEndpointsPage } from './pages';

/**
 * E2E coverage for `/custom-endpoints`
 * (apps/web/src/routes/custom-endpoints/CustomEndpointsPage.tsx).
 *
 * The shipped CustomEndpointsPage is a static read-only dashboard:
 *   - a hero with an h1 ("Custom APIs") and a disabled "New endpoint"
 *     CTA tooltipped with the Phase-4.x roadmap note;
 *   - a 5-metric stats panel (Endpoints / Live / Calls (24h) /
 *     Success rate / Avg p95 latency) computed over MOCK_ENDPOINTS;
 *   - a status tablist (`role="tablist"`, `aria-label="Filter by status"`)
 *     with All endpoints / Live / Draft / Disabled chips;
 *   - a `<table>` with columns Method, Path, Auth, Status, Calls (24h),
 *     Success, p95, Updated.
 *
 * Every entry is read from the in-file `MOCK_ENDPOINTS` constant —
 * filtering is `useState` + `useMemo`, no fetch on mount. As a result
 * these specs install no per-test mocks beyond the default catch-all
 * wired by `fixtures/base`.
 *
 * The roadmap reserves slots for: a **create** form (path + method +
 * handler + auth mode), a **per-endpoint test runner** (body editor +
 * curl preview), **versioning**, and **delete**. None of those ship
 * today; the "New endpoint" CTA itself ships disabled with a Phase-4.x
 * tooltip. The regression-guard tests at the bottom flip the moment any
 * of those land, forcing the next author to refresh this spec.
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

interface EndpointFixture {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  status: 'live' | 'draft' | 'disabled';
  auth: 'OAuth 2.0' | 'API key' | 'Public';
  /** Fragment of `description` unique enough to identify the row. */
  descriptionPrefix: string;
}

const ENDPOINTS: readonly EndpointFixture[] = [
  {
    method: 'POST',
    path: '/v1/partners/acme/shipments',
    status: 'live',
    auth: 'OAuth 2.0',
    descriptionPrefix: 'Accepts inbound shipment manifests',
  },
  {
    method: 'GET',
    path: '/v1/customers/:customerId/orders/:orderId/status',
    status: 'live',
    auth: 'API key',
    descriptionPrefix: 'Customer self-service order status',
  },
  {
    method: 'GET',
    path: '/v1/public/system-status',
    status: 'live',
    auth: 'Public',
    descriptionPrefix: 'Public-facing system status feed',
  },
  {
    method: 'DELETE',
    path: '/v1/customers/:customerId/orders/:orderId',
    status: 'draft',
    auth: 'OAuth 2.0',
    descriptionPrefix: 'Cancels an order',
  },
  {
    method: 'PUT',
    path: '/v1/fleet/drivers/:driverId/checkin',
    status: 'live',
    auth: 'OAuth 2.0',
    descriptionPrefix: 'Driver mobile app check-in',
  },
  {
    method: 'GET',
    path: '/v1/legacy/orders',
    status: 'disabled',
    auth: 'API key',
    descriptionPrefix: 'Legacy order feed',
  },
] as const;

const TOTAL = ENDPOINTS.length;
const LIVE = ENDPOINTS.filter((e) => e.status === 'live');
const DRAFT = ENDPOINTS.filter((e) => e.status === 'draft');
const DISABLED = ENDPOINTS.filter((e) => e.status === 'disabled');

test('lists every custom endpoint with method, path, auth and status', async ({
  authedPage,
}) => {
  const endpoints = new CustomEndpointsPage(authedPage);
  await endpoints.goto();
  await endpoints.expectLoaded();

  await expect(
    authedPage.getByRole('heading', { level: 1, name: /^custom apis$/i }),
  ).toBeVisible();

  // The "Endpoints (N)" section header surfaces the full registry total.
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`endpoints\\s*\\(${TOTAL}\\)`, 'i'),
    }),
  ).toBeVisible();

  // tbody rows exclude the thead row — 1 row per endpoint in MOCK_ENDPOINTS.
  const rows = authedPage.locator('tbody tr');
  await expect(rows).toHaveCount(TOTAL);

  // Each endpoint surfaces its method chip, monospaced path, auth label
  // and status chip on its row. Scope by description-prefix because two
  // endpoint paths share a prefix (`/v1/customers/:customerId/orders/...`).
  for (const ep of ENDPOINTS) {
    const row = rows.filter({ hasText: ep.descriptionPrefix });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(ep.method);
    await expect(row).toContainText(ep.path);
    await expect(row).toContainText(ep.auth);
    const statusLabel = ep.status === 'live' ? 'Live' : ep.status === 'draft' ? 'Draft' : 'Disabled';
    await expect(row).toContainText(statusLabel);
  }
});

test('stats panel summarises totals, traffic, success rate and p95', async ({
  authedPage,
}) => {
  const endpoints = new CustomEndpointsPage(authedPage);
  await endpoints.goto();

  // Stats panel is the first `.of-panel`; the second hosts the tablist,
  // and each table block is also wrapped in `.of-panel`. Scope to the
  // first to keep numeric matches unambiguous.
  const stats = authedPage.locator('.of-panel').first();

  // Total endpoints + live count come straight from MOCK_ENDPOINTS.
  await expect(stats.getByText('Endpoints', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(TOTAL), { exact: true })).toBeVisible();

  await expect(stats.getByText('Live', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(LIVE.length), { exact: true })).toBeVisible();

  // Traffic is compact-formatted (Intl). Don't pin the exact rendering —
  // assert label + presence of a compact-suffixed magnitude.
  await expect(stats.getByText('Calls (24h)', { exact: true })).toBeVisible();
  await expect(stats).toContainText(/\d+(\.\d+)?[KMB]/);

  // Success rate is weighted by call volume; expressed as a percentage.
  await expect(stats.getByText('Success rate', { exact: true })).toBeVisible();
  await expect(stats).toContainText(/%/);

  // Avg p95 averages the live endpoints' p95LatencyMs values.
  await expect(stats.getByText('Avg p95 latency', { exact: true })).toBeVisible();
  await expect(stats).toContainText(/\d+\s*ms/);
});

test('the status tablist filters the endpoint table to that bucket', async ({
  authedPage,
}) => {
  const endpoints = new CustomEndpointsPage(authedPage);
  await endpoints.goto();

  const tablist = authedPage.getByRole('tablist', { name: /filter by status/i });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole('tab', { name: /all endpoints/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const rows = authedPage.locator('tbody tr');

  // Live: 4 rows.
  await tablist.getByRole('tab', { name: /^live$/i }).click();
  await expect(rows).toHaveCount(LIVE.length);
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`endpoints\\s*\\(${LIVE.length}\\)`, 'i'),
    }),
  ).toBeVisible();
  // The disabled `legacy orders` row drops out.
  await expect(rows.filter({ hasText: 'Legacy order feed' })).toHaveCount(0);

  // Draft: 1 row (the cancel_order endpoint).
  await tablist.getByRole('tab', { name: /^draft$/i }).click();
  await expect(rows).toHaveCount(DRAFT.length);
  await expect(rows.filter({ hasText: 'Cancels an order' })).toHaveCount(1);

  // Disabled: 1 row (the legacy ACME feed).
  await tablist.getByRole('tab', { name: /^disabled$/i }).click();
  await expect(rows).toHaveCount(DISABLED.length);
  await expect(rows.filter({ hasText: 'Legacy order feed' })).toHaveCount(1);

  // All endpoints: restore.
  await tablist.getByRole('tab', { name: /all endpoints/i }).click();
  await expect(rows).toHaveCount(TOTAL);
});

test('the "New endpoint" CTA ships disabled with a Phase-4.x tooltip', async ({
  authedPage,
}) => {
  const endpoints = new CustomEndpointsPage(authedPage);
  await endpoints.goto();

  // The page object's `newEndpointButton` matches `/new endpoint|create/i`.
  // Pin the exact label so the test surfaces a silent CTA rename.
  const cta = authedPage.getByRole('button', { name: /^new endpoint$/i });
  await expect(cta).toBeVisible();
  await expect(cta).toBeDisabled();
  await expect(cta).toHaveAttribute('title', /phase 4\.x/i);
});

test('absent today: create-endpoint form (path + method + handler + auth)', async ({
  authedPage,
}) => {
  // Regression guard for the roadmap "New endpoint" editor. When the
  // form lands, each `count() === 0` flips and forces this spec to
  // grow proper input-driven assertions.
  const endpoints = new CustomEndpointsPage(authedPage);
  await endpoints.goto();
  await endpoints.expectLoaded();

  // Form controls (the page object already pins the canonical labels).
  expect(await endpoints.pathInput.count()).toBe(0);
  expect(await endpoints.methodSelect.count()).toBe(0);

  // Handler + auth-mode fields are not modelled on the page object yet,
  // but the editor will need them — assert by-label.
  const page = authedPage.locator('section.of-page');
  expect(await page.getByLabel(/^handler$/i).count()).toBe(0);
  expect(await page.getByLabel(/auth(\s+mode|entication)?(\s+required)?/i).count()).toBe(0);
});

test('absent today: per-endpoint test runner (body + curl preview)', async ({
  authedPage,
}) => {
  // Regression guard for the roadmap "Test" affordance: a body editor
  // and a generated curl preview snippet per endpoint.
  const endpoints = new CustomEndpointsPage(authedPage);
  await endpoints.goto();
  await endpoints.expectLoaded();

  expect(await endpoints.testButton.count()).toBe(0);
  expect(await endpoints.curlPreview.count()).toBe(0);

  // The body editor would be a labelled textarea; pin its absence too.
  const page = authedPage.locator('section.of-page');
  expect(await page.getByLabel(/(request\s+)?body/i).count()).toBe(0);
});

test('absent today: endpoint versioning UI', async ({ authedPage }) => {
  // Regression guard for the roadmap version selector / publish flow.
  // ApplicationsPage exposes no version chip, picker, or history link.
  const endpoints = new CustomEndpointsPage(authedPage);
  await endpoints.goto();
  await endpoints.expectLoaded();

  const page = authedPage.locator('section.of-page');
  expect(await page.getByRole('button', { name: /^(version|publish|revert|new\s+version)/i }).count()).toBe(0);
  expect(await page.getByLabel(/^version$/i).count()).toBe(0);
  // No "Version" column header in the table either.
  expect(await page.getByRole('columnheader', { name: /^version$/i }).count()).toBe(0);
});

test('absent today: delete-endpoint affordance', async ({ authedPage }) => {
  // Regression guard for the roadmap row-level delete. Today the only
  // "DELETE" surface on the page is the HTTP-method chip (a <span>);
  // there is no button.
  const endpoints = new CustomEndpointsPage(authedPage);
  await endpoints.goto();
  await endpoints.expectLoaded();

  const page = authedPage.locator('section.of-page');
  expect(
    await page.getByRole('button', { name: /^(delete|remove|retire)\b/i }).count(),
  ).toBe(0);
});
