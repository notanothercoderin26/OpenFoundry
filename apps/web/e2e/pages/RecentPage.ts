import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/recent`. */
export class RecentPage extends ListPagePO {
  readonly typeFilter: Locator;
  readonly clearButton: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.typeFilter = page.getByRole('group', { name: /type|filter/i });
    this.clearButton = page.getByRole('button', { name: /clear (recent|history)/i });
    this.emptyState = page.getByText(/nothing recent|no recent/i);
  }

  get path(): string {
    return '/recent';
  }

  itemByName(name: string | RegExp): Locator {
    return this.page.getByRole('link', { name });
  }
}
