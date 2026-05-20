import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { CustomWidgetsPage } from './pages';

/**
 * E2E coverage for `/widgets`
 * (apps/web/src/routes/widgets/CustomWidgetsPage.tsx).
 *
 * The shipped CustomWidgetsPage is a static read-only widget gallery:
 *   - hero with an h1 ("Custom Widgets") + a disabled "Publish widget"
 *     CTA tooltipped with the Phase-4.x roadmap note;
 *   - a 4-metric stats panel (Widgets / Published / Used in Workshop
 *     apps / Frameworks supported);
 *   - a category tablist (`role="tablist"`,
 *     `aria-label="Filter by category"`) with All / Chart / Object
 *     view / Input / Industry chips;
 *   - "Widget gallery (N)" card grid: one `<article aria-label={name}>`
 *     per widget, showing the version, framework, status chip,
 *     description, Workshop-apps consumption count and updated-relative
 *     timestamp.
 *
 * Every entry comes from the in-file `MOCK_WIDGETS` constant — there is
 * no fetch on mount and the only state is the `categoryFilter`. These
 * specs install no per-test mocks beyond the default catch-all wired
 * by `fixtures/base`.
 *
 * The roadmap reserves slots for: a **widget editor** (name + Monaco
 * code + props schema + live preview), a **publish-to-Workshop** flow
 * (the page's CTA today is disabled), **version history**, and
 * **delete**. None of those affordances ship today; the version
 * number is rendered on each card but only as static metadata.
 * Regression-guard tests at the bottom flip the moment any of those
 * land.
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

interface WidgetFixture {
  name: string;
  version: string;
  framework: 'React' | 'Vue' | 'Web Component';
  category: 'chart' | 'object-view' | 'input' | 'industry';
  status: 'published' | 'draft' | 'deprecated';
  workshopApps: number;
}

const WIDGETS: readonly WidgetFixture[] = [
  { name: 'Flight Plan Map', version: '1.4.2', framework: 'React', category: 'industry', status: 'published', workshopApps: 4 },
  { name: 'Signature Pad', version: '2.0.0', framework: 'React', category: 'input', status: 'published', workshopApps: 12 },
  { name: 'Radar Chart Plus', version: '1.2.1', framework: 'Web Component', category: 'chart', status: 'published', workshopApps: 9 },
  { name: 'Asset 3D Viewer', version: '0.9.0', framework: 'React', category: 'object-view', status: 'draft', workshopApps: 1 },
  { name: 'Operational Gantt', version: '3.1.0', framework: 'React', category: 'chart', status: 'published', workshopApps: 6 },
  { name: 'Incident Banner (legacy)', version: '1.0.4', framework: 'Vue', category: 'object-view', status: 'deprecated', workshopApps: 0 },
] as const;

const TOTAL = WIDGETS.length;
const PUBLISHED = WIDGETS.filter((w) => w.status === 'published');
const USED_IN_APPS = PUBLISHED.reduce((sum, w) => sum + w.workshopApps, 0);
const FRAMEWORKS = new Set(WIDGETS.map((w) => w.framework)).size;

const CHART_WIDGETS = WIDGETS.filter((w) => w.category === 'chart');
const OBJECT_VIEW_WIDGETS = WIDGETS.filter((w) => w.category === 'object-view');

const STATUS_LABEL = {
  published: 'Published',
  draft: 'Draft',
  deprecated: 'Deprecated',
} as const;

test('lists every custom widget with version, framework and status', async ({
  authedPage,
}) => {
  const widgets = new CustomWidgetsPage(authedPage);
  await widgets.goto();
  await widgets.expectLoaded();

  await expect(
    authedPage.getByRole('heading', { level: 1, name: /^custom widgets$/i }),
  ).toBeVisible();

  // "Widget gallery (N)" anchors the gallery section count.
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`widget gallery\\s*\\(${TOTAL}\\)`, 'i'),
    }),
  ).toBeVisible();

  // One <article aria-label={name}> card per MOCK_WIDGETS entry.
  for (const w of WIDGETS) {
    const card = authedPage.getByRole('article', { name: w.name });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`v${w.version}`);
    await expect(card).toContainText(w.framework);
    await expect(card).toContainText(STATUS_LABEL[w.status]);
  }
  await expect(authedPage.getByRole('article')).toHaveCount(TOTAL);
});

test('stats panel summarises totals, published, Workshop usage and frameworks', async ({
  authedPage,
}) => {
  const widgets = new CustomWidgetsPage(authedPage);
  await widgets.goto();

  // Stats panel is the first `.of-panel`; the category tablist is the
  // second. Scope to disambiguate the numeric matches.
  const stats = authedPage.locator('.of-panel').first();

  await expect(stats.getByText('Widgets', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(TOTAL), { exact: true })).toBeVisible();

  await expect(stats.getByText('Published', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(PUBLISHED.length), { exact: true })).toBeVisible();

  // Workshop apps total only counts the *published* widgets'
  // consumption (4 + 12 + 9 + 6 = 31). Draft / deprecated widgets are
  // excluded from the rollup.
  await expect(stats.getByText('Used in Workshop apps', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(USED_IN_APPS), { exact: true })).toBeVisible();

  // Unique framework count (React + Vue + Web Component = 3).
  await expect(stats.getByText('Frameworks supported', { exact: true })).toBeVisible();
  await expect(stats.getByText(String(FRAMEWORKS), { exact: true })).toBeVisible();
});

test('the category tablist filters the widget gallery', async ({ authedPage }) => {
  const widgets = new CustomWidgetsPage(authedPage);
  await widgets.goto();

  const tablist = authedPage.getByRole('tablist', { name: /filter by category/i });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole('tab', { name: /all categories/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // Chart bucket: Radar Chart Plus + Operational Gantt.
  await tablist.getByRole('tab', { name: /^chart$/i }).click();
  await expect(authedPage.getByRole('article')).toHaveCount(CHART_WIDGETS.length);
  for (const w of CHART_WIDGETS) {
    await expect(authedPage.getByRole('article', { name: w.name })).toBeVisible();
  }
  // Non-chart widgets drop out of the grid.
  await expect(
    authedPage.getByRole('article', { name: 'Signature Pad' }),
  ).toHaveCount(0);
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`widget gallery\\s*\\(${CHART_WIDGETS.length}\\)`, 'i'),
    }),
  ).toBeVisible();

  // Object view bucket: Asset 3D Viewer + Incident Banner (legacy).
  await tablist.getByRole('tab', { name: /^object view$/i }).click();
  await expect(authedPage.getByRole('article')).toHaveCount(OBJECT_VIEW_WIDGETS.length);
  for (const w of OBJECT_VIEW_WIDGETS) {
    await expect(authedPage.getByRole('article', { name: w.name })).toBeVisible();
  }

  // All categories → restore.
  await tablist.getByRole('tab', { name: /all categories/i }).click();
  await expect(authedPage.getByRole('article')).toHaveCount(TOTAL);
});

test('each card surfaces its semver version + Workshop-apps consumption count', async ({
  authedPage,
}) => {
  // Versioning is partial today: every card shows a `v<semver>` label
  // and the count of Workshop apps using the widget. The Phase-4.x
  // editor will eventually own a true version-history surface (see
  // the regression guard at the bottom).
  const widgets = new CustomWidgetsPage(authedPage);
  await widgets.goto();

  for (const w of WIDGETS) {
    const card = authedPage.getByRole('article', { name: w.name });
    await expect(card).toContainText(`v${w.version}`);
    // The footer line reads "<N> app(s) · <Category>" — pin the
    // pluralisation so accidentally hard-coding "apps" surfaces here.
    const appsCopy = `${w.workshopApps} app${w.workshopApps === 1 ? '' : 's'}`;
    await expect(card).toContainText(appsCopy);
  }
});

test('the "Publish widget" CTA ships disabled with a Phase-4.x tooltip', async ({
  authedPage,
}) => {
  // Today's CTA represents both the create flow (no editor) and the
  // publish-to-Workshop flow (the CLI gate). Pin disabled + tooltip so
  // a silent un-gating surfaces here.
  const widgets = new CustomWidgetsPage(authedPage);
  await widgets.goto();

  const cta = authedPage.getByRole('button', { name: /^publish widget$/i });
  await expect(cta).toBeVisible();
  await expect(cta).toBeDisabled();
  await expect(cta).toHaveAttribute('title', /phase 4\.x/i);

  // The page object's `publishButton` alias resolves to the same
  // disabled button.
  await expect(widgets.publishButton).toBeDisabled();
});

test('absent today: widget editor (name + Monaco code + props schema + preview)', async ({
  authedPage,
}) => {
  // Regression guard for the roadmap editor. When the form lands, each
  // `count() === 0` flips and forces this spec to grow proper
  // input-driven assertions.
  const widgets = new CustomWidgetsPage(authedPage);
  await widgets.goto();
  await widgets.expectLoaded();

  // The page object reserves these locators for the future editor.
  expect(await widgets.newWidgetButton.count()).toBe(0);
  expect(await widgets.previewPanel.count()).toBe(0);

  const page = authedPage.locator('section.of-page');
  // Name / props-schema / code fields are not modelled on the PO yet;
  // pin their absence by-label inside the page scope.
  expect(await page.getByLabel(/^(name|widget name)$/i).count()).toBe(0);
  expect(await page.getByLabel(/^(props|props schema|schema)$/i).count()).toBe(0);
  expect(await page.getByLabel(/^(code|source)$/i).count()).toBe(0);

  // Monaco renders a `.monaco-editor` div with `role="code"`. Neither
  // surfaces here today.
  expect(await page.locator('.monaco-editor').count()).toBe(0);
  expect(await page.getByRole('code').count()).toBe(0);
});

test('absent today: version-history picker on a published widget', async ({
  authedPage,
}) => {
  // The card shows a static `v<semver>` label but no version selector,
  // rollback button, or history drawer.
  const widgets = new CustomWidgetsPage(authedPage);
  await widgets.goto();
  await widgets.expectLoaded();

  const page = authedPage.locator('section.of-page');
  expect(
    await page.getByRole('button', { name: /^(history|rollback|prev(ious)?\s+version|new\s+version)\b/i }).count(),
  ).toBe(0);
  expect(await page.getByLabel(/^version$/i).count()).toBe(0);
  // No combobox/select scoped to version either.
  expect(await page.getByRole('combobox', { name: /version/i }).count()).toBe(0);
});

test('absent today: per-widget delete affordance', async ({ authedPage }) => {
  // Regression guard for the roadmap row-level delete. Today the only
  // status-shaped controls on each card are the `<span>` chips
  // (Published / Draft / Deprecated) — no actionable buttons.
  const widgets = new CustomWidgetsPage(authedPage);
  await widgets.goto();
  await widgets.expectLoaded();

  const page = authedPage.locator('section.of-page');
  expect(
    await page.getByRole('button', { name: /^(delete|remove|deprecate|retire)\b/i }).count(),
  ).toBe(0);
});
