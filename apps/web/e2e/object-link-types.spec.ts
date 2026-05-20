import { type Page, type Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/object-link-types`
 * (apps/web/src/routes/object-link-types/ObjectLinkTypesPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a 3-tab schema editor
 * (Link types / Object types / Shared properties) over the ontology
 * runtime. The Link types tab is split into a left registry table
 * and a right Create/Edit form. Mutating calls go straight to
 * `/api/v1/ontology/links` (POST / PATCH / DELETE); a delete confirms
 * via `window.confirm("Delete <name>?")`.
 *
 * Two wishlist items don't ship today and are pinned by the regression
 * guard at the end:
 *
 *   - There is NO "in use" warning on the Delete affordance. The page
 *     fires DELETE unconditionally — the backend may reject if the
 *     link is referenced, but the UI does not pre-check usage or
 *     surface a custom warning copy.
 *   - There is NO per-row usage counter on the Link types table
 *     (the Object types tab has a "{N} links" chip per row, but the
 *     Link types table itself does not show downstream usage).
 *
 * Endpoints exercised:
 *   - GET    /api/v1/ontology/types
 *   - GET    /api/v1/ontology/links
 *   - GET    /api/v1/ontology/shared-property-types (wrapped in
 *            .catch fallback in the page; not relied on)
 *   - POST   /api/v1/ontology/links
 *   - PATCH  /api/v1/ontology/links/{id}
 *   - DELETE /api/v1/ontology/links/{id}
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Failed to load object and link types/,
      /Failed to load selected object type/,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ObjectTypeFixture {
  id: string;
  rid: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string | null;
  icon: string | null;
  color: string | null;
  status: string;
  visibility: string;
  editable: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

interface LinkTypeFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  source_type_id: string;
  target_type_id: string;
  cardinality: string;
  label: string | null;
  reverse_label: string | null;
  visibility: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

function makeObjectType(overrides: Partial<ObjectTypeFixture> = {}): ObjectTypeFixture {
  const id = overrides.id ?? 'object-type-customer';
  return {
    id,
    rid: `ri.ontology.main.object-type.${id}`,
    name: 'customer',
    display_name: 'Customer',
    description: '',
    primary_key_property: 'id',
    icon: null,
    color: '#2563eb',
    status: 'active',
    visibility: 'normal',
    editable: true,
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function makeLinkType(overrides: Partial<LinkTypeFixture> = {}): LinkTypeFixture {
  return {
    id: 'link-type-1',
    name: 'customer_owns_order',
    display_name: 'Customer owns order',
    description: 'Customer places this order',
    source_type_id: 'object-type-customer',
    target_type_id: 'object-type-order',
    cardinality: 'one_to_many',
    label: null,
    reverse_label: null,
    visibility: 'normal',
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const CUSTOMER = makeObjectType({ id: 'object-type-customer', name: 'customer', display_name: 'Customer' });
const ORDER = makeObjectType({ id: 'object-type-order', name: 'order', display_name: 'Order' });
const PRODUCT = makeObjectType({ id: 'object-type-product', name: 'product', display_name: 'Product' });

const CUSTOMER_OWNS_ORDER = makeLinkType({
  id: 'link-customer-owns-order',
  name: 'customer_owns_order',
  display_name: 'Customer owns order',
  source_type_id: CUSTOMER.id,
  target_type_id: ORDER.id,
  cardinality: 'one_to_many',
});

const ORDER_CONTAINS_PRODUCT = makeLinkType({
  id: 'link-order-contains-product',
  name: 'order_contains_product',
  display_name: 'Order contains product',
  description: 'Many products per order; a product belongs to many orders.',
  source_type_id: ORDER.id,
  target_type_id: PRODUCT.id,
  cardinality: 'many_to_many',
});

// ---------------------------------------------------------------------------
// Mock installers
// ---------------------------------------------------------------------------

const OBJECT_TYPES_LIST_URL = /\/api\/v1\/ontology\/types(\?[^/]*)?$/;
const LINKS_LIST_URL = /\/api\/v1\/ontology\/links(\?[^/]*)?$/;

function linkDetailUrl(id: string): RegExp {
  return new RegExp(`/api/v1/ontology/links/${id}$`);
}

async function mockObjectTypes(page: Page, types: ObjectTypeFixture[]): Promise<void> {
  await page.route(OBJECT_TYPES_LIST_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: types, total: types.length, page: 1, per_page: 200 },
    });
  });
}

async function mockLinks(page: Page, links: LinkTypeFixture[]): Promise<void> {
  await page.route(LINKS_LIST_URL, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: links, total: links.length } });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renders the registry with name, source, target, and cardinality columns', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [CUSTOMER, ORDER, PRODUCT]);
  await mockLinks(adminPage, [CUSTOMER_OWNS_ORDER, ORDER_CONTAINS_PRODUCT]);
  await adminPage.goto('/object-link-types');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^object & link types$/i }),
  ).toBeVisible();

  // Both mocked link rows render: the display name is in the row's
  // first <strong>, and the cardinality is rendered as a chip.
  await expect(adminPage.getByText('Customer owns order').first()).toBeVisible();
  await expect(adminPage.getByText('Order contains product')).toBeVisible();

  // Source / target type display names appear on each row.
  await expect(adminPage.locator('table.of-table').getByText('Customer').first()).toBeVisible();
  await expect(adminPage.locator('table.of-table').getByText('Order').first()).toBeVisible();
  await expect(adminPage.locator('table.of-table').getByText('Product').first()).toBeVisible();

  // Cardinality chips render the human-readable label. Scope to the
  // table so the assertion does not collide with the matching
  // `<option>` text inside the create form's Cardinality select.
  await expect(adminPage.locator('table.of-table').getByText('one -> many')).toBeVisible();
  await expect(adminPage.locator('table.of-table').getByText('many -> many')).toBeVisible();
});

test('Cardinality select offers all four options (1:1, 1:N, N:1, N:M)', async ({ adminPage }) => {
  await mockObjectTypes(adminPage, [CUSTOMER, ORDER]);
  await mockLinks(adminPage, []);
  await adminPage.goto('/object-link-types');

  // The create form's Cardinality select lists every shipped option.
  const cardinality = adminPage.locator('label').filter({ has: adminPage.getByText('Cardinality', { exact: true }) }).getByRole('combobox');
  await expect(cardinality).toBeVisible();
  await expect(cardinality.locator('option')).toContainText([
    'one -> one',
    'one -> many',
    'many -> one',
    'many -> many',
  ]);
});

test('validation: "Create link type" submit is disabled until name + display name + source + target are present', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [CUSTOMER, ORDER]);
  await mockLinks(adminPage, []);
  await adminPage.goto('/object-link-types');

  // The empty-draft helper auto-fills name/display_name and picks the
  // first two object types — so the submit button starts ENABLED.
  const submit = adminPage.getByRole('button', { name: /^create link type$/i });
  await expect(submit).toBeEnabled();

  // Clearing the display-name input must disable submit.
  const displayNameInput = adminPage
    .locator('label')
    .filter({ has: adminPage.getByText('Display name', { exact: true }) })
    .first()
    .getByRole('textbox');
  await displayNameInput.fill('');
  await expect(submit).toBeDisabled();

  // Re-filling the display name flips it back to enabled.
  await displayNameInput.fill('Customer owns order');
  await expect(submit).toBeEnabled();

  // Clearing the source-type select to the "Pick source" placeholder
  // (value="") must also disable submit.
  await adminPage
    .locator('label')
    .filter({ has: adminPage.getByText('Source type', { exact: true }) })
    .getByRole('combobox')
    .selectOption('');
  await expect(submit).toBeDisabled();
});

test('Create link type POSTs /ontology/links with source/target/cardinality from the form', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [CUSTOMER, ORDER]);
  await mockLinks(adminPage, []);

  const cap = captureRequests(adminPage, LINKS_LIST_URL);

  // Echo back a deterministic created link so the post-submit refresh
  // path doesn't crash on a 204 catch-all.
  await adminPage.route(LINKS_LIST_URL, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      json: makeLinkType({
        id: 'link-new-1',
        name: (body.name as string) ?? 'new_link',
        display_name: (body.display_name as string) ?? 'New link',
        source_type_id: (body.source_type_id as string) ?? CUSTOMER.id,
        target_type_id: (body.target_type_id as string) ?? ORDER.id,
        cardinality: (body.cardinality as string) ?? 'one_to_many',
      }),
    });
  });

  await adminPage.goto('/object-link-types');

  // Override the auto-filled values to assert capture below.
  const nameInput = adminPage
    .locator('label')
    .filter({ has: adminPage.getByText('Name', { exact: true }) })
    .first()
    .getByRole('textbox');
  await nameInput.fill('customer_orders');
  const displayNameInput = adminPage
    .locator('label')
    .filter({ has: adminPage.getByText('Display name', { exact: true }) })
    .first()
    .getByRole('textbox');
  await displayNameInput.fill('Customer places order');
  await adminPage
    .locator('label')
    .filter({ has: adminPage.getByText('Cardinality', { exact: true }) })
    .getByRole('combobox')
    .selectOption('one_to_many');

  await adminPage.getByRole('button', { name: /^create link type$/i }).click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'POST').length).toBeGreaterThanOrEqual(1);
  const post = cap.calls.find((c) => c.method === 'POST');
  expect(post?.body).toMatchObject({
    name: 'customer_orders',
    display_name: 'Customer places order',
    source_type_id: CUSTOMER.id,
    target_type_id: ORDER.id,
    cardinality: 'one_to_many',
  });
});

test('Edit flow: row "Edit" populates the form and switches the submit button to PATCH the link', async ({
  adminPage,
}) => {
  await mockObjectTypes(adminPage, [CUSTOMER, ORDER]);
  await mockLinks(adminPage, [CUSTOMER_OWNS_ORDER]);

  const cap = captureRequests(adminPage, linkDetailUrl(CUSTOMER_OWNS_ORDER.id));

  await adminPage.route(linkDetailUrl(CUSTOMER_OWNS_ORDER.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: { ...CUSTOMER_OWNS_ORDER, ...body },
    });
  });

  await adminPage.goto('/object-link-types');

  // Click the row's Edit button.
  await adminPage.getByRole('button', { name: /^edit$/i }).first().click();

  // The form switches to edit mode: button is now "Update link type"
  // and the Name field is disabled (immutable after creation).
  const updateBtn = adminPage.getByRole('button', { name: /^update link type$/i });
  await expect(updateBtn).toBeVisible();
  const nameInput = adminPage
    .locator('label')
    .filter({ has: adminPage.getByText('Name', { exact: true }) })
    .first()
    .getByRole('textbox');
  await expect(nameInput).toBeDisabled();

  // Change the display name + cardinality, then submit.
  const displayNameInput = adminPage
    .locator('label')
    .filter({ has: adminPage.getByText('Display name', { exact: true }) })
    .first()
    .getByRole('textbox');
  await displayNameInput.fill('Customer owns orders (updated)');
  await adminPage
    .locator('label')
    .filter({ has: adminPage.getByText('Cardinality', { exact: true }) })
    .getByRole('combobox')
    .selectOption('many_to_many');

  await updateBtn.click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'PATCH').length).toBeGreaterThanOrEqual(1);
  const patch = cap.calls.find((c) => c.method === 'PATCH');
  expect(patch?.url).toContain(`/ontology/links/${CUSTOMER_OWNS_ORDER.id}`);
  expect(patch?.body).toMatchObject({
    display_name: 'Customer owns orders (updated)',
    cardinality: 'many_to_many',
  });
});

test('Delete: row "Delete" prompts window.confirm and fires DELETE on accept', async ({ adminPage }) => {
  await mockObjectTypes(adminPage, [CUSTOMER, ORDER]);
  await mockLinks(adminPage, [CUSTOMER_OWNS_ORDER]);

  const cap = captureRequests(adminPage, linkDetailUrl(CUSTOMER_OWNS_ORDER.id));

  await adminPage.route(linkDetailUrl(CUSTOMER_OWNS_ORDER.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  // Auto-accept the native confirm() prompt and assert its message.
  adminPage.on('dialog', (dialog) => {
    expect(dialog.message()).toMatch(/delete customer owns order\?/i);
    void dialog.accept();
  });

  await adminPage.goto('/object-link-types');

  await adminPage.getByRole('button', { name: /^delete$/i }).first().click();

  await expect.poll(() => cap.calls.filter((c) => c.method === 'DELETE').length).toBeGreaterThanOrEqual(1);
});

test('Delete: cancelling the window.confirm prompt does NOT fire DELETE', async ({ adminPage }) => {
  await mockObjectTypes(adminPage, [CUSTOMER, ORDER]);
  await mockLinks(adminPage, [CUSTOMER_OWNS_ORDER]);

  const cap = captureRequests(adminPage, linkDetailUrl(CUSTOMER_OWNS_ORDER.id));

  // Dismiss the native confirm so the click resolves to a no-op.
  adminPage.on('dialog', (dialog) => {
    void dialog.dismiss();
  });

  await adminPage.goto('/object-link-types');

  await adminPage.getByRole('button', { name: /^delete$/i }).first().click();

  // Give the page a beat to settle — no DELETE should have fired.
  await adminPage.waitForTimeout(200);
  expect(cap.calls.filter((c) => c.method === 'DELETE').length).toBe(0);
  // The row is still visible.
  await expect(adminPage.getByText('Customer owns order').first()).toBeVisible();
});

test('absent today: no per-row "in use" warning copy or usage counter on the Link types registry', async ({
  adminPage,
}) => {
  // Single regression guard for the wishlist controls the page does
  // not surface today. When either of these ships, the matching
  // assertion flips and forces an update.
  await mockObjectTypes(adminPage, [CUSTOMER, ORDER]);
  await mockLinks(adminPage, [CUSTOMER_OWNS_ORDER]);
  await adminPage.goto('/object-link-types');

  const table = adminPage.locator('table.of-table');
  await expect(table).toBeVisible();

  // 1. The Link types table never shows a "in use" / "in-use" chip,
  //    counter, or label per row. The detail-side metric tile in the
  //    header is allowed (it counts links for the selected object
  //    type) — the assertion is scoped to the table body.
  expect(await table.getByText(/in use|in-use|usage|references/i).count()).toBeLessThanOrEqual(0);

  // 2. The Delete button has no "Force / Cascade" affordance and no
  //    pre-check warning copy adjacent to it.
  expect(await table.getByRole('button', { name: /force|cascade/i }).count()).toBe(0);

  // 3. Sanity-check: the row's only action buttons are Edit + Delete.
  const actionsCells = table.locator('tbody td').last();
  await expect(actionsCells.getByRole('button', { name: /^edit$/i })).toBeVisible();
  await expect(actionsCells.getByRole('button', { name: /^delete$/i })).toBeVisible();
});
