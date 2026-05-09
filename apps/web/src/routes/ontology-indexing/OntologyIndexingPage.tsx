import { useEffect, useState } from 'react';

import { listDatasets, type Dataset } from '@/lib/api/datasets';
import {
  createOntologyFunnelSource,
  deleteOntologyFunnelSource,
  getOntologyFunnelHealth,
  listLinkTypes,
  listObjectTypes,
  listOntologyFunnelRuns,
  listOntologyFunnelSources,
  listProperties,
  reindexOntologyType,
  triggerOntologyFunnelRun,
  updateOntologyFunnelSource,
  type LinkType,
  type ObjectType,
  type OntologyFunnelHealthSummary,
  type OntologyFunnelPropertyMapping,
  type OntologyFunnelRun,
  type OntologyFunnelSource,
  type Property,
} from '@/lib/api/ontology';
import { listPipelines, type Pipeline } from '@/lib/api/pipelines';
import { useCurrentUser } from '@stores/auth';

interface SourceDraft {
  id?: string;
  name: string;
  description: string;
  object_type_id: string;
  dataset_id: string;
  pipeline_id: string;
  dataset_branch: string;
  preview_limit: string;
  default_marking: string;
  status: string;
  property_mappings: OntologyFunnelPropertyMapping[];
}

const REINDEX_PERMISSION = 'ontology.types.reindex';

function emptyDraft(typeId = ''): SourceDraft {
  return {
    name: 'New funnel source',
    description: '',
    object_type_id: typeId,
    dataset_id: '',
    pipeline_id: '',
    dataset_branch: 'main',
    preview_limit: '100',
    default_marking: 'public',
    status: 'active',
    property_mappings: [],
  };
}

function reindexPermissionGranted(permissions: string[], roles: string[]) {
  return (
    roles.includes('admin') ||
    permissions.includes(REINDEX_PERMISSION) ||
    permissions.includes('ontology.*') ||
    permissions.includes('*')
  );
}

export function OntologyIndexingPage() {
  const currentUser = useCurrentUser();
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkType[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [sources, setSources] = useState<OntologyFunnelSource[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [runs, setRuns] = useState<OntologyFunnelRun[]>([]);
  const [health, setHealth] = useState<OntologyFunnelHealthSummary | null>(null);
  const [staleAfterHours, setStaleAfterHours] = useState(48);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [reindexTypeId, setReindexTypeId] = useState('');
  const [reindexPageSize, setReindexPageSize] = useState('500');
  const [reindexing, setReindexing] = useState(false);
  const [reindexNotice, setReindexNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [draft, setDraft] = useState<SourceDraft>(emptyDraft());
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canReindex = currentUser ? reindexPermissionGranted(currentUser.permissions, currentUser.roles) : true;
  const selectedReindexType = objectTypes.find((item) => item.id === reindexTypeId) ?? null;
  const selectedReindexHealth = health?.sources.find((item) => item.source.object_type_id === reindexTypeId) ?? null;
  const selectedReindexSources = sources.filter((item) => item.object_type_id === reindexTypeId);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const [typeRes, linkRes, datasetRes, pipelineRes, sourceRes, healthRes] = await Promise.all([
        listObjectTypes({ page: 1, per_page: 200 }),
        listLinkTypes({ page: 1, per_page: 200 }).catch(() => ({ data: [], total: 0 })),
        listDatasets({ per_page: 200 }),
        listPipelines({ page: 1, per_page: 200 }).catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
        listOntologyFunnelSources({ page: 1, per_page: 200 }),
        getOntologyFunnelHealth({ stale_after_hours: staleAfterHours }).catch(() => null),
      ]);
      setObjectTypes(typeRes.data);
      setLinkTypes(linkRes.data);
      setDatasets(datasetRes.data);
      setPipelines(pipelineRes.data);
      setSources(sourceRes.data);
      setHealth(healthRes);
      if (!selectedSourceId && sourceRes.data[0]) {
        setSelectedSourceId(sourceRes.data[0].id);
      }
      if (!reindexTypeId && typeRes.data[0]) {
        setReindexTypeId(typeRes.data[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load ontology indexing');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSourceId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const runRes = await listOntologyFunnelRuns(selectedSourceId, { page: 1, per_page: 20 });
        if (!cancelled) setRuns(runRes.data);
        const source = sources.find((s) => s.id === selectedSourceId);
        if (source) {
          setDraft({
            id: source.id,
            name: source.name,
            description: source.description,
            object_type_id: source.object_type_id,
            dataset_id: source.dataset_id,
            pipeline_id: source.pipeline_id ?? '',
            dataset_branch: source.dataset_branch ?? 'main',
            preview_limit: String(source.preview_limit),
            default_marking: source.default_marking,
            status: source.status,
            property_mappings: source.property_mappings,
          });
          if (!cancelled) {
            const props = await listProperties(source.object_type_id);
            if (!cancelled) setProperties(props);
          }
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load source');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedSourceId, sources]);

  useEffect(() => {
    if (!draft.object_type_id) {
      setProperties([]);
      return;
    }
    let cancelled = false;
    async function loadDraftProperties() {
      const props = await listProperties(draft.object_type_id).catch(() => []);
      if (!cancelled) setProperties(props);
    }
    void loadDraftProperties();
    return () => {
      cancelled = true;
    };
  }, [draft.object_type_id]);

  async function saveSource() {
    setError('');
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        object_type_id: draft.object_type_id,
        dataset_id: draft.dataset_id,
        pipeline_id: draft.pipeline_id || null,
        dataset_branch: draft.dataset_branch || null,
        preview_limit: Number(draft.preview_limit),
        default_marking: draft.default_marking,
        status: draft.status,
        property_mappings: draft.property_mappings,
      };
      const saved = draft.id
        ? await updateOntologyFunnelSource(draft.id, payload)
        : await createOntologyFunnelSource(payload);
      setSelectedSourceId(saved.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save source');
    }
  }

  async function removeSource() {
    if (!draft.id) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this funnel source?')) return;
    setError('');
    try {
      await deleteOntologyFunnelSource(draft.id);
      setSelectedSourceId('');
      setDraft(emptyDraft(objectTypes[0]?.id ?? ''));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete source');
    }
  }

  async function triggerRun() {
    if (!draft.id) return;
    setRunning(true);
    setError('');
    try {
      await triggerOntologyFunnelRun(draft.id, {
        trigger_context: { triggered_from: 'ontology-indexing-page' },
      });
      await refresh();
      if (selectedSourceId) {
        const runRes = await listOntologyFunnelRuns(selectedSourceId, { page: 1, per_page: 20 });
        setRuns(runRes.data);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to trigger run');
    } finally {
      setRunning(false);
    }
  }

  async function triggerReindex() {
    if (!reindexTypeId) {
      setReindexNotice({ type: 'error', message: 'Select an object type before reindexing.' });
      return;
    }
    if (!canReindex) {
      setReindexNotice({ type: 'error', message: `Missing permission: ${REINDEX_PERMISSION}.` });
      return;
    }

    setReindexing(true);
    setReindexNotice(null);
    try {
      const pageSize = Number(reindexPageSize);
      const result = await reindexOntologyType(reindexTypeId, {
        page_size: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : undefined,
        trigger_context: { triggered_from: 'ontology-indexing-page' },
      });
      const job = result.job_id ?? result.request_id;
      const typeLabel = selectedReindexType?.display_name ?? selectedReindexType?.name ?? reindexTypeId;
      setReindexNotice({
        type: 'success',
        message: job ? `Reindex requested for ${typeLabel}. Job ${job}.` : `Reindex requested for ${typeLabel}.`,
      });
      await refresh();
    } catch (cause) {
      setReindexNotice({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'Failed to trigger reindexing',
      });
    } finally {
      setReindexing(false);
    }
  }

  function addMapping() {
    setDraft((d) => ({
      ...d,
      property_mappings: [...d.property_mappings, { source_field: '', target_property: '' }],
    }));
  }

  function updateMapping(index: number, patch: Partial<OntologyFunnelPropertyMapping>) {
    setDraft((d) => ({
      ...d,
      property_mappings: d.property_mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));
  }

  function removeMapping(index: number) {
    setDraft((d) => ({
      ...d,
      property_mappings: d.property_mappings.filter((_, i) => i !== index),
    }));
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <header>
        <h1 className="of-heading-xl">Ontology indexing</h1>
        <p className="of-text-muted" style={{ marginTop: 4 }}>
          Configure ontology funnel sources that hydrate object types from datasets, manage property mappings, monitor
          health and trigger runs.
        </p>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && <p className="of-text-muted">Loading…</p>}

      {health && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Funnel health</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13 }}>
              Stale after (hours):
              <input
                type="number"
                value={staleAfterHours}
                onChange={(e) => setStaleAfterHours(Number(e.target.value) || 48)}
                onBlur={() => void refresh()}
                className="of-input"
                style={{ marginLeft: 6, width: 80 }}
              />
            </label>
            <span className="of-chip">Sources {health.total_sources}</span>
            <span className="of-chip" style={{ background: '#ecfdf5', color: '#047857' }}>Active {health.active_sources}</span>
            <span className="of-chip" style={{ background: '#fffbeb', color: '#b45309' }}>Stale {health.stale_sources}</span>
            <span className="of-chip" style={{ background: '#fef2f2', color: '#b91c1c' }}>Failing {health.failing_sources}</span>
            <span className="of-chip">Success rate {(health.success_rate * 100).toFixed(0)}%</span>
            <span className="of-chip">Rows read {health.rows_read}</span>
          </div>
        </section>
      )}

      <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="of-eyebrow">Reindex</p>
            <h2 className="of-heading-lg" style={{ marginTop: 4 }}>Object type index refresh</h2>
            <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 720 }}>
              Trigger a type-scoped reindex job for the search projections backed by the ontology indexer.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void triggerReindex()}
            disabled={reindexing || !reindexTypeId || !canReindex}
            className="of-button of-button--primary"
          >
            {reindexing ? 'Reindexing…' : 'Reindex'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label style={{ fontSize: 13 }}>
            Object type
            <select
              value={reindexTypeId}
              onChange={(event) => {
                setReindexTypeId(event.target.value);
                setReindexNotice(null);
              }}
              className="of-input"
              style={{ marginTop: 4 }}
            >
              <option value="">—</option>
              {objectTypes.map((objectType) => (
                <option key={objectType.id} value={objectType.id}>{objectType.display_name}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Page size
            <input
              type="number"
              min={1}
              value={reindexPageSize}
              onChange={(event) => setReindexPageSize(event.target.value)}
              className="of-input"
              style={{ marginTop: 4 }}
            />
          </label>
        </div>

        {!canReindex && (
          <div className="of-status-warning" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            Missing permission: {REINDEX_PERMISSION}.
          </div>
        )}

        {reindexNotice && (
          <div
            className={reindexNotice.type === 'success' ? 'of-status-success' : 'of-status-danger'}
            style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
          >
            {reindexNotice.message}
          </div>
        )}

        {selectedReindexType && (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <span className="of-chip">Type {selectedReindexType.name}</span>
            <span className="of-chip">Sources {selectedReindexSources.length}</span>
            <span className="of-chip">Rows read {selectedReindexHealth?.rows_read ?? 0}</span>
            <span className="of-chip">Health {selectedReindexHealth?.health_status ?? 'unknown'}</span>
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Sources</p>
          <button
            type="button"
            onClick={() => {
              setSelectedSourceId('');
              setDraft(emptyDraft(objectTypes[0]?.id ?? ''));
            }}
            className="of-button"
            style={{ marginTop: 8, fontSize: 12 }}
          >
            New source
          </button>
          <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
            {sources.map((s) => {
              const active = s.id === selectedSourceId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSourceId(s.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${active ? '#1d4ed8' : 'var(--border-default)'}`,
                      background: active ? '#eff6ff' : 'transparent',
                      cursor: 'pointer',
                      marginBottom: 4,
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>{s.name}</strong>
                    <p className="of-text-muted" style={{ fontSize: 11 }}>{s.status} · {s.object_type_id.slice(0, 8)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Source draft</p>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <label style={{ fontSize: 13 }}>
              Name
              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="of-input" style={{ marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13 }}>
              Description
              <textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className="of-input" style={{ marginTop: 4, minHeight: 60 }} />
            </label>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <label style={{ fontSize: 13 }}>
                Object type
                <select value={draft.object_type_id} onChange={(e) => setDraft((d) => ({ ...d, object_type_id: e.target.value }))} className="of-input" style={{ marginTop: 4 }}>
                  <option value="">—</option>
                  {objectTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.display_name}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Dataset
                <select value={draft.dataset_id} onChange={(e) => setDraft((d) => ({ ...d, dataset_id: e.target.value }))} className="of-input" style={{ marginTop: 4 }}>
                  <option value="">—</option>
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Pipeline
                <select value={draft.pipeline_id} onChange={(e) => setDraft((d) => ({ ...d, pipeline_id: e.target.value }))} className="of-input" style={{ marginTop: 4 }}>
                  <option value="">— none —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Branch
                <input value={draft.dataset_branch} onChange={(e) => setDraft((d) => ({ ...d, dataset_branch: e.target.value }))} className="of-input" style={{ marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Preview limit
                <input value={draft.preview_limit} onChange={(e) => setDraft((d) => ({ ...d, preview_limit: e.target.value }))} className="of-input" style={{ marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Default marking
                <input value={draft.default_marking} onChange={(e) => setDraft((d) => ({ ...d, default_marking: e.target.value }))} className="of-input" style={{ marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13 }}>
                Status
                <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} className="of-input" style={{ marginTop: 4 }}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </label>
            </div>

            <p className="of-eyebrow" style={{ marginTop: 8 }}>Property mappings</p>
            <div style={{ display: 'grid', gap: 6 }}>
              {draft.property_mappings.map((m, i) => (
                <div key={i} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <input
                    placeholder="source_field"
                    value={m.source_field}
                    onChange={(e) => updateMapping(i, { source_field: e.target.value })}
                    className="of-input"
                  />
                  <select
                    value={m.target_property}
                    onChange={(e) => updateMapping(i, { target_property: e.target.value })}
                    className="of-input"
                  >
                    <option value="">target_property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeMapping(i)} className="of-button" style={{ fontSize: 11 }}>×</button>
                </div>
              ))}
              <button type="button" onClick={addMapping} className="of-button" style={{ fontSize: 12, width: 'fit-content' }}>+ Add mapping</button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button type="button" onClick={() => void saveSource()} className="of-button of-button--primary">
                {draft.id ? 'Update' : 'Create'}
              </button>
              {draft.id && (
                <>
                  <button type="button" onClick={() => void triggerRun()} disabled={running} className="of-button">
                    {running ? 'Running…' : 'Trigger run'}
                  </button>
                  <button type="button" onClick={() => void removeSource()} className="of-button" style={{ color: '#b91c1c', borderColor: '#fecaca' }}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {runs.length > 0 && (
        <section className="of-panel" style={{ padding: 16 }}>
          <p className="of-eyebrow">Recent runs ({runs.length})</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 12 }}>
            <thead style={{ background: 'var(--bg-subtle)' }}>
              <tr>
                {['Started', 'Status', 'Trigger', 'Rows', 'Inserted', 'Updated', 'Errors'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>{new Date(r.started_at).toLocaleString()}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>{r.status}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>{r.trigger_type}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>{r.rows_read}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>{r.inserted_count}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>{r.updated_count}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>{r.error_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {linkTypes.length > 0 && (
        <p className="of-text-muted" style={{ fontSize: 11 }}>
          {linkTypes.length} link types registered (used for upstream graph hydration).
        </p>
      )}
    </section>
  );
}
