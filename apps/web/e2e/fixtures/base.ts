import { test as base, expect, type Page } from '@playwright/test';
import { mockAuth, type AuthMockOptions } from './mocks';

type Fixtures = {
  /**
   * Page with auth/bootstrap mocks already installed. Use this when the test
   * needs to start from an authenticated state. For unauthenticated flows
   * (login page, MFA, setup) keep using the plain `page` fixture.
   */
  authedPage: Page;
  /**
   * Per-test override knob for the auth mocks (roles, user identity, sso).
   * Set via `test.use({ authOptions: { user: { roles: ['viewer'] } } })`.
   */
  authOptions: AuthMockOptions;
};

export const test = base.extend<Fixtures>({
  authOptions: [{}, { option: true }],
  authedPage: async ({ page, authOptions }, use) => {
    await mockAuth(page, authOptions);
    await use(page);
  },
});

export { expect };
