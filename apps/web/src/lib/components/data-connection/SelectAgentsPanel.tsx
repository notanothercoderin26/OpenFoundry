import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  connectorAgentHealthLabel,
  dataConnection,
  type ConnectorAgent,
} from '@/lib/api/data-connection';
import { ChipBadge } from '@/lib/components/ui/ChipBadge';
import { Glyph } from '@/lib/components/ui/Glyph';

export interface SelectAgentsPanelProps {
  sourceId: string;
  createAgentHref?: string;
}

export function SelectAgentsPanel({
  sourceId,
  createAgentHref = '/data-connection/agents',
}: SelectAgentsPanelProps) {
  const [assigned, setAssigned] = useState<ConnectorAgent[]>([]);
  const [allAgents, setAllAgents] = useState<ConnectorAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sourceList, fullList] = await Promise.all([
        dataConnection.listSourceAgents(sourceId),
        dataConnection.listConnectorAgents(),
      ]);
      setAssigned(sourceList);
      setAllAgents(fullList);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignedIds = useMemo(() => new Set(assigned.map((a) => a.id)), [assigned]);
  const candidates = useMemo(
    () => allAgents.filter((agent) => !assignedIds.has(agent.id)),
    [allAgents, assignedIds],
  );

  async function handleAdd() {
    if (!selectedAgentId) return;
    setBusyAgentId(selectedAgentId);
    setError('');
    try {
      await dataConnection.assignAgentToSource(sourceId, selectedAgentId);
      setSelectedAgentId('');
      setAdding(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to assign agent');
    } finally {
      setBusyAgentId(null);
    }
  }

  async function handleRemove(agentId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Remove this agent from the source?')) {
      return;
    }
    setBusyAgentId(agentId);
    setError('');
    try {
      await dataConnection.unassignAgentFromSource(sourceId, agentId);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to remove agent');
    } finally {
      setBusyAgentId(null);
    }
  }

  return (
    <section className="of-panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p className="of-eyebrow">Select agents</p>
          <h2 className="of-section-title" style={{ marginTop: 4 }}>
            {loading ? 'Loading…' : `${assigned.length} agent${assigned.length === 1 ? '' : 's'} assigned`}
          </h2>
        </div>
      </header>

      {error ? (
        <div
          className="of-status-danger"
          style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}
        >
          {error}
        </div>
      ) : null}

      {assigned.length === 0 && !loading ? (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          No agents are assigned to this source yet.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {assigned.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              busy={busyAgentId === agent.id}
              onRemove={() => void handleRemove(agent.id)}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 12,
            background: 'var(--bg-panel-muted)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="of-input"
            aria-label="Select an agent to add"
            style={{ flex: 1, minWidth: 0 }}
          >
            <option value="">Choose an agent…</option>
            {candidates.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · {connectorAgentHealthLabel(agent)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!selectedAgentId || busyAgentId !== null}
            className="of-button of-button--primary"
            style={{ fontSize: 13 }}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setSelectedAgentId('');
            }}
            disabled={busyAgentId !== null}
            className="of-button"
            style={{ fontSize: 13 }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={loading || candidates.length === 0}
            className="of-button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
            }}
          >
            <Glyph name="plus" size={14} tone="currentColor" />
            Add another agent
          </button>
          <Link
            to={createAgentHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--text-link)',
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Create new agent
            <Glyph name="external-link" size={12} tone="currentColor" />
          </Link>
        </div>
      )}
    </section>
  );
}

interface AgentCardProps {
  agent: ConnectorAgent;
  busy: boolean;
  onRemove: () => void;
}

function AgentCard({ agent, busy, onRemove }: AgentCardProps) {
  const healthLabel = connectorAgentHealthLabel(agent);
  const isHealthy = agent.health.state === 'healthy' || agent.health.state === 'ok';
  const connectedCount = agent.connected_sources?.length ?? 0;

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 14px',
        background: 'var(--bg-default)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          background: 'var(--bg-chip)',
          borderRadius: 4,
          color: 'var(--text-muted)',
          flex: '0 0 auto',
        }}
      >
        <Glyph name="shield" size={18} tone="currentColor" />
      </span>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ChipBadge variant={isHealthy ? 'healthy' : 'legacy'}>{healthLabel}</ChipBadge>
        <strong
          style={{
            fontSize: 13,
            color: 'var(--text-strong)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {agent.name}
        </strong>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Used by {connectedCount} source{connectedCount === 1 ? '' : 's'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Version {agent.version || '—'}
        </span>
      </div>

      <button
        type="button"
        aria-label={`Remove ${agent.name}`}
        disabled={busy}
        onClick={onRemove}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          border: 0,
          background: 'transparent',
          color: 'var(--text-muted)',
          borderRadius: 'var(--radius-md)',
          cursor: busy ? 'wait' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!busy) {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-strong)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
        }}
      >
        <Glyph name="x" size={14} tone="currentColor" />
      </button>
    </li>
  );
}
