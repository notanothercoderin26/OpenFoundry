import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/role-sets`. */
export class RoleSetsPage extends ListPagePO {
  readonly newRoleSetButton: Locator;
  readonly permissionsMatrix: Locator;
  readonly assignButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newRoleSetButton = page.getByRole('button', { name: /new role set|create/i });
    this.permissionsMatrix = page.getByRole('grid', { name: /permissions/i });
    this.assignButton = page.getByRole('button', { name: /assign/i });
  }

  get path(): string {
    return '/control-panel/role-sets';
  }
}
