import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/scoped-sessions`. */
export class ScopedSessionsPage extends ListPagePO {
  readonly newSessionButton: Locator;
  readonly revokeButton: Locator;
  readonly userPicker: Locator;
  readonly scopeInput: Locator;
  readonly durationInput: Locator;

  constructor(page: Page) {
    super(page);
    this.newSessionButton = page.getByRole('button', { name: /new session|create/i });
    this.revokeButton = page.getByRole('button', { name: /revoke/i });
    this.userPicker = page.getByLabel(/user/i);
    this.scopeInput = page.getByLabel(/scope/i);
    this.durationInput = page.getByLabel(/duration|ttl/i);
  }

  get path(): string {
    return '/control-panel/scoped-sessions';
  }
}
