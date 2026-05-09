import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  createFunctionPackage,
  deleteFunctionPackage,
  getFunctionAuthoringSurface,
  listFunctionPackageMetrics,
  listFunctionPackageRuns,
  listFunctionPackages,
  listObjectTypes,
  simulateFunctionPackage,
  updateFunctionPackage,
  validateFunctionPackage,
  type FunctionAuthoringSurface,
  type FunctionAuthoringTemplate,
  type FunctionCapabilities,
  type FunctionPackage,
  type FunctionPackageMetrics,
  type FunctionPackageRun,
  type ObjectType,
} from '@/lib/api/ontology';
import { JsonEditor } from '@/lib/components/JsonEditor';
import { Glyph } from '@/lib/components/ui/Glyph';

type RunStatusFilter = 'all' | 'success' | 'failure';
type RunKindFilter = 'all' | 'simulation' | 'action';

interface PackageEditDraft {
  display_name: string;
  description: string;
  entrypoint: string;
  source: string;
  capabilities_json: string;
}

interface CreateFunctionPayload {
  name: string;
  version?: string;
  display_name?: string;
  description?: string;
  runtime: string;
  source: string;
  entrypoint?: string;
  capabilities?: Partial<FunctionCapabilities>;
}

interface CreateFunctionDraft {
  template_id: string;
  name: string;
  version: string;
  display_name: string;
  description: string;
  runtime: string;
  entrypoint: string;
  source: string;
  capabilities: FunctionCapabilities;
}

const EMPTY_AUTHORING: FunctionAuthoringSurface = {
  templates: [],
  sdk_packages: [],
  cli_commands: [],
};

const FALLBACK_RUNTIMES = ['python', 'typescript', 'javascript'];

const DEFAULT_CAPABILITIES: FunctionCapabilities = {
  allow_ontology_read: true,
  allow_ontology_write: false,
  allow_ai: false,
  allow_network: false,
  timeout_seconds: 15,
  max_source_bytes: 65536,
};

const DEFAULT_SOURCES: Record<string, string> = {
  python: `def handler(context):
    return {
        "output": {
            "parameters": context.get("parameters", {})
        }
    }`,
  typescript: `export default async function handler(context) {
  return {
    output: {
      parameters: context.parameters ?? {},
    },
  };
}`,
  javascript: `export default async function handler(context) {
  return {
    output: {
      parameters: context.parameters ?? {},
    },
  };
}`,
};

function defaultEntrypoint(runtime: string) {
  return runtime === 'python' ? 'handler' : 'default';
}

function defaultSource(runtime: string) {
  return DEFAULT_SOURCES[runtime] ?? DEFAULT_SOURCES.python;
}

function packageToDraft(pkg: FunctionPackage): PackageEditDraft {
  return {
    display_name: pkg.display_name,
    description: pkg.description,
    entrypoint: pkg.entrypoint,
    source: pkg.source,
    capabilities_json: JSON.stringify(pkg.capabilities, null, 2),
  };
}

function slugFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'function_package';
}

function draftFromTemplate(template?: FunctionAuthoringTemplate | null): CreateFunctionDraft {
  if (!template) {
    return {
      template_id: '',
      name: 'function_package',
      version: '0.1.0',
      display_name: 'Function package',
      description: '',
      runtime: 'python',
      entrypoint: 'handler',
      source: defaultSource('python'),
      capabilities: { ...DEFAULT_CAPABILITIES },
    };
  }

  return {
    template_id: template.id,
    name: slugFromName(template.display_name),
    version: '0.1.0',
    display_name: template.display_name,
    description: template.description,
    runtime: template.runtime,
    entrypoint: template.entrypoint,
    source: template.starter_source,
    capabilities: { ...template.default_capabilities },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'n/a';
  return new Date(value).toLocaleString();
}

function formatDuration(value: number | null | undefined) {
  if (value === null || value === undefined) return 'n/a';
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function statusClass(status: string) {
  if (status === 'success') return 'of-status-success';
  if (status === 'failure') return 'of-status-danger';
  return 'of-status-info';
}

function stringifyResult(value: unknown) {
  if (value === null || value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

export function FunctionsPage() {
  const [packages, setPackages] = useState<FunctionPackage[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [authoring, setAuthoring] = useState<FunctionAuthoringSurface>(EMPTY_AUTHORING);
  const [selectedId, setSelectedId] = useState('');
  const [editDraft, setEditDraft] = useState<PackageEditDraft | null>(null);
  const [runs, setRuns] = useState<FunctionPackageRun[]>([]);
  const [metrics, setMetrics] = useState<FunctionPackageMetrics | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [packageQuery, setPackageQuery] = useState('');
  const [runtimeFilter, setRuntimeFilter] = useState('all');
  const [runStatusFilter, setRunStatusFilter] = useState<RunStatusFilter>('all');
  const [runKindFilter, setRunKindFilter] = useState<RunKindFilter>('all');

  const [invocationObjectTypeId, setInvocationObjectTypeId] = useState('');
  const [invocationTargetObjectId, setInvocationTargetObjectId] = useState('');
  const [invocationJustification, setInvocationJustification] = useState('');
  const [invocationParametersJson, setInvocationParametersJson] = useState('{}');
  const [validationResult, setValidationResult] = useState<unknown>(null);
  const [simulationResult, setSimulationResult] = useState<unknown>(null);

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedId) ?? null,
    [packages, selectedId],
  );

  const runtimeOptions = useMemo(
    () => Array.from(new Set([...FALLBACK_RUNTIMES, ...authoring.templates.map((template) => template.runtime)])),
    [authoring.templates],
  );

  const filteredPackages = useMemo(() => {
    const query = packageQuery.trim().toLowerCase();
    return packages.filter((pkg) => {
      const matchesRuntime = runtimeFilter === 'all' || pkg.runtime === runtimeFilter;
      const haystack = `${pkg.name} ${pkg.display_name} ${pkg.description} ${pkg.runtime}`.toLowerCase();
      return matchesRuntime && (!query || haystack.includes(query));
    });
  }, [packages, packageQuery, runtimeFilter]);

  async function refreshPackages(preferredId?: string) {
    const response = await listFunctionPackages({ per_page: 200 });
    setPackages(response.data);
    setSelectedId((current) => {
      const preferred = preferredId && response.data.some((pkg) => pkg.id === preferredId) ? preferredId : '';
      if (preferred) return preferred;
      if (current && response.data.some((pkg) => pkg.id === current)) return current;
      return response.data[0]?.id ?? '';
    });
  }

  async function loadPage() {
    setLoading(true);
    setError('');
    try {
      const [surface, typeResponse] = await Promise.all([
        getFunctionAuthoringSurface(),
        listObjectTypes({ per_page: 200 }),
      ]);
      setAuthoring(surface);
      setObjectTypes(typeResponse.data);
      setInvocationObjectTypeId((current) => current || typeResponse.data[0]?.id || '');
      await refreshPackages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load functions');
    } finally {
      setLoading(false);
    }
  }

  async function loadSelectedContext(packageId: string) {
    setContextLoading(true);
    setError('');
    try {
      const [runResponse, metricResponse] = await Promise.all([
        listFunctionPackageRuns(packageId, {
          per_page: 50,
          status: runStatusFilter === 'all' ? undefined : runStatusFilter,
          invocation_kind: runKindFilter === 'all' ? undefined : runKindFilter,
        }),
        listFunctionPackageMetrics(packageId),
      ]);
      setRuns(runResponse.data);
      setMetrics(metricResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load function package context');
      setRuns([]);
      setMetrics(null);
    } finally {
      setContextLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedPackage) {
      setEditDraft(null);
      setRuns([]);
      setMetrics(null);
      return;
    }
    setEditDraft(packageToDraft(selectedPackage));
    setValidationResult(null);
    setSimulationResult(null);
  }, [selectedPackage]);

  useEffect(() => {
    if (!selectedId) return;
    void loadSelectedContext(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, runStatusFilter, runKindFilter]);

  async function handleCreate(payload: CreateFunctionPayload) {
    setError('');
    const created = await createFunctionPackage(payload);
    setCreateOpen(false);
    setSuccess(`${created.display_name} created.`);
    await refreshPackages(created.id);
  }

  async function saveSelectedPackage() {
    if (!selectedPackage || !editDraft) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await updateFunctionPackage(selectedPackage.id, {
        display_name: editDraft.display_name.trim() || selectedPackage.name,
        description: editDraft.description.trim(),
        source: editDraft.source,
        entrypoint: editDraft.entrypoint.trim() || defaultEntrypoint(selectedPackage.runtime),
        capabilities: parseJsonObject(editDraft.capabilities_json, 'Capabilities') as Partial<FunctionCapabilities>,
      });
      setSuccess('Function package updated.');
      await refreshPackages(selectedPackage.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedPackage() {
    if (!selectedPackage) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this function package?')) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await deleteFunctionPackage(selectedPackage.id);
      setSuccess('Function package deleted.');
      await refreshPackages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  function buildInvocationBody(requireObjectType: boolean) {
    if (requireObjectType && !invocationObjectTypeId) throw new Error('Object type is required for simulation');
    return {
      object_type_id: invocationObjectTypeId || undefined,
      target_object_id: invocationTargetObjectId.trim() || undefined,
      parameters: parseJsonObject(invocationParametersJson, 'Parameters'),
      justification: invocationJustification.trim() || undefined,
    };
  }

  async function validateSelectedPackage() {
    if (!selectedPackage) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await validateFunctionPackage(selectedPackage.id, buildInvocationBody(false));
      setValidationResult(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Validation failed');
    } finally {
      setBusy(false);
    }
  }

  async function simulateSelectedPackage() {
    if (!selectedPackage) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const body = buildInvocationBody(true);
      const response = await simulateFunctionPackage(selectedPackage.id, {
        ...body,
        object_type_id: invocationObjectTypeId,
      });
      setSimulationResult(response);
      await loadSelectedContext(selectedPackage.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Simulation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <header className="of-panel" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>ONT-016</p>
          <h1 className="of-heading-xl" style={{ margin: '2px 0 0' }}>Functions</h1>
          <p className="of-text-muted" style={{ margin: '4px 0 0', maxWidth: 720 }}>
            Author function packages for ontology actions, validate invocation payloads, simulate runs, and inspect package telemetry.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void loadPage()} disabled={loading || busy} className="of-button">
            Refresh
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="of-button of-button--primary">
            <Glyph name="plus" size={14} />
            Function
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, alignItems: 'start' }}>
        <section className="of-panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 16, display: 'grid', gap: 12, borderBottom: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <p className="of-eyebrow" style={{ margin: 0 }}>Packages</p>
                <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{packages.length} registered</p>
              </div>
              <span className="of-chip of-status-info">{runtimeOptions.length} runtimes</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', gap: 8 }}>
              <input
                value={packageQuery}
                onChange={(event) => setPackageQuery(event.target.value)}
                className="of-input"
                placeholder="Search functions"
                aria-label="Search functions"
              />
              <select
                value={runtimeFilter}
                onChange={(event) => setRuntimeFilter(event.target.value)}
                className="of-input"
                aria-label="Runtime filter"
              >
                <option value="all">All runtimes</option>
                {runtimeOptions.map((runtime) => (
                  <option key={runtime} value={runtime}>{runtime}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading functions...</div>
          ) : filteredPackages.length === 0 ? (
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <p className="of-text-muted" style={{ margin: 0 }}>No function packages match the current filters.</p>
              <button type="button" onClick={() => setCreateOpen(true)} className="of-button of-button--primary" style={{ justifySelf: 'start' }}>
                <Glyph name="plus" size={14} />
                Function
              </button>
            </div>
          ) : (
            <div className="of-scrollbar" style={{ maxHeight: 620, overflow: 'auto' }}>
              <table className="of-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Runtime</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.map((pkg) => (
                    <tr
                      key={pkg.id}
                      onClick={() => setSelectedId(pkg.id)}
                      style={{
                        cursor: 'pointer',
                        background: pkg.id === selectedId ? '#eaf1fe' : undefined,
                      }}
                    >
                      <td>
                        <strong style={{ color: 'var(--text-strong)' }}>{pkg.display_name}</strong>
                        <div className="of-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {pkg.name} - v{pkg.version}
                        </div>
                      </td>
                      <td><span className="of-chip">{pkg.runtime}</span></td>
                      <td>{formatDate(pkg.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={{ display: 'grid', gap: 16 }}>
          {!selectedPackage || !editDraft ? (
            <section className="of-panel" style={{ padding: 16 }}>
              <p className="of-text-muted" style={{ margin: 0 }}>Select a function package to inspect its definition and runs.</p>
            </section>
          ) : (
            <>
              <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                  <div>
                    <p className="of-eyebrow" style={{ margin: 0 }}>Selected package</p>
                    <h2 className="of-heading-lg" style={{ margin: '2px 0 0' }}>{selectedPackage.display_name}</h2>
                    <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
                      {selectedPackage.name} - v{selectedPackage.version} - {selectedPackage.runtime}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="of-chip">{selectedPackage.entrypoint}</span>
                    <span className="of-chip of-status-info">{selectedPackage.runtime}</span>
                  </div>
                </div>

                {metrics && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                    <Metric label="Runs" value={String(metrics.total_runs)} />
                    <Metric label="Success" value={`${Math.round(metrics.success_rate * 100)}%`} />
                    <Metric label="Avg duration" value={formatDuration(metrics.avg_duration_ms)} />
                    <Metric label="Last run" value={formatDate(metrics.last_run_at)} />
                  </div>
                )}

                <div className="of-divider" />

                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>Display name</span>
                      <input
                        value={editDraft.display_name}
                        onChange={(event) => setEditDraft((draft) => draft && { ...draft, display_name: event.target.value })}
                        className="of-input"
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>Entrypoint</span>
                      <select
                        value={editDraft.entrypoint}
                        onChange={(event) => setEditDraft((draft) => draft && { ...draft, entrypoint: event.target.value })}
                        className="of-input"
                      >
                        <option value="handler">handler</option>
                        <option value="default">default</option>
                      </select>
                    </label>
                  </div>

                  <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>Description</span>
                    <textarea
                      value={editDraft.description}
                      onChange={(event) => setEditDraft((draft) => draft && { ...draft, description: event.target.value })}
                      className="of-input"
                      rows={3}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>Source</span>
                    <textarea
                      value={editDraft.source}
                      onChange={(event) => setEditDraft((draft) => draft && { ...draft, source: event.target.value })}
                      className="of-input"
                      spellCheck={false}
                      style={{ minHeight: 260, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
                    />
                  </label>

                  <JsonEditor
                    label="Capabilities JSON"
                    value={editDraft.capabilities_json}
                    onChange={(value) => setEditDraft((draft) => draft && { ...draft, capabilities_json: value })}
                    minHeight={130}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => void deleteSelectedPackage()} disabled={busy} className="of-button of-btn-danger">
                      Delete
                    </button>
                    <button type="button" onClick={() => void saveSelectedPackage()} disabled={busy} className="of-button of-button--primary">
                      {busy ? 'Saving...' : 'Save package'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <p className="of-eyebrow" style={{ margin: 0 }}>Invocation</p>
                    <h3 className="of-heading-sm" style={{ margin: '2px 0 0' }}>Validate and simulate</h3>
                  </div>
                  {contextLoading && <span className="of-text-muted" style={{ fontSize: 12 }}>Refreshing runs...</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>Object type</span>
                    <select value={invocationObjectTypeId} onChange={(event) => setInvocationObjectTypeId(event.target.value)} className="of-input">
                      <option value="">Select object type</option>
                      {objectTypes.map((type) => (
                        <option key={type.id} value={type.id}>{type.display_name || type.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>Target object id</span>
                    <input
                      value={invocationTargetObjectId}
                      onChange={(event) => setInvocationTargetObjectId(event.target.value)}
                      className="of-input"
                      placeholder="optional"
                    />
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>Justification</span>
                  <input
                    value={invocationJustification}
                    onChange={(event) => setInvocationJustification(event.target.value)}
                    className="of-input"
                    placeholder="optional"
                  />
                </label>

                <JsonEditor
                  label="Parameters JSON"
                  value={invocationParametersJson}
                  onChange={setInvocationParametersJson}
                  minHeight={100}
                  validate={(parsed) => (isRecord(parsed) ? null : 'Parameters must be a JSON object')}
                />

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => void validateSelectedPackage()} disabled={busy} className="of-button">
                    Validate
                  </button>
                  <button type="button" onClick={() => void simulateSelectedPackage()} disabled={busy || !invocationObjectTypeId} className="of-button of-button--primary">
                    Simulate
                  </button>
                </div>

                {(validationResult !== null || simulationResult !== null) && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {validationResult !== null && <ResultBlock title="Validation result" value={validationResult} />}
                    {simulationResult !== null && <ResultBlock title="Simulation result" value={simulationResult} />}
                  </div>
                )}
              </section>

              <section className="of-panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--border-default)' }}>
                  <div>
                    <p className="of-eyebrow" style={{ margin: 0 }}>Recent runs</p>
                    <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{runs.length} loaded</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select value={runStatusFilter} onChange={(event) => setRunStatusFilter(event.target.value as RunStatusFilter)} className="of-input" style={{ width: 130 }}>
                      <option value="all">All statuses</option>
                      <option value="success">Success</option>
                      <option value="failure">Failure</option>
                    </select>
                    <select value={runKindFilter} onChange={(event) => setRunKindFilter(event.target.value as RunKindFilter)} className="of-input" style={{ width: 130 }}>
                      <option value="all">All kinds</option>
                      <option value="simulation">Simulation</option>
                      <option value="action">Action</option>
                    </select>
                  </div>
                </div>

                {runs.length === 0 ? (
                  <div style={{ padding: 16, color: 'var(--text-muted)' }}>No runs for this package yet.</div>
                ) : (
                  <div className="of-scrollbar" style={{ overflow: 'auto' }}>
                    <table className="of-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Kind</th>
                          <th>Duration</th>
                          <th>Started</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((run) => (
                          <tr key={run.id}>
                            <td><span className={`of-chip ${statusClass(run.status)}`}>{run.status}</span></td>
                            <td>{run.invocation_kind}</td>
                            <td>{formatDuration(run.duration_ms)}</td>
                            <td>{formatDate(run.started_at)}</td>
                            <td className="of-text-muted">{run.error_message ?? 'n/a'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <CreateFunctionModal
        open={createOpen}
        surface={authoring}
        runtimeOptions={runtimeOptions}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 10 }}>
      <p className="of-eyebrow" style={{ margin: 0 }}>{label}</p>
      <strong style={{ display: 'block', marginTop: 4, color: 'var(--text-strong)' }}>{value}</strong>
    </div>
  );
}

function ResultBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <p className="of-eyebrow" style={{ margin: 0 }}>{title}</p>
      <pre style={{ margin: 0, padding: 12, background: '#111827', color: '#d1fae5', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: 260, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        {stringifyResult(value)}
      </pre>
    </div>
  );
}

function CreateFunctionModal({
  open,
  surface,
  runtimeOptions,
  onClose,
  onCreate,
}: {
  open: boolean;
  surface: FunctionAuthoringSurface;
  runtimeOptions: string[];
  onClose: () => void;
  onCreate: (payload: CreateFunctionPayload) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CreateFunctionDraft>(() => draftFromTemplate(surface.templates[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(draftFromTemplate(surface.templates[0]));
    setBusy(false);
    setError('');
  }, [open, surface]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, busy, onClose]);

  if (!open) return null;

  function selectTemplate(templateId: string) {
    const template = surface.templates.find((item) => item.id === templateId) ?? null;
    setDraft(draftFromTemplate(template));
  }

  function setRuntime(runtime: string) {
    setDraft((current) => ({
      ...current,
      template_id: '',
      runtime,
      entrypoint: defaultEntrypoint(runtime),
      source: current.source.trim() ? current.source : defaultSource(runtime),
    }));
  }

  function patchCapability<K extends keyof FunctionCapabilities>(key: K, value: FunctionCapabilities[K]) {
    setDraft((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        [key]: value,
      },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!draft.name.trim()) throw new Error('Name is required');
      if (!draft.source.trim()) throw new Error('Source is required');
      await onCreate({
        name: slugFromName(draft.name),
        version: draft.version.trim() || undefined,
        display_name: draft.display_name.trim() || undefined,
        description: draft.description.trim() || undefined,
        runtime: draft.runtime,
        source: draft.source,
        entrypoint: draft.entrypoint || defaultEntrypoint(draft.runtime),
        capabilities: draft.capabilities,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(31, 37, 45, 0.46)',
      }}
    >
      <form
        onSubmit={(event) => void submit(event)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-function-title"
        className="of-panel"
        style={{ width: 'min(900px, 100%)', maxHeight: 'min(92vh, 860px)', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-default)' }}>
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>ONT-016</p>
            <h2 id="create-function-title" className="of-heading-sm" style={{ margin: 0 }}>New function</h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy} aria-label="Close">
            <Glyph name="x" size={15} />
          </button>
        </header>

        <div className="of-scrollbar" style={{ padding: 16, display: 'grid', gap: 12, overflow: 'auto' }}>
          {error && (
            <div role="alert" className="of-status-danger" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)' }}>
              {error}
            </div>
          )}

          {surface.templates.length > 0 && (
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Template</span>
              <select value={draft.template_id} onChange={(event) => selectTemplate(event.target.value)} className="of-input">
                <option value="">Custom</option>
                {surface.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Name</span>
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="of-input" required autoFocus />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Version</span>
              <input value={draft.version} onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))} className="of-input" />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Runtime</span>
              <select value={draft.runtime} onChange={(event) => setRuntime(event.target.value)} className="of-input">
                {runtimeOptions.map((runtime) => (
                  <option key={runtime} value={runtime}>{runtime}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Entrypoint</span>
              <select value={draft.entrypoint} onChange={(event) => setDraft((current) => ({ ...current, entrypoint: event.target.value }))} className="of-input">
                <option value="handler">handler</option>
                <option value="default">default</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Display name</span>
            <input value={draft.display_name} onChange={(event) => setDraft((current) => ({ ...current, display_name: event.target.value }))} className="of-input" />
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Description</span>
            <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="of-input" rows={3} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <CapabilityToggle label="Ontology read" checked={draft.capabilities.allow_ontology_read} onChange={(checked) => patchCapability('allow_ontology_read', checked)} />
            <CapabilityToggle label="Ontology write" checked={draft.capabilities.allow_ontology_write} onChange={(checked) => patchCapability('allow_ontology_write', checked)} />
            <CapabilityToggle label="AI" checked={draft.capabilities.allow_ai} onChange={(checked) => patchCapability('allow_ai', checked)} />
            <CapabilityToggle label="Network" checked={draft.capabilities.allow_network} onChange={(checked) => patchCapability('allow_network', checked)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Timeout seconds</span>
              <input
                type="number"
                min={1}
                value={draft.capabilities.timeout_seconds}
                onChange={(event) => patchCapability('timeout_seconds', Number(event.target.value))}
                className="of-input"
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Max source bytes</span>
              <input
                type="number"
                min={1}
                value={draft.capabilities.max_source_bytes}
                onChange={(event) => patchCapability('max_source_bytes', Number(event.target.value))}
                className="of-input"
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Source</span>
            <textarea
              value={draft.source}
              onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
              className="of-input"
              spellCheck={false}
              style={{ minHeight: 260, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
              required
            />
          </label>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border-default)', background: 'var(--bg-panel-muted)' }}>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="of-button of-button--primary" disabled={busy || !draft.name.trim() || !draft.source.trim()}>
            {busy ? 'Creating...' : 'Create function'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function CapabilityToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '8px 10px', fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span style={{ fontWeight: 600 }}>{label}</span>
    </label>
  );
}
