import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Tabs } from '@/lib/components/Tabs';
import { VirtualTablesTab } from '@/lib/components/data-connection/VirtualTablesTab';
import {
  capabilityLabel,
  dataConnection,
  FALLBACK_CONNECTOR_CATALOG,
  type BatchSyncDef,
  type BulkRegistrationItem,
  type ConnectionRegistration,
  type ConnectorCatalogEntry,
  type Credential,
  type CredentialKind,
  type DiscoveredSource,
  type MediaSetSyncDef,
  type NetworkEgressPolicy,
  type RegistrationMode,
  type Source,
  type SyncRun,
  type TestConnectionResult,
} from '@/lib/api/data-connection';
import type { VirtualTableProvider } from '@/lib/api/virtual-tables';

type Tab = 'overview' | 'registrations' | 'networking' | 'credentials' | 'capabilities' | 'runs' | 'media-syncs' | 'virtual-tables';

const MEDIA_SYNC_CONNECTORS = new Set(['s3', 'onelake', 'abfs']);

const CONNECTOR_PROVIDER: Record<string, VirtualTableProvider> = {
  abfs: 'AZURE_ABFS',
  adls: 'AZURE_ABFS',
  azure_blob: 'AZURE_ABFS',
  bigquery: 'BIGQUERY',
  databricks: 'DATABRICKS',
  foundry_iceberg: 'FOUNDRY_ICEBERG',
  gcs: 'GCS',
  google_cloud_storage: 'GCS',
  iceberg: 'FOUNDRY_ICEBERG',
  onelake: 'AZURE_ABFS',
  open_table_catalog: 'FOUNDRY_ICEBERG',
  s3: 'AMAZON_S3',
  snowflake: 'SNOWFLAKE',
};

function virtualTableProviderFor(connectorType: string): VirtualTableProvider | null {
  return CONNECTOR_PROVIDER[connectorType.toLowerCase()] ?? null;
}

function discoveredLabel(source: DiscoveredSource): string {
  return source.display_name || source.selector;
}

export function SourceDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // networking
  const [attached, setAttached] = useState<NetworkEgressPolicy[]>([]);
  const [available, setAvailable] = useState<NetworkEgressPolicy[]>([]);
  const [pickPolicyId, setPickPolicyId] = useState('');

  // credentials
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credKind, setCredKind] = useState<CredentialKind>('api_key');
  const [credValue, setCredValue] = useState('');

  // test
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  // registrations / discovery
  const [registrations, setRegistrations] = useState<ConnectionRegistration[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredSource[]>([]);
  const [selectedSelectors, setSelectedSelectors] = useState<Record<string, boolean>>({});
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('sync');
  const [autoSync, setAutoSync] = useState(false);
  const [updateDetection, setUpdateDetection] = useState(true);
  const [targetDatasetId, setTargetDatasetId] = useState('');
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [registrationErrors, setRegistrationErrors] = useState<Array<{ selector: string; error: string }>>([]);

  // syncs / runs
  const [syncs, setSyncs] = useState<BatchSyncDef[]>([]);
  const [runsBySync, setRunsBySync] = useState<Record<string, SyncRun[]>>({});
  const [newOutputDataset, setNewOutputDataset] = useState('');
  const [newFileGlob, setNewFileGlob] = useState('');
  const [newScheduleCron, setNewScheduleCron] = useState('');

  // media-syncs
  const [mediaSyncs, setMediaSyncs] = useState<MediaSetSyncDef[]>([]);

  const catalogEntry: ConnectorCatalogEntry | undefined = source
    ? FALLBACK_CONNECTOR_CATALOG.find((e) => e.type === source.connector_type)
    : undefined;
  const virtualTableProvider = source ? virtualTableProviderFor(source.connector_type) : null;
  const selectedDiscovered = discovered.filter((d) => selectedSelectors[d.selector]);

  async function loadOverview() {
    setLoading(true);
    setError('');
    try {
      setSource(await dataConnection.getSource(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load source');
    } finally {
      setLoading(false);
    }
  }

  async function loadNetworking() {
    try {
      const [att, all] = await Promise.all([
        dataConnection.listSourcePolicies(id),
        dataConnection.listEgressPolicies(),
      ]);
      setAttached(att);
      const attachedIds = new Set(att.map((p) => p.id));
      setAvailable(all.filter((p) => !attachedIds.has(p.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load networking');
    }
  }

  async function loadCredentials() {
    try {
      setCredentials(await dataConnection.listCredentials(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load credentials');
    }
  }

  async function loadRegistrations() {
    setRegistrationsLoading(true);
    try {
      setRegistrations(await dataConnection.listRegistrations(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load registrations');
    } finally {
      setRegistrationsLoading(false);
    }
  }

  async function loadSyncs() {
    try {
      const list = await dataConnection.listSyncs(id);
      setSyncs(list);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load syncs');
    }
  }

  async function loadRuns(syncId: string) {
    try {
      setRunsBySync((prev) => ({ ...prev, [syncId]: [] }));
      const runs = await dataConnection.listRuns(syncId);
      setRunsBySync((prev) => ({ ...prev, [syncId]: runs }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load runs');
    }
  }

  async function loadMediaSyncs() {
    try {
      setMediaSyncs(await dataConnection.listMediaSetSyncs(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load media syncs');
    }
  }

  useEffect(() => {
    if (id) void loadOverview();
  }, [id]);

  function selectTab(next: Tab) {
    setTab(next);
    if (next === 'networking') void loadNetworking();
    if (next === 'credentials') void loadCredentials();
    if (next === 'registrations') void loadRegistrations();
    if (next === 'runs') void loadSyncs();
    if (next === 'media-syncs') void loadMediaSyncs();
  }

  async function deleteSource() {
    if (typeof window !== 'undefined' && !window.confirm('Delete source?')) return;
    setBusy(true);
    try {
      await dataConnection.deleteSource(id);
      window.location.href = '/data-connection';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    try {
      setTestResult(await dataConnection.testConnection(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  async function discoverRegistrations() {
    setBusy(true);
    setError('');
    setRegistrationMessage('');
    setRegistrationErrors([]);
    try {
      const res = await dataConnection.discoverSources(id);
      const alreadyRegistered = new Set(registrations.map((r) => r.selector));
      const nextSelected: Record<string, boolean> = {};
      for (const item of res.sources) {
        nextSelected[item.selector] = !alreadyRegistered.has(item.selector);
      }
      setDiscovered(res.sources);
      setSelectedSelectors(nextSelected);
      setRegistrationMessage(`Discovered ${res.sources.length} registrable source${res.sources.length === 1 ? '' : 's'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Discover failed');
    } finally {
      setBusy(false);
    }
  }

  function setAllDiscovered(checked: boolean) {
    const next: Record<string, boolean> = {};
    for (const item of discovered) next[item.selector] = checked;
    setSelectedSelectors(next);
  }

  async function bulkRegisterSelected() {
    if (selectedDiscovered.length === 0) {
      setRegistrationErrors([{ selector: 'selection', error: 'Select at least one discovered source.' }]);
      return;
    }

    const target = targetDatasetId.trim();
    const registrationsBody: BulkRegistrationItem[] = selectedDiscovered.map((item) => ({
      selector: item.selector,
      display_name: discoveredLabel(item),
      source_kind: item.source_kind ?? undefined,
      registration_mode: registrationMode,
      auto_sync: autoSync,
      update_detection: updateDetection,
      target_dataset_id: target || undefined,
      metadata: item.metadata ?? undefined,
    }));

    setBusy(true);
    setRegistrationErrors([]);
    setRegistrationMessage('');
    try {
      const response = await dataConnection.bulkRegister(id, registrationsBody);
      const errors = response.errors ?? [];
      setRegistrationErrors(errors);
      setRegistrationMessage(`Registered ${response.created.length} source${response.created.length === 1 ? '' : 's'}${errors.length ? ` with ${errors.length} error${errors.length === 1 ? '' : 's'}` : ''}.`);
      await loadRegistrations();
      if (errors.length === 0) setBulkDialogOpen(false);
    } catch (cause) {
      setRegistrationErrors([{ selector: 'bulk register', error: cause instanceof Error ? cause.message : 'Register failed' }]);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRegistration(registrationId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete registration?')) return;
    setBusy(true);
    setRegistrationMessage('');
    try {
      await dataConnection.deleteRegistration(id, registrationId);
      await loadRegistrations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete registration failed');
    } finally {
      setBusy(false);
    }
  }

  async function attachPolicy() {
    if (!pickPolicyId) return;
    setBusy(true);
    try {
      await dataConnection.attachPolicy(id, pickPolicyId);
      setPickPolicyId('');
      await loadNetworking();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Attach failed');
    } finally {
      setBusy(false);
    }
  }

  async function detachPolicy(policyId: string) {
    setBusy(true);
    try {
      await dataConnection.detachPolicy(id, policyId);
      await loadNetworking();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Detach failed');
    } finally {
      setBusy(false);
    }
  }

  async function setCredential() {
    setBusy(true);
    try {
      await dataConnection.setCredential(id, { kind: credKind, value: credValue });
      setCredValue('');
      await loadCredentials();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Set credential failed');
    } finally {
      setBusy(false);
    }
  }

  async function createSync() {
    setBusy(true);
    try {
      await dataConnection.createSync({
        source_id: id,
        output_dataset_id: newOutputDataset,
        file_glob: newFileGlob || undefined,
        schedule_cron: newScheduleCron || undefined,
      });
      setNewOutputDataset('');
      setNewFileGlob('');
      setNewScheduleCron('');
      await loadSyncs();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create sync failed');
    } finally {
      setBusy(false);
    }
  }

  async function runSync(syncId: string) {
    setBusy(true);
    try {
      await dataConnection.runSync(syncId);
      await loadRuns(syncId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Run sync failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <p className="of-text-muted">Loading source…</p>
      </section>
    );
  }

  if (!source) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <Link to="/data-connection" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Sources</Link>
        <p className="of-status-danger" style={{ marginTop: 12 }}>{error || 'Source not found'}</p>
      </section>
    );
  }

  const tabs: Array<Tab | { id: Tab; label: string }> = [
    'overview',
    { id: 'registrations', label: 'Registrations' },
    'networking',
    'credentials',
    'capabilities',
    { id: 'runs', label: 'Syncs' },
  ];
  if (virtualTableProvider) tabs.push({ id: 'virtual-tables', label: 'Virtual tables' });
  if (MEDIA_SYNC_CONNECTORS.has(source.connector_type)) tabs.push({ id: 'media-syncs', label: 'Media syncs' });

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Link to="/data-connection" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Sources</Link>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="of-heading-xl">{source.name}</h1>
          <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
            {source.id} · {source.connector_type} · worker: {source.worker} · status: {source.status}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => void testConnection()} disabled={busy} className="of-button">Test connection</button>
          <button type="button" onClick={() => void deleteSource()} disabled={busy} className="of-button" style={{ color: '#b91c1c', borderColor: '#fecaca' }}>
            Delete
          </button>
        </div>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {testResult && (
        <div style={{ padding: 10, background: testResult.success ? '#d1fae5' : '#fee2e2', borderRadius: 8, fontSize: 12 }}>
          <strong>{testResult.success ? '✓' : '✗'}</strong> {testResult.message}
          {testResult.latency_ms !== null && ` · ${testResult.latency_ms}ms`}
        </div>
      )}

      <Tabs tabs={tabs} active={tab} onChange={selectTab} />

      {tab === 'overview' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <pre style={{ padding: 12, background: 'var(--bg-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 12, overflow: 'auto' }}>
            {JSON.stringify(source, null, 2)}
          </pre>
        </section>
      )}

      {tab === 'registrations' && (
        <>
          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p className="of-eyebrow">Discovery</p>
                <h2 className="of-section-title" style={{ marginTop: 4 }}>Registrable sources</h2>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => void discoverRegistrations()} disabled={busy} className="of-button">
                  Discover
                </button>
                <button type="button" onClick={() => setAllDiscovered(true)} disabled={busy || discovered.length === 0} className="of-button">
                  Select all
                </button>
                <button type="button" onClick={() => setAllDiscovered(false)} disabled={busy || discovered.length === 0} className="of-button">
                  Clear
                </button>
                <button type="button" onClick={() => setBulkDialogOpen(true)} disabled={busy || selectedDiscovered.length === 0} className="of-button of-button--primary">
                  Bulk register
                </button>
              </div>
            </header>

            {registrationMessage && (
              <div style={{ padding: '8px 10px', borderRadius: 6, background: '#ecfdf5', color: '#047857', fontSize: 12 }}>
                {registrationMessage}
              </div>
            )}

            {registrationErrors.length > 0 && (
              <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {registrationErrors.map((item) => (
                    <li key={`${item.selector}-${item.error}`}>
                      <code>{item.selector}</code>: {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {discovered.length === 0 ? (
              <div className="of-panel-muted" style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                No discovery results loaded.
              </div>
            ) : (
              <div style={{ overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Pick</th>
                      <th style={tableHeaderStyle}>Source</th>
                      <th style={tableHeaderStyle}>Kind</th>
                      <th style={tableHeaderStyle}>Mode</th>
                      <th style={tableHeaderStyle}>Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discovered.map((item) => (
                      <tr key={item.selector}>
                        <td style={tableCellStyle}>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedSelectors[item.selector])}
                            onChange={(event) => setSelectedSelectors((prev) => ({ ...prev, [item.selector]: event.target.checked }))}
                            aria-label={`Select ${discoveredLabel(item)}`}
                          />
                        </td>
                        <td style={tableCellStyle}>
                          <strong>{discoveredLabel(item)}</strong>
                          <div style={{ marginTop: 2, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{item.selector}</div>
                        </td>
                        <td style={tableCellStyle}>{item.source_kind ?? '-'}</td>
                        <td style={tableCellStyle}>
                          {item.supports_zero_copy ? <span className="of-chip">zero-copy</span> : null}
                          {item.supports_sync !== false ? <span className="of-chip" style={{ marginLeft: item.supports_zero_copy ? 4 : 0 }}>sync</span> : null}
                        </td>
                        <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {item.source_signature ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="of-panel" style={{ padding: 16 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <p className="of-eyebrow">Registered ({registrations.length})</p>
                <h2 className="of-section-title" style={{ marginTop: 4 }}>Current registrations</h2>
              </div>
              <button type="button" onClick={() => void loadRegistrations()} disabled={busy || registrationsLoading} className="of-button">
                Refresh
              </button>
            </header>
            {registrationsLoading ? (
              <p className="of-text-muted" style={{ marginTop: 12, fontSize: 13 }}>Loading registrations...</p>
            ) : registrations.length === 0 ? (
              <p className="of-text-muted" style={{ marginTop: 12, fontSize: 13 }}>No registrations yet.</p>
            ) : (
              <div style={{ marginTop: 12, overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Name</th>
                      <th style={tableHeaderStyle}>Selector</th>
                      <th style={tableHeaderStyle}>Mode</th>
                      <th style={tableHeaderStyle}>Target</th>
                      <th style={tableHeaderStyle}>Automation</th>
                      <th style={tableHeaderStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((registration) => (
                      <tr key={registration.id}>
                        <td style={tableCellStyle}>
                          <strong>{registration.display_name || registration.selector}</strong>
                          <div style={{ color: 'var(--text-muted)' }}>{registration.source_kind ?? '-'}</div>
                        </td>
                        <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)' }}>{registration.selector}</td>
                        <td style={tableCellStyle}>{registration.registration_mode ?? '-'}</td>
                        <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)' }}>{registration.target_dataset_id ?? '-'}</td>
                        <td style={tableCellStyle}>
                          {registration.auto_sync ? <span className="of-chip">auto sync</span> : null}
                          {registration.update_detection ? <span className="of-chip" style={{ marginLeft: registration.auto_sync ? 4 : 0 }}>updates</span> : null}
                          {!registration.auto_sync && !registration.update_detection ? '-' : null}
                        </td>
                        <td style={tableCellStyle}>
                          <button type="button" onClick={() => void deleteRegistration(registration.id)} disabled={busy} className="of-button" style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'networking' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Attached policies ({attached.length})</p>
          <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
            {attached.map((p) => (
              <li key={p.id} style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  <strong>{p.name}</strong> · <code>{p.address.kind}:{p.address.value}</code>
                </span>
                <button type="button" onClick={() => void detachPolicy(p.id)} disabled={busy} className="of-button" style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}>
                  Detach
                </button>
              </li>
            ))}
            {attached.length === 0 && <li className="of-text-muted">No attached policies.</li>}
          </ul>
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            <select value={pickPolicyId} onChange={(e) => setPickPolicyId(e.target.value)} className="of-input">
              <option value="">— pick policy —</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.kind}</option>
              ))}
            </select>
            <button type="button" onClick={() => void attachPolicy()} disabled={busy || !pickPolicyId} className="of-button of-button--primary">
              Attach
            </button>
          </div>
        </section>
      )}

      {tab === 'credentials' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Credentials ({credentials.length})</p>
          <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
            {credentials.map((c) => (
              <li key={c.id}>
                {c.kind} · fingerprint <code>{c.fingerprint}</code> · {new Date(c.created_at).toLocaleString()}
              </li>
            ))}
            {credentials.length === 0 && <li className="of-text-muted">No credentials stored.</li>}
          </ul>
          <div style={{ marginTop: 12, display: 'grid', gap: 6, maxWidth: 480 }}>
            <label style={{ fontSize: 13 }}>
              Kind
              <select value={credKind} onChange={(e) => setCredKind(e.target.value as CredentialKind)} className="of-input" style={{ marginTop: 4 }}>
                {(['password', 'api_key', 'oauth_token', 'aws_keys', 'service_account_json'] as CredentialKind[]).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              Value (write-only)
              <input type="password" value={credValue} onChange={(e) => setCredValue(e.target.value)} className="of-input" style={{ marginTop: 4 }} />
            </label>
            <button type="button" onClick={() => void setCredential()} disabled={busy || !credValue} className="of-button of-button--primary">
              Save credential
            </button>
          </div>
        </section>
      )}

      {tab === 'capabilities' && (
        <section className="of-panel" style={{ padding: 16 }}>
          {catalogEntry ? (
            <>
              <p className="of-eyebrow">{catalogEntry.name}</p>
              <p className="of-text-muted" style={{ fontSize: 12 }}>{catalogEntry.description}</p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {catalogEntry.capabilities.map((c) => (
                  <span key={c} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: 999 }}>{capabilityLabel(c)}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="of-text-muted">No catalog entry for connector type {source.connector_type}.</p>
          )}
        </section>
      )}

      {tab === 'virtual-tables' && virtualTableProvider && (
        <VirtualTablesTab sourceRid={source.id} provider={virtualTableProvider} />
      )}

      {tab === 'runs' && (
        <>
          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Create batch sync</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <input value={newOutputDataset} onChange={(e) => setNewOutputDataset(e.target.value)} placeholder="output dataset id" className="of-input" />
              <input value={newFileGlob} onChange={(e) => setNewFileGlob(e.target.value)} placeholder="file_glob (optional)" className="of-input" />
              <input value={newScheduleCron} onChange={(e) => setNewScheduleCron(e.target.value)} placeholder="cron (optional)" className="of-input" />
              <button type="button" onClick={() => void createSync()} disabled={busy || !newOutputDataset} className="of-button of-button--primary">
                Create sync
              </button>
            </div>
          </section>

          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Syncs ({syncs.length})</p>
            <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
              {syncs.map((s) => (
                <li key={s.id} style={{ padding: 10, borderBottom: '1px solid var(--border-subtle)' }}>
                  <strong>{s.id}</strong> → {s.output_dataset_id}
                  {s.file_glob && <> · glob: <code>{s.file_glob}</code></>}
                  {s.schedule_cron && <> · cron: <code>{s.schedule_cron}</code></>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button type="button" onClick={() => void runSync(s.id)} disabled={busy} className="of-button" style={{ fontSize: 11 }}>
                      Run sync
                    </button>
                    <button type="button" onClick={() => void loadRuns(s.id)} disabled={busy} className="of-button" style={{ fontSize: 11 }}>
                      Refresh runs
                    </button>
                  </div>
                  {runsBySync[s.id] && (
                    <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11 }}>
                      {runsBySync[s.id].map((r) => (
                        <li key={r.id}>
                          {r.status} · {new Date(r.started_at).toLocaleString()} · {r.bytes_written} bytes · {r.files_written} files
                          {r.error && ` · ${r.error}`}
                        </li>
                      ))}
                      {runsBySync[s.id].length === 0 && <li className="of-text-muted">No runs.</li>}
                    </ul>
                  )}
                </li>
              ))}
              {syncs.length === 0 && <li className="of-text-muted">No syncs yet.</li>}
            </ul>
          </section>
        </>
      )}

      {tab === 'media-syncs' && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Media set syncs ({mediaSyncs.length})</p>
          <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
            {mediaSyncs.map((m) => (
              <li key={m.id}>
                {m.id} · {m.kind} · target {m.target_media_set_rid} · subfolder <code>{m.subfolder || '/'}</code>
              </li>
            ))}
            {mediaSyncs.length === 0 && <li className="of-text-muted">No media syncs configured.</li>}
          </ul>
        </section>
      )}

      {bulkDialogOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="source-bulk-register-title" style={dialogBackdropStyle}>
          <section className="of-panel" style={dialogPanelStyle}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <p className="of-eyebrow">Bulk register</p>
                <h2 id="source-bulk-register-title" className="of-section-title" style={{ marginTop: 4 }}>
                  {selectedDiscovered.length} selected source{selectedDiscovered.length === 1 ? '' : 's'}
                </h2>
              </div>
              <button type="button" onClick={() => setBulkDialogOpen(false)} disabled={busy} className="of-button">
                Close
              </button>
            </header>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                Registration mode
                <select value={registrationMode} onChange={(event) => setRegistrationMode(event.target.value as RegistrationMode)} className="of-input">
                  <option value="sync">sync</option>
                  <option value="zero_copy">zero_copy</option>
                </select>
              </label>
              <label style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                Target dataset id
                <input value={targetDatasetId} onChange={(event) => setTargetDatasetId(event.target.value)} placeholder="optional UUID" className="of-input" />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={autoSync} onChange={(event) => setAutoSync(event.target.checked)} />
                Auto sync
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={updateDetection} onChange={(event) => setUpdateDetection(event.target.checked)} />
                Update detection
              </label>
            </div>

            <div style={{ overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8, maxHeight: 260 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={tableHeaderStyle}>Source</th>
                    <th style={tableHeaderStyle}>Selector</th>
                    <th style={tableHeaderStyle}>Kind</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDiscovered.map((item) => (
                    <tr key={item.selector}>
                      <td style={tableCellStyle}>{discoveredLabel(item)}</td>
                      <td style={{ ...tableCellStyle, fontFamily: 'var(--font-mono)' }}>{item.selector}</td>
                      <td style={tableCellStyle}>{item.source_kind ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {registrationErrors.length > 0 && (
              <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12 }}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {registrationErrors.map((item) => (
                    <li key={`${item.selector}-${item.error}`}>
                      <code>{item.selector}</code>: {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setBulkDialogOpen(false)} disabled={busy} className="of-button">
                Cancel
              </button>
              <button type="button" onClick={() => void bulkRegisterSelected()} disabled={busy || selectedDiscovered.length === 0} className="of-button of-button--primary">
                {busy ? 'Registering...' : 'Register selected'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

const tableHeaderStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'var(--bg-subtle)',
  color: 'var(--text-muted)',
  fontSize: 11,
  fontWeight: 600,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tableCellStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'top',
};

const dialogBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(15, 23, 42, 0.42)',
};

const dialogPanelStyle: CSSProperties = {
  width: 'min(820px, 100%)',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
  padding: 16,
  display: 'grid',
  gap: 12,
  boxShadow: 'var(--shadow-popover)',
};
