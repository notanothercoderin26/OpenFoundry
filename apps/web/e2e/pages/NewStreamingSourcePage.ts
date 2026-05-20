import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/data-connection/new/streaming`. */
export class NewStreamingSourcePage extends BasePagePO {
  readonly catalogList: Locator;
  readonly testConsumerButton: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly submitButton: Locator;
  readonly nameInput: Locator;

  constructor(page: Page) {
    super(page);
    this.catalogList = page.getByRole('list', { name: /streaming|catalog/i });
    this.testConsumerButton = page.getByRole('button', { name: /test consumer|test connection/i });
    this.nextButton = page.getByRole('button', { name: /^next/i });
    this.backButton = page.getByRole('button', { name: /^back/i });
    this.submitButton = page.getByRole('button', { name: /finish|create/i });
    this.nameInput = page.getByLabel(/^name$/i);
  }

  get path(): string {
    return '/data-connection/new/streaming';
  }
}
