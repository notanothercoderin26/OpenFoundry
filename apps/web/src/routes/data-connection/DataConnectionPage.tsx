import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  FALLBACK_CONNECTOR_CATALOG,
  dataConnection,
  type Source,
  type SourceStatus,
} from '@/lib/api/data-connection';
import { Glyph } from '@/lib/components/ui/Glyph';

const STATUS_COLOR: Record<SourceStatus, string> = {
  healthy: '#15803d',
  degraded: '#9a5b00',
  error: '#b42318',
  configuring: '#1f5ea8',
  draft: '#5f6b7a',
};

const STATUS_BG: Record<SourceStatus, string> = {
  healthy: '#dcefe0',
  degraded: '#fff3df',
  error: '#fde7e7',
  configuring: '#e8f1ff',
  draft: '#edf1f5',
};

type SourceWithOwner = Source & { owner_id?: string | null; owner_name?: string | null };

function ownerLabel(source: SourceWithOwner): string {
  return source.owner_name ?? source.owner_id ?? '—';
}

function sourceTypeLabel(type: string): string {
  return FALLBACK_CONNECTOR_CATALOG.find((entry) => entry.type === type)?.name ?? type;
}

function workerLabel(worker: string): string {
  if (worker === 'foundry') return 'Foundry worker';
  if (worker === 'agent') return 'Agent worker';
  return worker;
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  const diff = Date.now() - ts;
  if (diff < 0) return new Date(ts).toLocaleString();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function DataConnectionPage() {
  const [sources, setSources] = useState<SourceWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await dataConnection.listSources({ page: 1, per_page: 100 });
      setSources(res.data as SourceWithOwner[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete(id: string, name: string) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete source "${name}"?`)) return;
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sources;
    return sources.filter((source) =>
      [
        source.name,
        source.id,
        source.connector_type,
        sourceTypeLabel(source.connector_type),
        source.worker,
        ownerLabel(source),
        source.status,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [query, sources]);

  return (
    <section
      style={{
        padding: '24px 32px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        minHeight: '100%',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              background: '#F4E5D1',
              color: '#B66B1E',
              borderRadius: 6,
              flex: '0 0 auto',
            }}
          >
            <Glyph name="database" size={22} tone="#B66B1E" />
          </span>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--text-strong)',
                lineHeight: 1.2,
              }}
            >
              Data Connection
            </h1>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              Connect Foundry to external systems.
            </p>
          </div>
        </div>

        <Link
          to="/data-connection/new"
          className="of-button of-button--primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
          }}
        >
          <Glyph name="plus" size={14} tone="currentColor" />
          New source
        </Link>
      </header>

      {error && (
        <div
          className="of-status-danger"
          style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          background: 'var(--bg-default)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          maxWidth: 520,
        }}
      >
        <Glyph name="search" size={16} tone="var(--text-muted)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sources"
          aria-label="Search sources"
          style={{
            flex: 1,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: 'var(--text-strong)',
            fontSize: 14,
          }}
        />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading sources…</p>
      ) : sources.length === 0 ? (
        <EmptyState />
      ) : (
        <SourcesTable sources={filtered} busyId={busyId} onDelete={handleDelete} />
      )}
    </section>
  );
}

interface SourcesTableProps {
  sources: SourceWithOwner[];
  busyId: string | null;
  onDelete: (id: string, name: string) => void;
}

function SourcesTable({ sources, busyId, onDelete }: SourcesTableProps) {
  if (sources.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        No sources match the current search.
      </p>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-default)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <table
        className="of-table"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Worker</Th>
            <Th>Status</Th>
            <Th>Last sync</Th>
            <Th>Owner</Th>
            <Th aria-label="Row actions" style={{ width: 48 }} />
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              deleting={busyId === source.id}
              onDelete={() => onDelete(source.id, source.name)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  style,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      style={{
        textAlign: 'left',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontWeight: 600,
        color: 'var(--text-muted)',
        padding: '10px 14px',
        background: 'var(--bg-panel-muted)',
        borderBottom: '1px solid var(--border-subtle)',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

interface SourceRowProps {
  source: SourceWithOwner;
  deleting: boolean;
  onDelete: () => void;
}

function SourceRow({ source, deleting, onDelete }: SourceRowProps) {
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <Td>
        <Link
          to={`/data-connection/sources/${encodeURIComponent(source.id)}`}
          style={{
            color: 'var(--text-link)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          {source.name}
        </Link>
      </Td>
      <Td>{sourceTypeLabel(source.connector_type)}</Td>
      <Td style={{ color: 'var(--text-muted)' }}>{workerLabel(source.worker)}</Td>
      <Td>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'capitalize',
            background: STATUS_BG[source.status],
            color: STATUS_COLOR[source.status],
          }}
        >
          {source.status}
        </span>
      </Td>
      <Td style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {formatRelative(source.last_sync_at)}
      </Td>
      <Td style={{ color: 'var(--text-muted)' }}>{ownerLabel(source)}</Td>
      <Td style={{ textAlign: 'right' }}>
        <button
          type="button"
          aria-label={`Delete ${source.name}`}
          disabled={deleting}
          onClick={onDelete}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            border: 0,
            background: 'transparent',
            color: deleting ? 'var(--text-soft)' : 'var(--text-muted)',
            borderRadius: 'var(--radius-md)',
            cursor: deleting ? 'wait' : 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!deleting) {
              (e.currentTarget as HTMLButtonElement).style.background = '#fde7e7';
              (e.currentTarget as HTMLButtonElement).style.color = '#b42318';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          }}
        >
          <Glyph name="trash" size={16} tone="currentColor" />
        </button>
      </Td>
    </tr>
  );
}

function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td
      style={{
        padding: '12px 14px',
        verticalAlign: 'middle',
        color: 'var(--text-default)',
        ...style,
      }}
    >
      {children}
    </td>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 40,
        background: 'var(--bg-default)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--radius-md)',
        textAlign: 'center',
        display: 'grid',
        justifyItems: 'center',
        gap: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          background: '#F4E5D1',
          color: '#B66B1E',
          borderRadius: 8,
        }}
      >
        <Glyph name="database" size={24} tone="#B66B1E" />
      </span>
      <div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>
          No sources yet
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Create your first source to start syncing data into Foundry.
        </p>
      </div>
      <Link
        to="/data-connection/new"
        className="of-button of-button--primary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
        }}
      >
        <Glyph name="plus" size={14} tone="currentColor" />
        New source
      </Link>
    </div>
  );
}
