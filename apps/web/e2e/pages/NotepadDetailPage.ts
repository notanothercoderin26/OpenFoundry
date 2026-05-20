import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for `/notepad/:id`. */
export class NotepadDetailPage extends DetailPagePO {
  readonly id: string;
  readonly titleInput: Locator;
  readonly editor: Locator;
  readonly saveButton: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.titleInput = page.getByLabel(/^title$/i);
    this.editor = page.getByRole('textbox', { name: /content|body|editor/i });
    this.saveButton = page.getByRole('button', { name: /^save$/i });
    this.deleteButton = page.getByRole('button', { name: /^delete$/i });
  }

  get path(): string {
    return `/notepad/${this.id}`;
  }
}
