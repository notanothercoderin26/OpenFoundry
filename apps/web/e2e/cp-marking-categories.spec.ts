import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/marking-categories`
 * (apps/web/src/routes/control-panel/MarkingCategoriesPage.tsx).
 *
 * **Reality check.** This is a ~1400-line admin surface with five
 * nested concerns:
 *
 *   - "Include hidden categories" toggle + counter footer.
 *   - "Create category" panel (slug, display name, visibility,
 *     organization id, description, administrators / viewers user
 *     IDs, metadata JSON). Note: **there is NO color field** — the
 *     SG.11 surface ships visibility (visible / hidden) instead of a
 *     swatch.
 *   - "Build output markings" workbench (publish / dry-run a marking-
 *     aware build), not exercised here.
 *   - Per-category `<article>` card: editable display_name /
 *     visibility / description / metadata + Save, "Hide" (PATCH
 *     visibility=hidden), and "Test delete block" — the last button
 *     is intentional: SG.11 forbids deletion server-side, so the
 *     button rounds-trips through `blockDeleteMarkingCategory()` and
 *     surfaces an error banner.
 *   - Embedded `MarkingsSection` per category card with a Create-
 *     marking form and a per-marking sub-card. Each marking card
 *     exposes an "Apply to resource" / "Remove from resource"
 *     sub-form against `/resource-markings`.
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (list categories like PII / Classified) ✅
 *   - Case 2 ("nombre, color, markings hijos") ⚠️ partial — there
 *     is NO color field on create; child markings are created after
 *     the parent category via `MarkingsSection`.
 *   - Case 3 (asignar a recursos) ✅ via the per-marking permission
 *     model panel ("Apply to resource" / "Remove from resource").
 *   - Case 4 (editar / eliminar) ⚠️ partial — edit + hide work,
 *     but DELETE is BLOCKED BY DESIGN. The "Test delete block"
 *     button asserts the server rejects the call; the page tells
 *     the operator to hide the category instead.
 *
 * Endpoints (mirrors `src/lib/api/marking-categories.ts`):
 *   - GET    /api/v1/marking-categories[?include_hidden=true]
 *   - POST   /api/v1/marking-categories
 *   - PATCH  /api/v1/marking-categories/:id
 *   - DELETE /api/v1/marking-categories/:id                       (blocked)
 *   - GET    /api/v1/marking-categories/:id/markings[?include_hidden=true]
 *   - POST   /api/v1/marking-categories/:id/markings
 *   - PATCH  /api/v1/markings/:id
 *   - DELETE /api/v1/markings/:id                                  (blocked)
 *   - POST   /api/v1/resource-markings                             (apply)
 *   - POST   /api/v1/resource-markings/remove                       (remove)
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /^console\.error: %o$/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Visibility = 'visible' | 'hidden';

interface MarkingCategoryPermission {
  category_id: string;
  principal_kind: 'user' | 'group';
  principal_id: string;
  permission: 'administrator' | 'viewer';
  granted_by: string;
  created_at: string;
}

interface MarkingCategoryResponse {
  id: string;
  tenant_id: string | null;
  slug: string;
  display_name: string;
  description: string;
  visibility: Visibility;
  organization_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  permissions: MarkingCategoryPermission[];
}

interface MarkingResponse {
  id: string;
  tenant_id: string | null;
  category_id: string;
  slug: string;
  display_name: string;
  description: string;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  permissions: [];
  metadata_redacted?: boolean;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeCategory(
  overrides: Partial<MarkingCategoryResponse> = {},
): MarkingCategoryResponse {
  return {
    id: 'cat-1',
    tenant_id: null,
    slug: 'pii',
    display_name: 'PII',
    description: 'Personally identifiable information.',
    visibility: 'visible',
    organization_id: null,
    metadata: { steward: 'security' },
    created_by: 'admin-user',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    permissions: [],
    ...overrides,
  };
}

function makeMarking(
  overrides: Partial<MarkingResponse> = {},
): MarkingResponse {
  return {
    id: 'mark-1',
    tenant_id: null,
    category_id: 'cat-1',
    slug: 'pii-sensitive',
    display_name: 'PII — sensitive',
    description: 'Direct identifiers (name, email, …).',
    metadata: {},
    created_by: 'admin-user',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    permissions: [],
    ...overrides,
  };
}

const PII = makeCategory({
  id: 'cat-pii',
  slug: 'pii',
  display_name: 'PII',
  visibility: 'visible',
});
const CLASSIFIED = makeCategory({
  id: 'cat-classified',
  slug: 'classified',
  display_name: 'Classified',
  description: 'US-government style classification levels.',
  visibility: 'visible',
});
const LEGACY_HIDDEN = makeCategory({
  id: 'cat-legacy',
  slug: 'legacy',
  display_name: 'Legacy markings',
  visibility: 'hidden',
});

const PII_SENSITIVE = makeMarking({
  id: 'mark-pii-sensitive',
  category_id: PII.id,
  slug: 'pii-sensitive',
  display_name: 'PII — sensitive',
});
const PII_RESTRICTED = makeMarking({
  id: 'mark-pii-restricted',
  category_id: PII.id,
  slug: 'pii-restricted',
  display_name: 'PII — restricted',
});

// Endpoint patterns
const CATS_LIST = /\/api\/v1\/marking-categories(?:\?|$)/;
const CAT_PATCH = (id: string) => new RegExp(`/api/v1/marking-categories/${id}(?:\\?|$)`);
const CAT_MARKINGS = (id: string) =>
  new RegExp(`/api/v1/marking-categories/${id}/markings(?:\\?|$)`);
const RESOURCE_MARKINGS = /\/api\/v1\/resource-markings$/;

/**
 * Wire up the GET /marking-categories endpoint (honours the
 * `include_hidden` query param) and the per-category GET
 * /marking-categories/:id/markings endpoint for each fixture.
 *
 * Returns the request capture so a spec can assert refresh behaviour.
 */
async function mockCatalog(
  page: Page,
  cats: MarkingCategoryResponse[],
  markingsByCategory: Record<string, MarkingResponse[]> = {},
) {
  await page.route(CATS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const includeHidden = url.searchParams.get('include_hidden') === 'true';
    const filtered = includeHidden ? cats : cats.filter((c) => c.visibility === 'visible');
    await route.fulfill({ json: { items: filtered } });
  });
  for (const c of cats) {
    const items = markingsByCategory[c.id] ?? [];
    await page.route(CAT_MARKINGS(c.id), async (route: Route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({ json: { items } });
    });
  }
  return captureRequests(page, CATS_LIST);
}

/**
 * Locate the per-category `<article>` card by its display name. Each
 * card is keyed on the category's `<strong>` heading, but the slug
 * + ID `<code>` blocks let a regex disambiguate.
 */
function categoryCard(page: Page, displayName: string) {
  return page.locator('article').filter({ hasText: displayName }).first();
}

// ---------------------------------------------------------------------------
// Case 1 — list categories (PII / Classified / Legacy) with their children
// ---------------------------------------------------------------------------

test('lists marking categories with their child markings', async ({
  adminPage,
}) => {
  await mockCatalog(
    adminPage,
    [PII, CLASSIFIED, LEGACY_HIDDEN],
    { [PII.id]: [PII_SENSITIVE, PII_RESTRICTED] },
  );

  await adminPage.goto('/control-panel/marking-categories');

  // Page chrome.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^marking categories$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^← control panel$/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Counter footer (include-hidden defaults to true → all 3 surface).
  await expect(
    adminPage.getByText(/3 categories\s+·\s+1 hidden/i),
  ).toBeVisible();

  // Each category renders as its own card.
  await expect(categoryCard(adminPage, 'PII')).toBeVisible();
  await expect(categoryCard(adminPage, 'Classified')).toBeVisible();
  await expect(categoryCard(adminPage, 'Legacy markings')).toBeVisible();

  // PII card shows its two child markings inside the embedded
  // MarkingsSection.
  const piiCard = categoryCard(adminPage, 'PII');
  await expect(piiCard).toContainText('PII — sensitive');
  await expect(piiCard).toContainText('PII — restricted');

  // The other two have empty marking lists per the mock — the section
  // shows its empty-state copy.
  const classifiedCard = categoryCard(adminPage, 'Classified');
  await expect(classifiedCard).toContainText(/no markings in this category/i);
});

// ---------------------------------------------------------------------------
// Case 1 — include-hidden toggle re-fires the list with a different query
// ---------------------------------------------------------------------------

test('include-hidden toggle: re-fires GET /marking-categories without include_hidden=true', async ({
  adminPage,
}) => {
  const cap = await mockCatalog(adminPage, [PII, LEGACY_HIDDEN]);
  await adminPage.goto('/control-panel/marking-categories');
  await expect(categoryCard(adminPage, 'PII')).toBeVisible();
  await expect(categoryCard(adminPage, 'Legacy markings')).toBeVisible();
  const before = cap.calls.length;

  // Toggle off → `include_hidden=true` drops out of the query string
  // and the Legacy (hidden) card disappears.
  await adminPage.getByRole('checkbox', { name: /include hidden categories/i }).uncheck();

  await expect.poll(() => cap.calls.length).toBeGreaterThan(before);
  expect(cap.last()?.url).not.toContain('include_hidden=true');
  await expect(categoryCard(adminPage, 'Legacy markings')).toHaveCount(0);
  await expect(adminPage.getByText(/^1 categories\s+·\s+0 hidden/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Case 2 (partial) — create category (no color field today)
// ---------------------------------------------------------------------------

test('create category: POSTs slug + display_name + visibility + admins + viewers + metadata', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, []);
  const cap = captureRequests(adminPage, CATS_LIST);
  await adminPage.route(CATS_LIST, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeCategory({
        id: 'cat-new-1',
        slug: 'export-controlled',
        display_name: 'Export controlled',
        visibility: 'hidden',
      }),
    });
  });

  await adminPage.goto('/control-panel/marking-categories');
  await expect(
    adminPage.getByRole('heading', { name: /^create category$/i }),
  ).toBeVisible();

  await adminPage.getByRole('textbox', { name: /^slug$/i }).fill('export-controlled');
  await adminPage.getByRole('textbox', { name: /^display name$/i }).fill('Export controlled');
  await adminPage.getByRole('combobox', { name: /^visibility$/i }).selectOption('hidden');
  await adminPage.getByRole('textbox', { name: /^description$/i }).fill('ITAR / EAR carve-out');
  await adminPage
    .getByRole('textbox', { name: /administrator user ids/i })
    .fill('user-admin-1, user-admin-2');
  await adminPage
    .getByRole('textbox', { name: /viewer user ids/i })
    .fill('user-auditor-1');

  await adminPage.getByRole('button', { name: /^create category$/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = cap.calls.filter((c) => c.method === 'POST').slice(-1)[0];
  expect(post.body).toMatchObject({
    slug: 'export-controlled',
    display_name: 'Export controlled',
    visibility: 'hidden',
    description: 'ITAR / EAR carve-out',
    administrators: [
      { principal_kind: 'user', principal_id: 'user-admin-1' },
      { principal_kind: 'user', principal_id: 'user-admin-2' },
    ],
    viewers: [{ principal_kind: 'user', principal_id: 'user-auditor-1' }],
    metadata: { steward: 'security' },
  });
});

// ---------------------------------------------------------------------------
// Case 2 — "markings hijos": create a child marking under a category
// ---------------------------------------------------------------------------

test('create marking (child): POSTs to /marking-categories/:id/markings', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PII], { [PII.id]: [] });

  const createPattern = new RegExp(`/api/v1/marking-categories/${PII.id}/markings$`);
  const cap = captureRequests(adminPage, createPattern);
  await adminPage.route(createPattern, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeMarking({
        id: 'mark-pii-new',
        category_id: PII.id,
        slug: 'pii-restricted-new',
        display_name: 'PII — restricted (new)',
      }),
    });
  });

  await adminPage.goto('/control-panel/marking-categories');
  const piiCard = categoryCard(adminPage, 'PII');
  await expect(piiCard).toBeVisible();

  // Scope INTO the embedded MarkingsSection — both the CategoryCard
  // edit row AND the create-marking row carry "Slug" / "Display name"
  // labels, so picking the card alone hits two textboxes.
  const markingsSection = piiCard
    .getByRole('heading', { name: /^markings$/i })
    .locator('xpath=ancestor::section[1]');
  await markingsSection
    .getByRole('textbox', { name: /^slug$/i })
    .fill('pii-restricted-new');
  await markingsSection
    .getByRole('textbox', { name: /^display name$/i })
    .fill('PII — restricted (new)');
  await markingsSection
    .getByRole('textbox', { name: /member user ids/i })
    .fill('user-data-1');

  await markingsSection.getByRole('button', { name: /^create marking$/i }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);
  const post = cap.calls.filter((c) => c.method === 'POST').slice(-1)[0];
  expect(post.body).toMatchObject({
    slug: 'pii-restricted-new',
    display_name: 'PII — restricted (new)',
    members: [{ principal_kind: 'user', principal_id: 'user-data-1' }],
  });
});

// ---------------------------------------------------------------------------
// Case 4 — Edit category (PATCH metadata + display + description)
// ---------------------------------------------------------------------------

test('edit category: Save metadata PATCHes /marking-categories/:id', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PII]);
  const cap = captureRequests(adminPage, CAT_PATCH(PII.id));
  await adminPage.route(CAT_PATCH(PII.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({ json: makeCategory({ ...PII, display_name: 'PII (renamed)' }) });
  });

  await adminPage.goto('/control-panel/marking-categories');
  const piiCard = categoryCard(adminPage, 'PII');
  await expect(piiCard).toBeVisible();

  // Edit display_name + description, then Save metadata. The
  // CategoryCard edit row's Display name + Description inputs come
  // first in source order; `.first()` picks them over the MarkingsSection
  // create-marking duplicates that follow.
  await piiCard
    .getByRole('textbox', { name: /^display name$/i })
    .first()
    .fill('PII (renamed)');
  await piiCard
    .getByRole('textbox', { name: /^description$/i })
    .first()
    .fill('Renamed via E2E spec.');
  await piiCard.getByRole('button', { name: /^save metadata$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('PATCH');
  expect(cap.last()?.body).toMatchObject({
    display_name: 'PII (renamed)',
    description: 'Renamed via E2E spec.',
    visibility: 'visible',
  });
});

// ---------------------------------------------------------------------------
// Case 4 — Hide (the supported "soft delete" — PATCH visibility=hidden)
// ---------------------------------------------------------------------------

test('hide category: PATCHes { visibility: "hidden" }', async ({ adminPage }) => {
  await mockCatalog(adminPage, [PII]);
  const cap = captureRequests(adminPage, CAT_PATCH(PII.id));
  await adminPage.route(CAT_PATCH(PII.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({ json: makeCategory({ ...PII, visibility: 'hidden' }) });
  });

  await adminPage.goto('/control-panel/marking-categories');
  const piiCard = categoryCard(adminPage, 'PII');
  await piiCard.getByRole('button', { name: /^hide$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('PATCH');
  expect(cap.last()?.body).toMatchObject({ visibility: 'hidden' });
});

// ---------------------------------------------------------------------------
// Case 3 — Assign to resource: POST /resource-markings
// ---------------------------------------------------------------------------

test('apply marking to resource: POSTs /resource-markings with the marking + resource refs', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PII], { [PII.id]: [PII_SENSITIVE] });

  const cap = captureRequests(adminPage, RESOURCE_MARKINGS);
  await adminPage.route(RESOURCE_MARKINGS, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        permission_check: {
          can_manage: true,
          can_apply: true,
          can_remove: true,
          is_member: true,
          can_access_marked_data: true,
          can_apply_to_resource: true,
          can_remove_from_resource: true,
          reasons: ['applier permission granted'],
        },
        applied: true,
      },
    });
  });

  await adminPage.goto('/control-panel/marking-categories');
  const piiCard = categoryCard(adminPage, 'PII');
  // The marking sub-card sits inside the PII card; locate it by the
  // marking's display name (which is uniquely "PII — sensitive").
  const markingCard = piiCard
    .locator('article')
    .filter({ hasText: PII_SENSITIVE.display_name });
  await expect(markingCard).toBeVisible();

  // The "Permission model" sub-panel lives inside the marking card.
  // Fill Resource kind + Resource ID, then click Apply to resource.
  await markingCard.getByRole('textbox', { name: /^resource kind$/i }).fill('dataset');
  await markingCard
    .getByRole('textbox', { name: /^resource id$/i })
    .fill('ri.dataset.acme');
  await markingCard.getByRole('button', { name: /^apply to resource$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('POST');
  expect(cap.last()?.body).toMatchObject({
    resource_kind: 'dataset',
    resource_id: 'ri.dataset.acme',
    marking_id: PII_SENSITIVE.id,
  });
});

// ---------------------------------------------------------------------------
// Case 4 (partial) — Delete is BLOCKED BY DESIGN
// ---------------------------------------------------------------------------

test('delete is blocked: "Test delete block" surfaces the unsupported-action error', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PII]);

  // The category DELETE endpoint must return an error (the page calls
  // `blockDeleteMarkingCategory()` which is *expected* to fail; either
  // a network failure or a fall-through to the "Deletion is
  // unsupported" branch yields the same banner). Return 405.
  let deleteHits = 0;
  await adminPage.route(CAT_PATCH(PII.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deleteHits += 1;
    await route.fulfill({ status: 405, json: { error: 'method not allowed' } });
  });

  await adminPage.goto('/control-panel/marking-categories');
  const piiCard = categoryCard(adminPage, 'PII');
  await piiCard.getByRole('button', { name: /^test delete block$/i }).click();

  // The page surfaces the "deletion is unsupported, hide instead"
  // error banner regardless of whether the request returned an error
  // or fell through to the post-call branch.
  await expect(adminPage.locator('.of-status-danger').first()).toContainText(
    /(deletion is unsupported|method not allowed)/i,
  );
  // The DELETE request was actually issued — the button is not a no-op.
  expect(deleteHits).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Absent-today guards — case 2 partial + case 4 partial
// ---------------------------------------------------------------------------

test('absent today: color picker on create form + native confirm() on destructive actions', async ({
  adminPage,
}) => {
  await mockCatalog(adminPage, [PII]);

  // Track any native dialog — none should fire today, because Hide is
  // a direct PATCH and Test-delete-block is a non-confirmed call into
  // an endpoint the server refuses by design.
  const dialogMessages: string[] = [];
  adminPage.on('dialog', (dialog) => {
    dialogMessages.push(dialog.message());
    void dialog.accept();
  });

  await adminPage.goto('/control-panel/marking-categories');
  const piiCard = categoryCard(adminPage, 'PII');
  await expect(piiCard).toBeVisible();

  // 1. No color picker / swatch input on the Create-category form.
  //    SG.11 ships visibility (visible / hidden) instead of a swatch;
  //    branding colour belongs on the control-panel home's
  //    `default_app_branding`.
  const createPanel = adminPage
    .getByRole('heading', { name: /^create category$/i })
    .locator('xpath=ancestor::section[1]');
  expect(
    await createPanel.getByRole('textbox', { name: /color|colour|swatch/i }).count(),
  ).toBe(0);
  expect(
    await createPanel.locator('input[type="color"]').count(),
  ).toBe(0);

  // 2. The category card's "Hide" button does NOT prompt before
  //    PATCHing. Click it and confirm no dialog fired.
  await piiCard.getByRole('button', { name: /^hide$/i }).click();
  await adminPage.waitForTimeout(200);
  expect(dialogMessages).toEqual([]);

  // 3. "Test delete block" similarly does NOT prompt — it is gated by
  //    a server-side 405, not a client-side confirm dialog.
  await piiCard.getByRole('button', { name: /^test delete block$/i }).click();
  await adminPage.waitForTimeout(200);
  expect(dialogMessages).toEqual([]);
});
