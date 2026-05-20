import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/**
 * Page Object for `/notepad/:id`.
 *
 * The shipped detail page is a TipTap-based rich-text editor with a
 * title input, a description textarea, an export-HTML iframe preview,
 * version history, save-as-template, PDF/DOCX/HTML export, and an
 * "Index in AIP" affordance. Deletion lives on the list page, not
 * here — `deleteButton` is kept as a roadmap regression hook.
 */
export class NotepadDetailPage extends DetailPagePO {
  readonly id: string;
  readonly pageArea: Locator;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly proseMirrorEditor: Locator;
  readonly saveButton: Locator;
  readonly versionHistoryButton: Locator;
  readonly exportPdfButton: Locator;
  readonly exportDocxButton: Locator;
  readonly exportHtmlButton: Locator;
  readonly closeButton: Locator;
  readonly previewIframe: Locator;

  readonly editor: Locator;
  readonly deleteButton: Locator;

  constructor(page: Page, id: string) {
    super(page);
    this.id = id;
    this.pageArea = page.locator('section.of-page');
    this.titleInput = this.pageArea.getByPlaceholder(/document title/i);
    this.descriptionInput = this.pageArea.getByPlaceholder(/what should readers understand/i);
    this.proseMirrorEditor = this.pageArea.locator('.ProseMirror[contenteditable="true"]').first();
    this.saveButton = this.pageArea.getByRole('button', { name: /^(save|saving\.\.\.)$/i });
    this.versionHistoryButton = this.pageArea.getByRole('button', { name: /version history|hide history/i });
    this.exportPdfButton = this.pageArea.getByRole('button', { name: /^export pdf$/i });
    this.exportDocxButton = this.pageArea.getByRole('button', { name: /^export docx$/i });
    this.exportHtmlButton = this.pageArea.getByRole('button', { name: /^export html$/i });
    this.closeButton = this.pageArea.getByRole('button', { name: /^close$/i });
    this.previewIframe = this.pageArea.locator('iframe[title="Notepad preview"]');

    this.editor = this.pageArea.getByRole('textbox', { name: /content|body|editor/i });
    this.deleteButton = this.pageArea.getByRole('button', { name: /^delete$/i });
  }

  get path(): string {
    return `/notepad/${this.id}`;
  }
}
