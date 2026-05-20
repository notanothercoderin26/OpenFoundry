import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/streaming`. */
export class StreamingPage extends ListPagePO {
  readonly newStreamButton: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.newStreamButton = page.getByRole('button', { name: /new stream|create/i });
    this.statusFilter = page.getByRole('button', { name: /status/i });
  }

  get path(): string {
    return '/streaming';
  }
}
