import { describe, expect, it } from 'vitest';

import type { DatasetSchema } from '@/lib/api/datasets';
import type { LineageNode } from '@/lib/api/pipelines';

import { columnsFromSchema, computeSelectionHistogram } from './selectionHistogram';

function node(
  id: string,
  overrides: Partial<LineageNode> = {},
  metadata: Record<string, unknown> = {},
): LineageNode {
  return {
    id,
    kind: overrides.kind ?? 'dataset',
    label: overrides.label ?? id,
    marking: overrides.marking ?? 'public',
    metadata,
  };
}

const NOW = new Date('2026-05-20T10:00:00Z');

describe('computeSelectionHistogram', () => {
  const nodes: LineageNode[] = [
    node('d1', { kind: 'dataset' }, {
      branch: 'master',
      created_by: 'alice',
      folder_path: '/projects/aviation',
      custom_group: 'Flight Control',
      created_at: '2024-01-15T10:00:00Z', // > 30 days
      last_built_at: '2026-05-19T10:00:00Z', // 1 day
    }),
    node('d2', { kind: 'dataset' }, {
      branch: 'master',
      created_by: 'bob',
      folder_path: '/projects/aviation',
      custom_group: 'Flight Control',
      created_at: '2026-05-15T10:00:00Z', // 5 days
      last_built_at: '2026-05-19T10:00:00Z', // 1 day
    }),
    node('d3', { kind: 'dataset' }, {
      branch: 'develop',
      created_by: 'alice',
      folder_path: '/projects/aviation/metrics',
      custom_group: 'Aviation Metrics',
      created_at: '2026-05-19T20:00:00Z', // less than 1 day
      last_built_at: '2026-05-10T10:00:00Z', // 10 days
    }),
    node('o1', { kind: 'object_type', label: 'Flight Alert' }, {}),
  ];

  it('groups by resource type', () => {
    const sections = computeSelectionHistogram({
      nodes,
      selectedNodeIds: ['d1', 'd2', 'd3', 'o1'],
      now: NOW,
    });
    const section = sections.find((s) => s.id === 'resource_type');
    expect(section?.rows.map((r) => `${r.value}:${r.count}`)).toEqual(['dataset:3', 'object_type:1']);
  });

  it('groups by branch and skips nodes with no branch metadata', () => {
    const sections = computeSelectionHistogram({
      nodes,
      selectedNodeIds: ['d1', 'd2', 'd3', 'o1'],
      now: NOW,
    });
    const section = sections.find((s) => s.id === 'branch');
    expect(section?.rows.map((r) => `${r.value}:${r.count}`)).toEqual(['master:2', 'develop:1']);
  });

  it('buckets time_created in Foundry-style ranges', () => {
    const sections = computeSelectionHistogram({
      nodes,
      selectedNodeIds: ['d1', 'd2', 'd3', 'o1'],
      now: NOW,
    });
    const section = sections.find((s) => s.id === 'time_created');
    const labels = section?.rows.map((r) => r.value);
    expect(labels).toContain('More than 30 days ago');
    expect(labels).toContain('Less than 7 days ago');
    expect(labels).toContain('Less than 1 day ago');
  });

  it('preserves node ids per row so the UI can highlight matches', () => {
    const sections = computeSelectionHistogram({
      nodes,
      selectedNodeIds: ['d1', 'd2', 'd3'],
      now: NOW,
    });
    const section = sections.find((s) => s.id === 'created_by');
    const aliceRow = section?.rows.find((r) => r.value === 'alice');
    expect(aliceRow?.nodeIds.sort()).toEqual(['d1', 'd3']);
  });

  it('emits empty rows when no metadata is available', () => {
    const stripped = nodes.map((n) => ({ ...n, metadata: {} }));
    const sections = computeSelectionHistogram({
      nodes: stripped,
      selectedNodeIds: ['d1', 'd2', 'd3'],
      now: NOW,
    });
    const branchSection = sections.find((s) => s.id === 'branch');
    expect(branchSection?.rows).toEqual([]);
  });

  it('aggregates frequent columns from provided schemas only', () => {
    const schema: DatasetSchema = {
      id: 's1',
      dataset_id: 'd1',
      fields: [
        { name: 'flight_id', type: 'INTEGER' },
        { name: 'origin', type: 'STRING' },
      ],
      created_at: '2026-01-01T00:00:00Z',
    };
    const schemaWithFlightId: DatasetSchema = {
      id: 's2',
      dataset_id: 'd2',
      fields: [
        { name: 'flight_id', type: 'INTEGER' },
        { name: 'dest', type: 'STRING' },
      ],
      created_at: '2026-01-01T00:00:00Z',
    };
    const sections = computeSelectionHistogram({
      nodes,
      selectedNodeIds: ['d1', 'd2', 'd3'],
      schemaByDatasetId: { d1: schema, d2: schemaWithFlightId },
      now: NOW,
    });
    const section = sections.find((s) => s.id === 'frequent_columns');
    expect(section?.rows.map((r) => `${r.value}:${r.count}`)).toEqual([
      'flight_id:2',
      'dest:1',
      'origin:1',
    ]);
  });
});

describe('columnsFromSchema', () => {
  it('returns column names from a fields array', () => {
    const schema: DatasetSchema = {
      id: 's', dataset_id: 'd', created_at: '', fields: [
        { name: 'a', type: 'STRING' },
        { name: 'b', type: 'INTEGER' },
      ],
    };
    expect(columnsFromSchema(schema)).toEqual(['a', 'b']);
  });

  it('returns column names from a record-shaped schema', () => {
    const schema: DatasetSchema = {
      id: 's', dataset_id: 'd', created_at: '', fields: { a: 'STRING', b: 'INTEGER' },
    };
    expect(columnsFromSchema(schema).sort()).toEqual(['a', 'b']);
  });

  it('returns empty when no schema is provided', () => {
    expect(columnsFromSchema(null)).toEqual([]);
    expect(columnsFromSchema(undefined)).toEqual([]);
  });
});
