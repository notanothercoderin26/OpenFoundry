import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for the Projects list at `/projects`. */
export class ProjectsListPage extends ListPagePO {
  readonly newProjectButton: Locator;
  readonly sortDropdown: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newProjectButton = page.getByRole('button', { name: /new project|create project/i });
    this.sortDropdown = page.getByRole('button', { name: /sort/i });
    this.nameInput = page.getByLabel(/^name$/i);
    this.descriptionInput = page.getByLabel(/^description$/i);
    this.submitButton = page.getByRole('button', { name: /^(create|save)$/i });
    this.cancelButton = page.getByRole('button', { name: /^cancel$/i });
  }

  get path(): string {
    return '/projects';
  }

  async openNew(): Promise<void> {
    await this.newProjectButton.click();
  }

  async createProject(name: string, description?: string): Promise<void> {
    await this.openNew();
    await this.nameInput.fill(name);
    if (description) await this.descriptionInput.fill(description);
    await this.submitButton.click();
  }

  rowActionsMenu(name: string | RegExp): Locator {
    return this.row(name).getByRole('button', { name: /actions|more/i });
  }
}
