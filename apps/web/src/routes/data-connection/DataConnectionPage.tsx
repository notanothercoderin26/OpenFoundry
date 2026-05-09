import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import {
  FALLBACK_CONNECTOR_CATALOG,
  capabilityLabel,
  dataConnection,
  type Source,
  type SourceStatus,
} from '@/lib/api/data-connection';
import {
  type VirtualTableProvider,
  type VirtualTableSourceLink,
  providerLabel,
} from '@/lib/api/virtual-tables';
import { AutoRegistrationCard } from '@/lib/components/data-connection/AutoRegistrationCard';
import { CreateAutoRegistrationModal } from '@/lib/components/data-connection/CreateAutoRegistrationModal';
import { RemoteCatalogBrowser } from '@/lib/components/data-connection/RemoteCatalogBrowser';

const STATUS_COLOR: Record<SourceStatus, string> = {
  healthy: '#10b981',
  degraded: '#f59e0b',
  error: '#ef4444',
  configuring: '#3b82f6',
  draft: '#94a3b8',
};

const SOURCE_STATUSES: SourceStatus[] = ['healthy', 'degraded', 'error', 'configuring', 'draft'];

function providerForConnector(type: string): VirtualTableProvider | null {
  switch (type) {
    case 's3':
      return 'AMAZON_S3';
    case 'gcs':
      return 'GCS';
    case 'onelake':
    case 'abfs':
      return 'AZURE_ABFS';
    case 'bigquery':
      return 'BIGQUERY';
    case 'databricks':
      return 'DATABRICKS';
    case 'snowflake':
      return 'SNOWFLAKE';
    case 'foundry_iceberg':
    case 'iceberg':
      return 'FOUNDRY_ICEBERG';
    default:
      return null;
  }
}

function emptyVirtualLink(sourceRid: string, provider: VirtualTableProvider): VirtualTableSourceLink {
  return {
    source_rid: sourceRid,
    provider,
    virtual_tables_enabled: true,
    code_imports_enabled: false,
    export_controls: {},
    auto_register_project_rid: null,
    auto_register_enabled: false,
    auto_register_interval_seconds: null,
    auto_register_tag_filters: [],
    iceberg_catalog_kind: null,
    iceberg_catalog_config: null,
    created_at: '',
    updated_at: '',
  };
}

export function DataConnectionPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<SourceStatus | 'all'>('all');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [autoRegistrationOpen, setAutoRegistrationOpen] = useState(false);
  const [autoRegistrationLinks, setAutoRegistrationLinks] = useState<Record<string, VirtualTableSourceLink>>({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await dataConnection.listSources({ page: 1, per_page: 100 });
      setSources(res.data);
      setSelectedSourceId((current) => {
        if (current && res.data.some((source) => source.id === current)) return current;
        return res.data[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete source?')) return;
    setBusyId(id);
    try {
      await dataConnection.deleteSource(id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  const filteredSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sources.filter((source) => {
      if (statusFilter !== 'all' && source.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        source.name,
        source.id,
        source.connector_type,
        source.worker,
        source.status,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [query, sources, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = new Map<SourceStatus, number>();
    for (const status of SOURCE_STATUSES) counts.set(status, 0);
    for (const source of sources) counts.set(source.status, (counts.get(source.status) ?? 0) + 1);
    return counts;
  }, [sources]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );
  const selectedCatalogEntry = selectedSource
    ? FALLBACK_CONNECTOR_CATALOG.find((entry) => entry.type === selectedSource.connector_type)
    : undefined;
  const selectedProvider = selectedSource ? providerForConnector(selectedSource.connector_type) : null;
  const selectedVirtualLink = selectedSource && selectedProvider
    ? autoRegistrationLinks[selectedSource.id] ?? emptyVirtualLink(selectedSource.id, selectedProvider)
    : null;

  function rememberAutoRegistrationLink(link: VirtualTableSourceLink) {
    setAutoRegistrationLinks((prev) => ({ ...prev, [link.source_rid]: link }));
  }

  function markAutoRegistrationDisabled() {
    if (!selectedSource || !selectedProvider) return;
    const current = autoRegistrationLinks[selectedSource.id] ?? emptyVirtualLink(selectedSource.id, selectedProvider);
    setAutoRegistrationLinks((prev) => ({
      ...prev,
      [selectedSource.id]: {
        ...current,
        auto_register_enabled: false,
        auto_register_project_rid: null,
        auto_register_interval_seconds: null,
      },
    }));
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="of-heading-xl">Data Connection</h1>
          <p className="of-text-muted" style={{ marginTop: 4 }}>
            Sources, batch syncs, egress policies, agents.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link to="/data-connection/agents" className="of-button" style={{ fontSize: 12 }}>Agents</Link>
          <Link to="/data-connection/egress-policies" className="of-button" style={{ fontSize: 12 }}>Egress policies</Link>
          <Link to="/data-connection/new/streaming" className="of-button" style={{ fontSize: 12 }}>+ Streaming source</Link>
          <Link to="/data-connection/new" className="of-button of-button--primary">+ New source</Link>
        </div>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="of-text-muted">Loading sources…</p>
      ) : (
        <>
          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search sources..."
                className="of-input"
                style={{ flex: '1 1 260px' }}
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as SourceStatus | 'all')}
                className="of-input"
                style={{ width: 190 }}
              >
                <option value="all">All statuses</option>
                {SOURCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status} ({statusCounts.get(status) ?? 0})
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void load()} className="of-button" style={{ fontSize: 12 }}>
                Refresh
              </button>
            </div>
          </section>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
            <section className="of-panel" style={{ padding: 16, minWidth: 0 }}>
              <p className="of-eyebrow">Sources ({filteredSources.length} of {sources.length})</p>
              <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
                {filteredSources.map((source) => {
                  const active = source.id === selectedSourceId;
                  return (
                    <li
                      key={source.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                        background: active ? 'var(--bg-subtle)' : undefined,
                      }}
                    >
                      <Link to={`/data-connection/sources/${encodeURIComponent(source.id)}`} style={sourceRowLinkStyle}>
                        <strong style={{ color: 'var(--text-primary)' }}>{source.name}</strong>
                        <span className="of-text-muted" style={{ fontSize: 11, overflowWrap: 'anywhere' }}>
                          {source.connector_type} · worker: {source.worker} · last_sync: {source.last_sync_at ?? '—'}
                        </span>
                      </Link>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingRight: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 999, background: STATUS_COLOR[source.status], color: '#fff' }}>
                          {source.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedSourceId(source.id)}
                          className={active ? 'of-button of-button--primary' : 'of-button'}
                          style={{ fontSize: 11 }}
                          aria-pressed={active}
                        >
                          Browse
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(source.id)}
                          disabled={busyId === source.id}
                          className="of-button"
                          style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}
                        >
                          {busyId === source.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </li>
                  );
                })}
                {filteredSources.length === 0 && (
                  <li className="of-text-muted" style={{ padding: 12 }}>
                    No sources match the current filters.
                  </li>
                )}
              </ul>
            </section>

            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12, alignSelf: 'start', minWidth: 0 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <p className="of-eyebrow">Remote catalog</p>
                  <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{selectedSource?.name ?? 'No source selected'}</h2>
                  {selectedSource && (
                    <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                      {selectedCatalogEntry?.name ?? selectedSource.connector_type}
                      {selectedProvider ? ` · ${providerLabel(selectedProvider)}` : ''}
                    </p>
                  )}
                </div>
                {selectedSource && (
                  <Link to={`/data-connection/sources/${encodeURIComponent(selectedSource.id)}`} className="of-button" style={{ fontSize: 12 }}>
                    Open detail
                  </Link>
                )}
              </header>

              {selectedSource ? (
                selectedProvider && selectedVirtualLink ? (
                  <>
                    {selectedCatalogEntry && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {selectedCatalogEntry.capabilities.map((capability) => (
                          <span key={capability} style={capabilityChipStyle}>{capabilityLabel(capability)}</span>
                        ))}
                      </div>
                    )}
                    <RemoteCatalogBrowser sourceRid={selectedSource.id} />
                    <AutoRegistrationCard
                      sourceRid={selectedSource.id}
                      provider={selectedProvider}
                      link={selectedVirtualLink}
                      onOpenWizard={() => setAutoRegistrationOpen(true)}
                      onChanged={rememberAutoRegistrationLink}
                      onDisabled={markAutoRegistrationDisabled}
                    />
                    <CreateAutoRegistrationModal
                      open={autoRegistrationOpen}
                      sourceRid={selectedSource.id}
                      provider={selectedProvider}
                      onClose={() => setAutoRegistrationOpen(false)}
                      onEnabled={rememberAutoRegistrationLink}
                    />
                  </>
                ) : (
                  <div className="of-text-muted" style={{ fontSize: 13 }}>
                    Remote catalog browsing is available for virtual-table-capable sources.
                  </div>
                )
              ) : (
                <div className="of-text-muted" style={{ fontSize: 13 }}>
                  Create a source or select one from the list.
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}

const sourceRowLinkStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 0,
  padding: 12,
  textDecoration: 'none',
  flex: '1 1 260px',
};

const capabilityChipStyle: CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
  background: 'var(--bg-subtle)',
  borderRadius: 999,
};
