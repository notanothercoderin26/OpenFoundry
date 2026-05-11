import { describe, expect, it } from 'vitest';

import type { ObjectInstance } from '@/lib/api/ontology';

import { buildChartXyAggregation, chartXyEChartsOption, type ChartXyLayerLike } from './chartXY';

const now = '2026-05-11T00:00:00Z';

function estimate(id: string, properties: Record<string, unknown>): ObjectInstance {
  return {
    id,
    object_type_id: 'TrailEstimate',
    properties,
    created_by: 'test',
    created_at: now,
    updated_at: now,
  };
}

function layer(overrides: Partial<ChartXyLayerLike> = {}): ChartXyLayerLike {
  return {
    id: 'pace-layer',
    title: 'Pace',
    source_variable_id: 'trail-estimates',
    object_type_id: 'TrailEstimate',
    layer_type: 'bar',
    show_labels: true,
    x_property: 'trail_name',
    series_metric: 'avg',
    series_property: 'pace_min_per_mile',
    segment_by: 'difficulty',
    ...overrides,
  };
}

describe('Chart XY helpers', () => {
  it('aggregates object set rows by category, metric, and segment', () => {
    const aggregation = buildChartXyAggregation({
      'pace-layer': [
        estimate('mesa-1', { trail_name: 'Mesa Trail', difficulty: 'Easy', pace_min_per_mile: 10 }),
        estimate('mesa-2', { trail_name: 'Mesa Trail', difficulty: 'Easy', pace_min_per_mile: 8 }),
        estimate('walker-1', { trail_name: 'Walker Ranch', difficulty: 'Hard', pace_min_per_mile: 12 }),
      ],
    }, [layer()], { sortBy: 'key_asc' });

    expect(aggregation.categories).toEqual(['Mesa Trail', 'Walker Ranch']);
    expect(aggregation.series.map((entry) => entry.name)).toEqual(['Pace: Easy', 'Pace: Hard']);
    expect(aggregation.series[0].data).toEqual([9, 0]);
    expect(aggregation.series[1].data).toEqual([0, 12]);
    expect(aggregation.objectsByCategory['Mesa Trail'].map((object) => object.id)).toEqual(['mesa-1', 'mesa-2']);
  });

  it('supports count, approximate unique, limits, and value sorting', () => {
    const countLayer = layer({
      id: 'count-layer',
      title: 'Runs',
      series_metric: 'count',
      series_property: '',
      segment_by: '',
      x_limit: '1',
    });
    const uniqueLayer = layer({
      id: 'runner-layer',
      title: 'Runners',
      series_metric: 'approx_unique',
      series_property: 'runner_id',
      segment_by: '',
    });
    const rows = [
      estimate('mesa-1', { trail_name: 'Mesa Trail', runner_id: 'a' }),
      estimate('mesa-2', { trail_name: 'Mesa Trail', runner_id: 'a' }),
      estimate('mesa-3', { trail_name: 'Mesa Trail', runner_id: 'b' }),
      estimate('walker-1', { trail_name: 'Walker Ranch', runner_id: 'c' }),
    ];

    const aggregation = buildChartXyAggregation({
      'count-layer': rows,
      'runner-layer': rows,
    }, [countLayer, uniqueLayer], { sortBy: 'value_desc' });

    expect(aggregation.categories).toEqual(['Mesa Trail']);
    expect(aggregation.series.find((entry) => entry.name === 'Runs')?.data).toEqual([3]);
    expect(aggregation.series.find((entry) => entry.name === 'Runners')?.data).toEqual([2]);
  });

  it('builds ECharts options for bar, line, and scatter series', () => {
    const aggregation = buildChartXyAggregation({
      bar: [estimate('a', { trail_name: 'A' })],
      line: [estimate('b', { trail_name: 'B' })],
      scatter: [estimate('c', { trail_name: 'C' })],
    }, [
      layer({ id: 'bar', title: 'Bars', layer_type: 'bar', series_metric: 'count', series_property: '', segment_by: '' }),
      layer({ id: 'line', title: 'Line', layer_type: 'line', series_metric: 'count', series_property: '', segment_by: '' }),
      layer({ id: 'scatter', title: 'Scatter', layer_type: 'scatter', series_metric: 'count', series_property: '', segment_by: '' }),
    ]);

    const options = chartXyEChartsOption(aggregation, { showLegend: true, barOrientation: 'vertical' }) as {
      legend: { show: boolean };
      series: Array<{ type: string }>;
    };
    const horizontal = chartXyEChartsOption(aggregation, { barOrientation: 'horizontal' }) as {
      xAxis: { type: string };
      yAxis: { type: string };
    };

    expect(options.legend.show).toBe(true);
    expect(options.series.map((entry) => entry.type)).toEqual(['bar', 'line', 'scatter']);
    expect(horizontal.xAxis.type).toBe('value');
    expect(horizontal.yAxis.type).toBe('category');
  });
});
