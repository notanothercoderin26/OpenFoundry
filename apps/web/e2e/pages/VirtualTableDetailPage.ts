import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/virtual-tables/:rid`. */
export class VirtualTableDetailPage extends DetailPagePO {
  readonly rid: string;
  readonly editQueryTab: Locator;
  readonly previewTab: Locator;
  readonly scheduleTab: Locator;
  readonly validateButton: Locator;
  readonly saveButton: Locator;
  readonly viewLineageLink: Locator;

  constructor(page: Page, rid: string) {
    super(page);
    this.rid = rid;
    this.editQueryTab = page.getByRole('tab', { name: /query|sql/i });
    this.previewTab = page.getByRole('tab', { name: /preview|data/i });
    this.scheduleTab = page.getByRole('tab', { name: /schedule|refresh/i });
    this.validateButton = page.getByRole('button', { name: /validate/i });
    this.saveButton = page.getByRole('button', { name: /^save$/i });
    this.viewLineageLink = page.getByRole('link', { name: /lineage/i });
  }

  get path(): string {
    return `/virtual-tables/${this.rid}`;
  }
}
