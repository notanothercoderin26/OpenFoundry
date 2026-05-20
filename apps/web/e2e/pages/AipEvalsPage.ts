import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/aip-evals`. */
export class AipEvalsPage extends ListPagePO {
  readonly newSuiteButton: Locator;
  readonly runButton: Locator;
  readonly compareButton: Locator;
  readonly exportButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newSuiteButton = page.getByRole('button', { name: /new (eval )?suite|create/i });
    this.runButton = page.getByRole('button', { name: /^run/i });
    this.compareButton = page.getByRole('button', { name: /compare/i });
    this.exportButton = page.getByRole('button', { name: /export/i });
  }

  get path(): string {
    return '/aip-evals';
  }
}
