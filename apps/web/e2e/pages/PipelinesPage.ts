import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/pipelines`. */
export class PipelinesPage extends ListPagePO {
  readonly newPipelineButton: Locator;
  readonly allTab: Locator;
  readonly draftTab: Locator;
  readonly activeTab: Locator;
  readonly pausedTab: Locator;
  readonly archivedTab: Locator;
  readonly filterByName: Locator;
  readonly bulkArchiveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newPipelineButton = page.getByRole('button', { name: /new pipeline/i });
    this.allTab = page.getByRole('tab', { name: /^all/i });
    this.draftTab = page.getByRole('tab', { name: /draft/i });
    this.activeTab = page.getByRole('tab', { name: /^active/i });
    this.pausedTab = page.getByRole('tab', { name: /paused/i });
    this.archivedTab = page.getByRole('tab', { name: /archived/i });
    this.filterByName = page.getByLabel(/filter by name/i);
    this.bulkArchiveButton = page.getByRole('button', { name: /archive selected/i });
  }

  get path(): string {
    return '/pipelines';
  }
}
