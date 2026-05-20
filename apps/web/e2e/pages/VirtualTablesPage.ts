import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/virtual-tables`. */
export class VirtualTablesPage extends ListPagePO {
  readonly newButton: Locator;
  readonly sourceFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.newButton = page.getByRole('button', { name: /new (virtual )?table|create/i });
    this.sourceFilter = page.getByRole('button', { name: /source/i });
  }

  get path(): string {
    return '/virtual-tables';
  }
}
