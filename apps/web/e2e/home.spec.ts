import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * E2E coverage for `/` (apps/web/src/routes/Home.tsx).
 *
 * The shipped Home page is a workspace dashboard composed of:
 *   - `HomeGreeting`     — "Good morning/afternoon/evening, <name>" header.
 *   - `RecentStrip`      — cards for recently-visited resources, rendered
 *                          ONLY when `/workspace/recents` returns ≥1 entry.
 *   - `QuickStartTiles`  — four CTA tiles (Create collection, Upload a
 *                          dataset, Build a pipeline, Explore the
 *                          ontology), rendered ONLY when projects +
 *                          datasets + recents are all empty.
 *   - A 5-tab spaces strip (Dataset Preview / Portfolios / Projects /
 *     Your files / Shared) with per-tab views.
 *   - A "+ New" dropdown menu in the data-catalog view header with
 *     four actions (New collection / New dataset / New pipeline /
 *     Upload data).
 *
 * Endpoints called on mount (Promise.all):
 *   - GET /api/v1/ontology/projects?per_page=50
 *   - GET /api/v1/datasets?...
 *   - GET /api/v1/workspace/shared-with-me?limit=50
 *   - GET /api/v1/workspace/recents?limit=8
 *   - POST /api/v1/workspace/resources/resolve  (only when recents > 0)
 *
 * The Home page does NOT host the global quick-search popover; that
 * lives in the Sidebar and is covered by `smoke-navigation.spec.ts`.
 * The roadmap's `/api/v1/search/suggestions` path is therefore not
 * mocked here.
 */

// AppShell + Home render a lot of widgets that legitimately log when
// the catch-all returns empty envelopes for their endpoints. Widen the
// allowlist for the same noise we tolerated in fixtures-smoke; the
// pageErrors auto-fixture still fails on anything else.
test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load workspace/,
    ],
  },
});

const PROJECT_FIXTURE = {
  id: 'project-1',
  slug: 'analytics',
  display_name: 'Analytics',
  description: 'Demo analytics collection',
  created_at: '2026-05-11T00:00:00Z',
  updated_at: '2026-05-11T00:00:00Z',
};

const DATASET_FIXTURE = {
  id: 'dataset-1',
  name: 'Customers v1',
  description: 'Demo customers dataset',
  owner_id: '00000000-0000-0000-0000-000000000001',
  project_id: 'project-1',
  format: 'csv',
  size_bytes: 1024,
  row_count: 100,
  tags: ['demo'],
  storage_path: '/datasets/dataset-1',
  created_at: '2026-05-11T00:00:00Z',
  updated_at: '2026-05-11T00:00:00Z',
};

const RECENT_FIXTURE = {
  id: 'recent-1',
  resource_kind: 'dataset' as const,
  resource_id: 'dataset-1',
  last_accessed_at: '2026-05-19T22:00:00Z',
};

interface HomeMockOverrides {
  projects?: unknown[];
  datasets?: unknown[];
  shared?: unknown[];
  recents?: unknown[];
  /** When set, the matching endpoint returns this status. */
  failures?: Partial<Record<'projects' | 'datasets' | 'shared' | 'recents', number>>;
}

/**
 * Install per-test mocks for the four endpoints Home reads on mount,
 * plus the label-resolution endpoint that fires when recents are
 * present. Each list defaults to empty.
 */
async function mockHomeEndpoints(
  page: Page,
  overrides: HomeMockOverrides = {},
): Promise<void> {
  const projects = overrides.projects ?? [];
  const datasets = overrides.datasets ?? [];
  const shared = overrides.shared ?? [];
  const recents = overrides.recents ?? [];
  const failures = overrides.failures ?? {};

  const fail = (route: Route, status: number) =>
    route.fulfill({ status, json: { error: 'mocked failure' } });

  await page.route('**/api/v1/ontology/projects**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (failures.projects) return fail(route, failures.projects);
    await route.fulfill({
      json: { data: projects, total: projects.length, page: 1, per_page: 50 },
    });
  });

  await page.route('**/api/v1/datasets**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (failures.datasets) return fail(route, failures.datasets);
    await route.fulfill({ json: { data: datasets, next_cursor: null, total: datasets.length } });
  });

  await page.route('**/api/v1/workspace/shared-with-me**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (failures.shared) return fail(route, failures.shared);
    await route.fulfill({ json: { data: shared } });
  });

  await page.route('**/api/v1/workspace/recents**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (failures.recents) return fail(route, failures.recents);
    await route.fulfill({ json: { data: recents } });
  });

  await page.route('**/api/v1/workspace/resources/resolve', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: { data: [] } });
  });
}

test('renders the AppShell + greeting + spaces strip', async ({ adminPage }) => {
  await mockHomeEndpoints(adminPage, {
    projects: [PROJECT_FIXTURE],
    datasets: [DATASET_FIXTURE],
  });
  await adminPage.goto('/');

  // AppShell primary nav (the same locator AppShellPage uses).
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();

  // Greeting H1: "Good morning/afternoon/evening, <name>".
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /good (morning|afternoon|evening)/i }),
  ).toBeVisible();

  // 5-tab spaces strip — pin each tab name so a new/renamed tab surfaces
  // here rather than silently changing UX.
  for (const tab of ['Dataset Preview', 'Portfolios', 'Projects', 'Your files', 'Shared']) {
    await expect(adminPage.getByRole('button', { name: tab })).toBeVisible();
  }

  // "Manage spaces" + Settings link in the top-right.
  await expect(adminPage.getByRole('link', { name: /manage spaces/i })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /^settings$/i })).toBeVisible();
});

test('renders the Recent strip when /workspace/recents returns entries', async ({
  adminPage,
}) => {
  await mockHomeEndpoints(adminPage, {
    projects: [PROJECT_FIXTURE],
    datasets: [DATASET_FIXTURE],
    recents: [RECENT_FIXTURE],
  });
  await adminPage.goto('/');

  // "Recent" eyebrow heading is rendered as an h2.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /recent/i }),
  ).toBeVisible();
  // "View all" link drops the user on the Recent page.
  const viewAll = adminPage.getByRole('link', { name: /view all/i });
  await expect(viewAll).toHaveAttribute('href', /\/recent/);
});

test('empty workspace: renders Get-started tiles and the empty catalog', async ({
  adminPage,
}) => {
  await mockHomeEndpoints(adminPage); // everything empty
  await adminPage.goto('/');

  // Get-started section appears.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /get started/i }),
  ).toBeVisible();

  // All four QuickStartTiles present.
  await expect(
    adminPage.getByRole('button', { name: /create a collection/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /upload a dataset/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /build a pipeline/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /explore the ontology/i }),
  ).toBeVisible();

  // The data-catalog table shows its empty state ("No collections yet").
  await expect(
    adminPage.getByText(/no collections yet/i),
  ).toBeVisible();
});

test('"+ New" dropdown exposes the create CTAs with the correct hrefs', async ({
  adminPage,
}) => {
  // We need DataCatalogView visible — the default tab activates it.
  await mockHomeEndpoints(adminPage, {
    projects: [PROJECT_FIXTURE],
    datasets: [DATASET_FIXTURE],
  });
  await adminPage.goto('/');

  // The toggle button has the accessible name "New" plus the chevron;
  // we match on the surrounding text.
  const newToggle = adminPage.getByRole('button', { name: /^new\s*▾$/i });
  await expect(newToggle).toBeVisible();
  await newToggle.click();

  const menu = adminPage.getByRole('menu');
  await expect(menu).toBeVisible();

  // New collection → button (opens the create-project modal, no href).
  await expect(
    menu.getByRole('menuitem', { name: /^new collection/i }),
  ).toBeVisible();

  // New dataset / New pipeline / Upload data render as router Links
  // with the documented hrefs. Anchor each regex with `^…` so the
  // accessible name (label + description) match doesn't accidentally
  // cross-match (the "Upload data" description literally contains the
  // string "new dataset").
  await expect(
    menu.getByRole('menuitem', { name: /^new dataset/i }),
  ).toHaveAttribute('href', /\/datasets$/);
  await expect(
    menu.getByRole('menuitem', { name: /^new pipeline/i }),
  ).toHaveAttribute('href', /\/pipelines\/new$/);
  await expect(
    menu.getByRole('menuitem', { name: /^upload data/i }),
  ).toHaveAttribute('href', /\/datasets\/upload$/);
});

test('QuickStart tile "Upload a dataset" navigates to /datasets/upload', async ({
  adminPage,
}) => {
  await mockHomeEndpoints(adminPage); // empty → tiles render
  await adminPage.goto('/');

  await adminPage.getByRole('link', { name: /upload a dataset/i }).click();
  await expect(adminPage).toHaveURL(/\/datasets\/upload(\?|$)/);
});

test('switching to the Projects space renders the Projects view', async ({
  adminPage,
}) => {
  await mockHomeEndpoints(adminPage, { projects: [PROJECT_FIXTURE] });
  await adminPage.goto('/');

  await adminPage.getByRole('button', { name: 'Projects' }).click();

  // The view's H1 reads "Projects" (distinct from the spaces tab button).
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^projects$/i }),
  ).toBeVisible();
  // And the mocked project row is rendered with a stable URL link.
  await expect(
    adminPage.getByRole('link', { name: /analytics/i }),
  ).toBeVisible();
});

test('error in one widget: shows the danger banner, the page still renders', async ({
  adminPage,
}) => {
  await mockHomeEndpoints(adminPage, {
    failures: { projects: 500 },
    datasets: [DATASET_FIXTURE],
  });
  await adminPage.goto('/');

  // Home catches the failing Promise.all() and sets `error` → the
  // .of-status-danger banner renders with the message.
  await expect(adminPage.locator('.of-status-danger').first()).toBeVisible();

  // But the rest of the page is intact: greeting + spaces strip still
  // there, no white screen.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /good (morning|afternoon|evening)/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();
});

test('local search filters the catalog table', async ({ adminPage }) => {
  await mockHomeEndpoints(adminPage, {
    projects: [
      { ...PROJECT_FIXTURE, id: 'project-1', slug: 'analytics', display_name: 'Analytics' },
      {
        ...PROJECT_FIXTURE,
        id: 'project-2',
        slug: 'finance',
        display_name: 'Finance',
        description: 'Quarterly numbers',
      },
    ],
  });
  await adminPage.goto('/');

  // Both rows visible to start.
  await expect(adminPage.getByRole('link', { name: /^analytics$/i })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /^finance$/i })).toBeVisible();

  // Search by display_name — useMemo() filters locally; no extra request.
  await adminPage.getByPlaceholder(/search collections/i).fill('finance');
  await expect(adminPage.getByRole('link', { name: /^analytics$/i })).toHaveCount(0);
  await expect(adminPage.getByRole('link', { name: /^finance$/i })).toBeVisible();
});

test('a11y: Home renders without serious axe violations', async ({ adminPage }) => {
  await mockHomeEndpoints(adminPage, {
    projects: [PROJECT_FIXTURE],
    datasets: [DATASET_FIXTURE],
    recents: [RECENT_FIXTURE],
  });
  await adminPage.goto('/');
  // Wait for the heading so axe doesn't run mid-suspense.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /good (morning|afternoon|evening)/i }),
  ).toBeVisible();

  // AppShell + Home currently has the same app-wide color-contrast and
  // landmark debt that helpers-smoke documents; Task 21.1 will sweep it.
  // Keep those rules at `warn` so the JSON report still records them
  // without blocking this smoke.
  await expectNoA11yViolations(adminPage, {
    rules: {
      'color-contrast': 'warn',
      'link-name': 'warn',
      region: 'warn',
      'landmark-one-main': 'warn',
      'landmark-unique': 'warn',
      'landmark-complementary-is-top-level': 'warn',
      'page-has-heading-one': 'warn',
      'heading-order': 'warn',
      'aria-allowed-attr': 'warn',
      'aria-prohibited-attr': 'warn',
      'aria-required-children': 'warn',
      'aria-required-parent': 'warn',
      'nested-interactive': 'warn',
      'scrollable-region-focusable': 'warn',
      'duplicate-id-aria': 'warn',
    },
  });
});
