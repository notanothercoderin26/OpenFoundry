import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  dataConnection,
  FALLBACK_STREAMING_SOURCE_CONTRACTS,
  type SourceWorker,
  type StreamingSourceContract,
} from '@/lib/api/data-connection';

const STREAMING_SOURCE_CONNECTOR_TYPES: Record<string, string> = {
  streaming_kafka: 'kafka',
  streaming_kinesis: 'kinesis',
};

function connectorTypeFor(contract: StreamingSourceContract): string {
  return STREAMING_SOURCE_CONNECTOR_TYPES[contract.kind] ?? contract.kind;
}

function workerFor(contract: StreamingSourceContract): SourceWorker {
  return contract.requires_agent ? 'agent' : 'foundry';
}

function defaultValuesFor(contract: StreamingSourceContract): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of contract.config_fields) {
    if (field.name === 'auto_offset_reset') values[field.name] = 'latest';
    if (field.name === 'shard_iterator_type') values[field.name] = 'LATEST';
    if (field.name === 'wait_time_seconds') values[field.name] = '10';
    if (field.name === 'ack_deadline_seconds') values[field.name] = '30';
  }
  return values;
}

export function NewStreamingSourcePage() {
  const [contracts, setContracts] = useState<StreamingSourceContract[]>(FALLBACK_STREAMING_SOURCE_CONTRACTS);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [loadWarning, setLoadWarning] = useState('');
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [targetStreamRid, setTargetStreamRid] = useState('');
  const [batchSize, setBatchSize] = useState(100);
  const [pollIntervalMs, setPollIntervalMs] = useState(1000);
  const [schemaInference, setSchemaInference] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const selectedContract = useMemo(
    () => contracts.find((contract) => contract.kind === selectedKind) ?? null,
    [contracts, selectedKind],
  );

  useEffect(() => {
    let active = true;
    dataConnection
      .listStreamingSourceContracts()
      .then((res) => {
        if (!active) return;
        setContracts(res.data.length > 0 ? res.data : FALLBACK_STREAMING_SOURCE_CONTRACTS);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setContracts(FALLBACK_STREAMING_SOURCE_CONTRACTS);
        setLoadWarning(cause instanceof Error ? cause.message : 'Using local streaming contracts.');
      })
      .finally(() => {
        if (active) setLoadingContracts(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function pickContract(contract: StreamingSourceContract) {
    setSelectedKind(contract.kind);
    setSourceName(`${contract.display_name} streaming source`);
    setFormValues(defaultValuesFor(contract));
    setTargetStreamRid('');
    setBatchSize(100);
    setPollIntervalMs(1000);
    setSchemaInference(true);
    setError('');
  }

  function updateField(name: string, value: string) {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  }

  function buildConfig(contract: StreamingSourceContract): Record<string, unknown> {
    if (!Number.isFinite(batchSize) || batchSize < 1) {
      throw new Error('Batch size must be at least 1.');
    }
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 100) {
      throw new Error('Poll interval must be at least 100ms.');
    }

    const config: Record<string, unknown> = {
      streaming_source_kind: contract.kind,
      target_stream_rid: targetStreamRid.trim() || null,
      batch_size: batchSize,
      poll_interval_ms: pollIntervalMs,
      schema_inference: schemaInference,
    };

    for (const field of contract.config_fields) {
      const raw = (formValues[field.name] ?? '').trim();
      if (!raw) {
        if (field.required) throw new Error(`${field.name} is required.`);
        continue;
      }
      if (field.kind === 'int') {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) throw new Error(`${field.name} must be a number.`);
        config[field.name] = parsed;
      } else {
        config[field.name] = raw;
      }
    }

    if (contract.kind === 'streaming_kafka' && typeof config.topic === 'string') {
      config.topics = [config.topic];
    }
    if (contract.kind === 'streaming_kinesis') {
      if (typeof config.shard_iterator_type === 'string') {
        config.iterator_type = config.shard_iterator_type;
      }
      if (typeof config.max_records_per_shard === 'number') {
        config.max_records = config.max_records_per_shard;
      }
    }

    return config;
  }

  async function submit() {
    if (!selectedContract) return;
    setBusy(true);
    setError('');
    try {
      const created = await dataConnection.createSource({
        name: sourceName.trim() || `${selectedContract.display_name} streaming source`,
        connector_type: connectorTypeFor(selectedContract),
        worker: workerFor(selectedContract),
        config: buildConfig(selectedContract),
      });
      navigate(`/data-connection/sources/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Link to="/data-connection" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Back to sources</Link>

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="of-heading-xl">New streaming source</h1>
          <p className="of-text-muted" style={{ marginTop: 4 }}>
            Connect Kafka, Kinesis, Pub/Sub, SQS or agent-backed event feeds as managed Data Connection sources.
          </p>
        </div>
        <Link to="/data-connection/new" className="of-button">New batch source</Link>
      </header>

      <div className="of-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className="of-chip of-chip-active">1 Connector</span>
        <span className={`of-chip ${selectedContract ? 'of-chip-active' : ''}`}>2 Configure</span>
        <span className={`of-chip ${busy ? 'of-chip-active' : ''}`}>3 Create</span>
        <span className="of-text-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
          POST /data-connection/sources
        </span>
      </div>

      {loadWarning && (
        <div className="of-status-warning" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          Loaded fallback streaming contracts: {loadWarning}
        </div>
      )}

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!selectedContract ? (
        <section className="of-panel" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div>
              <p className="of-eyebrow">Pick a streaming connector</p>
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                {loadingContracts ? 'Loading contracts...' : `${contracts.length} connector contracts available`}
              </p>
            </div>
          </div>

          <ul
            style={{
              margin: 0,
              paddingLeft: 0,
              listStyle: 'none',
              display: 'grid',
              gap: 8,
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            }}
          >
            {contracts.map((contract) => (
              <li key={contract.kind}>
                <button
                  type="button"
                  onClick={() => pickContract(contract)}
                  style={{
                    width: '100%',
                    minHeight: 132,
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-panel)',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <strong>{contract.display_name}</strong>
                    <span className="of-chip" style={{ minHeight: 20, fontSize: 11 }}>
                      {contract.requires_agent ? 'agent' : 'foundry'}
                    </span>
                  </span>
                  <span className="of-text-muted" style={{ fontSize: 12 }}>{contract.description}</span>
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {contract.config_fields.slice(0, 4).map((field) => (
                      <span key={field.name} className="of-chip" style={{ minHeight: 20, fontSize: 11 }}>
                        {field.name}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
            {contracts.length === 0 && <li className="of-text-muted">No streaming source contracts.</li>}
          </ul>
        </section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 12, alignItems: 'start' }}>
          <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div>
              <p className="of-eyebrow">{selectedContract.display_name}</p>
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>{selectedContract.description}</p>
            </div>

            <label style={{ fontSize: 13 }}>
              Source name
              <input
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                className="of-input"
                style={{ marginTop: 4 }}
              />
            </label>

            {selectedContract.config_fields.map((field) => (
              <label key={field.name} style={{ fontSize: 13 }}>
                {field.name}{field.required ? ' *' : ''}
                <input
                  type={field.kind === 'secret' ? 'password' : field.kind === 'int' ? 'number' : 'text'}
                  value={formValues[field.name] ?? ''}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.description}
                  className="of-input"
                  style={{ marginTop: 4 }}
                />
              </label>
            ))}

            <label style={{ fontSize: 13 }}>
              Target stream RID
              <input
                value={targetStreamRid}
                onChange={(event) => setTargetStreamRid(event.target.value)}
                placeholder="ri.foundry.main.stream..."
                className="of-input"
                style={{ marginTop: 4 }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <label style={{ fontSize: 13 }}>
                Batch size
                <input
                  type="number"
                  min={1}
                  value={batchSize}
                  onChange={(event) => setBatchSize(Number(event.target.value) || 0)}
                  className="of-input"
                  style={{ marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Poll interval (ms)
                <input
                  type="number"
                  min={100}
                  value={pollIntervalMs}
                  onChange={(event) => setPollIntervalMs(Number(event.target.value) || 0)}
                  className="of-input"
                  style={{ marginTop: 4 }}
                />
              </label>
            </div>

            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={schemaInference}
                onChange={(event) => setSchemaInference(event.target.checked)}
              />
              Enable schema inference
            </label>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedKind(null);
                  setFormValues({});
                  setError('');
                }}
                className="of-button"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !sourceName.trim()}
                className="of-button of-button--primary"
              >
                {busy ? 'Creating...' : 'Create streaming source'}
              </button>
            </div>
          </section>

          <aside className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <p className="of-eyebrow">Submit contract</p>
            <dl style={{ display: 'grid', gap: 8, margin: 0, fontSize: 12 }}>
              <div>
                <dt className="of-text-muted">connector_type</dt>
                <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{connectorTypeFor(selectedContract)}</dd>
              </div>
              <div>
                <dt className="of-text-muted">worker</dt>
                <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{workerFor(selectedContract)}</dd>
              </div>
              <div>
                <dt className="of-text-muted">source kind</dt>
                <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{selectedContract.kind}</dd>
              </div>
            </dl>
            <div className="of-status-info" style={{ padding: 10, borderRadius: 'var(--radius-md)', fontSize: 12 }}>
              The created source opens in the standard source detail flow for testing, credentials and registrations.
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
