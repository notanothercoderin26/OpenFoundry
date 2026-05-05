import api from './client';

// ────────────────────────────────────────────────────────────────
// Datasets API — slices grow as routes are migrated. Today: jobspec
// (used by /lineage) + dataset CRUD/preview/upload (used by /contour).
// ────────────────────────────────────────────────────────────────

export interface Dataset {
  id: string;
  name: string;
  description: string;
  format: string;
  storage_path: string;
  size_bytes: number;
  row_count: number;
  owner_id: string;
  tags: string[];
  current_version: number;
  active_branch: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetListResponse {
  data: Dataset[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface CreateDatasetParams {
  name: string;
  description?: string;
  format?: string;
  tags?: string[];
}

export interface DatasetPreviewResponse {
  dataset_id: string;
  version?: number;
  size_bytes?: number;
  format?: string;
  branch?: string | null;
  storage_path?: string;
  limit?: number;
  offset?: number;
  row_count?: number;
  rows?: Array<Record<string, unknown>>;
  columns?: Array<{
    name: string;
    field_type?: string;
    data_type?: string;
    nullable?: boolean;
  }>;
  total_rows?: number;
  warnings?: string[];
  errors?: string[];
  message?: string;
}

export function listDatasets(params?: {
  page?: number;
  per_page?: number;
  search?: string;
  tag?: string;
  owner_id?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.per_page) query.set('per_page', String(params.per_page));
  if (params?.search) query.set('search', params.search);
  if (params?.tag) query.set('tag', params.tag);
  if (params?.owner_id) query.set('owner_id', params.owner_id);
  const qs = query.toString();
  return api.get<DatasetListResponse>(`/datasets${qs ? `?${qs}` : ''}`);
}

export function previewDataset(
  datasetId: string,
  params?: { limit?: number; offset?: number; version?: number; branch?: string },
) {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  if (params?.version !== undefined) query.set('version', String(params.version));
  if (params?.branch) query.set('branch', params.branch);
  const qs = query.toString();
  return api.get<DatasetPreviewResponse>(
    `/datasets/${datasetId}/preview${qs ? `?${qs}` : ''}`,
  );
}

export function createDataset(params: CreateDatasetParams) {
  return api.post<Dataset>('/datasets', params);
}

export async function uploadData(datasetId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const headers: Record<string, string> = {};
  const authHeader = api.authorizationHeaders().Authorization;
  if (authHeader) headers.Authorization = authHeader;
  const response = await fetch(`/api/v1/datasets/${datasetId}/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!response.ok) throw new Error('Upload failed');
  return response.json();
}

// ────────────────────────────────────────────────────────────────
// Jobspec slice (used by /lineage)
// ────────────────────────────────────────────────────────────────

export interface DatasetJobSpecStatus {
  has_master_jobspec: boolean;
  branches_with_jobspec: string[];
}

export interface DatasetJobSpecRow {
  id: string;
  rid: string;
  pipeline_rid: string;
  branch_name: string;
  output_dataset_rid: string;
  output_branch: string;
  job_spec_json: unknown;
  inputs: unknown;
  content_hash: string;
}

export function listDatasetJobSpecs(
  datasetRid: string,
  params?: { on_branch?: string },
) {
  const query = new URLSearchParams();
  if (params?.on_branch) query.set('on_branch', params.on_branch);
  const qs = query.toString();
  return api.get<DatasetJobSpecRow[]>(
    `/datasets/${encodeURIComponent(datasetRid)}/job-specs${qs ? `?${qs}` : ''}`,
  );
}

/**
 * Roll-up "is there a JobSpec on master?" — used by /lineage to colour
 * datasets blue (has master spec) vs grey (no spec). Falls back to
 * `false` on transient errors so a network blip doesn't flip the whole
 * graph to grey.
 */
export async function loadJobSpecStatus(datasetRid: string): Promise<DatasetJobSpecStatus> {
  try {
    const rows = await listDatasetJobSpecs(datasetRid);
    const branches = Array.from(new Set(rows.map((r) => r.branch_name)));
    return {
      has_master_jobspec: branches.includes('master'),
      branches_with_jobspec: branches.sort(),
    };
  } catch {
    return { has_master_jobspec: false, branches_with_jobspec: [] };
  }
}
