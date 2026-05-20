import type { PipelineNode } from '@/lib/api/pipelines';

export interface NodeColor {
  slug: string;
  label: string;
  fill: string;
  text: string;
}

// Foundry-style palette: muted backgrounds with high-contrast text.
// Pinned slugs so colors survive label renames.
export const NODE_COLORS: NodeColor[] = [
  { slug: 'slate', label: 'Slate', fill: '#e2e8f0', text: '#1f2937' },
  { slug: 'blue', label: 'Blue', fill: '#dbeafe', text: '#1e40af' },
  { slug: 'green', label: 'Green', fill: '#dcfce7', text: '#15803d' },
  { slug: 'amber', label: 'Amber', fill: '#fef3c7', text: '#92400e' },
  { slug: 'pink', label: 'Pink', fill: '#fce7f3', text: '#9f1239' },
  { slug: 'purple', label: 'Purple', fill: '#ede9fe', text: '#6d28d9' },
  { slug: 'teal', label: 'Teal', fill: '#ccfbf1', text: '#0f766e' },
];

export function getNodeColorSlug(node: PipelineNode): string | null {
  const config = node.config as Record<string, unknown> | undefined;
  const raw = config?._color;
  if (typeof raw !== 'string') return null;
  return NODE_COLORS.some((c) => c.slug === raw) ? raw : null;
}

export function getNodeColor(node: PipelineNode): NodeColor | null {
  const slug = getNodeColorSlug(node);
  if (!slug) return null;
  return NODE_COLORS.find((c) => c.slug === slug) ?? null;
}

export function applyColorToNodes(
  nodes: PipelineNode[],
  targetIds: ReadonlySet<string>,
  slug: string | null,
): PipelineNode[] {
  if (targetIds.size === 0) return nodes;
  return nodes.map((node) => {
    if (!targetIds.has(node.id)) return node;
    const baseConfig = (node.config && typeof node.config === 'object' ? { ...(node.config as Record<string, unknown>) } : {}) as Record<string, unknown>;
    if (slug === null) {
      delete baseConfig._color;
    } else {
      baseConfig._color = slug;
    }
    return { ...node, config: baseConfig };
  });
}

export interface LegendEntry {
  color: NodeColor;
  count: number;
}

export function legendEntriesForNodes(nodes: PipelineNode[]): LegendEntry[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const slug = getNodeColorSlug(node);
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return NODE_COLORS
    .filter((color) => counts.has(color.slug))
    .map((color) => ({ color, count: counts.get(color.slug) ?? 0 }));
}
