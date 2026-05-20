import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/machinery`. */
export class MachineryPage extends ListPagePO {
  readonly newMachineButton: Locator;
  readonly triggerButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newMachineButton = page.getByRole('button', { name: /new|create/i });
    this.triggerButton = page.getByRole('button', { name: /trigger|fire/i });
  }

  get path(): string {
    return '/machinery';
  }
}
