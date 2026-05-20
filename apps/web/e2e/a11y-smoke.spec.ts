import { test, expect } from './fixtures/base';
import { mockAuth } from './fixtures/mocks';
import { expectNoA11yViolations } from './helpers/a11y';
import { LoginPage } from './pages/LoginPage';

/**
 * Accessibility smoke tests. Keeps us honest about WCAG 2.1 AA on the
 * shells & entry points users hit before any data is loaded. Per-feature
 * specs can call `expectNoA11yViolations` directly when they want to scan
 * a specific state.
 */

test.describe('a11y smoke', () => {
  test('login page has no WCAG violations', async ({ page }) => {
    await mockAuth(page, { authenticated: false });

    const login = new LoginPage(page);
    await login.goto();
    await login.expectVisible();

    await expectNoA11yViolations(page);
  });

  test('setup page has no WCAG violations', async ({ page }) => {
    await mockAuth(page, { authenticated: false, requiresInitialAdmin: true });

    await page.goto('/auth/setup');
    await expect(page).toHaveURL(/\/auth\/setup/);

    await expectNoA11yViolations(page);
  });
});
