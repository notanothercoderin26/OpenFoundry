import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/developers`. */
export class DevelopersPage extends BasePagePO {
  readonly apiDocsLink: Locator;
  readonly sdkDownloadsRegion: Locator;
  readonly externalDocsLinks: Locator;

  constructor(page: Page) {
    super(page);
    this.apiDocsLink = page.getByRole('link', { name: /api docs/i });
    this.sdkDownloadsRegion = page.getByRole('region', { name: /sdk|downloads/i });
    this.externalDocsLinks = page.getByRole('link', { name: /docs|guide/i });
  }

  get path(): string {
    return '/developers';
  }
}
