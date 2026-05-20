import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/ontology/:id` (object type detail). */
export class ObjectTypeDetailPage extends DetailPagePO {
  readonly id: string;
  readonly overviewTab: Locator;
  readonly propertiesTab: Locator;
  readonly linksTab: Locator;
  readonly permissionsTab: Locator;
  readonly auditTab: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.overviewTab = page.getByRole('tab', { name: /overview/i });
    this.propertiesTab = page.getByRole('tab', { name: /properties/i });
    this.linksTab = page.getByRole('tab', { name: /links/i });
    this.permissionsTab = page.getByRole('tab', { name: /permissions/i });
    this.auditTab = page.getByRole('tab', { name: /audit|history/i });
    this.editButton = page.getByRole('button', { name: /^edit$/i });
    this.deleteButton = page.getByRole('button', { name: /^delete$/i });
  }

  get path(): string {
    return `/ontology/${this.id}`;
  }
}
