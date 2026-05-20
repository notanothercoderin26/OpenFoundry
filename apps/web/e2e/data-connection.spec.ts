import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { DataConnectionPage } from './pages';

/**
 * E2E coverage for `/data-connection`
 * (apps/web/src/routes/data-connection/DataConnectionPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a multi-panel "shell":
 *
 *   - 8 view tabs (Sources / Syncs / Streams / Exports / Webhooks /
 *     Virtual Tables / Agents / Health) implemented as `<button>`s.
 *   - A 6-control filter bar (global search, capability, worker, owner,
 *     status, source type) over native `<select>` elements with NO
 *     `aria-label`; tests locate them via their unique placeholder
 *     `<option>` text.
 *   - A `Sources` list panel that renders one row per source with name +
 *     `{type} · worker: {w} · owner: {o} · last_sync: {ts}` metadata
 *     and a colored status pill, plus per-row Browse / Delete buttons.
 *     Clicking the source name link routes to
 *     `/data-connection/sources/:id`.
 *   - Header CTAs: "New source" → `/data-connection/new`; Explore /
 *     Create sync / Create export / Create webhook / Register virtual
 *     table → the currently-selected source's detail (or `/new` /
 *     `/virtual-tables` if no source is selected).
 *   - A Refresh button that re-fetches the sources + agents list.
 *
 * Roadmap controls that are NOT in the shell today:
 *
 *   - "Sync now" / "Pause sync" CTAs — they live on the per-source
 *     detail page, not this shell.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/data-connection/sources?page=1&per_page=100
 *   - GET    /api/v1/data-connection/agents
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

const SOURCES_LIST = /\/api\/v1\/data-connection\/sources(\?|$)/;

interface SourceFixture {
  id: string;
  name: string;
  connector_type: string;
  worker: 'foundry' | 'agent';
  status: 'healthy' | 'degraded' | 'error' | 'configuring' | 'draft';
  owner_id: string;
  owner_name: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeSource(overrides: Partial<SourceFixture> = {}): SourceFixture {
  return {
    id: 'source-1',
    name: 'Sample source',
    connector_type: 'postgresql',
    worker: 'foundry',
    status: 'healthy',
    owner_id: 'user-1',
    owner_name: 'Alice',
    last_sync_at: E2E_NOW,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

async function mockSourceList(
  page: Page,
  sources: SourceFixture[],
): Promise<{ getCount: () => number }> {
  let calls = 0;
  await page.route(SOURCES_LIST, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    calls += 1;
    await route.fulfill({
      json: { data: sources, total: sources.length, page: 1, per_page: 100 },
    });
  });
  return { getCount: () => calls };
}

/** The 6 filters above the sources list are native `<select>` without
 *  labels — locate by the unique "All …" placeholder option. */
function selectByPlaceholderOption(page: Page, placeholder: string | RegExp) {
  return page.locator('select').filter({
    has: page.locator('option', { hasText: placeholder }),
  });
}

const POSTGRES = makeSource({
  id: 'source-postgres',
  name: 'Production Postgres',
  connector_type: 'postgresql',
  worker: 'foundry',
  status: 'healthy',
  owner_name: 'Alice',
  last_sync_at: '2026-05-10T12:00:00Z',
});

const S3 = makeSource({
  id: 'source-s3',
  name: 'Analytics S3 bucket',
  connector_type: 's3',
  worker: 'agent',
  status: 'degraded',
  owner_name: 'Bob',
  last_sync_at: '2026-05-09T08:30:00Z',
});

test('renders the source list with type, status, and last_sync metadata', async ({
  adminPage,
}) => {
  await mockSourceList(adminPage, [POSTGRES, S3]);
  const dc = new DataConnectionPage(adminPage);
  await dc.goto();
  await dc.expectLoaded();

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^data connection$/i }),
  ).toBeVisible();

  // Both source rows render their name link.
  await expect(
    adminPage.getByRole('link', { name: /production postgres/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /analytics s3 bucket/i }).first(),
  ).toBeVisible();

  // Type label + worker + owner + last_sync compose the metadata line.
  await expect(
    adminPage.getByText(
      /PostgreSQL · worker: foundry · owner: Alice · last_sync: 2026-05-10T12:00:00Z/i,
    ),
  ).toBeVisible();
  await expect(
    adminPage.getByText(
      /Amazon S3 · worker: agent · owner: Bob · last_sync: 2026-05-09T08:30:00Z/i,
    ),
  ).toBeVisible();

  // Colored status pills carry the raw status word.
  await expect(adminPage.getByText(/^healthy$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^degraded$/i).first()).toBeVisible();
});

test('source-type filter narrows the visible source list', async ({ adminPage }) => {
  await mockSourceList(adminPage, [POSTGRES, S3]);
  await new DataConnectionPage(adminPage).goto();

  // Both rows visible before filtering.
  await expect(
    adminPage.getByRole('link', { name: /production postgres/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /analytics s3 bucket/i }).first(),
  ).toBeVisible();

  await selectByPlaceholderOption(adminPage, /all source types/i).selectOption('s3');

  // PostgreSQL drops out of the main list panel; S3 row stays.
  await expect(
    adminPage.getByRole('link', { name: /production postgres/i }),
  ).toHaveCount(0);
  await expect(
    adminPage.getByRole('link', { name: /analytics s3 bucket/i }).first(),
  ).toBeVisible();

  // Resetting the filter brings PostgreSQL back.
  await selectByPlaceholderOption(adminPage, /all source types/i).selectOption('all');
  await expect(
    adminPage.getByRole('link', { name: /production postgres/i }),
  ).toBeVisible();
});

test('clicking a source name navigates to /data-connection/sources/:id', async ({
  adminPage,
}) => {
  await mockSourceList(adminPage, [POSTGRES]);
  await new DataConnectionPage(adminPage).goto();

  const sourceLink = adminPage.getByRole('link', { name: /production postgres/i });
  await expect(sourceLink).toHaveAttribute(
    'href',
    /\/data-connection\/sources\/source-postgres$/,
  );
  await sourceLink.click();

  await expect(adminPage).toHaveURL(
    /\/data-connection\/sources\/source-postgres(\?|#|$)/,
  );
});

test('"New source" link navigates to /data-connection/new', async ({ adminPage }) => {
  await mockSourceList(adminPage, [POSTGRES]);
  await new DataConnectionPage(adminPage).goto();

  const newSourceLink = adminPage.getByRole('link', { name: /^new source$/i });
  await expect(newSourceLink).toHaveAttribute('href', '/data-connection/new');
  await newSourceLink.click();

  await expect(adminPage).toHaveURL(/\/data-connection\/new(\?|#|$)/);
});

test('quick-action surfaces: Refresh re-fetches; Browse switches selection; "Sync now" / "Pause sync" absent today', async ({
  adminPage,
}) => {
  const mock = await mockSourceList(adminPage, [POSTGRES, S3]);

  await new DataConnectionPage(adminPage).goto();
  await expect(
    adminPage.getByRole('link', { name: /production postgres/i }),
  ).toBeVisible();

  // Refresh acts as a shell-level "sync now": it re-fetches the list.
  const before = mock.getCount();
  await adminPage.getByRole('button', { name: /^refresh$/i }).click();
  await expect.poll(() => mock.getCount()).toBeGreaterThan(before);

  // The first source is auto-selected on load; clicking Browse on the
  // second row flips selection so the header action links retarget.
  const browseS3 = adminPage.getByRole('button', { name: /^browse$/i }).nth(1);
  await browseS3.click();
  await expect(browseS3).toHaveAttribute('aria-pressed', 'true');

  await expect(
    adminPage.getByRole('link', { name: /^create sync$/i }),
  ).toHaveAttribute('href', /\/data-connection\/sources\/source-s3$/);
  await expect(
    adminPage.getByRole('link', { name: /^create export$/i }),
  ).toHaveAttribute('href', /\/data-connection\/sources\/source-s3$/);

  // The roadmap "Sync now" / "Pause sync" CTAs live on the per-source
  // detail page. Pin their absence at the shell so a half-migration
  // that smuggles them in here surfaces immediately.
  expect(
    await adminPage.getByRole('button', { name: /^sync now$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /pause sync/i }).count(),
  ).toBe(0);
});

test('empty state: zero sources renders the "no sources" copy and the create-a-source hint', async ({
  adminPage,
}) => {
  await mockSourceList(adminPage, []);
  await new DataConnectionPage(adminPage).goto();

  // Sources list panel.
  await expect(
    adminPage.getByText(/no sources match the current filters/i),
  ).toBeVisible();

  // Remote-catalog panel: no source could be auto-selected.
  await expect(
    adminPage.getByRole('heading', { name: /^no source selected$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/create a source or select one from the list/i),
  ).toBeVisible();

  // The shell-level "New source" CTA is still rendered even with no rows.
  await expect(
    adminPage.getByRole('link', { name: /^new source$/i }),
  ).toBeVisible();
});
