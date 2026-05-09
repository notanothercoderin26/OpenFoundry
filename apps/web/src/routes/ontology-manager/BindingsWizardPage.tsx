import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { listDatasets, previewDataset, type Dataset, type DatasetPreviewResponse } from '@/lib/api/datasets';
import {
  createObjectTypeBinding,
  listObjectTypeBindings,
  listObjectTypes,
  listProperties,
  materializeObjectTypeBinding,
  type MaterializeBindingResponse,
  type ObjectType,
  type ObjectTypeBinding,
  type ObjectTypeBindingPropertyMapping,
  type ObjectTypeBindingSyncMode,
  type Property,
} from '@/lib/api/ontology';
import {
  buildAutoMapping,
  findPrimaryKeyColumn,
  getSchemaMappingIssues,
  SchemaMapper,
} from '@/lib/components/ontology/SchemaMapper';
import { Glyph } from '@/lib/components/ui/Glyph';

type Step = 1 | 2 | 3 | 4;
type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  tone: NoticeTone;
  message: string;
}

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 1, label: 'Source' },
  { id: 2, label: 'Map' },
  { id: 3, label: 'Create' },
  { id: 4, label: 'Run' },
];

const MARKINGS = ['public', 'internal', 'confidential', 'pii', 'restricted'];

function toPositiveInt(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusClass(status?: string | null) {
  const normalized = (status ?? '').toLowerCase();
  if (['ok', 'success', 'completed', 'healthy'].includes(normalized)) return 'of-status-success';
  if (['failed', 'error'].includes(normalized)) return 'of-status-danger';
  if (['warning', 'partial'].includes(normalized)) return 'of-status-warning';
  return 'of-status-info';
}

function noticeClass(tone: NoticeTone) {
  if (tone === 'success') return 'of-status-success';
  if (tone === 'error') return 'of-status-danger';
  return 'of-status-info';
}

function datasetName(datasets: Dataset[], id: string) {
  const dataset = datasets.find((item) => item.id === id);
  return dataset ? `${dataset.name} (${dataset.format})` : id;
}

export function BindingsWizardPage() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [bindings, setBindings] = useState<ObjectTypeBinding[]>([]);
  const [datasetSearch, setDatasetSearch] = useState('');

  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedBindingId, setSelectedBindingId] = useState('');

  const [preview, setPreview] = useState<DatasetPreviewResponse | null>(null);
  const [typeProperties, setTypeProperties] = useState<Property[]>([]);
  const [mapping, setMapping] = useState<ObjectTypeBindingPropertyMapping[]>([]);
  const [primaryKeyColumn, setPrimaryKeyColumn] = useState('');

  const [syncMode, setSyncMode] = useState<ObjectTypeBindingSyncMode>('snapshot');
  const [defaultMarking, setDefaultMarking] = useState('public');
  const [previewLimit, setPreviewLimit] = useState('1000');
  const [datasetBranch, setDatasetBranch] = useState('');
  const [datasetVersion, setDatasetVersion] = useState('');
  const [materializeLimit, setMaterializeLimit] = useState('1000');

  const [createdBinding, setCreatedBinding] = useState<ObjectTypeBinding | null>(null);
  const [materializeResult, setMaterializeResult] = useState<MaterializeBindingResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listObjectTypes({ per_page: 200 }),
      listDatasets({ page: 1, per_page: 200 }),
    ])
      .then(([types, datasetPage]) => {
        if (cancelled) return;
        setObjectTypes(types.data);
        setDatasets(datasetPage.data);
        setSelectedTypeId((current) => current || types.data[0]?.id || '');
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Failed to load binding inputs'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTypeId) {
      setBindings([]);
      return;
    }

    let cancelled = false;
    setBindingsLoading(true);
    listObjectTypeBindings(selectedTypeId)
      .then((response) => {
        if (!cancelled) setBindings(response.data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load bindings');
      })
      .finally(() => {
        if (!cancelled) setBindingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTypeId]);

  const filteredDatasets = useMemo(() => {
    const search = datasetSearch.trim().toLowerCase();
    if (!search) return datasets;
    return datasets.filter((dataset) => {
      const haystack = [
        dataset.name,
        dataset.description,
        dataset.format,
        dataset.rid,
        ...(dataset.tags ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }, [datasets, datasetSearch]);

  const selectedType = objectTypes.find((type) => type.id === selectedTypeId) ?? null;
  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  const activeBinding = createdBinding ?? bindings.find((binding) => binding.id === selectedBindingId) ?? null;
  const previewColumns = preview?.columns ?? [];
  const versionNumber = toPositiveInt(datasetVersion);
  const previewLimitNumber = toPositiveInt(previewLimit) ?? 1000;
  const materializeLimitNumber = toPositiveInt(materializeLimit);

  const mappingIssues = useMemo(() => getSchemaMappingIssues({
    columns: previewColumns,
    properties: typeProperties,
    objectType: selectedType,
    mapping,
    primaryKeyColumn,
  }), [mapping, previewColumns, primaryKeyColumn, selectedType, typeProperties]);

  const canCreate = Boolean(
    selectedTypeId
    && selectedDatasetId
    && preview
    && mappingIssues.length === 0,
  );

  function resetWorkingDraft(nextStep: Step = 1) {
    setPreview(null);
    setTypeProperties([]);
    setMapping([]);
    setPrimaryKeyColumn('');
    setCreatedBinding(null);
    setSelectedBindingId('');
    setMaterializeResult(null);
    setNotice(null);
    setStep(nextStep);
  }

  async function refreshBindingsFor(typeId: string) {
    if (!typeId) return [];
    const response = await listObjectTypeBindings(typeId);
    setBindings(response.data);
    return response.data;
  }

  async function loadPreviewAndProperties() {
    if (!selectedTypeId || !selectedDatasetId) {
      setError('Pick an object type and dataset.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice(null);
    try {
      const [datasetPreview, properties] = await Promise.all([
        previewDataset(selectedDatasetId, {
          limit: 25,
          branch: datasetBranch.trim() || undefined,
          version: versionNumber,
        }),
        listProperties(selectedTypeId),
      ]);
      const columns = datasetPreview.columns ?? [];
      const auto = buildAutoMapping(columns, properties);
      setPreview(datasetPreview);
      setTypeProperties(properties);
      setMapping(auto);
      setPrimaryKeyColumn(findPrimaryKeyColumn(columns, selectedType, auto));
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load dataset preview');
    } finally {
      setBusy(false);
    }
  }

  async function createBinding() {
    if (!selectedType) {
      setError('Pick an object type.');
      return;
    }

    if (!preview) {
      setError('Load a dataset preview before creating the binding.');
      return;
    }

    const issues = getSchemaMappingIssues({
      columns: previewColumns,
      properties: typeProperties,
      objectType: selectedType,
      mapping,
      primaryKeyColumn,
    });
    if (issues.length > 0) {
      setError(issues[0]);
      return;
    }

    setBusy(true);
    setError('');
    setNotice(null);
    try {
      const binding = await createObjectTypeBinding(selectedType.id, {
        dataset_id: selectedDatasetId,
        dataset_branch: datasetBranch.trim() || undefined,
        dataset_version: versionNumber,
        primary_key_column: primaryKeyColumn,
        property_mapping: mapping,
        sync_mode: syncMode,
        default_marking: defaultMarking,
        preview_limit: previewLimitNumber,
      });
      setCreatedBinding(binding);
      setSelectedBindingId(binding.id);
      setMaterializeLimit(String(binding.preview_limit));
      setNotice({ tone: 'success', message: 'Binding created.' });
      setStep(4);
      await refreshBindingsFor(selectedType.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create binding failed');
    } finally {
      setBusy(false);
    }
  }

  async function materialize(binding: ObjectTypeBinding, dryRun: boolean) {
    if (binding.sync_mode === 'view') {
      setError('View-mode bindings are read-through and cannot be materialized.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice(null);
    try {
      const result = await materializeObjectTypeBinding(binding.object_type_id, binding.id, {
        dry_run: dryRun,
        dataset_branch: datasetBranch.trim() || undefined,
        dataset_version: versionNumber,
        limit: materializeLimitNumber,
      });
      setMaterializeResult(result);
      setNotice({ tone: result.errors > 0 ? 'error' : 'success', message: dryRun ? 'Dry run finished.' : 'Materialization finished.' });
      const nextBindings = await refreshBindingsFor(binding.object_type_id);
      const refreshed = nextBindings.find((item) => item.id === binding.id);
      if (refreshed) setCreatedBinding(refreshed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Materialize failed');
    } finally {
      setBusy(false);
    }
  }

  function selectExistingBinding(binding: ObjectTypeBinding) {
    setSelectedBindingId(binding.id);
    setSelectedDatasetId(binding.dataset_id);
    setDatasetBranch(binding.dataset_branch ?? '');
    setDatasetVersion(binding.dataset_version ? String(binding.dataset_version) : '');
    setPreviewLimit(String(binding.preview_limit));
    setMaterializeLimit(String(binding.preview_limit));
    setPrimaryKeyColumn(binding.primary_key_column);
    setMapping(binding.property_mapping);
    setSyncMode(binding.sync_mode);
    setDefaultMarking(binding.default_marking);
    setCreatedBinding(binding);
    setPreview(null);
    setTypeProperties([]);
    setMaterializeResult(null);
    setNotice({ tone: 'info', message: 'Binding selected.' });
    setStep(4);
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <header className="of-panel" style={{ padding: 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <Link to="/ontology-manager" className="of-link" style={{ fontSize: 12 }}>Ontology manager</Link>
            <div>
              <h1 className="of-heading-xl">Dataset to object type bindings</h1>
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                ONTM-002 · /ontology-manager/bindings
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="of-chip">Types {objectTypes.length}</span>
            <span className="of-chip">Datasets {datasets.length}</span>
            <span className="of-chip">Bindings {bindings.length}</span>
          </div>
        </div>

        <nav aria-label="Binding steps" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STEPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStep(item.id)}
              className={step === item.id ? 'of-button of-button--primary' : 'of-button'}
              disabled={item.id > 1 && !selectedTypeId}
              style={{ minWidth: 92 }}
            >
              {item.id}. {item.label}
            </button>
          ))}
        </nav>
      </header>

      {loading && <p className="of-text-muted">Loading binding inputs...</p>}

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {notice && (
        <div className={noticeClass(notice.tone)} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {notice.message}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', alignItems: 'start' }}>
        <aside className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div>
            <p className="of-eyebrow">Current object type</p>
            <select
              value={selectedTypeId}
              onChange={(event) => {
                setSelectedTypeId(event.target.value);
                resetWorkingDraft(1);
              }}
              className="of-input"
              style={{ marginTop: 6 }}
            >
              <option value="">Pick object type</option>
              {objectTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.display_name} ({type.name})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <p className="of-eyebrow">Existing bindings</p>
            {bindingsLoading && <span className="of-text-muted" style={{ fontSize: 11 }}>Loading...</span>}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {bindings.map((binding) => (
              <button
                type="button"
                key={binding.id}
                onClick={() => selectExistingBinding(binding)}
                style={{
                  display: 'grid',
                  gap: 6,
                  padding: 10,
                  textAlign: 'left',
                  border: `1px solid ${binding.id === selectedBindingId ? '#1f5ea8' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-md)',
                  background: binding.id === selectedBindingId ? '#e8f1ff' : 'var(--bg-panel)',
                  color: 'var(--text-default)',
                }}
              >
                <strong style={{ color: 'var(--text-strong)' }}>{datasetName(datasets, binding.dataset_id)}</strong>
                <span className="of-text-muted" style={{ fontSize: 11 }}>
                  {binding.sync_mode} · {binding.property_mapping.length} mappings · last run {formatDate(binding.last_materialized_at)}
                </span>
                <span className={statusClass(binding.last_run_status)} style={{ width: 'fit-content', padding: '2px 7px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 700 }}>
                  {binding.last_run_status ?? 'not run'}
                </span>
              </button>
            ))}
            {!bindingsLoading && bindings.length === 0 && (
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No bindings for this type.</p>
            )}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 16 }}>
          {step === 1 && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div>
                <p className="of-eyebrow">Source</p>
                <h2 className="of-heading-lg" style={{ marginTop: 4 }}>Dataset selection</h2>
              </div>

              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label style={{ fontSize: 13 }}>
                  Dataset search
                  <input
                    value={datasetSearch}
                    onChange={(event) => setDatasetSearch(event.target.value)}
                    placeholder="Search datasets"
                    className="of-input"
                    style={{ marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  Dataset ({filteredDatasets.length})
                  <select
                    value={selectedDatasetId}
                    onChange={(event) => {
                      setSelectedDatasetId(event.target.value);
                      resetWorkingDraft(1);
                    }}
                    className="of-input"
                    style={{ marginTop: 4 }}
                  >
                    <option value="">Pick dataset</option>
                    {filteredDatasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>{dataset.name} · {dataset.format}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Branch
                  <input
                    value={datasetBranch}
                    onChange={(event) => setDatasetBranch(event.target.value)}
                    placeholder={selectedDataset?.active_branch ?? 'main'}
                    className="of-input"
                    style={{ marginTop: 4 }}
                  />
                </label>
                <label style={{ fontSize: 13 }}>
                  Version
                  <input
                    type="number"
                    min={1}
                    value={datasetVersion}
                    onChange={(event) => setDatasetVersion(event.target.value)}
                    placeholder={selectedDataset?.current_version ? String(selectedDataset.current_version) : ''}
                    className="of-input"
                    style={{ marginTop: 4 }}
                  />
                </label>
              </div>

              {selectedDataset && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="of-chip">Format {selectedDataset.format}</span>
                  <span className="of-chip">Rows {selectedDataset.row_count.toLocaleString()}</span>
                  <span className="of-chip">Current v{selectedDataset.current_version}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => void loadPreviewAndProperties()}
                  disabled={busy || !selectedTypeId || !selectedDatasetId}
                  className="of-button of-button--primary"
                >
                  <Glyph name="database" size={14} />
                  Load schema
                </button>
              </div>
            </section>
          )}

          {step === 2 && (
            <SchemaMapper
              columns={previewColumns}
              rows={preview?.rows}
              properties={typeProperties}
              objectType={selectedType}
              mapping={mapping}
              primaryKeyColumn={primaryKeyColumn}
              disabled={busy}
              onMappingChange={setMapping}
              onPrimaryKeyColumnChange={setPrimaryKeyColumn}
            />
          )}

          {step === 2 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setStep(1)} className="of-button">Back</button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={mappingIssues.length > 0}
                className="of-button of-button--primary"
              >
                Continue
              </button>
            </div>
          )}

          {step === 3 && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div>
                <p className="of-eyebrow">Create</p>
                <h2 className="of-heading-lg" style={{ marginTop: 4 }}>Binding configuration</h2>
              </div>

              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <label style={{ fontSize: 13 }}>
                  Sync mode
                  <select
                    value={syncMode}
                    onChange={(event) => setSyncMode(event.target.value as ObjectTypeBindingSyncMode)}
                    className="of-input"
                    style={{ marginTop: 4 }}
                  >
                    <option value="snapshot">snapshot</option>
                    <option value="incremental">incremental</option>
                    <option value="view">view</option>
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Default marking
                  <select
                    value={defaultMarking}
                    onChange={(event) => setDefaultMarking(event.target.value)}
                    className="of-input"
                    style={{ marginTop: 4 }}
                  >
                    {MARKINGS.map((marking) => (
                      <option key={marking} value={marking}>{marking}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>
                  Preview limit
                  <input
                    type="number"
                    min={1}
                    value={previewLimit}
                    onChange={(event) => {
                      setPreviewLimit(event.target.value);
                      setMaterializeLimit(event.target.value);
                    }}
                    className="of-input"
                    style={{ marginTop: 4 }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="of-chip">Object type {selectedType?.display_name ?? 'none'}</span>
                <span className="of-chip">Dataset {selectedDataset?.name ?? 'none'}</span>
                <span className="of-chip">PK source {primaryKeyColumn || 'none'}</span>
                <span className="of-chip">Mapped {mapping.length}</span>
              </div>

              {mappingIssues.length > 0 && (
                <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                  {mappingIssues[0]}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setStep(2)} className="of-button">Back</button>
                <button
                  type="button"
                  onClick={() => void createBinding()}
                  disabled={busy || !canCreate}
                  className="of-button of-button--primary"
                >
                  <Glyph name="plus" size={14} />
                  Create binding
                </button>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div>
                <p className="of-eyebrow">Run</p>
                <h2 className="of-heading-lg" style={{ marginTop: 4 }}>Materialize binding</h2>
              </div>

              {activeBinding ? (
                <>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    <span className="of-chip">Dataset {datasetName(datasets, activeBinding.dataset_id)}</span>
                    <span className="of-chip">Mode {activeBinding.sync_mode}</span>
                    <span className="of-chip">Mappings {activeBinding.property_mapping.length}</span>
                    <span className="of-chip">Last run {formatDate(activeBinding.last_materialized_at)}</span>
                  </div>

                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <label style={{ fontSize: 13 }}>
                      Run limit
                      <input
                        type="number"
                        min={1}
                        max={activeBinding.preview_limit}
                        value={materializeLimit}
                        onChange={(event) => setMaterializeLimit(event.target.value)}
                        className="of-input"
                        style={{ marginTop: 4 }}
                      />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Branch override
                      <input
                        value={datasetBranch}
                        onChange={(event) => setDatasetBranch(event.target.value)}
                        placeholder={activeBinding.dataset_branch ?? 'binding default'}
                        className="of-input"
                        style={{ marginTop: 4 }}
                      />
                    </label>
                    <label style={{ fontSize: 13 }}>
                      Version override
                      <input
                        type="number"
                        min={1}
                        value={datasetVersion}
                        onChange={(event) => setDatasetVersion(event.target.value)}
                        placeholder={activeBinding.dataset_version ? String(activeBinding.dataset_version) : 'binding default'}
                        className="of-input"
                        style={{ marginTop: 4 }}
                      />
                    </label>
                  </div>

                  {activeBinding.sync_mode === 'view' && (
                    <div className="of-status-info" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                      View-mode bindings are read-through.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => resetWorkingDraft(1)} className="of-button">New binding</button>
                    <button
                      type="button"
                      onClick={() => void materialize(activeBinding, true)}
                      disabled={busy || activeBinding.sync_mode === 'view'}
                      className="of-button"
                    >
                      <Glyph name="run" size={14} />
                      Dry run
                    </button>
                    <button
                      type="button"
                      onClick={() => void materialize(activeBinding, false)}
                      disabled={busy || activeBinding.sync_mode === 'view'}
                      className="of-button of-button--primary"
                    >
                      <Glyph name="run" size={14} />
                      Materialize
                    </button>
                  </div>
                </>
              ) : (
                <p className="of-text-muted" style={{ margin: 0 }}>Create or select a binding.</p>
              )}
            </section>
          )}

          {materializeResult && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <p className="of-eyebrow">Last materialization</p>
                  <h2 className="of-heading-lg" style={{ marginTop: 4 }}>{materializeResult.status}</h2>
                </div>
                <span className={statusClass(materializeResult.status)} style={{ height: 'fit-content', padding: '4px 9px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700 }}>
                  {materializeResult.dry_run ? 'dry run' : 'committed'}
                </span>
              </div>

              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                <span className="of-chip">Rows {materializeResult.rows_read}</span>
                <span className="of-chip">Inserted {materializeResult.inserted}</span>
                <span className="of-chip">Updated {materializeResult.updated}</span>
                <span className="of-chip">Skipped {materializeResult.skipped}</span>
                <span className="of-chip">Errors {materializeResult.errors}</span>
              </div>

              {materializeResult.error_details && materializeResult.error_details.length > 0 && (
                <pre style={{ padding: 12, background: 'var(--bg-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: 260 }}>
                  {JSON.stringify(materializeResult.error_details, null, 2)}
                </pre>
              )}
            </section>
          )}
        </main>
      </div>
    </section>
  );
}
