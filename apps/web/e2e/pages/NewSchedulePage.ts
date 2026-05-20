import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for the new schedule wizard at `/schedules/new`. */
export class NewSchedulePage extends BasePagePO {
  readonly nameInput: Locator;
  readonly cronInput: Locator;
  readonly targetPicker: Locator;
  readonly timezonePicker: Locator;
  readonly nextRunsPreview: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.getByLabel(/^name$/i);
    this.cronInput = page.getByLabel(/cron|schedule expression/i);
    this.targetPicker = page.getByLabel(/target|pipeline|resource/i);
    this.timezonePicker = page.getByLabel(/timezone/i);
    this.nextRunsPreview = page.getByRole('region', { name: /next runs|preview/i });
    this.submitButton = page.getByRole('button', { name: /^create|finish/i });
    this.cancelButton = page.getByRole('button', { name: /^cancel$/i });
  }

  get path(): string {
    return '/schedules/new';
  }
}
