import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/scoped-sessions`
 * (apps/web/src/routes/control-panel/ScopedSessionsPage.tsx).
 *
 * **Reality check.** The page is a **configuration** surface for the
 * scoped-session FEATURE — not a live list of currently-active scoped
 * sessions per user. It edits `settings.scoped_sessions` on the
 * control-panel payload:
 *
 *   - 3 feature toggles: Enabled, "No scoped session bypass"
 *     (allow_no_scoped_session), Always show selector.
 *   - `Allowed bypass groups` — single comma-separated input.
 *   - "Presets" list — each preset has stable_id, name, description,
 *     required_markings, active_markings, enabled. Templates that
 *     users pick when starting a scoped session.
 *   - "Known markings" panel — read-only chips sourced from
 *     /marking-categories + per-category /markings.
 *   - One "Save scoped sessions" button at the bottom — PUTs
 *     `/control-panel` with `{ scoped_sessions: config }` and shows
 *     a "Saved" success banner.
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (lista de sesiones con scope reducido) ⚠️ — the page
 *     lists PRESETS (templates), not active per-user sessions.
 *   - Case 2 ("crear sesión: usuario + scope + duración") ⚠️ —
 *     "Add preset" creates a preset stub. There is NO user picker
 *     and NO duration field; presets define markings only.
 *   - Case 3 (revocar) ⚠️ — "Remove" deletes a preset from the
 *     in-memory list. There is no per-session revocation; once the
 *     edit is saved, future scoped sessions can no longer adopt
 *     the removed preset.
 *   - Case 4 (audit) ❌ not exposed on this page.
 *
 * Endpoints (mirrors `src/lib/api/control-panel.ts` + `auth.ts` +
 * `marking-categories.ts`):
 *   - GET  /api/v1/control-panel               → ControlPanelSettings
 *   - PUT  /api/v1/control-panel               → ControlPanelSettings
 *   - GET  /api/v1/groups?limit=500            → GroupRecord[]
 *   - GET  /api/v1/marking-categories?...      → { items: MarkingCategoryResponse[] }
 *   - GET  /api/v1/marking-categories/:id/markings?... → { items: MarkingResponse[] }
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

interface ScopedSessionPreset {
  id: string;
  name: string;
  description?: string;
  required_markings: string[];
  allowed_markings: string[];
  enabled: boolean;
}

interface ScopedSessionConfig {
  enabled: boolean;
  allow_no_scoped_session: boolean;
  always_show_selector: boolean;
  allowed_bypass_groups: string[];
  presets: ScopedSessionPreset[];
}

const E2E_NOW = '2026-05-11T00:00:00Z';

const DEFAULT_SCOPED_SESSIONS: ScopedSessionConfig = {
  enabled: true,
  allow_no_scoped_session: false,
  always_show_selector: true,
  allowed_bypass_groups: ['security-admins', 'data-governance'],
  presets: [
    {
      id: 'pii-restricted',
      name: 'PII restricted',
      description: 'Only PII workloads, no exports.',
      required_markings: ['marking-pii-sensitive'],
      allowed_markings: ['marking-pii-sensitive', 'marking-pii-restricted'],
      enabled: true,
    },
    {
      id: 'training',
      name: 'Training data only',
      description: 'Sandbox markings for ML workflows.',
      required_markings: ['marking-training'],
      allowed_markings: ['marking-training'],
      enabled: false,
    },
  ],
};

/**
 * Skeleton ControlPanelSettings. The ScopedSessionsPage only reads
 * `settings.scoped_sessions` so the other fields are stubbed with
 * the smallest valid shape — Go-side ControlPanelPage would need
 * more, but this spec only ever hits the scoped-sessions slice.
 */
function buildControlPanelSettings(
  scopedSessions: ScopedSessionConfig = DEFAULT_SCOPED_SESSIONS,
) {
  return {
    platform_name: 'OpenFoundry E2E',
    support_email: 'support@example.com',
    docs_url: '',
    status_page_url: '',
    announcement_banner: '',
    maintenance_mode: false,
    release_channel: 'stable',
    default_region: 'us-east-1',
    deployment_mode: 'cloud',
    allow_self_signup: false,
    supported_locales: ['en'],
    default_locale: 'en',
    allowed_email_domains: [],
    default_app_branding: {
      display_name: 'OpenFoundry',
      primary_color: '#0a0a0a',
      accent_color: '#3b82f6',
      logo_url: null,
      favicon_url: null,
      show_powered_by: true,
    },
    restricted_operations: [],
    identity_provider_mappings: [],
    resource_management_policies: [],
    upgrade_assistant: {
      current_version: '2026.05.10',
      target_version: '2026.05.10',
      maintenance_window: '',
      rollback_channel: 'stable',
      preflight_checks: [],
      rollout_stages: [],
      rollback_steps: [],
    },
    scoped_sessions: scopedSessions,
    application_access: {
      enabled: false,
      default_visibility: 'visible',
      warning: '',
      applications: [],
      rules: [],
      approval_policy: {
        mode: 'self_approve',
        reviewer_user_ids: [],
        reviewer_group_ids: [],
        require_distinct_reviewer_for_policy: false,
      },
      change_requests: [],
      history: [],
    },
    member_discovery: {
      default_discover_users: true,
      default_discover_groups: true,
      warning: '',
      organizations: [],
      history: [],
    },
    file_access_presets: {
      enabled: false,
      warning: '',
      guest_organization_behavior: 'primary_organization',
      presets: [],
      history: [],
    },
    updated_by: 'admin@example.com',
    updated_at: E2E_NOW,
  };
}

// Endpoint patterns
const CONTROL_PANEL = /\/api\/v1\/control-panel$/;
const GROUPS_LIST = /\/api\/v1\/groups(?:\?|$)/;
const MARKING_CATEGORIES = /\/api\/v1\/marking-categories(?:\?|$)/;

interface MocksOpts {
  scopedSessions?: ScopedSessionConfig;
  groups?: { id: string; name: string }[];
}

async function mockControlPanel(page: Page, opts: MocksOpts = {}) {
  const scoped = opts.scopedSessions ?? DEFAULT_SCOPED_SESSIONS;
  const settings = buildControlPanelSettings(scoped);

  await page.route(CONTROL_PANEL, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: settings });
      return;
    }
    if (route.request().method() === 'PUT') {
      // Echo the merged config back so the page hydrates after save.
      const raw = route.request().postDataJSON() as { scoped_sessions?: ScopedSessionConfig };
      const next = buildControlPanelSettings(raw.scoped_sessions ?? scoped);
      await route.fulfill({ json: next });
      return;
    }
    await route.fallback();
  });

  await page.route(GROUPS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: opts.groups ?? [] });
  });

  // The page calls listMarkingCategories(true) → /marking-categories?
  // include_hidden=true. Return an empty catalog so the per-category
  // /markings calls don't fire (the Promise.all over `categoryResp.items`
  // is empty → no follow-up).
  await page.route(MARKING_CATEGORIES, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: [] } });
  });

  return captureRequests(page, CONTROL_PANEL);
}

/**
 * Locate a preset card by the value of its `Name` `<input>`. The card
 * has no DOM text equal to the preset name (the name lives inside
 * `<input value="...">`), so `filter({ hasText })` cannot find it —
 * we have to match a descendant input by its value attribute.
 */
function presetCard(page: Page, name: string) {
  return page
    .locator('article')
    .filter({ has: page.locator(`input[value="${name}"]`) })
    .first();
}

// ---------------------------------------------------------------------------
// Case 1 — list the config + the preset rows
// ---------------------------------------------------------------------------

test('renders the scoped-sessions config + the preset list', async ({
  adminPage,
}) => {
  await mockControlPanel(adminPage, {
    groups: [
      { id: 'g-1', name: 'security-admins' },
      { id: 'g-2', name: 'data-governance' },
    ],
  });
  await adminPage.goto('/control-panel/scoped-sessions');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^scoped sessions$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /back to control panel/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // The three feature toggles hydrate from `scoped_sessions.{enabled,
  // allow_no_scoped_session, always_show_selector}`.
  await expect(adminPage.getByRole('checkbox', { name: /^enabled$/i }).first()).toBeChecked();
  await expect(
    adminPage.getByRole('checkbox', { name: /no scoped session bypass/i }),
  ).not.toBeChecked();
  await expect(
    adminPage.getByRole('checkbox', { name: /always show selector/i }),
  ).toBeChecked();

  // Allowed-bypass-groups input round-trips the comma-joined list.
  await expect(
    adminPage.getByRole('textbox', { name: /allowed bypass groups/i }),
  ).toHaveValue('security-admins, data-governance');

  // Both fixture presets render as their own cards with their name.
  await expect(presetCard(adminPage, 'PII restricted')).toBeVisible();
  await expect(presetCard(adminPage, 'Training data only')).toBeVisible();

  // Per-preset markings round-trip into the inputs.
  const piiCard = presetCard(adminPage, 'PII restricted');
  await expect(
    piiCard.getByRole('textbox', { name: /required markings/i }),
  ).toHaveValue('marking-pii-sensitive');
  await expect(
    piiCard.getByRole('textbox', { name: /active markings/i }),
  ).toHaveValue('marking-pii-sensitive, marking-pii-restricted');

  // PII preset is enabled, Training is disabled — pin each.
  await expect(piiCard.getByRole('checkbox', { name: /^enabled$/i })).toBeChecked();
  await expect(
    presetCard(adminPage, 'Training data only').getByRole('checkbox', { name: /^enabled$/i }),
  ).not.toBeChecked();
});

// ---------------------------------------------------------------------------
// Case 2 (partial) — "Add preset" + Save PUTs the new presets list
// ---------------------------------------------------------------------------

test('add preset: clicking Add preset appends a stub; Save PUTs the new presets list', async ({
  adminPage,
}) => {
  const cap = await mockControlPanel(adminPage);
  await adminPage.goto('/control-panel/scoped-sessions');

  // Wait for both fixture presets, then click Add preset.
  await expect(presetCard(adminPage, 'PII restricted')).toBeVisible();
  await adminPage.getByRole('button', { name: /^add preset$/i }).click();

  // New stub appears with `Session N` name + `session-N` id (N = 3
  // because the fixture has 2 presets to start with).
  const newCard = presetCard(adminPage, 'Session 3');
  await expect(newCard).toBeVisible();
  await expect(
    newCard.getByRole('textbox', { name: /^stable id$/i }),
  ).toHaveValue('session-3');
  // Default required+active markings are `['public']`.
  await expect(
    newCard.getByRole('textbox', { name: /required markings/i }),
  ).toHaveValue('public');

  await adminPage.getByRole('button', { name: /^save scoped sessions$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { scoped_sessions: ScopedSessionConfig };
  expect(body.scoped_sessions.presets).toHaveLength(3);
  expect(body.scoped_sessions.presets[2]).toMatchObject({
    id: 'session-3',
    name: 'Session 3',
    required_markings: ['public'],
    allowed_markings: ['public'],
    enabled: true,
  });

  // Success banner appears after a 2xx response.
  await expect(adminPage.locator('.of-status-success').first()).toContainText(/^saved$/i);
});

// ---------------------------------------------------------------------------
// Case 2 — edit preset markings (typed + comma-separated) then Save
// ---------------------------------------------------------------------------

test('edit preset markings: typed comma list saves into required + active arrays', async ({
  adminPage,
}) => {
  const cap = await mockControlPanel(adminPage);
  await adminPage.goto('/control-panel/scoped-sessions');

  const piiCard = presetCard(adminPage, 'PII restricted');
  await expect(piiCard).toBeVisible();

  await piiCard
    .getByRole('textbox', { name: /required markings/i })
    .fill('marking-pii-sensitive, marking-export-controlled');
  await piiCard
    .getByRole('textbox', { name: /active markings/i })
    .fill('marking-pii-sensitive, marking-pii-restricted, marking-export-controlled');

  await adminPage.getByRole('button', { name: /^save scoped sessions$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { scoped_sessions: ScopedSessionConfig };
  expect(body.scoped_sessions.presets[0]).toMatchObject({
    id: 'pii-restricted',
    required_markings: ['marking-pii-sensitive', 'marking-export-controlled'],
    allowed_markings: [
      'marking-pii-sensitive',
      'marking-pii-restricted',
      'marking-export-controlled',
    ],
  });
});

// ---------------------------------------------------------------------------
// Case 3 (closest equivalent) — Remove preset + Save drops it from the PUT
// ---------------------------------------------------------------------------

test('remove preset: Remove drops the card; Save PUTs the shortened presets list', async ({
  adminPage,
}) => {
  const cap = await mockControlPanel(adminPage);
  await adminPage.goto('/control-panel/scoped-sessions');

  const trainingCard = presetCard(adminPage, 'Training data only');
  await expect(trainingCard).toBeVisible();
  await trainingCard.getByRole('button', { name: /^remove$/i }).click();

  // Card disappears immediately (in-memory state).
  await expect(presetCard(adminPage, 'Training data only')).toHaveCount(0);
  await expect(presetCard(adminPage, 'PII restricted')).toBeVisible();

  await adminPage.getByRole('button', { name: /^save scoped sessions$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { scoped_sessions: ScopedSessionConfig };
  expect(body.scoped_sessions.presets).toHaveLength(1);
  expect(body.scoped_sessions.presets[0]).toMatchObject({ id: 'pii-restricted' });
});

// ---------------------------------------------------------------------------
// Case 1 — toggle the feature on/off via the Enabled checkbox + Save
// ---------------------------------------------------------------------------

test('toggle Enabled + bypass groups: Save PUTs the patched config', async ({
  adminPage,
}) => {
  const cap = await mockControlPanel(adminPage);
  await adminPage.goto('/control-panel/scoped-sessions');

  // Wait for the form to settle, then flip the top-level Enabled
  // checkbox and add a third bypass group.
  const enabledCheckbox = adminPage.getByRole('checkbox', { name: /^enabled$/i }).first();
  await expect(enabledCheckbox).toBeChecked();
  await enabledCheckbox.uncheck();

  await adminPage
    .getByRole('textbox', { name: /allowed bypass groups/i })
    .fill('security-admins, data-governance, on-call');

  await adminPage.getByRole('button', { name: /^save scoped sessions$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { scoped_sessions: ScopedSessionConfig };
  expect(body.scoped_sessions).toMatchObject({
    enabled: false,
    allowed_bypass_groups: ['security-admins', 'data-governance', 'on-call'],
  });
});

// ---------------------------------------------------------------------------
// Absent-today guards — cases 1 / 2 / 3 / 4 partial
// ---------------------------------------------------------------------------

test('absent today: active-session list, per-user picker, duration field, audit log', async ({
  adminPage,
}) => {
  await mockControlPanel(adminPage);
  await adminPage.goto('/control-panel/scoped-sessions');
  await expect(presetCard(adminPage, 'PII restricted')).toBeVisible();

  // 1. No table / list of currently-active scoped sessions per user
  //    — the page edits PRESETS (templates), not live sessions.
  expect(await adminPage.getByRole('table').count()).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /active sessions|live sessions|current sessions/i }).count(),
  ).toBe(0);

  // 2. The Add-preset row does NOT expose a user picker or a duration
  //    input. Scope into the PII card and confirm no User / Duration
  //    field surfaces inside any preset card.
  const piiCard = presetCard(adminPage, 'PII restricted');
  expect(
    await piiCard.getByRole('textbox', { name: /^user( id)?$|assigned to|principal/i }).count(),
  ).toBe(0);
  expect(
    await piiCard.getByRole('combobox', { name: /^user( id)?$|assigned to|principal/i }).count(),
  ).toBe(0);
  expect(
    await piiCard.getByRole('textbox', { name: /duration|expires|ttl/i }).count(),
  ).toBe(0);
  expect(
    await piiCard.getByRole('spinbutton', { name: /duration|expires|ttl|minutes|hours/i }).count(),
  ).toBe(0);

  // 3. There is no "Revoke session" CTA; the only mutation is
  //    "Remove" on the preset.
  expect(
    await adminPage.getByRole('button', { name: /revoke session|terminate session|kill session/i }).count(),
  ).toBe(0);

  // 4. No audit-log surface. The page does not call any audit-events
  //    endpoint and does not render an audit list.
  expect(
    await adminPage.getByRole('heading', { name: /audit (log|events)|history/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /load audit|view audit|audit log/i }).count(),
  ).toBe(0);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForPut(
  cap: ReturnType<typeof captureRequests>,
): Promise<{ method: string; body: unknown }> {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'PUT').length)
    .toBeGreaterThanOrEqual(1);
  const puts = cap.calls.filter((c) => c.method === 'PUT');
  return puts[puts.length - 1];
}
