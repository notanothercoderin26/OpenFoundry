import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/approvals` (legacy redirect: /audit). */
export class AuditPage extends BasePagePO {
  readonly auditTab: Locator;
  readonly approvalsTab: Locator;
  readonly userFilter: Locator;
  readonly actionFilter: Locator;
  readonly resourceFilter: Locator;
  readonly dateRangePicker: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;
  readonly eventDrawer: Locator;

  constructor(page: Page) {
    super(page);
    this.auditTab = page.getByRole('tab', { name: /audit( log)?/i });
    this.approvalsTab = page.getByRole('tab', { name: /approvals/i });
    this.userFilter = page.getByRole('button', { name: /user/i });
    this.actionFilter = page.getByRole('button', { name: /action/i });
    this.resourceFilter = page.getByRole('button', { name: /resource/i });
    this.dateRangePicker = page.getByRole('button', { name: /date|range/i });
    this.approveButton = page.getByRole('button', { name: /^approve$/i });
    this.rejectButton = page.getByRole('button', { name: /^reject$/i });
    this.eventDrawer = page.getByRole('complementary', { name: /event|detail/i });
  }

  get path(): string {
    return '/approvals';
  }
}
