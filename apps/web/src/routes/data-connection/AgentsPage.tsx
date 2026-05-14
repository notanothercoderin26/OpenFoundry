import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import {
  connectorAgentCapabilitySummary,
  connectorAgentFailuresForSource,
  connectorAgentHealthLabel,
  connectorAgentsForSource,
  dataConnection,
  type ConnectorAgent,
  type Source,
} from '@/lib/api/data-connection';

const DEFAULT_CAPABILITIES = `{
  "connectors": ["postgresql", "mysql", "jdbc"],
  "proxy": true,
  "version": "0.1.0"
}`;

const DEFAULT_METADATA = `{
  "region": "private-network",
  "environment": "prod",
  "host": "agent.internal",
  "runtime": "container"
}`;

const STALE_HEARTBEAT_MS = 5 * 60 * 1000;

function parseJSONObject(raw: string, label: string): Record<string, unknown> {
  const value = JSON.parse(raw.trim() || '{}') as unknown;
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isStaleHeartbeat(value: string | null | undefined) {
  if (!value) return true;
  const heartbeat = new Date(value).getTime();
  return Number.isNaN(heartbeat) || Date.now() - heartbeat > STALE_HEARTBEAT_MS;
}

function summarizeCapabilities(agent: ConnectorAgent) {
  return connectorAgentCapabilitySummary(agent).slice(0, 4).join(' | ') || 'No connector capabilities';
}

function statusStyle(status: string, stale: boolean): CSSProperties {
  if (stale) return { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' };
  if (status === 'error') return { background: '#fee2e2', color: '#b91c1c' };
  if (status === 'warning') return { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' };
  if (status === 'online') return { background: 'var(--status-success-bg)', color: 'var(--status-success)' };
  if (status === 'offline') return { background: '#eef2f7', color: 'var(--text-muted)' };
  return { background: 'var(--status-info-bg)', color: 'var(--status-info)' };
}

export function AgentsPage() {
  const [agents, setAgents] = useState<ConnectorAgent[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [sourceError, setSourceError] = useState('');

  const [name, setName] = useState('');
  const [agentUrl, setAgentUrl] = useState('');
  const [version, setVersion] = useState('0.1.0');
  const [environment, setEnvironment] = useState('prod');
  const [host, setHost] = useState('');
  const [capabilitiesRaw, setCapabilitiesRaw] = useState(DEFAULT_CAPABILITIES);
  const [metadataRaw, setMetadataRaw] = useState(DEFAULT_METADATA);

  const busy = busyAction !== '';

  const agentSources = useMemo(
    () => sources.filter((source) => source.worker === 'agent'),
    [sources],
  );

  const onlineAgents = useMemo(
    () => agents.filter((agent) => agent.status === 'online' && !isStaleHeartbeat(agent.last_heartbeat_at)).length,
    [agents],
  );
  const failingAgents = useMemo(
    () => agents.filter((agent) => agent.health?.state === 'error' || (agent.connection_failures ?? []).length > 0).length,
    [agents],
  );
  const proxyPolicyCount = useMemo(
    () => agents.reduce((total, agent) => total + (agent.assigned_proxy_policies ?? []).length, 0),
    [agents],
  );

  async function load() {
    setLoading(true);
    setError('');
    setSourceError('');
    const [agentResult, sourceResult] = await Promise.allSettled([
      dataConnection.listConnectorAgents(),
      dataConnection.listSources({ page: 1, per_page: 100 }),
    ]);

    if (agentResult.status === 'fulfilled') {
      setAgents(agentResult.value);
    } else {
      setAgents([]);
      setError(agentResult.reason instanceof Error ? agentResult.reason.message : 'Failed to load agents');
    }

    if (sourceResult.status === 'fulfilled') {
      const payload = sourceResult.value;
      setSources(payload.data ?? (payload as unknown as { items?: Source[] }).items ?? []);
    } else {
      setSources([]);
      setSourceError(sourceResult.reason instanceof Error ? sourceResult.reason.message : 'Failed to load agent sources');
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function registerAgent(event: FormEvent) {
    event.preventDefault();
    setBusyAction('register');
    setError('');
    try {
      await dataConnection.registerConnectorAgent({
        name: name.trim(),
        agent_url: agentUrl.trim(),
        version: version.trim(),
        environment: environment.trim(),
        host: host.trim(),
        capabilities: parseJSONObject(capabilitiesRaw, 'Capabilities'),
        metadata: parseJSONObject(metadataRaw, 'Metadata'),
      });
      setName('');
      setAgentUrl('');
      setVersion('0.1.0');
      setEnvironment('prod');
      setHost('');
      setCapabilitiesRaw(DEFAULT_CAPABILITIES);
      setMetadataRaw(DEFAULT_METADATA);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Register failed');
    } finally {
      setBusyAction('');
    }
  }

  async function heartbeat(agent: ConnectorAgent) {
    setBusyAction(`heartbeat:${agent.id}`);
    setError('');
    try {
      await dataConnection.heartbeatConnectorAgent(agent.id, {
        version: agent.version,
        environment: agent.environment,
        host: agent.host,
        capabilities: agent.capabilities,
        metadata: agent.metadata,
        connected_sources: agent.connected_sources,
        supported_connector_capabilities: agent.supported_connector_capabilities,
        assigned_proxy_policies: agent.assigned_proxy_policies,
        connection_failures: agent.connection_failures,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Heartbeat failed');
    } finally {
      setBusyAction('');
    }
  }

  async function remove(agent: ConnectorAgent) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete agent "${agent.name}"?`)) return;
    setBusyAction(`delete:${agent.id}`);
    setError('');
    try {
      await dataConnection.deleteConnectorAgent(agent.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Link to="/data-connection" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Back to sources</Link>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="of-heading-xl">Data Connection agents</h1>
          <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 760 }}>
            Connector agents proxy private-network traffic for legacy agent-worker sources.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy} className="of-button">
          Refresh
        </button>
      </header>

      {(error || sourceError) && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error || sourceError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        {[
          ['Registered agents', agents.length],
          ['Online', onlineAgents],
          ['Agent worker sources', agentSources.length],
          ['Proxy policies', proxyPolicyCount],
          ['With failures', failingAgents],
        ].map(([label, value]) => (
          <div key={label} className="of-panel" style={{ padding: 12 }}>
            <p className="of-eyebrow">{label}</p>
            <p style={{ marginTop: 4, color: 'var(--text-strong)', fontSize: 22, fontWeight: 600 }}>{value}</p>
          </div>
        ))}
      </div>

      <div className="of-status-warning" style={{ padding: 14, borderRadius: 'var(--radius-md)', fontSize: 13 }}>
        <p style={{ fontWeight: 600 }}>Agent worker is in the legacy phase</p>
        <p style={{ marginTop: 4, fontSize: 12 }}>
          New sources should use Foundry worker when possible; agents remain available for private-network proxy paths.
        </p>
      </div>

      <form onSubmit={registerAgent} className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <div>
          <p className="of-eyebrow">Register agent</p>
          <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
            The URL must point at the connector agent endpoint reachable from the control plane.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          <label style={{ fontSize: 13 }}>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} className="of-input" style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Agent URL
            <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} placeholder="https://agent.internal:8443" className="of-input" style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Version
            <input value={version} onChange={(event) => setVersion(event.target.value)} className="of-input" style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Environment
            <input value={environment} onChange={(event) => setEnvironment(event.target.value)} className="of-input" style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Host
            <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="agent.internal" className="of-input" style={{ marginTop: 4 }} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          <label style={{ fontSize: 13 }}>
            Capabilities JSON
            <textarea value={capabilitiesRaw} onChange={(event) => setCapabilitiesRaw(event.target.value)} rows={5} className="of-input" style={{ marginTop: 4, minHeight: 120, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Metadata JSON
            <textarea value={metadataRaw} onChange={(event) => setMetadataRaw(event.target.value)} rows={5} className="of-input" style={{ marginTop: 4, minHeight: 120, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          </label>
        </div>
        <div>
          <button type="submit" disabled={busy || !name.trim() || !agentUrl.trim()} className="of-button of-button--primary">
            Register agent
          </button>
        </div>
      </form>

      {loading ? (
        <p className="of-text-muted">Loading agents...</p>
      ) : (
        <section className="of-panel" style={{ padding: 16, overflow: 'auto' }}>
          <p className="of-eyebrow">Agent registry</p>
          <table className="of-table" style={{ marginTop: 8, minWidth: 1080 }}>
            <thead>
              <tr>
                {['Agent', 'Runtime', 'Endpoint', 'Health', 'Sources / policies', 'Capabilities', 'Failures', 'Last heartbeat', ''].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const stale = isStaleHeartbeat(agent.last_heartbeat_at);
                return (
                  <tr key={agent.id}>
                    <td>
                      <strong>{agent.name}</strong>
                      <span className="of-text-muted" style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{agent.id}</span>
                    </td>
                    <td>
                      {agent.version || 'unknown'}
                      <span className="of-text-muted" style={{ display: 'block', fontSize: 11 }}>{agent.environment || 'no environment'} · {agent.host || 'no host'}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{agent.agent_url}</td>
                    <td>
                      <span style={{ ...statusStyle(agent.health?.state ?? agent.status, stale), borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                        {agent.health?.state ?? (stale ? 'stale' : agent.status)}
                      </span>
                      <span className="of-text-muted" style={{ display: 'block', marginTop: 4, fontSize: 11 }}>{connectorAgentHealthLabel(agent)}</span>
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {(agent.connected_sources ?? []).length} sources · {(agent.assigned_proxy_policies ?? []).length} proxy policies
                      {(agent.connected_sources ?? []).slice(0, 2).map((source) => (
                        <span key={`${agent.id}-${source.source_id}`} className="of-text-muted" style={{ display: 'block' }}>{source.source_name || source.source_id} · {source.status}</span>
                      ))}
                    </td>
                    <td style={{ maxWidth: 320, fontSize: 11 }}>{summarizeCapabilities(agent)}</td>
                    <td style={{ fontSize: 11 }}>
                      {(agent.connection_failures ?? []).length === 0 ? 'None' : (agent.connection_failures ?? []).slice(0, 2).map((failure) => (
                        <span key={`${agent.id}-${failure.code}-${failure.source_id ?? failure.policy_id ?? ''}`} style={{ display: 'block', color: '#b91c1c' }}>{failure.code}: {failure.message}</span>
                      ))}
                    </td>
                    <td>{formatDate(agent.last_heartbeat_at)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" onClick={() => void heartbeat(agent)} disabled={busy} className="of-button" style={{ fontSize: 11, marginRight: 6 }}>
                        Heartbeat
                      </button>
                      <button type="button" onClick={() => void remove(agent)} disabled={busy} className="of-button" style={{ fontSize: 11, color: '#b91c1c', borderColor: '#fecaca' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {agents.length === 0 && (
                <tr>
                  <td colSpan={9} className="of-text-muted" style={{ padding: 18, textAlign: 'center' }}>
                    No connector agents registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <section className="of-panel" style={{ padding: 16, overflow: 'auto' }}>
        <p className="of-eyebrow">Agent worker sources</p>
        <table className="of-table" style={{ marginTop: 8, minWidth: 680 }}>
          <thead>
            <tr>
              {['Source', 'Connector', 'Status', 'Agent health', 'Last sync'].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agentSources.map((source) => {
              const matches = connectorAgentsForSource(agents, source.id);
              const failures = matches.flatMap((agent) => connectorAgentFailuresForSource(agent, source.id));
              return (
                <tr key={source.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link to={`/data-connection/sources/${source.id}`}>{source.name}</Link>
                  </td>
                  <td>{source.connector_type}</td>
                  <td>{source.status}</td>
                  <td style={{ fontSize: 11 }}>
                    {matches.length ? matches.map((agent) => (
                      <span key={`${source.id}-${agent.id}`} style={{ display: 'block' }}>{agent.name}: {connectorAgentHealthLabel(agent)}</span>
                    )) : 'No reporting agent'}
                    {failures.length ? <span style={{ display: 'block', color: '#b91c1c' }}>{failures.length} agent connection failure{failures.length === 1 ? '' : 's'}</span> : null}
                  </td>
                  <td>{formatDate(source.last_sync_at)}</td>
                </tr>
              );
            })}
            {agentSources.length === 0 && (
              <tr>
                <td colSpan={5} className="of-text-muted" style={{ padding: 18, textAlign: 'center' }}>
                  No sources are using the legacy agent worker.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </section>
  );
}
