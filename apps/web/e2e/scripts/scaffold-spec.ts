#!/usr/bin/env tsx
/**
 * Scaffold a new E2E spec for a route area.
 *
 * Usage:
 *   pnpm --filter @open-foundry/web exec tsx \
 *     e2e/scripts/scaffold-spec.ts <area> <route-path> [pageObjectName]
 *
 * Examples:
 *   ... scaffold-spec.ts datasets /datasets DatasetsListPage
 *   ... scaffold-spec.ts notifications /notifications NotificationsPage
 *   ... scaffold-spec.ts favorites /favorites
 *
 * Output:
 *   apps/web/e2e/<area>.spec.ts
 *
 * The generated file contains three test stubs:
 *   - "<area> loads without errors" (smoke navigation)
 *   - "<area> primary CTA opens modal or navigates"
 *   - "<area> list renders mocked data"
 *
 * Each stub is wired to the global fixtures (`adminPage`, `apiMocks`) and
 * marked with TODO comments so the dev fills in the resource-specific
 * assertions. If `pageObjectName` is omitted, the file falls back to
 * inline locators and the dev can wire up a Page Object later.
 *
 * Fails if the target file already exists (does NOT overwrite).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface ScaffoldArgs {
  area: string;
  routePath: string;
  pageObjectName: string | null;
}

function parseArgs(argv: string[]): ScaffoldArgs {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  if (positional.length < 2) {
    usageAndExit('Missing required arguments.');
  }
  const [area, routePath, pageObjectName] = positional;
  if (!isValidArea(area)) {
    usageAndExit(
      `Invalid area "${area}": must be kebab-case (lowercase letters, digits, dashes).`,
    );
  }
  if (!isValidRoutePath(routePath)) {
    usageAndExit(
      `Invalid route-path "${routePath}": must start with "/" and contain only URL-safe chars.`,
    );
  }
  if (pageObjectName !== undefined && !isValidIdentifier(pageObjectName)) {
    usageAndExit(
      `Invalid pageObjectName "${pageObjectName}": must be a TypeScript identifier (e.g. "DatasetsListPage").`,
    );
  }
  return { area, routePath, pageObjectName: pageObjectName ?? null };
}

function isValidArea(s: string | undefined): s is string {
  return typeof s === 'string' && /^[a-z][a-z0-9-]*$/.test(s);
}

function isValidRoutePath(s: string | undefined): s is string {
  return typeof s === 'string' && /^\/[A-Za-z0-9/_:-]*$/.test(s);
}

function isValidIdentifier(s: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/.test(s);
}

function usageAndExit(message: string): never {
  console.error(`scaffold-spec: ${message}\n`);
  console.error('Usage:');
  console.error(
    '  pnpm --filter @open-foundry/web exec tsx e2e/scripts/scaffold-spec.ts <area> <route-path> [pageObjectName]',
  );
  console.error('Examples:');
  console.error(
    '  tsx e2e/scripts/scaffold-spec.ts datasets /datasets DatasetsListPage',
  );
  console.error('  tsx e2e/scripts/scaffold-spec.ts notifications /notifications NotificationsPage');
  console.error('  tsx e2e/scripts/scaffold-spec.ts favorites /favorites');
  process.exit(1);
}

function humanize(area: string): string {
  return area
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderSpec(args: ScaffoldArgs): string {
  const { area, routePath, pageObjectName } = args;
  const human = humanize(area);
  const headingPattern = `new RegExp('${escapeForRegexSrc(human)}', 'i')`;

  const poImport = pageObjectName
    ? `import { ${pageObjectName} } from './pages';\n`
    : '';

  const poConstruction = pageObjectName
    ? `    const ${decap(pageObjectName)} = new ${pageObjectName}(adminPage);
    await ${decap(pageObjectName)}.goto();
    await ${decap(pageObjectName)}.expectLoaded();`
    : `    await adminPage.goto('${routePath}');
    await expect(adminPage).toHaveURL(/${escapeRoutePath(routePath)}/);`;

  const poRefForCta = pageObjectName ? decap(pageObjectName) : null;
  const ctaConstruction = poRefForCta
    ? `    const ${poRefForCta} = new ${pageObjectName!}(adminPage);
    await ${poRefForCta}.goto();
    await ${poRefForCta}.expectLoaded();

    // TODO: identify the primary CTA on this page and click it. Examples:
    //   await ${poRefForCta}.openNew();
    //   await ${poRefForCta}.clickButton(/create|new/i);
    // Then assert either a dialog appears OR the URL changes.
    // await expect(${poRefForCta}.dialog()).toBeVisible();
    // OR
    // await expect(adminPage).toHaveURL(/.../);`
    : `    await adminPage.goto('${routePath}');

    // TODO: identify the primary CTA on this page and click it. Examples:
    //   await adminPage.getByRole('button', { name: /new|create/i }).click();
    // Then assert either a dialog appears OR the URL changes.
    // await expect(adminPage.getByRole('dialog')).toBeVisible();`;

  // The "list renders mocked data" test reuses the page object if it exists.
  const listConstruction = poRefForCta
    ? `    const ${poRefForCta} = new ${pageObjectName!}(adminPage);
    await ${poRefForCta}.goto();
    await ${poRefForCta}.expectLoaded();

    // TODO: assert each mocked row is rendered. With a Page Object that
    // extends ListPagePO you can do:
    //   await expect(${poRefForCta}.row(/Alpha/)).toBeVisible();
    //   await expect(${poRefForCta}.row(/Beta/)).toBeVisible();`
    : `    await adminPage.goto('${routePath}');

    // TODO: assert each mocked row is rendered. Example:
    //   await expect(adminPage.getByRole('row', { name: /Alpha/ })).toBeVisible();`;

  return `import { test, expect } from './fixtures/base';
${poImport}
/**
 * E2E coverage for the ${human} area (\`${routePath}\`).
 *
 * Scaffolded by \`e2e/scripts/scaffold-spec.ts\`. Each test starts as a stub
 * with the global fixtures pre-wired — fill in the TODOs with the actual
 * assertions and request mocks the area needs.
 *
 * Patterns to copy from:
 *   - apps/web/e2e/route-smokes.spec.ts        (route smoke)
 *   - apps/web/e2e/workshop-actions.spec.ts    (data-mocking + assertions)
 *   - apps/web/e2e/fixtures-smoke.spec.ts      (fixture wiring)
 */

test('${area} loads without errors', async ({ adminPage, apiMocks }) => {
  // The \`pageErrors\` auto-fixture already fails the test on any
  // non-allowlisted console.error / pageerror — there's nothing extra to
  // wire up beyond hitting the route.
  void apiMocks; // available for resource mocks if the page needs data

${poConstruction}

  // TODO: assert the page heading or another stable DOM anchor is visible.
  await expect(
    adminPage.getByRole('heading', { name: ${headingPattern} }).first(),
  ).toBeVisible();
});

test('${area} primary CTA opens modal or navigates', async ({ adminPage, apiMocks }) => {
  void apiMocks;
${ctaConstruction}
});

test('${area} list renders mocked data', async ({ adminPage, apiMocks }) => {
  // TODO: replace this stub with the real resource mock(s) the page reads.
  // Example with the api-mocks factory:
  //   await apiMocks.mockDatasetsList(adminPage, [
  //     apiMocks.makeDataset({ id: 'dataset-1', name: 'Alpha' }),
  //     apiMocks.makeDataset({ id: 'dataset-2', name: 'Beta' }),
  //   ]);
  void apiMocks;

${listConstruction}
});
`;
}

function decap(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function escapeForRegexSrc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&').replace(/'/g, "\\'");
}

function escapeRoutePath(p: string): string {
  return p.replace(/\//g, '\\/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Resolve target path relative to this script's parent (e2e/).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const e2eDir = path.resolve(here, '..');
  const target = path.join(e2eDir, `${args.area}.spec.ts`);

  try {
    await fs.access(target);
    console.error(
      `scaffold-spec: refusing to overwrite existing file: ${path.relative(process.cwd(), target)}`,
    );
    process.exit(2);
  } catch {
    // file does not exist — proceed
  }

  const source = renderSpec(args);
  await fs.writeFile(target, source, 'utf8');
  console.log(
    `scaffold-spec: created ${path.relative(process.cwd(), target)}`,
  );
}

main().catch((err: unknown) => {
  console.error('scaffold-spec: unexpected error');
  console.error(err);
  process.exit(99);
});
