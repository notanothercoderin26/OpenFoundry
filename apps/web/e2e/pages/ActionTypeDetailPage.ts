import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/action-types/:id`. */
export class ActionTypeDetailPage extends DetailPagePO {
  readonly id: string;
  readonly overviewTab: Locator;
  readonly parametersTab: Locator;
  readonly behaviorTab: Locator;
  readonly permissionsTab: Locator;
  readonly historyTab: Locator;
  readonly editButton: Locator;
  readonly testButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.overviewTab = page.getByRole('tab', { name: /overview/i });
    this.parametersTab = page.getByRole('tab', { name: /parameters|params/i });
    this.behaviorTab = page.getByRole('tab', { name: /behavior|code/i });
    this.permissionsTab = page.getByRole('tab', { name: /permissions/i });
    this.historyTab = page.getByRole('tab', { name: /history/i });
    this.editButton = page.getByRole('button', { name: /^edit$/i });
    this.testButton = page.getByRole('button', { name: /^test$/i });
  }

  get path(): string {
    return `/action-types/${this.id}`;
  }
}
