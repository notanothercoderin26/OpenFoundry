import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/action-types`. */
export class ActionTypesPage extends ListPagePO {
  readonly newActionTypeButton: Locator;
  readonly objectTypeFilter: Locator;
  readonly testActionButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newActionTypeButton = page.getByRole('button', { name: /new action( type)?|create/i });
    this.objectTypeFilter = page.getByRole('button', { name: /object type/i });
    this.testActionButton = page.getByRole('button', { name: /test action/i });
  }

  get path(): string {
    return '/action-types';
  }
}
