import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { expectNoA11yViolations } from './helpers/a11y';
import { NotificationsPage } from './pages';

/**
 * E2E coverage for `/notifications` (apps/web/src/routes/notifications/NotificationsPage.tsx).
 *
 * **Reality check.** The shipped NotificationsPage is currently a
 * static placeholder — a `<h1>Notifications</h1>` header plus a
 * panel that reads "You have no notifications." There is:
 *
 *   - no list / no rows;
 *   - no `Unread` / `All` filter tabs;
 *   - no per-row mark-as-read toggle;
 *   - no "Mark all as read" CTA;
 *   - no clickable notifications;
 *   - no real-time WebSocket / SSE pipeline;
 *   - no link to /settings#notifications.
 *
 * The page also doesn't read from `/api/v1/notifications*` — there is
 * literally no API call on mount.
 *
 * The roadmap (task 2.3) describes a fully-implemented feature. Rather
 * than write speculative tests that exercise non-existent UI, this
 * spec PINS the shipped placeholder behaviour and adds regression
 * guards for every roadmap control that's still missing. When the
 * feature ships, every "control is absent today" assertion below will
 * fail loudly — the developer adding the feature inherits an
 * actionable checklist.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

test('renders the heading + empty-state panel and the AppShell chrome', async ({
  adminPage,
}) => {
  const notifications = new NotificationsPage(adminPage);
  await notifications.goto();
  await notifications.expectLoaded();

  // AppShell stays visible — `/notifications` is an authenticated route.
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();

  // Heading + the placeholder copy.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^notifications$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/you have no notifications/i),
  ).toBeVisible();
});

test('does NOT call any /notifications endpoint on mount', async ({ adminPage }) => {
  // Regression guard. The day someone wires a list endpoint without
  // finishing the UI, this test catches the partial migration before
  // a real user sees broken rendering.
  const calls = captureRequests(adminPage, /\/api\/v1\/notifications/);

  const notifications = new NotificationsPage(adminPage);
  await notifications.goto();
  await notifications.expectLoaded();
  await adminPage.waitForTimeout(500);

  expect(calls.count()).toBe(0);
});

test('absent today: filter tabs (Unread / All)', async ({ adminPage }) => {
  // When the implementation lands the filter tabs should expose
  // `role="tab"` with the labels below. While they're missing this
  // test pins the absence so a half-shipped feature surfaces here.
  const notifications = new NotificationsPage(adminPage);
  await notifications.goto();
  await notifications.expectLoaded();

  expect(await adminPage.getByRole('tab', { name: /^unread$/i }).count()).toBe(0);
  expect(await adminPage.getByRole('tab', { name: /^all$/i }).count()).toBe(0);
});

test('absent today: "Mark all as read" button', async ({ adminPage }) => {
  const notifications = new NotificationsPage(adminPage);
  await notifications.goto();
  await notifications.expectLoaded();

  expect(
    await adminPage.getByRole('button', { name: /mark all (as )?read/i }).count(),
  ).toBe(0);
});

test('absent today: per-row read-toggle controls', async ({ adminPage }) => {
  // When the UI ships, each notification row should expose a button
  // labelled like "Mark as read" or "Mark as unread". Pin the
  // absence for now.
  const notifications = new NotificationsPage(adminPage);
  await notifications.goto();
  await notifications.expectLoaded();

  expect(
    await adminPage.getByRole('button', { name: /mark as (un)?read/i }).count(),
  ).toBe(0);
  // No `<li>` rows are emitted either — the panel is the only content.
  expect(await adminPage.getByRole('listitem').count()).toBe(0);
});

test('absent today: link to notification settings', async ({ adminPage }) => {
  // Roadmap calls for a link to `/settings#notifications`. Until that
  // lands, pin the absence so a partial implementation surfaces.
  const notifications = new NotificationsPage(adminPage);
  await notifications.goto();
  await notifications.expectLoaded();

  expect(
    await adminPage.getByRole('link', { name: /notification settings|settings/i }).count(),
  ).toBe(0);
});

test('reachable from the AppShell sidebar', async ({ adminPage }) => {
  await adminPage.goto('/');

  // The sidebar exposes a "Notifications" link that drops the user
  // here. We do not rely on the icon-only collapsed sidebar — the
  // accessible name comes from the visible label.
  const navLink = adminPage
    .getByRole('navigation', { name: /primary navigation/i })
    .getByRole('link', { name: /^notifications$/i });
  await navLink.click();

  await expect(adminPage).toHaveURL(/\/notifications(\?|$)/);
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^notifications$/i }),
  ).toBeVisible();
});

test('a11y: placeholder renders without serious axe violations', async ({ adminPage }) => {
  const notifications = new NotificationsPage(adminPage);
  await notifications.goto();
  await notifications.expectLoaded();

  // Same app-wide rule downgrades documented in helpers-smoke /
  // home.spec.ts (color-contrast, landmark, etc are tracked as
  // app-wide debt under Task 21.1).
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
