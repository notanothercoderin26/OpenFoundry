import { test } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { auditPageA11y } from './helpers/a11y';
import { expectScreenshot, prepareForVisual } from './helpers/visual';

/**
 * Sanity check for the a11y + visual helpers (Task 0.4).
 *
 * Renders the home page through the authed + populated mock stack, then
 * runs the a11y audit (with the AppShell's known noisy rules downgraded
 * to `warn` so the test passes deterministically while still producing
 * the JSON report) and writes the visual baseline.
 *
 * Update the baseline when the home layout changes:
 *   pnpm --filter @open-foundry/web exec playwright test helpers-smoke --update-snapshots
 *
 * AppShell components currently consume some endpoints that don't return
 * the standard list envelope (e.g. ScopedSessionBanner expects a raw
 * array). The catch-all returns `{ data: [], total: 0 }` and these
 * components crash with "Cannot read properties of undefined (reading
 * 'filter')". This is a real defect tracked separately — for the smoke,
 * we tolerate it via errorAllowlist so the helper wiring is provable
 * in isolation. Task 21.1 will sweep these.
 */
test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined \(reading 'filter'\)/,
      /React Router caught the following error during render/,
      // React's verbose `console.error('%o', err)` template.
      /^console\.error: %o$/,
    ],
  },
});

test('home renders an a11y report and a visual baseline', async ({ adminPage, apiMocks }) => {
  await apiMocks.installPopulatedApiMocks(adminPage);
  await adminPage.goto('/');

  await auditPageA11y(adminPage, {
    screenshot: true,
    // The smoke is about wiring, not the AppShell's full a11y debt — keep
    // noisy AppShell rules at `warn` so the JSON report still captures
    // them without failing the smoke. Sweeping a11y comes in Task 21.1.
    rules: {
      'color-contrast': 'warn',
      region: 'warn',
      'landmark-one-main': 'warn',
      'landmark-unique': 'warn',
      'page-has-heading-one': 'warn',
      'heading-order': 'warn',
      'aria-allowed-attr': 'warn',
      'aria-required-children': 'warn',
      'aria-required-parent': 'warn',
      'nested-interactive': 'warn',
      'scrollable-region-focusable': 'warn',
      'duplicate-id-aria': 'warn',
    },
  });

  await prepareForVisual(adminPage);
  await expectScreenshot(adminPage, 'home');
});
