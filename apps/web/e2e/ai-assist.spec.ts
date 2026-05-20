import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';
import { mockSseStream } from './helpers/sse';

/**
 * E2E coverage for `/ai/assist` (apps/web/src/routes/ai/AssistPage.tsx).
 *
 * **Reality check.** The shipped AssistPage is a Phase 4.2 roadmap
 * placeholder — the page's own `<span class="of-chip">` reads
 * "Roadmap · Phase 4.2" and the primary CTA carries a tooltip that
 * says "Assist engine lands in Phase 4.x". Today the page renders:
 *
 *   - A hero with the eyebrow `AI Platform · AI Assist`, the h1
 *     `AI Assist`, a muted paragraph, and the "Roadmap · Phase 4.2"
 *     chip.
 *   - A 3-row textarea labelled "Assist prompt".
 *   - A `Clear` button (enabled iff the prompt has non-whitespace
 *     content) that resets the textarea.
 *   - An `Ask` button that is **permanently `disabled`**.
 *   - A static "Recent answers" list seeded from a const `HISTORY`
 *     array (two pre-baked Q&A panels).
 *   - A "Suggested prompts" aside with 4 cards that, on click,
 *     populate the textarea with the suggestion text.
 *
 * The page does NOT (today):
 *   - call any /api/v1/ai/* endpoint;
 *   - stream Server-Sent Events;
 *   - expose Stop / New chat / Attach context / Copy controls;
 *   - reset its history on demand;
 *   - render any rate-limit / 429 surface.
 *
 * Per the codebase convention (see `notifications.spec.ts`), this
 * spec PINS the shipped placeholder behaviour and adds a regression
 * guard for every roadmap control the user spec'd. Each `absent
 * today: …` test will FAIL loudly the day the feature ships, giving
 * the developer an actionable checklist.
 *
 * The SSE mock pattern that the streaming engine will need is
 * implemented in `e2e/helpers/sse.ts` (`mockSseStream`) and validated
 * by the smoke test at the bottom of this file. Reusable across every
 * future spec that touches an `event-stream` endpoint.
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

const ASSIST_CHAT_ENDPOINT = /\/api\/v1\/ai\/assist\/chat/;

// ---------------------------------------------------------------------------
// Shipped placeholder behaviour
// ---------------------------------------------------------------------------

test('renders the placeholder hero, chat panel, and suggested prompts', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/assist');

  // AppShell stays mounted — `/ai/assist` is an authenticated route.
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();

  // Hero: eyebrow + h1 + roadmap chip.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^ai assist$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^ai platform · ai assist$/i)).toBeVisible();
  await expect(adminPage.getByText(/^roadmap · phase 4\.2$/i)).toBeVisible();

  // Chat panel: the prompt textarea + the Clear/Ask CTAs.
  await expect(adminPage.getByLabel(/^assist prompt$/i)).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^clear$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^ask$/i })).toBeVisible();

  // Suggested-prompts aside: eyebrow + the 4 hard-coded suggestions.
  await expect(adminPage.getByText(/^suggested prompts$/i)).toBeVisible();
  for (const label of [
    /pipeline basics/i,
    /workshop variables/i,
    /action types/i,
    /code repos/i,
  ]) {
    await expect(adminPage.getByRole('button', { name: label })).toBeVisible();
  }
});

test('Clear button is disabled until the prompt has content, then resets it', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/assist');

  const textarea = adminPage.getByLabel(/^assist prompt$/i);
  const clear = adminPage.getByRole('button', { name: /^clear$/i });

  // Empty prompt → Clear is disabled (matches `disabled={!prompt.trim()}`).
  await expect(clear).toBeDisabled();

  // Typing enables it…
  await textarea.fill('How do I author a streaming pipeline?');
  await expect(clear).toBeEnabled();

  // …and clicking it resets the textarea back to empty.
  await clear.click();
  await expect(textarea).toHaveValue('');
  await expect(clear).toBeDisabled();
});

test('clicking a suggested prompt populates the prompt textarea', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/assist');

  const textarea = adminPage.getByLabel(/^assist prompt$/i);
  await expect(textarea).toHaveValue('');

  // Each suggestion card writes its `prompt` string straight into the
  // textarea via `setPrompt(s.prompt)`.
  await adminPage.getByRole('button', { name: /pipeline basics/i }).click();
  await expect(textarea).toHaveValue(
    'How do I author a streaming pipeline in Pipeline Builder?',
  );

  // A second click overwrites the first (no concatenation).
  await adminPage.getByRole('button', { name: /workshop variables/i }).click();
  await expect(textarea).toHaveValue(
    'What are Workshop variables and when should I use them?',
  );
});

test('Ask button is disabled — the Phase 4.x streaming engine is not wired yet', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/assist');

  const ask = adminPage.getByRole('button', { name: /^ask$/i });

  // Disabled regardless of prompt state — the component hard-codes
  // `disabled` until the engine lands.
  await expect(ask).toBeDisabled();
  await adminPage.getByLabel(/^assist prompt$/i).fill('anything');
  await expect(ask).toBeDisabled();

  // The author left a tooltip explaining why; pin the wording so a
  // rename surfaces here when the engine ships.
  await expect(ask).toHaveAttribute(
    'title',
    /assist engine lands in phase 4\.x/i,
  );
});

test('renders the seeded "Recent answers" exchanges shipped with the placeholder', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/assist');

  // Section heading + the two hard-coded HISTORY[] panels. Pin a
  // distinctive substring of each so a future seed swap surfaces here.
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^recent answers$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/upstream dataset is healthy/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/published workshop app/i),
  ).toBeVisible();

  // Each exchange carries source chips — pin one as a proof point.
  await expect(
    adminPage.getByText(/pipeline builder · build conditions/i),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Regression guards for the roadmap features that aren't shipped yet
// ---------------------------------------------------------------------------

test('absent today: typing + Enter does NOT POST /ai/assist/chat (no engine)', async ({
  adminPage,
}) => {
  // The textarea is a plain `<textarea>` with no `onKeyDown` handler —
  // Enter inserts a newline. Pin the absence of the streaming POST so
  // a half-shipped engine (handler wired before UX is ready) surfaces.
  const calls = captureRequests(adminPage, ASSIST_CHAT_ENDPOINT);

  await adminPage.goto('/ai/assist');
  const textarea = adminPage.getByLabel(/^assist prompt$/i);
  await textarea.fill('Tell me about OpenFoundry');
  await textarea.press('Enter');
  await adminPage.waitForTimeout(300);

  expect(calls.count()).toBe(0);
  // Enter inserted a newline — confirm the textarea kept the keystroke.
  expect(await textarea.inputValue()).toMatch(/\n$/);
});

test('absent today: Stop / Cancel control for an in-flight stream', async ({
  adminPage,
}) => {
  // When the engine lands the page must surface a Stop button while
  // a request is in flight (matches the AssistPage POM's stopButton
  // locator). Today no such control exists.
  await adminPage.goto('/ai/assist');

  expect(
    await adminPage.getByRole('button', { name: /^(stop|cancel)$/i }).count(),
  ).toBe(0);
});

test('absent today: copy-to-clipboard affordance on each answer', async ({
  adminPage,
}) => {
  // The roadmap calls for a per-message Copy button + clipboard write
  // via `navigator.clipboard.writeText(...)`. None exists today.
  await adminPage.goto('/ai/assist');

  expect(
    await adminPage.getByRole('button', { name: /copy( message| answer)?/i }).count(),
  ).toBe(0);
});

test('absent today: rate-limit (429) handling (no API call → no surface)', async ({
  adminPage,
}) => {
  // Drop a 429 onto the future endpoint and confirm the page doesn't
  // call it (so nothing reacts to the rate-limit response) — and that
  // no banner / toast referencing rate limits is rendered up-front.
  const calls = captureRequests(adminPage, ASSIST_CHAT_ENDPOINT);
  await adminPage.route(ASSIST_CHAT_ENDPOINT, async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'retry-after': '30' },
      body: JSON.stringify({ error: 'rate_limited' }),
    });
  });

  await adminPage.goto('/ai/assist');
  await adminPage.waitForTimeout(300);

  expect(calls.count()).toBe(0);
  expect(
    await adminPage.getByText(/rate limit|too many requests|try again/i).count(),
  ).toBe(0);
});

test('absent today: Attach-context buttons (dataset / object / document)', async ({
  adminPage,
}) => {
  // The roadmap surfaces a context picker for grounding answers in a
  // dataset / ontology object / knowledge-base document. Pin the
  // absence so the day someone wires the picker for one resource
  // type, the missing two show up here.
  await adminPage.goto('/ai/assist');

  expect(
    await adminPage
      .getByRole('button', { name: /attach|add context|context picker/i })
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /attach dataset|attach object|attach document/i })
      .count(),
  ).toBe(0);
});

test('absent today: New chat button to reset the conversation history', async ({
  adminPage,
}) => {
  // "Clear" only resets the *current* prompt textarea — it doesn't
  // touch the HISTORY list. The roadmap needs a separate "New chat"
  // CTA that purges in-page state and starts a fresh conversation.
  await adminPage.goto('/ai/assist');

  expect(
    await adminPage.getByRole('button', { name: /new chat|new conversation/i }).count(),
  ).toBe(0);

  // Smoke check: typing then clicking "Clear" must NOT remove the
  // history panels — the seeded exchanges still render afterwards.
  await adminPage.getByLabel(/^assist prompt$/i).fill('test');
  await adminPage.getByRole('button', { name: /^clear$/i }).click();
  await expect(
    adminPage.getByText(/upstream dataset is healthy/i),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// SSE mock pattern smoke (reusable infra — pattern documented in README)
// ---------------------------------------------------------------------------

test('mockSseStream pattern delivers an event-stream body with proper framing', async ({
  adminPage,
}) => {
  // Infra smoke for `helpers/sse.ts` — the page won't call the SSE
  // endpoint until Phase 4.x lands, so we drive the mock from
  // `fetch()` inside the page context to validate the pattern. When
  // the feature ships, the streaming spec can drop this smoke and
  // assert against the UI instead.
  const chunks = [
    JSON.stringify({ delta: 'Hello' }),
    JSON.stringify({ delta: ' world' }),
    JSON.stringify({ delta: '!' }),
  ];
  await mockSseStream(adminPage, ASSIST_CHAT_ENDPOINT, chunks);
  await adminPage.goto('/ai/assist');

  const result = await adminPage.evaluate(async () => {
    const response = await fetch('/api/v1/ai/assist/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ prompt: 'hi' }),
    });
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: await response.text(),
    };
  });

  expect(result.status).toBe(200);
  expect(result.contentType).toContain('text/event-stream');
  // SSE framing — each event terminated by a blank line, terminator
  // marker (`[DONE]`) appended by the helper.
  for (const chunk of chunks) {
    expect(result.body).toContain(`data: ${chunk}\n\n`);
  }
  expect(result.body).toContain('data: [DONE]\n\n');
});
