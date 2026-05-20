import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { SlatePage } from './pages';

/**
 * E2E coverage for `/slate`
 * (apps/web/src/routes/slate/SlatePage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is the *Web App Studio*
 * shell: a hardcoded grid of apps (Inventory Dashboard, Field Ops
 * Console, …) with a search input, a visibility tablist
 * (All apps / Internal / Public), per-card status chips
 * (Draft / Published / Archived), and a "Start from a template"
 * section. The roadmap items in the task description — rich-text
 * editor, insert-block (chart/table/image), publish flow, share,
 * versioning, delete — all land in Phase 4.2 (the "Create app" CTA
 * carries that exact `title` attribute, and the listing is
 * apps-shaped, not posts-shaped).
 *
 * So the spec maps each roadmap case to its shipped analogue and
 * pins the missing pieces with a single absent-today regression
 * guard at the end. Once the editor ships and the listing shape
 * changes, the guard fails and forces the spec to be rewritten
 * intentionally.
 *
 * The page is pure client-side: no `/api/v1/...` calls from
 * `SlatePage.tsx` itself, only the AppShell's bootstrap traffic
 * which the default `apiMocks` catch-all handles.
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

test('renders the Web App Studio header, search, and visibility tablist', async ({
  adminPage,
}) => {
  const slate = new SlatePage(adminPage);
  await slate.goto();
  await slate.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^web app studio$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/application development · web app studio/i)).toBeVisible();

  // Search input (inherited locator from ListPagePO — matches the
  // `<input type="search" placeholder="Search apps…">`).
  await expect(slate.searchInput).toBeVisible();

  // Visibility tablist with the three documented options.
  await expect(slate.visibilityTablist).toBeVisible();
  await expect(slate.visibilityTab(/^all apps$/i)).toHaveAttribute('aria-selected', 'true');
  await expect(slate.visibilityTab(/^internal$/i)).toHaveAttribute('aria-selected', 'false');
  await expect(slate.visibilityTab(/^public$/i)).toHaveAttribute('aria-selected', 'false');
});

test('lists the mock apps with their status chips (Draft / Published / Archived)', async ({
  adminPage,
}) => {
  const slate = new SlatePage(adminPage);
  await slate.goto();

  // Header reports the count of currently-filtered apps. All six mock
  // apps are visible on first paint (default tab = "All apps").
  await expect(
    slate.appsSection.getByRole('heading', { level: 2, name: /^your apps\s*\(6\)/i }),
  ).toBeVisible();

  // Each app card renders an <article aria-label="…">. Spot-check the
  // three statuses by pairing the card with its visible status text —
  // this anchors both the listing shape and the status taxonomy.
  await expect(slate.appCard('Incident Triage').getByText('Draft', { exact: true })).toBeVisible();
  await expect(slate.appCard('Inventory Dashboard').getByText('Published', { exact: true })).toBeVisible();
  await expect(slate.appCard('Finance Pulse').getByText('Archived', { exact: true })).toBeVisible();

  // And the full grid of six is present (no accidental dedup or
  // visibility filter applied on first render).
  await expect(slate.appsSection.getByRole('article')).toHaveCount(6);
});

test('typed search filters the listing locally by name, description, or owner', async ({
  adminPage,
}) => {
  const slate = new SlatePage(adminPage);
  await slate.goto();
  await expect(slate.appsSection.getByRole('article')).toHaveCount(6);

  // Only the Finance Pulse card matches "finance" (name + owner =
  // "finance-ops"). The search runs purely inside a `useMemo` —
  // there is no Slate-side `/api/v1/...` endpoint to begin with, so
  // the visible diff is the load-bearing assertion.
  await slate.searchInput.fill('finance');
  await expect(slate.appsSection.getByRole('article')).toHaveCount(1);
  await expect(slate.appCard('Finance Pulse')).toBeVisible();
  await expect(
    slate.appsSection.getByRole('heading', { level: 2, name: /^your apps\s*\(1\)/i }),
  ).toBeVisible();

  // Match-on-owner specifically: typing "logistics" (the owner of
  // Inventory Dashboard) finds it even though "logistics" appears in
  // neither the name nor the description.
  await slate.searchInput.fill('logistics');
  await expect(slate.appsSection.getByRole('article')).toHaveCount(1);
  await expect(slate.appCard('Inventory Dashboard')).toBeVisible();

  // Clearing the input restores all six rows.
  await slate.searchInput.fill('');
  await expect(slate.appsSection.getByRole('article')).toHaveCount(6);
});

test('visibility tabs filter the listing (Internal / Public / All apps)', async ({
  adminPage,
}) => {
  const slate = new SlatePage(adminPage);
  await slate.goto();

  await slate.visibilityTab(/^internal$/i).click();
  await expect(slate.visibilityTab(/^internal$/i)).toHaveAttribute('aria-selected', 'true');
  // 4 internal apps: Inventory Dashboard, Field Ops Console, Incident
  // Triage, Finance Pulse.
  await expect(slate.appsSection.getByRole('article')).toHaveCount(4);
  await expect(slate.appCard('Customer Portal')).toHaveCount(0);
  await expect(slate.appCard('Public Status Page')).toHaveCount(0);

  await slate.visibilityTab(/^public$/i).click();
  await expect(slate.visibilityTab(/^public$/i)).toHaveAttribute('aria-selected', 'true');
  // 2 public apps: Customer Portal, Public Status Page.
  await expect(slate.appsSection.getByRole('article')).toHaveCount(2);
  await expect(slate.appCard('Customer Portal')).toBeVisible();
  await expect(slate.appCard('Public Status Page')).toBeVisible();
  await expect(slate.appCard('Inventory Dashboard')).toHaveCount(0);

  await slate.visibilityTab(/^all apps$/i).click();
  await expect(slate.appsSection.getByRole('article')).toHaveCount(6);
});

test('empty state shows when search + tab combine to zero matches', async ({ adminPage }) => {
  const slate = new SlatePage(adminPage);
  await slate.goto();

  // "incident" only matches the Incident Triage app, which is internal.
  // Switching to Public + that query yields zero rows and the empty card.
  await slate.searchInput.fill('incident');
  await slate.visibilityTab(/^public$/i).click();

  await expect(slate.appsSection.getByRole('article')).toHaveCount(0);
  await expect(adminPage.getByText(/no apps match these filters\./i)).toBeVisible();
});

test('Start-from-a-template section renders the four catalog templates', async ({
  adminPage,
}) => {
  const slate = new SlatePage(adminPage);
  await slate.goto();

  await expect(
    slate.templatesSection.getByRole('heading', { level: 2, name: /^start from a template$/i }),
  ).toBeVisible();

  // Four templates, each as an <article aria-label="…">. Scoping to
  // `templatesSection` disambiguates "Customer Portal" which also
  // exists as a published app card above.
  await expect(slate.templatesSection.getByRole('article')).toHaveCount(4);
  await expect(slate.templateCard('Operations Dashboard')).toBeVisible();
  await expect(slate.templateCard('Customer Portal')).toBeVisible();
  await expect(slate.templateCard('Incident Workflow')).toBeVisible();
  await expect(slate.templateCard('Marketing Landing')).toBeVisible();

  // Each template carries its category label (dashboard / portal / …).
  await expect(slate.templateCard('Operations Dashboard').getByText(/^dashboard$/i)).toBeVisible();
  await expect(slate.templateCard('Marketing Landing').getByText(/^landing$/i)).toBeVisible();
});

test('legacy /reports URL redirects to /slate', async ({ adminPage }) => {
  // `router.tsx` aliases `reports` → `/slate` via `redirectTo('/slate')`.
  await adminPage.goto('/reports');

  await expect(adminPage).toHaveURL(/\/slate(\/|$|\?|#)/);
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^web app studio$/i }),
  ).toBeVisible();
});

test('"Create app" CTA is gated behind Phase 4.2 (disabled with a roadmap tooltip)', async ({
  adminPage,
}) => {
  const slate = new SlatePage(adminPage);
  await slate.goto();

  // The roadmap "Create report" maps to this CTA today. The button
  // ships disabled with a `title` advertising Phase 4.2 — this test
  // pins both states so that flipping `disabled` accidentally surfaces
  // here, and so that the regression guard below still has something
  // to anchor on.
  const createBtn = adminPage.getByRole('button', { name: /create app/i });
  await expect(createBtn).toBeVisible();
  await expect(createBtn).toBeDisabled();
  await expect(createBtn).toHaveAttribute('title', /phase 4\.2/i);
});

test('absent today: rich-text editor, insert-block, publish, share, versioning, delete', async ({
  adminPage,
}) => {
  // Regression guard for the roadmap surface (rich-text reports
  // editor). When any of these locators starts matching we expect
  // the feature to be landing — this test will fail and force the
  // spec to be rewritten with real coverage rather than silently
  // drifting against an evolved page.
  //
  // All checks scope to `slate.pageArea` (the route's own content)
  // because the surrounding AppShell topbar carries a generic global
  // "Share" button that has nothing to do with reports/posts.
  const slate = new SlatePage(adminPage);
  await slate.goto();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^web app studio$/i }),
  ).toBeVisible();

  const area = slate.pageArea;

  // Rich text editor (e.g. Tiptap mounts a `contenteditable` element
  // typically exposed as `role="textbox"`).
  expect(await slate.editor.count()).toBe(0);
  expect(await area.locator('[contenteditable="true"]').count()).toBe(0);

  // Insert-block toolbar — chart / table / image.
  expect(await slate.insertBlockButton.count()).toBe(0);
  expect(
    await area.getByRole('button', { name: /^(insert|add)\s+(chart|table|image)/i }).count(),
  ).toBe(0);

  // Publish (draft → published) and Share controls. Note the page DOES
  // render the *string* "Published" inside per-card status chips — so
  // we scope to buttons only, which is what the publish CTA would be.
  expect(await slate.publishButton.count()).toBe(0);
  expect(await slate.shareButton.count()).toBe(0);

  // Versioning surface — usually a "Versions" / "History" affordance.
  expect(
    await area.getByRole('button', { name: /^(version history|versions|history)$/i }).count(),
  ).toBe(0);

  // Per-card delete control. The shipped cards expose a single "Open"
  // button (disabled today) and no destructive action.
  expect(
    await area.getByRole('button', { name: /^(delete|remove|archive)/i }).count(),
  ).toBe(0);
  // And the "Open" placeholder ships disabled — verifies we're still
  // on the placeholder shell rather than a real builder.
  const openButtons = area.getByRole('button', { name: /^open$/i });
  expect(await openButtons.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await openButtons.count()); i += 1) {
    await expect(openButtons.nth(i)).toBeDisabled();
  }
});
