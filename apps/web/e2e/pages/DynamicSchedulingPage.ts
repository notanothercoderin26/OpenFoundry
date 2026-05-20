import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/dynamic-scheduling`. */
export class DynamicSchedulingPage extends BasePagePO {
  readonly newPolicyButton: Locator;
  readonly previewButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newPolicyButton = page.getByRole('button', { name: /new policy|create/i });
    this.previewButton = page.getByRole('button', { name: /preview|simulate/i });
  }

  get path(): string {
    return '/dynamic-scheduling';
  }
}
