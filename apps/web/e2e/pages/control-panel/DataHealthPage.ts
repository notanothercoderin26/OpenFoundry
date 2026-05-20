import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from '../_base';

/** Page Object for `/control-panel/data-health`. */
export class DataHealthPage extends BasePagePO {
  readonly checksRegion: Locator;
  readonly remediateButton: Locator;
  readonly configureButton: Locator;
  readonly thresholdsButton: Locator;

  constructor(page: Page) {
    super(page);
    this.checksRegion = page.getByRole('region', { name: /checks|health/i });
    this.remediateButton = page.getByRole('button', { name: /remediate|fix/i });
    this.configureButton = page.getByRole('button', { name: /configure/i });
    this.thresholdsButton = page.getByRole('button', { name: /thresholds/i });
  }

  get path(): string {
    return '/control-panel/data-health';
  }

  checkCard(name: string | RegExp): Locator {
    return this.checksRegion.getByRole('article').filter({ hasText: name });
  }
}
