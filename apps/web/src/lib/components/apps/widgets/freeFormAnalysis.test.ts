import { describe, expect, it } from 'vitest';

import type { ObjectInstance } from '@/lib/api/ontology';

import {
  applyFreeFormAnalysisFilters,
  buildFreeFormChartBuckets,
  buildFreeFormMetric,
  readFreeFormAnalysisProps,
  type FreeFormAnalysisCard,
} from './freeFormAnalysis';

const now = '2026-05-11T00:00:00Z';

function trail(id: string, properties: Record<string, unknown>): ObjectInstance {
  return {
    id,
    object_type_id: 'TrailEstimate',
    properties,
    created_by: 'test',
    created_at: now,
    updated_at: now,
  };
}

describe('Free-form Analysis helpers', () => {
  const rows = [
    trail('mesa-1', { trail_name: 'Mesa Trail', difficulty: 'Moderate', distance_miles: 6.07, est_pace: 9.2 }),
    trail('mesa-2', { trail_name: 'Mesa Trail', difficulty: 'Moderate', distance_miles: 6.07, est_pace: 9.8 }),
    trail('walker', { trail_name: 'Walker Ranch', difficulty: 'Hard', distance_miles: 7.76, est_pace: 11.3 }),
  ];

  it('normalizes widget props and bounded runtime options', () => {
    const props = readFreeFormAnalysisProps({
      source_variable_id: 'trail-estimates',
      output_variable_id: 'analysis-output',
      max_rows: 50000,
      enable_path_saving: true,
      cards: [{ id: 'table', kind: 'table', title: 'Rows', columns: ['trail_name'] }],
    });

    expect(props.sourceVariableId).toBe('trail-estimates');
    expect(props.outputVariableId).toBe('analysis-output');
    expect(props.maxRows).toBe(10000);
    expect(props.enablePathSaving).toBe(true);
    expect(props.cards).toHaveLength(1);
  });

  it('filters by search and runtime filter cards', () => {
    const cards: FreeFormAnalysisCard[] = [
      { id: 'difficulty-filter', kind: 'filter', title: 'Difficulty', property: 'difficulty', operator: 'equals', value: 'Moderate' },
    ];

    expect(applyFreeFormAnalysisFilters(rows, cards).map((row) => row.id)).toEqual(['mesa-1', 'mesa-2']);
    expect(applyFreeFormAnalysisFilters(rows, cards, 'mesa').map((row) => row.id)).toEqual(['mesa-1', 'mesa-2']);
    expect(applyFreeFormAnalysisFilters(rows, cards, 'walker')).toEqual([]);
  });

  it('builds metric and chart aggregations from the filtered object set', () => {
    const metric = buildFreeFormMetric(rows, {
      id: 'pace-metric',
      kind: 'metric',
      title: 'Average pace',
      metric: 'avg',
      property: 'est_pace',
    });
    const buckets = buildFreeFormChartBuckets(rows, {
      id: 'distance-chart',
      kind: 'bar_chart',
      title: 'Distance by trail',
      metric: 'avg',
      category_property: 'trail_name',
      value_property: 'distance_miles',
    });

    expect(metric.value).toBeCloseTo(10.1, 3);
    expect(buckets.map((bucket) => [bucket.category, bucket.value, bucket.objects.length])).toEqual([
      ['Walker Ranch', 7.76, 1],
      ['Mesa Trail', 6.07, 2],
    ]);
  });
});
