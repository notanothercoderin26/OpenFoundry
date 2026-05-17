// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ContourPage, loadAllRows, MAX_PAGES, PAGE_SIZE } from './ContourPage';
import type { DatasetPreviewResponse } from '@/lib/api/datasets';

vi.mock('@/lib/api/datasets', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/datasets')>('@/lib/api/datasets');
  return {
    ...actual,
    listDatasets: vi.fn(),
    previewDataset: vi.fn(),
    createDataset: vi.fn(),
    uploadData: vi.fn(),
  };
});
vi.mock('@/lib/components/analytics/EChartView', () => ({
  EChartView: ({ emptyLabel }: { emptyLabel?: string }) => <div data-testid="chart">{emptyLabel}</div>,
}));
vi.mock('@stores/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { listDatasets, previewDataset } from '@/lib/api/datasets';

const listDatasetsMock = vi.mocked(listDatasets);
const previewDatasetMock = vi.mocked(previewDataset);

function previewPage(overrides: Partial<DatasetPreviewResponse> = {}): DatasetPreviewResponse {
  return {
    dataset_id: 'dataset-1',
    limit: PAGE_SIZE,
    offset: 0,
    rows: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i, group: `g${i % 3}`, value: i })),
    total_rows: PAGE_SIZE,
    ...overrides,
  };
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('loadAllRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops once total_rows is reached', async () => {
    const previewFn = vi.fn().mockImplementation(async (_id: string, params?: { offset?: number }) => {
      const offset = params?.offset ?? 0;
      return previewPage({
        offset,
        rows: Array.from({ length: 50 }, (_, i) => ({ id: offset + i })),
        total_rows: 50,
      });
    });

    const result = await loadAllRows('dataset-1', { previewFn, pageSize: 50, maxPages: 100 });

    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(50);
    expect(previewFn).toHaveBeenCalledTimes(1);
  });

  it('short-circuits when a page returns no rows even if total_rows lies', async () => {
    const previewFn = vi
      .fn()
      .mockResolvedValueOnce(previewPage({ rows: [{ id: 0 }], total_rows: 999_999 }))
      .mockResolvedValueOnce(previewPage({ rows: [], total_rows: 999_999 }));

    const result = await loadAllRows('dataset-1', { previewFn, pageSize: 1, maxPages: 100 });

    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(1);
    expect(previewFn).toHaveBeenCalledTimes(2);
  });

  it('caps at maxPages and flags truncation when the backend lies about total_rows', async () => {
    const previewFn = vi.fn().mockImplementation(async (_id: string, params?: { offset?: number; limit?: number }) => {
      const limit = params?.limit ?? PAGE_SIZE;
      const offset = params?.offset ?? 0;
      return previewPage({
        offset,
        limit,
        rows: Array.from({ length: limit }, (_, i) => ({ id: offset + i })),
        total_rows: 10_000_000,
      });
    });

    const result = await loadAllRows('dataset-1', { previewFn, pageSize: PAGE_SIZE, maxPages: MAX_PAGES });

    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(PAGE_SIZE * MAX_PAGES);
    expect(previewFn).toHaveBeenCalledTimes(MAX_PAGES);
  });
});

describe('<ContourPage /> integration', () => {
  beforeEach(() => {
    listDatasetsMock.mockReset();
    previewDatasetMock.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders the truncation warning when the backend keeps returning rows past the cap', async () => {
    listDatasetsMock.mockResolvedValue({
      data: [
        {
          id: 'dataset-1',
          rid: 'ri.foundry.main.dataset.dataset-1',
          name: 'lying_dataset',
          description: '',
          format: 'parquet',
          storage_path: 'bronze/lying',
          size_bytes: 0,
          row_count: 0,
          owner_id: 'owner',
          tags: [],
          current_version: 1,
          active_branch: 'main',
          health_status: 'healthy',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ],
      page: 1,
      per_page: 100,
      total: 1,
      total_pages: 1,
    });
    previewDatasetMock.mockImplementation(async (_id, params) => {
      const limit = params?.limit ?? PAGE_SIZE;
      const offset = params?.offset ?? 0;
      return previewPage({
        offset,
        limit,
        rows: Array.from({ length: limit }, (_, i) => ({ id: offset + i, group: 'g', value: i })),
        total_rows: 10_000_000,
      });
    });

    renderWithClient(<ContourPage />);

    const alert = await waitFor(
      () => {
        const node = screen.getByRole('alert');
        expect(node).toHaveTextContent(/Truncated at 10,000 rows/);
        return node;
      },
      { timeout: 5000 },
    );

    expect(alert).toBeInTheDocument();
    expect(previewDatasetMock).toHaveBeenCalledTimes(MAX_PAGES);
  });

  it('does not render the truncation warning when the backend reports an honest total', async () => {
    listDatasetsMock.mockResolvedValue({
      data: [
        {
          id: 'dataset-1',
          rid: 'ri.foundry.main.dataset.dataset-1',
          name: 'honest_dataset',
          description: '',
          format: 'parquet',
          storage_path: 'bronze/honest',
          size_bytes: 0,
          row_count: 0,
          owner_id: 'owner',
          tags: [],
          current_version: 1,
          active_branch: 'main',
          health_status: 'healthy',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ],
      page: 1,
      per_page: 100,
      total: 1,
      total_pages: 1,
    });
    previewDatasetMock.mockResolvedValue(
      previewPage({
        rows: [{ id: 0, group: 'g', value: 1 }],
        total_rows: 1,
      }),
    );

    renderWithClient(<ContourPage />);

    await waitFor(() => {
      expect(previewDatasetMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
