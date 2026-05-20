import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/interfaces`. */
export class InterfacesPage extends ListPagePO {
  readonly newInterfaceButton: Locator;
  readonly assignTypeButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newInterfaceButton = page.getByRole('button', { name: /new interface|create/i });
    this.assignTypeButton = page.getByRole('button', { name: /assign type|add type/i });
  }

  get path(): string {
    return '/interfaces';
  }
}
