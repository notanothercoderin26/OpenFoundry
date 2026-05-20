import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/code-repos`. */
export class CodeReposPage extends ListPagePO {
  readonly connectRepoButton: Locator;
  readonly branchSelect: Locator;
  readonly browseFilesButton: Locator;

  constructor(page: Page) {
    super(page);
    this.connectRepoButton = page.getByRole('button', { name: /connect|add repo/i });
    this.branchSelect = page.getByLabel(/branch/i);
    this.browseFilesButton = page.getByRole('button', { name: /browse files/i });
  }

  get path(): string {
    return '/code-repos';
  }
}
