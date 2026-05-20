import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/compute-modules` (legacy redirect: /functions). */
export class FunctionsPage extends ListPagePO {
  readonly newFunctionButton: Locator;
  readonly runtimeSelect: Locator;
  readonly deployButton: Locator;
  readonly logsButton: Locator;
  readonly testButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newFunctionButton = page.getByRole('button', { name: /new (function|module)|create/i });
    this.runtimeSelect = page.getByLabel(/runtime/i);
    this.deployButton = page.getByRole('button', { name: /deploy/i });
    this.logsButton = page.getByRole('button', { name: /^logs$/i });
    this.testButton = page.getByRole('button', { name: /^test$|run/i });
  }

  get path(): string {
    return '/compute-modules';
  }
}
