import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/builds`. */
export class BuildsPage extends ListPagePO {
  readonly statusFilter: Locator;
  readonly pipelineFilter: Locator;
  readonly dateRangePicker: Locator;

  constructor(page: Page) {
    super(page);
    this.statusFilter = page.getByRole('button', { name: /status/i });
    this.pipelineFilter = page.getByRole('button', { name: /pipeline/i });
    this.dateRangePicker = page.getByRole('button', { name: /date|range/i });
  }

  get path(): string {
    return '/builds';
  }
}
