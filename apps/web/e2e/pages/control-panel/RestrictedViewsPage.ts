import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/restricted-views`. */
export class RestrictedViewsPage extends ListPagePO {
  readonly newViewButton: Locator;
  readonly conditionInput: Locator;
  readonly rolesPicker: Locator;
  readonly testButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newViewButton = page.getByRole('button', { name: /new (restricted )?view|create/i });
    this.conditionInput = page.getByLabel(/condition|filter/i);
    this.rolesPicker = page.getByLabel(/authorized|roles/i);
    this.testButton = page.getByRole('button', { name: /^test$/i });
  }

  get path(): string {
    return '/control-panel/restricted-views';
  }
}
