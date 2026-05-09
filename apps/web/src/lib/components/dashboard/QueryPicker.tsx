import { useEffect, useMemo, useState } from 'react';

import { executeQuery, listSavedQueries, type QueryResult, type SavedQuery } from '@/lib/api/queries';
import type { DashboardWidgetQuery, DashboardWidgetType } from '@/lib/utils/dashboards';

interface QueryTemplate {
  id: string;
  name: string;
  limit: number;
  sql: string;
}

interface QueryPickerProps {
  value: DashboardWidgetQuery;
  widgetType: DashboardWidgetType;
  onChange: (patch: Partial<DashboardWidgetQuery>) => void;
  onPreview?: (result: QueryResult | null) => void;
}

const QUERY_TEMPLATES: Record<DashboardWidgetType, QueryTemplate[]> = {
  chart: [
    {
      id: 'chart-throughput',
      name: 'Pipeline throughput',
      limit: 50,
      sql: [
        "SELECT 'Mon' AS bucket, 124 AS ingested, 108 AS published",
        "UNION ALL SELECT 'Tue', 152, 131",
        "UNION ALL SELECT 'Wed', 148, 140",
        "UNION ALL SELECT 'Thu', 166, 150",
        "UNION ALL SELECT 'Fri', 190, 172",
        "UNION ALL SELECT 'Sat', 142, 134",
        "UNION ALL SELECT 'Sun', 118, 109",
      ].join(' '),
    },
    {
      id: 'chart-status',
      name: 'Status mix',
      limit: 20,
      sql: [
        "SELECT 'Healthy' AS status, 68 AS count",
        "UNION ALL SELECT 'Watch', 21",
        "UNION ALL SELECT 'Blocked', 7",
        "UNION ALL SELECT 'Queued', 14",
      ].join(' '),
    },
  ],
  table: [
    {
      id: 'table-accounts',
      name: 'Account coverage',
      limit: 100,
      sql: [
        "SELECT 'Northwind' AS account, 'Enterprise' AS segment, 5820 AS arr, 'Healthy' AS status",
        "UNION ALL SELECT 'Lakehouse Co', 'Mid-market', 4380, 'Watch'",
        "UNION ALL SELECT 'Mercury Health', 'Enterprise', 9010, 'Healthy'",
        "UNION ALL SELECT 'Atlas Retail', 'SMB', 1920, 'Needs follow-up'",
        "UNION ALL SELECT 'Vertex Energy', 'Enterprise', 6640, 'Healthy'",
        "UNION ALL SELECT 'North Star', 'Mid-market', 3270, 'Expansion'",
      ].join(' '),
    },
    {
      id: 'table-queue',
      name: 'Escalations queue',
      limit: 100,
      sql: [
        "SELECT 'PIPE-1042' AS incident, 'High' AS priority, 'SLA breach risk' AS summary",
        "UNION ALL SELECT 'AUTH-288', 'Medium', 'SSO callback drift'",
        "UNION ALL SELECT 'DATA-931', 'Low', 'Late-arriving file partition'",
        "UNION ALL SELECT 'OPS-512', 'High', 'Backfill validation pending'",
      ].join(' '),
    },
  ],
  kpi: [
    {
      id: 'kpi-revenue',
      name: 'Revenue KPI',
      limit: 1,
      sql: "SELECT 18240 AS total_revenue, 12.8 AS delta_pct, '[14200,14880,15120,16050,16820,17640,18240]' AS sparkline",
    },
    {
      id: 'kpi-runs',
      name: 'Successful runs',
      limit: 1,
      sql: "SELECT 842 AS successful_runs, 4.2 AS delta_pct, '[790,802,815,821,829,836,842]' AS sparkline",
    },
  ],
  text: [],
};

function previewSql(sql: string) {
  const compact = sql.replace(/\s+/g, ' ').trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}

function toQueryLimit(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.round(value), 1), 1000);
}

export function QueryPicker({ value, widgetType, onChange, onPreview }: QueryPickerProps) {
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [savedSearch, setSavedSearch] = useState('');
  const [savedError, setSavedError] = useState('');
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<QueryResult | null>(null);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingSaved(true);
    setSavedError('');

    void listSavedQueries()
      .then((response) => {
        if (!cancelled) setSavedQueries(response.data);
      })
      .catch(() => {
        if (!cancelled) setSavedError('Saved queries unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSavedQueries = useMemo(() => {
    const query = savedSearch.trim().toLowerCase();
    if (!query) return savedQueries;
    return savedQueries.filter((saved) => `${saved.name} ${saved.description} ${saved.sql}`.toLowerCase().includes(query));
  }, [savedQueries, savedSearch]);

  function applyQuery(sql: string, limit: number) {
    setPreview(null);
    setPreviewError('');
    onPreview?.(null);
    onChange({ sql, limit: toQueryLimit(limit) });
  }

  async function testQuery() {
    setTesting(true);
    setPreview(null);
    setPreviewError('');

    try {
      const result = await executeQuery(value.sql, value.limit);
      setPreview(result);
      onPreview?.(result);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Query test failed.';
      setPreviewError(message);
      onPreview?.(null);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="widget-config-section">
      <div className="widget-config-section__header">
        <div>
          <h3>Query</h3>
          <span>POST /queries/execute</span>
        </div>
        <button type="button" className="of-btn" onClick={() => void testQuery()} disabled={testing || !value.sql.trim()}>
          {testing ? 'Testing...' : 'Test query'}
        </button>
      </div>

      <div className="widget-config-field">
        <span>SQL query</span>
        <textarea
          className="of-textarea widget-config-code"
          rows={10}
          value={value.sql}
          spellCheck={false}
          onChange={(event) => {
            setPreview(null);
            setPreviewError('');
            onPreview?.(null);
            onChange({ sql: event.target.value });
          }}
        />
      </div>

      <div className="widget-config-grid widget-config-grid--narrow">
        <label className="widget-config-field">
          <span>Query limit</span>
          <input
            type="number"
            className="of-input"
            min={1}
            max={1000}
            value={value.limit}
            onChange={(event) => onChange({ limit: toQueryLimit(Number(event.target.value)) })}
          />
        </label>
        <div className="widget-config-token-list" aria-label="Available placeholders">
          <code>{'{{search}}'}</code>
          <code>{'{{date_from}}'}</code>
          <code>{'{{date_to}}'}</code>
        </div>
      </div>

      {(preview || previewError) && (
        <div className={previewError ? 'widget-config-query-status widget-config-query-status--error' : 'widget-config-query-status'}>
          {previewError ? (
            previewError
          ) : preview ? (
            <>
              <span>{preview.total_rows} rows</span>
              <span>{preview.columns.length} columns</span>
              <span>{preview.execution_time_ms} ms</span>
            </>
          ) : null}
        </div>
      )}

      <div className="widget-config-section__header widget-config-section__header--compact">
        <div>
          <h3>Templates</h3>
          <span>{widgetType} starters</span>
        </div>
      </div>

      <div className="widget-config-query-list">
        {QUERY_TEMPLATES[widgetType].map((template) => (
          <button
            key={template.id}
            type="button"
            className="widget-config-query-card"
            onClick={() => applyQuery(template.sql, template.limit)}
            aria-selected={value.sql === template.sql}
          >
            <strong>{template.name}</strong>
            <span>{previewSql(template.sql)}</span>
          </button>
        ))}
      </div>

      <div className="widget-config-section__header widget-config-section__header--compact">
        <div>
          <h3>Saved queries</h3>
          <span>{loadingSaved ? 'Loading' : `${savedQueries.length} available`}</span>
        </div>
      </div>

      <input
        type="search"
        className="of-input"
        placeholder="Filter saved queries"
        value={savedSearch}
        onChange={(event) => setSavedSearch(event.target.value)}
      />

      {savedError && <div className="widget-config-query-status widget-config-query-status--error">{savedError}</div>}

      <div className="widget-config-query-list">
        {filteredSavedQueries.map((saved) => (
          <button
            key={saved.id}
            type="button"
            className="widget-config-query-card"
            onClick={() => applyQuery(saved.sql, value.limit)}
            aria-selected={value.sql === saved.sql}
          >
            <strong>{saved.name}</strong>
            <span>{previewSql(saved.sql)}</span>
          </button>
        ))}
        {!loadingSaved && !savedError && filteredSavedQueries.length === 0 && (
          <div className="widget-config-empty">No saved queries.</div>
        )}
      </div>
    </div>
  );
}
