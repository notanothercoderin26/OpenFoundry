import { type Page, type Route } from '@playwright/test';
import { test, expect, DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { defineWorkshopApp, mockWorkshopApp, textWidget } from './fixtures/workshop';

/**
 * E2E edge-case coverage for the public runtime
 * (apps/web/src/routes/apps/AppRuntimePage.tsx).
 *
 * The existing ~20 workshop-*.spec.ts files cover happy-path widget
 * behaviour against a fully populated app definition. This spec
 * targets the failure / boundary states of the runtime shell itself.
 *
 * Reality check against the requested cases:
 *
 *   - The runtime maps HTTP errors through a single `ApiError` path:
 *     404 sets `status='not_found'` and renders the dedicated
 *     "Runtime not available" panel; any OTHER non-2xx (403, 500, …)
 *     sets `status='error'` and renders `<ErrorBanner>` with the
 *     extracted message body. There is no special-cased 403 surface
 *     today — the "403 unpublished" and "403 no-permission" cases
 *     both flow through the same banner, with the body text being
 *     the only differentiator.
 *   - There is NO "Request access" CTA in the runtime today. The
 *     no-permission test therefore pins the absence as a regression
 *     guard alongside asserting that the 403 message is surfaced.
 *   - The runtime has no skeleton — `<LoadingState>` is a plain
 *     "Loading published app..." line. Our "no content flash"
 *     assertion is that the page renderer's `.of-app-runtime__page`
 *     element does NOT appear while the loading line is on screen.
 *   - The widget registry returns "Unsupported widget type." for
 *     unknown `widget_type` values (AppWidgetRenderer.tsx:589). The
 *     widget-failure test seeds a junk type alongside a text widget
 *     and asserts both render side-by-side.
 *   - "Mobile collapse" is purely a CSS concern (Tailwind / runtime
 *     grid responds to width). We pin the contract that the runtime
 *     still mounts cleanly at a 375px viewport.
 *   - The deeplink param shape is `?page=<id|name|path>&<param>=<value>`
 *     — `page` selects the initial page, everything else becomes a
 *     runtime parameter (AppRuntimePage.tsx:45-52).
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // The error / not-found banners are intentional renders; we
      // assert on their visible text, the React error machinery still
      // reports them to console.error in dev mode.
      /Failed to load/i,
      /App is not published/,
      /Insufficient permissions/,
      /not found/i,
    ],
  },
});

const SLUG_OK = 'edges-demo';
const SLUG_MISSING = 'never-shipped';
const SLUG_UNPUBLISHED = 'half-baked';
const SLUG_FORBIDDEN = 'locked-down';
const SLUG_SLOW = 'slow-loader';
const SLUG_BROKEN = 'mixed-widgets';
const SLUG_MULTI = 'multi-page';

const LOADING_LABEL = /loading published app/i;

// ---------------------------------------------------------------------------
// App fixtures
// ---------------------------------------------------------------------------

const SIMPLE_APP = defineWorkshopApp({
  slug: SLUG_OK,
  name: 'Edges Demo',
  description: 'Edge-case smoke.',
  status: 'published',
  navigationStyle: 'tabs',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [textWidget('main-text', 'Main page body')],
    },
  ],
});

const SLOW_APP = defineWorkshopApp({
  slug: SLUG_SLOW,
  name: 'Slow Loader',
  description: 'Artificial latency.',
  status: 'published',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [textWidget('hello', 'Hello after the wait.')],
    },
  ],
});

const MIXED_APP = defineWorkshopApp({
  slug: SLUG_BROKEN,
  name: 'Mixed Widgets',
  status: 'published',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [
        textWidget('healthy-text', 'I am healthy.'),
        {
          // Unknown widget_type — the registry returns the
          // "Unsupported widget type." fallback. The neighbouring
          // text widget keeps rendering.
          id: 'broken-widget',
          widget_type: 'broken_widget_xyz',
          title: 'Broken',
          description: '',
          position: { x: 0, y: 1, width: 12, height: 1 },
          props: {},
          binding: null,
          events: [],
          children: [],
        },
        textWidget('healthy-text-2', 'I am also healthy.'),
      ],
    },
  ],
});

const MULTI_PAGE_APP = defineWorkshopApp({
  slug: SLUG_MULTI,
  name: 'Multi page',
  status: 'published',
  navigationStyle: 'tabs',
  homePageId: 'main',
  pages: [
    {
      id: 'main',
      name: 'Main',
      widgets: [textWidget('main-only', 'Main page only')],
    },
    {
      id: 'detail',
      name: 'Detail',
      widgets: [textWidget('detail-only', 'Detail body for id={{id}}')],
    },
  ],
  variables: [
    // Plumb the `id` URL parameter into a runtime variable so the
    // detail widget can interpolate it.
    {
      id: 'id_param',
      kind: 'runtime_parameter',
      name: 'id',
      metadata: { runtime_parameter: 'id' },
    },
  ],
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Mocks `GET /api/v1/apps/public/{slug}` with a status + JSON body. */
async function mockRuntimeError(
  page: Page,
  slug: string,
  init: { status: number; body: unknown },
): Promise<void> {
  await page.route(`**/api/v1/apps/public/${slug}`, async (route: Route) => {
    await route.fulfill({ status: init.status, json: init.body });
  });
}

/** Mocks the runtime endpoint with an artificial delay before responding. */
async function mockRuntimeSlow(
  page: Page,
  slug: string,
  app: ReturnType<typeof defineWorkshopApp>,
  delayMs: number,
): Promise<void> {
  await page.route(`**/api/v1/apps/public/${slug}`, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ json: app });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('unknown slug: backend 404 renders the "Runtime not available" panel + Open Workshop link', async ({
  authedPage,
}) => {
  await mockRuntimeError(authedPage, SLUG_MISSING, {
    status: 404,
    body: { error: 'app not found' },
  });

  await authedPage.goto(`/apps/runtime/${SLUG_MISSING}`);

  // The dedicated not-found surface — not the generic ErrorBanner.
  await expect(
    authedPage.getByRole('heading', { level: 2, name: /runtime not available/i }),
  ).toBeVisible();
  await expect(authedPage.getByText(`No published version exists for`)).toBeVisible();
  // The slug is rendered inside a <code> tag.
  await expect(authedPage.locator(`code:has-text("${SLUG_MISSING}")`)).toBeVisible();

  // The CTA is a Link to the Workshop gallery.
  const openWorkshop = authedPage.getByRole('link', { name: /open workshop/i });
  await expect(openWorkshop).toBeVisible();
  await expect(openWorkshop).toHaveAttribute('href', '/apps');

  // The generic ErrorBanner is NOT used for the 404 path.
  await expect(authedPage.getByRole('alert')).toHaveCount(0);
});

test('unpublished app: 403 with "App is not published" surfaces in the error banner', async ({
  authedPage,
}) => {
  await mockRuntimeError(authedPage, SLUG_UNPUBLISHED, {
    status: 403,
    body: { error: 'App is not published' },
  });

  await authedPage.goto(`/apps/runtime/${SLUG_UNPUBLISHED}`);

  // ErrorBanner is a role="alert" with the extracted message body.
  const alert = authedPage.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('App is not published');

  // 403 is NOT the not-found path; the "Runtime not available" panel
  // must NOT render.
  await expect(authedPage.getByRole('heading', { name: /runtime not available/i })).toHaveCount(0);

  // The runtime renderer doesn't reach the ready state, so the
  // published-app body never mounts.
  await expect(authedPage.locator('.of-app-runtime__page')).toHaveCount(0);
});

test('forbidden: 403 message surfaces, but no "Request access" CTA ships today', async ({
  authedPage,
}) => {
  await mockRuntimeError(authedPage, SLUG_FORBIDDEN, {
    status: 403,
    body: { error: 'Insufficient permissions to view this app.' },
  });

  await authedPage.goto(`/apps/runtime/${SLUG_FORBIDDEN}`);

  // The 403 message lands in the same ErrorBanner.
  const alert = authedPage.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Insufficient permissions to view this app.');

  // Regression guard: AppRuntimePage.tsx does NOT special-case
  // permission errors. There is no "Request access" button or link.
  // When that CTA ships, the count flips and forces this test to
  // be updated.
  expect(await authedPage.getByRole('button', { name: /request access/i }).count()).toBe(0);
  expect(await authedPage.getByRole('link', { name: /request access/i }).count()).toBe(0);
});

test('slow load: the loading state stays visible until the response lands, no early content flash', async ({
  authedPage,
}) => {
  await mockRuntimeSlow(authedPage, SLUG_SLOW, SLOW_APP, 2000);

  // Kick the navigation without awaiting full load — we want to
  // observe the in-flight state.
  const navigation = authedPage.goto(`/apps/runtime/${SLUG_SLOW}`);

  // The loading line is up and the published body is NOT yet
  // mounted (no `.of-app-runtime__page` flash).
  await expect(authedPage.getByText(LOADING_LABEL)).toBeVisible();
  await expect(authedPage.locator('.of-app-runtime__page')).toHaveCount(0);
  // The header bar exposes the runtime status as a data attribute
  // for debug tools; pin the contract.
  await expect(authedPage.locator('.app-runtime__bar')).toHaveAttribute('data-status', 'loading');

  await navigation;

  // After the response, the loading line disappears and the app
  // body renders.
  await expect(authedPage.getByText(LOADING_LABEL)).toHaveCount(0);
  await expect(authedPage.locator('.of-app-runtime__page')).toBeVisible();
  await expect(authedPage.getByText('Hello after the wait.')).toBeVisible();
});

test('isolated widget failure: an unknown widget_type degrades to a fallback while neighbours render', async ({
  authedPage,
}) => {
  await mockWorkshopApp(authedPage, SLUG_BROKEN, MIXED_APP);

  await authedPage.goto(`/apps/runtime/${SLUG_BROKEN}`);

  // The healthy text widgets render normally.
  await expect(authedPage.getByText('I am healthy.')).toBeVisible();
  await expect(authedPage.getByText('I am also healthy.')).toBeVisible();

  // The unknown-type widget falls back to the "Unsupported widget
  // type." pill (AppWidgetRenderer.tsx). The page does NOT crash.
  await expect(authedPage.getByText(/unsupported widget type/i)).toBeVisible();

  // No global ErrorBanner — a widget-level fallback should NOT
  // escalate to a page-level error.
  await expect(authedPage.getByRole('alert')).toHaveCount(0);
});

test('mobile viewport: 375px renders the runtime without horizontal overflow', async ({
  authedPage,
}) => {
  await authedPage.setViewportSize({ width: 375, height: 720 });
  await mockWorkshopApp(authedPage, SLUG_OK, SIMPLE_APP);

  await authedPage.goto(`/apps/runtime/${SLUG_OK}`);

  // The runtime shell is mounted and the page body is visible at
  // mobile width.
  const pageBody = authedPage.locator('.of-app-runtime__page');
  await expect(pageBody).toBeVisible();
  await expect(authedPage.getByText('Main page body')).toBeVisible();

  // Pin the contract that mobile content fits the viewport — if a
  // future change adds a fixed-width element wider than 375px, the
  // body element's bounding box will exceed it.
  const viewport = authedPage.viewportSize();
  expect(viewport).not.toBeNull();
  const bodyBox = await pageBody.boundingBox();
  expect(bodyBox).not.toBeNull();
  if (bodyBox && viewport) {
    expect(bodyBox.width).toBeLessThanOrEqual(viewport.width);
  }

  // The header bar's status attribute reports ready — it should not
  // collapse to a loading / error state on small screens.
  await expect(authedPage.locator('.app-runtime__bar')).toHaveAttribute('data-status', 'ready');
});

test('deeplink: ?page=detail&id=42 lands on the Detail page with the runtime parameter applied', async ({
  authedPage,
}) => {
  await mockWorkshopApp(authedPage, SLUG_MULTI, MULTI_PAGE_APP);

  await authedPage.goto(`/apps/runtime/${SLUG_MULTI}?page=detail&id=42`);

  // The Detail page widget is the only one that renders — the Main
  // page's "Main page only" widget is hidden when activePageId is
  // detail.
  await expect(authedPage.getByText(/detail body for id=42/i)).toBeVisible();
  await expect(authedPage.getByText('Main page only')).toHaveCount(0);

  // The page navigation reflects the deep-linked page as active.
  const nav = authedPage.getByRole('navigation', { name: /app pages/i });
  await expect(nav).toBeVisible();
  const activeButton = nav.locator('.of-app-runtime__nav-item.is-active');
  await expect(activeButton).toHaveText('Detail');
});

test('deeplink: ?page=missing-id falls back to the home page rather than 404-ing', async ({
  authedPage,
}) => {
  await mockWorkshopApp(authedPage, SLUG_MULTI, MULTI_PAGE_APP);

  // An unknown page parameter should NOT take down the runtime —
  // AppRenderer's `defaultPage` lookup falls back to home_page_id
  // and finally to the first visible page.
  await authedPage.goto(`/apps/runtime/${SLUG_MULTI}?page=ghost`);

  // Main page renders (home_page_id = 'main').
  await expect(authedPage.getByText('Main page only')).toBeVisible();
  await expect(authedPage.getByText(/detail body/i)).toHaveCount(0);

  // No error banner; the parameter is silently ignored.
  await expect(authedPage.getByRole('alert')).toHaveCount(0);
});
