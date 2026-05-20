import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/third-party-applications`. */
export class ThirdPartyApplicationsPage extends ListPagePO {
  readonly newClientButton: Locator;
  readonly rotateSecretButton: Locator;
  readonly revokeButton: Locator;
  readonly redirectUrisInput: Locator;
  readonly scopesPicker: Locator;

  constructor(page: Page) {
    super(page);
    this.newClientButton = page.getByRole('button', { name: /new (client|app)|create/i });
    this.rotateSecretButton = page.getByRole('button', { name: /rotate (secret)?/i });
    this.revokeButton = page.getByRole('button', { name: /revoke/i });
    this.redirectUrisInput = page.getByLabel(/redirect ur(i|l)s?/i);
    this.scopesPicker = page.getByLabel(/scopes/i);
  }

  get path(): string {
    return '/control-panel/third-party-applications';
  }
}
