import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/cipher` (secrets management). */
export class CipherPage extends ListPagePO {
  readonly newSecretButton: Locator;
  readonly rotateButton: Locator;
  readonly revealButton: Locator;
  readonly hideButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newSecretButton = page.getByRole('button', { name: /new secret|add secret/i });
    this.rotateButton = page.getByRole('button', { name: /rotate/i });
    this.revealButton = page.getByRole('button', { name: /reveal|show/i });
    this.hideButton = page.getByRole('button', { name: /^hide$/i });
  }

  get path(): string {
    return '/cipher';
  }
}
