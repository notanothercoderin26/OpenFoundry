import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for the authenticated home dashboard at `/`. */
export class HomePage extends BasePagePO {
  readonly quickSearchInput: Locator;
  readonly recentWidget: Locator;
  readonly favoritesWidget: Locator;
  readonly newDatasetShortcut: Locator;
  readonly newProjectShortcut: Locator;

  constructor(page: Page) {
    super(page);
    this.quickSearchInput = page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/search/i))
      .first();
    this.recentWidget = page.getByRole('region', { name: /recent/i });
    this.favoritesWidget = page.getByRole('region', { name: /favorites|favourites/i });
    this.newDatasetShortcut = page.getByRole('button', { name: /new dataset|create dataset/i });
    this.newProjectShortcut = page.getByRole('button', { name: /new project|create project/i });
  }

  get path(): string {
    return '/';
  }

  async quickSearch(query: string): Promise<void> {
    await this.quickSearchInput.fill(query);
  }

  /** Tile (link or button) within a named widget. */
  widgetItem(widget: 'recent' | 'favorites', name: string | RegExp): Locator {
    const region = widget === 'recent' ? this.recentWidget : this.favoritesWidget;
    return region.getByRole('link', { name });
  }
}
