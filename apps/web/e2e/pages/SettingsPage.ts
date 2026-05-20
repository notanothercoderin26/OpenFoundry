import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object for the user/account Settings page at `/settings`
 * (sidebar label: Account).
 */
export class SettingsPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
  }

  async goto(): Promise<void> {
    await this.page.goto('/settings');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(/\/settings(\/|$|\?)/);
  }

  tab(name: string | RegExp): Locator {
    return this.page.getByRole('tab', { name });
  }
}
