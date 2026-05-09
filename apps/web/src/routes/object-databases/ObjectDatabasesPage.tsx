import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  getOntologyStorageInsights,
  type OntologyStorageIndexDefinition,
  type OntologyStorageInsights,
} from '@/lib/api/ontology';

type TableRoleFilter = 'all' | 'Schema' | 'Runtime' | 'Ingestion' | 'Governance';

interface LayerCard {
  title: string;
  toneStyle: CSSProperties;
  metric: string;
  detail: string;
  href: string;
  cta: string;
}

interface RuntimeMilestone {
  label: string;
  value: string;
  detail: string;
}

const ROLE_FILTERS: Array<{ id: TableRoleFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'Schema', label: 'Schema' },
  { id: 'Runtime', label: 'Runtime' },
  { id: 'Ingestion', label: 'Ingestion' },
  { id: 'Governance', label: 'Governance' },
];

const RELATED_SURFACES = [
  { label: 'Ontology hub', href: '/ontology', detail: 'Object types and explorer entry point.' },
  { label: 'Indexing', href: '/ontology-indexing', detail: 'Funnel sources, runs, and hydration health.' },
  { label: 'Object explorer', href: '/object-explorer', detail: 'Search the projected ontology documents.' },
  { label: 'Graph product', href: '/vertex', detail: 'Traverse link-backed graph relationships.' },
  { label: 'Ontology manager', href: '/ontology-manager', detail: 'Governance, projects, and bindings.' },
];

const ROLE_ORDER: Record<string, number> = {
  Schema: 0,
  Runtime: 1,
  Ingestion: 2,
  Governance: 3,
};

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatCount(value: number | null | undefined) {
  return numberFormatter.format(value ?? 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'No activity recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'No activity recorded' : dateFormatter.format(parsed);
}

function formatRefreshDate(value: Date | null) {
  return value ? dateFormatter.format(value) : 'Not refreshed yet';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function getRoleChipStyle(role: string): CSSProperties {
  if (role === 'Runtime') {
    return { background: 'var(--status-success-bg)', color: 'var(--status-success)' };
  }
  if (role === 'Ingestion') {
    return { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' };
  }
  if (role === 'Governance') {
    return { background: 'var(--status-info-bg)', color: 'var(--status-info)' };
  }
  return { background: 'var(--bg-chip)', color: 'var(--text-default)' };
}

function getBarWidth(count: number, total: number) {
  if (count <= 0 || total <= 0) return '0%';
  return `${Math.max(4, (count / total) * 100)}%`;
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      className="of-panel-muted"
      style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}
    >
      <strong style={{ display: 'block', color: 'var(--text-strong)' }}>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function MetricBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{label}</span>
        <span className="of-text-muted">{formatCount(count)}</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            background: color,
            width: getBarWidth(count, total),
          }}
        />
      </div>
    </div>
  );
}

function IndexDefinitionCard({ indexDef }: { indexDef: OntologyStorageIndexDefinition }) {
  return (
    <article className="of-panel-muted" style={{ padding: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontWeight: 600, color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>
          {indexDef.index_name}
        </p>
        <span className="of-chip" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {indexDef.table_name}
        </span>
      </div>
      <pre
        style={{
          marginTop: 10,
          overflowX: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {indexDef.index_definition}
      </pre>
    </article>
  );
}

export function ObjectDatabasesPage() {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [insights, setInsights] = useState<OntologyStorageInsights | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [roleFilter, setRoleFilter] = useState<TableRoleFilter>('all');
  const [tableQuery, setTableQuery] = useState('');
  const [selectedTableKey, setSelectedTableKey] = useState('');
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setLoading(true);
    setPageError('');
    try {
      const data = await getOntologyStorageInsights();
      if (requestSeq.current !== seq) return;
      setInsights(data);
      setLastUpdatedAt(new Date());
      setSelectedTableKey((current) => {
        if (current && data.table_metrics.some((metric) => metric.key === current)) return current;
        return data.table_metrics[0]?.key ?? '';
      });
    } catch (error) {
      if (requestSeq.current !== seq) return;
      setPageError(getErrorMessage(error, 'Failed to load object database insights'));
    } finally {
      if (requestSeq.current === seq) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestSeq.current += 1;
    };
  }, [load]);

  const metricByKey = useMemo(() => {
    return new Map((insights?.table_metrics ?? []).map((metric) => [metric.key, metric]));
  }, [insights]);

  function getMetricCount(key: string) {
    return metricByKey.get(key)?.record_count ?? 0;
  }

  const objectRows = getMetricCount('object_instances');
  const linkRows = getMetricCount('link_instances');
  const searchDocuments = insights?.search_documents_total ?? 0;
  const funnelSources = getMetricCount('funnel_sources');
  const funnelRuns = getMetricCount('funnel_runs');
  const projectRows = getMetricCount('projects');

  const headlineCards = [
    {
      label: 'Object rows',
      value: formatCount(objectRows),
      detail: 'Canonical ontology instances in the runtime object store.',
    },
    {
      label: 'Link rows',
      value: formatCount(linkRows),
      detail: 'Relationship edges available for graph traversal and object views.',
    },
    {
      label: 'Search documents',
      value: formatCount(searchDocuments),
      detail: 'Projection documents generated for explorer and semantic search surfaces.',
    },
    {
      label: 'Funnel sources',
      value: formatCount(funnelSources),
      detail: 'Hydration definitions that map datasets into persisted ontology rows.',
    },
  ];

  const layerCards: LayerCard[] = [
    {
      title: 'Transactional object store',
      toneStyle: { background: 'var(--status-info-bg)', color: 'var(--status-info)' },
      metric: `${formatCount(objectRows)} rows`,
      detail: 'Objects land in the runtime object store while schema contracts stay in object types, properties, interfaces, and shared property bindings.',
      href: '/object-link-types',
      cta: 'Review schema',
    },
    {
      title: 'Graph relationship store',
      toneStyle: { background: 'var(--status-success-bg)', color: 'var(--status-success)' },
      metric: `${formatCount(linkRows)} edges`,
      detail: 'Links are first-class rows keyed by link types, giving OpenFoundry a concrete object graph substrate.',
      href: '/vertex',
      cta: 'Open graph product',
    },
    {
      title: 'Search projection layer',
      toneStyle: { background: 'var(--status-info-bg)', color: 'var(--status-info)' },
      metric: `${formatCount(searchDocuments)} docs`,
      detail: 'The ontology indexer materializes searchable documents from types, interfaces, links, actions, and accessible objects.',
      href: '/object-explorer',
      cta: 'Explore search',
    },
    {
      title: 'Ingestion and hydration runtime',
      toneStyle: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' },
      metric: `${formatCount(funnelRuns)} runs`,
      detail: 'Funnel sources and runs bridge datasets and pipelines into ontology rows with batch and streaming posture.',
      href: '/ontology-indexing',
      cta: 'Operate indexing',
    },
    {
      title: 'Governance and scoping',
      toneStyle: { background: 'var(--bg-chip)', color: 'var(--text-default)' },
      metric: `${formatCount(projectRows)} projects`,
      detail: 'Ontology projects, resource bindings, and manager surfaces segment and review persisted objects and schema resources.',
      href: '/ontology-manager',
      cta: 'Open manager',
    },
  ];

  const runtimeMilestones: RuntimeMilestone[] = [
    {
      label: 'Latest object write',
      value: formatDate(insights?.latest_object_write_at),
      detail: 'Most recent object update observed in the runtime object store.',
    },
    {
      label: 'Latest link write',
      value: formatDate(insights?.latest_link_write_at),
      detail: 'Most recent materialized relationship row.',
    },
    {
      label: 'Latest funnel run',
      value: formatDate(insights?.latest_funnel_run_at),
      detail: 'Most recent ingestion attempt across ontology funnel sources.',
    },
  ];

  const filteredTables = useMemo(() => {
    const query = normalizeText(tableQuery);
    return (insights?.table_metrics ?? [])
      .filter((metric) => roleFilter === 'all' || metric.role === roleFilter)
      .filter((metric) => {
        if (!query) return true;
        return [metric.label, metric.table_name, metric.role, metric.key]
          .some((value) => normalizeText(value).includes(query));
      })
      .sort((a, b) => {
        const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
        if (roleDiff !== 0) return roleDiff;
        return a.label.localeCompare(b.label);
      });
  }, [insights, roleFilter, tableQuery]);

  const selectedTable = useMemo(() => {
    if (filteredTables.length === 0) return null;
    return filteredTables.find((metric) => metric.key === selectedTableKey) ?? filteredTables[0];
  }, [filteredTables, selectedTableKey]);

  const selectedTableIndexes = useMemo(() => {
    if (!selectedTable) return [];
    return (insights?.index_definitions ?? [])
      .filter((indexDef) => indexDef.table_name === selectedTable.table_name)
      .sort((a, b) => a.index_name.localeCompare(b.index_name));
  }, [insights, selectedTable]);

  const searchKindTotal = Math.max(...(insights?.search_documents_by_kind ?? []).map((metric) => metric.count), 0);
  const objectDistributionTotal = Math.max(objectRows, ...((insights?.object_type_distribution ?? []).map((metric) => metric.count)), 0);
  const linkDistributionTotal = Math.max(linkRows, ...((insights?.link_type_distribution ?? []).map((metric) => metric.count)), 0);

  const initialLoading = loading && !insights;

  return (
    <section className="of-page" style={{ display: 'grid', gap: 12 }}>
      <div className="of-panel" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(min(100%, 320px), 0.42fr)', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Link to="/ontology" className="of-link" style={{ fontSize: 12 }}>
                Ontology
              </Link>
              <span className="of-text-muted">/</span>
              <span className="of-eyebrow">ONT-014</span>
            </div>
            <h1 className="of-heading-xl" style={{ marginTop: 8 }}>
              Object databases
            </h1>
            <p className="of-text-muted" style={{ marginTop: 8, maxWidth: 820, lineHeight: 1.65 }}>
              Inspect OSv2 storage topology across object rows, link edges, search projections, Funnel hydration,
              table inventory, and database access paths.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                className="of-button of-button--primary"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? 'Refreshing' : 'Refresh insights'}
              </button>
              <Link to="/ontology-indexing" className="of-button">
                Open indexing
              </Link>
              <span className="of-chip">Updated {formatRefreshDate(lastUpdatedAt)}</span>
            </div>
          </div>

          <aside
            className="of-panel-muted"
            style={{ padding: 14, background: 'var(--text-strong)', color: 'var(--text-inverse)', minWidth: 0 }}
          >
            <p className="of-eyebrow" style={{ color: 'rgba(255,255,255,0.68)' }}>
              Storage runtime
            </p>
            <div style={{ display: 'grid', gap: 10, marginTop: 12, fontSize: 13 }}>
              {[
                ['Primary backend', insights?.database_backend],
                ['Access driver', insights?.access_driver],
                ['Graph projection', insights?.graph_projection],
                ['Search projection', insights?.search_projection],
                ['Hydration runtime', insights?.funnel_runtime],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'rgba(255,255,255,0.68)' }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>
                    {value ?? 'Loading'}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {pageError && (
        <div
          className="of-status-danger"
          role="alert"
          style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
        >
          {pageError}
        </div>
      )}

      {initialLoading ? (
        <div
          className="of-panel"
          aria-live="polite"
          style={{ padding: 56, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}
        >
          Loading object database insights...
        </div>
      ) : insights ? (
        <>
          <section style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            {headlineCards.map((card) => (
              <article key={card.label} className="of-panel" style={{ padding: 16, minWidth: 0 }}>
                <p className="of-eyebrow">{card.label}</p>
                <p style={{ marginTop: 8, fontSize: 28, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {card.value}
                </p>
                <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
                  {card.detail}
                </p>
              </article>
            ))}
          </section>

          <section className="of-toolbar" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="of-tabbar" role="tablist" aria-label="Table role filters" style={{ borderBottom: 0 }}>
              {ROLE_FILTERS.map((role) => {
                const active = roleFilter === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={active ? 'of-tab of-tab-active' : 'of-tab'}
                    onClick={() => setRoleFilter(role.id)}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <input
              className="of-input"
              value={tableQuery}
              onChange={(event) => setTableQuery(event.target.value)}
              placeholder="Filter tables or indexes"
              aria-label="Filter object database tables"
              style={{ maxWidth: 280 }}
            />
            <span className="of-chip">{formatCount(filteredTables.length)} tables</span>
          </section>

          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 430px), 1fr))' }}>
            <article className="of-panel" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--border-default)' }}>
                <p className="of-eyebrow">Tables</p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  Persistent storage inventory
                </h2>
              </div>
              {filteredTables.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="of-table" style={{ minWidth: 620 }}>
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Role</th>
                        <th>Table</th>
                        <th style={{ textAlign: 'right' }}>Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTables.map((metric) => {
                        const active = selectedTable?.key === metric.key;
                        return (
                          <tr
                            key={metric.key}
                            aria-selected={active}
                            style={{ background: active ? 'var(--status-info-bg)' : undefined }}
                          >
                            <td>
                              <button
                                type="button"
                                onClick={() => setSelectedTableKey(metric.key)}
                                style={{
                                  padding: 0,
                                  border: 0,
                                  background: 'transparent',
                                  color: 'var(--text-link)',
                                  fontWeight: 600,
                                  textAlign: 'left',
                                }}
                              >
                                {metric.label}
                              </button>
                            </td>
                            <td>
                              <span className="of-chip" style={getRoleChipStyle(metric.role)}>
                                {metric.role}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                              {metric.table_name}
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {formatCount(metric.record_count)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: 16 }}>
                  <EmptyState
                    title="No tables match the current filter"
                    detail="Clear the search or switch role filters to see the storage inventory."
                  />
                </div>
              )}
            </article>

            <article className="of-panel" style={{ padding: 16, minWidth: 0 }}>
              <p className="of-eyebrow">Selected database surface</p>
              {selectedTable ? (
                <div style={{ display: 'grid', gap: 16, marginTop: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h2 className="of-heading-md">{selectedTable.label}</h2>
                      <span className="of-chip" style={getRoleChipStyle(selectedTable.role)}>
                        {selectedTable.role}
                      </span>
                    </div>
                    <p
                      style={{
                        marginTop: 8,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {selectedTable.table_name}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                    <div className="of-panel-muted" style={{ padding: 12 }}>
                      <p className="of-eyebrow">Rows</p>
                      <p style={{ marginTop: 6, fontSize: 22, fontWeight: 600, color: 'var(--text-strong)' }}>
                        {formatCount(selectedTable.record_count)}
                      </p>
                    </div>
                    <div className="of-panel-muted" style={{ padding: 12 }}>
                      <p className="of-eyebrow">Indexes</p>
                      <p style={{ marginTop: 6, fontSize: 22, fontWeight: 600, color: 'var(--text-strong)' }}>
                        {formatCount(selectedTableIndexes.length)}
                      </p>
                    </div>
                    <div className="of-panel-muted" style={{ padding: 12 }}>
                      <p className="of-eyebrow">Metric key</p>
                      <p
                        style={{
                          marginTop: 6,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--text-strong)',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {selectedTable.key}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="of-eyebrow">Related indexes</p>
                    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                      {selectedTableIndexes.length > 0 ? (
                        selectedTableIndexes.map((indexDef) => (
                          <div key={`${indexDef.table_name}-${indexDef.index_name}`} className="of-panel-muted" style={{ padding: 10 }}>
                            <p style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{indexDef.index_name}</p>
                            <p
                              className="of-text-muted"
                              style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11, overflowWrap: 'anywhere' }}
                            >
                              {indexDef.index_definition}
                            </p>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No index metadata for this table" />
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="of-eyebrow">Related surfaces</p>
                    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                      {RELATED_SURFACES.map((surface) => (
                        <Link
                          key={surface.href}
                          to={surface.href}
                          className="of-panel-muted"
                          style={{ display: 'block', padding: 10, color: 'inherit' }}
                        >
                          <strong style={{ color: 'var(--text-link)' }}>{surface.label}</strong>
                          <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                            {surface.detail}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState title="Select a table" detail="The detail panel will show row counts, indexes, and related surfaces." />
              )}
            </article>
          </section>

          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
            <article className="of-panel" style={{ padding: 16, minWidth: 0 }}>
              <p className="of-eyebrow">Activity</p>
              <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                Runtime milestones
              </h2>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {runtimeMilestones.map((milestone) => (
                  <div key={milestone.label} className="of-panel-muted" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{milestone.label}</p>
                      <p className="of-text-muted" style={{ fontSize: 13 }}>
                        {milestone.value}
                      </p>
                    </div>
                    <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
                      {milestone.detail}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="of-panel" style={{ padding: 16, minWidth: 0 }}>
              <p className="of-eyebrow">Search projection</p>
              <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                Documents by kind
              </h2>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {insights.search_documents_by_kind.length > 0 ? (
                  insights.search_documents_by_kind.map((metric) => (
                    <MetricBar
                      key={metric.kind}
                      label={metric.kind.replaceAll('_', ' ')}
                      count={metric.count}
                      total={searchKindTotal}
                      color="var(--text-strong)"
                    />
                  ))
                ) : (
                  <EmptyState title="No search projection documents" />
                )}
              </div>
            </article>
          </section>

          <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
            <article className="of-panel" style={{ padding: 16, minWidth: 0 }}>
              <p className="of-eyebrow">Distribution</p>
              <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                Object rows by type
              </h2>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {insights.object_type_distribution.length > 0 ? (
                  insights.object_type_distribution.map((metric) => (
                    <MetricBar
                      key={metric.id}
                      label={metric.label}
                      count={metric.count}
                      total={objectDistributionTotal}
                      color="var(--status-info)"
                    />
                  ))
                ) : (
                  <EmptyState title="No object rows yet" detail="Object type distributions appear after runtime rows are hydrated." />
                )}
              </div>
            </article>

            <article className="of-panel" style={{ padding: 16, minWidth: 0 }}>
              <p className="of-eyebrow">Distribution</p>
              <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                Link rows by type
              </h2>
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {insights.link_type_distribution.length > 0 ? (
                  insights.link_type_distribution.map((metric) => (
                    <MetricBar
                      key={metric.id}
                      label={metric.label}
                      count={metric.count}
                      total={linkDistributionTotal}
                      color="var(--status-success)"
                    />
                  ))
                ) : (
                  <EmptyState title="No link rows yet" detail="Link distributions appear after relationship rows are materialized." />
                )}
              </div>
            </article>
          </section>

          <section className="of-panel" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow">Topology</p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  Storage layers mapped to product surfaces
                </h2>
              </div>
              <span className="of-chip">{formatCount(layerCards.length)} layers</span>
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', marginTop: 12 }}>
              {layerCards.map((layer) => (
                <article key={layer.title} className="of-panel-muted" style={{ padding: 14, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span
                    style={{
                      ...layer.toneStyle,
                      display: 'inline-block',
                      width: 'fit-content',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {layer.title}
                  </span>
                  <p style={{ marginTop: 12, fontSize: 22, fontWeight: 600, color: 'var(--text-strong)' }}>
                    {layer.metric}
                  </p>
                  <p className="of-text-muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55, flex: 1 }}>
                    {layer.detail}
                  </p>
                  <Link to={layer.href} className="of-link" style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>
                    {layer.cta}
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section className="of-panel" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow">Indexes</p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  Database access paths
                </h2>
              </div>
              <span className="of-chip">{formatCount(insights.index_definitions.length)} indexes</span>
            </div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', marginTop: 12 }}>
              {insights.index_definitions.length > 0 ? (
                insights.index_definitions.map((indexDef) => (
                  <IndexDefinitionCard key={`${indexDef.table_name}-${indexDef.index_name}`} indexDef={indexDef} />
                ))
              ) : (
                <EmptyState title="No database index metadata reported" />
              )}
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
