import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { LoginPage } from './pages/LoginPage';

test('renders the login flow entry point', async ({ page }) => {
  await mockAuth(page, { authenticated: false });

  const login = new LoginPage(page);
  await login.goto();
  await login.expectVisible();

  // Login is a two-step wizard (email → password). The password input
  // is only mounted after the email step submits, so walk through it
  // here to smoke the full entry flow.
  await login.emailInput.fill('user@example.com');
  await login.submitButton.click();
  await expect(login.passwordInput).toBeVisible();
});
