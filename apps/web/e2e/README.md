# OpenFoundry E2E Test Suite

End-to-end tests for `apps/web/` powered by **Playwright 1.60+**. Built to
match the bar of Palantir-grade enterprise apps: deterministic, fast,
cross-browser, accessibility-aware, and visual-regression-aware.

## Layout

```
e2e/
  fixtures/
    base.ts         Extended `test`/`expect` with global fixtures
    mocks.ts        mockAuth(), mockJson(), buildUser(), E2E_NOW
    api-mocks.ts    Per-resource make/mock factory + installDefaultApiMocks
    workshop.ts     defineWorkshopApp() builder + widget helpers
  pages/
    _base.ts                  BasePagePO / ListPagePO / DetailPagePO
    index.ts                  Barrel — import every page object from here
    LoginPage.ts              Login page object
    AppShellPage.ts           Authenticated chrome (sidebar + topbar)
    WorkshopRuntimePage.ts    Public workshop runtime page object
    <Area>Page.ts             Page Object per route area (~95 files)
    control-panel/            Sub-pages for /control-panel/*
  helpers/
    a11y.ts         expectNoA11yViolations() — axe-core wrapper
  __snapshots__/    Visual regression baselines (committed)
  *.spec.ts         Test files
```

## Running tests

```sh
# Default — chromium only (fastest local loop).
pnpm --filter @open-foundry/web test:e2e

# All desktop browsers (matches CI).
pnpm --filter @open-foundry/web test:e2e:all-browsers

# Single spec.
pnpm --filter @open-foundry/web test:e2e e2e/auth-smoke.spec.ts

# Interactive UI mode (great for debugging selector failures).
pnpm --filter @open-foundry/web test:e2e:ui

# Show the last HTML report.
pnpm --filter @open-foundry/web test:e2e:report
```

### Visual snapshots

Snapshots live in `e2e/__snapshots__/<spec>-snapshots/<name>-<project>-<platform>.png`
and are diffed pixel-by-pixel on every run. Use the
{@link helpers/visual.ts} helpers — `prepareForVisual(page)` and
`expectScreenshot(page, name)` — instead of calling `toHaveScreenshot`
directly so the project-wide defaults (animations disabled, fonts
ready, default mask set, `maxDiffPixelRatio: 0.01`) stay in sync.

Authoring a new snapshot:

```ts
import { expectScreenshot, prepareForVisual } from './helpers/visual';

test('my page is visually stable', async ({ adminPage, apiMocks }) => {
  await apiMocks.mockDatasetsList(adminPage);
  await adminPage.goto('/datasets');

  await prepareForVisual(adminPage);
  await expectScreenshot(adminPage, 'datasets-list', {
    mask: [adminPage.getByRole('cell', { name: /^\d+ MB$/ })],
  });
});
```

Generating / refreshing baselines:

```sh
# Regenerate every snapshot in the suite (use sparingly — re-review diffs!).
pnpm --filter @open-foundry/web exec playwright test --update-snapshots

# Regenerate just one spec's baselines.
pnpm --filter @open-foundry/web exec playwright test datasets-list --update-snapshots

# Regenerate per-browser (run inside the matching project).
pnpm --filter @open-foundry/web exec playwright test --project=firefox --update-snapshots
```

After regenerating, **review the diff** before committing — a baseline
update is functionally a "this is what the page should look like" commit
and silently locks in any unintended UI change. CI baselines are
generated on Linux; if you author on macOS / Windows, regenerate inside
a Linux container (or let CI fail once and pull the artifact).

Volatile content is masked automatically by `expectScreenshot`:
- `<time>` elements
- `[data-testid$="-timestamp"]`, `[data-testid$="-id"]`,
  `[data-testid$="-uuid"]`, `[data-testid$="-relative-time"]`
- Externally hosted avatars (`img[src*="avatar"]`, `…gravatar`)
- Anything tagged `[data-mask-visual]` (opt-in for new code)

Pass extra locators via the `mask` option for spec-specific noise.

### Browser filter

The Playwright config exposes an env knob for which browser projects to
load. Defaults to `chromium`. CI uses a matrix of `chromium,firefox,webkit`.

```sh
E2E_BROWSERS=chromium,firefox pnpm --filter @open-foundry/web test:e2e
```

## Global fixtures

`fixtures/base.ts` extends Playwright's `test` with the following fixtures.
**Destructure only what you need — `pageErrors` is the only `auto` one.**

| Fixture       | Auto  | What it gives you                                                                                                    |
|---------------|-------|----------------------------------------------------------------------------------------------------------------------|
| `authedPage`  | no    | `page` with `mockAuth` + `installDefaultApiMocks` pre-installed. Uses `authOptions` if set.                          |
| `adminPage`   | no    | Same as `authedPage` but identity is `roles: ['admin']` + `permissions: ['*']`.                                      |
| `viewerPage`  | no    | Same shape but identity is `roles: ['viewer']` + `permissions: ['read:*']`. Use for RBAC tests.                      |
| `apiMocks`    | no    | The full `api-mocks.ts` namespace (`makeDataset`, `mockProjectsList`, …). Catch-all already installed.                |
| `pageErrors`  | **yes** | Live `string[]` of `pageerror` + `console.error`. Auto-fails the test if non-allowlisted errors remain at teardown. |

Per-test option knobs (set via `test.use({...})`):

| Option           | Default                       | Effect                                                                            |
|------------------|-------------------------------|-----------------------------------------------------------------------------------|
| `authOptions`    | `{}`                          | Forwarded to `mockAuth` (user overrides, sso providers, requiresInitialAdmin).    |
| `freezeTime`     | `false`                       | When `true`, `Date.now()` / `new Date()` are pinned to `E2E_NOW` on every page.   |
| `errorAllowlist` | `{ patterns: DEFAULT_ERROR_ALLOWLIST }` | Regex bag filtered out before the `pageErrors` post-test assertion. |

The default allowlist covers `ERR_ABORTED`, `Failed to load resource`,
`AbortError`, and `ResizeObserver loop` noise. Extend it (don't replace it)
if your spec genuinely needs to tolerate more. The option value is wrapped
in `{ patterns: [...] }` because Playwright's `test.use` mis-detects bare
array values as fixture-override tuples:

```ts
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';

test.use({
  errorAllowlist: {
    patterns: [...DEFAULT_ERROR_ALLOWLIST, /MapLibre canvas warning/],
  },
});
```

### Fixture ordering

`apiMocks` runs first and installs a low-priority catch-all
(`installDefaultApiMocks(page)`). `authedPage` / `adminPage` / `viewerPage`
each depend on `apiMocks`, so by the time the test body starts:

1. Catch-all is in place (oldest handler).
2. `mockAuth` routes for `/api/v1/auth/*`, `/api/v1/users/me` are in place
   (newer than the catch-all, so they win).
3. Any per-test `page.route(...)` calls are the newest handlers and take
   precedence over both.

This matches Playwright's most-recent-first dispatch, so override what you
care about with named resource mockers (`apiMocks.mockDatasetsList(page,
[makeDataset({ name: 'Custom' })])`) and let the rest fall through to the
catch-all.

## Scaffolding a new spec

For new route areas, the fastest way to start is the scaffold script.
It generates `apps/web/e2e/<area>.spec.ts` with the global fixtures
pre-wired and three test stubs ready to fill in:

```sh
pnpm --filter @open-foundry/web exec tsx \
  e2e/scripts/scaffold-spec.ts <area> <route-path> [pageObjectName]

# Examples:
pnpm --filter @open-foundry/web exec tsx \
  e2e/scripts/scaffold-spec.ts datasets /datasets DatasetsListPage

pnpm --filter @open-foundry/web exec tsx \
  e2e/scripts/scaffold-spec.ts notifications /notifications NotificationsPage

pnpm --filter @open-foundry/web exec tsx \
  e2e/scripts/scaffold-spec.ts favorites /favorites
```

The third argument (Page Object class) is optional — when omitted, the
generated spec falls back to inline `page.goto(...)` + `getByRole`. When
present, it must be a TypeScript identifier that's already exported from
`./pages` (the barrel) — the scaffold uses `new Foo(adminPage)` + `goto`
+ `expectLoaded`.

What you get:
- Three `test()` stubs: `<area> loads without errors`, `<area> primary CTA
  opens modal or navigates`, `<area> list renders mocked data`.
- `adminPage` + `apiMocks` destructured on every test.
- TODO comments pointing to the patterns to copy from
  (`route-smokes.spec.ts`, `workshop-actions.spec.ts`,
  `fixtures-smoke.spec.ts`).

Out-of-the-box, the generated spec PASSES against the default catch-all
mocks for any route that doesn't require resource-specific data shapes.
Fill in the TODOs with real mocks (`apiMocks.mockXList(...)`) and real
assertions before opening the PR.

Safety: the script refuses to overwrite an existing spec — delete it
first if you really want to regenerate.

## Writing a new spec

1. Import `test` and `expect` from `./fixtures/base` (NOT `@playwright/test`).
2. Pick the right page fixture: `adminPage` for admin flows, `viewerPage`
   for read-only RBAC, `authedPage` otherwise. Use plain `page` only for
   unauthenticated flows (login, MFA, setup).
3. Layer resource-specific mocks on top of the catch-all with
   `apiMocks.mockXList(page, …)` / `apiMocks.mockXDetail(page, …)`.
4. Prefer Page Objects (`pages/`) over inline locators when behavior
   repeats. Import them from `./pages` (the barrel).
5. For Workshop apps, use `defineWorkshopApp()` instead of hand-rolling
   the ~150-line JSON envelope.

Minimal example:

```ts
import { test, expect } from './fixtures/base';
import { DatasetsListPage } from './pages';

test('lists datasets and opens the first row', async ({ adminPage, apiMocks }) => {
  await apiMocks.mockDatasetsList(adminPage, [
    apiMocks.makeDataset({ id: 'dataset-1', name: 'Customers' }),
    apiMocks.makeDataset({ id: 'dataset-2', name: 'Orders' }),
  ]);

  const datasets = new DatasetsListPage(adminPage);
  await datasets.goto();
  await datasets.expectLoaded();

  await expect(datasets.row(/Customers/)).toBeVisible();
});
```

Capturing request payloads after an action:

```ts
import { test, expect } from './fixtures/base';

test('creates a dataset', async ({ adminPage, apiMocks }) => {
  const cap = apiMocks.captureRequests(adminPage, /\/api\/v1\/datasets$/);

  await adminPage.goto('/datasets');
  await adminPage.getByRole('button', { name: 'New dataset' }).click();
  await adminPage.getByLabel('Name').fill('Customers v2');
  await adminPage.getByRole('button', { name: 'Create' }).click();

  await expect.poll(() => cap.count()).toBe(1);
  expect(cap.last()?.body).toMatchObject({ name: 'Customers v2' });
});
```

### Mocking Server-Sent Events (SSE)

LLM endpoints (`/api/v1/ai/assist/chat`, future `/ai/chat/completions`
streaming variants, etc.) reply with `Content-Type: text/event-stream`
and emit each token as a `data:` event. `helpers/sse.ts` wraps
`page.route` + the framing rules so specs stay short.

```ts
import { mockSseStream } from './helpers/sse';

test('streams the assistant reply', async ({ adminPage }) => {
  await mockSseStream(adminPage, '**/api/v1/ai/assist/chat', [
    JSON.stringify({ delta: 'Hello' }),
    JSON.stringify({ delta: ' world' }),
  ]);
  await adminPage.goto('/ai/assist');

  await adminPage.getByLabel('Assist prompt').fill('Greet me');
  await adminPage.getByRole('button', { name: /ask/i }).click();

  await expect(adminPage.getByText('Hello world')).toBeVisible();
});
```

The helper produces a body like:

```
data: {"delta":"Hello"}

data: {"delta":" world"}

data: [DONE]

```

(double newlines between events — required by the spec; the trailing
`[DONE]` marker matches the OpenAI-compatible gateway). Pass
`{ closeWith: null }` to omit the terminator or `{ closeWith: 'eof' }`
to use a custom marker.

**Caveat: bytes arrive all at once.** `route.fulfill` doesn't yield
partial bodies, so the *transport* is not actually streamed. The
browser's SSE parser still emits each `data:` event one-by-one as it
walks the body, so the page sees the same `onmessage` cadence a real
backend would produce. For assertions about the *final assembled
message* or about UI affordances per event, this is fine. For true
chunk-timing assertions ("the typing indicator hides after chunk 2"),
spin up a local HTTP server in the spec — `route.fulfill` cannot
deliver that.

**Mid-stream cancellation.** Use `delayMs` to delay the fulfill, fire
the request, and click Stop during the wait. The browser aborts the
in-flight fetch before any byte arrives — assert the partial state was
cleaned up.

```ts
await mockSseStream(adminPage, '**/api/v1/ai/assist/chat', chunks, {
  delayMs: 1_500,
});
await adminPage.getByRole('button', { name: /ask/i }).click();
await adminPage.getByRole('button', { name: /stop/i }).click();
await expect(adminPage.getByRole('button', { name: /stop/i })).toBeHidden();
```

**Error paths.** Pass `{ status: 429, closeWith: null }` (no events,
just a 4xx response) to drive the rate-limit toast / banner. The
helper still sets `Content-Type: text/event-stream`, so the client
parses the empty body correctly; combine with a JSON body via
`headers` + `body` if your client expects a structured error envelope
on non-2xx.

**Inline alternative.** If a spec genuinely needs a one-off shape that
doesn't fit `mockSseStream`, the raw pattern is:

```ts
await adminPage.route('**/api/v1/ai/assist/chat', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    headers: { 'cache-control': 'no-cache' },
    body: 'data: {"delta":"hi"}\n\ndata: [DONE]\n\n',
  });
});
```

Keep the helper for everything else — copy-paste of the framing rules
across specs goes stale the moment the gateway changes its `[DONE]`
marker.

Minimal skeleton:

```ts
import { test, expect } from './fixtures/base';
import { mockAuth, mockJson } from './fixtures/mocks';

test('my feature works', async ({ page }) => {
  await mockAuth(page);
  await mockJson(page, '**/api/v1/widgets', { data: [] });

  await page.goto('/widgets');
  await expect(page.getByRole('heading', { name: 'Widgets' })).toBeVisible();
});
```

Workshop-runtime skeleton:

```ts
import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { defineWorkshopApp, mockWorkshopApp, textWidget } from './fixtures/workshop';
import { WorkshopRuntimePage } from './pages/WorkshopRuntimePage';

const slug = 'my-app';
const app = defineWorkshopApp({
  slug,
  pages: [{ id: 'main', name: 'Main', widgets: [textWidget('hello', 'Hello world')] }],
});

test('renders my workshop app', async ({ page }) => {
  await mockAuth(page);
  await mockWorkshopApp(page, slug, app);

  const workshop = new WorkshopRuntimePage(page, slug);
  await workshop.goto();

  await expect(page.getByText('Hello world')).toBeVisible();
});
```

## Selector strategy

In order of preference:

1. **`getByRole('button', { name: 'Save' })`** — drives accessibility-by-default.
2. **`data-testid`** for things without a semantic role (panels, overlays).
3. **Text matching** for assertions, not for actions.
4. **CSS / `locator('.foo')`** as a last resort — fragile to refactors.

Avoid `nth-child`, generated class names, and chained `>>` text selectors.

## Accessibility

Every page added to the runtime should pass `expectNoA11yViolations`:

```ts
import { expectNoA11yViolations } from './helpers/a11y';

test('my page is accessible', async ({ page }) => {
  await page.goto('/my-page');
  await expectNoA11yViolations(page, {
    exclude: ['.monaco-editor', '.maplibregl-canvas'], // third-party widgets
  });
});
```

Heavy third-party widgets (Monaco, Cytoscape, MapLibre, ECharts) are
excluded by default via `DEFAULT_A11Y_EXCLUDES`. Additional exclusions
need a justifying comment — third-party canvases are fine, our own
components are not.

Every scan writes a detailed JSON report to
`test-results/a11y/<test-name>.json` (and attaches it to the Playwright
HTML report) with violation counts, node selectors, HTML snippets, and
help URLs. CI uploads `test-results/a11y/` as an artifact for triage.

For one-call "go to a route and audit it", use `auditPageA11y`:

```ts
import { auditPageA11y } from './helpers/a11y';

test('datasets list is accessible', async ({ adminPage }) => {
  await auditPageA11y(adminPage, {
    route: '/datasets',
    screenshot: true, // attach a screenshot on violation for triage
  });
});
```

For pages with known noisy rules you'd rather track than fail on, set
per-rule severity:

```ts
await expectNoA11yViolations(page, {
  rules: {
    'color-contrast': 'warn',      // logged + reported, doesn't fail
    region: 'off',                  // disabled in axe entirely
    'aria-allowed-attr': 'error',  // default — fails the test
  },
});
```

`warn` violations show up as a `a11y-warning` annotation on the test
result and still appear in the JSON report. Use sparingly; the goal is
zero `error` violations across the suite.

`include` scopes the scan INTO a subtree (useful when one component is
ready before the rest of the page):

```ts
await expectNoA11yViolations(page, { include: ['[data-testid="datasets-table"]'] });
```

## CI

`.github/workflows/ci-frontend.yml` runs:

- `build`: lint + tsc + vite build
- `test-unit`: vitest
- `test-e2e`: **3 browsers × 4 shards = 12 parallel jobs**. Each shard
  uploads its HTML report, traces and JUnit XML as artifacts.

The dev server is auto-started by Playwright's `webServer` block; no
backend container is required because every API call is route-mocked.

## Gotchas

- **`page.route()` only intercepts requests registered BEFORE `goto()`.**
  If you call `mockAuth` after navigation, the auth call has already gone out.
- **`fullyParallel: true`.** Don't share mutable state between tests in
  the same file unless you wrap them in `test.describe.serial`.
- **Lazy-loaded routes.** Wait for a role/heading on the page rather than
  a hardcoded sleep — chunks load asynchronously.
- **`document.fonts.ready`.** For visual regression snapshots, await
  fonts before screenshotting to avoid flakiness from FOIT/FOUT.

## Migrating legacy specs

The pre-2026 specs in this directory mock auth + bootstrap inline,
duplicating ~25 lines apiece. Replace them with:

```diff
-import { expect, test } from '@playwright/test';
+import { test, expect } from './fixtures/base';
 ...
-  await page.addInitScript(() => {
-    window.localStorage.setItem('of_access_token', 'e2e-token');
-  });
-  await page.route('**/api/v1/auth/bootstrap-status', async (route) => { ... });
-  await page.route('**/api/v1/users/me', async (route) => { ... });
-test('foo', async ({ page }) => {
+test('foo', async ({ adminPage: page }) => {
```

The `adminPage` fixture already installs auth + the default API catch-all,
so specs only need to add resource-specific mocks for the data they care
about. For per-test error tolerance, use `errorAllowlist` instead of
hand-rolling `page.on('console', ...)` blocks — the auto `pageErrors`
fixture covers the listener wiring.

For Workshop specs, replace the hand-rolled app envelope with
`defineWorkshopApp()` — it fills the theme/settings/slate boilerplate so
each spec contains only the part that's actually under test.
