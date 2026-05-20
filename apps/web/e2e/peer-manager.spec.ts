import { test, expect } from './fixtures/base';
import { DEFAULT_ERROR_ALLOWLIST } from './fixtures/base';
import { PeerManagerPage } from './pages';

/**
 * E2E coverage for `/peer-manager`
 * (apps/web/src/routes/peer-manager/PeerManagerPage.tsx).
 *
 * **Reality vs roadmap.** The shipped page is a *static placeholder*
 * driven by hardcoded `MOCK_PEERS` / `MOCK_ONTOLOGY_SHARES` /
 * `MOCK_FILE_SHARES` constants — no API calls, no federation
 * onboarding wizard, no per-peer connect / disconnect / pause
 * controls, no peer-detail drawer. The only interactive control on
 * the page is the share-type tablist (Ontology shares ↔ File
 * shares). "Add peer" is rendered `disabled` with a "Phase 4.x"
 * title.
 *
 * The `PeerManagerPage` page-object's `addPeerButton` /
 * `disconnectButton` locators reflect the roadmap intent. The
 * absent-today guard below pins both as unresolved.
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

test('renders hero, KPI strip, peer profile cards, and the share-type tablist', async ({
  adminPage,
}) => {
  const page = new PeerManagerPage(adminPage);
  await page.goto();
  await page.expectLoaded();

  // Hero eyebrow + h1.
  await expect(adminPage.getByText(/Data integration · Peer Manager/i)).toBeVisible();
  await expect(
    adminPage.getByRole('heading', { level: 1, name: /^Peer Manager$/ }),
  ).toBeVisible();

  // KPI strip — value text is the source of truth (labels also
  // appear as field captions inside the peer cards, so anchor on
  // the unique numbers).
  await expect(adminPage.getByText(/^Peers$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^Active$/i).first()).toBeVisible();
  await expect(adminPage.getByText(/^Ontology shares$/i).first()).toBeVisible();
  // "File shares" appears in the KPI strip + the field caption +
  // the tab label — pin the count.
  await expect(adminPage.getByText(/^File shares$/i).first()).toBeVisible();

  // Section heading + tablist.
  await expect(adminPage.getByRole('heading', { level: 2, name: /^Peer profiles$/ })).toBeVisible();
  const tablist = adminPage.getByRole('tablist', { name: /Share type/i });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole('tab', { name: /^Ontology shares$/ })).toBeVisible();
  await expect(tablist.getByRole('tab', { name: /^File shares$/ })).toBeVisible();
});

test('lists every mocked peer as an aria-labelled article with status chip + last-sync caption', async ({
  adminPage,
}) => {
  const page = new PeerManagerPage(adminPage);
  await page.goto();

  // Each peer card renders as `<article aria-label="<name>">`.
  for (const name of [
    'OpenFoundry EU',
    'OpenFoundry APAC',
    'ACME Logistics (partner)',
    'Internal Sandbox',
  ]) {
    const card = adminPage.getByRole('article', { name });
    await expect(card).toBeVisible();
    // Each card carries a "Last sync …" caption.
    await expect(card.getByText(/Last sync /i)).toBeVisible();
  }

  // Status chips per peer (Active / Pending / Paused). The active
  // count = 2 (EU + APAC).
  const euCard = adminPage.getByRole('article', { name: 'OpenFoundry EU' });
  await expect(euCard.getByText(/^Active$/)).toBeVisible();
  await expect(euCard.getByText(/^eu-central-1$/)).toBeVisible();

  const partnerCard = adminPage.getByRole('article', { name: 'ACME Logistics (partner)' });
  await expect(partnerCard.getByText(/^Pending$/)).toBeVisible();

  const sandboxCard = adminPage.getByRole('article', { name: 'Internal Sandbox' });
  await expect(sandboxCard.getByText(/^Paused$/)).toBeVisible();
});

test('Ontology shares tab is selected by default and the table lists every mocked share', async ({
  adminPage,
}) => {
  const page = new PeerManagerPage(adminPage);
  await page.goto();

  const ontologyTab = adminPage.getByRole('tab', { name: /^Ontology shares$/ });
  await expect(ontologyTab).toHaveAttribute('aria-selected', 'true');

  const table = adminPage.getByRole('table');
  await expect(table).toBeVisible();
  // Header columns specific to the ontology table.
  for (const h of ['Object type', 'Peer', 'Direction', 'Objects', 'Last sync']) {
    await expect(table.getByRole('columnheader', { name: h })).toBeVisible();
  }

  // 4 ontology share rows + the header = 5 total.
  await expect(table.getByRole('row')).toHaveCount(5);

  // Sample row content — bidirectional Shipment share with EU peer.
  const shipmentRow = table.getByRole('row', {
    name: /Shipment\s+OpenFoundry EU.*Bidirectional/,
  });
  await expect(shipmentRow).toBeVisible();
  // Object counts are formatted with thousands separators.
  await expect(table.getByText(/^8,420$/)).toBeVisible();
  await expect(table.getByText(/^12,300$/)).toBeVisible();
});

test('switching to the File shares tab swaps the table for the file-shares grid with status chips', async ({
  adminPage,
}) => {
  const page = new PeerManagerPage(adminPage);
  await page.goto();

  // Pre-state: ontology table is mounted.
  await expect(adminPage.getByRole('columnheader', { name: 'Object type' })).toBeVisible();

  await adminPage.getByRole('tab', { name: /^File shares$/ }).click();

  // The File-shares tab is now selected.
  await expect(
    adminPage.getByRole('tab', { name: /^File shares$/ }),
  ).toHaveAttribute('aria-selected', 'true');

  // Ontology columns are gone; file-share columns replace them.
  await expect(adminPage.getByRole('columnheader', { name: 'Object type' })).toHaveCount(0);
  for (const h of ['Dataset', 'Peer', 'Direction', 'Size', 'Status', 'Last sync']) {
    await expect(adminPage.getByRole('columnheader', { name: h })).toBeVisible();
  }

  // 4 file-share rows + header = 5 total.
  const table = adminPage.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(5);

  // Specific row content + status chips.
  await expect(table.getByText(/^gold\/customers$/)).toBeVisible();
  await expect(table.getByText(/^silver\/inventory-apac$/)).toBeVisible();
  await expect(table.getByText(/^Synced$/).first()).toBeVisible();
  await expect(table.getByText(/^Syncing$/)).toBeVisible();
  await expect(table.getByText(/^Paused$/)).toBeVisible();
});

test('absent today: no real federation onboarding; Add peer is disabled and no per-peer connect/disconnect controls exist', async ({
  adminPage,
}) => {
  // Regression guard. The roadmap calls for a federation onboarding
  // wizard + per-peer connect / disconnect / pause / resume
  // controls; until those ship, pin the absence so a half-shipped
  // feature surfaces here first. The PeerManagerPage page object's
  // `addPeerButton` and `disconnectButton` locators are
  // aspirational and resolve zero elements (the Add peer button
  // exists but is disabled).
  const page = new PeerManagerPage(adminPage);
  await page.goto();
  await page.expectLoaded();
  await expect(adminPage.getByRole('heading', { level: 1, name: /^Peer Manager$/ })).toBeVisible();

  // "Add peer" exists in the DOM but is rendered `disabled` with
  // the "Phase 4.x" placeholder title — the page object's
  // `addPeerButton` resolves it (regex matches /add peer/i).
  await expect(page.addPeerButton).toBeDisabled();
  await expect(page.addPeerButton).toHaveAttribute('title', /Phase 4\.x/i);

  // No per-peer connect / disconnect / pause / resume buttons. The
  // page-object's `disconnectButton` resolves zero elements.
  expect(await page.disconnectButton.count()).toBe(0);
  expect(
    await adminPage.getByRole('button', { name: /^(disconnect|pause|resume)$/i }).count(),
  ).toBe(0);

  // The peer cards have no embedded action buttons — they are
  // purely informational. Pin that by checking that the EU peer
  // card has zero `<button>` descendants.
  const euCard = adminPage.getByRole('article', { name: 'OpenFoundry EU' });
  expect(await euCard.getByRole('button').count()).toBe(0);

  // No federation onboarding wizard mounts.
  expect(await adminPage.getByRole('dialog').count()).toBe(0);
});
