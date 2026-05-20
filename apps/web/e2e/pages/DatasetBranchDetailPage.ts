import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for a dataset branch detail at `/datasets/:id/branches/:branch`. */
export class DatasetBranchDetailPage extends DetailPagePO {
  readonly id: string;
  readonly branch: string;
  readonly promoteButton: Locator;
  readonly abandonButton: Locator;
  readonly compareDropdown: Locator;
  readonly diffPanel: Locator;

  constructor(page: Page, id: string, branch: string) {
    super(page);
    this.id = id;
    this.branch = branch;
    this.promoteButton = page.getByRole('button', { name: /promote|merge/i });
    this.abandonButton = page.getByRole('button', { name: /abandon|discard/i });
    this.compareDropdown = page.getByRole('button', { name: /compare with/i });
    this.diffPanel = page.getByRole('region', { name: /diff|changes/i });
  }

  get path(): string {
    return `/datasets/${this.id}/branches/${this.branch}`;
  }
}
