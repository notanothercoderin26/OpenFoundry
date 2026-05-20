import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/builds/:rid`. */
export class BuildDetailPage extends DetailPagePO {
  readonly rid: string;
  readonly timeline: Locator;
  readonly retryButton: Locator;
  readonly cancelButton: Locator;
  readonly downloadLogsButton: Locator;
  readonly artifactsTab: Locator;
  readonly logsTab: Locator;

  constructor(page: Page, rid: string) {
    super(page);
    this.rid = rid;
    this.timeline = page.getByRole('region', { name: /timeline|steps/i });
    this.retryButton = page.getByRole('button', { name: /retry|rerun/i });
    this.cancelButton = page.getByRole('button', { name: /^cancel( build)?$/i });
    this.downloadLogsButton = page.getByRole('button', { name: /download logs/i });
    this.artifactsTab = page.getByRole('tab', { name: /artifacts/i });
    this.logsTab = page.getByRole('tab', { name: /logs/i });
  }

  get path(): string {
    return `/builds/${this.rid}`;
  }

  step(name: string | RegExp): Locator {
    return this.timeline.getByRole('listitem').filter({ hasText: name });
  }
}
