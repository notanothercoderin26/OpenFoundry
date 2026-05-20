import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object for the authenticated `AppShell` chrome (sidebar + topbar).
 *
 * Use this from any spec that exercises the logged-in app surface — it
 * encapsulates the primary nav items so specs don't drift when the menu
 * changes shape.
 */
export class AppShellPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly logo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.getByRole('navigation', { name: 'Primary navigation' });
    this.logo = page.getByRole('link', { name: 'OpenFoundry home' });
  }

  navLink(name: string | RegExp): Locator {
    return this.page.getByRole('link', { name }).first();
  }

  async goto(path: string = '/'): Promise<void> {
    await this.page.goto(path);
  }

  async navigateTo(label: string, expectedUrl: RegExp): Promise<void> {
    await this.navLink(label).click();
    await expect(this.page).toHaveURL(expectedUrl);
  }

  async expectSidebarVisible(): Promise<void> {
    await expect(this.sidebar).toBeVisible();
  }
}
