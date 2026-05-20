import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/custom-endpoints`. */
export class CustomEndpointsPage extends ListPagePO {
  readonly newEndpointButton: Locator;
  readonly pathInput: Locator;
  readonly methodSelect: Locator;
  readonly testButton: Locator;
  readonly curlPreview: Locator;

  constructor(page: Page) {
    super(page);
    this.newEndpointButton = page.getByRole('button', { name: /new endpoint|create/i });
    this.pathInput = page.getByLabel(/^path$/i);
    this.methodSelect = page.getByLabel(/^method$/i);
    this.testButton = page.getByRole('button', { name: /^test$/i });
    this.curlPreview = page.getByRole('region', { name: /curl|preview/i });
  }

  get path(): string {
    return '/custom-endpoints';
  }
}
