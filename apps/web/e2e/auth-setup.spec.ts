import { type Page } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { mockAuth } from './fixtures/mocks';

/**
 * E2E coverage for `/auth/setup`
 * (apps/web/src/routes/auth/SetupPage.tsx).
 *
 * The shipped wizard has **two** steps, not the "tenancy / first admin /
 * instance config" 4-step flow described in the roadmap:
 *
 *   1. `email`     — email + remember-me checkbox + Next
 *   2. `password`  — name + password + Back + Create
 *
 * It does NOT call `/api/v1/setup/initialize` (the wire endpoint in the
 * roadmap doesn't exist); the wizard POSTs the standard `/auth/register`
 * payload and then redirects to `/auth/login?registered=true&email=…`.
 *
 * The "instance already initialized → redirect to /auth/login" gate lives
 * in `useBootstrapGate` (apps/web/src/lib/auth/bootstrap.ts), driven by
 * `GET /api/v1/auth/bootstrap-status`. The tests below mock that endpoint
 * via {@link mockAuth}'s `requiresInitialAdmin` knob.
 *
 * Tests are independent: each starts a fresh page and uses {@link advanceToPasswordStep}
 * when it needs to be on step 2 (SetupPage doesn't support `?step=N` deep
 * links — `step` is internal state).
 */

const VALID_EMAIL = 'first-admin@example.com';
const VALID_NAME = 'First Admin';
const VALID_PASSWORD = 'CorrectHorseBatteryStaple-9X73f';
const REGISTER_PATTERN = /\/api\/v1\/auth\/register$/;

const nextButton = (page: Page) => page.getByRole('button', { name: /^next$/i });
const backButton = (page: Page) => page.getByRole('button', { name: /^back$/i });
const createButton = (page: Page) =>
  page.getByRole('button', { name: /^(create|creating)/i });

const emailInput = (page: Page) => page.locator('input[type="email"]');
const nameInput = (page: Page) => page.locator('input[autocomplete="name"]');
const passwordInput = (page: Page) => page.locator('input[type="password"]');
const rememberMeCheckbox = (page: Page) => page.getByRole('checkbox');

/** Fill the email step and click Next so the test starts on step 2. */
async function advanceToPasswordStep(
  page: Page,
  email: string = VALID_EMAIL,
): Promise<void> {
  await emailInput(page).fill(email);
  await nextButton(page).click();
  // Step 2 swapped in — the password input is the canonical anchor.
  await expect(passwordInput(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Default arrangement for every test: instance NOT initialized AND user
  // NOT authenticated, so the wizard renders. Specific tests can override
  // with their own `mockAuth(page, { ... })` before navigating.
  await mockAuth(page, { authenticated: false, requiresInitialAdmin: true });
  // Clear the remembered email so step 1 starts blank.
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('of_setup_remember_email');
    } catch {
      /* about:blank or denied */
    }
  });
});

test('renders the wizard on step 1 (email + remember me)', async ({ page }) => {
  await page.goto('/auth/setup');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(emailInput(page)).toBeVisible();
  await expect(emailInput(page)).toBeFocused();
  await expect(rememberMeCheckbox(page)).toBeVisible();
  await expect(nextButton(page)).toBeVisible();

  // Step 2 inputs are not in the DOM yet.
  expect(await passwordInput(page).count()).toBe(0);
  expect(await nameInput(page).count()).toBe(0);
  expect(await backButton(page).count()).toBe(0);
});

test('step 1 → step 2: valid email advances to the password step', async ({ page }) => {
  await page.goto('/auth/setup');

  await emailInput(page).fill(VALID_EMAIL);
  await nextButton(page).click();

  await expect(passwordInput(page)).toBeVisible();
  await expect(nameInput(page)).toBeVisible();
  await expect(backButton(page)).toBeVisible();
  await expect(createButton(page)).toBeVisible();

  // The chosen email is echoed on the password step so the user knows
  // which identity they're setting up.
  await expect(page.getByText(VALID_EMAIL, { exact: false })).toBeVisible();
});

test('step 1 rejects an email without "@"', async ({ page }) => {
  const cap = captureRequests(page, REGISTER_PATTERN);
  await page.goto('/auth/setup');

  await emailInput(page).fill('not-an-email');

  // HTML5 type=email blocks form submission before the React rule fires.
  // Disable native validation and dispatch submit so the application-level
  // validator runs and surfaces its role="alert" error.
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form');
    if (!form) throw new Error('form not found');
    form.noValidate = true;
    form.requestSubmit();
  });

  await expect(page.getByRole('alert')).toBeVisible();
  // Still on step 1 (email input present, password input absent).
  await expect(emailInput(page)).toBeVisible();
  expect(await passwordInput(page).count()).toBe(0);
  expect(cap.count()).toBe(0);
});

test('Back from step 2 preserves the email entered on step 1', async ({ page }) => {
  await page.goto('/auth/setup');
  await advanceToPasswordStep(page, VALID_EMAIL);

  // Fill name + password too so we can also verify the password-step
  // values survive at least a round trip when the user comes back.
  await nameInput(page).fill(VALID_NAME);
  await passwordInput(page).fill(VALID_PASSWORD);

  await backButton(page).click();

  await expect(emailInput(page)).toBeVisible();
  await expect(emailInput(page)).toHaveValue(VALID_EMAIL);

  // Advance again — the entered name should still be there because the
  // step is just a render switch over shared state.
  await nextButton(page).click();
  await expect(nameInput(page)).toHaveValue(VALID_NAME);
  await expect(passwordInput(page)).toHaveValue(VALID_PASSWORD);
});

test('step 2 validation: empty name shows an error', async ({ page }) => {
  const cap = captureRequests(page, REGISTER_PATTERN);
  await page.goto('/auth/setup');
  await advanceToPasswordStep(page);

  await passwordInput(page).fill(VALID_PASSWORD);
  // Name left empty. Bypass HTML5 `required` so the React rule fires.
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form');
    if (!form) throw new Error('form not found');
    form.noValidate = true;
    form.requestSubmit();
  });

  await expect(page.getByRole('alert')).toBeVisible();
  // Still on step 2, no network call.
  await expect(passwordInput(page)).toBeVisible();
  expect(cap.count()).toBe(0);
});

test('step 2 validation: short password (<8 chars) shows an error', async ({ page }) => {
  const cap = captureRequests(page, REGISTER_PATTERN);
  await page.goto('/auth/setup');
  await advanceToPasswordStep(page);

  await nameInput(page).fill(VALID_NAME);
  await passwordInput(page).fill('short');
  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('form');
    if (!form) throw new Error('form not found');
    form.noValidate = true;
    form.requestSubmit();
  });

  await expect(page.getByRole('alert')).toBeVisible();
  expect(cap.count()).toBe(0);
});

test('happy path: completes both steps and redirects to /auth/login', async ({ page }) => {
  const cap = captureRequests(page, REGISTER_PATTERN);

  // After register() succeeds, `SetupPage.handlePasswordSubmit` calls
  // `void refreshBootstrapStatus()`. If `/auth/bootstrap-status` still
  // returns `requires_initial_admin: true`, `useBootstrapGate` would
  // immediately bounce the user back to /auth/setup and the
  // post-navigation URL would never settle on /auth/login. Flipping
  // the flag mid-test mirrors what a real backend does once the first
  // admin exists.
  let registered = false;
  await page.route('**/api/v1/auth/bootstrap-status', async (route) => {
    await route.fulfill({ json: { requires_initial_admin: !registered } });
  });

  await page.route('**/api/v1/auth/register', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    registered = true;
    await route.fulfill({
      status: 201,
      json: { id: 'user-1', email: VALID_EMAIL, name: VALID_NAME },
    });
  });

  await page.goto('/auth/setup');
  await advanceToPasswordStep(page, VALID_EMAIL);
  await nameInput(page).fill(VALID_NAME);
  await passwordInput(page).fill(VALID_PASSWORD);
  await createButton(page).click();

  // SetupPage and useBootstrapGate both call `navigate('/auth/login...')`
  // after the first admin is created (the page sets `?registered=&email=`,
  // the gate calls the bare path). The two updates batch unpredictably,
  // so we only pin the path here — the `registered=true` query is
  // covered by auth-register.spec.ts on the matching `/auth/register`
  // entry point and the gate's `?step` semantics aren't user-facing.
  await expect(page).toHaveURL(/\/auth\/login(\?|$)/);

  await expect.poll(() => cap.count()).toBe(1);
  const body = cap.last()?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    name: VALID_NAME,
    email: VALID_EMAIL,
    password: VALID_PASSWORD,
  });
});

test('error in submit: shows the API message and preserves wizard state', async ({ page }) => {
  await page.route('**/api/v1/auth/register', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 500,
      json: { error: 'Something went wrong on the server' },
    });
  });

  await page.goto('/auth/setup');
  await advanceToPasswordStep(page, VALID_EMAIL);
  await nameInput(page).fill(VALID_NAME);
  await passwordInput(page).fill(VALID_PASSWORD);
  await createButton(page).click();

  // Banner visible with the server-supplied message.
  await expect(
    page.getByRole('alert').filter({ hasText: /something went wrong/i }),
  ).toBeVisible();

  // Still on step 2 with values intact — the user can retry without
  // re-entering everything.
  await expect(passwordInput(page)).toBeVisible();
  await expect(nameInput(page)).toHaveValue(VALID_NAME);
  await expect(passwordInput(page)).toHaveValue(VALID_PASSWORD);

  // Inputs are not stuck `disabled` after the failed submission.
  await expect(nameInput(page)).toBeEnabled();
  await expect(passwordInput(page)).toBeEnabled();
});

test('already-initialized instance: redirects /auth/setup to /auth/login', async ({ page }) => {
  // Re-mock auth with requires_initial_admin = false so the bootstrap
  // gate redirects away from /auth/setup. This OVERRIDES the
  // beforeEach mock (page.route uses most-recent-first dispatch).
  await mockAuth(page, { authenticated: false, requiresInitialAdmin: false });

  await page.goto('/auth/setup');

  await expect(page).toHaveURL(/\/auth\/login(\?|$)/);
  // Wizard chrome should not be on screen.
  expect(await passwordInput(page).count()).toBe(0);
});

test('"Remember me" persists the email in localStorage for the next visit', async ({ page }) => {
  await page.goto('/auth/setup');

  await emailInput(page).fill(VALID_EMAIL);
  await rememberMeCheckbox(page).check();
  await nextButton(page).click();
  await expect(passwordInput(page)).toBeVisible();

  const stored = await page.evaluate(() =>
    window.localStorage.getItem('of_setup_remember_email'),
  );
  expect(stored).toBe(VALID_EMAIL);
});
