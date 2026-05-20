import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/build-schedules`. */
export class BuildSchedulesPage extends ListPagePO {
  readonly newButton: Locator;
  readonly sweepLink: Locator;

  constructor(page: Page) {
    super(page);
    this.newButton = page.getByRole('button', { name: /new schedule|create/i });
    this.sweepLink = page.getByRole('link', { name: /sweep/i });
  }

  get path(): string {
    return '/build-schedules';
  }
}
