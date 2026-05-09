import type { Dataset, DatasetQualityResponse } from '@/lib/api/datasets';

interface MetadataPanelProps {
  dataset: Dataset;
  quality: DatasetQualityResponse | null;
  fileCount?: number;
  transactionCount?: number;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value?: string | null) {
  if (!value) return 'n/a';
  return new Date(value).toLocaleString();
}

function qualityScore(quality: DatasetQualityResponse | null) {
  if (quality?.score === null || quality?.score === undefined) return 'n/a';
  return `${Math.round(quality.score * 100)}%`;
}

export function MetadataPanel({ dataset, quality, fileCount, transactionCount }: MetadataPanelProps) {
  return (
    <aside className="of-panel dataset-detail-metadata" style={{ padding: 12, display: 'grid', gap: 14, alignContent: 'start' }}>
      <section>
        <p className="of-eyebrow">Metadata</p>
        <h2 className="of-heading-sm" style={{ marginTop: 4 }}>Dataset details</h2>
        <p className="of-text-muted" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45 }}>
          {dataset.description || 'No description.'}
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <Metric label="Rows" value={dataset.row_count.toLocaleString()} />
        <Metric label="Size" value={formatBytes(dataset.size_bytes)} />
        <Metric label="Version" value={`v${dataset.current_version}`} />
        <Metric label="Quality" value={qualityScore(quality)} />
      </section>

      <dl style={{ display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr)', gap: '7px 10px', fontSize: 12 }}>
        <dt className="of-text-muted">RID</dt>
        <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{dataset.id}</dd>
        <dt className="of-text-muted">Owner</dt>
        <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{dataset.owner_id}</dd>
        <dt className="of-text-muted">Format</dt>
        <dd style={{ margin: 0 }}>{dataset.format}</dd>
        <dt className="of-text-muted">Branch</dt>
        <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{dataset.active_branch}</dd>
        <dt className="of-text-muted">Storage</dt>
        <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{dataset.storage_path}</dd>
        <dt className="of-text-muted">Created</dt>
        <dd style={{ margin: 0 }}>{formatDate(dataset.created_at)}</dd>
        <dt className="of-text-muted">Updated</dt>
        <dd style={{ margin: 0 }}>{formatDate(dataset.updated_at)}</dd>
      </dl>

      <section>
        <p className="of-eyebrow">Loaded context</p>
        <dl style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr auto', gap: '5px 8px', fontSize: 12 }}>
          <dt className="of-text-muted">Files</dt>
          <dd style={{ margin: 0 }}>{fileCount === undefined ? 'open tab' : fileCount.toLocaleString()}</dd>
          <dt className="of-text-muted">Transactions</dt>
          <dd style={{ margin: 0 }}>{transactionCount === undefined ? 'open tab' : transactionCount.toLocaleString()}</dd>
          <dt className="of-text-muted">Alerts</dt>
          <dd style={{ margin: 0 }}>{quality?.alerts.length ?? 'open tab'}</dd>
          <dt className="of-text-muted">Rules</dt>
          <dd style={{ margin: 0 }}>{quality?.rules.length ?? 'open tab'}</dd>
        </dl>
      </section>

      <section>
        <p className="of-eyebrow">Tags</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {dataset.tags.map((tag) => <span key={tag} className="of-chip">{tag}</span>)}
          {dataset.tags.length === 0 && <span className="of-text-muted" style={{ fontSize: 12 }}>No tags</span>}
        </div>
      </section>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="of-panel-muted" style={{ padding: 8, minWidth: 0 }}>
      <p className="of-text-muted" style={{ margin: 0, fontSize: 10, textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '3px 0 0', fontWeight: 700, fontSize: 13, overflowWrap: 'anywhere' }}>{value}</p>
    </div>
  );
}
