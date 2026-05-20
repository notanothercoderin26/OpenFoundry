// Foundry's "Export graph to SVG" produces a static vector image of
// the lineage graph that's readable in any browser / editor. Cytoscape
// only ships PNG export natively, so we render an SVG from the live
// `cy` instance: iterate visible nodes + edges, emit `<rect>` /
// `<text>` / `<line>` primitives sized by each node's bounding box
// in graph (un-zoomed) coordinates.

import type { Core } from 'cytoscape';

const PADDING = 24;
const NODE_BORDER_DEFAULT = '#3b4250';
const TEXT_FILL = '#1f252d';
const FONT_FAMILY = 'Arial, "Helvetica Neue", Helvetica, "Segoe UI", system-ui, -apple-system, sans-serif';
const FONT_SIZE = 11;
const EDGE_COLOR = '#9aa3ad';
const ARROW_SIZE = 6;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Serialize a Cytoscape graph instance to an SVG document string.
 * The returned text starts with `<?xml ... ?>` so it can be saved
 * directly to a `.svg` file or piped to a Blob for download.
 */
export function cytoscapeToSvg(cy: Core, title = 'lineage graph'): string {
  const nodes = cy.nodes(':visible');
  const edges = cy.edges(':visible');

  if (nodes.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>';
  }

  // Compute the global bounding box from raw graph coordinates so the
  // export is independent of the current viewport zoom/pan.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const nodeBoxes = new Map<string, BoundingBox>();
  nodes.forEach((node) => {
    const bb = node.boundingBox() as BoundingBox;
    nodeBoxes.set(node.id(), bb);
    if (bb.x1 < minX) minX = bb.x1;
    if (bb.y1 < minY) minY = bb.y1;
    if (bb.x2 > maxX) maxX = bb.x2;
    if (bb.y2 > maxY) maxY = bb.y2;
  });

  const width = Math.max(1, maxX - minX + PADDING * 2);
  const height = Math.max(1, maxY - minY + PADDING * 2);
  const tx = -minX + PADDING;
  const ty = -minY + PADDING;

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(1)}" height="${height.toFixed(1)}" viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}" font-family='${escapeXml(FONT_FAMILY)}' font-size="${FONT_SIZE}">`,
  );
  parts.push(`<title>${escapeXml(title)}</title>`);

  // Marker for edge arrowheads. Cytoscape places the tip ON the
  // target's edge, so we mirror that with a `markerUnits="userSpaceOnUse"`
  // shape large enough to read at typical zoom levels.
  parts.push(
    `<defs><marker id="of-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="${ARROW_SIZE * 1.6}" markerHeight="${ARROW_SIZE * 1.6}" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${EDGE_COLOR}"/></marker></defs>`,
  );

  // Edges below nodes so the bars don't draw over node fills.
  edges.forEach((edge) => {
    const source = nodeBoxes.get(edge.source().id());
    const target = nodeBoxes.get(edge.target().id());
    if (!source || !target) return;
    const sx = (source.x1 + source.x2) / 2 + tx;
    const sy = (source.y1 + source.y2) / 2 + ty;
    const txCenter = (target.x1 + target.x2) / 2 + tx;
    const tyCenter = (target.y1 + target.y2) / 2 + ty;
    parts.push(
      `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${txCenter.toFixed(1)}" y2="${tyCenter.toFixed(1)}" stroke="${EDGE_COLOR}" stroke-width="1.5" marker-end="url(#of-arrow)"/>`,
    );
  });

  nodes.forEach((node) => {
    const bb = nodeBoxes.get(node.id());
    if (!bb) return;
    const x = bb.x1 + tx;
    const y = bb.y1 + ty;
    const w = bb.x2 - bb.x1;
    const h = bb.y2 - bb.y1;
    const fill = typeof node.data('color') === 'string' ? (node.data('color') as string) : '#cdd5dd';
    const borderColor = typeof node.data('borderColor') === 'string'
      ? (node.data('borderColor') as string)
      : NODE_BORDER_DEFAULT;
    const label = typeof node.data('displayLabel') === 'string'
      ? (node.data('displayLabel') as string)
      : node.id();
    parts.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="6" ry="6" fill="${fill}" stroke="${borderColor}" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + FONT_SIZE / 3).toFixed(1)}" text-anchor="middle" fill="${TEXT_FILL}" font-weight="600">${escapeXml(label)}</text>`,
    );
  });

  parts.push('</svg>');
  return parts.join('\n');
}

/**
 * Build a downloadable Blob URL for the SVG export. Caller is
 * responsible for revoking the URL after the download trigger.
 */
export function svgBlobUrl(svg: string): { url: string; revoke: () => void } {
  if (typeof window === 'undefined') {
    throw new Error('svgBlobUrl can only run in the browser');
  }
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  return {
    url,
    revoke: () => window.URL.revokeObjectURL(url),
  };
}

/**
 * One-shot helper that triggers a download of the SVG export for the
 * given Cytoscape instance.
 */
export function downloadCytoscapeSvg(cy: Core, filename: string, title?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const svg = cytoscapeToSvg(cy, title);
  const { url, revoke } = svgBlobUrl(svg);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.toLowerCase().endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  revoke();
}
