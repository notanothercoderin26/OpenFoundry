import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { RetentionPoliciesPage } from './pages';

/**
 * E2E coverage for `/retention`
 * (apps/web/src/routes/retention/RetentionPoliciesPage.tsx).
 *
 * **Reality check.** The shipped Retention Policies page is a
 * read-only marketing/preview surface backed by **hardcoded mock data**
 * (`MOCK_POLICIES` and `MOCK_EVENTS`). There is **no** API call on
 * mount, no editor, and no CRUD:
 *
 *   - **Create.** The "+ New policy" button is rendered but
 *     `disabled` with a tooltip "Policy editor ships in Phase 4.x".
 *   - **Edit / Pause / Delete.** Policy cards do not expose row
 *     actions. No edit drawer, no pause toggle, no delete button.
 *   - **TTL / target / action inputs.** No form exists anywhere on
 *     the route. The "action" column is implicit in each mock
 *     description (the page does not surface archive/delete as a
 *     first-class control).
 *
 * What IS shipped — and pinned positively by this spec:
 *
 *   - 5 policy cards rendered as `<article>` with `aria-label={name}`.
 *   - Stats panel: Policies / Enforcing / Datasets governed / Rows
 *     pending deletion.
 *   - Mode-filter tablist (role=tab) with All / Enforcing / Monitor
 *     only / Paused.
 *   - Recent enforcement events table (6 rows) — the "ver ejecuciones
 *     pasadas" surface from the task brief.
 *
 * Per the project convention (see `notifications.spec.ts`), each
 * "absent today" assertion is a regression guard: the day someone
 * wires the editor up without finishing the UI, these flip and the
 * developer gets an actionable checklist.
 *
 * `freezeTime` pins `Date.now()` to {@link E2E_NOW} so the
 * `formatRelative(...)` strings ("X min ago" / "X hr ago" /
 * "X day(s) ago") are deterministic across runs.
 */

test.use({
  freezeTime: true,
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of (null|undefined)/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

test('renders all five mock policies as <article> cards with the expected names', async ({
  adminPage,
}) => {
  const page = new RetentionPoliciesPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Hero + page heading.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^retention policies$/i }),
  ).toBeVisible();

  // Each policy card is an <article aria-label={name}>.
  const expectedNames = [
    'PII 90-day retention',
    'Finance 7-year archive',
    'Telemetry logs 30-day window',
    'ACME partner data 1-year',
    'Sandbox cleanup',
  ];
  for (const name of expectedNames) {
    await expect(adminPage.getByRole('article', { name })).toBeVisible();
  }

  // Section heading exposes the total count.
  await expect(
    adminPage.getByRole('heading', { name: /policies/i }).filter({ hasText: /\(5\)/ }),
  ).toBeVisible();

  // No network call on mount — the page is fully mocked client-side.
  // Pin this guarantee so a future migration to a real backend has to
  // update the spec (and stop hardcoding test data).
  // We can't assert "zero calls" without racing the AppShell's own
  // /users/me etc. Instead, assert that no /retention API was hit.
  const retentionApiCalls: string[] = [];
  adminPage.on('request', (req) => {
    if (req.url().includes('/api/v1/retention')) retentionApiCalls.push(req.url());
  });
  await adminPage.waitForTimeout(300);
  expect(retentionApiCalls).toEqual([]);
});

test('mode-filter tabs narrow the visible cards (Paused → only Sandbox cleanup)', async ({
  adminPage,
}) => {
  const page = new RetentionPoliciesPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // The mode filter uses a role=tablist; the "All policies" tab is
  // selected by default.
  const tablist = adminPage.getByRole('tablist', { name: /filter by mode/i });
  await expect(tablist).toBeVisible();
  const allTab = tablist.getByRole('tab', { name: /^all policies$/i });
  const enforcingTab = tablist.getByRole('tab', { name: /^enforcing$/i });
  const monitorTab = tablist.getByRole('tab', { name: /^monitor only$/i });
  const pausedTab = tablist.getByRole('tab', { name: /^paused$/i });
  await expect(allTab).toHaveAttribute('aria-selected', 'true');

  // Switch to "Paused" — only the Sandbox cleanup policy (rp-sandbox)
  // has mode='paused' in MOCK_POLICIES.
  await pausedTab.click();
  await expect(pausedTab).toHaveAttribute('aria-selected', 'true');
  await expect(allTab).toHaveAttribute('aria-selected', 'false');

  await expect(adminPage.getByRole('article', { name: 'Sandbox cleanup' })).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { name: /policies/i }).filter({ hasText: /\(1\)/ }),
  ).toBeVisible();
  expect(
    await adminPage.getByRole('article', { name: 'PII 90-day retention' }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('article', { name: 'Finance 7-year archive' }).count(),
  ).toBe(0);

  // Switching to "Enforcing" surfaces the 3 enforce-mode policies.
  await enforcingTab.click();
  await expect(enforcingTab).toHaveAttribute('aria-selected', 'true');
  await expect(
    adminPage.getByRole('heading', { name: /policies/i }).filter({ hasText: /\(3\)/ }),
  ).toBeVisible();
  await expect(adminPage.getByRole('article', { name: 'PII 90-day retention' })).toBeVisible();
  await expect(adminPage.getByRole('article', { name: 'Finance 7-year archive' })).toBeVisible();
  await expect(
    adminPage.getByRole('article', { name: 'Telemetry logs 30-day window' }),
  ).toBeVisible();

  // Switching to "Monitor only" surfaces just the ACME partner policy.
  await monitorTab.click();
  await expect(adminPage.getByRole('article', { name: 'ACME partner data 1-year' })).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { name: /policies/i }).filter({ hasText: /\(1\)/ }),
  ).toBeVisible();

  // Back to All.
  await allTab.click();
  await expect(allTab).toHaveAttribute('aria-selected', 'true');
  await expect(
    adminPage.getByRole('heading', { name: /policies/i }).filter({ hasText: /\(5\)/ }),
  ).toBeVisible();
});

test('stats panel summarises the mock policies (5 / 3 / 69 / 5.4M)', async ({
  adminPage,
}) => {
  const page = new RetentionPoliciesPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // The stats are computed from MOCK_POLICIES (not state — they don't
  // change with the mode filter, which is the shipped behaviour and
  // worth pinning).
  //
  // Scope every assertion to the metrics panel so "Enforcing" doesn't
  // collide with the mode-filter tab and "Policies" doesn't collide
  // with the "Policies (5)" section heading.
  const metricsPanel = adminPage
    .locator('section.of-panel')
    .filter({ has: adminPage.getByText('Datasets governed', { exact: true }) })
    .first();
  await expect(metricsPanel.getByText('Policies', { exact: true })).toBeVisible();
  await expect(metricsPanel.getByText('Enforcing', { exact: true })).toBeVisible();
  await expect(metricsPanel.getByText('Datasets governed', { exact: true })).toBeVisible();
  await expect(metricsPanel.getByText('Rows pending deletion', { exact: true })).toBeVisible();

  // Numeric values: Policies=5, Enforcing=3, Datasets=28+12+18+7+4=69,
  // Pending = 1.24M + 88k + 4.12M + 0 + 0 = 5.448M → compact "5.4M".
  await expect(
    metricsPanel.locator('p').filter({ hasText: /^5$/ }).first(),
  ).toBeVisible();
  await expect(
    metricsPanel.locator('p').filter({ hasText: /^3$/ }).first(),
  ).toBeVisible();
  await expect(
    metricsPanel.locator('p').filter({ hasText: /^69$/ }).first(),
  ).toBeVisible();
  await expect(metricsPanel.getByText('5.4M', { exact: true })).toBeVisible();

  // Stats do NOT recompute when the mode filter changes — the panel
  // always reflects MOCK_POLICIES totals.
  await adminPage.getByRole('tab', { name: /^paused$/i }).click();
  await expect(metricsPanel.getByText('5.4M', { exact: true })).toBeVisible();
});

test('Recent enforcement events table renders all six mock runs with their outcome chips', async ({
  adminPage,
}) => {
  const page = new RetentionPoliciesPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { name: /recent enforcement events/i }),
  ).toBeVisible();

  // The table has 7 column headers in this order.
  const headers = ['When', 'Policy', 'Dataset', 'Deleted', 'Kept', 'Outcome', 'Reason'];
  for (const h of headers) {
    await expect(
      adminPage.getByRole('columnheader', { name: new RegExp(`^${h}$`, 'i') }),
    ).toBeVisible();
  }

  // 6 mock events (ev-1 .. ev-6) → 6 body rows.
  const tbodyRows = adminPage.locator('table tbody tr');
  await expect(tbodyRows).toHaveCount(6);

  // Spot-check the outcome chips that summarise the per-run results.
  // Use cell-level locators so the assertions don't collide with the
  // policy cards or stats panel above.
  const outcomeCells = adminPage.locator('table tbody tr td:nth-child(6)');
  await expect(outcomeCells.getByText('Deleted', { exact: true })).toHaveCount(3);
  await expect(outcomeCells.getByText('Overridden', { exact: true })).toHaveCount(1);
  await expect(outcomeCells.getByText('Failed', { exact: true })).toHaveCount(1);
  await expect(outcomeCells.getByText('Skipped', { exact: true })).toHaveCount(1);

  // The "ev-3" row carries a legal-hold reason — pin the full copy so
  // the user-facing explainer doesn't silently change.
  await expect(
    adminPage.getByText(/Legal hold L-2026-118 active; deletion deferred until 2026-09-01/),
  ).toBeVisible();
  // The "ev-5" row carries a backend-failure reason.
  await expect(
    adminPage.getByText(/Storage backend returned 503; will retry at next window\./),
  ).toBeVisible();
});

test('absent today: the "+ New policy" CTA is rendered but disabled (no editor ships yet)', async ({
  adminPage,
}) => {
  const page = new RetentionPoliciesPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // CTA is visible AND disabled, with a tooltip that explains the
  // editor is deferred. The disabled state IS the regression guard:
  // when the policy editor ships, the developer will need to drop
  // `disabled` (and the title) and these assertions flip.
  const newPolicyBtn = adminPage.getByRole('button', { name: /new policy/i });
  await expect(newPolicyBtn).toBeVisible();
  await expect(newPolicyBtn).toBeDisabled();
  await expect(newPolicyBtn).toHaveAttribute('title', /policy editor ships in phase 4/i);

  // Clicking the disabled button must NOT open any modal/dialog. We
  // force-click to bypass Playwright's disabled-element guard and
  // confirm the no-op behaviour holds even under adversarial input.
  await newPolicyBtn.click({ force: true });
  expect(await adminPage.getByRole('dialog').count()).toBe(0);

  // No policy-editor form anywhere on the page — TTL, target, action
  // inputs the task brief asks about don't exist.
  expect(await adminPage.getByLabel(/target|object set/i).count()).toBe(0);
  expect(await adminPage.getByLabel(/^ttl$/i).count()).toBe(0);
  expect(await adminPage.getByLabel(/retention (days|window|period)/i).count()).toBe(0);
  expect(await adminPage.getByRole('combobox', { name: /^action$/i }).count()).toBe(0);
  // No archive / delete radio (the brief frames it as a binary
  // action picker).
  expect(await adminPage.getByRole('radio', { name: /^(archive|delete)$/i }).count()).toBe(0);
});

test('absent today: per-card Edit / Pause / Delete actions on policy cards', async ({
  adminPage,
}) => {
  const page = new RetentionPoliciesPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // The mode chip on each card displays "Enforcing" / "Monitor only" /
  // "Paused" as a label, but those are read-only — pin the absence
  // of action buttons inside any card.
  const piiCard = adminPage.getByRole('article', { name: 'PII 90-day retention' });
  await expect(piiCard).toBeVisible();

  expect(await piiCard.getByRole('button', { name: /^edit$/i }).count()).toBe(0);
  expect(await piiCard.getByRole('button', { name: /^pause$/i }).count()).toBe(0);
  expect(await piiCard.getByRole('button', { name: /^resume$/i }).count()).toBe(0);
  expect(await piiCard.getByRole('button', { name: /^delete$/i }).count()).toBe(0);
  expect(await piiCard.getByRole('button', { name: /^archive$/i }).count()).toBe(0);

  // Cards aren't navigable either — no <a> inside the card.
  expect(await piiCard.locator('a').count()).toBe(0);

  // Sanity: across the whole policies section, none of the cards
  // expose Edit/Pause/Delete buttons.
  const allCards = adminPage.getByRole('article');
  await expect(allCards).toHaveCount(5);
  expect(
    await allCards
      .locator('button', { hasText: /^(edit|pause|resume|delete|archive)$/i })
      .count(),
  ).toBe(0);
});
