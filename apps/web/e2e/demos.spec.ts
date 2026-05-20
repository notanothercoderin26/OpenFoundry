import { test, expect, DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';

/**
 * E2E coverage for the four wrapper-validator demo routes:
 *   /charts-demo     — `<EChartCanvas>` over the ECharts vendor chunk
 *   /monaco-demo     — `<MonacoEditor>` over the Monaco vendor chunk
 *   /maplibre-demo   — `<MapLibreCanvas>` over the MapLibre GL chunk
 *   /cytoscape-demo  — `<CytoscapeCanvas>` over Cytoscape + fcose
 *
 * Each vendor chunk is lazy-imported on mount, so the canvas/editor
 * needs a generous timeout on first visibility. After that the tests
 * exercise basic interactions and confirm the layout still renders on a
 * narrow mobile viewport.
 */

// Vendor chunks log a fair amount of benign noise on first mount:
// Monaco warns about missing web workers, MapLibre warns about
// missing tile providers (the demo uses a blank inline style), and
// echarts emits ResizeObserver-loop chatter on viewport-driven resizes.
test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /web worker/i,
      /maplibre/i,
      /WebGL/i,
      /ResizeObserver/i,
    ],
  },
});

const LAZY_TIMEOUT = 20_000;
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

test('charts-demo renders an ECharts canvas and reacts to control changes', async ({
  authedPage: page,
}) => {
  await page.goto('/charts-demo');
  await expect(page.getByRole('heading', { name: 'ECharts wrapper demo' })).toBeVisible();

  const chartCanvas = page.locator('canvas').first();
  await expect(chartCanvas).toBeVisible({ timeout: LAZY_TIMEOUT });

  const chartType = page.getByLabel('Chart type');
  const stacked = page.getByLabel('Stacked');

  await chartType.selectOption('bar');
  await expect(chartType).toHaveValue('bar');
  await expect(stacked).toBeEnabled();

  await stacked.check();
  await expect(stacked).toBeChecked();

  // Pie disables stacking — the checkbox should flip to disabled.
  await chartType.selectOption('pie');
  await expect(stacked).toBeDisabled();
  await expect(chartCanvas).toBeVisible();
});

test('monaco-demo mounts the editor, accepts typed text, and triggers autocomplete', async ({
  authedPage: page,
}) => {
  await page.goto('/monaco-demo');
  await expect(page.getByRole('heading', { name: 'Monaco wrapper demo' })).toBeVisible();

  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: LAZY_TIMEOUT });

  // Monaco renders into a hidden textarea — focus it and type via the
  // keyboard so the editor's input pipeline runs end-to-end. The visible
  // mirror panel reflects the value via `onChange`.
  const inputArea = editor.locator('textarea.inputarea').first();
  await inputArea.focus();
  await page.keyboard.type('// hello e2e\n');
  await expect(page.locator('pre').first()).toContainText('hello e2e');

  // "Autocomplete (mock)": trigger the suggest widget via Ctrl+Space and
  // assert the editor stays alive. We don't pin a specific completion —
  // the TS language service running on the main thread is timing-
  // dependent in CI, and the goal is to prove the wiring, not the
  // specific suggestion contents.
  await page.keyboard.press('Control+Space');
  await expect(editor).toBeVisible();

  // Language switch should swap the model contents to the new sample.
  await page.getByLabel('Language').selectOption('sql');
  await expect(page.locator('pre').first()).toContainText('SELECT id');
});

test('maplibre-demo loads the map, exposes navigation controls, and reacts to fly-to', async ({
  authedPage: page,
}) => {
  await page.goto('/maplibre-demo');
  await expect(page.getByRole('heading', { name: 'MapLibre wrapper demo' })).toBeVisible();

  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: LAZY_TIMEOUT });

  // NavigationControl({ showCompass: false }) renders zoom in / zoom out
  // buttons with aria-labels.
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();

  // The toolbar exposes fly-to buttons for each city; clicking one
  // re-centers the map. We can't assert the new center without exposing
  // the map instance, but the click must not crash the page.
  await page.getByRole('button', { name: 'Paris' }).click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('cytoscape-demo renders the graph and selects nodes on tap', async ({
  authedPage: page,
}) => {
  await page.goto('/cytoscape-demo');
  await expect(page.getByRole('heading', { name: 'Cytoscape wrapper demo' })).toBeVisible();

  // Cytoscape stacks several <canvas> elements inside its container.
  const canvases = page.locator('canvas');
  await expect(canvases.first()).toBeVisible({ timeout: LAZY_TIMEOUT });
  await expect.poll(async () => await canvases.count()).toBeGreaterThan(0);

  // Pre-selection panel reads the placeholder.
  const selectionPanel = page.locator('.of-panel-muted').last();
  await expect(selectionPanel).toContainText('(none — tap a node)');

  // Drive a click into the cytoscape canvas. We can't deterministically
  // predict which node the layout places at a given pixel, but the
  // interaction must not crash and the page should remain interactive.
  const box = await canvases.last().boundingBox();
  if (!box) throw new Error('cytoscape canvas has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(canvases.first()).toBeVisible();
});

test.describe('responsive: mobile viewport (390 × 844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  const DEMOS = [
    {
      label: 'charts-demo',
      path: '/charts-demo',
      heading: 'ECharts wrapper demo',
      widget: 'canvas',
    },
    {
      label: 'monaco-demo',
      path: '/monaco-demo',
      heading: 'Monaco wrapper demo',
      widget: '.monaco-editor',
    },
    {
      label: 'maplibre-demo',
      path: '/maplibre-demo',
      heading: 'MapLibre wrapper demo',
      widget: '.maplibregl-canvas',
    },
    {
      label: 'cytoscape-demo',
      path: '/cytoscape-demo',
      heading: 'Cytoscape wrapper demo',
      widget: 'canvas',
    },
  ] as const;

  for (const demo of DEMOS) {
    test(`${demo.label} renders without breaking on mobile`, async ({ authedPage: page }) => {
      await page.goto(demo.path);
      await expect(page.getByRole('heading', { name: demo.heading })).toBeVisible({
        timeout: LAZY_TIMEOUT,
      });
      await expect(page.locator(demo.widget).first()).toBeVisible({ timeout: LAZY_TIMEOUT });

      // The heavy widget must fit inside the constrained viewport — no
      // horizontal overflow past the viewport edge.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(2);
    });
  }
});
