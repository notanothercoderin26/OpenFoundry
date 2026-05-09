import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { MetadataPanel } from '@/lib/components/dataset/MetadataPanel';
import { QualityDashboard } from '@/lib/components/dataset/QualityDashboard';
import { VirtualizedPreviewTable } from '@/lib/components/dataset/VirtualizedPreviewTable';
import { ConfirmDialog } from '@/lib/components/workspace/ConfirmDialog';
import { Tabs } from '@/lib/components/Tabs';
import {
  deleteDataset,
  exportDataset,
  getDataset,
  getDatasetQuality,
  getDatasetSchema,
  getVersions,
  listDatasetFilesystem,
  listDatasetTransactions,
  previewDataset,
  refreshDatasetQualityProfile,
  startDatasetBuild,
  updateDataset,
  type Dataset,
  type DatasetExportParams,
  type DatasetExportResponse,
  type DatasetFilesystemEntry,
  type DatasetPreviewResponse,
  type DatasetQualityResponse,
  type DatasetSchema,
  type DatasetTransaction,
  type DatasetVersion,
} from '@/lib/api/datasets';

type Tab = 'preview' | 'schema' | 'files' | 'transactions' | 'versions' | 'quality' | 'metadata';
type BusyAction = 'save' | 'delete' | 'build' | 'profile' | 'export' | 'quality-rule' | null;
type Notice = { type: 'success' | 'info' | 'error'; text: string };

const DATASET_TABS = [
  { id: 'preview', label: 'Preview' },
  { id: 'schema', label: 'Schema' },
  { id: 'files', label: 'Files' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'versions', label: 'Versions' },
  { id: 'quality', label: 'Quality' },
  { id: 'metadata', label: 'Metadata' },
] satisfies ReadonlyArray<{ id: Tab; label: string }>;

const TAB_IDS = new Set<Tab>(DATASET_TABS.map((t) => t.id));

function normalizeTab(value: string | null): Tab {
  return value && TAB_IDS.has(value as Tab) ? (value as Tab) : 'preview';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatBytes(bytes?: number | null) {
  if (bytes === undefined || bytes === null) return 'n/a';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value?: string | null) {
  if (!value) return 'n/a';
  return new Date(value).toLocaleString();
}

function actionReference(payload: { id?: string; rid?: string; build_id?: string; export_id?: string; status?: string; state?: string; message?: string }) {
  const ref = payload.rid ?? payload.id ?? payload.build_id ?? payload.export_id;
  const status = payload.status ?? payload.state;
  const pieces = [ref ? `ref ${ref}` : '', status ? `status ${status}` : '', payload.message ?? ''].filter(Boolean);
  return pieces.length > 0 ? ` (${pieces.join(', ')})` : '';
}

export function DatasetDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => normalizeTab(searchParams.get('tab')));

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [preview, setPreview] = useState<DatasetPreviewResponse | null>(null);
  const [schema, setSchema] = useState<DatasetSchema | null>(null);
  const [files, setFiles] = useState<DatasetFilesystemEntry[]>([]);
  const [transactions, setTransactions] = useState<DatasetTransaction[]>([]);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [quality, setQuality] = useState<DatasetQualityResponse | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Partial<Record<Tab, boolean>>>({});
  const [tabLoading, setTabLoading] = useState<Partial<Record<Tab, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportResult, setExportResult] = useState<DatasetExportResponse | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');

  const selectedTransactionId = searchParams.get('txn');
  const busy = busyAction !== null;

  useEffect(() => {
    const next = normalizeTab(searchParams.get('tab'));
    if (next !== tab) setTab(next);
  }, [searchParams, tab]);

  useEffect(() => {
    let cancelled = false;

    async function loadDataset() {
      if (!id) return;
      setLoading(true);
      setError('');
      setNotice(null);
      setPreview(null);
      setSchema(null);
      setFiles([]);
      setTransactions([]);
      setVersions([]);
      setQuality(null);
      setLoadedTabs({});
      setTabLoading({});
      try {
        const next = await getDataset(id);
        if (cancelled) return;
        setDataset(next);
        setName(next.name);
        setDescription(next.description);
        setTagsText(next.tags.join(', '));
      } catch (cause) {
        if (!cancelled) {
          setDataset(null);
          setError(cause instanceof Error ? cause.message : 'Failed to load dataset');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDataset();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!dataset) return;
    void ensureTabData(tab);
    // The data loader intentionally reads the latest tab caches from state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, tab]);

  const previewRows = preview?.rows ?? [];
  const previewColumns = useMemo(() => {
    if (preview?.columns && preview.columns.length > 0) return preview.columns;
    if (previewRows.length === 0) return [];
    return Object.keys(previewRows[0]).map((columnName) => ({ name: columnName }));
  }, [preview?.columns, previewRows]);

  async function ensureTabData(next: Tab, options: { force?: boolean } = {}) {
    if (!id) return;
    if (!options.force && loadedTabs[next]) return;

    setTabLoading((prev) => ({ ...prev, [next]: true }));
    setError('');
    try {
      if (next === 'preview') {
        const [previewResponse, txResponse] = await Promise.all([
          previewDataset(id, { limit: 100 }),
          loadedTabs.transactions ? Promise.resolve<DatasetTransaction[] | null>(null) : listDatasetTransactions(id).catch(() => null),
        ]);
        setPreview(previewResponse);
        setLoadedTabs((prev) => ({ ...prev, preview: true }));
        if (txResponse) {
          setTransactions(txResponse);
          setLoadedTabs((prev) => ({ ...prev, transactions: true }));
        }
      } else if (next === 'schema') {
        setSchema(await getDatasetSchema(id));
        setLoadedTabs((prev) => ({ ...prev, schema: true }));
      } else if (next === 'files') {
        const response = await listDatasetFilesystem(id);
        setFiles(response.entries ?? response.items ?? []);
        setLoadedTabs((prev) => ({ ...prev, files: true }));
      } else if (next === 'transactions') {
        setTransactions(await listDatasetTransactions(id));
        setLoadedTabs((prev) => ({ ...prev, transactions: true }));
      } else if (next === 'versions') {
        setVersions(await getVersions(id));
        setLoadedTabs((prev) => ({ ...prev, versions: true }));
      } else if (next === 'quality') {
        setQuality(await getDatasetQuality(id));
        setLoadedTabs((prev) => ({ ...prev, quality: true }));
      } else {
        setLoadedTabs((prev) => ({ ...prev, metadata: true }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load tab data');
    } finally {
      setTabLoading((prev) => ({ ...prev, [next]: false }));
    }
  }

  function setActiveTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'preview') params.delete('tab');
    else params.set('tab', next);
    if (next !== 'preview' && next !== 'transactions') params.delete('txn');
    setSearchParams(params);
    void ensureTabData(next);
  }

  function selectPreviewTransaction(txId: string | null) {
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    if (txId) params.set('txn', txId);
    else params.delete('txn');
    setSearchParams(params);
  }

  async function saveMetadata() {
    if (!dataset) return;
    setBusyAction('save');
    setError('');
    setNotice(null);
    try {
      const updated = await updateDataset(dataset.id, {
        name: name.trim(),
        description,
        tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setDataset(updated);
      setName(updated.name);
      setDescription(updated.description);
      setTagsText(updated.tags.join(', '));
      setNotice({ type: 'success', text: 'Dataset metadata saved.' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function removeDataset() {
    if (!dataset) return;
    setBusyAction('delete');
    setError('');
    try {
      await deleteDataset(dataset.id);
      navigate('/datasets');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
      setBusyAction(null);
      setDeleteOpen(false);
    }
  }

  async function runBuild() {
    if (!dataset) return;
    setBusyAction('build');
    setError('');
    setNotice(null);
    try {
      const response = await startDatasetBuild(dataset.id, {
        branch: dataset.active_branch,
        reason: 'manual dataset detail action',
      });
      setNotice({ type: 'success', text: `Build started${actionReference(response)}.` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Build failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshQuality() {
    if (!dataset) return;
    setBusyAction('profile');
    setError('');
    setNotice(null);
    try {
      const response = await refreshDatasetQualityProfile(dataset.id);
      setQuality(response);
      setLoadedTabs((prev) => ({ ...prev, quality: true }));
      setActiveTab('quality');
      setNotice({ type: 'success', text: 'Quality profile refreshed.' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Quality refresh failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function submitExport(params: DatasetExportParams) {
    if (!dataset) return;
    setBusyAction('export');
    setExportError('');
    setExportResult(null);
    try {
      const response = await exportDataset(dataset.id, params);
      setExportResult(response);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed');
    } finally {
      setBusyAction(null);
    }
  }

  function openExportDialog() {
    setExportOpen(true);
    setExportError('');
    setExportResult(null);
  }

  function explorePipeline() {
    if (!dataset) return;
    navigate(`/lineage?dataset=${encodeURIComponent(dataset.id)}`);
  }

  function openSqlPreview() {
    if (!dataset) return;
    navigate(`/queries?dataset=${encodeURIComponent(dataset.id)}`);
  }

  function openContour() {
    if (!dataset) return;
    navigate(`/contour?dataset=${encodeURIComponent(dataset.id)}`);
  }

  if (loading) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <p className="of-text-muted">Loading...</p>
      </section>
    );
  }

  if (!dataset) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <Link to="/datasets" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Back to datasets</Link>
        <p className="of-status-danger" style={{ marginTop: 12, padding: 10, borderRadius: 'var(--radius-md)' }}>{error || 'Not found'}</p>
      </section>
    );
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 10 }}>
      <header className="of-panel dataset-detail-header" style={{ padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <Link to="/datasets" style={{ color: 'var(--text-muted)', fontSize: 12 }}>Datasets</Link>
            <h1 className="of-heading-lg" style={{ marginTop: 4 }}>{dataset.name}</h1>
            <p className="of-text-muted" style={{ marginTop: 2, fontSize: 11, fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
              {dataset.id}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => void runBuild()} disabled={busy} className="of-button of-button--primary">
              {busyAction === 'build' ? 'Starting...' : 'Build'}
            </button>
            <button type="button" onClick={() => void refreshQuality()} disabled={busy} className="of-button">
              {busyAction === 'profile' ? 'Profiling...' : 'Profile data'}
            </button>
            <button type="button" onClick={openExportDialog} disabled={busy} className="of-button">
              Export
            </button>
            <button type="button" onClick={explorePipeline} className="of-button">
              Explore pipeline
            </button>
            <Link to={`/datasets/${dataset.id}/branches`} className="of-button">Branches</Link>
            <button type="button" onClick={() => setDeleteOpen(true)} disabled={busy} className="of-button" style={{ color: '#b42318', borderColor: '#e5b8b8' }}>
              Delete
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="of-chip">{dataset.format}</span>
          <span className="of-chip">{dataset.row_count.toLocaleString()} rows</span>
          <span className="of-chip">{formatBytes(dataset.size_bytes)}</span>
          <span className="of-chip of-chip-active">{dataset.active_branch}</span>
        </div>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {notice && (
        <div className={notice.type === 'error' ? 'of-status-danger' : notice.type === 'success' ? 'of-status-success' : 'of-status-info'} style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {notice.text}
        </div>
      )}

      <div className="dataset-detail-workspace">
        <MetadataPanel
          dataset={dataset}
          quality={quality}
          fileCount={loadedTabs.files ? files.length : undefined}
          transactionCount={loadedTabs.transactions ? transactions.length : undefined}
        />

        <section className="of-panel" style={{ minWidth: 0, overflow: 'hidden' }}>
          <Tabs tabs={DATASET_TABS} active={tab} onChange={setActiveTab} />
          {renderTabContent()}
        </section>
      </div>

      <ExportDialog
        dataset={dataset}
        open={exportOpen}
        busy={busyAction === 'export'}
        error={exportError}
        result={exportResult}
        onClose={() => setExportOpen(false)}
        onSubmit={submitExport}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete dataset"
        message={`Delete ${dataset.name}? This removes the dataset from the catalog.`}
        confirmLabel="Delete"
        danger
        busy={busyAction === 'delete'}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void removeDataset()}
      />
    </section>
  );

  function renderTabContent() {
    if (tab === 'preview') {
      return (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between', padding: 8, borderBottom: '1px solid var(--border-default)', background: 'var(--bg-topbar)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" onClick={openSqlPreview} className="of-button" style={{ fontSize: 11 }}>SQL preview</button>
              <button type="button" onClick={openContour} className="of-button" style={{ fontSize: 11 }}>Analyze data</button>
              <button type="button" onClick={explorePipeline} className="of-button" style={{ fontSize: 11 }}>Explore pipeline</button>
            </div>
            {tabLoading.preview && <span className="of-text-muted" style={{ alignSelf: 'center', fontSize: 11 }}>Refreshing preview...</span>}
          </div>
          {tabLoading.preview && !preview ? (
            <LoadingBlock label="Loading preview..." />
          ) : preview ? (
            <>
              <PreviewMessages preview={preview} />
              <VirtualizedPreviewTable
                columns={previewColumns}
                rows={previewRows}
                transactions={transactions}
                selectedTransactionId={selectedTransactionId}
                onSelectTransaction={selectPreviewTransaction}
                fileFormat={preview.format ?? null}
                schemaInferred={Boolean((preview as DatasetPreviewResponse & { schema_inferred?: boolean }).schema_inferred)}
                viewportHeight={560}
              />
            </>
          ) : (
            <EmptyBlock label="No preview data is available yet." />
          )}
        </div>
      );
    }

    if (tab === 'schema') {
      return (
        <TabBody>
          {tabLoading.schema && !schema ? <LoadingBlock label="Loading schema..." /> : schema ? <SchemaTable fields={schema.fields} /> : <EmptyBlock label="No schema is available." />}
        </TabBody>
      );
    }

    if (tab === 'files') {
      return (
        <TabBody>
          {tabLoading.files && files.length === 0 ? <LoadingBlock label="Loading files..." /> : <FilesTable files={files} />}
        </TabBody>
      );
    }

    if (tab === 'transactions') {
      return (
        <TabBody>
          {tabLoading.transactions && transactions.length === 0 ? (
            <LoadingBlock label="Loading transactions..." />
          ) : (
            <TransactionsTable transactions={transactions} selectedTransactionId={selectedTransactionId} />
          )}
        </TabBody>
      );
    }

    if (tab === 'versions') {
      return (
        <TabBody>
          {tabLoading.versions && versions.length === 0 ? <LoadingBlock label="Loading versions..." /> : <VersionsTable versions={versions} />}
        </TabBody>
      );
    }

    if (tab === 'quality') {
      return (
        <TabBody>
          <QualityDashboard
            datasetRid={dataset?.rid}
            quality={quality}
            loading={Boolean(tabLoading.quality)}
            refreshing={busyAction === 'profile'}
            onRefreshProfile={() => void refreshQuality()}
          />
        </TabBody>
      );
    }

    return (
      <TabBody>
        <div style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <label style={{ fontSize: 12 }}>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} className="of-input" style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="of-input" style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            Tags
            <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="finance, monthly, curated" className="of-input" style={{ marginTop: 4 }} />
          </label>
          <button type="button" onClick={() => void saveMetadata()} disabled={busy} className="of-button of-button--primary" style={{ width: 'fit-content' }}>
            {busyAction === 'save' ? 'Saving...' : 'Save metadata'}
          </button>
        </div>
      </TabBody>
    );
  }
}

function TabBody({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 12, minHeight: 420 }}>{children}</div>;
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="of-text-muted" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>
      {label}
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="of-text-muted" style={{ padding: 32, textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
      {label}
    </div>
  );
}

function PreviewMessages({ preview }: { preview: DatasetPreviewResponse }) {
  const warnings = preview.warnings ?? [];
  const errors = preview.errors ?? [];
  if (warnings.length === 0 && errors.length === 0 && !preview.message) return null;
  return (
    <div style={{ display: 'grid', gap: 6, padding: 8, borderBottom: '1px solid var(--border-default)' }}>
      {preview.message && <div className="of-status-info" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>{preview.message}</div>}
      {warnings.map((warning) => (
        <div key={warning} className="of-status-warning" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>{warning}</div>
      ))}
      {errors.map((previewError) => (
        <div key={previewError} className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>{previewError}</div>
      ))}
    </div>
  );
}

interface SchemaField {
  name?: string;
  type?: string | Record<string, unknown>;
  field_type?: string | Record<string, unknown>;
  data_type?: string;
  nullable?: boolean;
  description?: string;
}

function schemaFieldType(field: SchemaField) {
  const candidate = field.type ?? field.field_type ?? field.data_type;
  if (typeof candidate === 'string') return candidate;
  if (isRecord(candidate) && typeof candidate.type === 'string') return candidate.type;
  return 'n/a';
}

function normalizeSchemaFields(fields: unknown): SchemaField[] {
  if (Array.isArray(fields)) return fields.filter(isRecord).map((field) => field as SchemaField);
  if (isRecord(fields) && Array.isArray(fields.fields)) return fields.fields.filter(isRecord).map((field) => field as SchemaField);
  return [];
}

function SchemaTable({ fields }: { fields: unknown }) {
  const rows = normalizeSchemaFields(fields);
  if (rows.length === 0) {
    return (
      <pre style={{ padding: 10, background: 'var(--bg-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 2, overflow: 'auto' }}>
        {JSON.stringify(fields, null, 2)}
      </pre>
    );
  }
  return (
    <table className="of-table" style={{ fontSize: 12 }}>
      <thead>
        <tr>
          {['Name', 'Type', 'Nullable', 'Description'].map((heading) => (
            <th key={heading}>{heading}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((field, index) => (
          <tr key={`${field.name ?? 'field'}-${index}`}>
            <td style={{ fontFamily: 'var(--font-mono)' }}>{field.name ?? 'n/a'}</td>
            <td>{schemaFieldType(field)}</td>
            <td>{field.nullable === undefined ? 'n/a' : field.nullable ? 'yes' : 'no'}</td>
            <td className="of-text-muted">{field.description ?? 'n/a'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FilesTable({ files }: { files: DatasetFilesystemEntry[] }) {
  return (
    <table className="of-table">
      <thead>
        <tr><th>Path</th><th>Type</th><th>Size</th><th>Modified</th></tr>
      </thead>
      <tbody>
        {files.map((file) => (
          <tr key={file.path}>
            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, overflowWrap: 'anywhere' }}>{file.path}</td>
            <td>{file.entry_type}</td>
            <td>{formatBytes(file.size_bytes)}</td>
            <td>{formatDate(file.last_modified)}</td>
          </tr>
        ))}
        {files.length === 0 && <tr><td colSpan={4} className="of-text-muted">No files.</td></tr>}
      </tbody>
    </table>
  );
}

function TransactionsTable({ transactions, selectedTransactionId }: { transactions: DatasetTransaction[]; selectedTransactionId: string | null }) {
  return (
    <table className="of-table">
      <thead>
        <tr><th>ID</th><th>Operation</th><th>Branch</th><th>Status</th><th>Created</th><th>Committed</th><th>Summary</th></tr>
      </thead>
      <tbody>
        {transactions.map((transaction) => {
          const selected = selectedTransactionId === transaction.id;
          return (
            <tr key={transaction.id} style={{ background: selected ? 'var(--status-info-bg)' : undefined }}>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{transaction.id}</td>
              <td>{transaction.operation}</td>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{transaction.branch_name ?? 'n/a'}</td>
              <td>{transaction.status}</td>
              <td>{formatDate(transaction.created_at)}</td>
              <td>{formatDate(transaction.committed_at)}</td>
              <td className="of-text-muted">{transaction.summary || 'n/a'}</td>
            </tr>
          );
        })}
        {transactions.length === 0 && <tr><td colSpan={7} className="of-text-muted">No transactions.</td></tr>}
      </tbody>
    </table>
  );
}

function VersionsTable({ versions }: { versions: DatasetVersion[] }) {
  return (
    <table className="of-table">
      <thead>
        <tr><th>Version</th><th>Message</th><th>Rows</th><th>Size</th><th>Created</th></tr>
      </thead>
      <tbody>
        {versions.map((version) => (
          <tr key={version.id}>
            <td>v{version.version}</td>
            <td>{version.message || 'n/a'}</td>
            <td>{version.row_count.toLocaleString()}</td>
            <td>{formatBytes(version.size_bytes)}</td>
            <td>{formatDate(version.created_at)}</td>
          </tr>
        ))}
        {versions.length === 0 && <tr><td colSpan={5} className="of-text-muted">No versions.</td></tr>}
      </tbody>
    </table>
  );
}

function ExportDialog({
  dataset,
  open,
  busy,
  error,
  result,
  onClose,
  onSubmit,
}: {
  dataset: Dataset;
  open: boolean;
  busy: boolean;
  error: string;
  result: DatasetExportResponse | null;
  onClose: () => void;
  onSubmit: (params: DatasetExportParams) => void | Promise<void>;
}) {
  const [format, setFormat] = useState<DatasetExportParams['format']>('CSV');
  const [includeSchema, setIncludeSchema] = useState(true);

  useEffect(() => {
    if (!open) return;
    setFormat('CSV');
    setIncludeSchema(true);
  }, [open, dataset.id]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Export dataset" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div className="of-panel" style={{ width: '100%', maxWidth: 500, padding: 16, display: 'grid', gap: 12 }}>
        <header>
          <h2 className="of-heading-sm">Export dataset</h2>
          <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
            Create an export from branch <code>{dataset.active_branch}</code>, version <code>v{dataset.current_version}</code>.
          </p>
        </header>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value as DatasetExportParams['format'])} className="of-input">
            <option value="CSV">CSV</option>
            <option value="PARQUET">Parquet</option>
          </select>
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={includeSchema} onChange={(event) => setIncludeSchema(event.target.checked)} />
          Include schema sidecar
        </label>

        {error && <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>{error}</div>}
        {result && (
          <div className="of-status-success" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            Export requested{actionReference(result)}.
            {result.download_url && (
              <a href={result.download_url} style={{ marginLeft: 6, color: 'inherit', textDecoration: 'underline' }}>Open download</a>
            )}
          </div>
        )}

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button type="button" onClick={onClose} disabled={busy} className="of-button">Close</button>
          <button
            type="button"
            onClick={() => void onSubmit({ format, branch: dataset.active_branch, version: dataset.current_version, include_schema: includeSchema })}
            disabled={busy}
            className="of-button of-button--primary"
          >
            {busy ? 'Exporting...' : 'Start export'}
          </button>
        </footer>
      </div>
    </div>
  );
}
