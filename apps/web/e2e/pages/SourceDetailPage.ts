import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/data-connection/sources/:id`. */
export class SourceDetailPage extends DetailPagePO {
  readonly id: string;
  readonly overviewTab: Locator;
  readonly tablesTab: Locator;
  readonly syncHistoryTab: Locator;
  readonly schemaTab: Locator;
  readonly settingsTab: Locator;
  readonly syncNowButton: Locator;
  readonly pauseButton: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.overviewTab = page.getByRole('tab', { name: /overview/i });
    this.tablesTab = page.getByRole('tab', { name: /tables/i });
    this.syncHistoryTab = page.getByRole('tab', { name: /sync history|history/i });
    this.schemaTab = page.getByRole('tab', { name: /schema/i });
    this.settingsTab = page.getByRole('tab', { name: /settings/i });
    this.syncNowButton = page.getByRole('button', { name: /sync now/i });
    this.pauseButton = page.getByRole('button', { name: /pause|resume/i });
    this.deleteButton = page.getByRole('button', { name: /^delete$/i });
  }

  get path(): string {
    return `/data-connection/sources/${this.id}`;
  }
}
