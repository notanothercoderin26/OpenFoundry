import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for a project detail at `/projects/:projectId`. */
export class ProjectDetailPage extends DetailPagePO {
  readonly projectId: string;
  readonly filesTab: Locator;
  readonly membersTab: Locator;
  readonly settingsTab: Locator;
  readonly activityTab: Locator;
  readonly newButton: Locator;
  readonly starButton: Locator;
  readonly shareButton: Locator;

  constructor(page: Page, projectId: string) {
    super(page);
    this.projectId = projectId;
    this.filesTab = page.getByRole('tab', { name: /files|contents/i });
    this.membersTab = page.getByRole('tab', { name: /members|people/i });
    this.settingsTab = page.getByRole('tab', { name: /^settings$/i });
    this.activityTab = page.getByRole('tab', { name: /activity|history/i });
    this.newButton = page.getByRole('button', { name: /^\+? ?new/i });
    this.starButton = page.getByRole('button', { name: /favorite|star/i });
    this.shareButton = page.getByRole('button', { name: /^share$/i });
  }

  get path(): string {
    return `/projects/${this.projectId}`;
  }

  fileRow(name: string | RegExp): Locator {
    return this.page.getByRole('row', { name });
  }

  memberRow(name: string | RegExp): Locator {
    return this.page.getByRole('row', { name });
  }
}
