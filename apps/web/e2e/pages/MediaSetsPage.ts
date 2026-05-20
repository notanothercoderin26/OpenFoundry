import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/media-sets`. */
export class MediaSetsPage extends ListPagePO {
  readonly newSetButton: Locator;
  readonly typeFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.newSetButton = page.getByRole('button', { name: /new (media )?set|create/i });
    this.typeFilter = page.getByRole('button', { name: /type/i });
  }

  get path(): string {
    return '/media-sets';
  }
}
