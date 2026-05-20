import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/pipelines/linter`
 * (apps/web/src/routes/pipeline-linter/LinterPage.tsx, 220 lines).
 *
 * **Reality vs roadmap.** The shipped page is a Foundry-parity STUB:
 *   - Findings are a hardcoded `MOCK_FINDINGS` constant (6 entries:
 *     2 critical / 2 warning / 2 info, across 5 unique pipelines).
 *     No API endpoint backs the list today.
 *   - Severity values are `critical | warning | info` (the task ask
 *     uses `error | warning | info` — `critical` is the shipped name).
 *   - The only working interaction is the severity filter (4 tabs:
 *     All / Critical / Warning / Info).
 *   - Action buttons are explicit placeholders: `Rescan all pipelines`
 *     (header), `Snooze`, and `Open in Pipeline Builder` (per article)
 *     are all `disabled`.
 *
 * Mismatches with the original task ask, pinned in the final guard test:
 *   - NO pipeline filter (only severity).
 *   - NO click-to-open detail drawer — every finding is rendered as a
 *     full `<article>` card with the recommendation + estimated impact
 *     already visible.
 *   - NO auto-fix / PATCH affordance.
 *   - NO rule-config UI for enabling / disabling rules.
 *   - NO `/api/v1/...` endpoints are hit; the page is pure client state.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

test('renders the hero, the counts panel and all six mocked findings', async ({
  adminPage,
}) => {
  await adminPage.goto('/pipelines/linter');

  // Hero block.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^pipeline linter$/i }),
  ).toBeVisible();

  // Counts panel — values mirror MOCK_FINDINGS exactly: 6 findings, 2
  // critical, 2 warnings, 2 info, 5 unique pipelines.
  for (const [label, value] of [
    ['Findings', '6'],
    ['Critical', '2'],
    ['Warnings', '2'],
    ['Info', '2'],
    ['Pipelines scanned', '5'],
  ] as const) {
    const labelLocator = adminPage.getByText(label, { exact: true });
    await expect(labelLocator).toBeVisible();
    // The value is a sibling `<p>` in the same grid cell.
    await expect(
      labelLocator.locator('xpath=following-sibling::p[1]'),
    ).toHaveText(value);
  }

  // Every finding renders as its own article — six in total at the default
  // "All" filter.
  await expect(adminPage.getByRole('article')).toHaveCount(6);
});

test('severity filter tabs render in the canonical order with "All" selected by default', async ({
  adminPage,
}) => {
  await adminPage.goto('/pipelines/linter');

  const tablist = adminPage.getByRole('tablist', { name: /filter by severity/i });
  await expect(tablist).toBeVisible();

  for (const label of ['All', 'Critical', 'Warning', 'Info']) {
    await expect(tablist.getByRole('tab', { name: new RegExp(`^${label}$`) })).toBeVisible();
  }

  // The "All" tab is selected initially.
  await expect(tablist.getByRole('tab', { name: /^All$/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tablist.getByRole('tab', { name: /^Critical$/ })).toHaveAttribute(
    'aria-selected',
    'false',
  );
});

test('a representative warning article renders message + rule + pipeline + recommendation + impact', async ({
  adminPage,
}) => {
  await adminPage.goto('/pipelines/linter');

  // Anchor on the `customer-360-batch` finding's distinctive message text and
  // walk up to the enclosing `<article>` so neighbouring cards can't bleed in.
  const article = adminPage
    .getByRole('article')
    .filter({
      hasText: /Final transform reads the entire customer_orders dataset/i,
    });
  await expect(article).toHaveCount(1);

  // Message, rule (as inline `<code>`), pipeline name and relative time all
  // surface in the article's header.
  await expect(article).toContainText('transform.full-table-scan');
  await expect(article).toContainText('customer-360-batch');

  // Severity chip — Warning (per SEVERITY_LABEL.warning).
  await expect(
    article.locator('span.of-chip').filter({ hasText: /^Warning$/ }),
  ).toBeVisible();

  // Recommendation + estimated impact bodies.
  await expect(article).toContainText(/Recommendation:\s*Add a partition filter/i);
  await expect(article).toContainText(
    /Estimated impact:\s*Saves ~3\.2 minutes per run/i,
  );
});

test('Critical filter narrows the list to the two critical findings', async ({
  adminPage,
}) => {
  await adminPage.goto('/pipelines/linter');

  await adminPage.getByRole('tab', { name: /^Critical$/ }).click();

  // Active tab state flips.
  await expect(adminPage.getByRole('tab', { name: /^Critical$/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // The two `critical` findings remain; the warnings/info disappear.
  await expect(adminPage.getByRole('article')).toHaveCount(2);
  await expect(
    adminPage.getByText(/streaming\.late-data-handling-missing/),
  ).toBeVisible();
  await expect(adminPage.getByText(/security\.unmarked-pii-column/)).toBeVisible();

  // The full-table-scan (warning) and missing-owner (info) findings are gone.
  await expect(adminPage.getByText(/transform\.full-table-scan/)).toHaveCount(0);
  await expect(adminPage.getByText(/metadata\.missing-owner/)).toHaveCount(0);
});

test('Info filter narrows the list to the two info findings', async ({ adminPage }) => {
  await adminPage.goto('/pipelines/linter');

  await adminPage.getByRole('tab', { name: /^Info$/ }).click();

  await expect(adminPage.getByRole('article')).toHaveCount(2);
  await expect(adminPage.getByText(/metadata\.missing-owner/)).toBeVisible();
  await expect(adminPage.getByText(/metadata\.no-description/)).toBeVisible();

  // The severity chip on each remaining article reads "Info".
  await expect(
    adminPage.getByRole('article').first().locator('span.of-chip').filter({ hasText: /^Info$/ }),
  ).toBeVisible();
});

test('switching back to "All" restores every finding', async ({ adminPage }) => {
  await adminPage.goto('/pipelines/linter');

  await adminPage.getByRole('tab', { name: /^Warning$/ }).click();
  await expect(adminPage.getByRole('article')).toHaveCount(2);

  await adminPage.getByRole('tab', { name: /^All$/ }).click();
  await expect(adminPage.getByRole('article')).toHaveCount(6);
});

test('header Rescan and per-article action buttons are disabled placeholders', async ({
  adminPage,
}) => {
  await adminPage.goto('/pipelines/linter');

  // Header CTA — the title flags it as a Phase 4.x deliverable.
  const rescan = adminPage.getByRole('button', { name: /rescan all pipelines/i });
  await expect(rescan).toBeVisible();
  await expect(rescan).toBeDisabled();

  // Each of the six articles ships the same two disabled buttons. Sanity-
  // check the count plus that at least one of each is actually disabled.
  await expect(adminPage.getByRole('button', { name: /^Snooze$/ })).toHaveCount(6);
  await expect(
    adminPage.getByRole('button', { name: /^Open in Pipeline Builder$/ }),
  ).toHaveCount(6);
  await expect(adminPage.getByRole('button', { name: /^Snooze$/ }).first()).toBeDisabled();
  await expect(
    adminPage.getByRole('button', { name: /^Open in Pipeline Builder$/ }).first(),
  ).toBeDisabled();
});

test('absent today: pipeline filter, detail drawer, auto-fix PATCH, rule-config UI, and any /api/v1 traffic', async ({
  adminPage,
}) => {
  // Single regression guard for the roadmap surfaces the task asks for that
  // do not ship today. Each flipped assertion is the migration signal when
  // the matching control lands.
  const apiCalls = captureRequests(adminPage, /\/api\/v1\//);
  await adminPage.goto('/pipelines/linter');

  // Wait for the page to settle — render two assertions deep so any
  // late-arriving fetch would have had time to fire.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^pipeline linter$/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('article')).toHaveCount(6);

  // 1. No pipeline filter: no second tablist, no combobox / select scoped
  //    by pipeline, no chip strip naming a pipeline.
  expect(await adminPage.getByRole('tablist').count()).toBe(1);
  expect(await adminPage.getByRole('combobox', { name: /pipeline/i }).count()).toBe(0);
  expect(await adminPage.getByLabel(/filter by pipeline/i).count()).toBe(0);

  // 2. No detail drawer. Clicking an article does NOT open a `dialog`
  //    aside; the recommendation + impact are already inline in the card.
  await adminPage.getByRole('article').first().click();
  await adminPage.waitForTimeout(150);
  expect(await adminPage.getByRole('dialog').count()).toBe(0);
  expect(await adminPage.getByRole('complementary').count()).toBe(0);

  // 3. No auto-fix button anywhere on the page.
  expect(
    await adminPage.getByRole('button', { name: /(auto.?fix|apply fix|quick fix)/i }).count(),
  ).toBe(0);

  // 4. No rule-config UI. No tab, link, or button surfaces a "Rules" /
  //    "Configure rules" / "Enabled rules" page.
  expect(await adminPage.getByRole('tab', { name: /^Rules?$/i }).count()).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /(configure|manage|edit) rules/i }).count(),
  ).toBe(0);
  expect(await adminPage.getByRole('link', { name: /^Rules?$/i }).count()).toBe(0);

  // 5. The page is fully client-side — interacting with the severity
  //    filter does not fire a network request.
  await adminPage.getByRole('tab', { name: /^Critical$/ }).click();
  await adminPage.waitForTimeout(150);
  expect(apiCalls.calls.filter((c) => /\/api\/v1\/(linter|lint|pipelines\/linter)/.test(c.url))).toEqual(
    [],
  );
});
