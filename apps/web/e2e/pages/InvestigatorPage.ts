import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/insight` (Investigator). */
export class InvestigatorPage extends BasePagePO {
  readonly searchInput: Locator;
  readonly resultsList: Locator;
  readonly detailDrawer: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first();
    this.resultsList = page.getByRole('list', { name: /results/i });
    this.detailDrawer = page.getByRole('complementary', { name: /detail/i });
  }

  get path(): string {
    return '/insight';
  }
}
