import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { VirtualTableDetailsPanel } from '@/lib/components/data-connection/VirtualTableDetailsPanel';
import {
  capabilityChips,
  providerLabel,
  tableTypeLabel,
  virtualTableBuildActionLabel,
  virtualTableComputeLocationLabel,
  virtualTableDefaultSelector,
  virtualTableExternalReference,
  virtualTableLineageKindLabel,
  virtualTableOwner,
  virtualTablePermissionsLabel,
  virtualTablePushdownLimitations,
  virtualTablePushdownPreview,
  virtualTableSaveLocation,
  virtualTables,
  type VirtualTable,
  type VirtualTableLineageResponse,
  type VirtualTableQueryResponse,
  type VirtualTableProvider,
} from '@/lib/api/virtual-tables';

type Tab = 'overview' | 'schema' | 'query' | 'lineage' | 'permissions' | 'activity' | 'update-detection' | 'imports';

const TABS: Array<{ id: Tab; label: string; deferred?: boolean }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'schema', label: 'Schema' },
  { id: 'query', label: 'Query' },
  { id: 'lineage', label: 'Lineage' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'activity', label: 'Activity', deferred: true },
  { id: 'update-detection', label: 'Update detection' },
  { id: 'imports', label: 'Imports', deferred: true },
];

export function VirtualTableDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const rid = decodeURIComponent(params.rid ?? '');

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [row, setRow] = useState<VirtualTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'refresh' | 'delete' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [queryLimit, setQueryLimit] = useState(50);
  const [queryRequiresFoundryCompute, setQueryRequiresFoundryCompute] = useState(false);
  const [queryBusy, setQueryBusy] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [queryResult, setQueryResult] = useState<VirtualTableQueryResponse | null>(null);
  const [lineage, setLineage] = useState<VirtualTableLineageResponse | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const table = await virtualTables.getVirtualTable(rid);
        if (!cancelled) {
          setRow(table);
          setLineage(null);
          setQueryResult(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load virtual table');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [rid]);

  useEffect(() => {
    if (activeTab !== 'lineage' || !row || lineage || lineageLoading) return;
    void loadLineage();
  }, [activeTab, row, lineage, lineageLoading]);

  function provider(): VirtualTableProvider | null {
    return (row?.properties?.provider as VirtualTableProvider | undefined) ?? null;
  }

  async function refreshSchema() {
    if (!row) return;
    setBusy('refresh');
    try {
      setRow(await virtualTables.refreshSchema(row.rid));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh schema');
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!row) return;
    setBusy('delete');
    try {
      await virtualTables.deleteVirtualTable(row.rid);
      navigate('/virtual-tables');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete virtual table');
    } finally {
      setBusy(null);
      setConfirmingDelete(false);
    }
  }

  async function runQueryPreview() {
    if (!row) return;
    setQueryBusy(true);
    setQueryError('');
    try {
      setQueryResult(
        await virtualTables.queryVirtualTable(row.rid, {
          selector: virtualTableDefaultSelector(row),
          limit: Math.max(1, Math.min(500, Number(queryLimit) || 50)),
          requires_foundry_compute: queryRequiresFoundryCompute,
        }),
      );
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Failed to query virtual table');
    } finally {
      setQueryBusy(false);
    }
  }

  async function loadLineage() {
    if (!row) return;
    setLineageLoading(true);
    setLineageError('');
    try {
      setLineage(await virtualTables.getLineage(row.rid));
    } catch (err) {
      setLineageError(err instanceof Error ? err.message : 'Failed to load lineage');
    } finally {
      setLineageLoading(false);
    }
  }

  return (
    <section className="of-page" data-testid="vt-detail-page" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {loading ? (
        <div className="of-panel" style={{ padding: 16, color: 'var(--text-muted)' }}>
          Loading…
        </div>
      ) : error ? (
        <div className="of-status-danger" role="alert" data-testid="vt-detail-error" style={{ padding: 16, borderRadius: 'var(--radius-md)' }}>
          {error}
        </div>
      ) : row ? (
        <>
          <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link to="/virtual-tables" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              ← All virtual tables
            </Link>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <h1 className="of-heading-xl" style={{ margin: 0 }}>
                {row.name}
              </h1>
              <span className="of-chip" style={{ background: '#1d4ed8', color: '#fff' }}>
                Virtual table
              </span>
              {provider() && <span className="of-chip">{providerLabel(provider()!)}</span>}
              <span className="of-chip">{tableTypeLabel(row.table_type)}</span>
              {capabilityChips(row.capabilities).map((chip) => (
                <span key={chip} className="of-chip" data-testid="vt-detail-cap-chip">
                  {chip}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void refreshSchema()}
                disabled={busy !== null}
                className="of-button"
                data-testid="vt-action-refresh-schema"
              >
                {busy === 'refresh' ? 'Refreshing…' : 'Refresh schema'}
              </button>
              <button type="button" disabled title="Activated in P5" className="of-button">
                Open in Pipeline Builder
              </button>
              <button type="button" disabled title="Activated in P6" className="of-button">
                Open in Contour
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmingDelete(true)}
                className="of-button"
                style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                data-testid="vt-action-delete"
              >
                Delete
              </button>
            </div>
          </header>

          <nav data-testid="vt-detail-tabs" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-default)' }}>
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  data-testid={`vt-tab-${tab.id}`}
                  style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${active ? '#1d4ed8' : 'transparent'}`,
                    color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {tab.label}
                  {tab.deferred && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>soon</span>}
                </button>
              );
            })}
          </nav>

          <div>
            {activeTab === 'overview' && (
              <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Source</h3>
                  <Link to={`/data-connection/sources/${encodeURIComponent(row.source_rid)}`} style={{ fontFamily: 'var(--font-mono)', marginTop: 6, display: 'inline-block' }} data-testid="vt-overview-source-link">
                    {row.source_rid}
                  </Link>
                </article>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Project</h3>
                  <span style={{ fontFamily: 'var(--font-mono)', marginTop: 6, display: 'inline-block' }} data-testid="vt-overview-project">
                    {row.project_rid}
                  </span>
                </article>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>External table</h3>
                  <span style={{ fontFamily: 'var(--font-mono)', marginTop: 6, display: 'inline-block' }}>
                    {virtualTableExternalReference(row)}
                  </span>
                </article>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Save location</h3>
                  <span style={{ fontFamily: 'var(--font-mono)', marginTop: 6, display: 'inline-block' }}>
                    {virtualTableSaveLocation(row)}
                  </span>
                </article>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Owner</h3>
                  <span style={{ marginTop: 6, display: 'inline-block' }}>
                    {virtualTableOwner(row) || '—'}
                  </span>
                </article>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Locator</h3>
                  <pre data-testid="vt-overview-locator" style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, overflow: 'auto' }}>
                    {JSON.stringify(row.locator, null, 2)}
                  </pre>
                </article>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Capabilities</h3>
                  <ul style={{ marginTop: 6, paddingLeft: 16, fontSize: 13 }}>
                    <li>Read: {row.capabilities.read ? 'yes' : 'no'}</li>
                    <li>Write: {row.capabilities.write ? 'yes' : 'no'}</li>
                    <li>Incremental: {row.capabilities.incremental ? 'yes' : 'no'}</li>
                    <li>Versioning: {row.capabilities.versioning ? 'yes' : 'no'}</li>
                    <li>Compute pushdown: {row.capabilities.compute_pushdown ?? '—'}</li>
                    <li>Foundry compute (Python single-node): {row.capabilities.foundry_compute.python_single_node ? 'yes' : 'no'}</li>
                    <li>Foundry compute (Python Spark): {row.capabilities.foundry_compute.python_spark ? 'yes' : 'no'}</li>
                    <li>Foundry compute (PB Spark): {row.capabilities.foundry_compute.pipeline_builder_spark ? 'yes' : 'no'}</li>
                  </ul>
                </article>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Update detection</h3>
                  <ul style={{ marginTop: 6, paddingLeft: 16, fontSize: 13 }}>
                    <li>Enabled: {row.update_detection_enabled ? 'yes' : 'no'}</li>
                    <li>Interval: {row.update_detection_interval_seconds ?? '—'}{row.update_detection_interval_seconds ? 's' : ''}</li>
                    <li>Last polled at: {row.last_polled_at ?? '—'}</li>
                    <li>Last observed version: {row.last_observed_version ?? '—'}</li>
                  </ul>
                </article>
              </section>
            )}

            {activeTab === 'query' && (
              <section style={{ display: 'grid', gap: 12 }}>
                <article className="of-panel" style={{ padding: 14, display: 'grid', gap: 12 }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 14 }}>Direct preview</h3>
                      <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        Reads <code>{virtualTableDefaultSelector(row)}</code> without creating an OpenFoundry dataset copy.
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        Limit
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={queryLimit}
                          onChange={(e) => setQueryLimit(Number(e.target.value))}
                          className="of-input"
                          style={{ width: 90 }}
                        />
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={queryRequiresFoundryCompute}
                          onChange={(e) => setQueryRequiresFoundryCompute(e.target.checked)}
                        />
                        Requires OpenFoundry step
                      </label>
                      <button type="button" onClick={() => void runQueryPreview()} disabled={queryBusy} className="of-button">
                        {queryBusy ? 'Querying…' : 'Run preview'}
                      </button>
                    </div>
                  </header>

                  {(() => {
                    const previewPlan = virtualTablePushdownPreview(row, { requires_foundry_compute: queryRequiresFoundryCompute });
                    const plan = queryResult?.pushdown ?? previewPlan;
                    const limitations = queryResult?.limitations ?? virtualTablePushdownLimitations(row, { requires_foundry_compute: queryRequiresFoundryCompute });
                    return (
                      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                        <section style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                          <h4 style={{ margin: 0, fontSize: 13 }}>Compute location</h4>
                          <span className="of-chip" style={{ marginTop: 8, display: 'inline-flex' }}>
                            {virtualTableComputeLocationLabel(plan.compute_location)}
                          </span>
                          <dl style={{ margin: '8px 0 0', display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 10px', fontSize: 12 }}>
                            <dt>Pushdown engine</dt>
                            <dd style={{ margin: 0 }}>{plan.pushdown_engine ?? '—'}</dd>
                            <dt>Copied dataset</dt>
                            <dd style={{ margin: 0 }}>{plan.uses_copied_dataset ? 'yes' : 'no'}</dd>
                            <dt>Pushed ops</dt>
                            <dd style={{ margin: 0 }}>{plan.pushed_operations.length ? plan.pushed_operations.join(', ') : '—'}</dd>
                            <dt>Foundry ops</dt>
                            <dd style={{ margin: 0 }}>{plan.foundry_operations.length ? plan.foundry_operations.join(', ') : '—'}</dd>
                          </dl>
                        </section>
                        <section style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                          <h4 style={{ margin: 0, fontSize: 13 }}>Limitations</h4>
                          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
                            {limitations.map((limitation) => (
                              <li key={limitation.code}>
                                <strong>{limitation.severity}</strong>: {limitation.message}
                              </li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    );
                  })()}

                  {queryError && (
                    <div className="of-status-danger" role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                      {queryError}
                    </div>
                  )}
                </article>

                {queryResult && (
                  <article className="of-panel" style={{ padding: 14 }}>
                    <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 14 }}>Rows</h3>
                      <span className="of-text-muted" style={{ fontSize: 12 }}>
                        {queryResult.row_count} rows · {queryResult.mode}
                      </span>
                    </header>
                    <div style={{ overflow: 'auto', marginTop: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead style={{ background: 'var(--bg-subtle)' }}>
                          <tr>
                            {queryResult.columns.map((column) => (
                              <th key={column} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-default)' }}>
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.map((resultRow, index) => (
                            <tr key={index}>
                              {queryResult.columns.map((column) => (
                                <td key={column} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-default)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                                  {String(resultRow[column] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                )}
              </section>
            )}

            {activeTab === 'schema' && (
              <section>
                {row.schema_inferred.length === 0 ? (
                  <p className="of-text-muted">
                    Schema inference returned no columns. Refresh the schema once the source registration completes, or
                    check <code>properties.warnings</code> for upstream messages.
                  </p>
                ) : (
                  <table data-testid="vt-schema-grid" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ background: 'var(--bg-subtle)' }}>
                      <tr>
                        {['Column', 'Inferred type', 'Source type', 'Nullable'].map((h) => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border-default)', fontWeight: 600 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {row.schema_inferred.map((col) => (
                        <tr key={col.name}>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', fontFamily: 'var(--font-mono)' }}>{col.name}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)' }}>{col.inferred_type}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{col.source_type}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)' }}>{col.nullable ? 'yes' : 'no'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}

            {activeTab === 'permissions' && (
              <section style={{ display: 'grid', gap: 12 }}>
                <article className="of-panel" style={{ padding: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Resolved permissions</h3>
                  <p style={{ margin: '6px 0 0' }}>{virtualTablePermissionsLabel(row)}</p>
                </article>
                <h3>Markings</h3>
                {row.markings.length === 0 ? (
                  <p className="of-text-muted">
                    No explicit markings. The virtual table inherits the source's markings as a clearance floor (see
                    ADR-NNNN). Update via <code>PATCH /v1/virtual-tables/{row.rid}/markings</code>.
                  </p>
                ) : (
                  <ul>
                    {row.markings.map((marking) => (
                      <li key={marking}>{marking}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {activeTab === 'lineage' && (
              <section style={{ display: 'grid', gap: 12 }} data-testid="vt-lineage-tab">
                <article className="of-panel" style={{ padding: 14, display: 'grid', gap: 12 }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 14 }}>Lineage</h3>
                      <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        Source lineage through virtual table dependencies, pipeline consumers, datasets, and object outputs.
                      </p>
                    </div>
                    <button type="button" onClick={() => void loadLineage()} disabled={lineageLoading} className="of-button">
                      {lineageLoading ? 'Refreshing…' : 'Refresh lineage'}
                    </button>
                  </header>

                  {lineageError && (
                    <div className="of-status-danger" role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                      {lineageError}
                    </div>
                  )}

                  {lineageLoading && !lineage ? (
                    <p className="of-text-muted" style={{ margin: 0 }}>
                      Loading lineage…
                    </p>
                  ) : lineage ? (
                    <>
                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                        {lineage.nodes.map((node) => (
                          <section key={node.rid} style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span className="of-chip">{virtualTableLineageKindLabel(node.kind)}</span>
                              <span className="of-text-muted" style={{ fontSize: 12 }}>
                                {node.status}
                              </span>
                            </div>
                            <h4 style={{ margin: '8px 0 4px', fontSize: 13 }}>{node.display_name}</h4>
                            <code style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{node.rid}</code>
                          </section>
                        ))}
                      </div>

                      <section style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                        <h4 style={{ margin: 0, fontSize: 13 }}>Edges</h4>
                        <div style={{ overflow: 'auto', marginTop: 8 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead style={{ background: 'var(--bg-subtle)' }}>
                              <tr>
                                {['From', 'To', 'Kind'].map((heading) => (
                                  <th key={heading} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-default)' }}>
                                    {heading}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {lineage.edges.map((edge) => {
                                const from = lineage.nodes.find((node) => node.rid === edge.from_rid);
                                const to = lineage.nodes.find((node) => node.rid === edge.to_rid);
                                return (
                                  <tr key={`${edge.from_rid}-${edge.to_rid}-${edge.kind}`}>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-default)' }}>
                                      {from?.display_name ?? edge.from_rid}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-default)' }}>
                                      {to?.display_name ?? edge.to_rid}
                                    </td>
                                    <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-default)' }}>{edge.kind}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0, fontSize: 13 }}>Downstream build decisions</h4>
                          <span className="of-text-muted" style={{ fontSize: 12 }}>
                            {lineage.update_detection_enabled ? 'Update detection enabled' : 'Update detection disabled'} · version{' '}
                            {lineage.last_observed_version ?? 'not observed'}
                          </span>
                        </header>
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                          {lineage.downstream_builds.map((build) => (
                            <li key={`${build.target_rid}-${build.action}`}>
                              <strong>{virtualTableBuildActionLabel(build.action)}</strong> {build.display_name}{' '}
                              <span className="of-text-muted">({build.target_kind})</span>: {build.reason}
                            </li>
                          ))}
                        </ul>
                      </section>
                    </>
                  ) : (
                    <p className="of-text-muted" style={{ margin: 0 }}>
                      Lineage has not been loaded yet.
                    </p>
                  )}
                </article>
              </section>
            )}
            {activeTab === 'activity' && (
              <p className="of-text-muted">
                Audit events for this virtual table are persisted in <code>virtual_table_audit</code> and emitted to{' '}
                <code>audit-compliance-service</code>. The viewer wires up in P3.next.
              </p>
            )}
            {activeTab === 'update-detection' && (
              <VirtualTableDetailsPanel table={row} onChanged={(next) => setRow(next)} />
            )}
            {activeTab === 'imports' && (
              <p className="of-text-muted">
                Imports list ships with P3.next once the <code>virtual_table_imports</code> endpoint is exposed.
              </p>
            )}
          </div>
        </>
      ) : null}

      {confirmingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div className="of-panel" style={{ padding: 24, maxWidth: 420 }}>
            <h3 className="of-heading-md">Delete virtual table</h3>
            <p style={{ marginTop: 8, fontSize: 13 }}>
              This removes the pointer in Foundry. The remote source table is not touched. Imports of this virtual
              table into other projects will be removed in cascade.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="of-button">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={busy === 'delete'}
                className="of-button"
                style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                data-testid="vt-confirm-delete"
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
