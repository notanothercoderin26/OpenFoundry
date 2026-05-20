import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/ai/chatbot-studio`. */
export class ChatbotStudioPage extends ListPagePO {
  readonly newBotButton: Locator;
  readonly systemPromptInput: Locator;
  readonly modelSelect: Locator;
  readonly toolsSelector: Locator;
  readonly playgroundInput: Locator;
  readonly publishButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newBotButton = page.getByRole('button', { name: /new bot|create bot/i });
    this.systemPromptInput = page.getByLabel(/system prompt/i);
    this.modelSelect = page.getByLabel(/^model$/i);
    this.toolsSelector = page.getByRole('group', { name: /tools|functions/i });
    this.playgroundInput = page.getByLabel(/playground|test/i);
    this.publishButton = page.getByRole('button', { name: /publish/i });
  }

  get path(): string {
    return '/ai/chatbot-studio';
  }
}
