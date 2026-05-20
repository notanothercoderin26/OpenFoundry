import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { CipherPage } from './pages';

/**
 * E2E coverage for `/cipher` — OpenFoundry's Crypto Service surface
 * (apps/web/src/routes/cipher/CipherPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a *static placeholder*
 * driven by hardcoded `MOCK_CHANNELS` + `MOCK_OPERATIONS` constants
 * — no API calls, no key material in the response shape, no
 * create / rotate / delete flow, and crucially no "reveal" or
 * "copy secret" affordance. The page is purely a metadata surface:
 * channel names, algorithm, key VERSION (not the key itself),
 * rotation cadence, op counts, authorized groups, caller IDs +
 * payload SIZE (not payload contents).
 *
 * The `CipherPage` page-object's `newSecretButton` / `rotateButton`
 * / `revealButton` / `hideButton` locators reflect the roadmap
 * intent. The absent-today guard pins all four as unresolved.
 *
 * **Security invariant.** The task brief asks specifically:
 * "valores secretos NUNCA se muestran en logs/DOM tras revelarlos".
 * The shipped page has nothing to reveal, but the final test scans
 * the full DOM body text + console output for common secret-shape
 * patterns (PEM headers, AWS access keys, long base64 / hex blobs)
 * so a future regression that wires up a real reveal flow without
 * masking surfaces here first.
 */

test.use({
  errorAllowlist: {
    patterns: [
      ...DEFAULT_ERROR_ALLOWLIST,
      /Cannot read properties of undefined/,
      /^console\.error: %o$/,
      /Failed to load/i,
    ],
  },
});

test('renders the hero, KPI strip, filter tablist, channel cards, and recent-operations table', async ({
  adminPage,
}) => {
  const page = new CipherPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Hero eyebrow + h1.
  await expect(adminPage.getByText(/Security & Governance · Crypto Service/i)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Crypto Service$/ }),
  ).toBeVisible();

  // KPI labels render.
  for (const label of ['Channels', 'Active', 'Operations \\(24h\\)', 'Denied requests']) {
    await expect(adminPage.getByText(new RegExp(`^${label}$`)).first()).toBeVisible();
  }

  // Filter tablist exposes the four chips.
  const tablist = adminPage.getByRole('tablist', { name: /Filter channels/i });
  for (const tab of ['All channels', 'Active', 'Rotating', 'Paused']) {
    await expect(tablist.getByRole('tab', { name: new RegExp(`^${tab}$`) })).toBeVisible();
  }

  // Channel-list heading + every mocked card.
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Cryptographic channels/ })).toBeVisible();
  for (const name of ['PII at-rest', 'Finance reference hashing', 'Partner share envelope', 'Legacy payments channel']) {
    await expect(adminPage.getByRole('article', { name })).toBeVisible();
  }

  // Operations table.
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Recent operations$/ })).toBeVisible();
  await expect(adminPage.getByRole('table')).toBeVisible();
});

test('status filter chips: selecting "Paused" narrows the card grid to the legacy channel only', async ({
  adminPage,
}) => {
  const page = new CipherPage(adminPage);
  await page.goto();

  // Pre-state: All channels selected; 4 cards visible.
  const allTab = adminPage.getByRole('tab', { name: /^All channels$/ });
  await expect(allTab).toHaveAttribute('aria-selected', 'true');
  await expect(adminPage.getByRole('article')).toHaveCount(4);
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Cryptographic channels \(4\)/ })).toBeVisible();

  // Switch to Paused — only the Legacy payments channel survives.
  await adminPage.getByRole('tab', { name: /^Paused$/ }).click();
  await expect(adminPage.getByRole('tab', { name: /^Paused$/ })).toHaveAttribute('aria-selected', 'true');
  await expect(adminPage.getByRole('article')).toHaveCount(1);
  await expect(adminPage.getByRole('article', { name: 'Legacy payments channel' })).toBeVisible();
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Cryptographic channels \(1\)/ })).toBeVisible();

  // Back to Active — only the two active channels are visible.
  await adminPage.getByRole('tab', { name: /^Active$/ }).click();
  await expect(adminPage.getByRole('article')).toHaveCount(2);
  await expect(adminPage.getByRole('article', { name: 'PII at-rest' })).toBeVisible();
  await expect(adminPage.getByRole('article', { name: 'Finance reference hashing' })).toBeVisible();
});

test('channel cards expose key-version / algorithm / rotation metadata only — never raw key material', async ({
  adminPage,
}) => {
  const page = new CipherPage(adminPage);
  await page.goto();

  const piiCard = adminPage.getByRole('article', { name: 'PII at-rest' });
  // Header line carries "<algorithm> · v<key_version>" — exposes the
  // version pointer, not the key itself.
  await expect(piiCard.getByText(/AES-256-GCM · v7/)).toBeVisible();
  // Status chip + rotation cadence + authorized groups.
  await expect(piiCard.getByText(/^Active$/)).toBeVisible();
  await expect(piiCard.getByText(/^every 90 days$/)).toBeVisible();
  await expect(piiCard.getByText(/^platform-admins$/)).toBeVisible();
  await expect(piiCard.getByText(/^pii-readers$/)).toBeVisible();

  const partnerCard = adminPage.getByRole('article', { name: 'Partner share envelope' });
  await expect(partnerCard.getByText(/AES-256-SIV · v12/)).toBeVisible();
  await expect(partnerCard.getByText(/^Rotating$/)).toBeVisible();

  // No card surfaces a "key", "secret", "ciphertext", "plaintext",
  // or "value" data point. (The roadmap reveal flow would show the
  // current key material; today there's nothing of the sort.)
  expect(await piiCard.getByText(/^Key$|^Secret$|^Ciphertext$|^Plaintext$|^Value$/i).count()).toBe(0);
  expect(await partnerCard.getByText(/^Key$|^Secret$|^Ciphertext$|^Plaintext$|^Value$/i).count()).toBe(0);
});

test('recent-operations table renders all six entries with kind + outcome chips and payload SIZE only (no contents)', async ({
  adminPage,
}) => {
  const page = new CipherPage(adminPage);
  await page.goto();

  const table = adminPage.getByRole('table');
  // 6 mocked operations + 1 header row.
  await expect(table.getByRole('row')).toHaveCount(7);

  // Column headers.
  for (const h of ['When', 'Channel', 'Op', 'Caller', 'Payload', 'Duration', 'Outcome']) {
    await expect(table.getByRole('columnheader', { name: h })).toBeVisible();
  }

  // Kind chips for every operation kind in the fixtures.
  await expect(table.getByText(/^encrypt$/).first()).toBeVisible();
  await expect(table.getByText(/^decrypt$/).first()).toBeVisible();
  await expect(table.getByText(/^hash$/).first()).toBeVisible();

  // Outcome chips — the seed data has both Succeeded and Denied.
  await expect(table.getByText(/^Succeeded$/).first()).toBeVisible();
  await expect(table.getByText(/^Denied$/)).toBeVisible();

  // Payload column shows SIZE (KB / MB / GB), not contents. The
  // seed uses "12 KB", "4.2 MB", "184 MB", etc. — pin two sample
  // values + assert no raw payload text leaks.
  await expect(table.getByText(/^12 KB$/).first()).toBeVisible();
  await expect(table.getByText(/^4\.2 MB$/)).toBeVisible();
  await expect(table.getByText(/^184 MB$/)).toBeVisible();

  // Caller column carries identifiers like "service:ingest" or
  // "user:m.alvarez" — no raw credentials, no API tokens.
  await expect(table.getByText(/^service:ingest$/)).toBeVisible();
  await expect(table.getByText(/^user:m\.alvarez$/)).toBeVisible();
});

test('security guard: no Reveal / Rotate / New-secret CTAs ship; the page never leaks secret-shaped material in DOM or console', async ({
  adminPage,
  pageErrors,
}) => {
  // Regression guard for the spec brief:
  // "Verifica que valores secretos NUNCA se muestran en logs/DOM
  //  tras revelarlos."
  //
  // The shipped surface has no reveal/rotate/new affordance, but
  // this test pins (a) the absence of those controls today, and
  // (b) a defensive scan of the full DOM body text + the captured
  // console for common secret-shape patterns so a future regression
  // that wires the real flow without masking surfaces here first.
  const page = new CipherPage(adminPage);
  await page.goto();
  await page.expectLoaded();
  await expect(adminPage.getByRole('heading', { level: 1, name: /^Crypto Service$/ })).toBeVisible();

  // 1. Roadmap CTAs are absent today. The page object's
  //    aspirational locators all resolve zero elements except
  //    `newSecretButton` — which matches /new secret|add secret/i
  //    and the page only ships a `New channel` button; the channel
  //    button is disabled.
  expect(await page.newSecretButton.count()).toBe(0);
  expect(await page.rotateButton.count()).toBe(0);
  expect(await page.revealButton.count()).toBe(0);
  expect(await page.hideButton.count()).toBe(0);
  // The shipped "New channel" button exists but is disabled.
  await expect(adminPage.getByRole('button', { name: /^New channel$/i })).toBeDisabled();

  // 2. No "Copy secret" / "Show value" / "Reveal key" affordances.
  for (const re of [
    /reveal/i,
    /^show$/i,
    /show secret/i,
    /show key/i,
    /copy secret/i,
    /copy key/i,
    /^unmask$/i,
  ]) {
    expect(await adminPage.getByRole('button', { name: re }).count()).toBe(0);
  }

  // 3. Defensive scan: the page body's textContent must NOT contain
  //    any secret-shape pattern. This catches future regressions
  //    that wire up real reveals without masking. Patterns:
  //    - PEM markers
  //    - AWS access-key prefix
  //    - long contiguous base64-only runs (≥40 chars, no spaces)
  //    - long contiguous hex runs (≥40 chars)
  //    - explicit "BEGIN" / "PRIVATE KEY" / "secret_value" copy
  const bodyText = (await adminPage.locator('body').innerText()).trim();
  expect(bodyText).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  expect(bodyText).not.toMatch(/-----BEGIN OPENSSH PRIVATE KEY-----/);
  expect(bodyText).not.toMatch(/-----BEGIN CERTIFICATE-----/);
  expect(bodyText).not.toMatch(/\bAKIA[0-9A-Z]{16}\b/);
  expect(bodyText).not.toMatch(/\bASIA[0-9A-Z]{16}\b/);
  expect(bodyText).not.toMatch(/\bghp_[A-Za-z0-9]{36}\b/);
  expect(bodyText).not.toMatch(/\bsk-[A-Za-z0-9]{20,}\b/);
  expect(bodyText).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
  expect(bodyText).not.toMatch(/\b[a-f0-9]{40,}\b/);
  expect(bodyText).not.toMatch(/secret[_-]?value\s*[:=]/i);

  // 4. The same scan applied to the captured console traffic. The
  //    `pageErrors` fixture already captures `pageerror` +
  //    `console.error` entries — assert that nothing in that list
  //    matches a secret shape (separate from the auto post-test
  //    assertion, which only checks for unexpected errors).
  const joinedConsole = pageErrors.join('\n');
  expect(joinedConsole).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  expect(joinedConsole).not.toMatch(/\bAKIA[0-9A-Z]{16}\b/);
  expect(joinedConsole).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
});
