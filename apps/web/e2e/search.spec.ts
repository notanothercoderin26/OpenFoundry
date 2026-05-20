import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/search` (apps/web/src/routes/search/SearchPage.tsx).
 *
 * The shipped page diverges from the roadmap on several points:
 *
 *   - **Endpoints**: the roadmap's `GET /api/v1/search?q=...` does not
 *     exist. The real page fires SIX parallel calls per query — five
 *     `POST /api/v1/ontology/search` calls (one per `kind`: `app`,
 *     `object_type`, `object_instance`, `dataset`, plus one without
 *     a kind for the global "files" bucket) and one
 *     `GET /api/v1/compass/search?q=…&type=…` for governed resources.
 *
 *   - **No debounce / no "load more"**. Network calls only fire when
 *     the user submits the form (Enter) or clicks a tab/filter that's
 *     in the useEffect dependency list. There is no minimum-length
 *     guard — any non-empty trimmed query triggers requests. The
 *     `next_cursor` returned by `searchCompass` is stored but the UI
 *     has no Load-more button today.
 *
 *   - **Filters are tabs + a sidebar, not chips.** Five tabs (Top /
 *     Apps / Objects / Datasets / Files). The Files tab has a
 *     sidebar filter for `type` that DOES trigger a Compass re-fetch
 *     (via `filesKindFilter` → `compassType`).
 *
 *   - **Hotkey is `Cmd/Ctrl+J`** (not `/` or `Cmd+K`).
 *
 *   - **Advanced query syntax** (`tag:foo owner:bar`) is not parsed
 *     client-side; the page forwards the raw `q` to the backend. We
 *     pin that contract (server gets the raw string).
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Search failed/i,
    ],
  },
});

const ONTOLOGY_SEARCH = /\/api\/v1\/ontology\/search$/;
const COMPASS_SEARCH = /\/api\/v1\/compass\/search/;

interface OntologyMockOptions {
  /** Default rows returned when a request comes in without a specific override. */
  defaultRows?: Array<Partial<SearchRowFixture>>;
  /** Per-kind row override. `kind` is the request body's `kind` field. */
  byKind?: Record<string, Array<Partial<SearchRowFixture>>>;
  /** Force a failure response. */
  failure?: { status: number; message: string };
}

interface CompassMockOptions {
  rows?: Array<Partial<CompassRowFixture>>;
  nextCursor?: string | null;
  failure?: { status: number; message: string };
}

interface SearchRowFixture {
  kind: string;
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string;
  score: number;
  route: string;
  object_type_id: string | null;
  metadata: Record<string, unknown>;
}

interface CompassRowFixture {
  rid: string;
  type: string;
  display_name: string;
  owning_project_id: string | null;
  owning_project_rid: string | null;
  organization_rids: string[];
  marking_rids: string[];
  last_modified_at: string;
  owner_id: string | null;
  tags: string[];
  summary: string;
  open_url: string;
  is_deleted: boolean;
}

function makeSearchRow(overrides: Partial<SearchRowFixture> = {}): SearchRowFixture {
  return {
    kind: 'dataset',
    id: 'dataset-1',
    title: 'Customers v1',
    subtitle: 'analytics',
    snippet: 'matches the search',
    score: 0.9,
    route: '/datasets/dataset-1',
    object_type_id: null,
    metadata: {},
    ...overrides,
  };
}

function makeCompassRow(overrides: Partial<CompassRowFixture> = {}): CompassRowFixture {
  return {
    rid: 'ri.compass.main.dataset.dataset-1',
    type: 'dataset',
    display_name: 'Customers v1 (compass)',
    owning_project_id: 'project-1',
    owning_project_rid: 'ri.compass.main.project.project-1',
    organization_rids: [],
    marking_rids: [],
    last_modified_at: '2026-05-11T00:00:00Z',
    owner_id: '00000000-0000-0000-0000-000000000001',
    tags: ['demo'],
    summary: 'Demo summary that highlights the search term',
    open_url: '/datasets/dataset-1',
    is_deleted: false,
    ...overrides,
  };
}

async function mockOntologySearch(page: Page, options: OntologyMockOptions = {}): Promise<void> {
  await page.route('**/api/v1/ontology/search', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    if (options.failure) {
      await route.fulfill({
        status: options.failure.status,
        json: { error: options.failure.message },
      });
      return;
    }
    const body = (route.request().postDataJSON() ?? {}) as { kind?: string; query?: string };
    const kind = body.kind ?? 'all';
    const overrides = options.byKind?.[kind] ?? options.defaultRows ?? [];
    const data = overrides.map((row) => makeSearchRow(row));
    await route.fulfill({
      json: { query: body.query ?? '', total: data.length, data },
    });
  });
}

async function mockCompassSearch(page: Page, options: CompassMockOptions = {}): Promise<void> {
  await page.route(COMPASS_SEARCH, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    if (options.failure) {
      await route.fulfill({
        status: options.failure.status,
        json: { error: options.failure.message },
      });
      return;
    }
    const rows = (options.rows ?? []).map((row) => makeCompassRow(row));
    await route.fulfill({
      json: {
        data: rows,
        next_cursor: options.nextCursor ?? null,
        limit: 50,
        facets: {},
      },
    });
  });
}

/** Get the canonical search textbox (role="searchbox" via type="search"). */
function searchInput(page: Page) {
  return page.getByLabel(/quicksearch input/i);
}

test('opens with the search input focused', async ({ adminPage }) => {
  await mockOntologySearch(adminPage);
  await mockCompassSearch(adminPage);
  await adminPage.goto('/search');

  // Auto-focus is set with a 30ms timeout in a useEffect; wait for it.
  await expect(searchInput(adminPage)).toBeFocused();
});

test('typing without submitting does not fire a search request', async ({ adminPage }) => {
  const cap = captureRequests(adminPage, ONTOLOGY_SEARCH);
  await mockOntologySearch(adminPage);
  await mockCompassSearch(adminPage);
  await adminPage.goto('/search');

  await searchInput(adminPage).fill('customers');
  // Give any (mis-)wired debounce a chance to fire.
  await adminPage.waitForTimeout(500);

  expect(cap.count()).toBe(0);
});

test('submitting the form fires the parallel ontology + compass searches', async ({
  adminPage,
}) => {
  const ontologyCalls = captureRequests(adminPage, ONTOLOGY_SEARCH);
  const compassCalls = captureRequests(adminPage, COMPASS_SEARCH);

  await mockOntologySearch(adminPage, {
    byKind: {
      dataset: [makeSearchRow({ id: 'dataset-1', title: 'Customers v1' })],
      // every other kind returns empty by default
    },
  });
  await mockCompassSearch(adminPage);

  await adminPage.goto('/search');
  await searchInput(adminPage).fill('customers');
  await searchInput(adminPage).press('Enter');

  // 5 ontology POSTs (one per `kind`: app, object_type, object_instance,
  // dataset, undefined) + 1 compass GET. We assert >= so React StrictMode
  // dev re-renders don't make the test brittle.
  await expect.poll(() => ontologyCalls.count()).toBeGreaterThanOrEqual(5);
  await expect.poll(() => compassCalls.count()).toBeGreaterThanOrEqual(1);

  // The `kind` payloads cover the expected fan-out.
  const kinds = ontologyCalls.calls
    .map((c) => (c.body as { kind?: string } | null)?.kind ?? '__top__')
    .sort();
  expect(kinds).toEqual(
    expect.arrayContaining(['app', 'dataset', 'object_instance', 'object_type', '__top__']),
  );

  // The page renders the Datasets quadrant with the mocked title.
  await expect(
    adminPage.getByRole('link', { name: /customers v1/i }).first(),
  ).toBeVisible();
});

test('clicking a tab updates ?tab= and stays on the same query', async ({ adminPage }) => {
  await mockOntologySearch(adminPage, {
    byKind: {
      dataset: [makeSearchRow({ id: 'dataset-1', title: 'Customers v1' })],
    },
  });
  await mockCompassSearch(adminPage);

  await adminPage.goto('/search');
  await searchInput(adminPage).fill('customers');
  await searchInput(adminPage).press('Enter');

  // Wait for the success state — the Datasets tab gets its count.
  await expect(
    adminPage.getByRole('link', { name: /customers v1/i }).first(),
  ).toBeVisible();

  await adminPage.getByRole('tab', { name: /^datasets/i }).click();
  await expect(adminPage).toHaveURL(/[?&]tab=datasets/);
  await expect(adminPage).toHaveURL(/[?&]q=customers/);

  // Datasets tab heading-less view still renders the matching row.
  await expect(
    adminPage.getByRole('link', { name: /customers v1/i }).first(),
  ).toBeVisible();
});

test('clicking an ontology result navigates to its `route`', async ({ adminPage }) => {
  await mockOntologySearch(adminPage, {
    byKind: {
      dataset: [
        makeSearchRow({
          id: 'dataset-42',
          title: 'Promo orders',
          route: '/datasets/dataset-42',
        }),
      ],
    },
  });
  await mockCompassSearch(adminPage);

  await adminPage.goto('/search?q=promo');
  const link = adminPage.getByRole('link', { name: /promo orders/i }).first();
  await expect(link).toHaveAttribute('href', '/datasets/dataset-42');
  await link.click();

  await expect(adminPage).toHaveURL(/\/datasets\/dataset-42(\?|$)/);
});

test('empty results: shows the "No matches" empty block', async ({ adminPage }) => {
  await mockOntologySearch(adminPage); // every kind returns []
  await mockCompassSearch(adminPage);

  await adminPage.goto('/search?q=nothing-here');

  // The empty block embeds the user's query, so we pin against it.
  await expect(adminPage.getByText(/no matches/i)).toBeVisible();
  await expect(adminPage.getByText(/nothing-here/)).toBeVisible();
  // Fallback suggestion links to Object Explorer.
  await expect(
    adminPage.getByRole('link', { name: /object explorer/i }).first(),
  ).toBeVisible();
});

test('server-side error: shows the inline error message', async ({ adminPage }) => {
  await mockOntologySearch(adminPage, {
    failure: { status: 500, message: 'Search service is down' },
  });
  await mockCompassSearch(adminPage);

  await adminPage.goto('/search?q=anything');

  await expect(
    adminPage.locator('.of-quicksearch__inlineError').filter({
      hasText: /search service is down/i,
    }),
  ).toBeVisible();
});

test('advanced query syntax (`tag:foo owner:bar`) is forwarded raw to the backend', async ({
  adminPage,
}) => {
  // The shipped page does NOT parse `tag:` / `owner:` operators on the
  // client; it just sets `q` on the URL and on the request body. The
  // backend is responsible for tokenisation. We pin the contract so a
  // future client-side parser would surface here.
  const ontologyCalls = captureRequests(adminPage, ONTOLOGY_SEARCH);
  await mockOntologySearch(adminPage);
  await mockCompassSearch(adminPage);

  await adminPage.goto('/search');
  const raw = 'tag:demo owner:runner';
  await searchInput(adminPage).fill(raw);
  await searchInput(adminPage).press('Enter');

  await expect.poll(() => ontologyCalls.count()).toBeGreaterThanOrEqual(5);
  const queries = ontologyCalls.calls
    .map((c) => (c.body as { query?: string } | null)?.query)
    .filter((q): q is string => typeof q === 'string');
  expect(queries.every((q) => q === raw)).toBe(true);
});

test('submitting persists the query into localStorage recent-searches', async ({
  adminPage,
}) => {
  await mockOntologySearch(adminPage);
  await mockCompassSearch(adminPage);

  await adminPage.goto('/search');
  await searchInput(adminPage).fill('persisted-term');
  await searchInput(adminPage).press('Enter');

  // The page writes `of_qs_recent_searches` after the submit handler runs.
  await expect
    .poll(async () => adminPage.evaluate(() =>
      window.localStorage.getItem('of_qs_recent_searches'),
    ))
    .toContain('persisted-term');
});

test('Cmd/Ctrl+J refocuses the search input', async ({ adminPage }) => {
  await mockOntologySearch(adminPage);
  await mockCompassSearch(adminPage);

  await adminPage.goto('/search');
  await expect(searchInput(adminPage)).toBeFocused();

  // Move focus away first.
  await adminPage.getByRole('tab', { name: /^datasets/i }).focus();
  await expect(searchInput(adminPage)).not.toBeFocused();

  // The page hotkey binding fires on metaKey OR ctrlKey + 'j'.
  await adminPage.keyboard.press('Control+J');
  await expect(searchInput(adminPage)).toBeFocused();
});
