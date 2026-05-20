import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/iceberg-tables`. */
export class IcebergTablesPage extends ListPagePO {
  readonly newButton: Locator;
  readonly namespaceFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.newButton = page.getByRole('button', { name: /new (iceberg )?table|create/i });
    this.namespaceFilter = page.getByRole('button', { name: /namespace/i });
  }

  get path(): string {
    return '/iceberg-tables';
  }
}
