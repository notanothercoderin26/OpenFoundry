import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/fusion`. */
export class FusionPage extends BasePagePO {
  readonly primaryButton: Locator;

  constructor(page: Page) {
    super(page);
    this.primaryButton = page.getByRole('button').first();
  }

  get path(): string {
    return '/fusion';
  }
}
