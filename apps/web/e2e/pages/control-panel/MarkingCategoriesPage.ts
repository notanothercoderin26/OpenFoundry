import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/marking-categories`. */
export class MarkingCategoriesPage extends ListPagePO {
  readonly newCategoryButton: Locator;
  readonly colorPicker: Locator;
  readonly addMarkingButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newCategoryButton = page.getByRole('button', { name: /new category|create/i });
    this.colorPicker = page.getByLabel(/color/i);
    this.addMarkingButton = page.getByRole('button', { name: /add marking/i });
  }

  get path(): string {
    return '/control-panel/marking-categories';
  }
}
