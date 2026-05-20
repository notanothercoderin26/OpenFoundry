import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from '../_base';

/** Page Object for `/control-panel/tenancy`. */
export class TenancyPage extends BasePagePO {
  readonly nameInput: Locator;
  readonly logoInput: Locator;
  readonly domainsList: Locator;
  readonly quotasRegion: Locator;
  readonly regionPicker: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.getByLabel(/instance name|name/i);
    this.logoInput = page.locator('input[type="file"]');
    this.domainsList = page.getByRole('list', { name: /domains/i });
    this.quotasRegion = page.getByRole('region', { name: /quota/i });
    this.regionPicker = page.getByLabel(/region|residency/i);
    this.saveButton = page.getByRole('button', { name: /^save$/i });
  }

  get path(): string {
    return '/control-panel/tenancy';
  }
}
