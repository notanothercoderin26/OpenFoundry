import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/applications`. */
export class ApplicationsPage extends ListPagePO {
  readonly deployButton: Locator;
  readonly undeployButton: Locator;
  readonly logsButton: Locator;

  constructor(page: Page) {
    super(page);
    this.deployButton = page.getByRole('button', { name: /deploy/i });
    this.undeployButton = page.getByRole('button', { name: /undeploy/i });
    this.logsButton = page.getByRole('button', { name: /^logs$/i });
  }

  get path(): string {
    return '/applications';
  }
}
