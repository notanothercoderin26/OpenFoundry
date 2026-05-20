# OpenFoundry E2E Test Suite

End-to-end tests for `apps/web/` powered by **Playwright 1.60+**. Built to
match the bar of Palantir-grade enterprise apps: deterministic, fast,
cross-browser, accessibility-aware, and visual-regression-aware.

## Layout

```
e2e/
  fixtures/
    base.ts         Extended `test`/`expect` with auth fixtures
    mocks.ts        mockAuth(), mockJson(), buildUser(), E2E_NOW
    workshop.ts     defineWorkshopApp() builder + widget helpers
  pages/
    LoginPage.ts            Login page object
    WorkshopRuntimePage.ts  Public workshop runtime page object
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

Snapshots live in `e2e/__snapshots__/` and are diffed pixel-by-pixel. The
first time you add a `toHaveScreenshot()` assertion, generate the baseline
locally and commit it:

```sh
pnpm --filter @open-foundry/web test:e2e:update-snapshots
```

Snapshots are platform-sensitive — regenerate on Linux/CI if you author on
macOS or Windows.

### Browser filter

The Playwright config exposes an env knob for which browser projects to
load. Defaults to `chromium`. CI uses a matrix of `chromium,firefox,webkit`.

```sh
E2E_BROWSERS=chromium,firefox pnpm --filter @open-foundry/web test:e2e
```

## Writing a new spec

1. Import `test` and `expect` from `./fixtures/base` (NOT `@playwright/test`).
2. Call `mockAuth(page)` before `page.goto()` — every protected route needs it.
3. Mock backend calls with `mockJson(page, url, body)` or `page.route(...)`
   for anything that needs request inspection.
4. Prefer Page Objects (`pages/`) over inline locators when behavior repeats.
5. For Workshop apps, use `defineWorkshopApp()` instead of hand-rolling the
   ~150-line JSON envelope.

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

Exclusions need a justifying comment — third-party canvases are fine, our
own components are not.

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
+import { mockAuth } from './fixtures/mocks';
 ...
-  await page.addInitScript(() => {
-    window.localStorage.setItem('of_access_token', 'e2e-token');
-  });
-  await page.route('**/api/v1/auth/bootstrap-status', async (route) => { ... });
-  await page.route('**/api/v1/users/me', async (route) => { ... });
+  await mockAuth(page);
```

For Workshop specs, replace the hand-rolled app envelope with
`defineWorkshopApp()` — it fills the theme/settings/slate boilerplate so
each spec contains only the part that's actually under test.
