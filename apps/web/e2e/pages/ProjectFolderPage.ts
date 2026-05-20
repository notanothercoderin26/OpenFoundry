import { type Locator, type Page } from '@playwright/test';
import { DetailPagePO } from './_base';

/** Page Object for a project folder at `/projects/:projectId/folders/:folderId`. */
export class ProjectFolderPage extends DetailPagePO {
  readonly projectId: string;
  readonly folderId: string;
  readonly newFolderButton: Locator;
  readonly uploadButton: Locator;
  readonly fileInput: Locator;
  readonly emptyState: Locator;

  constructor(page: Page, projectId: string, folderId: string) {
    super(page);
    this.projectId = projectId;
    this.folderId = folderId;
    this.newFolderButton = page.getByRole('button', { name: /new folder|create folder/i });
    this.uploadButton = page.getByRole('button', { name: /upload/i });
    this.fileInput = page.locator('input[type="file"]');
    this.emptyState = page.getByText(/empty folder|no items/i);
  }

  get path(): string {
    return `/projects/${this.projectId}/folders/${this.folderId}`;
  }

  breadcrumbLink(name: string | RegExp): Locator {
    return this.breadcrumb.getByRole('link', { name });
  }

  itemRow(name: string | RegExp): Locator {
    return this.page.getByRole('row', { name });
  }
}
