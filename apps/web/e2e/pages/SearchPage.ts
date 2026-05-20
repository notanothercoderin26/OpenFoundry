import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for global search at `/search`. */
export class SearchPage extends BasePagePO {
  readonly searchInput: Locator;
  readonly resultsList: Locator;
  readonly typeFilter: Locator;
  readonly emptyState: Locator;
  readonly loadMoreButton: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/search/i))
      .first();
    this.resultsList = page.getByRole('list', { name: /results/i });
    this.typeFilter = page.getByRole('group', { name: /filter|type/i });
    this.emptyState = page.getByText(/no results|nothing found/i);
    this.loadMoreButton = page.getByRole('button', { name: /load more|next/i });
  }

  get path(): string {
    return '/search';
  }

  async searchFor(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  filterChip(label: string | RegExp): Locator {
    return this.typeFilter.getByRole('button', { name: label });
  }

  result(name: string | RegExp): Locator {
    return this.resultsList.getByRole('link', { name });
  }
}
