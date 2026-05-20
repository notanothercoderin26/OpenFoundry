import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/foundry-rules`
 * (apps/web/src/routes/foundry-rules/FoundryRulesPage.tsx, ~660 lines).
 *
 * **Reality vs roadmap.** The shipped page is a CRUD form, NOT a
 * structured rule builder:
 *
 *   - Object-type-scoped rules list (left) with a `New rule` button.
 *   - Drawer (`role="dialog" aria-label="New foundry rule"` /
 *     `"Edit foundry rule"`) with text/select fields plus two RAW
 *     `JsonEditor` `<textarea>`s for `trigger_spec` and `effect_spec`.
 *   - Existing rules: drawer adds a `Simulate / Apply` section
 *     scoped by `object_id`. Delete prompts `window.confirm`.
 *   - Right panel shows machinery insights + queue metrics; the
 *     workflow section only mounts when a workflow is picked.
 *
 * Mismatches with the original task ask, pinned in the final guard test:
 *   - NO structured trigger picker (event / schedule / manual). Triggers
 *     are JSON shapes like `{ "numeric_gte": { "score": 0.8 } }`.
 *   - NO AND/OR condition builder.
 *   - NO action picker for `send notification` / `run pipeline` / `call
 *     webhook`. The shipped effect kinds are `alert` / `object_patch` /
 *     `schedule` and are also raw JSON.
 *   - NO "Dry run" button — the corresponding control is named
 *     `Simulate`, and it requires an existing rule + object id.
 *   - NO active/disable toggle. The closest knob is `evaluation_mode`
 *     (`advisory | automatic`) on each rule.
 *   - NO in-page execution-history table. Workflow runs only appear in
 *     the workflow-scoped sidebar when a workflow is selected.
 *
 * Endpoints exercised:
 *   - GET    /api/v1/ontology/object-types?per_page=200
 *   - GET    /api/v1/workflows?per_page=200
 *   - GET    /api/v1/ontology/rules?object_type_id={id}&per_page=100
 *   - GET    /api/v1/ontology/rules/insights?object_type_id={id}
 *   - GET    /api/v1/ontology/rules/machinery/queue?object_type_id={id}
 *   - POST   /api/v1/ontology/rules
 *   - PATCH  /api/v1/ontology/rules/{id}
 *   - DELETE /api/v1/ontology/rules/{id}
 *   - POST   /api/v1/ontology/rules/{id}/simulate
 *   - POST   /api/v1/ontology/rules/{id}/apply
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

const E2E_NOW = '2026-05-11T00:00:00Z';

const OT_LIST = /\/api\/v1\/ontology\/object-types(\?|$)/;
const WORKFLOWS_LIST = /\/api\/v1\/workflows(\?|$)/;
const RULES_LIST = /\/api\/v1\/ontology\/rules(\?|$)/;
const RULE_INSIGHTS = /\/api\/v1\/ontology\/rules\/insights(\?|$)/;
const RULE_QUEUE = /\/api\/v1\/ontology\/rules\/machinery\/queue(\?|$)/;
const RULE_BY_ID = /\/api\/v1\/ontology\/rules\/[^/?]+(\?|$)/;
const RULE_SIMULATE = /\/api\/v1\/ontology\/rules\/[^/]+\/simulate(\?|$)/;
const RULE_APPLY = /\/api\/v1\/ontology\/rules\/[^/]+\/apply(\?|$)/;

interface ObjectTypeFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  primary_key_property: string | null;
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

function makeObjectType(overrides: Partial<ObjectTypeFixture> = {}): ObjectTypeFixture {
  return {
    id: 'object-type-1',
    name: 'asset',
    display_name: 'Asset',
    description: '',
    primary_key_property: null,
    icon: null,
    color: null,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

interface RuleFixture {
  id: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  evaluation_mode: 'advisory' | 'automatic';
  trigger_spec: Record<string, unknown>;
  effect_spec: Record<string, unknown>;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

function makeRule(overrides: Partial<RuleFixture> = {}): RuleFixture {
  return {
    id: 'rule-1',
    name: 'rule_threshold_breach',
    display_name: 'Threshold breach',
    description: 'Alert when score crosses the threshold.',
    object_type_id: 'object-type-1',
    evaluation_mode: 'advisory',
    trigger_spec: { numeric_gte: { score: 0.8 } },
    effect_spec: { alert: { severity: 'high', title: 'Threshold breach' } },
    owner_id: '00000000-0000-0000-0000-000000000001',
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

function emptyMachineryQueue(objectTypeId: string) {
  return {
    object_type_id: objectTypeId,
    data: [],
    recommendation: {
      generated_at: E2E_NOW,
      strategy: 'default',
      queue_depth: 0,
      overdue_count: 0,
      total_estimated_minutes: 0,
      next_due_at: null,
      recommended_order: [],
      capability_load: [],
    },
  };
}

interface FoundryRulesState {
  objectTypes: ObjectTypeFixture[];
  rules: RuleFixture[];
}

/**
 * Wires up every endpoint the page touches on mount + while authoring.
 * Stateful — create/delete update `state.rules` so the follow-up
 * `fetchRuleSurface` GET sees the new state.
 */
async function mockFoundryRules(
  page: Page,
  initial: { objectTypes: ObjectTypeFixture[]; rules: RuleFixture[] },
): Promise<FoundryRulesState> {
  const state: FoundryRulesState = {
    objectTypes: initial.objectTypes.slice(),
    rules: initial.rules.slice(),
  };

  await page.route(OT_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        data: state.objectTypes,
        total: state.objectTypes.length,
        page: 1,
        per_page: 200,
      },
    });
  });

  await page.route(WORKFLOWS_LIST, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { data: [], total: 0, page: 1, per_page: 200 },
    });
  });

  await page.route(RULE_INSIGHTS, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    await route.fulfill({
      json: { object_type_id: url.searchParams.get('object_type_id'), data: [] },
    });
  });

  await page.route(RULE_QUEUE, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const objectTypeId = url.searchParams.get('object_type_id') ?? 'object-type-1';
    await route.fulfill({ json: emptyMachineryQueue(objectTypeId) });
  });

  // Simulate / apply must be registered BEFORE the broader RULE_BY_ID handler
  // because Playwright dispatches most-recent-first and the suffix on those
  // routes is matched by the broader pattern too.
  await page.route(RULE_SIMULATE, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = route.request().url();
    const match = /\/rules\/([^/]+)\/simulate/.exec(url);
    const ruleId = match?.[1] ?? 'rule-1';
    const rule = state.rules.find((r) => r.id === ruleId) ?? state.rules[0];
    await route.fulfill({
      json: {
        rule,
        matched: true,
        trigger_payload: { score: 0.91 },
        effect_preview: { alert: { severity: 'high', title: 'Threshold breach' } },
        object: { id: 'obj-1', properties: { score: 0.91 } },
      },
    });
  });

  await page.route(RULE_APPLY, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = route.request().url();
    const match = /\/rules\/([^/]+)\/apply/.exec(url);
    const ruleId = match?.[1] ?? 'rule-1';
    const rule = state.rules.find((r) => r.id === ruleId) ?? state.rules[0];
    await route.fulfill({
      json: {
        rule,
        matched: true,
        trigger_payload: { score: 0.91 },
        effect_preview: { alert: { severity: 'high', title: 'Threshold breach' } },
        object: { id: 'obj-1', properties: { score: 0.91 } },
      },
    });
  });

  // Per-rule PATCH/DELETE — narrower than RULES_LIST so it has to be
  // registered AFTER the list/create handler to win.
  await page.route(RULE_BY_ID, async (route: Route) => {
    const method = route.request().method();
    const match = /\/rules\/([^/?#]+)/.exec(route.request().url());
    const ruleId = match?.[1];
    // Don't swallow the list endpoint or the simulate/apply suffixes —
    // when the URL has a trailing path segment we don't recognise, fall
    // through to the more specific handlers above.
    if (!ruleId || ruleId === '' || /\/(simulate|apply)(\?|$)/.test(route.request().url())) {
      return route.fallback();
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as Partial<RuleFixture>;
      const existing = state.rules.find((r) => r.id === ruleId);
      if (existing) {
        Object.assign(existing, body, { updated_at: E2E_NOW });
        await route.fulfill({ json: existing });
        return;
      }
      await route.fulfill({ status: 404, json: {} });
      return;
    }
    if (method === 'DELETE') {
      state.rules = state.rules.filter((r) => r.id !== ruleId);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    return route.fallback();
  });

  // List + Create both live on /api/v1/ontology/rules; split by method.
  await page.route(RULES_LIST, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = new URL(route.request().url());
      const ot = url.searchParams.get('object_type_id');
      const data = ot ? state.rules.filter((r) => r.object_type_id === ot) : state.rules;
      await route.fulfill({
        json: { data, total: data.length, page: 1, per_page: 100 },
      });
      return;
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON() as Partial<RuleFixture>;
      const created = makeRule({
        id: `rule-created-${state.rules.length + 1}`,
        ...body,
      });
      state.rules = [...state.rules, created];
      await route.fulfill({ status: 201, json: created });
      return;
    }
    return route.fallback();
  });

  return state;
}

const ASSET_TYPE = makeObjectType({ id: 'object-type-asset', name: 'asset', display_name: 'Asset' });
const CUSTOMER_TYPE = makeObjectType({
  id: 'object-type-customer',
  name: 'customer',
  display_name: 'Customer',
});

const RULE_ALPHA = makeRule({
  id: 'rule-alpha',
  name: 'rule_alpha',
  display_name: 'Alpha threshold',
  object_type_id: ASSET_TYPE.id,
  evaluation_mode: 'advisory',
});
const RULE_BRAVO = makeRule({
  id: 'rule-bravo',
  name: 'rule_bravo',
  display_name: 'Bravo automation',
  object_type_id: ASSET_TYPE.id,
  evaluation_mode: 'automatic',
});

test('renders the page heading, the object-type selector and the rules list', async ({
  adminPage,
}) => {
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE, CUSTOMER_TYPE],
    rules: [RULE_ALPHA, RULE_BRAVO],
  });
  await adminPage.goto('/foundry-rules');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^foundry rules$/i }),
  ).toBeVisible();

  // Both object types render as <option>s. The first one is auto-selected,
  // which is what populates the rules list.
  const objectTypeSelect = adminPage.getByLabel(/^Object type:?$/i);
  await expect(objectTypeSelect).toHaveValue(ASSET_TYPE.id);

  // Rules count header reflects the seeded list.
  await expect(adminPage.getByText(/^Rules \(2\)$/)).toBeVisible();

  // Each rule renders with its accessible "Edit rule …" name + the
  // evaluation-mode chip.
  for (const rule of [RULE_ALPHA, RULE_BRAVO]) {
    const button = adminPage.getByRole('button', { name: `Edit rule ${rule.display_name}` });
    await expect(button).toBeVisible();
    await expect(button).toContainText(rule.evaluation_mode);
  }
});

test('the rules list re-fetches when the object type changes', async ({ adminPage }) => {
  const RULE_CHARLIE = makeRule({
    id: 'rule-charlie',
    name: 'rule_charlie',
    display_name: 'Charlie audit',
    object_type_id: CUSTOMER_TYPE.id,
  });
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE, CUSTOMER_TYPE],
    rules: [RULE_ALPHA, RULE_CHARLIE],
  });
  const cap = captureRequests(adminPage, RULES_LIST);
  await adminPage.goto('/foundry-rules');

  // Initial state shows only Asset's rule.
  await expect(
    adminPage.getByRole('button', { name: `Edit rule ${RULE_ALPHA.display_name}` }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: `Edit rule ${RULE_CHARLIE.display_name}` }),
  ).toHaveCount(0);

  // Switch the object type to Customer; the list re-queries.
  await adminPage.getByLabel(/^Object type:?$/i).selectOption(CUSTOMER_TYPE.id);

  await expect
    .poll(() =>
      cap.calls.some(
        (c) =>
          c.method === 'GET' &&
          new RegExp(`[?&]object_type_id=${CUSTOMER_TYPE.id}\\b`).test(c.url),
      ),
    )
    .toBe(true);

  await expect(
    adminPage.getByRole('button', { name: `Edit rule ${RULE_CHARLIE.display_name}` }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: `Edit rule ${RULE_ALPHA.display_name}` }),
  ).toHaveCount(0);
});

test('"New rule" opens the drawer pre-filled with the default trigger/effect JSON', async ({
  adminPage,
}) => {
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE],
    rules: [],
  });
  await adminPage.goto('/foundry-rules');

  await adminPage.getByRole('button', { name: /^New rule$/ }).click();

  const drawer = adminPage.getByRole('dialog', { name: /new foundry rule/i });
  await expect(drawer).toBeVisible();

  // Default `emptyDraft()` pre-fills name + display name + the trigger /
  // effect JSON textareas.
  await expect(drawer.getByLabel(/^Name$/)).toHaveValue('rule_threshold_breach');
  await expect(drawer.getByLabel(/^Display name$/)).toHaveValue('Threshold breach');

  // The two `JsonEditor` textareas don't wire `htmlFor` so locate them as
  // textboxes in document order: trigger first, effect second.
  const textareas = drawer.locator('textarea.of-input');
  await expect(textareas).toHaveCount(3); // description + trigger + effect
  await expect(textareas.nth(1)).toContainText('numeric_gte');
  await expect(textareas.nth(2)).toContainText('alert');

  // Submit button reads "Create rule" in new-mode.
  await expect(drawer.getByRole('button', { name: /^Create rule$/ })).toBeVisible();
});

test('submitting the New-rule form POSTs /ontology/rules and the new rule appears in the list', async ({
  adminPage,
}) => {
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE],
    rules: [],
  });
  const cap = captureRequests(adminPage, RULES_LIST);
  await adminPage.goto('/foundry-rules');

  await adminPage.getByRole('button', { name: /^New rule$/ }).click();
  const drawer = adminPage.getByRole('dialog', { name: /new foundry rule/i });

  // Customise the display name so we can assert on it later.
  await drawer.getByLabel(/^Display name$/).fill('Custom rule');

  await drawer.getByRole('button', { name: /^Create rule$/ }).click();

  await expect
    .poll(() => cap.calls.filter((c) => c.method === 'POST').length)
    .toBeGreaterThanOrEqual(1);

  const post = cap.calls.find((c) => c.method === 'POST');
  const body = post?.body as Record<string, unknown> | undefined;
  expect(body).toMatchObject({
    name: 'rule_threshold_breach',
    display_name: 'Custom rule',
    object_type_id: ASSET_TYPE.id,
    evaluation_mode: 'advisory',
    trigger_spec: { numeric_gte: { score: 0.8 } },
    effect_spec: { alert: { severity: 'high', title: 'Threshold breach' } },
  });

  // The drawer flips to edit-mode for the just-saved rule + the rules list
  // re-fetches and shows the new entry.
  await expect(
    adminPage.getByRole('button', { name: /Edit rule Custom rule/ }),
  ).toBeVisible();
});

test('clicking a rule row opens the drawer with that rule\'s fields populated', async ({
  adminPage,
}) => {
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE],
    rules: [RULE_ALPHA],
  });
  await adminPage.goto('/foundry-rules');

  await adminPage.getByRole('button', { name: `Edit rule ${RULE_ALPHA.display_name}` }).click();

  const drawer = adminPage.getByRole('dialog', { name: /edit foundry rule/i });
  await expect(drawer).toBeVisible();

  await expect(drawer.getByLabel(/^Display name$/)).toHaveValue(RULE_ALPHA.display_name);
  await expect(drawer.getByLabel(/^Name$/)).toHaveValue(RULE_ALPHA.name);
  // Edit mode disables the immutable Name + Object-type fields.
  await expect(drawer.getByLabel(/^Name$/)).toBeDisabled();

  // Submit button reads "Update rule" in edit-mode.
  await expect(drawer.getByRole('button', { name: /^Update rule$/ })).toBeVisible();
  // And the Simulate / Apply section is now reachable.
  await expect(drawer.getByText(/^Simulate \/ apply$/i)).toBeVisible();
});

test('Simulate: POSTs /ontology/rules/:id/simulate and renders the response as pretty JSON', async ({
  adminPage,
}) => {
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE],
    rules: [RULE_ALPHA],
  });
  const cap = captureRequests(adminPage, RULE_SIMULATE);
  await adminPage.goto('/foundry-rules');

  await adminPage.getByRole('button', { name: `Edit rule ${RULE_ALPHA.display_name}` }).click();
  const drawer = adminPage.getByRole('dialog', { name: /edit foundry rule/i });

  await drawer.getByPlaceholder('object_id').fill('asset-42');
  await drawer.getByRole('button', { name: /^Simulate$/ }).click();

  await expect
    .poll(() =>
      cap.calls.some((c) => c.method === 'POST' && /\/simulate(\?|$)/.test(c.url)),
    )
    .toBe(true);
  const post = cap.calls.find((c) => c.method === 'POST' && /\/simulate(\?|$)/.test(c.url));
  expect(post?.body).toMatchObject({ object_id: 'asset-42' });

  // The drawer renders the response as a <pre>.
  await expect(drawer.locator('pre')).toContainText('"matched": true');
  await expect(drawer.locator('pre')).toContainText('trigger_payload');
});

test('Apply: POSTs /ontology/rules/:id/apply with the same object id', async ({ adminPage }) => {
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE],
    rules: [RULE_ALPHA],
  });
  const cap = captureRequests(adminPage, RULE_APPLY);
  await adminPage.goto('/foundry-rules');

  await adminPage.getByRole('button', { name: `Edit rule ${RULE_ALPHA.display_name}` }).click();
  const drawer = adminPage.getByRole('dialog', { name: /edit foundry rule/i });

  await drawer.getByPlaceholder('object_id').fill('asset-99');
  await drawer.getByRole('button', { name: /^Apply$/ }).click();

  await expect
    .poll(() => cap.calls.some((c) => c.method === 'POST' && /\/apply(\?|$)/.test(c.url)))
    .toBe(true);
  const post = cap.calls.find((c) => c.method === 'POST' && /\/apply(\?|$)/.test(c.url));
  expect(post?.body).toMatchObject({ object_id: 'asset-99' });
});

test('Delete: accepting the confirm prompt DELETEs the rule and closes the drawer', async ({
  adminPage,
}) => {
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE],
    rules: [RULE_ALPHA, RULE_BRAVO],
  });
  const cap = captureRequests(adminPage, RULE_BY_ID);
  await adminPage.goto('/foundry-rules');

  // The page deletes via `window.confirm(...)` — Playwright handles that as
  // a `dialog` event we accept up-front.
  adminPage.on('dialog', (dialog) => void dialog.accept());

  await adminPage.getByRole('button', { name: `Edit rule ${RULE_ALPHA.display_name}` }).click();
  const drawer = adminPage.getByRole('dialog', { name: /edit foundry rule/i });
  await drawer.getByRole('button', { name: /^Delete$/ }).click();

  await expect
    .poll(() =>
      cap.calls.some(
        (c) =>
          c.method === 'DELETE' &&
          new RegExp(`/ontology/rules/${RULE_ALPHA.id}(\\?|$)`).test(c.url),
      ),
    )
    .toBe(true);

  // Drawer closes; the deleted rule disappears from the list while Bravo stays.
  await expect(drawer).toHaveCount(0);
  await expect(
    adminPage.getByRole('button', { name: `Edit rule ${RULE_ALPHA.display_name}` }),
  ).toHaveCount(0);
  await expect(
    adminPage.getByRole('button', { name: `Edit rule ${RULE_BRAVO.display_name}` }),
  ).toBeVisible();
});

test('legacy routes /workflows and /automate redirect to /foundry-rules', async ({
  adminPage,
}) => {
  // The redirect loader runs before the FoundryRulesPage's mount fetches,
  // but the page still mounts after the redirect — install the standard
  // mocks so the destination doesn't crash on missing endpoints.
  await mockFoundryRules(adminPage, { objectTypes: [ASSET_TYPE], rules: [] });

  await adminPage.goto('/workflows');
  await expect(adminPage).toHaveURL(/\/foundry-rules$/);

  await adminPage.goto('/automate?source=launcher');
  // The loader preserves search + hash through the redirect.
  await expect(adminPage).toHaveURL(/\/foundry-rules\?source=launcher$/);
});

test('absent today: structured trigger picker, AND/OR builder, action picker, active/disable toggle, in-page run history', async ({
  adminPage,
}) => {
  // Single regression guard for the roadmap surfaces the task asks for that
  // do not ship today. Each flipped assertion is the migration signal when
  // the matching control lands.
  await mockFoundryRules(adminPage, {
    objectTypes: [ASSET_TYPE],
    rules: [RULE_ALPHA],
  });
  await adminPage.goto('/foundry-rules');

  await adminPage.getByRole('button', { name: `Edit rule ${RULE_ALPHA.display_name}` }).click();
  const drawer = adminPage.getByRole('dialog', { name: /edit foundry rule/i });
  await expect(drawer).toBeVisible();

  // 1. No structured trigger picker — no segmented control / radio group
  //    naming "Event" / "Schedule" / "Manual".
  expect(await drawer.getByRole('radio', { name: /^(event|schedule|manual)$/i }).count()).toBe(0);
  expect(await drawer.getByRole('tab', { name: /^(event|schedule|manual)$/i }).count()).toBe(0);
  expect(
    await drawer.getByRole('button', { name: /^trigger type:?$/i }).count(),
  ).toBe(0);

  // 2. No AND/OR boolean builder + no "Add condition" button.
  expect(
    await drawer.getByRole('button', { name: /^(\+ )?Add condition$/i }).count(),
  ).toBe(0);
  expect(await drawer.getByRole('radio', { name: /^(AND|OR)$/i }).count()).toBe(0);
  expect(await drawer.getByRole('button', { name: /^(AND|OR)$/i }).count()).toBe(0);

  // 3. No notification / pipeline / webhook action picker.
  expect(
    await drawer.getByRole('button', { name: /(send notification|run pipeline|call webhook)/i }).count(),
  ).toBe(0);

  // 4. No "Dry run" button — the equivalent shipped control is named
  //    "Simulate".
  expect(await drawer.getByRole('button', { name: /^Dry run$/i }).count()).toBe(0);
  await expect(drawer.getByRole('button', { name: /^Simulate$/ })).toBeVisible();

  // 5. No active/disable toggle. The closest knob is the evaluation_mode
  //    select (advisory|automatic), not a binary on/off switch.
  expect(await drawer.getByRole('switch').count()).toBe(0);
  await expect(drawer.getByLabel(/^Evaluation mode$/)).toBeVisible();

  // 6. No in-page rule-execution history table.
  expect(
    await adminPage.getByRole('heading', { name: /^(execution history|rule runs)$/i }).count(),
  ).toBe(0);
});
