import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { LoginPage } from './pages/LoginPage';

test('renders the login flow entry point', async ({ page }) => {
  await mockAuth(page, { authenticated: false });

  const login = new LoginPage(page);
  await login.goto();
  await login.expectVisible();

  await expect(login.passwordInput).toBeVisible();
});
