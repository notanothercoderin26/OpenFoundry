import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/apps`. */
export class AppsPage extends ListPagePO {
  readonly newAppButton: Locator;
  readonly duplicateButton: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.newAppButton = page.getByRole('button', { name: /new app|create app/i });
    this.duplicateButton = page.getByRole('button', { name: /duplicate/i });
    this.statusFilter = page.getByRole('button', { name: /status|state/i });
  }

  get path(): string {
    return '/apps';
  }
}
