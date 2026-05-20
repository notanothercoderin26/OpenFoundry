import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/notifications`. */
export class NotificationsPage extends ListPagePO {
  readonly unreadTab: Locator;
  readonly allTab: Locator;
  readonly markAllReadButton: Locator;
  readonly settingsLink: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);
    this.unreadTab = page.getByRole('tab', { name: /unread/i });
    this.allTab = page.getByRole('tab', { name: /^all/i });
    this.markAllReadButton = page.getByRole('button', { name: /mark all (as )?read/i });
    this.settingsLink = page.getByRole('link', { name: /notification settings|settings/i });
    this.emptyState = page.getByText(/no notifications|nothing to show/i);
  }

  get path(): string {
    return '/notifications';
  }

  notification(name: string | RegExp): Locator {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }

  async markAllRead(): Promise<void> {
    await this.markAllReadButton.click();
  }
}
