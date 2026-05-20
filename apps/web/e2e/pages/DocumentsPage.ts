import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/ai/documents`. */
export class DocumentsPage extends ListPagePO {
  readonly uploadButton: Locator;
  readonly fileInput: Locator;
  readonly reindexButton: Locator;
  readonly previewDrawer: Locator;
  readonly semanticSearch: Locator;

  constructor(page: Page) {
    super(page);
    this.uploadButton = page.getByRole('button', { name: /upload/i });
    this.fileInput = page.locator('input[type="file"]');
    this.reindexButton = page.getByRole('button', { name: /reindex/i });
    this.previewDrawer = page.getByRole('complementary', { name: /preview|document/i });
    this.semanticSearch = page.getByLabel(/semantic search|ask/i);
  }

  get path(): string {
    return '/ai/documents';
  }
}
