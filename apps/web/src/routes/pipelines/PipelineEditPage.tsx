import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  getPipeline,
  listRuns,
  retryPipelineRun,
  triggerRun,
  updatePipeline,
  validatePipelineById,
  type Pipeline,
  type PipelineNode,
  type PipelineRun,
  type PipelineValidationResponse,
} from '@/lib/api/pipelines';
import { JsonEditor } from '@/lib/components/JsonEditor';
import { Tabs } from '@/lib/components/Tabs';
import { PipelineCanvas } from '@/lib/components/pipeline/PipelineCanvas';
import { PipelineNodeList } from '@/lib/components/pipeline/PipelineNodeList';

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function PipelineEditPage() {
  const { id = '', runId } = useParams<{ id: string; runId?: string }>();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [validation, setValidation] = useState<PipelineValidationResponse | null>(null);
  const [tab, setTab] = useState<'canvas' | 'nodes' | 'config' | 'runs' | 'validate'>(runId ? 'runs' : 'canvas');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [statusValue, setStatusValue] = useState('draft');
  const [nodesJson, setNodesJson] = useState('');
  const [scheduleJson, setScheduleJson] = useState('');
  const [retryJson, setRetryJson] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const nextPipeline = await getPipeline(id);
      setPipeline(nextPipeline);
      setName(nextPipeline.name);
      setDescription(nextPipeline.description);
      setStatusValue(nextPipeline.status);
      setNodesJson(JSON.stringify(nextPipeline.dag, null, 2));
      setScheduleJson(JSON.stringify(nextPipeline.schedule_config, null, 2));
      setRetryJson(JSON.stringify(nextPipeline.retry_policy, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns() {
    if (!id) return;
    try {
      const res = await listRuns(id, { per_page: 50 });
      setRuns(res.data);
    } catch {
      // Runs are helpful context, but the editor should still load without them.
    }
  }

  useEffect(() => {
    void load();
    void loadRuns();
  }, [id]);

  useEffect(() => {
    if (runId) setTab('runs');
  }, [runId]);

  async function save() {
    if (!pipeline) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updatePipeline(pipeline.id, {
        name,
        description,
        status: statusValue,
        nodes: parseJson<PipelineNode[]>(nodesJson, []),
        schedule_config: parseJson(scheduleJson, pipeline.schedule_config),
        retry_policy: parseJson(retryJson, pipeline.retry_policy),
      });
      setPipeline(updated);
      setNodesJson(JSON.stringify(updated.dag, null, 2));
      setScheduleJson(JSON.stringify(updated.schedule_config, null, 2));
      setRetryJson(JSON.stringify(updated.retry_policy, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!pipeline) return;
    setBusy(true);
    try {
      await triggerRun(pipeline.id);
      await loadRuns();
      setTab('runs');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Run failed');
    } finally {
      setBusy(false);
    }
  }

  async function retryRun(selectedRunId: string) {
    if (!pipeline) return;
    setBusy(true);
    try {
      await retryPipelineRun(pipeline.id, selectedRunId);
      await loadRuns();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Retry failed');
    } finally {
      setBusy(false);
    }
  }

  async function runValidate() {
    if (!pipeline) return;
    setBusy(true);
    try {
      const report = await validatePipelineById(pipeline.id);
      setValidation({
        valid: report.all_valid,
        errors: report.nodes.flatMap((node) => node.errors.map((issue) => `${node.node_id}: ${issue.message}`)),
        warnings: [],
        next_run_at: null,
        summary: { node_count: report.nodes.length, edge_count: 0, root_node_ids: [], leaf_node_ids: [] },
      });
      setTab('validate');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Validate failed');
    } finally {
      setBusy(false);
    }
  }

  const parsedNodes = parseJson<PipelineNode[]>(nodesJson, []);
  const highlightedRun = runId ? runs.find((run) => run.id === runId) : null;

  if (loading) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <p className="of-text-muted">Loading pipeline...</p>
      </section>
    );
  }

  if (!pipeline) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <Link to="/pipelines" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Back to pipelines
        </Link>
        <p className="of-status-danger" style={{ marginTop: 12 }}>
          {error || 'Pipeline not found'}
        </p>
      </section>
    );
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 10 }}>
      <header className="of-panel" style={{ display: 'grid', gap: 8, padding: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Link to="/pipelines" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Back to pipelines
            </Link>
            <h1 className="of-heading-lg" style={{ marginTop: 4 }}>
              {pipeline.name}
            </h1>
            <p className="of-text-muted" style={{ marginTop: 2, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {pipeline.id}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className="of-chip of-chip-active">{pipeline.status}</span>
            <span className="of-chip">{pipeline.pipeline_type ?? 'BATCH'}</span>
          </div>
        </div>
        <div
          className="of-toolbar"
          style={{
            borderRadius: 0,
            margin: '0 -10px -10px',
            borderRight: 0,
            borderLeft: 0,
            borderBottom: 0,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={statusValue} onChange={(event) => setStatusValue(event.target.value)} className="of-select" style={{ width: 120 }}>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
            <span className="of-text-muted" style={{ alignSelf: 'center', fontSize: 11 }}>
              {runs.length} run{runs.length === 1 ? '' : 's'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => void runValidate()} disabled={busy} className="of-button">
              Validate
            </button>
            <button type="button" onClick={() => void runNow()} disabled={busy} className="of-button">
              Run now
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className="of-button of-button--primary">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {highlightedRun && (
        <section className="of-panel" style={{ padding: 10 }}>
          <p className="of-eyebrow">Selected run</p>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            {highlightedRun.id} | {highlightedRun.status} | attempt {highlightedRun.attempt_number}
          </p>
        </section>
      )}

      <section className="of-panel" style={{ overflow: 'hidden' }}>
        <Tabs tabs={['canvas', 'nodes', 'config', 'runs', 'validate'] as const} active={tab} onChange={setTab} />

        <div style={{ padding: tab === 'canvas' ? 0 : 10 }}>
          {tab === 'canvas' && (
            <PipelineCanvas
              nodes={parsedNodes}
              status={statusValue}
              scheduleConfig={parseJson(scheduleJson, { enabled: false, cron: null })}
              onChange={(next) => setNodesJson(JSON.stringify(next, null, 2))}
            />
          )}

          {tab === 'nodes' && (
            <PipelineNodeList nodes={parsedNodes} onChange={(next) => setNodesJson(JSON.stringify(next, null, 2))} />
          )}

          {tab === 'config' && (
            <section style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12 }}>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} className="of-input" style={{ marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Description
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="of-input"
                  style={{ marginTop: 4 }}
                />
              </label>
              <JsonEditor label="Nodes JSON (DAG)" value={nodesJson} onChange={setNodesJson} minHeight={320} />
              <JsonEditor label="Schedule config JSON" value={scheduleJson} onChange={setScheduleJson} minHeight={80} />
              <JsonEditor label="Retry policy JSON" value={retryJson} onChange={setRetryJson} minHeight={80} />
            </section>
          )}

          {tab === 'runs' && (
            <table className="of-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Attempt</th>
                  <th>Trigger</th>
                  <th>Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} style={run.id === runId ? { outline: '2px solid var(--accent-default)' } : undefined}>
                    <td>{run.status}</td>
                    <td>{run.attempt_number}</td>
                    <td>{run.trigger_type}</td>
                    <td>{new Date(run.started_at).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" onClick={() => void retryRun(run.id)} disabled={busy} className="of-button" style={{ fontSize: 11 }}>
                        Retry
                      </button>
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="of-text-muted">
                      No runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'validate' && (
            <section>
              {validation ? (
                <>
                  <p className="of-eyebrow">{validation.valid ? 'Valid' : 'Invalid'}</p>
                  {validation.errors.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
                      {validation.errors.map((validationError, index) => (
                        <li key={index} style={{ color: '#b42318' }}>
                          {validationError}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="of-text-muted">Click "Validate" to run server-side DAG validation.</p>
              )}
            </section>
          )}
        </div>
      </section>
    </section>
  );
}
