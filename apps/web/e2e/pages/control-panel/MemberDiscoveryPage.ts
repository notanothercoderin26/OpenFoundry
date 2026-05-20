import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from '../_base';

/** Page Object for `/control-panel/member-discovery`. */
export class MemberDiscoveryPage extends BasePagePO {
  readonly testSyncButton: Locator;
  readonly manualSyncButton: Locator;
  readonly mappingsRegion: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.testSyncButton = page.getByRole('button', { name: /test sync/i });
    this.manualSyncButton = page.getByRole('button', { name: /sync now/i });
    this.mappingsRegion = page.getByRole('region', { name: /mappings/i });
    this.saveButton = page.getByRole('button', { name: /^save$/i });
  }

  get path(): string {
    return '/control-panel/member-discovery';
  }
}
