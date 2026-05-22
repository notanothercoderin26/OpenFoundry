import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listDatasets } from '@/lib/api/datasets';
import { Glyph } from '@/lib/components/ui/Glyph';

/**
 * Foundry Explorer helper — quick read of the data catalog from inside
 * the IDE. Calls the existing /datasets API via TanStack Query, supports
 * inline filtering, and routes "Open in dataset view" to the canonical
 * dataset detail page.
 */
export function FoundryExplorerHelper() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['code-repos', 'helper-explorer', 'datasets'],
    queryFn: () => listDatasets({ per_page: 50 }).then((response) => response.data),
    staleTime: 60 * 1000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((dataset) =>
      [dataset.name, dataset.display_name, dataset.description, ...dataset.tags]
        .filter(Boolean)
        .some((value) => (value ?? '').toString().toLowerCase().includes(needle)),
    );
  }, [data, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-of-border bg-of-surface-raised">
        <Glyph name="database" size={14} tone="muted" />
        <span className="text-of-13 font-of-semibold">Foundry Explorer</span>
        <span className="text-of-12 text-of-text-soft">
          {isLoading ? 'loading…' : `${filtered.length} datasets`}
        </span>
      </div>

      <div className="px-3 py-2 border-b border-of-border bg-of-surface">
        <div className="relative">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search datasets…"
            className="w-full h-7 pl-7 pr-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12"
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-of-text-soft">
            <Glyph name="search" size={12} tone="currentColor" />
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">Loading datasets…</p>
        ) : error ? (
          <p className="px-3 py-6 text-of-12 text-of-danger text-center">
            {error instanceof Error ? error.message : 'Unable to load datasets.'}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">
            {filter ? 'No datasets match.' : 'No datasets in this stack yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-of-border">
            {filtered.map((dataset) => (
              <li key={dataset.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Glyph name="spreadsheet" size={13} tone="muted" />
                  <span className="text-of-13 text-of-text font-of-semibold truncate">
                    {dataset.display_name || dataset.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(`/datasets/${dataset.id}`)}
                    className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-of-sm text-of-12 text-of-accent hover:bg-of-accent-soft"
                  >
                    Open
                    <Glyph name="external-link" size={10} tone="currentColor" />
                  </button>
                </div>
                <p className="mt-0.5 text-of-12 text-of-text-soft truncate">
                  {dataset.description || `${dataset.format} · ${dataset.row_count.toLocaleString()} rows`}
                </p>
                {dataset.tags.length > 0 ? (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {dataset.tags.slice(0, 4).map((tag) => (
                      <li
                        key={tag}
                        className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-surface-muted text-of-12 text-of-text-muted"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
