import { test, expect } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { mockAuth } from './fixtures/mocks';
import { expectNoA11yViolations } from './helpers/a11y';

/**
 * E2E coverage for `/auth/register` (apps/web/src/routes/auth/RegisterPage.tsx).
 *
 * The real form has three fields — name, email, password — plus an
 * `Already have an account?` link. There is no confirm-password field
 * and no organization field; the password-confirmation case from the
 * task description is therefore skipped intentionally.
 *
 * Successful registration redirects to
 * `/auth/login?registered=true&email=<encoded>` (NOT `/auth/setup`).
 *
 * All tests run unauthenticated — call `mockAuth(page, { authenticated: false })`
 * BEFORE any `goto`.
 */

const SAMPLE_EMAIL = 'new-user@example.com';
const SAMPLE_NAME = 'Trail Runner';
// Long enough to clear the 8-char min-length rule. Random-looking suffix
// keeps an accidental leak in error messages / logs easy to grep for.
const SAMPLE_PASSWORD = 'CorrectHorseBatteryStaple-9X73f';

test('shows the registration form with all expected inputs', async ({ page }) => {
  await mockAuth(page, { authenticated: false });

  await page.goto('/auth/register');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Inputs are addressable via their accessible labels (Name / Email / Password).
  const nameInput = page.getByLabel(/^name$/i);
  const emailInput = page.getByLabel(/^email$/i);
  const passwordInput = page.getByLabel(/^password$/i);
  const submitButton = page.getByRole('button', { name: /create|sign up|register/i });
  const signInLink = page.getByRole('link', { name: /sign in|log in|have an account/i });

  await expect(nameInput).toBeVisible();
  await expect(nameInput).toHaveAttribute('type', 'text');
  await expect(emailInput).toBeVisible();
  await expect(emailInput).toHaveAttribute('type', 'email');
  await expect(passwordInput).toBeVisible();
  await expect(passwordInput).toHaveAttribute('type', 'password');
  await expect(submitButton).toBeVisible();
  await expect(signInLink).toBeVisible();

  // No confirm-password field on this form — verify the absence so a future
  // regression that adds one without updating this spec surfaces here.
  expect(await page.getByLabel(/confirm password/i).count()).toBe(0);

  // a11y pass on the initial render (required by the task).
  await expectNoA11yViolations(page);
});

test.describe('client-side validation', () => {
  test('blocks submission when fields are empty', async ({ page }) => {
    await mockAuth(page, { authenticated: false });
    const cap = captureRequests(page, /\/api\/v1\/auth\/register$/);
    await page.goto('/auth/register');

    // HTML5 `required` blocks Playwright's button click before the React
    // handler runs. Bypass it by submitting the form directly via
    // `requestSubmit()` after disabling native validation — that way we
    // exercise the application-level rule (each empty field renders its
    // own role="alert" message via `<div id="register-...-error">`).
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>('form');
      if (!form) throw new Error('form not found');
      form.noValidate = true;
      form.requestSubmit();
    });

    const alerts = page.getByRole('alert');
    await expect(alerts.first()).toBeVisible();
    // All three fields should have raised an error (name + email + password).
    await expect(alerts).toHaveCount(3);

    // No network call should have escaped.
    expect(cap.count()).toBe(0);
  });

  test('rejects an email without "@"', async ({ page }) => {
    await mockAuth(page, { authenticated: false });
    const cap = captureRequests(page, /\/api\/v1\/auth\/register$/);
    await page.goto('/auth/register');

    await page.getByLabel(/^name$/i).fill(SAMPLE_NAME);
    await page.getByLabel(/^email$/i).fill('not-an-email');
    await page.getByLabel(/^password$/i).fill(SAMPLE_PASSWORD);

    // Bypass HTML5 type=email native popup to exercise the React rule.
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.noValidate = true;
    });
    await page.getByRole('button', { name: /create|sign up|register/i }).click();

    // The email rule renders via role="alert" with a "validationEmailFormat" message.
    await expect(page.getByRole('alert').first()).toBeVisible();
    expect(cap.count()).toBe(0);
  });

  test('rejects a short password (<8 chars)', async ({ page }) => {
    await mockAuth(page, { authenticated: false });
    const cap = captureRequests(page, /\/api\/v1\/auth\/register$/);
    await page.goto('/auth/register');

    await page.getByLabel(/^name$/i).fill(SAMPLE_NAME);
    await page.getByLabel(/^email$/i).fill(SAMPLE_EMAIL);
    await page.getByLabel(/^password$/i).fill('short');

    // HTML5 `minlength` + `required` are both browser-enforced. noValidate
    // hands control back to the React validator so the e2e exercises the
    // application-level rule, not the user-agent's.
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.noValidate = true;
    });
    await page.getByRole('button', { name: /create|sign up|register/i }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    expect(cap.count()).toBe(0);
  });
});

test('submits the form and redirects to /auth/login on success', async ({ page }) => {
  await mockAuth(page, { authenticated: false });
  const cap = captureRequests(page, /\/api\/v1\/auth\/register$/);

  await page.route('**/api/v1/auth/register', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 201,
      json: { id: 'user-1', email: SAMPLE_EMAIL, name: SAMPLE_NAME },
    });
  });

  await page.goto('/auth/register');
  await page.getByLabel(/^name$/i).fill(SAMPLE_NAME);
  await page.getByLabel(/^email$/i).fill(SAMPLE_EMAIL);
  await page.getByLabel(/^password$/i).fill(SAMPLE_PASSWORD);
  await page.getByRole('button', { name: /create|sign up|register/i }).click();

  await expect(page).toHaveURL(/\/auth\/login\?.*registered=true.*/);
  await expect(page).toHaveURL(new RegExp(`email=${encodeURIComponent(SAMPLE_EMAIL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  // The POST body matches the documented RegisterRequest shape.
  await expect.poll(() => cap.count()).toBe(1);
  const body = cap.last()?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    name: SAMPLE_NAME,
    email: SAMPLE_EMAIL,
    password: SAMPLE_PASSWORD,
  });
  // Nothing else should be smuggled in.
  expect(Object.keys(body ?? {}).sort()).toEqual(['email', 'name', 'password']);
});

test('shows the API error when the email is already registered (409)', async ({ page }) => {
  await mockAuth(page, { authenticated: false });

  // The api client's extractMessage() prefers the `error` field over
  // `message` — we mirror that so the banner contains the server-supplied
  // string verbatim.
  const conflictMessage = 'Email already registered';
  await page.route('**/api/v1/auth/register', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 409,
      json: { error: conflictMessage },
    });
  });

  await page.goto('/auth/register');
  await page.getByLabel(/^name$/i).fill(SAMPLE_NAME);
  await page.getByLabel(/^email$/i).fill(SAMPLE_EMAIL);
  await page.getByLabel(/^password$/i).fill(SAMPLE_PASSWORD);
  await page.getByRole('button', { name: /create|sign up|register/i }).click();

  await expect(
    page.locator('.of-status-danger').filter({ hasText: new RegExp(conflictMessage, 'i') }),
  ).toBeVisible();

  // Stay on /auth/register so the user can correct the email.
  await expect(page).toHaveURL(/\/auth\/register/);
});

test('shows a banner on 5xx and keeps the form editable', async ({ page }) => {
  await mockAuth(page, { authenticated: false });

  await page.route('**/api/v1/auth/register', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 500,
      json: { error: 'internal_error', message: 'Something went wrong' },
    });
  });

  await page.goto('/auth/register');
  await page.getByLabel(/^name$/i).fill(SAMPLE_NAME);
  await page.getByLabel(/^email$/i).fill(SAMPLE_EMAIL);
  await page.getByLabel(/^password$/i).fill(SAMPLE_PASSWORD);
  await page.getByRole('button', { name: /create|sign up|register/i }).click();

  // Banner visible.
  await expect(page.locator('.of-status-danger')).toBeVisible();

  // Form still editable — inputs are not stuck `disabled` after the
  // failed submission (the component flips loading back to false in
  // the finally branch).
  const nameInput = page.getByLabel(/^name$/i);
  const emailInput = page.getByLabel(/^email$/i);
  const passwordInput = page.getByLabel(/^password$/i);

  await expect(nameInput).toBeEnabled();
  await expect(emailInput).toBeEnabled();
  await expect(passwordInput).toBeEnabled();

  // The user can correct a field and the input updates without remount.
  await nameInput.fill('Edited Name');
  await expect(nameInput).toHaveValue('Edited Name');
});

test('the "Sign in" link navigates to /auth/login', async ({ page }) => {
  await mockAuth(page, { authenticated: false });
  await page.goto('/auth/register');

  const signInLink = page.getByRole('link', { name: /sign in|log in|have an account/i });
  await expect(signInLink).toHaveAttribute('href', /\/auth\/login/);

  await signInLink.click();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('keyboard tab order: name → email → password → submit', async ({ page }) => {
  await mockAuth(page, { authenticated: false });
  await page.goto('/auth/register');

  // Focus the name field as the first form interactor.
  const nameInput = page.getByLabel(/^name$/i);
  await nameInput.focus();
  await expect(nameInput).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel(/^email$/i)).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel(/^password$/i)).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /create|sign up|register/i })).toBeFocused();
});

test('password never appears in console output (info/warn/error/log)', async ({ page }) => {
  await mockAuth(page, { authenticated: false });

  // Capture EVERY console message, not just errors (the global pageErrors
  // fixture only watches `console.error`). Then assert the secret never
  // appears verbatim.
  const consoleMessages: string[] = [];
  page.on('console', (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Pageerror payloads sometimes carry submitted values back; cover both.
  const pageErrorTexts: string[] = [];
  page.on('pageerror', (err) => pageErrorTexts.push(err.stack ?? err.message));

  await page.route('**/api/v1/auth/register', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    // Reflect with a 500 so the error path runs too — both the success
    // and failure flows must keep the password out of any log surface.
    await route.fulfill({
      status: 500,
      json: { error: 'internal_error', message: 'Something went wrong' },
    });
  });

  await page.goto('/auth/register');
  await page.getByLabel(/^name$/i).fill(SAMPLE_NAME);
  await page.getByLabel(/^email$/i).fill(SAMPLE_EMAIL);
  await page.getByLabel(/^password$/i).fill(SAMPLE_PASSWORD);
  await page.getByRole('button', { name: /create|sign up|register/i }).click();

  await expect(page.locator('.of-status-danger')).toBeVisible();

  const leaked = consoleMessages.filter((m) => m.includes(SAMPLE_PASSWORD));
  expect(
    leaked,
    `Password leaked into console output:\n${leaked.join('\n')}`,
  ).toEqual([]);

  const errorsWithPassword = pageErrorTexts.filter((t) => t.includes(SAMPLE_PASSWORD));
  expect(
    errorsWithPassword,
    `Password leaked into pageerror payloads:\n${errorsWithPassword.join('\n')}`,
  ).toEqual([]);
});
