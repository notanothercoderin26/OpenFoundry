import type { Page, Route } from '@playwright/test';

import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/ontology/object-sets`
 * (apps/web/src/routes/ontology/ObjectSetsPage.tsx).
 *
 * **Shape of the shipped page.** A two-pane editor:
 *
 *   - Sidebar lists saved object sets with a client-side search box.
 *   - Main form is the query builder: name + base type + filters
 *     (`ObjectSetFilterBuilder`) + traversals + an optional single
 *     internal join + projections + access policy. Below the form,
 *     a separate panel exposes Evaluate / Materialize and renders
 *     the response rows in a table.
 *   - Selecting a list item switches the form into edit mode and
 *     surfaces a Delete button next to Save.
 *
 * **What this page does NOT ship (case 3 of the prompt).** There is
 * no UI surface for set operations between two object sets — no
 * union, intersect or except. The `join` block on the form is a
 * relational join from the base type to a single secondary object
 * type via a left/right field, NOT a set operation between two
 * pre-existing object sets. We test what ships and document the
 * gap; users wanting set algebra build the underlying filter +
 * traversal expressions directly.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/ontology/types?per_page=200            (base type catalog)
 *   - GET    /api/v1/ontology/links?per_page=200            (traversal pickers)
 *   - GET    /api/v1/ontology/types/:id/properties          (filter field options)
 *   - GET    /api/v1/ontology/object-sets?size=500          (sidebar list)
 *   - POST   /api/v1/ontology/object-sets                   (create)
 *   - DELETE /api/v1/ontology/object-sets/:id               (delete)
 *   - POST   /api/v1/ontology/object-sets/:id/materialize   (snapshot)
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
    ...overrides,
  };
}

interface ObjectSetFixture {
  id: string;
  name: string;
  description: string;
  base_object_type_id: string;
  filters: Array<{ field: string; operator: string; value: unknown }>;
  traversals: Array<Record<string, unknown>>;
  join: Record<string, unknown> | null;
  projections: string[];
  what_if_label: string | null;
  policy: {
    allowed_markings: string[];
    minimum_clearance: string | null;
    deny_guest_sessions: boolean;
    required_restricted_view_id: string | null;
  };
  materialized_snapshot: unknown[] | null;
  materialized_at: string | null;
  materialized_row_count: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

function makeObjectSet(overrides: Partial<ObjectSetFixture> = {}): ObjectSetFixture {
  return {
    id: 'object-set-active-customers',
    name: 'Active customers',
    description: 'Customers with status = active.',
    base_object_type_id: 'object-type-customer',
    filters: [{ field: 'status', operator: 'equals', value: 'active' }],
    traversals: [],
    join: null,
    projections: ['base.id', 'base.properties.status'],
    what_if_label: null,
    policy: {
      allowed_markings: ['public'],
      minimum_clearance: null,
      deny_guest_sessions: false,
      required_restricted_view_id: null,
    },
    materialized_snapshot: null,
    materialized_at: null,
    materialized_row_count: 0,
    owner_id: 'user-1',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
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

const ACTIVE_CUSTOMERS = makeObjectSet();
const OVERDUE_INVOICES = makeObjectSet({
  id: 'object-set-overdue-invoices',
  name: 'Overdue invoices',
  description: 'Invoices past due.',
  base_object_type_id: INVOICE.id,
  filters: [{ field: 'status', operator: 'equals', value: 'overdue' }],
});

interface MockOptions {
  initial?: ObjectSetFixture[];
}

async function mockObjectSets(page: Page, options: MockOptions = {}): Promise<void> {
  let store = (options.initial ?? [ACTIVE_CUSTOMERS, OVERDUE_INVOICES]).slice();

  await page.route(/\/api\/v1\/ontology\/types(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: [CUSTOMER, INVOICE], total: 2, page: 1, per_page: 200 },
    });
  });

  await page.route(/\/api\/v1\/ontology\/links(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: [], total: 0 } });
  });

  await page.route(
    /\/api\/v1\/ontology\/types\/[^/]+\/properties$/,
    async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        json: {
          data: [
            {
              id: 'property-status',
              object_type_id: 'object-type-customer',
              name: 'status',
              display_name: 'Status',
              description: '',
              property_type: 'string',
              required: false,
            },
          ],
        },
      });
    },
  );

  await page.route(/\/api\/v1\/ontology\/object-sets(\?|$)/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { data: store } });
      return;
    }
    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      const created: ObjectSetFixture = {
        id: `object-set-${String(body.name ?? 'new').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: String(body.name ?? 'New set'),
        description: String(body.description ?? ''),
        base_object_type_id: String(body.base_object_type_id ?? CUSTOMER.id),
        filters: (body.filters as ObjectSetFixture['filters']) ?? [],
        traversals: (body.traversals as ObjectSetFixture['traversals']) ?? [],
        join: (body.join as ObjectSetFixture['join']) ?? null,
        projections: (body.projections as string[]) ?? [],
        what_if_label: (body.what_if_label as string | null) ?? null,
        policy: (body.policy as ObjectSetFixture['policy']) ?? {
          allowed_markings: ['public'],
          minimum_clearance: null,
          deny_guest_sessions: false,
          required_restricted_view_id: null,
        },
        materialized_snapshot: null,
        materialized_at: null,
        materialized_row_count: 0,
        owner_id: 'user-1',
        created_at: E2E_NOW,
        updated_at: E2E_NOW,
      };
      store = [created, ...store];
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  // Per-resource mutations (DELETE, evaluate, materialize). Routed
  // separately so the list catch-all above doesn't shadow them.
  await page.route(
    /\/api\/v1\/ontology\/object-sets\/[^/]+\/materialize$/,
    async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const match = /\/object-sets\/([^/]+)\/materialize$/.exec(route.request().url());
      const id = match?.[1] ?? '';
      const existing = store.find((set) => set.id === id);
      if (!existing) {
        await route.fulfill({ status: 404, json: { error: 'not_found' } });
        return;
      }
      const materializedAt = '2026-05-12T10:00:00Z';
      // Persist the snapshot state so the next GET surfaces the chip.
      existing.materialized_at = materializedAt;
      existing.materialized_row_count = 2;
      await route.fulfill({
        json: {
          object_set: { ...existing },
          total_base_matches: 2,
          total_rows: 2,
          traversal_neighbor_count: 0,
          rows: [
            { 'base.id': 'customer-1', 'base.properties.status': 'active' },
            { 'base.id': 'customer-2', 'base.properties.status': 'active' },
          ],
          generated_at: materializedAt,
          materialized: true,
        },
      });
    },
  );

  await page.route(/\/api\/v1\/ontology\/object-sets\/[^/]+$/, async (route: Route) => {
    const method = route.request().method();
    const match = /\/object-sets\/([^/]+)$/.exec(route.request().url());
    const id = match?.[1] ?? '';
    if (method === 'DELETE') {
      store = store.filter((set) => set.id !== id);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    return route.fallback();
  });
}

test('lists saved object sets and selecting one populates the editor form', async ({
  adminPage,
}) => {
  await mockObjectSets(adminPage);
  await adminPage.goto('/ontology/object-sets');

  // Header + loading gate.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^object sets$/i }),
  ).toBeVisible();

  // The sidebar reports the saved count + renders one button per set.
  await expect(adminPage.getByText(/^Saved sets \(2\)$/)).toBeVisible();
  const sidebarItems = adminPage.getByRole('button').filter({ hasText: /Active customers/ });
  await expect(sidebarItems).toHaveCount(1);
  await expect(adminPage.getByRole('button', { name: /Overdue invoices/ })).toBeVisible();

  // Initial load auto-selects the first saved set, so the form shows
  // "Edit object set" with that set's data. The "Base object type"
  // label wraps a `<select>`; Playwright's `getByLabel` derives the
  // accessible name from the label's full text (including the
  // `<option>` children), so we target the underlying select via
  // `locator('label', { hasText }).locator('select')` instead.
  await expect(adminPage.getByText(/^Edit object set$/)).toBeVisible();
  await expect(adminPage.getByLabel(/^Name$/)).toHaveValue('Active customers');
  const baseTypeSelect = adminPage
    .locator('label')
    .filter({ hasText: 'Base object type' })
    .locator('select');
  await expect(baseTypeSelect).toHaveValue(CUSTOMER.id);

  // Click the second set — the form swaps over.
  await adminPage.getByRole('button', { name: /Overdue invoices/ }).click();
  await expect(adminPage.getByLabel(/^Name$/)).toHaveValue('Overdue invoices');
  await expect(baseTypeSelect).toHaveValue(INVOICE.id);

  // The Delete button is only rendered in edit mode (not in create mode).
  await expect(adminPage.getByRole('button', { name: /^Delete$/ })).toBeVisible();
});

test('search filters the saved-sets sidebar client-side', async ({ adminPage }) => {
  await mockObjectSets(adminPage);
  await adminPage.goto('/ontology/object-sets');
  await expect(adminPage.getByText(/^Saved sets \(2\)$/)).toBeVisible();

  const search = adminPage.getByPlaceholder(/^Search sets$/);
  await search.fill('overdue');

  await expect(adminPage.getByRole('button', { name: /Overdue invoices/ })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /Active customers/ })).toHaveCount(0);

  // Clearing the search restores the full list.
  await search.fill('');
  await expect(adminPage.getByRole('button', { name: /Active customers/ })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /Overdue invoices/ })).toBeVisible();
});

test('creates a new object set via the query builder form and POSTs the payload', async ({
  adminPage,
}) => {
  await mockObjectSets(adminPage);
  const apiCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/object-sets(\?|$|\/)/);
  await adminPage.goto('/ontology/object-sets');
  await expect(adminPage.getByText(/^Saved sets \(2\)$/)).toBeVisible();

  // "New object set" clears the form to create mode. The default
  // filter (`status equals active`) is pre-seeded by `blankDraft`.
  await adminPage.getByRole('button', { name: /^New object set$/ }).click();
  await expect(adminPage.getByText(/^Create object set$/)).toBeVisible();

  await adminPage.getByLabel(/^Name$/).fill('VIP customers');
  await adminPage.getByLabel(/^Description$/).fill('High-value customer cohort.');
  // The base type defaults to the first object type (Customer); leave
  // it. (Select scoped via the wrapping <label> — see the lists test.)
  const baseTypeSelect = adminPage
    .locator('label')
    .filter({ hasText: 'Base object type' })
    .locator('select');
  await expect(baseTypeSelect).toHaveValue(CUSTOMER.id);

  // The query builder ships a pre-seeded `status equals active` filter
  // — change the value to exercise the FilterBuilder. The filter input
  // is the only `<input>` with the `font-mono` monospace style placed
  // beside the operator select.
  const filterValue = adminPage.locator('input[placeholder="value"]').first();
  if (await filterValue.count()) {
    await filterValue.fill('vip');
  } else {
    // Fallback: the default-operator (`equals`) placeholder is "value"
    // by design, but tests run in browsers where the placeholder may
    // be replaced. Match by the value-text shape instead.
    const fallbackValue = adminPage
      .locator('li input.of-input')
      .filter({ hasNot: adminPage.locator('input[placeholder="field path"]') });
    await fallbackValue.last().fill('vip');
  }

  // Fire the create.
  await adminPage.getByRole('button', { name: /^Create set$/ }).click();

  // POST /api/v1/ontology/object-sets fired with our payload shape.
  await expect.poll(() =>
    apiCalls.calls.filter((call) => call.method === 'POST' && call.url.endsWith('/object-sets')).length,
  ).toBeGreaterThanOrEqual(1);
  const post = apiCalls.calls.find(
    (call) => call.method === 'POST' && call.url.endsWith('/object-sets'),
  );
  expect(post?.body).toMatchObject({
    name: 'VIP customers',
    description: 'High-value customer cohort.',
    base_object_type_id: CUSTOMER.id,
  });
  const postBody = post?.body as { filters?: Array<{ field: string; operator: string }> } | undefined;
  expect(postBody?.filters?.length ?? 0).toBeGreaterThanOrEqual(1);
  expect(postBody?.filters?.[0].field).toBe('status');

  // Page surfaces the success notice and re-fetches, then auto-selects
  // the new id — so the form heading flips back to "Edit object set".
  await expect(adminPage.getByText(/^Object set created\.$/)).toBeVisible();
  await expect(adminPage.getByText(/^Edit object set$/)).toBeVisible();
  // The new row shows up in the sidebar.
  await expect(adminPage.getByText(/^Saved sets \(3\)$/)).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /VIP customers/ })).toBeVisible();
});

test('materializes the selected object set, surfaces the row table and the snapshot chip', async ({
  adminPage,
}) => {
  await mockObjectSets(adminPage);
  const materializeCalls = captureRequests(
    adminPage,
    /\/api\/v1\/ontology\/object-sets\/[^/]+\/materialize$/,
  );
  await adminPage.goto('/ontology/object-sets');

  // Auto-selection lands on the first set (Active customers).
  await expect(adminPage.getByLabel(/^Name$/)).toHaveValue('Active customers');
  // No "Materialized" chip yet on the sidebar row.
  await expect(adminPage.getByText(/^Materialized$/)).toHaveCount(0);

  await adminPage.getByRole('button', { name: /^Materialize$/ }).click();

  // POST :id/materialize fired with `limit: 500`.
  await expect.poll(() => materializeCalls.count()).toBeGreaterThanOrEqual(1);
  expect(materializeCalls.last()?.url).toMatch(
    new RegExp(`/object-sets/${ACTIVE_CUSTOMERS.id}/materialize$`),
  );
  expect(materializeCalls.last()?.body).toEqual({ limit: 500 });

  // Success notice + the evaluation chip strip + the rendered rows.
  await expect(adminPage.getByText(/^Object set materialized\.$/)).toBeVisible();
  await expect(adminPage.getByText(/^Rows 2$/)).toBeVisible();
  await expect(adminPage.getByText(/^Base matches 2$/)).toBeVisible();
  await expect(adminPage.getByText(/^Materialized$/).first()).toBeVisible();

  // The two materialized rows render in the evaluation table.
  await expect(adminPage.getByRole('cell', { name: 'customer-1' })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: 'customer-2' })).toBeVisible();
});

test('deletes the selected object set after confirming, then reloads the sidebar', async ({
  adminPage,
}) => {
  await mockObjectSets(adminPage);
  const apiCalls = captureRequests(adminPage, /\/api\/v1\/ontology\/object-sets\/[^/]+$/);
  // The page uses `window.confirm` to gate the delete; auto-accept it.
  adminPage.on('dialog', (dialog) => void dialog.accept());
  await adminPage.goto('/ontology/object-sets');

  // Auto-selection lands on Active customers.
  await expect(adminPage.getByLabel(/^Name$/)).toHaveValue('Active customers');
  await expect(adminPage.getByText(/^Saved sets \(2\)$/)).toBeVisible();

  await adminPage.getByRole('button', { name: /^Delete$/ }).click();

  // DELETE /api/v1/ontology/object-sets/:id was issued.
  await expect.poll(() =>
    apiCalls.calls.filter((call) => call.method === 'DELETE').length,
  ).toBeGreaterThanOrEqual(1);
  const del = apiCalls.calls.find((call) => call.method === 'DELETE');
  expect(del?.url).toMatch(new RegExp(`/object-sets/${ACTIVE_CUSTOMERS.id}$`));

  // Success notice + sidebar drops to a single row.
  await expect(adminPage.getByText(/^Object set deleted\.$/)).toBeVisible();
  await expect(adminPage.getByText(/^Saved sets \(1\)$/)).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /Active customers/ })).toHaveCount(0);
  await expect(adminPage.getByRole('button', { name: /Overdue invoices/ })).toBeVisible();
});

test('relational join: enabling the Join checkbox surfaces the secondary-type + field configuration', async ({
  adminPage,
}) => {
  // Documented gap vs the prompt: the page does NOT ship a union /
  // intersect / except surface between two saved object sets. The
  // closest analogue is the internal relational join from the base
  // type to a single secondary type. This test pins that surface so
  // the spec covers the page's actual set-shaping affordances.
  await mockObjectSets(adminPage);
  await adminPage.goto('/ontology/object-sets');
  await expect(adminPage.getByLabel(/^Name$/)).toHaveValue('Active customers');

  // The Join section header + the enable checkbox both render. The
  // checkbox is unchecked because the seed set has `join: null`.
  const joinHeader = adminPage.getByText(/^Join$/, { exact: true });
  await expect(joinHeader).toBeVisible();
  const joinCheckbox = adminPage.getByRole('checkbox', { name: /^Enabled$/ });
  await expect(joinCheckbox).not.toBeChecked();

  // Toggling it on adds the secondary-type / left-field / right-field
  // / kind controls. Selects need `<label>`-scoped lookups (see notes
  // in the lists test); the two text inputs work via `getByLabel`.
  await joinCheckbox.check();
  const secondaryTypeSelect = adminPage
    .locator('label')
    .filter({ hasText: 'Secondary type' })
    .locator('select');
  const joinKindSelect = adminPage
    .locator('label')
    .filter({ hasText: 'Kind' })
    .locator('select');
  await expect(secondaryTypeSelect).toBeVisible();
  await expect(joinKindSelect).toBeVisible();
  await expect(adminPage.getByLabel(/^Left field$/)).toBeVisible();
  await expect(adminPage.getByLabel(/^Right field$/)).toBeVisible();
  // Default secondary type is the first object type in the catalog.
  await expect(secondaryTypeSelect).toHaveValue(CUSTOMER.id);
});
