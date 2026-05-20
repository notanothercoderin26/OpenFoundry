// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import type { PipelineNode } from '@/lib/api/pipelines';
import { mergePastedNodes, readNodesFromClipboard, writeNodesToClipboard } from './canvasClipboard';

function makeNode(overrides: Partial<PipelineNode> & { id: string }): PipelineNode {
  return {
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    transform_type: overrides.transform_type ?? 'sql',
    config: overrides.config ?? {},
    depends_on: overrides.depends_on ?? [],
    input_dataset_ids: overrides.input_dataset_ids ?? [],
    output_dataset_id: overrides.output_dataset_id ?? null,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('canvas clipboard', () => {
  it('round-trips through localStorage', () => {
    const wrote = writeNodesToClipboard([makeNode({ id: 'a' })]);
    expect(wrote).toBe(true);
    expect(readNodesFromClipboard()).toHaveLength(1);
  });

  it('returns empty array when storage has nothing', () => {
    expect(readNodesFromClipboard()).toEqual([]);
  });

  it('ignores writes of an empty selection', () => {
    expect(writeNodesToClipboard([])).toBe(false);
    expect(readNodesFromClipboard()).toEqual([]);
  });

  it('strips output_dataset_id on copy', () => {
    writeNodesToClipboard([
      makeNode({ id: 'sink', output_dataset_id: 'dset-1' }),
    ]);
    const copied = readNodesFromClipboard();
    expect(copied[0].output_dataset_id).toBeNull();
  });

  it('survives an empty clipboard merge', () => {
    const existing = [makeNode({ id: 'a' })];
    const result = mergePastedNodes(existing, []);
    expect(result.nodes).toBe(existing);
    expect(result.inserted).toEqual([]);
  });

  it('remaps ids so pasted copies do not collide with existing ones', () => {
    const existing = [makeNode({ id: 'filter' })];
    const pasted = [makeNode({ id: 'filter' })];
    const result = mergePastedNodes(existing, pasted);
    expect(result.nodes.map((n) => n.id)).toEqual(['filter', 'filter_copy']);
  });

  it('preserves internal edges in the pasted subgraph', () => {
    const pasted = [
      makeNode({ id: 'src' }),
      makeNode({ id: 'transform', depends_on: ['src'] }),
    ];
    const result = mergePastedNodes([], pasted);
    expect(result.inserted[1].depends_on).toEqual([result.inserted[0].id]);
  });

  it('drops edges that reference nodes outside the clipboard', () => {
    const pasted = [
      makeNode({ id: 'transform', depends_on: ['external_source'] }),
    ];
    const result = mergePastedNodes([makeNode({ id: 'external_source' })], pasted);
    // The pasted transform should NOT auto-wire to the existing external_source.
    expect(result.inserted[0].depends_on).toEqual([]);
  });

  it('suffixes labels with (copy) once', () => {
    const labelA = mergePastedNodes([], [makeNode({ id: 'a', label: 'My filter' })]).inserted[0].label;
    expect(labelA).toBe('My filter (copy)');
    // Pasting a node that already has the suffix does not double it.
    const labelB = mergePastedNodes([], [makeNode({ id: 'b', label: 'My filter (copy)' })]).inserted[0].label;
    expect(labelB).toBe('My filter (copy)');
  });

  it('produces unique ids even when many copies of the same node are pasted', () => {
    const existing = [makeNode({ id: 'filter' })];
    let nodes = existing;
    for (let i = 0; i < 3; i += 1) {
      nodes = mergePastedNodes(nodes, [makeNode({ id: 'filter' })]).nodes;
    }
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('filter');
  });
});
