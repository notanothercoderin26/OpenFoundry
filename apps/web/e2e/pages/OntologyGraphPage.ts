import { type Locator, type Page } from '@playwright/test';
import { BasePagePO } from './_base';

/** Page Object for `/ontology/graph` (Cytoscape graph). */
export class OntologyGraphPage extends BasePagePO {
  readonly graphCanvas: Locator;
  readonly layoutPicker: Locator;
  readonly namespaceFilter: Locator;
  readonly zoomInButton: Locator;
  readonly zoomOutButton: Locator;
  readonly nodePanel: Locator;

  constructor(page: Page) {
    super(page);
    this.graphCanvas = page.getByRole('region', { name: /graph|canvas/i });
    this.layoutPicker = page.getByRole('button', { name: /layout/i });
    this.namespaceFilter = page.getByRole('button', { name: /namespace/i });
    this.zoomInButton = page.getByRole('button', { name: /zoom in/i });
    this.zoomOutButton = page.getByRole('button', { name: /zoom out/i });
    this.nodePanel = page.getByRole('complementary', { name: /node|detail/i });
  }

  get path(): string {
    return '/ontology/graph';
  }

  graphNode(name: string | RegExp): Locator {
    return this.page.locator(`[data-testid^="graph-node"]`).filter({ hasText: name });
  }
}
