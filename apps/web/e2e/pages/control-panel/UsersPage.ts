import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/users`. */
export class UsersPage extends ListPagePO {
  readonly inviteUserButton: Locator;
  readonly roleFilter: Locator;
  readonly statusFilter: Locator;
  readonly bulkSuspendButton: Locator;
  readonly exportButton: Locator;
  readonly emailInput: Locator;
  readonly roleSelect: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.inviteUserButton = page.getByRole('button', { name: /invite|add user/i });
    this.roleFilter = page.getByRole('button', { name: /^role$/i });
    this.statusFilter = page.getByRole('button', { name: /status/i });
    this.bulkSuspendButton = page.getByRole('button', { name: /suspend selected/i });
    this.exportButton = page.getByRole('button', { name: /export/i });
    this.emailInput = page.getByLabel(/email/i);
    this.roleSelect = page.getByLabel(/^role$/i);
    this.submitButton = page.getByRole('button', { name: /^invite$|^send$/i });
  }

  get path(): string {
    return '/control-panel/users';
  }

  async inviteUser(email: string, role: string): Promise<void> {
    await this.inviteUserButton.click();
    await this.emailInput.fill(email);
    await this.roleSelect.click();
    await this.page.getByRole('option', { name: role }).click();
    await this.submitButton.click();
  }
}
