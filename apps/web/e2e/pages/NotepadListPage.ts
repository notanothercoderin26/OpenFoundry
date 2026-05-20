import { type Locator, type Page } from '@playwright/test';
import { ListPagePO } from './_base';

/** Page Object for `/notepad`. */
export class NotepadListPage extends ListPagePO {
  readonly newNoteButton: Locator;
  readonly pinButton: Locator;
  readonly archiveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newNoteButton = page.getByRole('button', { name: /new note|create/i });
    this.pinButton = page.getByRole('button', { name: /^pin$|pinned/i });
    this.archiveButton = page.getByRole('button', { name: /archive/i });
  }

  get path(): string {
    return '/notepad';
  }
}
