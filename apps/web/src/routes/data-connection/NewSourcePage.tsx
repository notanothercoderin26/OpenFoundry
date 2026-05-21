import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  FALLBACK_CONNECTOR_CATALOG,
  capabilityLabel,
  dataConnection,
  getConnectorRegistryEntry,
  type ConnectorCapability,
  type ConnectorCatalogEntry,
} from '@/lib/api/data-connection';
import { Breadcrumb } from '@/lib/components/ui/Breadcrumb';
import { ChipBadge } from '@/lib/components/ui/ChipBadge';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

// ---------------------------------------------------------------------------
// Bucket classification: split the catalog into the two Palantir-style buckets
// (`Sources` and `Protocol sources`) by connector type. The internal
// `category` of each connector is preserved for icon/tone mapping but no
// longer drives any visible filter.
// ---------------------------------------------------------------------------

const PROTOCOL_TYPES = new Set<string>(['sftp', 'rest_api', 'generic_connector']);

function isProtocolConnector(entry: ConnectorCatalogEntry): boolean {
  return PROTOCOL_TYPES.has(entry.type);
}

function protocolNameSuffix(entry: ConnectorCatalogEntry): string | null {
  if (entry.type === 'generic_connector') return '(JDBC)';
  return null;
}

function isExperimentalConnector(entry: ConnectorCatalogEntry): boolean {
  return entry.type === 'generic_connector' || entry.type === 'iot';
}

function capabilityChipLabel(capability: ConnectorCapability): string {
  switch (capability) {
    case 'batch_sync':
      return 'Batch syncs';
    case 'streaming_sync':
      return 'Streaming syncs';
    case 'cdc_sync':
      return 'CDC syncs';
    case 'media_sync':
      return 'Media syncs';
    case 'hyperauto':
      return 'HyperAuto';
    case 'file_export':
      return 'File exports';
    case 'table_export':
      return 'Table exports';
    case 'streaming_export':
      return 'Streaming exports';
    case 'webhook':
      return 'Webhooks';
    case 'virtual_table':
      return 'Virtual tables';
    case 'virtual_media':
      return 'Virtual media';
    case 'exploration':
      return 'Exploration';
    case 'use_in_code':
      return 'Use in code';
  }
}

function glyphForConnector(entry: ConnectorCatalogEntry): GlyphName {
  switch (entry.type) {
    case 'postgresql':
    case 'mssql':
    case 'oracle':
    case 'mysql':
    case 'snowflake':
    case 'bigquery':
    case 'generic_connector':
      return 'database';
    case 's3':
    case 'gcs':
    case 'onelake':
    case 'abfs':
    case 'sftp':
      return 'folder';
    case 'kafka':
    case 'kinesis':
    case 'iot':
      return 'run';
    case 'rabbitmq':
    case 'sqs':
      return 'mail';
    case 'rest_api':
    case 'graphql':
      return 'code';
    case 'salesforce':
    case 'github':
    case 'slack':
      return 'app';
    case 'wfs':
      return 'graph';
    case 'dicom_media':
      return 'image';
    case 'sap':
      return 'object';
    default: {
      switch (entry.category) {
        case 'databases':
          return 'database';
        case 'filesystems_blob_stores':
          return 'folder';
        case 'event_streams':
        case 'message_queues':
          return 'run';
        case 'rest_apis':
          return 'code';
        case 'media_sources':
          return 'image';
        case 'geospatial_systems':
          return 'graph';
        default:
          return 'app';
      }
    }
  }
}

function glyphToneForConnector(entry: ConnectorCatalogEntry): string {
  switch (entry.category) {
    case 'databases':
      return '#1F5EA8';
    case 'filesystems_blob_stores':
      return '#B66B1E';
    case 'event_streams':
    case 'message_queues':
      return '#6B47A0';
    case 'rest_apis':
      return '#0E7490';
    case 'productivity_tools':
    case 'saas_applications':
      return '#157347';
    case 'media_sources':
      return '#B42318';
    case 'geospatial_systems':
      return '#5F6B7A';
    default:
      return '#344154';
  }
}

// Search across name, type, description, every capability id/label (singular
// AND plural), credential field labels and network modes. Typing "virtual"
// matches both virtual_tables and virtual_media; typing "use in code" or
// "virtual tables" (plural) also matches the chip labels rendered in the UI.
function matchesQuery(entry: ConnectorCatalogEntry, q: string): boolean {
  if (!q) return true;
  if (entry.type.toLowerCase().includes(q)) return true;
  if (entry.name.toLowerCase().includes(q)) return true;
  if (entry.description.toLowerCase().includes(q)) return true;
  for (const cap of entry.capabilities) {
    if (cap.toLowerCase().includes(q)) return true;
    if (capabilityLabel(cap).toLowerCase().includes(q)) return true;
    if (capabilityChipLabel(cap).toLowerCase().includes(q)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function NewSourcePage() {
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>(() =>
    FALLBACK_CONNECTOR_CATALOG.map(getConnectorRegistryEntry),
  );
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dataConnection
      .getCatalog()
      .then((res) => {
        const list = res.connectors.length > 0 ? res.connectors : FALLBACK_CONNECTOR_CATALOG;
        setCatalog(list.map(getConnectorRegistryEntry));
      })
      .catch(() => {
        /* keep fallback catalog */
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((entry) => matchesQuery(entry, q));
  }, [catalog, query]);

  async function pick(entry: ConnectorCatalogEntry) {
    if (!entry.available || busy) return;
    setBusy(true);
    setError('');
    try {
      const created = await dataConnection.createSource({
        name: `Untitled ${entry.name} source`,
        connector_type: entry.type,
        config: {},
      });
      navigate(`/data-connection/sources/${encodeURIComponent(created.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create source');
      setBusy(false);
    }
  }

  return (
    <ConnectorPicker
      catalog={filtered}
      query={query}
      onQueryChange={setQuery}
      onPick={pick}
      error={error}
      busy={busy}
    />
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface ConnectorPickerProps {
  catalog: ConnectorCatalogEntry[];
  query: string;
  onQueryChange: (value: string) => void;
  onPick: (entry: ConnectorCatalogEntry) => void;
  error: string;
  busy: boolean;
}

function ConnectorPicker({
  catalog,
  query,
  onQueryChange,
  onPick,
  error,
  busy,
}: ConnectorPickerProps) {
  const buckets = useMemo(() => {
    const sources: ConnectorCatalogEntry[] = [];
    const protocols: ConnectorCatalogEntry[] = [];
    for (const entry of catalog) {
      (isProtocolConnector(entry) ? protocols : sources).push(entry);
    }
    return { sources, protocols };
  }, [catalog]);

  return (
    <section
      style={{
        padding: '20px 32px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        minHeight: '100%',
        background: 'var(--bg-app)',
      }}
    >
      <Breadcrumb
        items={[
          { label: 'Data connection', href: '/data-connection' },
          { label: 'New Source' },
        ]}
      />

      <HeaderCard busy={busy} />

      {error ? (
        <div
          className="of-status-danger"
          style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
        >
          {error}
        </div>
      ) : null}

      <ConnectorSection
        title="Sources"
        description="To connect to data from the Internet or an on-premises source, select from the listed source types."
        showSearch
        query={query}
        onQueryChange={onQueryChange}
        entries={buckets.sources}
        onPick={onPick}
        emptyText="No connectors match the current search."
      />

      <ConnectorSection
        title="Protocol sources"
        description="Choose from available protocol source types to support connections to other systems."
        entries={buckets.protocols}
        onPick={onPick}
        emptyText="No protocol sources match the current search."
        variant="protocol"
      />
    </section>
  );
}

function HeaderCard({ busy }: { busy: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        background: 'var(--bg-default)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <Link
        to="/data-connection"
        aria-label="Back to Data Connection"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          color: 'var(--text-muted)',
          borderRadius: 'var(--radius-md)',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
        }}
      >
        <Glyph name="back-arrow" size={18} tone="currentColor" />
      </Link>

      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          background: 'var(--bg-chip)',
          color: 'var(--text-muted)',
          borderRadius: 4,
          flex: '0 0 auto',
        }}
      >
        <Glyph name="database" size={20} tone="currentColor" />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-strong)',
            lineHeight: 1.3,
          }}
        >
          Untitled source
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          {busy ? 'Creating source…' : 'Select your source type'}
        </p>
      </div>

      <Link to="/data-connection" className="of-button" style={{ fontSize: 13 }}>
        Cancel
      </Link>
    </div>
  );
}

interface ConnectorSectionProps {
  title: string;
  description: string;
  entries: ConnectorCatalogEntry[];
  onPick: (entry: ConnectorCatalogEntry) => void;
  emptyText: string;
  showSearch?: boolean;
  query?: string;
  onQueryChange?: (value: string) => void;
  variant?: 'source' | 'protocol';
}

function ConnectorSection({
  title,
  description,
  entries,
  onPick,
  emptyText,
  showSearch = false,
  query = '',
  onQueryChange,
  variant = 'source',
}: ConnectorSectionProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--text-strong)',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)', maxWidth: 720 }}>
          {description}
        </p>
      </div>

      {showSearch && onQueryChange ? (
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by connector name or capability (e.g. 'virtual')"
          aria-label="Search connectors"
          className="of-input"
          style={{ maxWidth: 560 }}
        />
      ) : null}

      {entries.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{emptyText}</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}
        >
          {entries.map((entry) => (
            <ConnectorCard
              key={entry.type}
              entry={entry}
              variant={variant}
              onPick={() => onPick(entry)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface ConnectorCardProps {
  entry: ConnectorCatalogEntry;
  variant: 'source' | 'protocol';
  onPick: () => void;
}

function ConnectorCard({ entry, variant, onPick }: ConnectorCardProps) {
  const suffix = protocolNameSuffix(entry);
  const experimental = isExperimentalConnector(entry);
  const unavailable = !entry.available;
  const icon = glyphForConnector(entry);
  const iconTone = glyphToneForConnector(entry);

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={unavailable}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100%',
        padding: 16,
        textAlign: 'left',
        background: unavailable ? 'var(--bg-panel-muted)' : 'var(--bg-default)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        cursor: unavailable ? 'not-allowed' : 'pointer',
        font: 'inherit',
        color: 'var(--text-default)',
        transition: 'border-color 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!unavailable)
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-focus)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
      }}
      onFocus={(e) => {
        if (!unavailable)
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-focus)';
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            flex: '0 0 auto',
            color: iconTone,
          }}
        >
          <Glyph name={icon} size={24} tone={iconTone} />
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-strong)',
            minWidth: 0,
            flex: 1,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.name}
          </span>
          {suffix ? (
            <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{suffix}</span>
          ) : null}
        </span>
        {experimental ? (
          <ChipBadge variant="experimental" uppercase>
            Experimental
          </ChipBadge>
        ) : unavailable ? (
          <ChipBadge variant="legacy">Soon</ChipBadge>
        ) : null}
      </div>

      {variant === 'protocol' ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--text-muted)',
            lineHeight: 1.45,
          }}
        >
          {entry.description}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {entry.capabilities.map((capability) => (
          <ChipBadge key={capability}>{capabilityChipLabel(capability)}</ChipBadge>
        ))}
      </div>
    </button>
  );
}
