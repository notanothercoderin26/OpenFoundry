import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/object-views`. */
export class ObjectViewsPage extends ListPagePO {
  readonly newViewButton: Locator;
  readonly duplicateButton: Locator;
  readonly publicToggle: Locator;

  constructor(page: Page) {
    super(page);
    this.newViewButton = page.getByRole('button', { name: /new view|create view/i });
    this.duplicateButton = page.getByRole('button', { name: /duplicate/i });
    this.publicToggle = page.getByRole('switch', { name: /public/i });
  }

  get path(): string {
    return '/object-views';
  }
}
