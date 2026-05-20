import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/build-schedules/sweep`. */
export class SweepPage extends BasePagePO {
  readonly scheduleSelector: Locator;
  readonly bulkActionDropdown: Locator;
  readonly dryRunButton: Locator;
  readonly applyButton: Locator;
  readonly previewPanel: Locator;

  constructor(page: Page) {
    super(page);
    this.scheduleSelector = page.getByRole('group', { name: /schedules|select/i });
    this.bulkActionDropdown = page.getByRole('button', { name: /action|operation/i });
    this.dryRunButton = page.getByRole('button', { name: /dry run|preview/i });
    this.applyButton = page.getByRole('button', { name: /apply|run sweep/i });
    this.previewPanel = page.getByRole('region', { name: /preview|impact/i });
  }

  get path(): string {
    return '/build-schedules/sweep';
  }
}
