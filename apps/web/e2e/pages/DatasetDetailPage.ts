import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for a dataset detail at `/datasets/:id`. */
export class DatasetDetailPage extends DetailPagePO {
  readonly id: string;
  readonly previewTab: Locator;
  readonly schemaTab: Locator;
  readonly branchesTab: Locator;
  readonly transactionsTab: Locator;
  readonly permissionsTab: Locator;
  readonly settingsTab: Locator;
  readonly downloadButton: Locator;
  readonly versionDropdown: Locator;
  readonly previewTable: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.previewTab = page.getByRole('tab', { name: /preview|data/i });
    this.schemaTab = page.getByRole('tab', { name: /schema/i });
    this.branchesTab = page.getByRole('tab', { name: /branches/i });
    this.transactionsTab = page.getByRole('tab', { name: /transactions|history/i });
    this.permissionsTab = page.getByRole('tab', { name: /permissions/i });
    this.settingsTab = page.getByRole('tab', { name: /^settings$/i });
    this.downloadButton = page.getByRole('button', { name: /download|export/i });
    this.versionDropdown = page.getByRole('button', { name: /version|transaction/i });
    this.previewTable = page.getByRole('table', { name: /preview|data/i }).or(page.getByRole('table')).first();
  }

  get path(): string {
    return `/datasets/${this.id}`;
  }
}
