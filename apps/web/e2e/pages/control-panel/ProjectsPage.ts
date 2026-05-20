import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/projects` (admin view). */
export class ProjectsPage extends ListPagePO {
  readonly transferOwnershipButton: Locator;
  readonly archiveButton: Locator;
  readonly quotasButton: Locator;

  constructor(page: Page) {
    super(page);
    this.transferOwnershipButton = page.getByRole('button', { name: /transfer ownership/i });
    this.archiveButton = page.getByRole('button', { name: /archive/i });
    this.quotasButton = page.getByRole('button', { name: /quotas|usage/i });
  }

  get path(): string {
    return '/control-panel/projects';
  }
}
