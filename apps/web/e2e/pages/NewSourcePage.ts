import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/data-connection/new`. */
export class NewSourcePage extends BasePagePO {
  readonly catalogList: Locator;
  readonly testConnectionButton: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly submitButton: Locator;
  readonly nameInput: Locator;

  constructor(page: Page) {
    super(page);
    this.catalogList = page.getByRole('list', { name: /connectors|catalog/i });
    this.testConnectionButton = page.getByRole('button', { name: /test connection/i });
    this.nextButton = page.getByRole('button', { name: /^next/i });
    this.backButton = page.getByRole('button', { name: /^back/i });
    this.submitButton = page.getByRole('button', { name: /finish|create/i });
    this.nameInput = page.getByLabel(/^name$/i);
  }

  get path(): string {
    return '/data-connection/new';
  }

  connectorOption(name: string | RegExp): Locator {
    return this.catalogList.getByRole('button', { name });
  }
}
