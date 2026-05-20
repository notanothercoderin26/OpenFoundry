import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/contour`
 * (apps/web/src/routes/contour/ContourPage.tsx, 701 LoC).
 *
 * **Reality vs roadmap.** The shipped Contour page is NOT a
 * node-based drag-drop workflow builder where you wire `query` →
 * `transform` → `viz` blocks on a canvas. It's a structured analysis
 * workbench with FIXED sections that materialise the same implicit
 * pipeline for every analysis:
 *
 *     Primary dataset (query)  →  Transform board (joins / filters /
 *     dimensions / metric / aggregation)  →  Display + Linked + Result
 *     boards (viz).
 *
 * Concrete divergences from the roadmap brief:
 *
 *   - No draggable block palette and no `react-flow`-style canvas;
 *     panels are static React sections rendered in a fixed grid.
 *   - No user-drawable connections between blocks. The data flow
 *     (dataset → useMemo aggregation → chart/table) is wired in
 *     `ContourPage.tsx` itself.
 *   - No "Run workflow" button. Every change to the Transform board
 *     synchronously re-derives `analysisRows` / `breakdownRows` via
 *     `useMemo`, so "execution" is implicit.
 *   - "Save as view" is "Export to dataset": POST /datasets to mint
 *     a new dataset, then POST /datasets/{id}/upload to attach the
 *     materialised analysis JSON.
 *   - The roadmap's saved-view library doesn't exist; analyses are
 *     persisted by materialising them as new datasets, not by
 *     pinning a named view.
 *
 * Endpoints touched on mount:
 *   - GET    /api/v1/datasets?per_page=100               (TanStack list)
 *   - GET    /api/v1/datasets/{primary}/preview?limit=100&offset=0
 *     (looped by `loadAllRows`; we mock total_rows = rows.length so
 *     the loop terminates after one page).
 * Triggered by user actions:
 *   - POST   /api/v1/datasets                            ("Export to dataset")
 *   - POST   /api/v1/datasets/{new_id}/upload            (FormData upload)
 *
 * Plus the on-mount auto-selection chain: `useEffect` picks the first
 * dataset, which kicks `previewDataset(primaryDatasetId)`; field
 * hydration (`dimension`, `metric`, `dateField`, …) runs once rows
 * arrive.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
      /ResizeObserver/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const E2E_NOW = '2026-05-11T00:00:00Z';

const DATASET_SALES = {
  id: 'dataset-sales',
  name: 'Sales 2026',
  description: 'Monthly sales by region',
  owner_id: 'user-1',
  project_id: 'project-1',
  format: 'csv',
  size_bytes: 4096,
  row_count: 4,
  tags: ['sales'],
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const DATASET_REGIONS = {
  id: 'dataset-regions',
  name: 'Regions reference',
  description: 'Region code → name map',
  owner_id: 'user-1',
  project_id: 'project-1',
  format: 'csv',
  size_bytes: 1024,
  row_count: 3,
  tags: ['reference'],
  created_at: E2E_NOW,
  updated_at: E2E_NOW,
};

const SALES_ROWS = [
  { date: '2026-01-15', region: 'EU', product: 'Widget', amount: 120 },
  { date: '2026-02-10', region: 'EU', product: 'Sprocket', amount: 95 },
  { date: '2026-02-22', region: 'US', product: 'Widget', amount: 220 },
  { date: '2026-03-05', region: 'US', product: 'Sprocket', amount: 60 },
];

const REGIONS_ROWS = [
  { region: 'EU', display_name: 'Europe' },
  { region: 'US', display_name: 'United States' },
  { region: 'APAC', display_name: 'Asia Pacific' },
];

interface ContourMocks {
  /** Captured new datasets created via "Export to dataset". */
  exports: Array<{ id: string; name: string }>;
}

/**
 * Installs the dataset list + preview routes the Contour page needs to
 * fully render its boards. The preview mock pins `total_rows ===
 * rows.length`, so `loadAllRows` terminates after a single fetch
 * (otherwise the loop hits the MAX_PAGES safety cap and surfaces the
 * truncation warning, which we DO test in a dedicated case).
 */
async function mockContour(page: Page): Promise<ContourMocks> {
  const state: ContourMocks = { exports: [] };

  // /datasets list — matches the v1 paginated envelope.
  await page.route(/\/api\/v1\/datasets(\?|$)/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        json: {
          data: [DATASET_SALES, DATASET_REGIONS],
          page: 1,
          per_page: 100,
          total: 2,
          total_pages: 1,
        },
      });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as { name?: string };
      const newId = `dataset-export-${state.exports.length + 1}`;
      const created = {
        id: newId,
        rid: `ri.compass.main.dataset.${newId}`,
        name: body.name ?? 'New export',
        description: 'Export from Contour',
        owner_id: 'user-1',
        project_id: 'project-1',
        format: 'json',
        size_bytes: 0,
        row_count: 0,
        tags: ['contour', 'analysis-export'],
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      };
      state.exports.push({ id: newId, name: created.name });
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  // /datasets/{id}/preview — Returns a synthetic page sized exactly to
  // the row set, so `loadAllRows` terminates after one request.
  await page.route(/\/api\/v1\/datasets\/dataset-sales\/preview/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        rows: SALES_ROWS,
        columns: ['date', 'region', 'product', 'amount'],
        total_rows: SALES_ROWS.length,
        sample_size: SALES_ROWS.length,
        generated_at: E2E_NOW,
        fresh: true,
      },
    });
  });
  await page.route(/\/api\/v1\/datasets\/dataset-regions\/preview/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        rows: REGIONS_ROWS,
        columns: ['region', 'display_name'],
        total_rows: REGIONS_ROWS.length,
        sample_size: REGIONS_ROWS.length,
        generated_at: E2E_NOW,
        fresh: true,
      },
    });
  });

  // /datasets/{new_id}/upload — FormData multipart upload uses raw
  // fetch (not the shared `api` client), so the URL is hit directly.
  await page.route(/\/api\/v1\/datasets\/[^/?#]+\/upload$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ status: 200, json: { ok: true } });
  });

  return state;
}

/**
 * Wait for the Contour page heading + the Transform board to fully
 * hydrate from the first dataset's preview. We anchor on the "Primary
 * dataset" select rendering its mocked options so callers can drive
 * the page without racing the auto-selection / column-hydration chain.
 */
async function waitForContourReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /top-down analysis with transform boards/i }),
  ).toBeVisible({ timeout: 15_000 });
  // The first dataset auto-selects, and the dimension/metric defaults
  // fill in once rows arrive. We poll the result-table COLUMNHEADER
  // for the hydrated metric name — that's the strongest signal that
  // the page's downstream chain executed end to end. `<th>` inside
  // `<thead>` has the implicit role `columnheader`, NOT `cell`.
  await expect(
    page.getByRole('columnheader', { name: /sum\(amount\)/i }),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Locate a FieldSelect by its eyebrow label. The component renders
 * `<label class="of-panel-muted"><div class="of-eyebrow">…</div>
 * <select>…</select></label>` so we filter labels by partial text
 * (the `<select>` adds every option string to the label's textContent,
 * which breaks `^…$` anchors).
 */
function fieldSelect(page: Page, label: string) {
  return page.locator('label').filter({ hasText: label }).locator('select').first();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the analysis canvas: Transform board, Display + Linked boards, Result table', async ({ adminPage }) => {
  await mockContour(adminPage);
  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  // Each section corresponds to one stage of the implicit workflow:
  //   - Transform board:  query + transform stage (dataset + fields)
  //   - Analysis path:    breadcrumb of pipeline steps
  //   - Display board:    primary chart (viz stage)
  //   - Linked board:     secondary chart (drill-down view)
  //   - Result table:     materializable rows (export stage)
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /top-down analysis with transform boards/i }),
  ).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /^Shape the analysis$/ })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /sequence and drill breadcrumbs/i })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /^Primary analysis chart$/ })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /^Chart-to-chart filtering$/ })).toBeVisible();
  await expect(adminPage.getByRole('heading', { name: /^Materializable rows$/ })).toBeVisible();
});

test('Transform board wires the query block (dataset list) to the viz block (chart + table)', async ({ adminPage }) => {
  await mockContour(adminPage);
  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  // The Primary dataset select hosts the mocked datasets — this is
  // the "query" block of the implicit workflow.
  const primary = fieldSelect(adminPage, 'Primary dataset');
  await expect(primary).toBeVisible();
  const opts = await primary.locator('option').allTextContents();
  expect(opts.map((s) => s.trim())).toEqual(['Sales 2026', 'Regions reference']);
  await expect(primary).toHaveValue('dataset-sales');

  // The "transform" block (Dimension / Metric / Aggregation) hydrated
  // from the loaded rows. `aggregation` defaults to 'sum'.
  const dimension = fieldSelect(adminPage, 'Dimension');
  const metric = fieldSelect(adminPage, 'Metric');
  const aggregation = fieldSelect(adminPage, 'Aggregation');
  await expect(dimension).toHaveValue('date');
  await expect(metric).toHaveValue('amount');
  await expect(aggregation).toHaveValue('sum');

  // The "viz" block — Result table — surfaces the aggregated rows.
  // Sales fixture has 4 unique dates, so 4 grouped rows render.
  await expect(adminPage.getByRole('cell', { name: /^2026-01-15$/ })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: /^2026-02-10$/ })).toBeVisible();
});

test('changing aggregation re-executes the workflow and rewrites the Result table header', async ({ adminPage }) => {
  await mockContour(adminPage);
  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  // The result table column header echoes the aggregation function name.
  // Default is "sum(amount)" — switching to "max" should rewrite both
  // the header text and the cell values (via `useMemo`-based re-run).
  await expect(adminPage.getByRole('columnheader', { name: /sum\(amount\)/i })).toBeVisible();

  await fieldSelect(adminPage, 'Aggregation').selectOption('max');

  await expect(adminPage.getByRole('columnheader', { name: /max\(amount\)/i })).toBeVisible();
  await expect(adminPage.getByRole('columnheader', { name: /sum\(amount\)/i })).toHaveCount(0);
});

test('switching the Primary dataset re-runs preview and re-hydrates the boards', async ({ adminPage }) => {
  await mockContour(adminPage);
  const cap = captureRequests(adminPage, /\/api\/v1\/datasets\/dataset-regions\/preview/);

  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  // Initial state: "Sales 2026" auto-selected, dimension=date.
  await expect(fieldSelect(adminPage, 'Dimension')).toHaveValue('date');

  // Switch to the Regions dataset; the page re-runs `loadAllRows` for
  // the new dataset id (the new request is the strongest signal of
  // pipeline re-execution).
  await fieldSelect(adminPage, 'Primary dataset').selectOption('dataset-regions');

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
});

test('Search parameter narrows the result table without an explicit "Run" button', async ({ adminPage }) => {
  await mockContour(adminPage);
  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  // Sales fixture has rows for "EU" and "US". Searching for "EU"
  // should drop the US rows from the table. The Search input lives
  // in the Transform board labelled "Search parameter".
  await expect(adminPage.getByRole('cell', { name: /^2026-02-22$/ })).toBeVisible();

  const search = adminPage.getByPlaceholder(/search across the joined rows/i);
  await search.fill('EU');

  // EU rows survive (2026-01-15, 2026-02-10); US rows (2026-02-22,
  // 2026-03-05) are filtered out. The page does this via `useMemo`
  // recompute — there is no Run button.
  await expect(adminPage.getByRole('cell', { name: /^2026-01-15$/ })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: /^2026-02-22$/ })).toHaveCount(0);
});

test('"Export to dataset" mints a new dataset + uploads the materialised analysis JSON', async ({ adminPage }) => {
  const state = await mockContour(adminPage);
  const datasetCap = captureRequests(adminPage, /\/api\/v1\/datasets$/);
  const uploadCap = captureRequests(adminPage, /\/api\/v1\/datasets\/[^/?#]+\/upload$/);

  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  await adminPage.getByRole('button', { name: /^Export to dataset$/i }).click();

  // First the page POSTs /datasets to mint a new dataset…
  await expect.poll(() => datasetCap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = datasetCap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    name: expect.stringMatching(/^Contour Export /),
    format: 'json',
    tags: ['contour', 'analysis-export'],
  });

  // …then it uploads the JSON body to /datasets/{new_id}/upload.
  await expect.poll(() => uploadCap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  expect(uploadCap.last()?.url).toMatch(/\/datasets\/dataset-export-1\/upload$/);

  // Stateful mock recorded the new export.
  expect(state.exports.length).toBeGreaterThanOrEqual(1);
});

test('"Export PDF" triggers a structured PDF download of the current analysis', async ({ adminPage }) => {
  await mockContour(adminPage);
  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  // The "Export PDF" button uses `downloadStructuredPdf` which spawns
  // an in-DOM anchor with a `Blob` URL. Playwright surfaces this via
  // the `download` event. The filename is slugified from the active
  // dataset name ("Sales 2026" → "sales-2026").
  const downloadPromise = adminPage.waitForEvent('download', { timeout: 5_000 });
  await adminPage.getByRole('button', { name: /^Export PDF$/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^contour-sales-2026\.pdf$/);
});

test('Fullscreen toggle expands the canvas; clicking again restores the page chrome', async ({ adminPage }) => {
  await mockContour(adminPage);
  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  // The Fullscreen button is the only stable affordance the page
  // exposes for "expand the analysis canvas". Toggling it switches
  // the wrapper to a fixed-position overlay.
  const fullscreen = adminPage.getByRole('button', { name: /^Fullscreen$/i });
  await expect(fullscreen).toBeVisible();
  await fullscreen.click();

  // After the click, the label flips to "Exit fullscreen".
  await expect(adminPage.getByRole('button', { name: /^Exit fullscreen$/i })).toBeVisible();
  await adminPage.getByRole('button', { name: /^Exit fullscreen$/i }).click();
  await expect(adminPage.getByRole('button', { name: /^Fullscreen$/i })).toBeVisible();
});

test('absent today: draggable block palette, user-drawn connections, named-view library, explicit Run button', async ({ adminPage }) => {
  // Regression guards for the roadmap controls the shipped page
  // doesn't provide today. When the feature lands, the assertion
  // flips and forces a spec update.
  await mockContour(adminPage);
  await adminPage.goto('/contour');
  await waitForContourReady(adminPage);

  // 1. No draggable block palette / canvas. The page does NOT mount
  //    a `react-flow` graph wrapper, so the standard react-flow
  //    container class is absent.
  expect(await adminPage.locator('.react-flow').count()).toBe(0);
  expect(await adminPage.getByRole('button', { name: /add block|new block|\+ block/i }).count()).toBe(0);

  // 2. No user-drawn connection edges (`role="connection"` is the
  //    react-flow convention).
  expect(await adminPage.locator('[role="connection"], svg.react-flow__edges').count()).toBe(0);

  // 3. No explicit "Run" button. Re-execution is implicit via
  //    `useMemo` on every field change.
  expect(await adminPage.getByRole('button', { name: /^run$|^execute$|^run workflow$/i }).count()).toBe(0);

  // 4. No "Save as view" library — analyses persist by exporting to
  //    a new dataset, NOT by pinning a named saved view.
  expect(await adminPage.getByRole('button', { name: /^save as view$|^save view$|^pin view$/i }).count()).toBe(0);
});
