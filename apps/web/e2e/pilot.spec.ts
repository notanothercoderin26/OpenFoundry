import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { PilotPage } from './pages';

/**
 * E2E coverage for `/pilot`
 * (apps/web/src/routes/pilot/PilotPage.tsx).
 *
 * What Pilot is. The route is the **AI App Builder**: describe an app
 * in natural language, attach ontology object types as context, and a
 * future generation engine will scaffold the ontology, pages, and seed
 * data. The page hero advertises "Roadmap · Phase 4.2" and the
 * primary "Generate app" CTA ships disabled with that exact gating
 * note as its tooltip ("Generation engine lands in Phase 4.2"), so the
 * actionable surface today is the *prompt-and-context authoring* flow
 * and the *gallery of prior generations*.
 *
 * What ships and is interactive:
 *   - `<textarea aria-label="App description prompt">` — free-form prompt;
 *   - `<input aria-label="Add ontology context">` — type + Enter chips
 *     a new ontology-type tag (deduped, empty-trimmed);
 *   - per-tag `Remove <tag>` `<button>` to drop a chip;
 *   - 3 "Example prompts" `<button>` cards that fill the textarea on
 *     click;
 *   - `Clear` button — disabled when both the textarea is empty and
 *     no tags have been added; clears both on press;
 *   - `Generate app` button — *always* disabled today (Phase 4.2);
 *   - "Recent generations" `<article>` cards (3) showing app name,
 *     relative timestamp, status chip, the original prompt quote, a
 *     generated summary, and the ontology-context chips. Ordered by
 *     `createdAt` desc — the in-progress "Maintenance Console" lands
 *     on top.
 *
 * The page is purely client-side (no fetch on mount; state lives in
 * `useState` + `useMemo`), so these specs install no per-test mocks
 * beyond the default catch-all wired by `fixtures/base`.
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

// Recent generations in the order they should render (createdAt desc).
const GENERATIONS = [
  {
    appName: 'Maintenance Console',
    status: 'Generating',
    promptQuote: 'Create a maintenance scheduling console for plant managers.',
    ontologyContext: ['Asset', 'MaintenanceTask', 'Technician'],
  },
  {
    appName: 'Delivery Tracker',
    status: 'Ready',
    promptQuote:
      'Build a delivery tracking app where dispatchers see active routes and reassign drivers.',
    ontologyContext: ['Driver', 'Route', 'Shipment'],
  },
  {
    appName: 'KYC Onboarding Portal',
    status: 'Ready',
    promptQuote:
      'I need a customer onboarding portal that captures KYC documents and tracks review status.',
    ontologyContext: ['Customer', 'KYCDocument', 'ReviewCase'],
  },
] as const;

const EXAMPLE_PROMPTS = {
  inventory:
    'Build an inventory dashboard showing stock levels per warehouse, with a reorder action when stock drops below threshold.',
  incident:
    'Create an incident triage console with severity filters, ownership assignment, and a runbook drawer linked to each incident type.',
  publicStatus:
    'Build a public status page that shows current service health, scheduled maintenance, and lets visitors subscribe to incident updates by email.',
} as const;

test('identifies as the AI App Builder and lists the recent generations', async ({
  authedPage,
}) => {
  const pilot = new PilotPage(authedPage);
  await pilot.goto();
  await pilot.expectLoaded();

  // The hero h1 is the canonical name; the roadmap chip pins the
  // Phase-4.2 gating.
  await expect(
    authedPage.getByRole('heading', { level: 1, name: /^ai app builder$/i }),
  ).toBeVisible();
  await expect(authedPage.getByText('Roadmap · Phase 4.2', { exact: true })).toBeVisible();

  // The three authoring sections each have their own h2.
  await expect(
    authedPage.getByRole('heading', { level: 2, name: /^describe your app$/i }),
  ).toBeVisible();
  await expect(
    authedPage.getByRole('heading', { level: 2, name: /^example prompts$/i }),
  ).toBeVisible();
  // "Recent generations (3)" — count surfaces in the heading.
  await expect(
    authedPage.getByRole('heading', {
      level: 2,
      name: new RegExp(`recent generations\\s*\\(${GENERATIONS.length}\\)`, 'i'),
    }),
  ).toBeVisible();

  // Each generation renders as an <article> with the app name as its
  // h3 heading.
  for (const gen of GENERATIONS) {
    const card = authedPage
      .locator('article')
      .filter({ has: authedPage.getByRole('heading', { level: 3, name: gen.appName }) });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(gen.status);
    await expect(card).toContainText(gen.promptQuote);
    for (const tag of gen.ontologyContext) {
      await expect(card.getByText(tag, { exact: true })).toBeVisible();
    }
  }
});

test('the prompt textarea + ontology context chips form behaves end-to-end', async ({
  authedPage,
}) => {
  const pilot = new PilotPage(authedPage);
  await pilot.goto();

  const prompt = authedPage.getByLabel('App description prompt');
  const contextInput = authedPage.getByLabel('Add ontology context');

  // Free-form prompt — typing flows straight into the textarea.
  await prompt.fill('Build a field-ops console for technicians.');
  await expect(prompt).toHaveValue('Build a field-ops console for technicians.');

  // Type "Driver" + Enter → chip lands inside the context strip.
  await contextInput.fill('Driver');
  await contextInput.press('Enter');
  await expect(authedPage.getByRole('button', { name: 'Remove Driver' })).toBeVisible();
  // The input clears on commit so the next tag can be typed.
  await expect(contextInput).toHaveValue('');

  // A second tag.
  await contextInput.fill('Shipment');
  await contextInput.press('Enter');
  await expect(authedPage.getByRole('button', { name: 'Remove Shipment' })).toBeVisible();

  // Duplicate "Driver" is silently dropped (the existing chip
  // remains, the input clears, no second chip lands).
  await contextInput.fill('Driver');
  await contextInput.press('Enter');
  await expect(contextInput).toHaveValue('');
  await expect(authedPage.getByRole('button', { name: 'Remove Driver' })).toHaveCount(1);

  // Whitespace-only tags are ignored entirely.
  await contextInput.fill('   ');
  await contextInput.press('Enter');
  // Only the two original chips remain.
  await expect(authedPage.locator('button[aria-label^="Remove "]')).toHaveCount(2);

  // Remove "Driver" — chip disappears, "Shipment" stays.
  await authedPage.getByRole('button', { name: 'Remove Driver' }).click();
  await expect(authedPage.getByRole('button', { name: 'Remove Driver' })).toHaveCount(0);
  await expect(authedPage.getByRole('button', { name: 'Remove Shipment' })).toBeVisible();
});

test('clicking an example prompt fills the textarea with the example body', async ({
  authedPage,
}) => {
  const pilot = new PilotPage(authedPage);
  await pilot.goto();

  const prompt = authedPage.getByLabel('App description prompt');

  // The example cards render as <button class="of-card">; their
  // accessible name concatenates the eyebrow label + body + the
  // "Use this prompt →" footer.
  await authedPage.getByRole('button', { name: /^Inventory dashboard/i }).click();
  await expect(prompt).toHaveValue(EXAMPLE_PROMPTS.inventory);

  // Selecting another example replaces — not appends — the prompt.
  await authedPage.getByRole('button', { name: /^Incident triage console/i }).click();
  await expect(prompt).toHaveValue(EXAMPLE_PROMPTS.incident);

  await authedPage.getByRole('button', { name: /^Public status page/i }).click();
  await expect(prompt).toHaveValue(EXAMPLE_PROMPTS.publicStatus);
});

test('Clear is disabled when empty and clears prompt + tags when used', async ({
  authedPage,
}) => {
  const pilot = new PilotPage(authedPage);
  await pilot.goto();

  const prompt = authedPage.getByLabel('App description prompt');
  const contextInput = authedPage.getByLabel('Add ontology context');
  const clearButton = authedPage.getByRole('button', { name: /^Clear$/ });

  // Empty state → Clear is disabled.
  await expect(clearButton).toBeDisabled();

  // Typing into the prompt alone enables Clear.
  await prompt.fill('Sketch idea');
  await expect(clearButton).toBeEnabled();

  // Pressing Clear wipes the prompt back to empty.
  await clearButton.click();
  await expect(prompt).toHaveValue('');
  await expect(clearButton).toBeDisabled();

  // Tag-only state also enables Clear (the disabled predicate is
  // `prompt is empty AND no tags`).
  await contextInput.fill('Asset');
  await contextInput.press('Enter');
  await expect(clearButton).toBeEnabled();

  // Both prompt + tag: Clear wipes both at once.
  await prompt.fill('Maintenance console for plant managers.');
  await contextInput.fill('Technician');
  await contextInput.press('Enter');
  await expect(authedPage.getByRole('button', { name: 'Remove Asset' })).toBeVisible();
  await expect(authedPage.getByRole('button', { name: 'Remove Technician' })).toBeVisible();

  await clearButton.click();
  await expect(prompt).toHaveValue('');
  await expect(authedPage.locator('button[aria-label^="Remove "]')).toHaveCount(0);
  await expect(clearButton).toBeDisabled();
});

test('"Generate app" ships disabled with the Phase-4.2 tooltip', async ({
  authedPage,
}) => {
  const pilot = new PilotPage(authedPage);
  await pilot.goto();

  const generate = authedPage.getByRole('button', { name: /^Generate app$/ });
  await expect(generate).toBeVisible();
  // The button is permanently disabled today regardless of prompt
  // content — the generation engine itself is the gate, not the form
  // validity.
  await expect(generate).toBeDisabled();
  await expect(generate).toHaveAttribute('title', /phase 4\.2/i);

  // Filling the form does NOT enable it — gate is independent of UI
  // state.
  await authedPage.getByLabel('App description prompt').fill(EXAMPLE_PROMPTS.inventory);
  const ctx = authedPage.getByLabel('Add ontology context');
  await ctx.fill('Warehouse');
  await ctx.press('Enter');
  await expect(generate).toBeDisabled();
});

test('recent-generations cards show status chip + ontology context + ordering', async ({
  authedPage,
}) => {
  const pilot = new PilotPage(authedPage);
  await pilot.goto();

  // Cards render in `createdAt` descending order — the in-progress
  // "Maintenance Console" sits above the older ready ones. Pin the
  // first/last app name in DOM order.
  const cards = authedPage.locator('section.of-page article');
  await expect(cards).toHaveCount(GENERATIONS.length);
  await expect(cards.first()).toContainText(GENERATIONS[0].appName);
  await expect(cards.last()).toContainText(GENERATIONS[GENERATIONS.length - 1].appName);

  // The in-progress card surfaces its "Generating" status chip; the
  // shipped one surfaces "Ready".
  const generating = cards.filter({
    has: authedPage.getByRole('heading', { level: 3, name: 'Maintenance Console' }),
  });
  await expect(generating).toContainText('Generating');

  const ready = cards.filter({
    has: authedPage.getByRole('heading', { level: 3, name: 'Delivery Tracker' }),
  });
  await expect(ready).toContainText('Ready');

  // Ontology-context chips on the Delivery Tracker card.
  for (const tag of GENERATIONS[1].ontologyContext) {
    await expect(ready.getByText(tag, { exact: true })).toBeVisible();
  }
});
