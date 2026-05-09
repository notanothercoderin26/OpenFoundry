import { afterEach, describe, expect, it, vi } from 'vitest';

import { listDatasets, type Dataset } from './datasets';

const DATASETS: Dataset[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    rid: 'ri.foundry.main.dataset.11111111-1111-1111-1111-111111111111',
    name: 'sales_daily',
    description: 'Daily sales facts',
    format: 'parquet',
    storage_path: 'bronze/sales',
    size_bytes: 1024,
    row_count: 100,
    owner_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    tags: ['finance', 'daily'],
    current_version: 1,
    active_branch: 'main',
    health_status: 'healthy',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-02T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    rid: 'ri.foundry.main.dataset.22222222-2222-2222-2222-222222222222',
    name: 'inventory',
    description: 'Warehouse inventory',
    format: 'csv',
    storage_path: 'bronze/inventory',
    size_bytes: 2048,
    row_count: 50,
    owner_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    tags: ['ops'],
    current_version: 1,
    active_branch: 'main',
    health_status: 'warning',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-03T00:00:00Z',
  },
];

describe('datasets api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes the current items response into the paginated UI shape', async () => {
    mockFetch({ items: DATASETS });

    const result = await listDatasets({ page: 1, per_page: 1, search: 'sales', tag: 'finance' });

    expect(result).toMatchObject({
      page: 1,
      per_page: 1,
      total: 1,
      total_pages: 1,
    });
    expect(result.data.map((dataset) => dataset.name)).toEqual(['sales_daily']);
  });

  it('passes through the canonical paginated response', async () => {
    mockFetch({ data: DATASETS.slice(0, 1), page: 2, per_page: 1, total: 2, total_pages: 2 });

    const result = await listDatasets({ page: 2, per_page: 1 });

    expect(result.data).toHaveLength(1);
    expect(result.page).toBe(2);
    expect(result.total_pages).toBe(2);
  });
});

function mockFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })),
  );
}
