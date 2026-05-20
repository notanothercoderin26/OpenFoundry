import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/data-connection`. */
export class DataConnectionPage extends ListPagePO {
  readonly newSourceButton: Locator;
  readonly typeFilter: Locator;
  readonly syncNowButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newSourceButton = page.getByRole('button', { name: /new source|new connection/i });
    this.typeFilter = page.getByRole('button', { name: /type/i });
    this.syncNowButton = page.getByRole('button', { name: /sync now/i });
  }

  get path(): string {
    return '/data-connection';
  }
}
