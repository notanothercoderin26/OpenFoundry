import { describe, expect, it } from 'vitest';

import type { Build } from '@/lib/api/buildsV1';

import {
  buildColor,
  buildDuration,
  computeBuildTimeline,
  pipelineColor,
} from './buildTimeline';

const NOW = new Date('2026-05-20T12:00:00Z');

function build(overrides: Partial<Build>): Build {
  return {
    id: overrides.id ?? 'b1',
    rid: overrides.rid ?? 'ri.build.b1',
    pipeline_rid: overrides.pipeline_rid ?? 'ri.pipeline.p1',
    build_branch: overrides.build_branch ?? 'master',
    job_spec_fallback: [],
    state: overrides.state ?? 'BUILD_COMPLETED',
    trigger_kind: overrides.trigger_kind ?? 'SCHEDULED',
    force_build: false,
    abort_policy: 'DEPENDENT_ONLY',
    queued_at: overrides.queued_at ?? null,
    started_at: overrides.started_at ?? null,
    finished_at: overrides.finished_at ?? null,
    error_message: null,
    requested_by: 'alice',
    created_at: overrides.created_at ?? '2026-05-20T10:00:00Z',
  };
}

const pipelineDatasetMap = new Map([
  ['ri.pipeline.p1', ['d1', 'd2']],
  ['ri.pipeline.p2', ['d3']],
]);
const datasetLabelMap = new Map([
  ['d1', 'passengers_clean'],
  ['d2', 'passenger_flights'],
  ['d3', 'flight_alerts_clean'],
]);

describe('computeBuildTimeline', () => {
  const builds: Build[] = [
    build({
      id: 'b1',
      pipeline_rid: 'ri.pipeline.p1',
      state: 'BUILD_COMPLETED',
      started_at: '2026-05-20T11:00:00Z',
      finished_at: '2026-05-20T11:02:22Z',
    }),
    build({
      id: 'b2',
      pipeline_rid: 'ri.pipeline.p2',
      state: 'BUILD_FAILED',
      started_at: '2026-05-20T11:30:00Z',
      finished_at: '2026-05-20T11:30:45Z',
    }),
    build({
      id: 'b3',
      pipeline_rid: 'ri.pipeline.p1',
      state: 'BUILD_RUNNING',
      started_at: '2026-05-13T08:00:00Z',
      finished_at: null,
    }),
    // Out of range — too old.
    build({
      id: 'b4',
      pipeline_rid: 'ri.pipeline.p1',
      state: 'BUILD_COMPLETED',
      started_at: '2026-04-01T00:00:00Z',
      finished_at: '2026-04-01T00:05:00Z',
    }),
  ];

  it('groups bars under one row per dataset that a pipeline produces', () => {
    const result = computeBuildTimeline({
      builds,
      pipelineDatasetMap,
      datasetLabelMap,
      rangeKey: '1d',
      colorBy: 'status',
      now: NOW,
    });
    const datasetIds = result.rows.map((r) => r.datasetId).sort();
    expect(datasetIds).toEqual(['d1', 'd2', 'd3']);
    // d1 should see both b1 (within 1d window) and b3 (running build that
    // started before the window but hasn't finished — clipped to the window).
    const d1Bars = result.rows.find((r) => r.datasetId === 'd1')?.bars ?? [];
    expect(d1Bars.map((b) => b.build.id).sort()).toEqual(['b1', 'b3']);
  });

  it('honors the time range filter (drops builds outside the window)', () => {
    const result = computeBuildTimeline({
      builds,
      pipelineDatasetMap,
      datasetLabelMap,
      rangeKey: '1d',
      colorBy: 'status',
      now: NOW,
    });
    const flat = result.rows.flatMap((r) => r.bars.map((b) => b.build.id));
    expect(flat).not.toContain('b4');
  });

  it('returns running builds clipped to the until cursor', () => {
    const result = computeBuildTimeline({
      builds,
      pipelineDatasetMap,
      datasetLabelMap,
      rangeKey: '10d',
      colorBy: 'status',
      now: NOW,
    });
    const running = result.rows
      .flatMap((r) => r.bars)
      .find((b) => b.build.id === 'b3');
    expect(running?.finishedAt).toBe(NOW.getTime());
  });

  it('preserves selectedDatasetIds order in row order', () => {
    const result = computeBuildTimeline({
      builds,
      pipelineDatasetMap,
      datasetLabelMap,
      selectedDatasetIds: ['d3', 'd1'],
      rangeKey: '1d',
      colorBy: 'status',
      now: NOW,
    });
    expect(result.rows.map((r) => r.datasetId)).toEqual(['d3', 'd1']);
  });

  it('changes colors when colorBy switches between schedule and status', () => {
    const statusResult = computeBuildTimeline({
      builds,
      pipelineDatasetMap,
      datasetLabelMap,
      rangeKey: '1d',
      colorBy: 'status',
      now: NOW,
    });
    const scheduleResult = computeBuildTimeline({
      builds,
      pipelineDatasetMap,
      datasetLabelMap,
      rangeKey: '1d',
      colorBy: 'schedule',
      now: NOW,
    });
    const statusColor = statusResult.rows
      .flatMap((r) => r.bars)
      .find((b) => b.build.id === 'b2')?.color;
    const scheduleColor = scheduleResult.rows
      .flatMap((r) => r.bars)
      .find((b) => b.build.id === 'b2')?.color;
    expect(statusColor).toBe('#d9534f'); // BUILD_FAILED
    expect(scheduleColor).toBe(pipelineColor('ri.pipeline.p2'));
    expect(statusColor).not.toBe(scheduleColor);
  });

  it('produces deterministic colors for the same pipeline rid', () => {
    expect(pipelineColor('ri.pipeline.p1')).toBe(pipelineColor('ri.pipeline.p1'));
  });

  it('imputes a marker for builds without started_at', () => {
    const queued = build({
      id: 'bq',
      pipeline_rid: 'ri.pipeline.p1',
      state: 'BUILD_QUEUED',
      queued_at: '2026-05-20T11:55:00Z',
      started_at: null,
      finished_at: null,
    });
    const result = computeBuildTimeline({
      builds: [queued],
      pipelineDatasetMap,
      datasetLabelMap,
      rangeKey: '1h',
      colorBy: 'status',
      now: NOW,
    });
    const bars = result.rows.flatMap((r) => r.bars);
    expect(bars).toHaveLength(2); // d1 and d2 from pipeline p1
    expect(bars[0].imputedDuration).toBe(true);
  });
});

describe('buildColor', () => {
  it('maps state to a color when colorBy is status', () => {
    const b = build({ state: 'BUILD_COMPLETED' });
    expect(buildColor(b, 'status')).toBe('#48a865');
  });
  it('uses pipeline color when colorBy is schedule', () => {
    const b = build({ pipeline_rid: 'ri.pipeline.X', state: 'BUILD_FAILED' });
    expect(buildColor(b, 'schedule')).toBe(pipelineColor('ri.pipeline.X'));
  });
});

describe('buildDuration', () => {
  it('formats sub-minute spans in seconds', () => {
    const b = build({ started_at: '2026-05-20T11:00:00Z', finished_at: '2026-05-20T11:00:32Z' });
    expect(buildDuration(b)).toBe('32s');
  });
  it('formats minute spans as `Mm SSs`', () => {
    const b = build({ started_at: '2026-05-20T11:00:00Z', finished_at: '2026-05-20T11:02:22Z' });
    expect(buildDuration(b)).toBe('2m 22s');
  });
  it('returns dash when started_at is missing', () => {
    const b = build({ started_at: null });
    expect(buildDuration(b)).toBe('—');
  });
});
