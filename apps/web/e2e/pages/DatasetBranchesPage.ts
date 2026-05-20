import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for dataset branches at `/datasets/:id/branches`. */
export class DatasetBranchesPage extends DetailPagePO {
  readonly id: string;
  readonly newBranchButton: Locator;
  readonly statusFilter: Locator;
  readonly mergeButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.newBranchButton = page.getByRole('button', { name: /new branch|create branch/i });
    this.statusFilter = page.getByRole('button', { name: /status/i });
    this.mergeButton = page.getByRole('button', { name: /merge to main|merge/i });
  }

  get path(): string {
    return `/datasets/${this.id}/branches`;
  }

  branchRow(name: string | RegExp): Locator {
    return this.page.getByRole('row', { name });
  }
}
