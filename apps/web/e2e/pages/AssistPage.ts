import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/ai/assist`. */
export class AssistPage extends BasePagePO {
  readonly promptInput: Locator;
  readonly sendButton: Locator;
  readonly stopButton: Locator;
  readonly newChatButton: Locator;
  readonly attachContextButton: Locator;
  readonly messagesRegion: Locator;

  constructor(page: Page) {
    super(page);
    this.promptInput = page
      .getByLabel(/assist prompt|message|prompt/i)
      .or(page.getByRole('textbox'))
      .first();
    this.sendButton = page.getByRole('button', { name: /^send$|submit/i });
    this.stopButton = page.getByRole('button', { name: /^stop$|cancel/i });
    this.newChatButton = page.getByRole('button', { name: /new chat/i });
    this.attachContextButton = page.getByRole('button', { name: /attach|add context/i });
    this.messagesRegion = page.getByRole('log').or(page.getByRole('region', { name: /messages|chat/i })).first();
  }

  get path(): string {
    return '/ai/assist';
  }

  async send(prompt: string): Promise<void> {
    await this.promptInput.fill(prompt);
    await this.sendButton.click();
  }
}
