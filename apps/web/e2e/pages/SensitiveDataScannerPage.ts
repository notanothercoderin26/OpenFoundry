import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/sds` (Sensitive Data Scanner). */
export class SensitiveDataScannerPage extends ListPagePO {
  readonly newScanButton: Locator;
  readonly runScanButton: Locator;
  readonly falsePositiveButton: Locator;
  readonly rulesButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newScanButton = page.getByRole('button', { name: /new scan|create scan/i });
    this.runScanButton = page.getByRole('button', { name: /^run/i });
    this.falsePositiveButton = page.getByRole('button', { name: /false positive/i });
    this.rulesButton = page.getByRole('button', { name: /rules/i });
  }

  get path(): string {
    return '/sds';
  }
}
