import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { E2E_NOW } from './fixtures/mocks';

/**
 * E2E coverage for `/ai/chatbot-studio`
 * (apps/web/src/routes/ai/ChatbotStudioPage.tsx).
 *
 * **Reality check.** The page is mostly a Phase 4.x roadmap
 * placeholder — the `+ New chatbot` CTA is permanently disabled
 * with the tooltip "Builder UI ships in Phase 4.x", the chatbot
 * grid renders 5 entries from a hard-coded `MOCK_CHATBOTS` const,
 * and the KPI strip is computed from those mocks. None of the
 * Crear-bot / Test-playground / Versioning / Publicar / Eliminar
 * roadmap features are wired today.
 *
 * The page does ship ONE live subcomponent: `ChatbotModelPicker`
 * (B04 §AC#3) — a TanStack-Query-backed `<select>` that fetches
 * `GET /llm/models?capability=CHAT&feature=aip-chatbot&only_enabled=true`
 * and `GET /llm/providers/health` (15 s polling), persists the
 * picked rid to `localStorage`, and decorates each option with a
 * status suffix (` · degraded` / ` · DOWN`) so operators can see
 * provider health at a glance. The picker has full coverage below.
 *
 * Per the codebase convention this spec PINS the shipped chrome
 * (placeholder + model picker) and adds regression guards for the
 * roadmap CRUD/playground controls.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
      /^console\.error: %o$/,
    ],
  },
});

// ---------------------------------------------------------------------------
// Model-picker fixtures (mirror @/lib/api/llmCatalog wire shapes)
// ---------------------------------------------------------------------------

interface LlmModelFixture {
  rid: string;
  provider: 'ANTHROPIC' | 'OPENAI' | 'AZURE' | 'OLLAMA' | 'BEDROCK';
  model_id: string;
  display_name: string;
  context_window: number;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  capabilities: string[];
  quotas: Record<string, unknown>;
  enabled_for_features: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ProviderStateFixture {
  provider: LlmModelFixture['provider'];
  status: 'unknown' | 'ok' | 'degraded' | 'down';
  last_check_at: string;
  latency_ms: number;
}

function makeModel(overrides: Partial<LlmModelFixture> = {}): LlmModelFixture {
  return {
    rid: 'model-1',
    provider: 'OPENAI',
    model_id: 'gpt-4o',
    display_name: 'GPT-4o',
    context_window: 128_000,
    input_cost_per_1k: 0,
    output_cost_per_1k: 0,
    capabilities: ['CHAT'],
    quotas: {},
    enabled_for_features: ['aip-chatbot'],
    enabled: true,
    created_at: E2E_NOW,
    updated_at: E2E_NOW,
    ...overrides,
  };
}

async function mockModelCatalog(
  page: Page,
  models: LlmModelFixture[],
  health: ProviderStateFixture[] = [],
): Promise<void> {
  await page.route(/\/api\/v1\/llm\/models(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { data: models } });
  });
  await page.route(/\/api\/v1\/llm\/providers\/health$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: { providers: health, checked_at: E2E_NOW },
    });
  });
}

// ---------------------------------------------------------------------------
// Tests — shipped behaviour
// ---------------------------------------------------------------------------

test('renders the placeholder hero, model picker, KPI strip, and chatbot grid', async ({
  adminPage,
}) => {
  await mockModelCatalog(adminPage, [makeModel()], [
    { provider: 'OPENAI', status: 'ok', last_check_at: E2E_NOW, latency_ms: 12 },
  ]);
  await adminPage.goto('/ai/chatbot-studio');

  // AppShell still renders behind the page.
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();

  // Hero + the live model picker + the disabled CTA.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^chatbot studio$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^ai platform · chatbot studio$/i)).toBeVisible();
  await expect(
    adminPage.getByRole('combobox', { name: /^chatbot model$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('button', { name: /new chatbot/i }),
  ).toBeVisible();

  // KPI strip + the chatbot section.
  await expect(adminPage.getByText('Chatbots', { exact: true })).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^your chatbots$/i }),
  ).toBeVisible();
});

test('"+ New chatbot" CTA is disabled — Phase 4.x roadmap, tooltip pinned', async ({
  adminPage,
}) => {
  await mockModelCatalog(adminPage, []);
  await adminPage.goto('/ai/chatbot-studio');

  const cta = adminPage.getByRole('button', { name: /new chatbot/i });
  await expect(cta).toBeDisabled();
  await expect(cta).toHaveAttribute('title', /builder ui ships in phase 4\.x/i);
});

test('KPI strip surfaces metrics computed from MOCK_CHATBOTS', async ({
  adminPage,
}) => {
  await mockModelCatalog(adminPage, []);
  await adminPage.goto('/ai/chatbot-studio');

  // MOCK_CHATBOTS contributes:
  //   Chatbots                 = 5
  //   In production            = 3 (cb-support, cb-onboarding, cb-public-faq)
  //   Conversations / month    = 12,480 + 1,204 + 320 + 5,640 + 0 = 19,644
  //                              → Intl.NumberFormat compact → "20K"
  //   Surfaces in use          = |{internal, sdk, api}| = 3
  const kpiPanel = adminPage.locator('.of-panel').filter({
    has: adminPage.getByText('Chatbots', { exact: true }),
  });
  await expect(kpiPanel).toBeVisible();
  // Each label + its value. We assert the *value* lives inside the
  // panel so a missing field surfaces here rather than silently
  // mis-aligning labels with the wrong number.
  await expect(kpiPanel.getByText('Chatbots', { exact: true })).toBeVisible();
  await expect(kpiPanel.getByText('5', { exact: true })).toBeVisible();
  await expect(kpiPanel.getByText('In production', { exact: true })).toBeVisible();
  await expect(kpiPanel.getByText('3', { exact: true })).toHaveCount(2); // "In production" + "Surfaces in use"
  await expect(kpiPanel.getByText('Conversations / month', { exact: true })).toBeVisible();
  // Compact notation rounding differs subtly between engines; accept
  // either "20K" (default rounding) or "19.6K"/"19.7K" (3-significant).
  await expect(kpiPanel.getByText(/^(20|19\.\d)K$/)).toBeVisible();
  await expect(kpiPanel.getByText('Surfaces in use', { exact: true })).toBeVisible();
});

test('chatbot grid renders the five seeded bots with status + surface chips', async ({
  adminPage,
}) => {
  await mockModelCatalog(adminPage, []);
  await adminPage.goto('/ai/chatbot-studio');

  // Each `<article>` carries an `aria-label` = bot name → addressable
  // by role + name. Pin all five seeded bots.
  for (const name of [
    'Customer Support Triage',
    'Procurement Helper',
    'New Hire Onboarding',
    'Public Status FAQ',
    'Policy Compliance Coach',
  ]) {
    await expect(adminPage.getByRole('article', { name })).toBeVisible();
  }

  // Status mix: 3 Production + 1 Staging + 1 Draft.
  await expect(adminPage.getByText('Production', { exact: true })).toHaveCount(3);
  await expect(adminPage.getByText('Staging', { exact: true })).toHaveCount(1);
  await expect(adminPage.getByText('Draft', { exact: true })).toHaveCount(1);

  // Surface chips: every surface kind shows up at least once
  // (`Internal` × 4, `OSDK` × 1, `Public API` × 1).
  await expect(adminPage.getByText('Internal', { exact: true })).toHaveCount(4);
  await expect(adminPage.getByText('OSDK', { exact: true })).toHaveCount(1);
  await expect(adminPage.getByText('Public API', { exact: true })).toHaveCount(1);
});

test('ChatbotModelPicker lists chat-capable models with provider-health suffixes', async ({
  adminPage,
}) => {
  // Three providers, three different health states. The picker must:
  //   - render each option with the friendly provider label + model_id;
  //   - append " · degraded" or " · DOWN" when the provider is unhealthy;
  //   - mark `down` options as disabled.
  await mockModelCatalog(
    adminPage,
    [
      makeModel({ rid: 'openai-rid', provider: 'OPENAI', model_id: 'gpt-4o' }),
      makeModel({ rid: 'azure-rid', provider: 'AZURE', model_id: 'gpt-4o' }),
      makeModel({ rid: 'ollama-rid', provider: 'OLLAMA', model_id: 'llama3' }),
    ],
    [
      { provider: 'OPENAI', status: 'ok', last_check_at: E2E_NOW, latency_ms: 12 },
      { provider: 'AZURE', status: 'down', last_check_at: E2E_NOW, latency_ms: 0 },
      { provider: 'OLLAMA', status: 'degraded', last_check_at: E2E_NOW, latency_ms: 220 },
    ],
  );
  const listCalls = captureRequests(adminPage, /\/api\/v1\/llm\/models\?/);

  await adminPage.goto('/ai/chatbot-studio');

  const picker = adminPage.getByRole('combobox', { name: /^chatbot model$/i });
  await expect(picker).toBeVisible();

  // The request hit the right path with all three filters set.
  await expect.poll(() => listCalls.count()).toBeGreaterThanOrEqual(1);
  const callUrl = listCalls.last()?.url ?? '';
  expect(callUrl).toContain('capability=CHAT');
  expect(callUrl).toContain('feature=aip-chatbot');
  expect(callUrl).toContain('only_enabled=true');

  // Each option carries the formatted label + the health suffix.
  // Anchor the regex — "OpenAI · gpt-4o" is also a *substring* of the
  // Azure option's label ("Azure OpenAI · gpt-4o · DOWN").
  await expect(
    picker.locator('option', { hasText: /^OpenAI · gpt-4o$/ }),
  ).toBeAttached();
  await expect(
    picker.locator('option', { hasText: /^Azure OpenAI · gpt-4o · DOWN$/ }),
  ).toBeAttached();
  await expect(
    picker.locator('option', { hasText: /^Ollama · llama3 · degraded$/ }),
  ).toBeAttached();

  // The `down` Azure option carries the native `disabled` attribute.
  // (`toBeDisabled` doesn't reliably surface a disabled <option> in
  // Playwright — query the attribute via CSS instead.)
  await expect(
    picker.locator('option[disabled]', { hasText: /· DOWN$/ }),
  ).toHaveCount(1);

  // Default selection biases to the first 'ok' provider — OpenAI.
  await expect(picker).toHaveValue('openai-rid');
});

test('ChatbotModelPicker persists the chosen rid to localStorage', async ({
  adminPage,
}) => {
  await mockModelCatalog(
    adminPage,
    [
      makeModel({ rid: 'openai-rid', provider: 'OPENAI', model_id: 'gpt-4o' }),
      makeModel({ rid: 'ollama-rid', provider: 'OLLAMA', model_id: 'llama3' }),
    ],
    [
      { provider: 'OPENAI', status: 'ok', last_check_at: E2E_NOW, latency_ms: 12 },
      { provider: 'OLLAMA', status: 'ok', last_check_at: E2E_NOW, latency_ms: 30 },
    ],
  );
  await adminPage.goto('/ai/chatbot-studio');

  const picker = adminPage.getByRole('combobox', { name: /^chatbot model$/i });
  await expect(picker).toHaveValue('openai-rid');

  // Switch to Ollama; the picker's onChange writes the rid into
  // `chatbot-studio.selected-model-rid` so reloads + sibling
  // components see the same selection.
  await picker.selectOption('ollama-rid');
  await expect(picker).toHaveValue('ollama-rid');

  const stored = await adminPage.evaluate(() =>
    window.localStorage.getItem('chatbot-studio.selected-model-rid'),
  );
  expect(stored).toBe('ollama-rid');
});

// ---------------------------------------------------------------------------
// Regression guards for the roadmap features the user spec'd
// ---------------------------------------------------------------------------

test('absent today: per-bot Test / Edit / Versioning / Publish / Delete actions', async ({
  adminPage,
}) => {
  await mockModelCatalog(adminPage, []);
  await adminPage.goto('/ai/chatbot-studio');

  // Every chatbot card is an `<article aria-label="…">` with no
  // interactive controls today — pin the absence of each roadmap CTA.
  expect(
    await adminPage
      .getByRole('button', { name: /test( bot| chatbot| playground)|^playground$/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /edit (bot|chatbot)|^edit$/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /version|version history|revisions?/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /publish( bot| chatbot)?|deploy( bot| chatbot)?/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /^delete( bot| chatbot)?$/i })
      .count(),
  ).toBe(0);
});

test('absent today: bot creation form (name + system prompt + tools picker)', async ({
  adminPage,
}) => {
  // The "+ New chatbot" CTA is disabled, so no creation form should
  // surface anywhere on the page. Pin the absence of every input the
  // form will eventually expose.
  await mockModelCatalog(adminPage, []);
  await adminPage.goto('/ai/chatbot-studio');

  expect(
    await adminPage.getByLabel(/^(bot name|chatbot name|name)$/i).count(),
  ).toBe(0);
  expect(await adminPage.getByLabel(/system prompt/i).count()).toBe(0);
  expect(await adminPage.getByLabel(/description/i).count()).toBe(0);
  // The page-wide model picker has accessible name "Chatbot model" —
  // a creation-form model select would be scoped to the bot, with a
  // distinctly different label (e.g. "Model" or "Bot model"). Pin the
  // absence of those.
  expect(await adminPage.getByLabel(/^bot model$/i).count()).toBe(0);
  // Tools picker.
  expect(
    await adminPage
      .getByRole('group', { name: /tools|functions|available tools/i })
      .count(),
  ).toBe(0);
});
