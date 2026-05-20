// B06 §AC#5 wire client for pipeline-build-service's
// /api/v1/datasets/{rid}/health/events surface. The DatasetHealthSummary
// shape matches the Go DatasetHealthSummary struct verbatim.

import { api } from './client';

export type HealthSeverity = 'info' | 'warning' | 'error' | 'critical';
export type HealthStatus = 'passing' | 'degraded';

export interface DatasetHealthEvent {
  id: number;
  dataset_rid: string;
  snapshot_id?: number;
  check_name: string;
  severity: HealthSeverity;
  status: HealthStatus;
  metric_name?: string;
  metric_value?: number;
  threshold?: number;
  message?: string;
  details?: Record<string, unknown>;
  evaluated_at: string;
}

export interface DatasetHealthEventsSummary {
  dataset_rid: string;
  overall: HealthStatus;
  latest_per_check: DatasetHealthEvent[];
  recent_events: DatasetHealthEvent[];
}

export function getDatasetHealthEvents(datasetRid: string, limit = 50) {
  const qs = new URLSearchParams({ limit: String(limit) }).toString();
  return api.get<DatasetHealthEventsSummary>(`/datasets/${datasetRid}/health/events?${qs}`);
}
