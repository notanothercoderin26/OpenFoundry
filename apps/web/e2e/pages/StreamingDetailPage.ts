import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/streaming/:id`. */
export class StreamingDetailPage extends DetailPagePO {
  readonly id: string;
  readonly overviewTab: Locator;
  readonly messagesTab: Locator;
  readonly consumersTab: Locator;
  readonly schemaTab: Locator;
  readonly settingsTab: Locator;
  readonly pauseButton: Locator;
  readonly replayButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.overviewTab = page.getByRole('tab', { name: /overview/i });
    this.messagesTab = page.getByRole('tab', { name: /messages/i });
    this.consumersTab = page.getByRole('tab', { name: /consumers/i });
    this.schemaTab = page.getByRole('tab', { name: /schema/i });
    this.settingsTab = page.getByRole('tab', { name: /settings/i });
    this.pauseButton = page.getByRole('button', { name: /pause|resume/i });
    this.replayButton = page.getByRole('button', { name: /replay/i });
  }

  get path(): string {
    return `/streaming/${this.id}`;
  }
}
