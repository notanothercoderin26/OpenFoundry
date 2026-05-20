import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/retention-policies` (admin scope). */
export class RetentionPoliciesPage extends ListPagePO {
  readonly newPolicyButton: Locator;
  readonly pauseButton: Locator;
  readonly historyButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newPolicyButton = page.getByRole('button', { name: /new policy|create/i });
    this.pauseButton = page.getByRole('button', { name: /pause|resume/i });
    this.historyButton = page.getByRole('button', { name: /history/i });
  }

  get path(): string {
    return '/control-panel/retention-policies';
  }
}
