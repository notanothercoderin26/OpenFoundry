import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/notebooks`. */
export class NotebooksListPage extends ListPagePO {
  readonly newNotebookButton: Locator;
  readonly kernelFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.newNotebookButton = page.getByRole('button', { name: /new notebook|create/i });
    this.kernelFilter = page.getByRole('button', { name: /kernel|runtime/i });
  }

  get path(): string {
    return '/notebooks';
  }
}
