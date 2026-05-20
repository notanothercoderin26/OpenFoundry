import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object for the Projects list at `/projects` (sidebar label: Files).
 */
export class ProjectsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newProjectButton: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.newProjectButton = page.getByRole('button', { name: /new project/i });
    this.searchInput = page.getByPlaceholder(/search/i);
  }

  async goto(): Promise<void> {
    await this.page.goto('/projects');
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(/\/projects(\/|$|\?)/);
  }

  projectRow(name: string | RegExp): Locator {
    return this.page.getByRole('row', { name });
  }
}
