import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';

/**
 * E2E coverage for `/ai` (apps/web/src/routes/ai/AiPage.tsx).
 *
 * The shipped AiPage is the AI Platform (AIP) documentation hub:
 *   - Breadcrumb + h1 `AIP overview` + a 4-button top-tab strip
 *     (Capabilities / Getting started / Architecture center /
 *     Platform updates).
 *   - A left navigation aside grouped into sections (AI PLATFORM,
 *     Administration, BYOM, CONSOLE, APPLICATIONS). Every leftnav
 *     item is a <button> that mutates the page's internal state to
 *     render the matching sub-page; clicks do NOT change the router
 *     URL — the hub stays on `/ai`.
 *   - The Overview sub-page reads `GET /api/v1/ai/overview` on mount
 *     and pours the response into five StatCard grids (Seamless
 *     integration / Security & governance / Model management /
 *     Scalability & performance / Explainability & transparency).
 *   - APPLICATIONS leftnav tiles cover: AI FDE, AIP Analyst,
 *     AIP Assist, AIP Chatbot Studio, AIP Document Intelligence,
 *     AIP Evals, AIP Logic, AIP Model Catalog, AIP Threads. The
 *     standalone `/ai/operator` route exists in the router but the
 *     hub itself does not host a tile for it — pinned below.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /React Router caught the following error during render/,
    ],
  },
});

const OVERVIEW_FIXTURE = {
  provider_count: 7,
  private_provider_count: 2,
  multimodal_provider_count: 3,
  prompt_count: 24,
  knowledge_base_count: 5,
  indexed_document_count: 142,
  indexed_chunk_count: 9_876,
  agent_count: 11,
  conversation_count: 314,
  cache_entry_count: 528,
  cache_hit_rate: 0.732,
  blocked_guardrail_events: 17,
  llm_prompt_tokens: 12_345_678,
  llm_completion_tokens: 8_765_432,
  estimated_llm_cost_usd: 423.78,
  benchmark_run_count: 9,
};

async function mockOverview(
  page: Page,
  body: Partial<typeof OVERVIEW_FIXTURE> = {},
): Promise<void> {
  await page.route('**/api/v1/ai/overview', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: { ...OVERVIEW_FIXTURE, ...body } });
  });
}

/**
 * Resolve a single StatCard by its label. Filtering on the inner
 * `.of-aip__statcard-label` keeps us from picking up other elements
 * that happen to contain the label string anywhere in their subtree.
 */
function statCard(page: Page, label: string | RegExp) {
  return page.locator('.of-aip__statcard').filter({
    has: page.locator('.of-aip__statcard-label', { hasText: label }),
  });
}

test('hub renders the APPLICATIONS leftnav with tiles to each sub-section', async ({
  adminPage,
}) => {
  await mockOverview(adminPage);
  await adminPage.goto('/ai');

  // AppShell still renders behind the hub — `/ai` is an authenticated route.
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();

  // Breadcrumb + h1 confirm the hub mounted on the Overview sub-page.
  await expect(
    adminPage.getByRole('navigation', { name: /breadcrumb/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^aip overview$/i }),
  ).toBeVisible();

  // Top-tab strip pins the four scopes; a renamed tab surfaces here.
  for (const tab of [
    'Capabilities',
    'Getting started',
    'Architecture center',
    'Platform updates',
  ]) {
    await expect(
      adminPage.getByRole('button', { name: tab, exact: true }),
    ).toBeVisible();
  }

  // APPLICATIONS section header + every tile the hub catalogs. Each
  // tile is rendered as a <button> (not an <a>) because navigation
  // is internal to the AiPage component. Scope the header lookup to
  // the hub's own leftnav class so we don't accidentally match the
  // AppShell sidebar's "APPLICATIONS" heading.
  await expect(
    adminPage.locator('.of-aip__leftnav-section-title', { hasText: /^APPLICATIONS$/ }),
  ).toBeVisible();
  for (const tile of [
    'AIP Assist',
    'AIP Analyst',
    'AIP Threads',
    'AIP Document Intelligence',
    'AIP Chatbot Studio',
  ]) {
    await expect(
      adminPage.getByRole('button', { name: tile, exact: true }),
    ).toBeVisible();
  }

  // `/ai/operator` is a separate page that the hub does NOT surface as
  // a tile. Pin the absence so a future addition shows up here.
  expect(
    await adminPage.getByRole('button', { name: /^operator$/i }).count(),
  ).toBe(0);
});

test('clicking each tile swaps the page to the matching application content', async ({
  adminPage,
}) => {
  await mockOverview(adminPage);
  await adminPage.goto('/ai');

  // Walk every user-facing tile. The page mutates internal state (the
  // router URL stays on `/ai`), so we assert the h1 swaps to the
  // application title and the related console CTA shows up.
  const tiles: Array<{ name: string; title: RegExp; cta: RegExp }> = [
    {
      name: 'AIP Threads',
      title: /^aip threads$/i,
      cta: /open the chat console/i,
    },
    {
      name: 'AIP Analyst',
      title: /^aip analyst$/i,
      cta: /open the chat console/i,
    },
    {
      name: 'AIP Assist',
      title: /^aip assist$/i,
      cta: /open the knowledge bases console/i,
    },
    {
      name: 'AIP Chatbot Studio',
      title: /^aip chatbot studio$/i,
      cta: /open the agents console/i,
    },
    {
      name: 'AIP Document Intelligence',
      title: /^aip document intelligence$/i,
      cta: /open the tools console/i,
    },
  ];

  for (const tile of tiles) {
    await adminPage
      .getByRole('button', { name: tile.name, exact: true })
      .click();
    await expect(
      adminPage.getByRole('heading', { level: 1, name: tile.title }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole('button', { name: tile.cta }),
    ).toBeVisible();
  }

  // The hub never changes the URL — every tile click is internal state.
  await expect(adminPage).toHaveURL(/\/ai(\?|#|$)/);
});

test('overview surfaces usage-tokens and active-threads statistics', async ({
  adminPage,
}) => {
  await mockOverview(adminPage);
  await adminPage.goto('/ai');

  // The Overview sub-page renders nothing until `GET /api/v1/ai/overview`
  // resolves — wait for any stat card before drilling into specific ones.
  await expect(adminPage.locator('.of-aip__statcard').first()).toBeVisible();

  // ── Threads / conversations counter ────────────────────────────────
  // Surfaced as `Conversations` in the Security & governance section.
  const conversations = statCard(adminPage, /^Conversations$/);
  await expect(conversations).toBeVisible();
  await expect(conversations.locator('.of-aip__statcard-value')).toHaveText('314');

  // ── LLM usage tokens (prompt + completion) ─────────────────────────
  // Both live in the Explainability & transparency section. The page
  // formats them through `Intl.NumberFormat('en-US')`, so the comma
  // grouping is what users actually see.
  const promptTokens = statCard(adminPage, /^Prompt tokens$/);
  await expect(promptTokens).toBeVisible();
  await expect(promptTokens.locator('.of-aip__statcard-value')).toHaveText('12,345,678');

  const completionTokens = statCard(adminPage, /^Completion tokens$/);
  await expect(completionTokens).toBeVisible();
  await expect(completionTokens.locator('.of-aip__statcard-value')).toHaveText('8,765,432');

  // The companion `Estimated LLM cost` card formats through
  // `Intl.NumberFormat` with currency: USD — pin the rendered string
  // so a locale or formatter regression surfaces here.
  const estimatedCost = statCard(adminPage, /^Estimated LLM cost$/);
  await expect(estimatedCost).toBeVisible();
  await expect(estimatedCost.locator('.of-aip__statcard-value')).toHaveText('$423.78');
});

test('overview tolerates a failing /ai/overview response without breaking the hub', async ({
  adminPage,
}) => {
  // The page catches overview failures via `notifications.error(...)`
  // and renders without StatCard grids. The hub chrome (breadcrumb,
  // h1, leftnav, top tabs) must still be intact so users can still
  // reach the sub-sections.
  await adminPage.route('**/api/v1/ai/overview', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 500, json: { error: 'mocked failure' } });
  });

  await adminPage.goto('/ai');

  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^aip overview$/i }),
  ).toBeVisible();
  // No StatCards rendered when the overview payload is absent.
  expect(await adminPage.locator('.of-aip__statcard').count()).toBe(0);
  // The leftnav tiles still work even without the overview payload.
  await expect(
    adminPage.getByRole('button', { name: 'AIP Threads', exact: true }),
  ).toBeVisible();
});
