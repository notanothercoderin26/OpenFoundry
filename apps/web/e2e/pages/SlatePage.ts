import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/slate` (legacy redirect: /reports). */
export class SlatePage extends ListPagePO {
  readonly newReportButton: Locator;
  readonly insertBlockButton: Locator;
  readonly publishButton: Locator;
  readonly shareButton: Locator;
  readonly editor: Locator;

  constructor(page: Page) {
    super(page);
    this.newReportButton = page.getByRole('button', { name: /new report|new post|create/i });
    this.insertBlockButton = page.getByRole('button', { name: /insert/i });
    this.publishButton = page.getByRole('button', { name: /publish/i });
    this.shareButton = page.getByRole('button', { name: /^share$/i });
    this.editor = page.getByRole('textbox', { name: /editor|body/i });
  }

  get path(): string {
    return '/slate';
  }
}
