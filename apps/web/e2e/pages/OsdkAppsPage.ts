import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/osdk-apps`. */
export class OsdkAppsPage extends ListPagePO {
  readonly generateSdkButton: Locator;
  readonly downloadButton: Locator;
  readonly newAppButton: Locator;

  constructor(page: Page) {
    super(page);
    this.generateSdkButton = page.getByRole('button', { name: /generate sdk/i });
    this.downloadButton = page.getByRole('button', { name: /download/i });
    this.newAppButton = page.getByRole('button', { name: /new app|create/i });
  }

  get path(): string {
    return '/osdk-apps';
  }
}
