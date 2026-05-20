import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/**
 * Page Object for `/notepad`.
 *
 * Reality: the route is the "Documents" hub — a server-side searched
 * gallery table, a stats strip, a 3-item built-in template panel, and
 * a "New document" CTA that creates a blank doc and navigates to the
 * detail page. The original Pin / Archive locators were authored
 * against a roadmap shape that didn't ship; they're kept here so the
 * absent-today regression guard in notepad.spec.ts has a stable hook.
 */
export class NotepadListPage extends ListPagePO {
  readonly pageArea: Locator;
  readonly newDocumentButton: Locator;
  readonly newFromTemplateButton: Locator;
  readonly searchSubmit: Locator;
  readonly clearSearchButton: Locator;
  readonly refreshButton: Locator;
  readonly documentTable: Locator;
  readonly templatePanel: Locator;

  readonly newNoteButton: Locator;
  readonly pinButton: Locator;
  readonly archiveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageArea = page.locator('section.of-page');
    this.newDocumentButton = this.pageArea
      .getByRole('button', { name: /^(new document|creating\.\.\.)$/i })
      .first();
    this.newFromTemplateButton = this.pageArea.getByRole('button', { name: /^new from template$/i });
    this.searchSubmit = this.pageArea.getByRole('button', { name: /^(apply|applying\.\.\.)$/i });
    this.clearSearchButton = this.pageArea.getByRole('button', { name: /^clear$/i });
    this.refreshButton = this.pageArea.getByRole('button', { name: /^(refresh|refreshing\.\.\.)$/i });
    this.documentTable = this.pageArea.locator('table.of-table');
    this.templatePanel = this.pageArea
      .locator('section')
      .filter({ has: this.page.getByRole('heading', { level: 2, name: /^structured starts$/i }) })
      .last();

    this.newNoteButton = this.pageArea.getByRole('button', { name: /new note|^new document/i });
    this.pinButton = this.pageArea.getByRole('button', { name: /^pin$|pinned/i });
    this.archiveButton = this.pageArea.getByRole('button', { name: /archive/i });
  }

  get path(): string {
    return '/notepad';
  }

  documentRow(name: string | RegExp): Locator {
    return this.documentTable.locator('tbody tr').filter({
      has: this.page.getByRole('link', { name }),
    });
  }
}
