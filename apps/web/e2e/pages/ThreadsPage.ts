import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/ai/threads` (legacy redirect: /nexus). */
export class ThreadsPage extends BasePagePO {
  readonly threadList: Locator;
  readonly newThreadButton: Locator;
  readonly threadSearch: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly renameButton: Locator;
  readonly deleteButton: Locator;
  readonly shareButton: Locator;

  constructor(page: Page) {
    super(page);
    this.threadList = page.getByRole('list', { name: /threads/i });
    this.newThreadButton = page.getByRole('button', { name: /new thread/i });
    this.threadSearch = page.getByPlaceholder(/search threads/i);
    this.messageInput = page.getByRole('textbox').last();
    this.sendButton = page.getByRole('button', { name: /^send$/i });
    this.renameButton = page.getByRole('button', { name: /rename/i });
    this.deleteButton = page.getByRole('button', { name: /^delete$/i });
    this.shareButton = page.getByRole('button', { name: /^share$/i });
  }

  get path(): string {
    return '/ai/threads';
  }

  threadItem(name: string | RegExp): Locator {
    return this.threadList.getByRole('listitem').filter({ hasText: name });
  }
}
