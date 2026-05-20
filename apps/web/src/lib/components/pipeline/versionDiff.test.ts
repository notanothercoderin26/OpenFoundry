import { describe, expect, it } from 'vitest';

import type { PipelineNode } from '@/lib/api/pipelines';
import { diffPipelineVersions, diffSummary } from './versionDiff';

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

describe('diffPipelineVersions', () => {
  it('classifies an added node', () => {
    const diff = diffPipelineVersions([], [makeNode({ id: 'a' })]);
    expect(diff.added.map((n) => n.id)).toEqual(['a']);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });

  it('classifies a removed node', () => {
    const diff = diffPipelineVersions([makeNode({ id: 'a' })], []);
    expect(diff.removed.map((n) => n.id)).toEqual(['a']);
    expect(diff.added).toHaveLength(0);
  });

  it('classifies a label change as modified', () => {
    const before = [makeNode({ id: 'a', label: 'Source' })];
    const after = [makeNode({ id: 'a', label: 'Source dataset' })];
    const diff = diffPipelineVersions(before, after);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].changes).toEqual([
      { field: 'label', before: 'Source', after: 'Source dataset' },
    ]);
  });

  it('treats reordered depends_on as unchanged', () => {
    const before = [makeNode({ id: 'a', depends_on: ['x', 'y'] })];
    const after = [makeNode({ id: 'a', depends_on: ['y', 'x'] })];
    const diff = diffPipelineVersions(before, after);
    expect(diff.unchanged.map((n) => n.id)).toEqual(['a']);
  });

  it('detects config changes ignoring key order', () => {
    const before = [makeNode({ id: 'a', config: { x: 1, y: 2 } })];
    const sameOrderSwap = [makeNode({ id: 'a', config: { y: 2, x: 1 } })];
    const realChange = [makeNode({ id: 'a', config: { y: 3, x: 1 } })];
    expect(diffPipelineVersions(before, sameOrderSwap).modified).toHaveLength(0);
    expect(diffPipelineVersions(before, realChange).modified).toHaveLength(1);
  });

  it('mixes adds/removes/modifies in one diff', () => {
    const before = [
      makeNode({ id: 'a', label: 'A' }),
      makeNode({ id: 'b' }),
    ];
    const after = [
      makeNode({ id: 'a', label: 'A renamed' }),
      makeNode({ id: 'c' }),
    ];
    const diff = diffPipelineVersions(before, after);
    expect(diff.added.map((n) => n.id)).toEqual(['c']);
    expect(diff.removed.map((n) => n.id)).toEqual(['b']);
    expect(diff.modified.map((m) => m.after.id)).toEqual(['a']);
  });

  it('handles null DAGs as empty', () => {
    const diff = diffPipelineVersions(null, undefined);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });
});

describe('diffSummary', () => {
  it('says "No changes" when nothing differs', () => {
    expect(diffSummary({ added: [], removed: [], modified: [], unchanged: [] })).toMatchObject({ label: 'No changes' });
  });

  it('summarizes added / removed / modified counts', () => {
    const diff = {
      added: [makeNode({ id: 'a' }), makeNode({ id: 'b' })],
      removed: [makeNode({ id: 'c' })],
      modified: [{ before: makeNode({ id: 'd' }), after: makeNode({ id: 'd' }), changes: [] as never }],
      unchanged: [],
    };
    expect(diffSummary(diff).label).toBe('+2 added · −1 removed · ~1 modified');
  });
});
