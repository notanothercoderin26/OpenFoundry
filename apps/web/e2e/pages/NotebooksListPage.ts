import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/**
 * Page Object for `/notebooks`.
 *
 * The shipped page is a paginated, server-side searched table with
 * stats cards, a "New notebook" modal (NOTEBOOK-001), Open/Delete row
 * actions, and a Refresh button. There is no kernel-filter chipset on
 * the page itself — the original `kernelFilter` locator is kept around
 * as a roadmap regression guard.
 */
export class NotebooksListPage extends ListPagePO {
  readonly pageArea: Locator;
  readonly newNotebookButton: Locator;
  readonly searchSubmit: Locator;
  readonly clearSearchButton: Locator;
  readonly refreshButton: Locator;
  readonly createDialog: Locator;
  readonly notebookTable: Locator;

  readonly kernelFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.pageArea = page.locator('section.of-page');
    this.newNotebookButton = this.pageArea.getByRole('button', { name: /^new notebook$/i }).first();
    this.searchSubmit = this.pageArea.getByRole('button', { name: /^(search|searching)/i });
    this.clearSearchButton = this.pageArea.getByRole('button', { name: /^clear$/i });
    this.refreshButton = this.pageArea.getByRole('button', { name: /^refresh$/i });
    this.createDialog = page.getByRole('dialog', { name: /^new notebook$/i });
    this.notebookTable = this.pageArea.locator('table.of-table');

    this.kernelFilter = this.pageArea.getByRole('button', { name: /kernel|runtime/i });
  }

  get path(): string {
    return '/notebooks';
  }

  notebookRow(name: string | RegExp): Locator {
    return this.notebookTable.locator('tbody tr').filter({
      has: this.page.getByRole('link', { name }),
    });
  }
}
