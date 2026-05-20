import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/ai` (AI hub). */
export class AiPage extends BasePagePO {
  readonly assistLink: Locator;
  readonly analystLink: Locator;
  readonly threadsLink: Locator;
  readonly documentsLink: Locator;
  readonly chatbotStudioLink: Locator;
  readonly operatorLink: Locator;

  constructor(page: Page) {
    super(page);
    this.assistLink = page.getByRole('link', { name: /assist/i });
    this.analystLink = page.getByRole('link', { name: /analyst/i });
    this.threadsLink = page.getByRole('link', { name: /threads/i });
    this.documentsLink = page.getByRole('link', { name: /documents/i });
    this.chatbotStudioLink = page.getByRole('link', { name: /chatbot studio/i });
    this.operatorLink = page.getByRole('link', { name: /operator/i });
  }

  get path(): string {
    return '/ai';
  }
}
