import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object for the OpenFoundry login screen at `/auth/login`.
 *
 * Encapsulates selectors so specs read at the user-intent level. Add helpers
 * here as new behaviors land — don't sprinkle CSS / DOM details across specs.
 */
export class LoginPage {
  readonly page: Page;
  readonly logo: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logo = page.getByAltText('OpenFoundry');
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorBanner = page.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto('/auth/login');
  }

  async expectVisible(): Promise<void> {
    await expect(this.logo).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async fill(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
