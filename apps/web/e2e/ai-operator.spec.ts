import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { captureRequests } from './fixtures/api-mocks';

/**
 * E2E coverage for `/ai/operator` (apps/web/src/routes/ai/OperatorPage.tsx).
 *
 * **Reality check.** Like the other AI sub-surfaces this page is a
 * Phase 4.2 roadmap placeholder — the `Plan` CTA is permanently
 * disabled with the tooltip "Operator engine ships in Phase 4.x",
 * the two "Recent sessions" entries come from a hard-coded
 * `MOCK_SESSIONS` const, and the awaiting-approval banner's
 * Reject / Approve buttons are also disabled. There is no live
 * progress feed, SSE stream, pause / cancel control, or resource-
 * allowlist picker — the user's casos 2–4 are entirely absent.
 *
 * What *is* shipped today and worth pinning:
 *   - Hero with eyebrow `AI Platform · AI Operator`, h1, paragraph,
 *     and "Roadmap · Phase 4.2" chip.
 *   - "Start a new session" panel: an `Operator prompt` textarea +
 *     Clear button (enabled iff non-whitespace content) +
 *     disabled `Plan` CTA.
 *   - "Recent sessions" left aside with 2 entries; first auto-active.
 *   - "Plan & execution trace" right panel showing the active
 *     session's prompt, status chip, and a numbered list of steps
 *     each with their tool-call lines (`tool(args) ↳ result`).
 *   - Awaiting-approval banner for the seeded `sess-1`, with two
 *     disabled Reject / Approve buttons.
 *
 * Per the codebase convention this spec PINS the placeholder
 * behaviour and adds regression guards for the missing roadmap
 * controls.
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
// Shipped placeholder behaviour
// ---------------------------------------------------------------------------

test('renders the placeholder hero, prompt panel, sessions list, and trace', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/operator');

  // AppShell stays mounted.
  await expect(
    adminPage.getByRole('navigation', { name: /primary navigation/i }),
  ).toBeVisible();

  // Hero.
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^ai operator$/i }),
  ).toBeVisible();
  await expect(adminPage.getByText(/^ai platform · ai operator$/i)).toBeVisible();
  await expect(adminPage.getByText(/^roadmap · phase 4\.2$/i)).toBeVisible();

  // Start-a-new-session panel: textarea + Clear + Plan.
  await expect(adminPage.getByLabel(/^operator prompt$/i)).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^clear$/i })).toBeVisible();
  await expect(adminPage.getByRole('button', { name: /^plan$/i })).toBeVisible();

  // Recent sessions aside + the Plan & execution trace heading.
  await expect(adminPage.getByText(/^recent sessions$/i)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 2, name: /^plan & execution trace$/i }),
  ).toBeVisible();
});

test('Plan CTA is disabled — the Phase 4.x operator engine is not wired yet', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/operator');

  const plan = adminPage.getByRole('button', { name: /^plan$/i });

  // Disabled regardless of prompt state — the component hard-codes
  // `disabled` until the engine lands.
  await expect(plan).toBeDisabled();
  await adminPage.getByLabel(/^operator prompt$/i).fill('test task');
  await expect(plan).toBeDisabled();

  // The author left a tooltip explaining why; pin the wording so a
  // rename surfaces here when the engine ships.
  await expect(plan).toHaveAttribute(
    'title',
    /operator engine ships in phase 4\.x/i,
  );
});

test('Clear is disabled until the prompt has non-whitespace content', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/operator');

  const textarea = adminPage.getByLabel(/^operator prompt$/i);
  const clear = adminPage.getByRole('button', { name: /^clear$/i });

  // Empty (and whitespace-only) prompts keep Clear disabled.
  await expect(clear).toBeDisabled();
  await textarea.fill('   ');
  await expect(clear).toBeDisabled();

  // Real content enables it; clicking resets the textarea.
  await textarea.fill('Backfill the Q1 invoices dataset.');
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(textarea).toHaveValue('');
  await expect(clear).toBeDisabled();
});

test('Recent sessions: two entries, first auto-active, clicking swaps the trace', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/operator');

  // Both seeded sessions render as cards in the aside.
  const sessionOne = adminPage.getByRole('button', { name: /streaming pipeline/i });
  const sessionTwo = adminPage.getByRole('button', {
    name: /add a column to the invoice/i,
  });
  await expect(sessionOne).toBeVisible();
  await expect(sessionTwo).toBeVisible();

  // sess-1 is active by default — its prompt + "Awaiting approval"
  // status chip render in the right-hand trace panel.
  await expect(
    adminPage.getByText(/"create a streaming pipeline that ingests stripe/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText('Awaiting approval', { exact: true }).first(),
  ).toBeVisible();

  // Click the second session — the trace swaps to its prompt + the
  // "Succeeded" status. Scope the status chip lookup to the trace
  // `<section class="of-panel">` (the aside ALSO carries a
  // "Succeeded" chip for sess-2 from page load, so a global match
  // doesn't prove the click took effect). Also exclude the outer
  // `<section class="of-page">` — both `.of-page` and the trace's
  // `.of-panel` contain the h2 as a descendant.
  await sessionTwo.click();
  await expect(
    adminPage.getByText(/"add a column to the invoice dataset that flags overdue/i),
  ).toBeVisible();
  const tracePanel = adminPage
    .locator('section.of-panel')
    .filter({
      has: adminPage.getByRole('heading', {
        level: 2,
        name: /^plan & execution trace$/i,
      }),
    });
  await expect(
    tracePanel.getByText('Succeeded', { exact: true }),
  ).toBeVisible();
});

test('Plan & execution trace renders the active session\'s steps + tool calls', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/operator');

  // sess-1 is active — pin all four step descriptions in order.
  for (const step of [
    'Discover existing Stripe data connection',
    'Locate or create the Payment object type',
    'Design pipeline mapping webhook payload → Payment',
    'Request approval and publish the pipeline',
  ]) {
    await expect(adminPage.getByText(step, { exact: true })).toBeVisible();
  }

  // Tool calls render as `tool(args)` + `↳ result` lines. Pin one of
  // each from the seeded session so a wire-format change in the
  // monospace formatter surfaces here.
  await expect(
    adminPage.getByText(/data-connection\.list\(\{ source: "stripe" \}\)/),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/↳ found 1 connection: stripe-prod/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/ontology\.find_type\(\{ name: "payment" \}\)/i),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/pipeline\.draft\(\{ source: "stripe-prod"/i),
  ).toBeVisible();
});

test('awaiting-approval banner surfaces for sess-1 with disabled Reject / Approve buttons', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/operator');

  // The banner copy: "The operator paused before publishing changes…"
  await expect(
    adminPage.getByText(/the operator paused before publishing changes/i),
  ).toBeVisible();

  // The two CTAs are visible but BOTH disabled until the engine lands.
  // The Approve label includes an "&" — match by substring.
  const reject = adminPage.getByRole('button', { name: /^reject$/i });
  const approve = adminPage.getByRole('button', { name: /approve & continue/i });
  await expect(reject).toBeVisible();
  await expect(approve).toBeVisible();
  await expect(reject).toBeDisabled();
  await expect(approve).toBeDisabled();
});

test('awaiting-approval banner is HIDDEN when a non-awaiting session is active', async ({
  adminPage,
}) => {
  // sess-2's status is `succeeded`, so the approval block must NOT
  // render when it becomes the active session. Pins the conditional
  // `{active.status === 'awaiting-approval' && (...)}` branch.
  await adminPage.goto('/ai/operator');
  await adminPage
    .getByRole('button', { name: /add a column to the invoice/i })
    .click();

  await expect(
    adminPage.getByText(/the operator paused before publishing/i),
  ).toBeHidden();
  expect(
    await adminPage.getByRole('button', { name: /approve & continue/i }).count(),
  ).toBe(0);
});

// ---------------------------------------------------------------------------
// Regression guards for the roadmap features the user spec'd
// ---------------------------------------------------------------------------

test('absent today: real-time progress feed — no /api/v1/ai|agent-runtime|operator/* requests', async ({
  adminPage,
}) => {
  // The roadmap calls for an SSE feed driving the trace as the
  // operator plans + executes. Today the trace is static
  // `MOCK_SESSIONS` data and no backend call is fired on mount. Pin
  // the absence so the day someone wires the feed for one endpoint
  // (without finishing the UI), the partial wiring shows up here.
  const aiCalls = captureRequests(adminPage, /\/api\/v1\/ai\//);
  const agentCalls = captureRequests(adminPage, /\/api\/v1\/agent-runtime\//);
  const operatorCalls = captureRequests(adminPage, /\/api\/v1\/operator/);

  await adminPage.goto('/ai/operator');
  // Type + (attempt to) Plan; Plan is disabled so it's a no-op, but
  // the test mimics a user trying to start a run before pinning the
  // absence of any resulting network round-trip.
  await adminPage.getByLabel(/^operator prompt$/i).fill('do a thing');
  await adminPage
    .getByRole('button', { name: /^plan$/i })
    .click({ force: true });
  await adminPage.waitForTimeout(300);

  expect(aiCalls.count()).toBe(0);
  expect(agentCalls.count()).toBe(0);
  expect(operatorCalls.count()).toBe(0);
});

test('absent today: Pause / Cancel controls + resource-allowlist picker', async ({
  adminPage,
}) => {
  await adminPage.goto('/ai/operator');

  // No mid-run pause / cancel CTAs.
  expect(
    await adminPage.getByRole('button', { name: /^pause( run| session)?$/i }).count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('button', { name: /^(cancel run|cancel session|stop run)$/i })
      .count(),
  ).toBe(0);

  // No resource-allowlist picker (the roadmap calls for selecting
  // which datasets / ontology types / tools the operator may touch).
  expect(
    await adminPage
      .getByLabel(/allowed resources|resource allowlist|permitted (datasets|tools|object types)/i)
      .count(),
  ).toBe(0);
  expect(
    await adminPage
      .getByRole('group', { name: /allowed (datasets|tools|object types|resources)/i })
      .count(),
  ).toBe(0);
});
