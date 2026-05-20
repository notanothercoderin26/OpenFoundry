import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { OsdkAppsPage } from './pages';

/**
 * E2E coverage for `/osdk-apps`
 * (apps/web/src/routes/osdk-apps/OsdkAppsPage.tsx).
 *
 * The shipped OsdkAppsPage is a static management dashboard for the
 * Ontology-SDK-backed custom apps in this tenant:
 *   - a hero strip with an h1 ("Ontology SDK Apps") and a disabled
 *     "Create OSDK app" CTA tooltipped with the Phase-4.x roadmap note;
 *   - a 4-metric stats panel (Apps / In production / Public-facing /
 *     Requests / month);
 *   - a stage tablist (`role="tablist"`, `aria-label="Filter by stage"`)
 *     with All stages / Development / Staging / Production chips;
 *   - a card grid, one `<article aria-label={name}>` per OSDK app, with
 *     the generated SDK version, visibility, ontology-type count,
 *     monthly request volume, hosted-at URL and last-deploy timestamp.
 *
 * Every entry is a deployed OSDK app whose SDK has already been
 * generated — the static `MOCK_APPS` registry inside the page IS the
 * generated-SDK manifest the UI reads from. The page is purely
 * client-side (no fetch on mount; filtering happens in `useState` +
 * `useMemo`), so these specs install no per-test mocks beyond the
 * default catch-all wired by `fixtures/base`.
 *
 * Per-app **Generate SDK** and **Download SDK** affordances are roadmap
 * items and do not ship today; the **Create OSDK app** wizard ships
 * disabled with a Phase-4.x tooltip. Regression guards at the bottom
 * flip the moment any of those land, forcing the next author to
 * refresh this spec.
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

interface OsdkAppFixture {
  name: string;
  stage: 'development' | 'staging' | 'production';
  sdkVersion: string;
  visibility: 'internal' | 'public';
}

const OSDK_APPS: readonly OsdkAppFixture[] = [
  { name: 'Fleet Operations Console', stage: 'production', sdkVersion: '2.4.1', visibility: 'internal' },
  { name: 'Customer Self-Service Portal', stage: 'production', sdkVersion: '2.3.7', visibility: 'public' },
  { name: 'Field Tech PWA', stage: 'staging', sdkVersion: '2.4.0-rc.3', visibility: 'internal' },
  { name: 'Billing Cockpit', stage: 'development', sdkVersion: '2.4.1', visibility: 'internal' },
] as const;

const TOTAL_APPS = OSDK_APPS.length;
const PROD_APPS = OSDK_APPS.filter((a) => a.stage === 'production');
const PUBLIC_APPS = OSDK_APPS.filter((a) => a.visibility === 'public');

test('lists every OSDK app with its generated SDK metadata', async ({ authedPage }) => {
  const osdkApps = new OsdkAppsPage(authedPage);
  await osdkApps.goto();
  await osdkApps.expectLoaded();

  // Hero heading anchors "the right page is mounted".
  await expect(
    authedPage.getByRole('heading', { level: 1, name: /^ontology sdk apps$/i }),
  ).toBeVisible();

  // The "Your OSDK apps (N)" section header surfaces the manifest count.
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`your osdk apps\\s*\\(${TOTAL_APPS}\\)`, 'i'),
    }),
  ).toBeVisible();

  // Every OSDK app renders as an <article aria-label={name}> card with
  // its generated-SDK version + visibility on the meta line.
  for (const app of OSDK_APPS) {
    const card = authedPage.getByRole('article', { name: app.name });
    await expect(card).toBeVisible();
    const visibility = app.visibility === 'public' ? 'Public' : 'Internal';
    await expect(card).toContainText(`SDK v${app.sdkVersion} · ${visibility}`);
  }
  await expect(authedPage.getByRole('article')).toHaveCount(TOTAL_APPS);
});

test('stats panel summarises the SDK manifest (apps / prod / public / traffic)', async ({
  authedPage,
}) => {
  const osdkApps = new OsdkAppsPage(authedPage);
  await osdkApps.goto();

  // Stats live in the first `.of-panel` on the page; the second one
  // hosts the stage tablist. Scope keeps the matches unambiguous.
  const stats = authedPage.locator('.of-panel').first();

  // Labels + their corresponding metric values. Each metric is rendered
  // as two stacked <p> tags inside its own <div>, so the values are
  // standalone text nodes inside the panel.
  await expect(stats.getByText('Apps', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(TOTAL_APPS), { exact: true })).toBeVisible();

  await expect(stats.getByText('In production', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(PROD_APPS.length), { exact: true })).toBeVisible();

  await expect(stats.getByText('Public-facing', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(PUBLIC_APPS.length), { exact: true })).toBeVisible();

  // Compact-formatted total (Intl.NumberFormat → e.g. "2.8M"). The
  // exact rendering is locale-/runtime-dependent so we just pin the
  // label + presence of a non-zero compact-suffixed value.
  await expect(stats.getByText('Requests / month', { exact: true })).toBeVisible();
  await expect(stats).toContainText(/\d+(\.\d+)?[KMB]/);
});

test('the stage tablist filters the SDK manifest grid to that bucket', async ({
  authedPage,
}) => {
  const osdkApps = new OsdkAppsPage(authedPage);
  await osdkApps.goto();

  const tablist = authedPage.getByRole('tablist', { name: /filter by stage/i });
  await expect(tablist).toBeVisible();

  // "All stages" is the on-mount selection.
  await expect(tablist.getByRole('tab', { name: /all stages/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Switching to "Production" restricts the grid to PROD_APPS.
  const prodTab = tablist.getByRole('tab', { name: /^production$/i });
  await prodTab.click();
  await expect(prodTab).toHaveAttribute('aria-selected', 'true');

  await expect(authedPage.getByRole('article')).toHaveCount(PROD_APPS.length);
  for (const app of PROD_APPS) {
    await expect(authedPage.getByRole('article', { name: app.name })).toBeVisible();
  }
  // Staging / development apps drop out of the grid.
  await expect(authedPage.getByRole('article', { name: 'Field Tech PWA' })).toHaveCount(0);
  await expect(authedPage.getByRole('article', { name: 'Billing Cockpit' })).toHaveCount(0);

  // The "(N)" count in the section heading reflects the filtered count.
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`your osdk apps\\s*\\(${PROD_APPS.length}\\)`, 'i'),
    }),
  ).toBeVisible();

  // Switching back to "All stages" restores the full SDK manifest.
  await tablist.getByRole('tab', { name: /all stages/i }).click();
  await expect(authedPage.getByRole('article')).toHaveCount(TOTAL_APPS);
});

test('"Development" filter narrows to the lone in-flight app', async ({ authedPage }) => {
  const osdkApps = new OsdkAppsPage(authedPage);
  await osdkApps.goto();

  await authedPage
    .getByRole('tablist', { name: /filter by stage/i })
    .getByRole('tab', { name: /^development$/i })
    .click();

  // Only the Billing Cockpit lives in development today.
  await expect(authedPage.getByRole('article')).toHaveCount(1);
  await expect(authedPage.getByRole('article', { name: 'Billing Cockpit' })).toBeVisible();
});

test('the "Create OSDK app" CTA ships disabled with a Phase-4.x tooltip', async ({
  authedPage,
}) => {
  const osdkApps = new OsdkAppsPage(authedPage);
  await osdkApps.goto();

  // The page object's `newAppButton` matches `/new app|create/i`. Pin
  // the exact label so the test surfaces a silent CTA rename.
  const createBtn = authedPage.getByRole('button', { name: /create osdk app/i });
  await expect(createBtn).toBeVisible();
  await expect(createBtn).toBeDisabled();
  await expect(createBtn).toHaveAttribute('title', /phase 4\.x/i);
});

test('absent today: per-app "Generate SDK" affordance', async ({ authedPage }) => {
  // Regression guard for the roadmap per-app SDK regeneration control.
  // When the feature catches up, this `count() === 0` flips and forces
  // the developer to refresh this spec.
  const osdkApps = new OsdkAppsPage(authedPage);
  await osdkApps.goto();
  await osdkApps.expectLoaded();

  expect(await osdkApps.generateSdkButton.count()).toBe(0);
});

test('absent today: per-app "Download SDK" affordance', async ({ authedPage }) => {
  // Regression guard for the roadmap per-app SDK download / artifact
  // export control. None ships today (the AppShell does not surface a
  // "Download" button either, so the page-wide locator is safe).
  const osdkApps = new OsdkAppsPage(authedPage);
  await osdkApps.goto();
  await osdkApps.expectLoaded();

  expect(await osdkApps.downloadButton.count()).toBe(0);
});
