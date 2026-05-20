import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for the Datasets list at `/datasets`. */
export class DatasetsListPage extends ListPagePO {
  readonly uploadButton: Locator;
  readonly searchDatasets: Locator;
  readonly ownerFilter: Locator;
  readonly formatFilter: Locator;
  readonly tagFilter: Locator;
  readonly bulkDeleteButton: Locator;

  constructor(page: Page) {
    super(page);
    this.uploadButton = page.getByRole('button', { name: /upload|new dataset/i });
    this.searchDatasets = page.getByLabel(/search datasets/i);
    this.ownerFilter = page.getByRole('button', { name: /owner/i });
    this.formatFilter = page.getByRole('button', { name: /format/i });
    this.tagFilter = page.getByRole('button', { name: /tag/i });
    this.bulkDeleteButton = page.getByRole('button', { name: /delete selected/i });
  }

  get path(): string {
    return '/datasets';
  }

  async openUpload(): Promise<void> {
    await this.uploadButton.click();
  }
}
