import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/groups`. */
export class GroupsPage extends ListPagePO {
  readonly newGroupButton: Locator;
  readonly addMemberButton: Locator;
  readonly removeMemberButton: Locator;
  readonly permissionsTab: Locator;

  constructor(page: Page) {
    super(page);
    this.newGroupButton = page.getByRole('button', { name: /new group|create/i });
    this.addMemberButton = page.getByRole('button', { name: /add member/i });
    this.removeMemberButton = page.getByRole('button', { name: /remove member/i });
    this.permissionsTab = page.getByRole('tab', { name: /permissions/i });
  }

  get path(): string {
    return '/control-panel/groups';
  }
}
