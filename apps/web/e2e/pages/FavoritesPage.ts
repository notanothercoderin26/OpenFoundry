import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/favorites`. */
export class FavoritesPage extends ListPagePO {
  readonly typeFilter: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.typeFilter = page.getByRole('group', { name: /type|filter/i });
    this.emptyState = page.getByText(/no favorites|nothing favorited/i);
  }

  get path(): string {
    return '/favorites';
  }

  unfavoriteButton(name: string | RegExp): Locator {
    return this.row(name).getByRole('button', { name: /remove favorite|unfavorite|★/i });
  }
}
