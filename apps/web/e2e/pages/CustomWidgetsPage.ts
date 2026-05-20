import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/widgets`. */
export class CustomWidgetsPage extends ListPagePO {
  readonly newWidgetButton: Locator;
  readonly previewPanel: Locator;
  readonly publishButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newWidgetButton = page.getByRole('button', { name: /new widget|create/i });
    this.previewPanel = page.getByRole('region', { name: /preview/i });
    this.publishButton = page.getByRole('button', { name: /publish/i });
  }

  get path(): string {
    return '/widgets';
  }
}
