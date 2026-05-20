import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for the New Pipeline wizard at `/pipelines/new`. */
export class PipelineNewPage extends BasePagePO {
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly projectPicker: Locator;
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly saveDraftButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.getByLabel(/^name$/i);
    this.descriptionInput = page.getByLabel(/^description$/i);
    this.projectPicker = page.getByLabel(/project|destination/i);
    this.nextButton = page.getByRole('button', { name: /^next/i });
    this.backButton = page.getByRole('button', { name: /^back/i });
    this.saveDraftButton = page.getByRole('button', { name: /save (as )?draft/i });
    this.submitButton = page.getByRole('button', { name: /create pipeline|finish/i });
  }

  get path(): string {
    return '/pipelines/new';
  }
}
