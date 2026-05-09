import { useEffect, useState } from 'react';

import {
  applyRule,
  createRule,
  deleteRule,
  getMachineryInsights,
  getMachineryQueue,
  listObjectTypes,
  listRules,
  simulateRule,
  updateRule,
  type MachineryInsight,
  type MachineryQueueResponse,
  type ObjectType,
  type OntologyRule,
  type RuleEffectSpec,
  type RuleTriggerSpec,
} from '@/lib/api/ontology';
import {
  listWorkflowApprovals,
  listWorkflowRuns,
  listWorkflows,
  type WorkflowApproval,
  type WorkflowDefinition,
  type WorkflowRun,
} from '@/lib/api/workflows';
import { JsonEditor } from '@/lib/components/JsonEditor';
import { Drawer } from '@/lib/components/ui/Drawer';

interface RuleDraft {
  id?: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  evaluation_mode: 'advisory' | 'automatic';
  trigger_text: string;
  effect_text: string;
}

function emptyDraft(typeId = ''): RuleDraft {
  return {
    name: 'rule_threshold_breach',
    display_name: 'Threshold breach',
    description: '',
    object_type_id: typeId,
    evaluation_mode: 'advisory',
    trigger_text: JSON.stringify({ numeric_gte: { score: 0.8 } }, null, 2),
    effect_text: JSON.stringify({ alert: { severity: 'high', title: 'Threshold breach' } }, null, 2),
  };
}

function draftFromRule(rule: OntologyRule): RuleDraft {
  return {
    id: rule.id,
    name: rule.name,
    display_name: rule.display_name,
    description: rule.description,
    object_type_id: rule.object_type_id,
    evaluation_mode: rule.evaluation_mode,
    trigger_text: JSON.stringify(rule.trigger_spec ?? {}, null, 2),
    effect_text: JSON.stringify(rule.effect_spec ?? {}, null, 2),
  };
}

function parseJsonObject<T>(text: string, label: string): T {
  const trimmed = text.trim();
  const parsed = trimmed ? (JSON.parse(trimmed) as unknown) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as T;
}

async function fetchRuleSurface(typeId: string) {
  const params = { object_type_id: typeId, per_page: 100 };
  const [rulesRes, insightsRes, queueRes] = await Promise.all([
    listRules(params),
    getMachineryInsights({ object_type_id: typeId }),
    getMachineryQueue({ object_type_id: typeId }),
  ]);
  return {
    rules: rulesRes.data,
    insights: insightsRes.data,
    queue: queueRes,
  };
}

export function FoundryRulesPage() {
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [rules, setRules] = useState<OntologyRule[]>([]);
  const [insights, setInsights] = useState<MachineryInsight[]>([]);
  const [queue, setQueue] = useState<MachineryQueueResponse | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [approvals, setApprovals] = useState<WorkflowApproval[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  const [simulationObjectId, setSimulationObjectId] = useState('');
  const [simulationResult, setSimulationResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setError('');
    try {
      const [otRes, wfRes] = await Promise.all([
        listObjectTypes({ per_page: 200 }),
        listWorkflows({ per_page: 200 }),
      ]);
      setObjectTypes(otRes.data);
      setWorkflows(wfRes.data);
      if (!selectedTypeId && otRes.data[0]) {
        setSelectedTypeId(otRes.data[0].id);
        setDraft(emptyDraft(otRes.data[0].id));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedTypeId) {
      setRules([]);
      setInsights([]);
      setQueue(null);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const surface = await fetchRuleSurface(selectedTypeId);
        if (cancelled) return;
        setRules(surface.rules);
        setInsights(surface.insights);
        setQueue(surface.queue);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load type');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedTypeId]);

  useEffect(() => {
    if (!selectedWorkflowId) return;
    let cancelled = false;
    async function load() {
      try {
        const [aRes, rRes] = await Promise.all([
          listWorkflowApprovals({ per_page: 50, status: 'pending', workflow_id: selectedWorkflowId }),
          listWorkflowRuns(selectedWorkflowId, { per_page: 30 }),
        ]);
        if (cancelled) return;
        setApprovals(aRes.data);
        setRuns(rRes.data);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load workflow');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkflowId]);

  function openRule(rule: OntologyRule) {
    setDraft(draftFromRule(rule));
    setSimulationObjectId('');
    setSimulationResult(null);
    setDrawerError('');
    setDrawerOpen(true);
  }

  function openNewRule() {
    const typeId = selectedTypeId || objectTypes[0]?.id || '';
    setDraft(emptyDraft(typeId));
    setSimulationObjectId('');
    setSimulationResult(null);
    setDrawerError('');
    setDrawerOpen(true);
  }

  function selectType(typeId: string) {
    setSelectedTypeId(typeId);
    setDraft(emptyDraft(typeId));
    setSimulationObjectId('');
    setSimulationResult(null);
    setDrawerError('');
    setDrawerOpen(false);
  }

  async function saveRule() {
    setBusy(true);
    setDrawerError('');
    try {
      if (!draft.object_type_id) throw new Error('Select an object type before saving.');
      if (!draft.id && !draft.name.trim()) throw new Error('Name is required.');
      if (!draft.display_name.trim()) throw new Error('Display name is required.');

      const trigger_spec = parseJsonObject<RuleTriggerSpec>(draft.trigger_text, 'Trigger spec');
      const effect_spec = parseJsonObject<RuleEffectSpec>(draft.effect_text, 'Effect spec');
      let saved: OntologyRule;
      if (draft.id) {
        saved = await updateRule(draft.id, {
          display_name: draft.display_name.trim(),
          description: draft.description.trim(),
          evaluation_mode: draft.evaluation_mode,
          trigger_spec,
          effect_spec,
        });
      } else {
        saved = await createRule({
          name: draft.name.trim(),
          display_name: draft.display_name.trim(),
          description: draft.description.trim(),
          object_type_id: draft.object_type_id,
          evaluation_mode: draft.evaluation_mode,
          trigger_spec,
          effect_spec,
        });
      }
      const surface = await fetchRuleSurface(saved.object_type_id);
      setSelectedTypeId(saved.object_type_id);
      setDraft(draftFromRule(saved));
      setRules(surface.rules);
      setInsights(surface.insights);
      setQueue(surface.queue);
    } catch (cause) {
      setDrawerError(cause instanceof Error ? cause.message : 'Failed to save rule');
    } finally {
      setBusy(false);
    }
  }

  async function removeRule() {
    if (!draft.id) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete rule?')) return;
    setBusy(true);
    setDrawerError('');
    try {
      await deleteRule(draft.id);
      setDraft(emptyDraft(selectedTypeId));
      setDrawerOpen(false);
      setSimulationObjectId('');
      setSimulationResult(null);
      if (selectedTypeId) {
        const surface = await fetchRuleSurface(selectedTypeId);
        setRules(surface.rules);
        setInsights(surface.insights);
        setQueue(surface.queue);
      }
    } catch (cause) {
      setDrawerError(cause instanceof Error ? cause.message : 'Failed to delete');
    } finally {
      setBusy(false);
    }
  }

  async function simulate() {
    if (!draft.id) return;
    if (!simulationObjectId.trim()) {
      setDrawerError('Object id is required.');
      return;
    }
    setBusy(true);
    setDrawerError('');
    try {
      const res = await simulateRule(draft.id, { object_id: simulationObjectId.trim() });
      setSimulationResult(res);
    } catch (cause) {
      setDrawerError(cause instanceof Error ? cause.message : 'Simulate failed');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!draft.id) return;
    if (!simulationObjectId.trim()) {
      setDrawerError('Object id is required.');
      return;
    }
    setBusy(true);
    setDrawerError('');
    try {
      const res = await applyRule(draft.id, { object_id: simulationObjectId.trim() });
      setSimulationResult(res);
      const surface = await fetchRuleSurface(draft.object_type_id || selectedTypeId);
      setRules(surface.rules);
      setInsights(surface.insights);
      setQueue(surface.queue);
    } catch (cause) {
      setDrawerError(cause instanceof Error ? cause.message : 'Apply failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <header>
        <h1 className="of-heading-xl">Foundry rules</h1>
        <p className="of-text-muted" style={{ marginTop: 4 }}>
          Per object-type rules with trigger and effect specs. Simulate or apply against a target object id.
        </p>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label style={{ fontSize: 13 }}>
          Object type:
          <select value={selectedTypeId} onChange={(e) => selectType(e.target.value)} className="of-input" style={{ marginLeft: 6, width: 'auto' }}>
            {objectTypes.length === 0 && <option value="">No object types</option>}
            {objectTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.display_name}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          Workflow:
          <select value={selectedWorkflowId} onChange={(e) => setSelectedWorkflowId(e.target.value)} className="of-input" style={{ marginLeft: 6, width: 'auto' }}>
            <option value="">— select —</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
        <section className="of-panel" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Rules ({rules.length})</p>
            <button type="button" onClick={openNewRule} disabled={!selectedTypeId} className="of-button" style={{ fontSize: 12 }}>
              New rule
            </button>
          </div>
          <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none' }}>
            {rules.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-label={`Edit rule ${r.display_name}`}
                  onClick={() => openRule(r)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 10,
                    borderRadius: 8,
                    border: `1px solid ${draft.id === r.id ? '#1d4ed8' : 'var(--border-default)'}`,
                    background: draft.id === r.id ? '#eff6ff' : 'transparent',
                    cursor: 'pointer',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <strong>{r.display_name}</strong>
                    <span className="of-chip">{r.evaluation_mode}</span>
                  </span>
                  <span className="of-text-muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                    {r.name} · updated {new Date(r.updated_at).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
            {rules.length === 0 && (
              <li className="of-text-muted" style={{ padding: '14px 2px', fontSize: 13 }}>
                No rules for this object type.
              </li>
            )}
          </ul>
        </section>

        <section className="of-panel" style={{ padding: 16 }}>
          {insights.length > 0 && (
            <>
              <p className="of-eyebrow" style={{ margin: 0 }}>Insights</p>
              <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
                {insights.slice(0, 5).map((i) => (
                  <li key={i.rule_id}>
                    <strong>{i.display_name}</strong> · {i.dynamic_pressure} · {i.matched_runs}/{i.total_runs}
                  </li>
                ))}
              </ul>
            </>
          )}
          {insights.length === 0 && (
            <p className="of-text-muted" style={{ margin: 0, fontSize: 13 }}>
              No machinery insights for this object type.
            </p>
          )}

          {queue && (
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>Queue</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                <Metric label="Pending" value={queue.recommendation.queue_depth} />
                <Metric label="Overdue" value={queue.recommendation.overdue_count} />
                <Metric label="Minutes" value={queue.recommendation.total_estimated_minutes} />
              </div>
              {queue.recommendation.capability_load.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                  {queue.recommendation.capability_load.slice(0, 4).map((item) => (
                    <li key={item.capability}>
                      {item.capability}: {item.pending_count} pending · {item.total_estimated_minutes} min
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      {selectedWorkflowId && (
        <>
          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Pending approvals ({approvals.length})</p>
            <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
              {approvals.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong> · {a.status}
                </li>
              ))}
            </ul>
          </section>
          <section className="of-panel" style={{ padding: 16 }}>
            <p className="of-eyebrow">Recent runs ({runs.length})</p>
            <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
              {runs.map((r) => (
                <li key={r.id}>
                  {r.trigger_type} · {r.status} · {new Date(r.started_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <FoundryRuleDrawer
        open={drawerOpen}
        draft={draft}
        objectTypes={objectTypes}
        busy={busy}
        error={drawerError}
        simulationObjectId={simulationObjectId}
        simulationResult={simulationResult}
        onClose={() => setDrawerOpen(false)}
        onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSave={() => void saveRule()}
        onDelete={() => void removeRule()}
        onSimulate={() => void simulate()}
        onApply={() => void apply()}
        onSimulationObjectIdChange={(value) => {
          setSimulationObjectId(value);
          setSimulationResult(null);
          setDrawerError('');
        }}
      />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '2px 0 2px 10px', borderLeft: '2px solid var(--border-default)' }}>
      <div className="of-text-muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

interface FoundryRuleDrawerProps {
  open: boolean;
  draft: RuleDraft;
  objectTypes: ObjectType[];
  busy: boolean;
  error: string;
  simulationObjectId: string;
  simulationResult: unknown;
  onClose: () => void;
  onDraftChange: (patch: Partial<RuleDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onSimulate: () => void;
  onApply: () => void;
  onSimulationObjectIdChange: (value: string) => void;
}

function FoundryRuleDrawer({
  open,
  draft,
  objectTypes,
  busy,
  error,
  simulationObjectId,
  simulationResult,
  onClose,
  onDraftChange,
  onSave,
  onDelete,
  onSimulate,
  onApply,
  onSimulationObjectIdChange,
}: FoundryRuleDrawerProps) {
  const isEditing = Boolean(draft.id);

  return (
    <Drawer open={open} title={isEditing ? 'Edit foundry rule' : 'New foundry rule'} width="min(620px, 100vw)" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        style={{ display: 'grid', gap: 12 }}
      >
        {error && (
          <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            {error}
          </div>
        )}

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Object type
          <select
            value={draft.object_type_id}
            onChange={(event) => onDraftChange({ object_type_id: event.target.value })}
            disabled={isEditing || busy}
            className="of-input"
          >
            <option value="">Select object type</option>
            {objectTypes.map((type) => (
              <option key={type.id} value={type.id}>{type.display_name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Name
          <input
            value={draft.name}
            disabled={isEditing || busy}
            onChange={(event) => onDraftChange({ name: event.target.value })}
            className="of-input"
            placeholder="rule_threshold_breach"
          />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Display name
          <input
            value={draft.display_name}
            disabled={busy}
            onChange={(event) => onDraftChange({ display_name: event.target.value })}
            className="of-input"
            placeholder="Threshold breach"
          />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Description
          <textarea
            value={draft.description}
            disabled={busy}
            onChange={(event) => onDraftChange({ description: event.target.value })}
            className="of-input"
            rows={3}
          />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Evaluation mode
          <select
            value={draft.evaluation_mode}
            disabled={busy}
            onChange={(event) => onDraftChange({ evaluation_mode: event.target.value as RuleDraft['evaluation_mode'] })}
            className="of-input"
          >
            <option value="advisory">advisory</option>
            <option value="automatic">automatic</option>
          </select>
        </label>

        <JsonEditor
          label="Trigger spec JSON"
          value={draft.trigger_text}
          onChange={(value) => onDraftChange({ trigger_text: value })}
          minHeight={150}
          disabled={busy}
        />

        <JsonEditor
          label="Effect spec JSON"
          value={draft.effect_text}
          onChange={(value) => onDraftChange({ effect_text: value })}
          minHeight={150}
          disabled={busy}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
          <div>
            {isEditing && (
              <button type="button" onClick={onDelete} disabled={busy} className="of-button" style={{ color: '#b91c1c', borderColor: '#fecaca' }}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} disabled={busy} className="of-button">Cancel</button>
            <button type="submit" disabled={busy} className="of-button of-button--primary">
              {busy ? 'Working...' : isEditing ? 'Update rule' : 'Create rule'}
            </button>
          </div>
        </div>

        {isEditing && (
          <section style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'grid', gap: 8 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>Simulate / apply</p>
            <input
              value={simulationObjectId}
              onChange={(event) => onSimulationObjectIdChange(event.target.value)}
              placeholder="object_id"
              className="of-input"
              disabled={busy}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={onSimulate} disabled={busy || !simulationObjectId.trim()} className="of-button">
                Simulate
              </button>
              <button type="button" onClick={onApply} disabled={busy || !simulationObjectId.trim()} className="of-button of-button--primary">
                Apply
              </button>
            </div>
            {!!simulationResult && (
              <pre style={{ margin: 0, padding: 10, background: 'var(--bg-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 8, overflow: 'auto', maxHeight: 280 }}>
                {JSON.stringify(simulationResult, null, 2)}
              </pre>
            )}
          </section>
        )}
      </form>
    </Drawer>
  );
}
