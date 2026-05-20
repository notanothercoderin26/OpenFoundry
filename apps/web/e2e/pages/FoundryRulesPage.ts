import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/foundry-rules` (legacy redirects: /workflows, /automate). */
export class FoundryRulesPage extends ListPagePO {
  readonly newRuleButton: Locator;
  readonly enableToggle: Locator;
  readonly testRuleButton: Locator;
  readonly historyTab: Locator;

  constructor(page: Page) {
    super(page);
    this.newRuleButton = page.getByRole('button', { name: /new rule|create rule/i });
    this.enableToggle = page.getByRole('switch', { name: /enabled|active/i });
    this.testRuleButton = page.getByRole('button', { name: /dry run|test/i });
    this.historyTab = page.getByRole('tab', { name: /history|runs/i });
  }

  get path(): string {
    return '/foundry-rules';
  }
}
