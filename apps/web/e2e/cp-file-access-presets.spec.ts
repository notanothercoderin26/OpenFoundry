import { type Page, type Route } from '@playwright/test';
import { DEFAULT_ERROR_ALLOWLIST, expect, test } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/control-panel/file-access-presets`
 * (apps/web/src/routes/control-panel/FileAccessPresetsPage.tsx).
 *
 * **Reality check.** The page configures
 * `settings.file_access_presets` on the control-panel payload:
 *
 *   - "Visibility requires Apply marking" warning banner.
 *   - Settings: Enable feature toggle + Guest-organization-behavior
 *     select (single locked option today: `primary_organization`).
 *   - Presets list: per-preset `<article>` card with typed inputs
 *     (ID, Title, Default order, Description), three comma/newline-
 *     separated textareas (Marking IDs, Organization IDs, Supported
 *     resource kinds), a Local-access-controls JSON textarea, an
 *     Enabled checkbox, the "Updated by/at" footer, and a Remove
 *     preset button.
 *   - "Visibility probe" — Organization + Primary org + Resource
 *     kind inputs, "Check visible presets" POSTs
 *     `/file-access-presets/visible`.
 *   - "Known markings" — read-only chip list of markings the caller
 *     can see.
 *   - "History" — read-only audit list.
 *   - Single "Save file access presets" button that PUTs
 *     `/control-panel` with `{ file_access_presets: config }`.
 *
 * Mapping the requested cases:
 *
 *   - Case 1 (lista de presets) ✅
 *   - Case 2 ("crear preset: nombre + matriz de permisos") ⚠️ —
 *     "Add preset" stubs a card with `title: 'New file preset'`,
 *     `supported_resource_kinds: ['project']`, empty markings /
 *     orgs / controls. There is NO matrix-grid permissions picker —
 *     local controls are a free-form JSON array.
 *   - Case 3 ("asignar como default a proyecto/tipo de archivo")
 *     ⚠️ — the `default_order` integer + `supported_resource_kinds`
 *     list encode this: the lowest default_order wins per resource
 *     kind. There is no explicit "Set as default" CTA or
 *     per-project assignment surface.
 *   - Case 4 (eliminar) ✅
 *
 * Endpoints:
 *   - GET  /api/v1/control-panel
 *   - PUT  /api/v1/control-panel
 *   - GET  /api/v1/organizations
 *   - GET  /api/v1/marking-categories?...
 *   - GET  /api/v1/marking-categories/:id/markings?...
 *   - POST /api/v1/file-access-presets/visible
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

interface FileAccessPresetLocalAccessControl {
  id: string;
  kind: string;
  label: string;
  values: string[];
  metadata?: Record<string, unknown>;
}

interface FileAccessPreset {
  id: string;
  title: string;
  description?: string;
  marking_ids: string[];
  local_access_controls: FileAccessPresetLocalAccessControl[];
  organization_ids: string[];
  supported_resource_kinds: string[];
  default_order: number;
  enabled: boolean;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

interface FileAccessPresetConfig {
  enabled: boolean;
  warning: string;
  guest_organization_behavior: 'primary_organization';
  presets: FileAccessPreset[];
  history: {
    id: string;
    actor: string;
    timestamp: string;
    action: string;
    summary: string;
    preset_count: number;
    enabled: boolean;
    guest_organization_behavior: string;
    warning: string;
  }[];
}

const E2E_NOW = '2026-05-11T00:00:00Z';

const PRESET_DEFAULT_PROJECT: FileAccessPreset = {
  id: 'preset-default-project',
  title: 'Default project (public)',
  description: 'Public markings + read access for tenant members.',
  marking_ids: ['marking-public'],
  local_access_controls: [],
  organization_ids: ['org-1'],
  supported_resource_kinds: ['project'],
  default_order: 1,
  enabled: true,
  updated_by: 'admin-user',
  updated_at: '2026-05-10T08:00:00Z',
};

const PRESET_PII: FileAccessPreset = {
  id: 'preset-pii',
  title: 'PII restricted dataset',
  description: 'Datasets carrying PII markings + ACL local control.',
  marking_ids: ['marking-pii-sensitive'],
  local_access_controls: [
    { id: 'lac-1', kind: 'role', label: 'Data engineers', values: ['data-eng'] },
  ],
  organization_ids: ['org-1'],
  supported_resource_kinds: ['dataset'],
  default_order: 2,
  enabled: true,
};

const DEFAULT_FILE_ACCESS: FileAccessPresetConfig = {
  enabled: true,
  warning:
    'File access presets only pre-fill supported resource-creation security controls.',
  guest_organization_behavior: 'primary_organization',
  presets: [PRESET_DEFAULT_PROJECT, PRESET_PII],
  history: [
    {
      id: 'hist-1',
      actor: 'admin-user',
      timestamp: '2026-05-10T08:00:00Z',
      action: 'preset_saved',
      summary: 'Saved Default project preset',
      preset_count: 2,
      enabled: true,
      guest_organization_behavior: 'primary_organization',
      warning: '',
    },
  ],
};

function buildControlPanelSettings(
  fileAccessPresets: FileAccessPresetConfig = DEFAULT_FILE_ACCESS,
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
    scoped_sessions: {
      enabled: false,
      allow_no_scoped_session: true,
      always_show_selector: false,
      allowed_bypass_groups: [],
      presets: [],
    },
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
    file_access_presets: fileAccessPresets,
    updated_by: 'admin@example.com',
    updated_at: E2E_NOW,
  };
}

// Endpoint patterns
const CONTROL_PANEL = /\/api\/v1\/control-panel$/;
const ORGS_LIST = /\/api\/v1\/organizations(?:\?|$)/;
const MARKING_CATEGORIES = /\/api\/v1\/marking-categories(?:\?|$)/;
const PRESETS_VISIBLE = /\/api\/v1\/file-access-presets\/visible$/;

interface MocksOpts {
  fileAccessPresets?: FileAccessPresetConfig;
}

async function mockFileAccess(page: Page, opts: MocksOpts = {}) {
  const cfg = opts.fileAccessPresets ?? DEFAULT_FILE_ACCESS;

  await page.route(CONTROL_PANEL, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: buildControlPanelSettings(cfg) });
      return;
    }
    if (route.request().method() === 'PUT') {
      const raw = route.request().postDataJSON() as {
        file_access_presets?: FileAccessPresetConfig;
      };
      await route.fulfill({
        json: buildControlPanelSettings(raw.file_access_presets ?? cfg),
      });
      return;
    }
    await route.fallback();
  });

  await page.route(ORGS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        items: [
          {
            id: 'org-1',
            slug: 'acme',
            display_name: 'Acme Corporation',
            description: '',
            contact_email: null,
            organization_type: 'tenant',
            default_workspace: 'default',
            tenant_tier: 'enterprise',
            status: 'active',
            metadata: {},
            settings: {},
            quotas: {},
            created_at: E2E_NOW,
            updated_at: E2E_NOW,
          },
        ],
      },
    });
  });

  // Empty marking catalog → no per-category /markings calls fire.
  await page.route(MARKING_CATEGORIES, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { items: [] } });
  });

  return captureRequests(page, CONTROL_PANEL);
}

async function waitForPut(
  cap: ReturnType<typeof captureRequests>,
): Promise<{ method: string; body: unknown }> {
  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'PUT').length)
    .toBeGreaterThanOrEqual(1);
  const puts = cap.calls.filter((c) => c.method === 'PUT');
  return puts[puts.length - 1];
}

/**
 * Each preset card carries its `id` inside an `<input value="…">` —
 * `<article>` text content doesn't include input values, so we have
 * to filter by descendant input instead of `hasText`.
 */
function presetCardById(page: Page, id: string) {
  return page
    .locator('article')
    .filter({ has: page.locator(`input[value="${id}"]`) })
    .first();
}

// ---------------------------------------------------------------------------
// Case 1 — list presets + settings + warning
// ---------------------------------------------------------------------------

test('renders settings, warning banner, both seeded preset cards, and the history entry', async ({
  adminPage,
}) => {
  await mockFileAccess(adminPage);
  await adminPage.goto('/control-panel/file-access-presets');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^file access presets$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('link', { name: /back to control panel/i }),
  ).toHaveAttribute('href', /\/control-panel$/);

  // Warning banner copy.
  await expect(
    adminPage.getByText(/visibility requires apply marking\./i),
  ).toBeVisible();

  // Settings: Enable feature toggle hydrates from the config.
  await expect(
    adminPage.getByRole('checkbox', { name: /enable file access presets/i }),
  ).toBeChecked();
  // Guest organization behavior combobox renders with the single
  // supported option today.
  const guestBehavior = adminPage.getByRole('combobox', { name: /guest organization behavior/i });
  const guestValues = await guestBehavior.locator('option').evaluateAll((els) =>
    (els as HTMLOptionElement[]).map((el) => el.value),
  );
  expect(guestValues).toEqual(['primary_organization']);

  // Both fixture preset cards render.
  const defaultProjectCard = presetCardById(adminPage, 'preset-default-project');
  const piiCard = presetCardById(adminPage, 'preset-pii');
  await expect(defaultProjectCard).toBeVisible();
  await expect(piiCard).toBeVisible();

  // Each card hydrates its typed inputs from the payload.
  await expect(
    defaultProjectCard.getByRole('textbox', { name: /^title$/i }),
  ).toHaveValue('Default project (public)');
  await expect(
    defaultProjectCard.getByRole('spinbutton', { name: /default order/i }),
  ).toHaveValue('1');
  await expect(
    defaultProjectCard.getByRole('textbox', { name: /marking ids/i }),
  ).toHaveValue('marking-public');
  await expect(
    defaultProjectCard.getByRole('textbox', { name: /supported resource kinds/i }),
  ).toHaveValue('project');
  await expect(
    defaultProjectCard.getByRole('checkbox', { name: /^enabled$/i }),
  ).toBeChecked();

  // History entry surfaces.
  const history = adminPage
    .getByText(/^history$/i)
    .locator('xpath=ancestor::section[1]');
  await expect(history).toContainText(/saved default project preset/i);
  await expect(history).toContainText(/presets:\s+2/i);
});

// ---------------------------------------------------------------------------
// Case 2 + 3 — add preset (typed permissions matrix via comma lists)
// ---------------------------------------------------------------------------

test('add preset: clicking Add preset stubs a card; Save PUTs the new preset (defaults to project + order=N)', async ({
  adminPage,
}) => {
  const cap = await mockFileAccess(adminPage);
  await adminPage.goto('/control-panel/file-access-presets');
  await expect(presetCardById(adminPage, 'preset-default-project')).toBeVisible();

  await adminPage.getByRole('button', { name: /^add preset$/i }).click();

  // The new card has `title: 'New file preset'`, the id is generated
  // from Date.now() so we locate it by title input value.
  const newCard = adminPage
    .locator('article')
    .filter({ has: adminPage.locator('input[value="New file preset"]') })
    .first();
  await expect(newCard).toBeVisible();
  // Default order = current presets length + 1 → 3 with our fixture.
  await expect(
    newCard.getByRole('spinbutton', { name: /default order/i }),
  ).toHaveValue('3');
  // Default supported_resource_kinds: ['project'].
  await expect(
    newCard.getByRole('textbox', { name: /supported resource kinds/i }),
  ).toHaveValue('project');
  // Marking IDs, Organization IDs start empty.
  await expect(
    newCard.getByRole('textbox', { name: /^marking ids$/i }),
  ).toHaveValue('');

  await adminPage.getByRole('button', { name: /^save file access presets$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { file_access_presets: FileAccessPresetConfig };
  expect(body.file_access_presets.presets).toHaveLength(3);
  expect(body.file_access_presets.presets[2]).toMatchObject({
    title: 'New file preset',
    supported_resource_kinds: ['project'],
    default_order: 3,
    marking_ids: [],
    organization_ids: [],
    local_access_controls: [],
    enabled: true,
  });

  await expect(adminPage.locator('.of-status-success').first()).toContainText(/^saved$/i);
});

// ---------------------------------------------------------------------------
// Case 2 + 3 — edit permissions matrix + default_order on an existing preset
// ---------------------------------------------------------------------------

test('edit preset matrix: typed markings + resource kinds + default_order round-trip into the PUT body', async ({
  adminPage,
}) => {
  const cap = await mockFileAccess(adminPage);
  await adminPage.goto('/control-panel/file-access-presets');

  const piiCard = presetCardById(adminPage, 'preset-pii');
  await expect(piiCard).toBeVisible();

  // Edit Marking IDs (comma list → string[]), Supported resource kinds
  // (newline list → string[]) and bump default_order to 1 so it wins
  // as the default for `dataset`.
  await piiCard
    .getByRole('textbox', { name: /^marking ids$/i })
    .fill('marking-pii-sensitive, marking-pii-restricted');
  await piiCard
    .getByRole('textbox', { name: /supported resource kinds/i })
    .fill('dataset\nproject');
  await piiCard
    .getByRole('spinbutton', { name: /default order/i })
    .fill('1');

  await adminPage.getByRole('button', { name: /^save file access presets$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { file_access_presets: FileAccessPresetConfig };
  const updated = body.file_access_presets.presets.find((p) => p.id === 'preset-pii');
  expect(updated).toMatchObject({
    marking_ids: ['marking-pii-sensitive', 'marking-pii-restricted'],
    supported_resource_kinds: ['dataset', 'project'],
    default_order: 1,
  });
});

// ---------------------------------------------------------------------------
// Case 4 — remove preset
// ---------------------------------------------------------------------------

test('remove preset: Remove preset drops the card; Save PUTs the shorter list', async ({
  adminPage,
}) => {
  const cap = await mockFileAccess(adminPage);
  await adminPage.goto('/control-panel/file-access-presets');

  const piiCard = presetCardById(adminPage, 'preset-pii');
  await expect(piiCard).toBeVisible();
  await piiCard.getByRole('button', { name: /^remove preset$/i }).click();

  await expect(presetCardById(adminPage, 'preset-pii')).toHaveCount(0);
  await expect(presetCardById(adminPage, 'preset-default-project')).toBeVisible();

  await adminPage.getByRole('button', { name: /^save file access presets$/i }).click();

  const put = await waitForPut(cap);
  const body = put.body as { file_access_presets: FileAccessPresetConfig };
  expect(body.file_access_presets.presets).toHaveLength(1);
  expect(body.file_access_presets.presets[0]).toMatchObject({ id: 'preset-default-project' });
});

// ---------------------------------------------------------------------------
// Visibility probe (closest "filter / preview" surface)
// ---------------------------------------------------------------------------

test('visibility probe: POSTs /file-access-presets/visible with the form payload + renders the filtered presets', async ({
  adminPage,
}) => {
  await mockFileAccess(adminPage);
  const cap = captureRequests(adminPage, PRESETS_VISIBLE);
  await adminPage.route(PRESETS_VISIBLE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      json: {
        warning: '',
        guest_organization_behavior: 'primary_organization',
        effective_organization_id: 'org-1',
        default_preset_id: 'preset-default-project',
        filtered_preset_count: 1,
        presets: [PRESET_DEFAULT_PROJECT],
      },
    });
  });

  await adminPage.goto('/control-panel/file-access-presets');
  await expect(presetCardById(adminPage, 'preset-default-project')).toBeVisible();

  // Scope to the Visibility-probe section — the preset cards above
  // also expose a "Supported resource kinds" textbox that would
  // otherwise collide with /resource kind/i.
  const probeSection = adminPage
    .getByText(/^visibility probe$/i)
    .locator('xpath=ancestor::section[1]');
  await probeSection
    .getByRole('combobox', { name: /^organization$/i })
    .selectOption('org-1');
  await probeSection
    .getByRole('textbox', { name: /^resource kind$/i })
    .fill('project');
  await probeSection.getByRole('button', { name: /^check visible presets$/i }).click();

  await expect.poll(() => cap.count()).toBeGreaterThanOrEqual(1);
  expect(cap.last()?.method).toBe('POST');
  expect(cap.last()?.body).toMatchObject({
    organization_id: 'org-1',
    resource_kind: 'project',
  });

  // Result summary line surfaces the effective org + default + count.
  await expect(
    adminPage.getByText(/effective organization org-1, default preset preset-default-project, filtered 1\./i),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Absent-today guards — cases 2 + 3 partial
// ---------------------------------------------------------------------------

test('absent today: no permissions-matrix grid picker, no per-project "Set as default" CTA', async ({
  adminPage,
}) => {
  await mockFileAccess(adminPage);
  await adminPage.goto('/control-panel/file-access-presets');
  await expect(presetCardById(adminPage, 'preset-default-project')).toBeVisible();

  // 1. No matrix-grid picker. Permissions are encoded as comma/newline
  //    lists of Marking IDs, Organization IDs and Supported resource
  //    kinds — there is no role="grid" or checkbox grid of markings.
  expect(await adminPage.getByRole('grid').count()).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /permissions matrix|marking matrix|controls matrix/i }).count(),
  ).toBe(0);

  // 2. No explicit "Set as default" / "Set default for project" CTA.
  //    Default-preset assignment is encoded via the `default_order`
  //    spinbutton (lowest wins for a given resource kind).
  expect(
    await adminPage.getByRole('button', { name: /set (as )?default|make default/i }).count(),
  ).toBe(0);

  // 3. No per-project assignment surface ("Assign to project X").
  //    Resource binding is via `supported_resource_kinds`.
  expect(
    await adminPage.getByRole('button', { name: /assign to project|assign to file type|attach to project/i }).count(),
  ).toBe(0);
  expect(
    await adminPage.getByRole('heading', { name: /per-project assignment|project assignments|file-type defaults/i }).count(),
  ).toBe(0);
});
