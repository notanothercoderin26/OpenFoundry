import { describe, expect, it } from 'vitest';

import type { PipelineNode } from '@/lib/api/pipelines';
import {
  NODE_COLORS,
  applyColorToNodes,
  getNodeColor,
  getNodeColorSlug,
  legendEntriesForNodes,
} from './nodeColor';

function makeNode(id: string, config: Record<string, unknown> = {}): PipelineNode {
  return {
    id,
    label: id,
    transform_type: 'sql',
    config,
    depends_on: [],
    input_dataset_ids: [],
    output_dataset_id: null,
  };
}

describe('nodeColor', () => {
  it('returns null when the node has no color', () => {
    expect(getNodeColorSlug(makeNode('a'))).toBeNull();
    expect(getNodeColor(makeNode('a'))).toBeNull();
  });

  it('returns the slug for a known color', () => {
    const slug = NODE_COLORS[1].slug;
    expect(getNodeColorSlug(makeNode('a', { _color: slug }))).toBe(slug);
    expect(getNodeColor(makeNode('a', { _color: slug }))?.slug).toBe(slug);
  });

  it('rejects unknown color slugs', () => {
    expect(getNodeColorSlug(makeNode('a', { _color: 'rainbow' }))).toBeNull();
  });

  it('applies a color to the targeted nodes only', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const out = applyColorToNodes(nodes, new Set(['a', 'c']), 'blue');
    expect(getNodeColorSlug(out[0])).toBe('blue');
    expect(getNodeColorSlug(out[1])).toBeNull();
    expect(getNodeColorSlug(out[2])).toBe('blue');
  });

  it('clears the color when slug is null', () => {
    const nodes = [makeNode('a', { _color: 'blue' })];
    const cleared = applyColorToNodes(nodes, new Set(['a']), null);
    expect(getNodeColorSlug(cleared[0])).toBeNull();
    expect((cleared[0].config as Record<string, unknown>)._color).toBeUndefined();
  });

  it('does not mutate the input nodes', () => {
    const nodes = [makeNode('a', { foo: 'bar' })];
    applyColorToNodes(nodes, new Set(['a']), 'green');
    expect((nodes[0].config as Record<string, unknown>)._color).toBeUndefined();
  });

  it('returns no legend entries when nothing is colored', () => {
    expect(legendEntriesForNodes([makeNode('a'), makeNode('b')])).toEqual([]);
  });

  it('counts colored nodes per color in palette order', () => {
    const nodes = [
      makeNode('a', { _color: 'green' }),
      makeNode('b', { _color: 'blue' }),
      makeNode('c', { _color: 'blue' }),
    ];
    const legend = legendEntriesForNodes(nodes);
    expect(legend.map((entry) => entry.color.slug)).toEqual(['blue', 'green']);
    expect(legend.find((entry) => entry.color.slug === 'blue')?.count).toBe(2);
  });
});
