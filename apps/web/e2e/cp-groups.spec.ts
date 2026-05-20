import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/groups`
 * (apps/web/src/routes/control-panel/GroupsPage.tsx).
 *
 * **Reality check.** The shipped page is a single admin surface (no
 * separate list/detail routes) composed of:
 *
 *   - Search FilterBar: q, kind (`internal`/`external`/`rule_based`),
 *     realm, organization id, status (`active`/`archived`).
 *   - "Create group" panel: name (handle), display name, kind, realm,
 *     organization id, description.
 *   - Paginated table: Group, Kind, Realm, Status, Updated, Actions
 *     (Archive/Restore, Delete) — server-side limit/offset, Prev/Next
 *     with "Page N / M · K group(s)" footer.
 *   - Inspect panel (opens after clicking the group's display name):
 *     `<dl>` of counts/handles + three sub-panels — Administrators,
 *     Nested children, Direct members. Each sub-panel has an
 *     add-by-id row and per-row Remove/Unnest buttons.
 *
 * What is **NOT** there (the roadmap calls for it; pin the absence so
 * a half-shipped feature lights up here):
 *
 *   - User-autocomplete picker — Add member is a free-text `User ID`
 *     input, no `combobox`/dropdown of matching users.
 *   - Full edit form — only Archive/Restore (status toggle) is wired;
 *     name/display_name/description/kind cannot be PATCH-ed from the
 *     list.
 *   - Permissions assignment surface — admins (manage / manage_members
 *     scope) and nested groups are exposed, but there is no
 *     role/permission picker.
 *   - Member-count warning on delete — `confirm()` says "This removes
 *     admins, members, and nested edges" but does NOT include the
 *     actual member count.
 *
 * Endpoints (mirrors `src/lib/api/groups-admin.ts`):
 *   - GET    /api/v1/groups/search?...                → SearchGroupsResponse
 *   - GET    /api/v1/groups/:id/inspect               → GroupInspection
 *   - GET    /api/v1/groups/:id/members               → GroupMember[]
 *   - POST   /api/v1/groups                           → AdminGroup
 *   - PATCH  /api/v1/groups/:id                       → AdminGroup
 *   - DELETE /api/v1/groups/:id                       → 204
 *   - PUT    /api/v1/groups/:id/members/:userId       → 204
 *   - DELETE /api/v1/groups/:id/members/:userId       → 204
 *   - POST   /api/v1/groups/:id/admins                → GroupAdmin
 *   - DELETE /api/v1/groups/:id/admins/:userId?scope= → 204
 *   - PUT    /api/v1/groups/:id/nested/:memberId      → 204
 *   - DELETE /api/v1/groups/:id/nested/:memberId      → 204
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

interface AdminGroup {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  kind: 'internal' | 'external' | 'rule_based';
  realm: string;
  organization_id: string | null;
  attributes: Record<string, unknown>;
  rule_query: Record<string, unknown> | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

interface GroupMember {
  group_id: string;
  user_id: string;
  added_at: string;
  added_by: string | null;
  expires_at: string | null;
}

const E2E_NOW = '2026-05-11T00:00:00Z';

function makeGroup(overrides: Partial<AdminGroup> = {}): AdminGroup {
  return {
    id: 'group-1',
    name: 'platform-eng',
    display_name: 'Platform engineers',
    description: 'Owners of the platform service tree.',
    kind: 'internal',
    realm: 'corp',
    organization_id: 'org-1',
    attributes: {},
    rule_query: null,
    status: 'active',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

const PLATFORM = makeGroup({
  id: 'group-1',
  name: 'platform-eng',
  display_name: 'Platform engineers',
});
const SALES = makeGroup({
  id: 'group-2',
  name: 'sales-na',
  display_name: 'Sales (North America)',
  kind: 'external',
  status: 'archived',
});
const SECURITY = makeGroup({
  id: 'group-3',
  name: 'sec-rule',
  display_name: 'Security on-call (rule-based)',
  kind: 'rule_based',
});

// Endpoint patterns
const GROUPS_SEARCH = /\/api\/v1\/groups\/search/;
const GROUPS_CREATE = /\/api\/v1\/groups$/;
const GROUP_INSPECT = (id: string) => new RegExp(`/api/v1/groups/${id}/inspect$`);
const GROUP_MEMBERS = (id: string) => new RegExp(`/api/v1/groups/${id}/members$`);
const GROUP_MEMBER = (id: string, uid: string) =>
  new RegExp(`/api/v1/groups/${id}/members/${uid}$`);
const GROUP_PATCH = (id: string) => new RegExp(`/api/v1/groups/${id}$`);

/** Escape regex metacharacters so a literal display name (which may
 * contain `(`/`)`/`.`) can be embedded inside a `new RegExp(...)`. */
function rx(literal: string): RegExp {
  return new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

interface MockSearchOpts {
  items?: AdminGroup[];
  total?: number;
}

async function mockSearchGroups(page: Page, opts: MockSearchOpts = {}) {
  const all = opts.items ?? [PLATFORM, SALES, SECURITY];
  await page.route(GROUPS_SEARCH, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q')?.toLowerCase() ?? '';
    const kind = url.searchParams.get('kind') ?? '';
    const status = url.searchParams.get('status') ?? '';
    let filtered = all.slice();
    if (q) {
      filtered = filtered.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.display_name.toLowerCase().includes(q),
      );
    }
    if (kind) filtered = filtered.filter((g) => g.kind === kind);
    if (status) filtered = filtered.filter((g) => g.status === status);
    await route.fulfill({
      json: { items: filtered, total: opts.total ?? filtered.length },
    });
  });
  return captureRequests(page, GROUPS_SEARCH);
}

async function mockInspectGroup(
  page: Page,
  group: AdminGroup,
  members: GroupMember[] = [],
): Promise<void> {
  await page.route(GROUP_INSPECT(group.id), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        group,
        direct_member_count: members.length,
        expiring_member_count: members.filter((m) => m.expires_at).length,
        admins: [
          {
            group_id: group.id,
            user_id: 'admin-user-1',
            scope: 'manage',
            granted_by: null,
            created_at: E2E_NOW,
          },
        ],
        parents: [],
        children: [{ id: 'group-99', name: 'platform-eng-junior' }],
        project_access_hint: 'reader on 3 projects',
      },
    });
  });
  await page.route(GROUP_MEMBERS(group.id), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: members });
  });
}

// ---------------------------------------------------------------------------
// Case 1 — list + pagination + search
// ---------------------------------------------------------------------------

test('lists groups with the mocked rows + pagination footer', async ({
  adminPage,
}) => {
  await mockSearchGroups(adminPage, { items: [PLATFORM, SALES, SECURITY] });
  await adminPage.goto('/control-panel/groups');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^groups$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /^← control panel$/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Each mocked group surfaces as a row with the display name as a
  // clickable inspect button + the handle below it.
  await expect(
    adminPage.getByRole('button', { name: PLATFORM.display_name }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: SALES.display_name }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: SECURITY.display_name }),
  ).toBeVisible();

  // Kind + status render per row. Use rx() to escape parens inside
  // "Sales (North America)" so the row accessor doesn't interpret
  // them as a capture group.
  const salesRow = adminPage.getByRole('row', { name: rx(SALES.display_name) });
  await expect(salesRow).toContainText(/external/);
  await expect(salesRow).toContainText(/archived/);

  // Pagination footer.
  await expect(
    adminPage.getByText(/page\s+1\s*\/\s*1\s*·\s*3\s+group\(s\)/i),
  ).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^← Prev$/ })).toBeDisabled();
  await expect(adminPage.getByRole('button', { name: /^Next →$/ })).toBeDisabled();
});

test('search: query + kind + status filters carry into /groups/search', async ({
  adminPage,
}) => {
  const cap = await mockSearchGroups(adminPage, { items: [PLATFORM, SALES, SECURITY] });
  await adminPage.goto('/control-panel/groups');
  await expect(adminPage.getByRole('button', { name: PLATFORM.display_name })).toBeVisible();

  const before = cap.calls.length;

  // q
  await adminPage.getByRole('textbox', { name: /^query$/i }).fill('platform');
  await expect(adminPage.getByRole('button', { name: PLATFORM.display_name })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: SALES.display_name })).toHaveCount(0);
  await expect.poll(() => cap.calls.length).toBeGreaterThan(before);
  expect(cap.last()?.url).toContain('q=platform');

  // kind (FilterBar exposes one combobox labeled "Kind" with the three
  // KIND_OPTIONS values + an "any" sentinel — pin the option set).
  const kindSelect = adminPage.getByRole('combobox', { name: /^kind$/i }).first();
  const kindValues = await kindSelect.locator('option').evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((el) => el.value),
  );
  expect(kindValues).toEqual(['', 'internal', 'external', 'rule_based']);

  // status: only active + archived (no `suspended`/`pending`).
  const statusSelect = adminPage.getByRole('combobox', { name: /^status$/i });
  const statusValues = await statusSelect.locator('option').evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((el) => el.value),
  );
  expect(statusValues).toEqual(['', 'active', 'archived']);

  await statusSelect.selectOption('archived');
  expect(cap.last()?.url).toContain('status=archived');
});

// ---------------------------------------------------------------------------
// Case 2 — Create group
// ---------------------------------------------------------------------------

test('create group: POSTs name + display_name + description + kind + realm', async ({
  adminPage,
}) => {
  await mockSearchGroups(adminPage, { items: [] });
  const cap = captureRequests(adminPage, GROUPS_CREATE);
  await adminPage.route(GROUPS_CREATE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      json: makeGroup({
        id: 'group-new-1',
        name: 'new-team',
        display_name: 'New team',
        description: 'Greenfield squad',
      }),
    });
  });

  await adminPage.goto('/control-panel/groups');
  await expect(
    adminPage.getByRole('heading', { name: /^create group$/i }),
  ).toBeVisible();

  await adminPage.getByRole('textbox', { name: /name \(handle\)/i }).fill('new-team');
  await adminPage.getByRole('textbox', { name: /display name/i }).fill('New team');
  await adminPage.getByRole('textbox', { name: /description \(optional\)/i }).fill('Greenfield squad');

  // The create form keeps `realm` default `local` and `kind` default `internal`.
  await adminPage.getByRole('button', { name: /^create group$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  const body = cap.last()?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    name: 'new-team',
    display_name: 'New team',
    description: 'Greenfield squad',
    kind: 'internal',
    realm: 'local',
  });
});

// ---------------------------------------------------------------------------
// Case 3 + 4 — Members: inspect panel + add member + remove member
// ---------------------------------------------------------------------------

test('inspect group: shows counts, admins, nested children, direct members', async ({
  adminPage,
}) => {
  const seedMember: GroupMember = {
    group_id: PLATFORM.id,
    user_id: 'user-existing-1',
    added_at: E2E_NOW,
    added_by: null,
    expires_at: '2026-12-31T00:00:00Z',
  };
  await mockSearchGroups(adminPage, { items: [PLATFORM] });
  await mockInspectGroup(adminPage, PLATFORM, [seedMember]);
  await adminPage.goto('/control-panel/groups');

  // Open inspection.
  await adminPage.getByRole('button', { name: PLATFORM.display_name }).click();
  await expect(
    adminPage.getByRole('heading', {
      name: new RegExp(`inspect:\\s+${PLATFORM.display_name}`, 'i'),
    }),
  ).toBeVisible();

  // Counts row: "direct 1, expiring 1".
  await expect(adminPage.getByText(/direct\s+1,\s+expiring\s+1/i)).toBeVisible();

  // Admin entry from the mock (`admin-user-1 · manage`) renders under
  // the Administrators sub-panel.
  await expect(
    adminPage.getByRole('heading', { name: /^administrators$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/admin-user-1.+manage/i).first()).toBeVisible();

  // Nested children sub-panel lists the mocked child. The child name
  // also appears in the `<dl>` counts row ("Children"), so scope the
  // assertion through the sub-section heading to keep strict-mode
  // happy.
  await expect(
    adminPage.getByRole('heading', { name: /^nested children$/i }),
  ).toBeVisible();
  const nestedSection = adminPage
    .getByRole('heading', { name: /^nested children$/i })
    .locator('xpath=ancestor::section[1]');
  await expect(nestedSection.getByText(/platform-eng-junior/i)).toBeVisible();

  // Direct members sub-panel shows the existing member.
  await expect(
    adminPage.getByRole('heading', { name: /^direct members$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/user-existing-1/i)).toBeVisible();
});

test('add member: PUTs /groups/:id/members/:userId from the inspection panel', async ({
  adminPage,
}) => {
  await mockSearchGroups(adminPage, { items: [PLATFORM] });
  await mockInspectGroup(adminPage, PLATFORM, []);

  const cap = captureRequests(adminPage, GROUP_MEMBER(PLATFORM.id, 'user-new-42'));
  await adminPage.route(
    GROUP_MEMBER(PLATFORM.id, 'user-new-42'),
    async (route: Route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      await route.fulfill({ status: 204, body: '' });
    },
  );

  await adminPage.goto('/control-panel/groups');
  await adminPage.getByRole('button', { name: PLATFORM.display_name }).click();
  await expect(
    adminPage.getByRole('heading', { name: /^direct members$/i }),
  ).toBeVisible();

  // The "User ID" textbox under "Direct members" is the second one on
  // the page (Administrators has its own). Scope through the section
  // heading to disambiguate.
  // Scope through the h3 → nearest `<section>` ancestor — the outer
  // InspectionPanel `<section>` ALSO contains this heading, so a
  // plain `.filter({ has: ... })` would match both.
  const directMembersSection = adminPage
    .getByRole('heading', { name: /^direct members$/i })
    .locator('xpath=ancestor::section[1]');
  await directMembersSection.getByRole('textbox', { name: /user id/i }).fill('user-new-42');
  await directMembersSection.getByRole('button', { name: /^add member$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('PUT');
  // No expires_at → empty body.
  expect(cap.last()?.body).toMatchObject({});
});

test('remove member: DELETEs /groups/:id/members/:userId from the row Remove button', async ({
  adminPage,
}) => {
  const member: GroupMember = {
    group_id: PLATFORM.id,
    user_id: 'user-existing-7',
    added_at: E2E_NOW,
    added_by: null,
    expires_at: null,
  };
  await mockSearchGroups(adminPage, { items: [PLATFORM] });
  await mockInspectGroup(adminPage, PLATFORM, [member]);

  const cap = captureRequests(adminPage, GROUP_MEMBER(PLATFORM.id, 'user-existing-7'));
  await adminPage.route(
    GROUP_MEMBER(PLATFORM.id, 'user-existing-7'),
    async (route: Route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      await route.fulfill({ status: 204, body: '' });
    },
  );

  await adminPage.goto('/control-panel/groups');
  await adminPage.getByRole('button', { name: PLATFORM.display_name }).click();
  const memberRow = adminPage.locator('li').filter({ hasText: 'user-existing-7' });
  await memberRow.getByRole('button', { name: /^remove$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('DELETE');
});

// ---------------------------------------------------------------------------
// Case 5 — Edit group (partial: archive/restore is the only mutation today)
// ---------------------------------------------------------------------------

test('row action — Archive: PATCH /groups/:id with { status: "archived" }', async ({
  adminPage,
}) => {
  await mockSearchGroups(adminPage, { items: [PLATFORM] });
  const cap = captureRequests(adminPage, GROUP_PATCH(PLATFORM.id));
  await adminPage.route(GROUP_PATCH(PLATFORM.id), async (route: Route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await route.fulfill({ json: makeGroup({ ...PLATFORM, status: 'archived' }) });
  });

  await adminPage.goto('/control-panel/groups');
  const row = adminPage.getByRole('row', { name: new RegExp(PLATFORM.display_name) });
  await row.getByRole('button', { name: /^archive$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('PATCH');
  expect(cap.last()?.body).toMatchObject({ status: 'archived' });
});

// ---------------------------------------------------------------------------
// Case 7 — Delete group (with native confirm)
// ---------------------------------------------------------------------------

test('delete group: confirms then DELETEs /groups/:id', async ({ adminPage }) => {
  await mockSearchGroups(adminPage, { items: [PLATFORM] });
  const cap = captureRequests(adminPage, GROUP_PATCH(PLATFORM.id));
  await adminPage.route(GROUP_PATCH(PLATFORM.id), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    await route.fulfill({ status: 204, body: '' });
  });

  let dialogMessage = '';
  adminPage.once('dialog', (dialog) => {
    dialogMessage = dialog.message();
    void dialog.accept();
  });

  await adminPage.goto('/control-panel/groups');
  const row = adminPage.getByRole('row', { name: new RegExp(PLATFORM.display_name) });
  await row.getByRole('button', { name: /^delete$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('DELETE');

  // The confirm copy names the group + the cascading effects. It does
  // NOT today include a member-count number (roadmap calls for that —
  // pin the absence in the absent-today test below).
  expect(dialogMessage).toMatch(/delete group "Platform engineers"/i);
  expect(dialogMessage).toMatch(/admins, members, and nested edges/i);
});

// ---------------------------------------------------------------------------
// Absent-today guards (cases 3 partial / 5 partial / 6 / 7 partial)
// ---------------------------------------------------------------------------

test('absent today: user autocomplete, full edit form, permissions surface, member-count delete warning', async ({
  adminPage,
}) => {
  await mockSearchGroups(adminPage, { items: [PLATFORM] });
  await mockInspectGroup(adminPage, PLATFORM, []);

  // Capture the dialog message BEFORE acting on the Delete button so
  // we can assert the absence of a member-count number alongside the
  // present "admins, members, and nested edges" copy.
  let capturedMessage = '';
  adminPage.once('dialog', (dialog) => {
    capturedMessage = dialog.message();
    // Dismiss — we only want to inspect the prompt, not delete.
    void dialog.dismiss();
  });

  await adminPage.goto('/control-panel/groups');
  await expect(adminPage.getByRole('button', { name: PLATFORM.display_name })).toBeVisible();

  // 1. No autocomplete picker for users — the add-member surface is a
  //    plain text input, not a combobox/listbox/searchable dropdown.
  await adminPage.getByRole('button', { name: PLATFORM.display_name }).click();
  await expect(
    adminPage.getByRole('heading', { name: /^direct members$/i }),
  ).toBeVisible();
  // Scope through the h3 → nearest `<section>` ancestor — the outer
  // InspectionPanel `<section>` ALSO contains this heading, so a
  // plain `.filter({ has: ... })` would match both.
  const directMembersSection = adminPage
    .getByRole('heading', { name: /^direct members$/i })
    .locator('xpath=ancestor::section[1]');
  expect(
    await directMembersSection.getByRole('combobox', { name: /user|search user/i }).count(),
  ).toBe(0);
  expect(
    await directMembersSection.getByRole('listbox').count(),
  ).toBe(0);

  // 2. No full edit form on the list — only Archive/Delete. The row
  //    does NOT expose an "Edit" button.
  const row = adminPage.getByRole('row', { name: new RegExp(PLATFORM.display_name) });
  expect(await row.getByRole('button', { name: /^edit$/i }).count()).toBe(0);
  expect(await row.getByRole('link', { name: /^edit$/i }).count()).toBe(0);

  // 3. No permissions/role assignment surface inside the inspection
  //    panel. Admins (manage / manage_members scope) are NOT generic
  //    permissions — pin that no permission picker exists.
  expect(
    await adminPage.getByRole('heading', { name: /permissions|roles/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /assign permission|add permission|grant role/i }).count(),
  ).toBe(0);

  // 4. Delete confirm does NOT include the member count today. Trigger
  //    Delete to populate `capturedMessage` via the dismiss handler.
  await row.getByRole('button', { name: /^delete$/i }).click();
  // The dialog handler fires synchronously inside Playwright; give it
  // a microtask to settle before reading the captured message.
  await expect.poll(() => capturedMessage.length).toBeGreaterThan(0);
  // Sanity: still the existing copy.
  expect(capturedMessage).toMatch(/admins, members, and nested edges/i);
  // Absent: no "N members" / "N affected" phrasing in the prompt.
  expect(capturedMessage).not.toMatch(/\d+\s+members?\b/i);
  expect(capturedMessage).not.toMatch(/\d+\s+affected/i);
});
