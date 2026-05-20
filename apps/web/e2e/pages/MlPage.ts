import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/model-catalog` (legacy redirect: /ml). */
export class MlPage extends ListPagePO {
  readonly newModelButton: Locator;
  readonly frameworkFilter: Locator;
  readonly deployButton: Locator;
  readonly promoteButton: Locator;
  readonly rollbackButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newModelButton = page.getByRole('button', { name: /new model|register/i });
    this.frameworkFilter = page.getByRole('button', { name: /framework/i });
    this.deployButton = page.getByRole('button', { name: /deploy/i });
    this.promoteButton = page.getByRole('button', { name: /promote/i });
    this.rollbackButton = page.getByRole('button', { name: /rollback/i });
  }

  get path(): string {
    return '/model-catalog';
  }
}
