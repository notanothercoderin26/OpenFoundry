import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from '../_base';

/** Page Object for `/control-panel/identity-providers`. */
export class IdentityProvidersPage extends ListPagePO {
  readonly newProviderButton: Locator;
  readonly testConnectionButton: Locator;
  readonly jitToggle: Locator;
  readonly groupMappingsButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newProviderButton = page.getByRole('button', { name: /new provider|add (idp|provider)/i });
    this.testConnectionButton = page.getByRole('button', { name: /test connection/i });
    this.jitToggle = page.getByRole('switch', { name: /jit|just-in-time/i });
    this.groupMappingsButton = page.getByRole('button', { name: /group mapping/i });
  }

  get path(): string {
    return '/control-panel/identity-providers';
  }
}
