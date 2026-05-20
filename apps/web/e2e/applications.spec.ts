import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { ApplicationsPage } from './pages';

/**
 * E2E coverage for `/applications`
 * (apps/web/src/routes/applications/ApplicationsPage.tsx).
 *
 * The shipped ApplicationsPage is a static discovery dashboard:
 *   - a "Search for apps..." input in the page header;
 *   - a category sidebar with per-bucket counters
 *     (All apps / Platform apps / Administration / Analytics & Operations /
 *      Application development / Data integration / Developer toolchain /
 *      Ontology);
 *   - a grid of cards, each a router `<Link>` to the matching app's route.
 *
 * Every entry rendered here is, by definition, a deployed application in
 * this OpenFoundry tenant: the static `APPS` registry inside the page
 * IS the deploy manifest the UI reads from. There is no fetch on mount;
 * filtering happens entirely in `useState` + `useMemo`. As a result these
 * specs install no per-test mocks beyond the default catch-all already
 * wired by `fixtures/base`.
 *
 * Deploy / undeploy lifecycle controls and a per-app logs entry point are
 * on the roadmap but do not ship today. The regression-guard tests at
 * the bottom flip the moment that feature lands, forcing whoever ships
 * it to refresh this spec.
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

const DEPLOYED_APP_NAMES = [
  'Object explorer',
  'Contour',
  'Quiver',
  'Notepad',
  'Workshop',
  'Pipeline builder',
  'Code repositories',
  'Ontology manager',
  'Object & link types',
  'Interfaces',
  'Compute Modules',
  'Foundry Rules',
  'Data Connection',
  'Streaming',
  'Builds',
  'Build schedules',
  'Lineage',
  'Developers',
  'Control panel',
  'Workspace settings',
] as const;

const TOTAL_DEPLOYED = DEPLOYED_APP_NAMES.length;

test('lists every deployed application as a navigable card', async ({ authedPage }) => {
  const applications = new ApplicationsPage(authedPage);
  await applications.goto();
  await applications.expectLoaded();

  // The page header's "Search for apps..." input is the most specific
  // "the right page is mounted" anchor — the sidebar also has an
  // "Applications" link so getByText is ambiguous.
  await expect(authedPage.getByPlaceholder('Search for apps...')).toBeVisible();

  // Every deployed app renders as a router <Link>. The card's accessible
  // name concatenates "<Name><Description>" so anchor on the name.
  const main = authedPage.getByRole('region', { name: 'Application catalog' });
  for (const name of DEPLOYED_APP_NAMES) {
    await expect(
      main.getByRole('link', { name: new RegExp(`^${name}\\b`, 'i') }),
    ).toBeVisible();
  }

  // The grid has exactly one card per deployed app.
  await expect(main.getByRole('link')).toHaveCount(TOTAL_DEPLOYED);
  // And the "All apps" category counter agrees with the deploy manifest.
  await expect(
    authedPage.getByRole('button', {
      name: new RegExp(`^All apps\\s+${TOTAL_DEPLOYED}$`, 'i'),
    }),
  ).toBeVisible();
});

test('search filters the deployed apps to those matching name or description', async ({
  authedPage,
}) => {
  const applications = new ApplicationsPage(authedPage);
  await applications.goto();

  const main = authedPage.getByRole('region', { name: 'Application catalog' });
  const searchInput = authedPage.getByPlaceholder('Search for apps...');

  // "Quiver" is the only entry whose description mentions "spreadsheet".
  await searchInput.fill('spreadsheet');
  await expect(main.getByRole('link')).toHaveCount(1);
  await expect(main.getByRole('link', { name: /^Quiver\b/i })).toBeVisible();

  // Clearing the query restores the full deploy manifest.
  await searchInput.fill('');
  await expect(main.getByRole('link')).toHaveCount(TOTAL_DEPLOYED);

  // A query that matches nothing surfaces the empty-state copy.
  await searchInput.fill('zzz-nonexistent-app');
  await expect(main.getByRole('link')).toHaveCount(0);
  await expect(authedPage.getByText(/no apps match the current filters/i)).toBeVisible();
});

test('selecting a category restricts the deployed-apps view to that bucket', async ({
  authedPage,
}) => {
  const applications = new ApplicationsPage(authedPage);
  await applications.goto();

  // Ontology bucket has 3 deployed apps: Ontology manager,
  // Object & link types, Interfaces. The button's accessible name
  // concatenates "<label> <count>" so we anchor on that exact shape.
  await authedPage.getByRole('button', { name: /^Ontology\s+3$/i }).click();

  const main = authedPage.getByRole('region', { name: 'Application catalog' });
  await expect(main.getByRole('link')).toHaveCount(3);
  await expect(main.getByRole('link', { name: /^Ontology manager\b/i })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Object & link types\b/i })).toBeVisible();
  await expect(main.getByRole('link', { name: /^Interfaces\b/i })).toBeVisible();

  // Apps outside the bucket disappear from the grid.
  await expect(main.getByRole('link', { name: /^Contour\b/i })).toHaveCount(0);
  await expect(main.getByRole('link', { name: /^Pipeline builder\b/i })).toHaveCount(0);

  // Switching back to "All apps" restores the full deploy manifest.
  await authedPage
    .getByRole('button', { name: new RegExp(`^All apps\\s+${TOTAL_DEPLOYED}$`, 'i') })
    .click();
  await expect(main.getByRole('link')).toHaveCount(TOTAL_DEPLOYED);
});

test('clicking a deployed application card navigates to that app', async ({
  authedPage,
}) => {
  const applications = new ApplicationsPage(authedPage);
  await applications.goto();

  const contour = authedPage
    .getByRole('region', { name: 'Application catalog' })
    .getByRole('link', { name: /^Contour\b/i });
  // The card's href points at the app's route before navigation.
  await expect(contour).toHaveAttribute('href', '/contour');

  await contour.click();
  await expect(authedPage).toHaveURL(/\/contour(\/|\?|#|$)/);
});

test('absent today: deploy / undeploy controls on the applications list', async ({
  authedPage,
}) => {
  // Regression guard for the roadmap per-app lifecycle controls. When
  // the feature catches up, these `count() === 0` assertions flip and
  // force the developer to refresh this spec.
  const applications = new ApplicationsPage(authedPage);
  await applications.goto();
  await applications.expectLoaded();

  // The page object's locators are page-wide; the AppShell does not
  // surface deploy/undeploy text either, so the assertion holds across
  // the whole document.
  expect(await applications.deployButton.count()).toBe(0);
  expect(await applications.undeployButton.count()).toBe(0);
});

test('absent today: per-application logs entry point', async ({ authedPage }) => {
  // Regression guard for the roadmap "Logs" affordance on each card.
  // ApplicationsPage exposes none today.
  const applications = new ApplicationsPage(authedPage);
  await applications.goto();
  await applications.expectLoaded();

  expect(await applications.logsButton.count()).toBe(0);
});
