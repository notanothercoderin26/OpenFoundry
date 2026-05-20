import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/data-connection/egress-policies`. */
export class EgressPoliciesPage extends ListPagePO {
  readonly newPolicyButton: Locator;
  readonly testButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newPolicyButton = page.getByRole('button', { name: /new policy|create policy/i });
    this.testButton = page.getByRole('button', { name: /test|dry run/i });
  }

  get path(): string {
    return '/data-connection/egress-policies';
  }
}
