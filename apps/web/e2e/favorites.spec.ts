import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { FavoritesPage } from './pages';

/**
 * E2E coverage for `/favorites`
 * (apps/web/src/routes/favorites/FavoritesPage.tsx).
 *
 * **Reality vs roadmap.** The shipped FavoritesPage is a grouped-list
 * editor — NOT the filter-and-search shortcuts dashboard described in
 * the roadmap. Each row exposes:
 *   - a Link to the resource (icon + label + "kind · id");
 *   - a `<select>` to move the favorite between groups;
 *   - chevron-up / chevron-down to reorder within the section;
 *   - a trash button to remove the favorite.
 *
 * There is **no** type filter, **no** ★ star toggle (it's a trash
 * icon), **no** sort dropdown, and **no** search input. The roadmap
 * cases that map to those controls are folded into a single absent-
 * today regression guard at the end of the file.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/workspace/favorites?limit=1000        (with groups)
 *   - POST   /api/v1/workspace/resources/resolve           (labels)
 *   - DELETE /api/v1/workspace/favorites/{kind}/{id}
 *   - PUT    /api/v1/workspace/favorites/order
 *   - POST   /api/v1/workspace/favorites/groups
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load favorites/,
    ],
  },
});

const FAVORITES_LIST = /\/api\/v1\/workspace\/favorites(\?|$)/;
const FAVORITES_ORDER = /\/api\/v1\/workspace\/favorites\/order$/;
const FAVORITES_GROUPS = /\/api\/v1\/workspace\/favorites\/groups$/;
const FAVORITE_DELETE = /\/api\/v1\/workspace\/favorites\/[^/]+\/[^/]+$/;
const E2E_NOW = '2026-05-11T00:00:00Z';

interface UserFavoriteFixture {
  user_id: string;
  resource_kind: string;
  resource_id: string;
  group_id: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface FavoriteGroupFixture {
  id: string;
  user_id: string;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface ResolvedLabelFixture {
  resource_kind: string;
  resource_id: string;
  label: string;
}

function makeFavorite(overrides: Partial<UserFavoriteFixture> = {}): UserFavoriteFixture {
  return {
    user_id: '00000000-0000-0000-0000-000000000001',
    resource_kind: 'dataset',
    resource_id: 'dataset-1',
    group_id: null,
    display_order: 1000,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<FavoriteGroupFixture> = {}): FavoriteGroupFixture {
  return {
    id: 'group-1',
    user_id: '00000000-0000-0000-0000-000000000001',
    name: 'Sample group',
    display_order: 1000,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface FavoritesMockState {
  favorites: UserFavoriteFixture[];
  groups: FavoriteGroupFixture[];
  labels: ResolvedLabelFixture[];
  /**
   * When set, every GET returns this status. NOT a one-shot — React 19
   * StrictMode dev-mode double-mounts effects so a `failOnce` flag would
   * be consumed by the first mount and the second mount would land
   * happily on the empty-success envelope.
   */
  alwaysFail?: number;
}

/**
 * Stateful mock for the favorites endpoints. The page calls
 * `loadFavorites()` again after every mutation (create-group, move,
 * reorder, delete), so each mutation handler must mutate the state and
 * the GET handler must reflect it.
 */
async function mockFavorites(page: Page, initial: FavoritesMockState): Promise<void> {
  const state: FavoritesMockState = {
    favorites: initial.favorites.slice(),
    groups: initial.groups.slice(),
    labels: initial.labels.slice(),
    alwaysFail: initial.alwaysFail,
  };

  await page.route(FAVORITES_LIST, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (state.alwaysFail) {
      await route.fulfill({
        status: state.alwaysFail,
        json: { error: 'mocked failure' },
      });
      return;
    }
    await route.fulfill({
      json: { data: state.favorites, groups: state.groups },
    });
  });

  await page.route('**/api/v1/workspace/resources/resolve', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: { data: state.labels } });
  });

  await page.route(FAVORITE_DELETE, async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    const match = /\/workspace\/favorites\/([^/]+)\/([^/]+)$/.exec(route.request().url());
    if (match) {
      const [, kind, id] = match;
      state.favorites = state.favorites.filter(
        (entry) => !(entry.resource_kind === kind && entry.resource_id === id),
      );
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route(FAVORITES_ORDER, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    const body = (route.request().postDataJSON() ?? {}) as {
      items?: Array<{
        resource_kind: string;
        resource_id: string;
        group_id?: string | null;
        display_order: number;
      }>;
    };
    for (const item of body.items ?? []) {
      const idx = state.favorites.findIndex(
        (entry) =>
          entry.resource_kind === item.resource_kind &&
          entry.resource_id === item.resource_id,
      );
      if (idx >= 0) {
        state.favorites[idx] = {
          ...state.favorites[idx],
          group_id: item.group_id ?? null,
          display_order: item.display_order,
        };
      }
    }
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route(FAVORITES_GROUPS, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = (route.request().postDataJSON() ?? {}) as {
      name?: string;
      display_order?: number;
    };
    const next: FavoriteGroupFixture = makeGroup({
      id: `group-${state.groups.length + 1}`,
      name: body.name ?? 'Untitled',
      display_order: body.display_order ?? (state.groups.length + 1) * 1000,
    });
    state.groups.push(next);
    await route.fulfill({ status: 201, json: next });
  });
}

const ALPHA = makeFavorite({
  resource_kind: 'dataset',
  resource_id: 'dataset-alpha',
  display_order: 1000,
});
const BETA = makeFavorite({
  resource_kind: 'pipeline',
  resource_id: 'pipeline-beta',
  display_order: 2000,
});
const ALPHA_LABEL: ResolvedLabelFixture = {
  resource_kind: 'dataset',
  resource_id: 'dataset-alpha',
  label: 'Alpha customers',
};
const BETA_LABEL: ResolvedLabelFixture = {
  resource_kind: 'pipeline',
  resource_id: 'pipeline-beta',
  label: 'Beta nightly',
};

test('renders mocked favorites under the Ungrouped section with resolved labels', async ({
  adminPage,
}) => {
  await mockFavorites(adminPage, {
    favorites: [ALPHA, BETA],
    groups: [],
    labels: [ALPHA_LABEL, BETA_LABEL],
  });

  const favorites = new FavoritesPage(adminPage);
  await favorites.goto();
  await favorites.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^favorites$/i }),
  ).toBeVisible();
  // "Ungrouped" appears both in the section heading (<strong>) and in
  // each row's group <select> option — scope to the heading.
  await expect(adminPage.locator('strong').filter({ hasText: /^Ungrouped$/ })).toBeVisible();
  const alphaLink = adminPage.getByRole('link', { name: /alpha customers/i });
  await expect(alphaLink).toBeVisible();
  await expect(alphaLink).toHaveAttribute('href', /^\/datasets\//);
  await expect(
    adminPage.getByRole('link', { name: /beta nightly/i }),
  ).toBeVisible();
});

test('renders the empty state when there are no favorites', async ({ adminPage }) => {
  await mockFavorites(adminPage, { favorites: [], groups: [], labels: [] });

  await new FavoritesPage(adminPage).goto();

  await expect(adminPage.getByText(/no favorites yet/i)).toBeVisible();
  expect(await adminPage.getByRole('listitem').count()).toBe(0);
});

test('clicking the trash icon DELETEs the favorite and the row disappears', async ({
  adminPage,
}) => {
  await mockFavorites(adminPage, {
    favorites: [ALPHA, BETA],
    groups: [],
    labels: [ALPHA_LABEL, BETA_LABEL],
  });

  const cap = captureRequests(adminPage, FAVORITE_DELETE);
  await new FavoritesPage(adminPage).goto();

  const alphaRow = adminPage.locator('li').filter({ hasText: /alpha customers/i });
  await alphaRow.getByRole('button', { name: /remove favorite/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const call = cap.last();
  expect(call?.method).toBe('DELETE');
  expect(call?.url).toMatch(/\/api\/v1\/workspace\/favorites\/dataset\/dataset-alpha$/);

  // The stateful mock + auto-reload removes the row.
  await expect(
    adminPage.getByRole('link', { name: /alpha customers/i }),
  ).toHaveCount(0);
  await expect(
    adminPage.getByRole('link', { name: /beta nightly/i }),
  ).toBeVisible();
});

test('reordering with the chevron-up button PUTs /favorites/order', async ({
  adminPage,
}) => {
  await mockFavorites(adminPage, {
    favorites: [ALPHA, BETA],
    groups: [],
    labels: [ALPHA_LABEL, BETA_LABEL],
  });

  const cap = captureRequests(adminPage, FAVORITES_ORDER);
  await new FavoritesPage(adminPage).goto();

  const betaRow = adminPage.locator('li').filter({ hasText: /beta nightly/i });
  await betaRow.getByRole('button', { name: /^move up$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const call = cap.last();
  expect(call?.method).toBe('PUT');
  const body = call?.body as
    | {
        items?: Array<{
          resource_kind: string;
          resource_id: string;
          group_id: string | null;
          display_order: number;
        }>;
      }
    | undefined;
  expect(body?.items).toHaveLength(2);
  // Beta is now first.
  expect(body?.items?.[0].resource_id).toBe('pipeline-beta');
  expect(body?.items?.[1].resource_id).toBe('dataset-alpha');
  expect(body?.items?.[0].group_id).toBeNull();
});

test('moving a favorite to a group via the select PUTs /favorites/order with group_id', async ({
  adminPage,
}) => {
  const groupA = makeGroup({ id: 'group-A', name: 'Reports' });
  await mockFavorites(adminPage, {
    favorites: [ALPHA],
    groups: [groupA],
    labels: [ALPHA_LABEL],
  });

  const cap = captureRequests(adminPage, FAVORITES_ORDER);
  await new FavoritesPage(adminPage).goto();

  const select = adminPage.getByRole('combobox', { name: /group for alpha customers/i });
  await select.selectOption({ label: 'Reports' });

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const body = cap.last()?.body as
    | {
        items?: Array<{ resource_kind: string; resource_id: string; group_id: string | null }>;
      }
    | undefined;
  expect(body?.items?.[0]).toMatchObject({
    resource_kind: 'dataset',
    resource_id: 'dataset-alpha',
    group_id: 'group-A',
  });

  // Alpha now lives under the Reports section.
  const reportsSection = adminPage
    .locator('section')
    .filter({ has: adminPage.getByText('Reports', { exact: true }) })
    .last();
  await expect(reportsSection.getByText(/alpha customers/i)).toBeVisible();
});

test('creating a new group POSTs /favorites/groups with the typed name', async ({
  adminPage,
}) => {
  await mockFavorites(adminPage, {
    favorites: [ALPHA],
    groups: [],
    labels: [ALPHA_LABEL],
  });

  const cap = captureRequests(adminPage, FAVORITES_GROUPS);
  await new FavoritesPage(adminPage).goto();

  await adminPage.getByRole('textbox', { name: /new favorite group/i }).fill('Q1 priorities');
  await adminPage.getByRole('button', { name: /^group$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const call = cap.last();
  expect(call?.method).toBe('POST');
  expect(call?.body).toMatchObject({ name: 'Q1 priorities' });
  // "Q1 priorities" appears in both the new section heading (<strong>)
  // and the row's <select> option — scope to the heading.
  await expect(
    adminPage.locator('strong').filter({ hasText: /^Q1 priorities$/ }),
  ).toBeVisible();
});

test('list endpoint failure surfaces the error banner', async ({ adminPage }) => {
  await mockFavorites(adminPage, {
    favorites: [],
    groups: [],
    labels: [],
    alwaysFail: 500,
  });

  await new FavoritesPage(adminPage).goto();

  await expect(adminPage.locator('.of-status-danger')).toBeVisible();
});

test('absent today: type filter, ★ star toggle, sort dropdown, and search input', async ({
  adminPage,
}) => {
  // Regression guards for the roadmap controls that don't ship today.
  // When the feature catches up, each `count() === 0` here will flip
  // and force the developer to update the spec.
  await mockFavorites(adminPage, {
    favorites: [ALPHA, BETA],
    groups: [],
    labels: [ALPHA_LABEL, BETA_LABEL],
  });

  await new FavoritesPage(adminPage).goto();

  expect(
    await adminPage
      .getByRole('button', { name: /^(datasets?|pipelines?|projects?)$/i })
      .count(),
  ).toBe(0);
  // No star-style toggle WITHIN A ROW. The row control is a trash
  // button labelled "Remove favorite" — there's no per-row star.
  // (The Topbar shows a global "Favorite <page>" button outside the
  // listitem rows; that's separate UI and not in scope here.)
  const row = adminPage.locator('li').filter({ hasText: /alpha customers/i });
  expect(
    await row.getByRole('button', { name: /^(unfavorite|favorite)\b|^star\b/i }).count(),
  ).toBe(0);
  expect(await adminPage.getByRole('button', { name: /^sort/i }).count()).toBe(0);
  expect(await adminPage.getByPlaceholder(/search favorites/i).count()).toBe(0);
});
