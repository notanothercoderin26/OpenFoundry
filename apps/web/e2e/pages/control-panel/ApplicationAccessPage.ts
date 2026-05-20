import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from '../_base';

/** Page Object for `/control-panel/application-access`. */
export class ApplicationAccessPage extends BasePagePO {
  readonly matrix: Locator;
  readonly grantButton: Locator;
  readonly revokeButton: Locator;
  readonly appFilter: Locator;
  readonly subjectFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.matrix = page.getByRole('grid', { name: /access|matrix/i });
    this.grantButton = page.getByRole('button', { name: /^grant$/i });
    this.revokeButton = page.getByRole('button', { name: /revoke/i });
    this.appFilter = page.getByRole('button', { name: /application/i });
    this.subjectFilter = page.getByRole('button', { name: /user|group|subject/i });
  }

  get path(): string {
    return '/control-panel/application-access';
  }
}
