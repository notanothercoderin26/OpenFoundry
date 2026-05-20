import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/data-connection/agents`. */
export class AgentsPage extends ListPagePO {
  readonly newAgentButton: Locator;
  readonly tokenDialog: Locator;
  readonly logsButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newAgentButton = page.getByRole('button', { name: /new agent|register|add agent/i });
    this.tokenDialog = page.getByRole('dialog', { name: /agent token|install/i });
    this.logsButton = page.getByRole('button', { name: /^logs$/i });
  }

  get path(): string {
    return '/data-connection/agents';
  }
}
