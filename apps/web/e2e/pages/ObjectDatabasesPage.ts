import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/object-databases`. */
export class ObjectDatabasesPage extends ListPagePO {
  readonly newButton: Locator;
  readonly testConnectionButton: Locator;
  readonly statusBadge: Locator;

  constructor(page: Page) {
    super(page);
    this.newButton = page.getByRole('button', { name: /new database|create/i });
    this.testConnectionButton = page.getByRole('button', { name: /test connection/i });
    this.statusBadge = page.getByRole('status').filter({ hasText: /connected|disconnected/i });
  }

  get path(): string {
    return '/object-databases';
  }
}
