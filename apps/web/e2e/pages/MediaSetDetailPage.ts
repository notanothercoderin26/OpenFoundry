import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/media-sets/:rid`. */
export class MediaSetDetailPage extends DetailPagePO {
  readonly rid: string;
  readonly uploadButton: Locator;
  readonly fileInput: Locator;
  readonly gallery: Locator;
  readonly bulkSelectToggle: Locator;
  readonly deleteSelectedButton: Locator;

  constructor(page: Page, rid: string) {
    super(page);
    this.rid = rid;
    this.uploadButton = page.getByRole('button', { name: /upload/i });
    this.fileInput = page.locator('input[type="file"]');
    this.gallery = page.getByRole('list', { name: /gallery|media/i });
    this.bulkSelectToggle = page.getByRole('button', { name: /select|bulk/i });
    this.deleteSelectedButton = page.getByRole('button', { name: /delete selected/i });
  }

  get path(): string {
    return `/media-sets/${this.rid}`;
  }
}
