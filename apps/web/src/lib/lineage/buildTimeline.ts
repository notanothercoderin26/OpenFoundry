// Foundry's "Build timeline" Gantt arranges build runs in horizontal rows
// (one per dataset) within a chosen time window, optionally colored by
// pipeline (≈ schedule) or by build state. We derive the same view from
// the `Build` rows returned by `listBuildsV1` plus a pipeline→dataset
// mapping derived from the lineage graph in memory.

import type { Build, BuildState } from '@/lib/api/buildsV1';

export type BuildTimelineColorBy = 'schedule' | 'status';

export type BuildTimelineRangeKey =
  | '1h'
  | '6h'
  | '12h'
  | '1d'
  | '3d'
  | '7d'
  | '10d';

export const RANGE_LABELS: Record<BuildTimelineRangeKey, string> = {
  '1h': '1 hour',
  '6h': '6 hours',
  '12h': '12 hours',
  '1d': '1 day',
  '3d': '3 days',
  '7d': '7 days',
  '10d': '10 days',
};

const RANGE_MS: Record<BuildTimelineRangeKey, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '10d': 10 * 24 * 60 * 60 * 1000,
};

export interface BuildTimelineBar {
  build: Build;
  startedAt: number;
  finishedAt: number;
  color: string;
  /** True when the build had no `started_at` (e.g. queued only) and we faked
   *  a 1-minute marker so the user can still see + click it. */
  imputedDuration: boolean;
  pipelineRid: string;
}

export interface BuildTimelineRow {
  datasetId: string;
  datasetLabel: string;
  bars: BuildTimelineBar[];
}

interface ComputeOptions {
  builds: Build[];
  pipelineDatasetMap: Map<string, string[]>;
  datasetLabelMap: Map<string, string>;
  /** Optional restriction to specific dataset IDs. Empty/undefined = all. */
  selectedDatasetIds?: string[];
  rangeKey: BuildTimelineRangeKey;
  colorBy: BuildTimelineColorBy;
  now?: Date;
}

export interface BuildTimelineResult {
  rows: BuildTimelineRow[];
  from: number;
  until: number;
  rangeKey: BuildTimelineRangeKey;
}

// State-to-color palette aligned with the existing Foundry-style coloring.
export const STATE_COLORS: Record<BuildState, string> = {
  BUILD_RESOLUTION: '#f6c344',
  BUILD_QUEUED: '#9aa3ad',
  BUILD_RUNNING: '#1f80de',
  BUILD_ABORTING: '#d97706',
  BUILD_FAILED: '#d9534f',
  BUILD_ABORTED: '#6e7480',
  BUILD_COMPLETED: '#48a865',
};

// Deterministic palette for pipeline-rid coloring ("Color by schedule").
const SCHEDULE_PALETTE = [
  '#1f80de',
  '#48a865',
  '#f5a623',
  '#a05cb5',
  '#d9534f',
  '#0099a8',
  '#c64488',
  '#7a7f86',
  '#3b6ea8',
  '#946d2c',
  '#5d8a3a',
  '#a55a3e',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function pipelineColor(pipelineRid: string): string {
  if (!pipelineRid) return SCHEDULE_PALETTE[0];
  return SCHEDULE_PALETTE[hashString(pipelineRid) % SCHEDULE_PALETTE.length];
}

export function buildColor(build: Build, colorBy: BuildTimelineColorBy): string {
  if (colorBy === 'status') return STATE_COLORS[build.state] ?? STATE_COLORS.BUILD_QUEUED;
  return pipelineColor(build.pipeline_rid);
}

function buildSpan(build: Build, fallbackEnd: number): { startedAt: number; finishedAt: number; imputed: boolean } {
  const start = build.started_at ? Date.parse(build.started_at) : null;
  const end = build.finished_at ? Date.parse(build.finished_at) : null;
  if (start && end) return { startedAt: start, finishedAt: end, imputed: false };
  if (start && !end) return { startedAt: start, finishedAt: fallbackEnd, imputed: false };
  if (!start && end) return { startedAt: end - 60_000, finishedAt: end, imputed: true };
  const queued = build.queued_at ? Date.parse(build.queued_at) : null;
  if (queued) return { startedAt: queued, finishedAt: queued + 60_000, imputed: true };
  const created = Date.parse(build.created_at);
  if (Number.isFinite(created)) return { startedAt: created, finishedAt: created + 60_000, imputed: true };
  return { startedAt: 0, finishedAt: 0, imputed: true };
}

export function computeBuildTimeline({
  builds,
  pipelineDatasetMap,
  datasetLabelMap,
  selectedDatasetIds,
  rangeKey,
  colorBy,
  now = new Date(),
}: ComputeOptions): BuildTimelineResult {
  const until = now.getTime();
  const from = until - RANGE_MS[rangeKey];
  const allowedDatasetIds = selectedDatasetIds && selectedDatasetIds.length > 0 ? new Set(selectedDatasetIds) : null;

  const rowsByDataset = new Map<string, BuildTimelineRow>();
  for (const build of builds) {
    const span = buildSpan(build, until);
    if (span.finishedAt < from || span.startedAt > until) continue;
    const datasetIds = pipelineDatasetMap.get(build.pipeline_rid) ?? [];
    if (datasetIds.length === 0) continue;
    const color = buildColor(build, colorBy);
    for (const datasetId of datasetIds) {
      if (allowedDatasetIds && !allowedDatasetIds.has(datasetId)) continue;
      let row = rowsByDataset.get(datasetId);
      if (!row) {
        row = {
          datasetId,
          datasetLabel: datasetLabelMap.get(datasetId) ?? datasetId,
          bars: [],
        };
        rowsByDataset.set(datasetId, row);
      }
      row.bars.push({
        build,
        startedAt: Math.max(span.startedAt, from),
        finishedAt: Math.min(span.finishedAt, until),
        color,
        imputedDuration: span.imputed,
        pipelineRid: build.pipeline_rid,
      });
    }
  }

  // Stable row order: by dataset label, but selected datasets first when an
  // explicit selection is provided (preserves the order the user clicked).
  const rows = [...rowsByDataset.values()].sort((a, b) => a.datasetLabel.localeCompare(b.datasetLabel));
  if (allowedDatasetIds) {
    const order = selectedDatasetIds!;
    rows.sort((a, b) => {
      const ai = order.indexOf(a.datasetId);
      const bi = order.indexOf(b.datasetId);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }
  for (const row of rows) {
    row.bars.sort((a, b) => a.startedAt - b.startedAt);
  }
  return { rows, from, until, rangeKey };
}

export function buildDuration(build: Build): string {
  if (!build.started_at) return '—';
  const start = Date.parse(build.started_at);
  const end = build.finished_at ? Date.parse(build.finished_at) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const ms = Math.max(0, end - start);
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
}
