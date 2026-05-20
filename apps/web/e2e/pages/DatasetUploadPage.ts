import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for the Dataset upload wizard at `/datasets/upload`. */
export class DatasetUploadPage extends BasePagePO {
  readonly fileInput: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly projectPicker: Locator;
  readonly schemaPreview: Locator;
  readonly progressBar: Locator;
  readonly errorBanner: Locator;

  constructor(page: Page) {
    super(page);
    this.fileInput = page.locator('input[type="file"]');
    this.nextButton = page.getByRole('button', { name: /^next/i });
    this.backButton = page.getByRole('button', { name: /^back/i });
    this.submitButton = page.getByRole('button', { name: /upload|finish|create/i });
    this.cancelButton = page.getByRole('button', { name: /^cancel$/i });
    this.nameInput = page.getByLabel(/^name$/i);
    this.descriptionInput = page.getByLabel(/^description$/i);
    this.projectPicker = page.getByLabel(/project|destination/i);
    this.schemaPreview = page.getByRole('table', { name: /schema|preview/i });
    this.progressBar = page.getByRole('progressbar');
    this.errorBanner = page.getByRole('alert');
  }

  get path(): string {
    return '/datasets/upload';
  }

  async chooseFile(filePath: string): Promise<void> {
    await this.fileInput.setInputFiles(filePath);
  }

  columnTypeSelect(columnName: string | RegExp): Locator {
    return this.page.getByRole('combobox', { name: new RegExp(`type for ${typeof columnName === 'string' ? columnName : columnName.source}`, 'i') });
  }
}
