import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { InvestigatorPage } from './pages';

/**
 * E2E coverage for `/insight` (the Investigator surface)
 * (apps/web/src/routes/insight/InvestigatorPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a *static placeholder*
 * with a hardcoded `MOCK_INVESTIGATION` constant — no API calls, no
 * real search bar, no row-click drill-down, no detail drawer. The
 * roadmap describes a multi-step investigator with object search,
 * pivot, filter, aggregate, and per-row action application; today only
 * the starting-object-type chip row is interactive (it updates local
 * useState but does not refresh the analysis path or results).
 *
 * Every "Save analysis" / "Export CSV" / "Apply action…" / step-builder
 * "+" button is rendered `disabled` with a "Phase 4.x" title — pinned
 * as absent today so a half-shipped feature surfaces here first. The
 * `InvestigatorPage` page-object's `searchInput` / `resultsList` /
 * `detailDrawer` locators are aspirational and never resolve.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

test('renders the hero, starting-object chips, analysis path, and results table', async ({
  adminPage,
}) => {
  const page = new InvestigatorPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Hero eyebrow + h1.
  await expect(adminPage.getByText(/Analytics & Operations · Investigator/i)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Investigator$/ }),
  ).toBeVisible();

  // Starting-object-type chips render — eight known types from the
  // OBJECT_TYPES constant.
  for (const t of ['Order', 'Shipment', 'Customer', 'Driver', 'Warehouse', 'Invoice', 'Incident', 'Asset']) {
    await expect(adminPage.getByRole('button', { name: new RegExp(`^${t}$`) })).toBeVisible();
  }

  // Analysis path + Results section headers.
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Analysis path$/ })).toBeVisible();
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Results$/ })).toBeVisible();

  // The results card carries a "Read-only preview" chip — the page's
  // own admission that the data is mocked.
  await expect(adminPage.getByText(/^Read-only preview$/i)).toBeVisible();
});

test('starting-object chips: clicking another type swaps the active chip (local state only)', async ({
  adminPage,
}) => {
  const page = new InvestigatorPage(adminPage);
  await page.goto();

  // `Shipment` is the seed `startingType`. Active chips carry the
  // `of-chip-active` class; inactive ones don't. Pin the active
  // class via the DOM class attribute since there's no aria-pressed.
  const shipmentChip = adminPage.getByRole('button', { name: /^Shipment$/ });
  const customerChip = adminPage.getByRole('button', { name: /^Customer$/ });
  await expect(shipmentChip).toHaveClass(/of-chip-active/);
  await expect(customerChip).not.toHaveClass(/of-chip-active/);

  await customerChip.click();

  await expect(customerChip).toHaveClass(/of-chip-active/);
  await expect(shipmentChip).not.toHaveClass(/of-chip-active/);

  // The page does NOT rebuild the analysis path or results when the
  // starting type changes — the MOCK_INVESTIGATION constant is the
  // only data source. So the seed first step copy stays put.
  await expect(adminPage.getByText(/^Begin with Shipment objects$/)).toBeVisible();
});

test('analysis path renders every step of the mocked investigation with description + detail + output count', async ({
  adminPage,
}) => {
  const page = new InvestigatorPage(adminPage);
  await page.goto();

  // The investigation copy ("Late-shipment customer impact") appears
  // as the subtitle under the Analysis-path heading.
  await expect(adminPage.getByText(/^Late-shipment customer impact$/)).toBeVisible();

  // All four mocked steps are visible.
  for (const desc of [
    'Begin with Shipment objects',
    'Filter to SLA misses',
    'Traverse → Customer',
    'Aggregate by customer with LTV ranking',
  ]) {
    await expect(adminPage.getByText(desc)).toBeVisible();
  }

  // Detail captions (monospaced) for each step.
  for (const detail of [
    'ship_date in last 7 days',
    'on_time_rate < target_sla',
    'via shipment.customer_id',
    'order by ltv DESC',
  ]) {
    await expect(adminPage.getByText(detail)).toBeVisible();
  }

  // Output-count captions per step ("1,402 object(s) out", …).
  await expect(adminPage.getByText(/^1,402 object\(s\) out$/)).toBeVisible();
  await expect(adminPage.getByText(/^187 object\(s\) out$/)).toBeVisible();
  // Both the traverse and aggregate steps emit 142 objects, so two
  // copies of the caption are present.
  await expect(adminPage.getByText(/^142 object\(s\) out$/)).toHaveCount(2);
});

test('results table renders five rows with customer / missed / LTV / status columns', async ({
  adminPage,
}) => {
  const page = new InvestigatorPage(adminPage);
  await page.goto();

  const resultsTable = adminPage.getByRole('table');
  await expect(resultsTable).toBeVisible();

  // Column headers (rendered as `of-eyebrow` th cells).
  for (const h of ['Customer', 'Missed shipments', 'LTV', 'Status']) {
    await expect(resultsTable.getByRole('columnheader', { name: h })).toBeVisible();
  }

  // Five mocked rows (plus the header row = 6 total).
  await expect(resultsTable.getByRole('row')).toHaveCount(6);

  // Top row: Northwind Logistics with $1.2M LTV and At-risk chip.
  const northwindRow = resultsTable.getByRole('row', { name: /Northwind Logistics/i });
  await expect(northwindRow).toBeVisible();
  await expect(northwindRow.getByText(/^\$1\.2M LTV$/)).toBeVisible();
  await expect(northwindRow.getByText(/^At risk$/)).toBeVisible();
  await expect(northwindRow.getByText(/^4 missed$/)).toBeVisible();

  // Bottom row: Delta Foods (Normal status).
  await expect(
    resultsTable.getByRole('row', { name: /Delta Foods/i }).getByText(/^Normal$/),
  ).toBeVisible();

  // Subtitle echoes the row count.
  await expect(adminPage.getByText(/5 customer\(s\) impacted by SLA misses/i)).toBeVisible();
});

test('absent today: no search input, no row-click drill-down, no detail drawer, Save / Export / Apply CTAs disabled', async ({
  adminPage,
}) => {
  // Regression guard. The roadmap calls for object search +
  // drill-down + per-row actions; until that ships, pin the absence
  // so a half-shipped feature surfaces here. The page-object's
  // `searchInput` / `resultsList` / `detailDrawer` locators are
  // aspirational and will start resolving the day the real surface
  // lands.
  const page = new InvestigatorPage(adminPage);
  await page.goto();
  await page.expectLoaded();
  // Wait for the workspace to settle.
  await expect(adminPage.getByRole('heading', { level: 1, name: /^Investigator$/ })).toBeVisible();

  // 1. No search input. The page object's locator does not resolve
  //    and `getByRole('searchbox')` returns nothing.
  expect(await page.searchInput.count()).toBe(0);
  expect(await adminPage.getByRole('searchbox').count()).toBe(0);

  // 2. No drill-down / detail drawer. The results <table> exists,
  //    but there's no `<aside role="complementary" name="detail">`,
  //    no overlay, no per-row click handler (rows are bare <tr>s
  //    without role=button).
  expect(await page.detailDrawer.count()).toBe(0);
  expect(await adminPage.getByRole('dialog').count()).toBe(0);
  // Result rows have no button accessible name — they are static
  // <tr> elements. Clicking them is a no-op (no navigation, no
  // drawer mount).
  await adminPage.getByRole('row', { name: /Northwind Logistics/i }).click();
  // URL still on /insight; no detail drawer mounted.
  await expect(adminPage).toHaveURL(/\/insight(\/|$|\?|#)/);
  expect(await adminPage.getByRole('complementary', { name: /detail/i }).count()).toBe(0);

  // 3. Every roadmap CTA is rendered `disabled` ("Phase 4.x"
  //    placeholder). Pin the disabled state so the day the
  //    handlers wire up, these flip.
  await expect(adminPage.getByRole('button', { name: /^Save analysis$/ })).toBeDisabled();
  await expect(adminPage.getByRole('button', { name: /^Export CSV$/ })).toBeDisabled();
  await expect(adminPage.getByRole('button', { name: /^Apply action…$/ })).toBeDisabled();
});
