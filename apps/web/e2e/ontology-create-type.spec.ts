import type { Page, Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/ontology/types`
 * (apps/web/src/routes/ontology/CreateObjectTypePage.tsx).
 *
 * **What this page actually ships.** A minimal "create object type
 * metadata" form: `name` (identifier), `display_name`, `description`,
 * `icon` (free-text), `color`. The page copy itself states the
 * deferred scope: "Add the identifier and display metadata first;
 * properties can be configured after creation." There is therefore
 * NO property editor on this page, NO primary-key picker, NO plural
 * field, and NO uniqueness check at form level — the page enforces
 * the identifier regex (`^[a-z][a-z0-9_]*$`) and trusts the backend
 * for uniqueness. Tests cover what ships.
 *
 *   - property add / type / required / default / multiple → not on
 *     this page; the CreateObjectTypeWizard component on
 *     /ontology-manager is the surface for that and is already
 *     covered by the ontology-bindings spec.
 *   - primary key picker → not on this page; configured later on
 *     /ontology/:id.
 *   - uniqueness validation → server-side; we exercise the form-side
 *     identifier-pattern validation as the closest analogue.
 *
 * Endpoints exercised:
 *   - GET  /api/v1/ontology/types?page=1&per_page=200&search=…
 *   - POST /api/v1/ontology/types
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Failed to load/i,
      /Cannot read properties of undefined/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

interface ObjectTypeFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string | null;
  icon: string | null;
  color: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  version: number;
}

function makeObjectType(overrides: Partial<ObjectTypeFixture> = {}): ObjectTypeFixture {
  return {
    id: 'object-type-customer',
    name: 'customer',
    display_name: 'Customer',
    description: 'Account holder.',
    primary_key_property: 'id',
    icon: 'CU',
    color: '#0f766e',
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    version: 1,
    ...overrides,
  };
}

const CUSTOMER = makeObjectType();
const INVOICE = makeObjectType({
  id: 'object-type-invoice',
  name: 'invoice',
  display_name: 'Invoice',
  description: 'Billed transaction.',
  primary_key_property: 'invoice_id',
  icon: 'IV',
  color: '#1d4ed8',
});

async function mockOntologyTypesEndpoint(
  page: Page,
  options: {
    initial?: ObjectTypeFixture[];
    onCreate?: (body: Record<string, unknown>) => ObjectTypeFixture;
  } = {},
): Promise<void> {
  let store = (options.initial ?? [CUSTOMER, INVOICE]).slice();

  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = new URL(route.request().url());
      const search = url.searchParams.get('search')?.trim().toLowerCase();
      const filtered = search
        ? store.filter((type) =>
            [type.name, type.display_name, type.description, type.primary_key_property]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(search)),
          )
        : store;
      await route.fulfill({
        json: { data: filtered, total: filtered.length, page: 1, per_page: 200 },
      });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      const created = options.onCreate
        ? options.onCreate(body)
        : makeObjectType({
            id: `object-type-${(body.name as string) || 'new'}`,
            name: (body.name as string) || 'new_type',
            display_name: (body.display_name as string) || (body.name as string) || 'New type',
            description: (body.description as string) || '',
            icon: (body.icon as string) || null,
            color: (body.color as string) || null,
            primary_key_property: null,
          });
      store = [created, ...store];
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });
}

test('renders the form and the current-types list with the mocked rows', async ({
  adminPage,
}) => {
  await mockOntologyTypesEndpoint(adminPage);
  await adminPage.goto('/ontology/types');

  // Top-level heading + intro copy.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^object types$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/Create object type metadata and inspect the current ontology type catalog/i),
  ).toBeVisible();

  // The form exposes the five metadata fields. The page does NOT ship
  // a plural input; the spec note above explains the gap vs the
  // requested case list.
  await expect(adminPage.getByLabel(/^Name \(identifier\)$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Display name$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Description$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Icon text$/i)).toBeVisible();
  await expect(adminPage.getByLabel(/^Color$/i)).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: /^create object type$/i }),
  ).toBeVisible();

  // The right-hand panel surfaces the two mocked types as cards.
  await expect(adminPage.getByText('2 shown from 2 total')).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /Customer/ })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /Invoice/ })).toBeVisible();
});

test('icon + color preview reflects the form inputs in real time', async ({
  adminPage,
}) => {
  await mockOntologyTypesEndpoint(adminPage);
  await adminPage.goto('/ontology/types');

  // The preview tile is the unique square panel rendered to the left of
  // the Name/Display-name pair. It uses `background: draft.color` and
  // shows `draft.icon || draft.displayName[0] || draft.name[0] || 'T'`.
  await expect(adminPage.getByLabel(/^Name \(identifier\)$/i)).toBeVisible();
  const preview = adminPage.locator('div[aria-hidden="true"]', { hasText: /^T$/ }).first();
  await expect(preview).toBeVisible();
  // Default colour is #2d72d2.
  await expect(preview).toHaveCSS('background-color', 'rgb(45, 114, 210)');

  // Typing a display name flips the preview character.
  await adminPage.getByLabel(/^Display name$/i).fill('Customer Invoice');
  await expect(
    adminPage.locator('div[aria-hidden="true"]').filter({ hasText: /^C$/ }).first(),
  ).toBeVisible();

  // Typing an explicit icon text wins over the auto initial.
  await adminPage.getByLabel(/^Icon text$/i).fill('CI');
  await expect(
    adminPage.locator('div[aria-hidden="true"]').filter({ hasText: /^CI$/ }).first(),
  ).toBeVisible();

  // The color input is `<input type="color">`. Setting its value via
  // `fill('#e11d48')` updates `draft.color` and the preview's CSS
  // background.
  const colorInput = adminPage.getByLabel(/^Color$/i);
  await colorInput.fill('#e11d48');
  await expect(
    adminPage.locator('div[aria-hidden="true"]').filter({ hasText: /^CI$/ }).first(),
  ).toHaveCSS('background-color', 'rgb(225, 29, 72)');
});

test('rejects identifiers that violate the lowercase-snake-case pattern', async ({
  adminPage,
}) => {
  await mockOntologyTypesEndpoint(adminPage);
  const postCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/types(\?|$)/);
  await adminPage.goto('/ontology/types');

  const submit = adminPage.getByRole('button', { name: /^create object type$/i });
  // Empty name disables submit (the button declares
  // `disabled={submitting || !draft.name.trim()}`).
  await expect(submit).toBeDisabled();

  // Invalid identifier — uppercase letters + spaces. The form should
  // surface the IDENTIFIER_PATTERN error and skip the POST entirely.
  await adminPage.getByLabel(/^Name \(identifier\)$/i).fill('Customer Invoice');
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(
    adminPage.getByText(
      /Use a lowercase identifier that starts with a letter and contains only letters, numbers, and underscores/i,
    ),
  ).toBeVisible();

  // No POST fired.
  await adminPage.waitForTimeout(200);
  expect(postCalls.calls.filter((call) => call.method === 'POST').length).toBe(0);

  // Fixing the identifier clears the error path on the next submit
  // attempt — but we don't actually submit here; just prove the field
  // accepts the corrected value and the submit re-enables.
  await adminPage.getByLabel(/^Name \(identifier\)$/i).fill('customer_invoice');
  await expect(submit).toBeEnabled();
});

test('successful submit POSTs the trimmed body and surfaces the success notice', async ({
  adminPage,
}) => {
  await mockOntologyTypesEndpoint(adminPage, {
    onCreate: (body) => ({
      id: 'object-type-new-customer',
      name: String(body.name),
      display_name: String(body.display_name ?? ''),
      description: String(body.description ?? ''),
      primary_key_property: null,
      icon: (body.icon as string | null) ?? null,
      color: (body.color as string | null) ?? null,
      owner_id: 'user-1',
      created_at: E2E_NOW,
      updated_at: E2E_NOW,
      version: 1,
    }),
  });
  const apiCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/types(\?|$)/);
  await adminPage.goto('/ontology/types');
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^object types$/i }),
  ).toBeVisible();

  await adminPage.getByLabel(/^Name \(identifier\)$/i).fill('customer_invoice');
  await adminPage.getByLabel(/^Display name$/i).fill('Customer Invoice');
  await adminPage.getByLabel(/^Description$/i).fill('Billable customer line items.');
  await adminPage.getByLabel(/^Icon text$/i).fill('CI');
  // `<input type="color">` requires a strict 7-char hex string.
  await adminPage.getByLabel(/^Color$/i).fill('#0f766e');

  await adminPage.getByRole('button', { name: /^create object type$/i }).click();

  // Capture the POST and inspect the body. The page passes `undefined`
  // for empty strings (it `|| undefined`s every optional field), so
  // every populated field MUST appear on the wire.
  await expect.poll(() => apiCalls.calls.filter((call) => call.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = apiCalls.calls.find((call) => call.method === 'POST');
  expect(post?.url).toMatch(/\/api\/v1\/ontology\/types$/);
  expect(post?.body).toEqual({
    name: 'customer_invoice',
    display_name: 'Customer Invoice',
    description: 'Billable customer line items.',
    icon: 'CI',
    color: '#0f766e',
  });

  // Success notice + link to the new resource render. Scope to the
  // `of-status-success` notice — the new type also surfaces in the
  // refreshed list panel under the same display name, so a global
  // role lookup would be ambiguous.
  const successNotice = adminPage.locator('.of-status-success');
  await expect(successNotice).toBeVisible();
  await expect(successNotice).toContainText('Created');
  await expect(successNotice.getByRole('link', { name: 'Customer Invoice' })).toBeVisible();

  // The form clears so the user can stage the next create.
  await expect(adminPage.getByLabel(/^Name \(identifier\)$/i)).toHaveValue('');
  await expect(adminPage.getByLabel(/^Display name$/i)).toHaveValue('');

  // The page re-fetches the types list after the create.
  await expect.poll(() =>
    apiCalls.calls.filter((call) => call.method === 'GET').length,
  ).toBeGreaterThanOrEqual(2);
});

test('search input + Apply re-queries the types list with the search param', async ({
  adminPage,
}) => {
  await mockOntologyTypesEndpoint(adminPage);
  const apiCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/types(\?|$)/);
  await adminPage.goto('/ontology/types');

  // Wait for the initial unfiltered fetch so we can measure the
  // search-driven re-fetch.
  await expect.poll(() => apiCalls.count()).toBeGreaterThanOrEqual(1);
  await expect(adminPage.getByRole('link', { name: /Customer/ })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /Invoice/ })).toBeVisible();

  // Typing into the search box + clicking Apply fires a new GET with
  // `search=invoice` and narrows the rendered list to one row.
  await adminPage.getByPlaceholder(/^Search object types$/).fill('invoice');
  await adminPage.getByRole('button', { name: /^apply$/i }).click();

  await expect
    .poll(() => apiCalls.calls.filter((c) => c.url.includes('search=invoice')).length)
    .toBeGreaterThanOrEqual(1);
  await expect(adminPage.getByRole('link', { name: /Invoice/ })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /^Customer/ })).toHaveCount(0);

  // Reset clears the search + triggers a third GET without the query.
  await adminPage.getByRole('button', { name: /^reset$/i }).click();
  await expect(adminPage.getByPlaceholder(/^Search object types$/)).toHaveValue('');
  await expect.poll(() =>
    apiCalls.calls.filter((c) => !c.url.includes('search=')).length,
  ).toBeGreaterThanOrEqual(2);
  // Both rows back.
  await expect(adminPage.getByRole('link', { name: /^Customer/ })).toBeVisible();
  await expect(adminPage.getByRole('link', { name: /Invoice/ })).toBeVisible();
});

test('renders the empty-state when the types endpoint returns no rows', async ({
  adminPage,
}) => {
  await mockOntologyTypesEndpoint(adminPage, { initial: [] });
  await adminPage.goto('/ontology/types');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^object types$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^No object types found\.$/)).toBeVisible();
  await expect(adminPage.getByText('0 shown from 0 total')).toBeVisible();
  // The form is still interactable so the user can create the first one.
  await expect(adminPage.getByLabel(/^Name \(identifier\)$/i)).toBeEnabled();
});
