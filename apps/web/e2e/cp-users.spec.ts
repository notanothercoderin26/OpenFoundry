import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/users`
 * (apps/web/src/routes/control-panel/UsersPage.tsx).
 *
 * **Reality check.** The shipped UsersPage is a *single* admin surface
 * (no separate list/detail routes). What's there today:
 *
 *   - Search bar: free-text query (`q`), organization id, realm,
 *     status (`active` / `inactive` only — no `suspended`),
 *     `include_deleted` toggle.
 *   - Paginated table (server-side `limit` + `offset`) with Prev/Next
 *     and a "Page N / M · K user(s)" footer.
 *   - "Preregister user" panel (admin-only POST that seeds a row before
 *     the user signs up) — this is the closest thing to "Invite user"
 *     the page exposes; `roles` is a comma-separated text input, not a
 *     proper picker.
 *   - Per-row actions: Activate/Deactivate (PATCH is_active),
 *     Revoke tokens (POST revoke-tokens), Soft-delete (DELETE — gated
 *     by a native `confirm()`), Restore (only when already soft-deleted).
 *   - Inspection panel: shown after clicking the email button — roles,
 *     groups, token counts, external identities, last login.
 *
 * What is **NOT** there (the roadmap calls for it; this spec pins the
 * absence so a half-shipped feature surfaces immediately):
 *
 *   - Role filter on the list.
 *   - Per-row "Change role", "Force MFA", "Reset password" controls.
 *   - Bulk multi-select + bulk Suspend.
 *   - CSV export.
 *   - Inline "Add to group" / group assignment UI (groups are read-only
 *     in the inspection panel).
 *   - Effective-permissions surface and per-user audit log in the
 *     inspection panel — only roles + groups + token counts are shown.
 *
 * Endpoints (Go wire shape, mirrors `src/lib/api/users-admin.ts`):
 *   - GET    /api/v1/users/search?...            → SearchUsersResponse
 *   - GET    /api/v1/users/:id/inspect           → UserInspection
 *   - PATCH  /api/v1/users/:id                   → AdminUser
 *   - DELETE /api/v1/users/:id                   → 204
 *   - POST   /api/v1/users/:id/restore           → AdminUser
 *   - POST   /api/v1/users/:id/revoke-tokens     → { user_id, revoked }
 *   - POST   /api/v1/users/preregister           → AdminUser
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      // Some sub-renders log %o-formatted warnings while React Suspense
      // settles; the auto pageErrors fixture would otherwise fail on them.
      /^console\.error: %o$/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  is_active: boolean;
  auth_source: string;
  realm: string;
  mfa_enforced: boolean;
  organization_id: string | null;
  attributes: Record<string, unknown> | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  preregistered: boolean;
  invited_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeAdminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    username: 'alice',
    name: 'Alice Smith',
    is_active: true,
    auth_source: 'local',
    realm: 'corp',
    mfa_enforced: false,
    organization_id: 'org-1',
    attributes: null,
    last_login_at: '2026-05-10T10:00:00Z',
    last_login_ip: '198.51.100.42',
    preregistered: false,
    invited_by: null,
    deleted_at: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const ALICE = makeAdminUser({ id: 'user-1', email: 'alice@example.com', name: 'Alice Smith', username: 'alice' });
const BOB = makeAdminUser({
  id: 'user-2',
  email: 'bob@example.com',
  name: 'Bob Jones',
  username: 'bob',
  is_active: false,
  realm: 'guests',
  last_login_at: null,
});
const CAROL = makeAdminUser({
  id: 'user-3',
  email: 'carol@example.com',
  name: 'Carol Ng',
  username: null,
  preregistered: true,
  last_login_at: null,
});

// Endpoint patterns
const USERS_SEARCH = /\/api\/v1\/users\/search/;
const USERS_PREREGISTER = /\/api\/v1\/users\/preregister$/;
const USERS_PATCH = (id: string) => new RegExp(`/api/v1/users/${id}$`);
const USERS_DELETE = (id: string) => new RegExp(`/api/v1/users/${id}(?:\\?|$)`);
const USERS_REVOKE_TOKENS = (id: string) =>
  new RegExp(`/api/v1/users/${id}/revoke-tokens$`);
const USERS_INSPECT = (id: string) => new RegExp(`/api/v1/users/${id}/inspect$`);

interface MockSearchOpts {
  /** Override the user list (defaults to `[ALICE, BOB, CAROL]`). */
  items?: AdminUser[];
  /** Override the reported total (defaults to `items.length`). */
  total?: number;
}

/**
 * Install a per-test mock for the search endpoint. Reads query params on
 * each call so the same handler can serve filtered + paginated requests.
 * Returns a request capture so the spec can assert payloads after
 * `goto()`.
 */
async function mockSearchUsers(page: Page, opts: MockSearchOpts = {}) {
  const allItems = opts.items ?? [ALICE, BOB, CAROL];
  await page.route(USERS_SEARCH, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const status = url.searchParams.get('status') ?? '';
    const includeDeleted = url.searchParams.get('include_deleted') === 'true';
    let filtered = allItems.slice();
    if (q) {
      filtered = filtered.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q) ||
          (u.username ?? '').toLowerCase().includes(q),
      );
    }
    if (status === 'active') filtered = filtered.filter((u) => u.is_active);
    if (status === 'inactive') filtered = filtered.filter((u) => !u.is_active);
    if (!includeDeleted) filtered = filtered.filter((u) => !u.deleted_at);
    await route.fulfill({ json: { items: filtered, total: opts.total ?? filtered.length } });
  });
  return captureRequests(page, USERS_SEARCH);
}

async function mockInspectUser(page: Page, user: AdminUser): Promise<void> {
  await page.route(USERS_INSPECT(user.id), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        user,
        roles: ['admin', 'editor'],
        groups: [
          { id: 'group-1', name: 'Platform engineers' },
          { id: 'group-2', name: 'On-call' },
        ],
        tokens: {
          active_count: 3,
          revoked_count: 7,
          next_expires_at: '2026-06-01T00:00:00Z',
          api_keys_active: 1,
        },
        external_identities: [
          {
            provider: 'okta',
            external_id: 'okta-abc',
            email: user.email,
            last_login_at: user.last_login_at,
            created_at: user.created_at,
          },
        ],
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Case 1 — list + pagination + search
// ---------------------------------------------------------------------------

test('lists users with the mocked rows and renders the pagination footer', async ({
  adminPage,
}) => {
  // 3 users in the response, default page-size 50 → 1 page.
  await mockSearchUsers(adminPage, { items: [ALICE, BOB, CAROL] });
  await adminPage.goto('/control-panel/users');

  // Heading + back link. The accessible-name regex needs the leading
  // `←` so it doesn't collide with the topbar breadcrumb link that
  // points at the same URL.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^users$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^← control panel$/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Each mocked user surfaces as a row with the email as a clickable
  // button (the page does NOT navigate to a separate detail route — the
  // inspection panel opens in place).
  for (const u of [ALICE, BOB, CAROL]) {
    await expect(
      adminPage.getByRole('button', { name: u.email }),
    ).toBeVisible();
  }

  // Status cell renders one of: active / inactive / preregistered / deleted.
  // Alice is active, Bob is inactive, Carol is preregistered.
  const aliceRow = adminPage.getByRole('row', { name: new RegExp(ALICE.email) });
  await expect(aliceRow).toContainText(/active/i);
  const bobRow = adminPage.getByRole('row', { name: new RegExp(BOB.email) });
  await expect(bobRow).toContainText(/inactive/i);
  const carolRow = adminPage.getByRole('row', { name: new RegExp(CAROL.email) });
  await expect(carolRow).toContainText(/preregistered/i);

  // Pagination footer: "Page 1 / 1 · 3 user(s)" + a disabled Prev button.
  await expect(adminPage.getByText(/page\s+1\s*\/\s*1\s*·\s*3\s+user\(s\)/i)).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^← Prev$/ })).toBeDisabled();
  await expect(adminPage.getByRole('button', { name: /^Next →$/ })).toBeDisabled();
});

test('search: typing in the query input fires /users/search?q=...', async ({
  adminPage,
}) => {
  const cap = await mockSearchUsers(adminPage, { items: [ALICE, BOB, CAROL] });
  await adminPage.goto('/control-panel/users');

  // Initial GET already happened; wait for one row to confirm.
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toBeVisible();
  const before = cap.calls.length;

  await adminPage.getByRole('textbox', { name: /query \(email \/ username \/ name\)/i }).fill('alice');

  // The mock filters on q server-side, so only Alice should remain.
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: BOB.email })).toHaveCount(0);
  await expect(adminPage.getByRole('button', { name: CAROL.email })).toHaveCount(0);

  // At least one extra GET fired and it carried `q=alice`.
  await expect.poll(() => cap.calls.length).toBeGreaterThan(before);
  const lastUrl = cap.last()?.url ?? '';
  expect(lastUrl).toContain('q=alice');
  // The query input always resets `offset=0` when typed.
  expect(lastUrl).toContain('offset=0');
});

// ---------------------------------------------------------------------------
// Case 2 — status filter (no `suspended` state today)
// ---------------------------------------------------------------------------

test('status filter: dropdown exposes "active" and "inactive" only, request carries ?status=', async ({
  adminPage,
}) => {
  const cap = await mockSearchUsers(adminPage, { items: [ALICE, BOB, CAROL] });
  await adminPage.goto('/control-panel/users');
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toBeVisible();
  const before = cap.calls.length;

  const statusSelect = adminPage.getByRole('combobox', { name: /^status$/i });
  await expect(statusSelect).toBeVisible();

  // Source-of-truth options: any | active | inactive. There is NO
  // "suspended" option today — pin this so when a separate suspended
  // state ships the option count flips and this assertion fails.
  const optionValues = await statusSelect.locator('option').evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((el) => el.value),
  );
  expect(optionValues).toEqual(['', 'active', 'inactive']);

  await statusSelect.selectOption('inactive');

  // Only the inactive user remains.
  await expect(adminPage.getByRole('button', { name: BOB.email })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toHaveCount(0);

  await expect.poll(() => cap.calls.length).toBeGreaterThan(before);
  expect(cap.last()?.url).toContain('status=inactive');
});

// ---------------------------------------------------------------------------
// Case 3 — Preregister (the closest thing to "invite user")
// ---------------------------------------------------------------------------

test('preregister: posts the email + name + roles tuple', async ({
  adminPage,
}) => {
  await mockSearchUsers(adminPage, { items: [] });
  const cap = captureRequests(adminPage, USERS_PREREGISTER);
  await adminPage.route(USERS_PREREGISTER, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeAdminUser({
        id: 'user-new-1',
        email: 'newbie@example.com',
        name: 'New Bee',
        preregistered: true,
        is_active: false,
      }),
    });
  });

  await adminPage.goto('/control-panel/users');
  await expect(
    adminPage.getByRole('heading', { name: /preregister user/i }),
  ).toBeVisible();

  await adminPage.getByRole('textbox', { name: /^email$/i }).fill('newbie@example.com');
  await adminPage.getByRole('textbox', { name: /^name$/i }).fill('New Bee');
  // Default `roles` is "viewer"; overwrite with a comma-separated list.
  await adminPage
    .getByRole('textbox', { name: /roles \(comma-separated\)/i })
    .fill('viewer, editor');

  await adminPage.getByRole('button', { name: /^preregister$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const body = cap.last()?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    email: 'newbie@example.com',
    name: 'New Bee',
    realm: 'local', // default
    roles: ['viewer', 'editor'],
  });
});

// ---------------------------------------------------------------------------
// Case 4 — edit user: deactivate (≈ suspend), revoke tokens, soft-delete
// ---------------------------------------------------------------------------

test('row action — Deactivate: sends PATCH /users/:id with { is_active: false }', async ({
  adminPage,
}) => {
  await mockSearchUsers(adminPage, { items: [ALICE] });
  const cap = captureRequests(adminPage, USERS_PATCH(ALICE.id));
  await adminPage.route(USERS_PATCH(ALICE.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({ json: makeAdminUser({ ...ALICE, is_active: false }) });
  });

  await adminPage.goto('/control-panel/users');
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toBeVisible();

  const aliceRow = adminPage.getByRole('row', { name: new RegExp(ALICE.email) });
  await aliceRow.getByRole('button', { name: /^deactivate$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.body).toMatchObject({ is_active: false });
});

test('row action — Soft-delete: confirms then DELETEs /users/:id', async ({
  adminPage,
}) => {
  await mockSearchUsers(adminPage, { items: [ALICE] });
  const cap = captureRequests(adminPage, USERS_DELETE(ALICE.id));
  await adminPage.route(USERS_DELETE(ALICE.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  // The page guards Soft-delete with a native `confirm()` — accept the
  // first dialog so the action proceeds. Playwright dismisses unhandled
  // dialogs by default, which would silently drop the call.
  adminPage.once('dialog', (dialog) => {
    expect(dialog.message()).toMatch(/soft-delete user alice@example\.com/i);
    void dialog.accept();
  });

  await adminPage.goto('/control-panel/users');
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toBeVisible();

  const aliceRow = adminPage.getByRole('row', { name: new RegExp(ALICE.email) });
  await aliceRow.getByRole('button', { name: /^soft-delete$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('DELETE');
});

test('row action — Revoke tokens: POSTs to /revoke-tokens and surfaces the count', async ({
  adminPage,
}) => {
  await mockSearchUsers(adminPage, { items: [ALICE] });
  const cap = captureRequests(adminPage, USERS_REVOKE_TOKENS(ALICE.id));
  await adminPage.route(USERS_REVOKE_TOKENS(ALICE.id), async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ json: { user_id: ALICE.id, revoked: 4 } });
  });

  await adminPage.goto('/control-panel/users');
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toBeVisible();

  const aliceRow = adminPage.getByRole('row', { name: new RegExp(ALICE.email) });
  await aliceRow.getByRole('button', { name: /^revoke tokens$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);

  // The page uses `setError(...)` as a non-fatal info banner — it
  // reuses the danger banner for both errors AND the "Revoked N tokens
  // for <email>" success message. Pin the message text so a future
  // success-toast split surfaces here.
  await expect(adminPage.locator('.of-status-danger').first()).toContainText(
    /revoked\s+4\s+refresh token\(s\) for alice@example\.com/i,
  );
});

// ---------------------------------------------------------------------------
// Case 5 — detail / inspection panel (roles, groups, tokens, external ids)
// ---------------------------------------------------------------------------

test('inspect user: opens the panel with roles, groups, tokens, external identities', async ({
  adminPage,
}) => {
  await mockSearchUsers(adminPage, { items: [ALICE] });
  await mockInspectUser(adminPage, ALICE);
  await adminPage.goto('/control-panel/users');

  // Email cell is rendered as a `<button>` — clicking it loads the
  // inspection panel inline (no navigation away from the list).
  await adminPage.getByRole('button', { name: ALICE.email }).click();

  // Panel header shows "Inspect: <email>".
  await expect(
    adminPage.getByRole('heading', { name: new RegExp(`inspect:\\s+${ALICE.email}`, 'i') }),
  ).toBeVisible();

  // Roles, groups and tokens (active + revoked + api keys) appear in a
  // `<dl>`. Pin one assertion per "case 5" slice so a partial regression
  // (e.g. groups disappear) fails this test rather than going unnoticed.
  await expect(adminPage.getByText(/^admin,\s+editor$/)).toBeVisible();
  await expect(adminPage.getByText(/platform engineers,\s+on-call/i)).toBeVisible();
  await expect(adminPage.getByText(/3\s+\(api keys:\s+1\)/i)).toBeVisible(); // active tokens
  await expect(adminPage.getByText(/^7$/)).toBeVisible(); // revoked tokens
  await expect(adminPage.getByText(/okta:okta-abc/i)).toBeVisible();

  // The panel is dismissible via the Close button.
  await adminPage.getByRole('button', { name: /^close$/i }).click();
  await expect(
    adminPage.getByRole('heading', { name: /inspect:/i }),
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Absent-today guards — roadmap controls that haven't shipped yet
// ---------------------------------------------------------------------------

test('absent today: role filter, force-MFA toggle, reset-password, change-role row controls', async ({
  adminPage,
}) => {
  // Roadmap surfaces these per-user controls (case 4 + case 2 partial)
  // but the shipped page only exposes Activate/Deactivate, Revoke
  // tokens, Soft-delete, Restore. Pin the absence so the spec catches
  // partial implementations.
  await mockSearchUsers(adminPage, { items: [ALICE] });
  await adminPage.goto('/control-panel/users');
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toBeVisible();

  // No role filter in the FilterBar. The combobox surface only has the
  // `status` select (asserted above) — confirm "role" is absent.
  expect(
    await adminPage.getByRole('combobox', { name: /^role$/i }).count(),
  ).toBe(0);

  // No per-row buttons for force-MFA / reset-password / change-role.
  // Use `getByRole('button')` over a substring locator so a future
  // `<a>`-styled control still trips the absence check.
  const aliceRow = adminPage.getByRole('row', { name: new RegExp(ALICE.email) });
  expect(await aliceRow.getByRole('button', { name: /force mfa|enforce mfa/i }).count()).toBe(0);
  expect(await aliceRow.getByRole('button', { name: /reset password/i }).count()).toBe(0);
  expect(await aliceRow.getByRole('button', { name: /change role|edit role/i }).count()).toBe(0);
});

test('absent today: bulk row-select + bulk Suspend, CSV export, group assignment UI', async ({
  adminPage,
}) => {
  // Cases 6 + 7 + 8 — the roadmap describes bulk multi-select with a
  // "Suspend selected" action, a CSV export CTA on the list, and an
  // inline group-assignment surface on the inspection panel. None of
  // these are shipped today. Pin their absence as a regression guard
  // so the developer adding any of them inherits an actionable
  // checklist.
  await mockSearchUsers(adminPage, { items: [ALICE, BOB] });
  await mockInspectUser(adminPage, ALICE);
  await adminPage.goto('/control-panel/users');
  await expect(adminPage.getByRole('button', { name: ALICE.email })).toBeVisible();

  // Bulk select: no per-row checkboxes (the FilterBar's include-deleted
  // checkbox is the ONLY one on the page today, so a non-zero count
  // would mean rows added checkboxes too).
  expect(await adminPage.getByRole('checkbox').count()).toBe(1);

  // No "Suspend selected" / "Bulk suspend" / "Bulk action" CTA.
  expect(
    await adminPage.getByRole('button', { name: /suspend selected|bulk (suspend|action)/i }).count(),
  ).toBe(0);

  // No CSV export button.
  expect(
    await adminPage.getByRole('button', { name: /export(\s+csv)?/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('link', { name: /export(\s+csv)?|download csv/i }).count(),
  ).toBe(0);

  // No "Add to group" surface on the row.
  const aliceRow = adminPage.getByRole('row', { name: new RegExp(ALICE.email) });
  expect(
    await aliceRow.getByRole('button', { name: /add to group|manage groups/i }).count(),
  ).toBe(0);

  // The inspection panel shows groups as plain text, NOT an editable
  // surface — open it and confirm no group-mutation control exists.
  await adminPage.getByRole('button', { name: ALICE.email }).click();
  await expect(
    adminPage.getByRole('heading', { name: /inspect:/i }),
  ).toBeVisible();
  expect(
    await adminPage.getByRole('button', { name: /add (to )?group|remove from group|manage groups/i }).count(),
  ).toBe(0);
});
