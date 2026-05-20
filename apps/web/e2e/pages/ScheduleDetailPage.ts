import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/schedules/:rid`. */
export class ScheduleDetailPage extends DetailPagePO {
  readonly rid: string;
  readonly pauseButton: Locator;
  readonly resumeButton: Locator;
  readonly deleteButton: Locator;
  readonly historyTab: Locator;
  readonly editButton: Locator;

  constructor(page: Page, rid: string) {
    super(page);
    this.rid = rid;
    this.pauseButton = page.getByRole('button', { name: /pause/i });
    this.resumeButton = page.getByRole('button', { name: /resume/i });
    this.deleteButton = page.getByRole('button', { name: /^delete$/i });
    this.historyTab = page.getByRole('tab', { name: /history|runs/i });
    this.editButton = page.getByRole('button', { name: /^edit$/i });
  }

  get path(): string {
    return `/schedules/${this.rid}`;
  }
}
