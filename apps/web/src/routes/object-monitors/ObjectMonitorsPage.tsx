import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { listAnomalies, listEvents, type AnomalyAlert, type AuditEvent } from '@/lib/api/audit';
import {
  listActionTypes,
  listFunctionPackages,
  listObjectSets,
  listObjectTypes,
  type ActionType,
  type FunctionPackage,
  type ObjectSetDefinition,
  type ObjectType,
} from '@/lib/api/ontology';
import {
  createWorkflow,
  deleteWorkflow,
  listWorkflowApprovals,
  listWorkflowRuns,
  listWorkflows,
  startWorkflowRun,
  triggerWorkflowEvent,
  updateWorkflow,
  type CreateWorkflowParams,
  type WorkflowApproval,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowStep,
} from '@/lib/api/workflows';
import { notifications } from '@stores/notifications';

type MonitorStatus = 'draft' | 'active' | 'paused';
type MonitorTriggerType = 'event' | 'cron' | 'manual';
type MonitorTargetKind = 'object_set' | 'object_type';

interface CreateMonitorDraft {
  name: string;
  description: string;
  status: MonitorStatus;
  target_kind: MonitorTargetKind;
  object_set_id: string;
  object_type_id: string;
  trigger_type: MonitorTriggerType;
  event_name: string;
  cron: string;
  severity: 'low' | 'medium' | 'high';
  action_id: string;
}

function emptyDraft(objectSets: ObjectSetDefinition[] = [], objectTypes: ObjectType[] = []): CreateMonitorDraft {
  const firstSet = objectSets[0]?.id ?? '';
  const firstType = objectTypes[0]?.id ?? '';
  return {
    name: 'Object monitor',
    description: '',
    status: 'active',
    target_kind: firstSet ? 'object_set' : 'object_type',
    object_set_id: firstSet,
    object_type_id: firstType,
    trigger_type: 'event',
    event_name: 'ontology.object.updated',
    cron: '*/15 * * * *',
    severity: 'medium',
    action_id: '',
  };
}

function isObjectMonitor(workflow: WorkflowDefinition) {
  const config = workflow.trigger_config ?? {};
  return (
    config['monitor_surface'] === 'object_monitors' ||
    Boolean(config['object_set_id']) ||
    Boolean(config['object_type_id'])
  );
}

function createStep(stepType: string, name: string, config: Record<string, unknown>): WorkflowStep {
  return {
    id: crypto.randomUUID(),
    name,
    step_type: stepType,
    description: '',
    config,
    next_step_id: null,
    branches: [],
  };
}

function buildMonitorPayload(draft: CreateMonitorDraft): CreateWorkflowParams {
  const notification = createStep('notification', 'Notify owners', {
    title: `${draft.name} fired`,
    message: 'Object monitor condition matched.',
    channels: ['in_app'],
    severity: draft.severity,
  });
  const steps: WorkflowStep[] = [notification];

  if (draft.action_id) {
    const action = createStep('submit_action', 'Submit ontology action', {
      action_id: draft.action_id,
      target_object_id_field: 'event.object_id',
      parameters: {},
      justification: `Automated submit action from ${draft.name}`,
      result_key: 'object_monitor.last_submit_action',
    });
    notification.next_step_id = action.id;
    steps.push(action);
  }

  const triggerConfig: Record<string, unknown> = {
    monitor_surface: 'object_monitors',
    target_kind: draft.target_kind,
    severity: draft.severity,
  };

  if (draft.target_kind === 'object_set') {
    triggerConfig.object_set_id = draft.object_set_id;
  } else {
    triggerConfig.object_type_id = draft.object_type_id;
  }

  if (draft.trigger_type === 'event') {
    triggerConfig.event_name = draft.event_name;
  }
  if (draft.trigger_type === 'cron') {
    triggerConfig.cron = draft.cron;
  }

  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    status: draft.status,
    trigger_type: draft.trigger_type,
    trigger_config: triggerConfig,
    steps,
  };
}

function statusTone(status: string) {
  if (status === 'active') return 'of-status-success';
  if (status === 'paused' || status === 'draft') return 'of-status-warning';
  return 'of-status-info';
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not run yet';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not run yet' : parsed.toLocaleString();
}

function targetLabel(
  workflow: WorkflowDefinition,
  objectSets: ObjectSetDefinition[],
  objectTypes: ObjectType[],
) {
  const config = workflow.trigger_config ?? {};
  const objectSetId = String(config['object_set_id'] ?? '');
  const objectTypeId = String(config['object_type_id'] ?? '');
  if (objectSetId) {
    return objectSets.find((set) => set.id === objectSetId)?.name ?? objectSetId;
  }
  if (objectTypeId) {
    return objectTypes.find((type) => type.id === objectTypeId)?.display_name ?? objectTypeId;
  }
  return 'Unscoped';
}

function triggerLabel(workflow: WorkflowDefinition) {
  const config = workflow.trigger_config ?? {};
  if (workflow.trigger_type === 'event') return String(config['event_name'] ?? 'event');
  if (workflow.trigger_type === 'cron') return String(config['cron'] ?? 'cron');
  return workflow.trigger_type;
}

function stepSummary(workflow: WorkflowDefinition) {
  const submitActions = workflow.steps.filter((step) => step.step_type === 'submit_action').length;
  const notifications = workflow.steps.filter((step) => step.step_type === 'notification').length;
  return `${workflow.steps.length} steps - ${notifications} notifications - ${submitActions} actions`;
}

export function ObjectMonitorsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [objectSets, setObjectSets] = useState<ObjectSetDefinition[]>([]);
  const [actions, setActions] = useState<ActionType[]>([]);
  const [functionPackages, setFunctionPackages] = useState<FunctionPackage[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [approvals, setApprovals] = useState<WorkflowApproval[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function refresh(nextSelectedId?: string) {
    setLoading(true);
    setError('');
    try {
      const [workflowRes, typeRes, setRes, actionRes, functionRes, anomalyRes, eventRes] = await Promise.all([
        listWorkflows({ per_page: 200 }),
        listObjectTypes({ per_page: 200 }),
        listObjectSets(),
        listActionTypes({ per_page: 200 }).catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
        listFunctionPackages({ per_page: 200 }).catch(() => ({ data: [], total: 0, page: 1, per_page: 200 })),
        listAnomalies().catch(() => []),
        listEvents({}).catch(() => ({ items: [] })),
      ]);
      const monitors = workflowRes.data.filter(isObjectMonitor);
      setWorkflows(monitors);
      setObjectTypes(typeRes.data);
      setObjectSets(setRes.data);
      setActions(actionRes.data);
      setFunctionPackages(functionRes.data);
      setAnomalies(anomalyRes);
      setEvents(eventRes.items);
      setSelectedId((current) => {
        const wanted = nextSelectedId || current;
        if (wanted && monitors.some((monitor) => monitor.id === wanted)) return wanted;
        return monitors[0]?.id ?? '';
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load object monitors');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setApprovals([]);
      setRuns([]);
      return;
    }
    let cancelled = false;
    async function loadMonitorActivity() {
      try {
        const [approvalRes, runRes] = await Promise.all([
          listWorkflowApprovals({ workflow_id: selectedId, status: 'pending', per_page: 50 }),
          listWorkflowRuns(selectedId, { per_page: 30 }),
        ]);
        if (cancelled) return;
        setApprovals(approvalRes.data);
        setRuns(runRes.data);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load monitor activity');
      }
    }
    void loadMonitorActivity();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedMonitor = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedId) ?? null,
    [selectedId, workflows],
  );

  const filteredMonitors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workflows.filter((workflow) => {
      const matchesStatus = statusFilter === 'all' || workflow.status === statusFilter;
      const matchesSearch =
        !q ||
        workflow.name.toLowerCase().includes(q) ||
        workflow.description.toLowerCase().includes(q) ||
        targetLabel(workflow, objectSets, objectTypes).toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [objectSets, objectTypes, search, statusFilter, workflows]);

  const activeCount = workflows.filter((workflow) => workflow.status === 'active').length;
  const pausedCount = workflows.filter((workflow) => workflow.status === 'paused').length;

  async function createMonitor(draft: CreateMonitorDraft) {
    setBusyAction('create');
    setError('');
    try {
      const created = await createWorkflow(buildMonitorPayload(draft));
      notifications.success('Object monitor created');
      setCreateOpen(false);
      await refresh(created.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to create monitor';
      setError(message);
      notifications.error(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function setMonitorStatus(workflow: WorkflowDefinition, status: MonitorStatus) {
    setBusyAction(`status:${workflow.id}`);
    setError('');
    try {
      const updated = await updateWorkflow(workflow.id, { status });
      notifications.success(status === 'paused' ? 'Monitor paused' : 'Monitor resumed');
      await refresh(updated.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to update monitor';
      setError(message);
      notifications.error(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function runSelectedMonitor() {
    if (!selectedMonitor) return;
    setBusyAction(`run:${selectedMonitor.id}`);
    setError('');
    try {
      await startWorkflowRun(selectedMonitor.id, { initiated_from: 'object-monitors' });
      notifications.success('Monitor run started');
      await refresh(selectedMonitor.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to run monitor';
      setError(message);
      notifications.error(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function fireSelectedEvent() {
    if (!selectedMonitor) return;
    const eventName = String(selectedMonitor.trigger_config['event_name'] ?? '');
    if (!eventName) {
      setError('This monitor does not have an event name');
      return;
    }
    setBusyAction(`event:${selectedMonitor.id}`);
    setError('');
    try {
      await triggerWorkflowEvent(eventName, {
        source: 'object-monitors',
        object_set_id: selectedMonitor.trigger_config['object_set_id'],
        object_type_id: selectedMonitor.trigger_config['object_type_id'],
      });
      notifications.success('Monitor event dispatched');
      await refresh(selectedMonitor.id);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to dispatch monitor event';
      setError(message);
      notifications.error(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function removeSelectedMonitor() {
    if (!selectedMonitor) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this monitor?')) return;
    setBusyAction(`delete:${selectedMonitor.id}`);
    setError('');
    try {
      await deleteWorkflow(selectedMonitor.id);
      notifications.success('Monitor deleted');
      setSelectedId('');
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to delete monitor';
      setError(message);
      notifications.error(message);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">ONT-012</p>
          <h1 className="of-heading-xl">Object monitors</h1>
          <p className="of-text-muted" style={{ marginTop: 4, fontSize: 13 }}>
            Workflow-backed monitors for object sets, object types, approvals, and submit-action automations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void refresh(selectedId)} disabled={loading} className="of-button">
            Refresh
          </button>
          <button type="button" onClick={() => setCreateOpen(true)} className="of-button of-button--primary">
            + Monitor
          </button>
        </div>
      </div>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <section className="of-panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span className="of-chip">Monitors {workflows.length}</span>
          <span className="of-chip of-status-success">Active {activeCount}</span>
          <span className="of-chip of-status-warning">Paused {pausedCount}</span>
          <span className="of-chip">Object types {objectTypes.length}</span>
          <span className="of-chip">Object sets {objectSets.length}</span>
          <span className="of-chip">Actions {actions.length}</span>
          <span className="of-chip">Functions {functionPackages.length}</span>
          <span className="of-chip">Anomalies {anomalies.length}</span>
          <span className="of-chip">Recent events {events.length}</span>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <p className="of-eyebrow">Monitor registry</p>
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 13 }}>
                Object-scoped workflow definitions.
              </p>
            </div>
            <span className="of-chip">{filteredMonitors.length} shown</span>
          </div>

          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) 150px' }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search monitors"
              className="of-input"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="of-input">
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              Loading monitors...
            </div>
          ) : filteredMonitors.length === 0 ? (
            <div style={{ border: '1px dashed var(--border-default)', borderRadius: 8, padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              No object monitors match the current filters.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {filteredMonitors.map((workflow) => {
                const active = selectedId === workflow.id;
                const statusBusy = busyAction === `status:${workflow.id}`;
                const nextStatus: MonitorStatus = workflow.status === 'paused' ? 'active' : 'paused';
                return (
                  <div
                    key={workflow.id}
                    style={{
                      display: 'grid',
                      gap: 10,
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      alignItems: 'center',
                      padding: 12,
                      border: `1px solid ${active ? '#2563eb' : 'var(--border-default)'}`,
                      borderRadius: 8,
                      background: active ? '#eff6ff' : 'var(--bg-elevated)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(workflow.id)}
                      style={{ textAlign: 'left', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'var(--text-strong)' }}>{workflow.name}</strong>
                        <span className={`of-chip ${statusTone(workflow.status)}`}>{workflow.status}</span>
                      </div>
                      <div className="of-text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                        {targetLabel(workflow, objectSets, objectTypes)} - {triggerLabel(workflow)}
                      </div>
                      <div className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                        {stepSummary(workflow)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void setMonitorStatus(workflow, nextStatus)}
                      disabled={statusBusy}
                      className="of-button"
                      style={{ fontSize: 12 }}
                    >
                      {workflow.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14, alignContent: 'start' }}>
          {selectedMonitor ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p className="of-eyebrow">Monitor detail</p>
                  <h2 className="of-heading-md" style={{ marginTop: 4 }}>{selectedMonitor.name}</h2>
                  <p className="of-text-muted" style={{ marginTop: 4, fontSize: 13 }}>
                    {selectedMonitor.description || 'No description'}
                  </p>
                </div>
                <span className={`of-chip ${statusTone(selectedMonitor.status)}`}>{selectedMonitor.status}</span>
              </div>

              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <Metric label="Target" value={targetLabel(selectedMonitor, objectSets, objectTypes)} />
                <Metric label="Trigger" value={triggerLabel(selectedMonitor)} />
                <Metric label="Last run" value={formatDate(selectedMonitor.last_triggered_at)} />
                <Metric label="Next run" value={formatDate(selectedMonitor.next_run_at)} />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => void runSelectedMonitor()}
                  disabled={busyAction === `run:${selectedMonitor.id}`}
                  className="of-button of-button--primary"
                >
                  Run monitor
                </button>
                <button
                  type="button"
                  onClick={() => void fireSelectedEvent()}
                  disabled={selectedMonitor.trigger_type !== 'event' || busyAction === `event:${selectedMonitor.id}`}
                  className="of-button"
                >
                  Fire event
                </button>
                <button
                  type="button"
                  onClick={() => void setMonitorStatus(selectedMonitor, selectedMonitor.status === 'paused' ? 'active' : 'paused')}
                  disabled={busyAction === `status:${selectedMonitor.id}`}
                  className="of-button"
                >
                  {selectedMonitor.status === 'paused' ? 'Resume monitor' : 'Pause monitor'}
                </button>
                <button
                  type="button"
                  onClick={() => void removeSelectedMonitor()}
                  disabled={busyAction === `delete:${selectedMonitor.id}`}
                  className="of-button"
                  style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                >
                  Delete
                </button>
              </div>

              <div>
                <p className="of-eyebrow">Automation steps</p>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {selectedMonitor.steps.map((step, index) => (
                    <div key={step.id} style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{index + 1}. {step.name}</strong>
                        <span className="of-chip">{step.step_type}</span>
                      </div>
                      {step.next_step_id && (
                        <div className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                          Next step {step.next_step_id.slice(0, 8)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <ActivityList title={`Pending approvals (${approvals.length})`} empty="No pending approvals.">
                  {approvals.map((approval) => (
                    <li key={approval.id}>
                      <strong>{approval.title}</strong>
                      <span>{approval.status} - run {approval.workflow_run_id.slice(0, 8)}</span>
                    </li>
                  ))}
                </ActivityList>
                <ActivityList title={`Recent runs (${runs.length})`} empty="No recent runs.">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <strong>{run.status}</strong>
                      <span>{run.trigger_type} - {formatDate(run.started_at)}</span>
                    </li>
                  ))}
                </ActivityList>
              </div>
            </>
          ) : (
            <div style={{ border: '1px dashed var(--border-default)', borderRadius: 8, padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Select or create an object monitor.
            </div>
          )}
        </section>
      </div>

      <CreateMonitorModal
        open={createOpen}
        objectSets={objectSets}
        objectTypes={objectTypes}
        actions={actions}
        saving={busyAction === 'create'}
        onClose={() => setCreateOpen(false)}
        onCreate={(draft) => void createMonitor(draft)}
      />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 10 }}>
      <div className="of-eyebrow">{label}</div>
      <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}

function ActivityList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <p className="of-eyebrow">{title}</p>
      {hasItems ? (
        <ul style={{ display: 'grid', gap: 8, paddingLeft: 0, listStyle: 'none', marginTop: 8, fontSize: 12 }}>
          {children}
        </ul>
      ) : (
        <div className="of-text-muted" style={{ marginTop: 8, fontSize: 13 }}>{empty}</div>
      )}
    </div>
  );
}

interface CreateMonitorModalProps {
  open: boolean;
  objectSets: ObjectSetDefinition[];
  objectTypes: ObjectType[];
  actions: ActionType[];
  saving: boolean;
  onClose: () => void;
  onCreate: (draft: CreateMonitorDraft) => void;
}

function CreateMonitorModal({
  open,
  objectSets,
  objectTypes,
  actions,
  saving,
  onClose,
  onCreate,
}: CreateMonitorModalProps) {
  const [draft, setDraft] = useState<CreateMonitorDraft>(() => emptyDraft(objectSets, objectTypes));
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft(objectSets, objectTypes));
    setLocalError('');
  }, [objectSets, objectTypes, open]);

  if (!open) return null;

  const actionOptions =
    draft.target_kind === 'object_type' && draft.object_type_id
      ? actions.filter((action) => action.object_type_id === draft.object_type_id)
      : actions;

  function submit() {
    if (!draft.name.trim()) {
      setLocalError('Name is required');
      return;
    }
    if (draft.target_kind === 'object_set' && !draft.object_set_id) {
      setLocalError('Select an object set');
      return;
    }
    if (draft.target_kind === 'object_type' && !draft.object_type_id) {
      setLocalError('Select an object type');
      return;
    }
    if (draft.trigger_type === 'event' && !draft.event_name.trim()) {
      setLocalError('Event name is required');
      return;
    }
    if (draft.trigger_type === 'cron' && !draft.cron.trim()) {
      setLocalError('Cron schedule is required');
      return;
    }
    onCreate(draft);
  }

  return (
    <div
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create monitor"
        style={{ width: 'min(760px, 100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, boxShadow: '0 24px 60px rgba(15,23,42,0.28)' }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: 18, borderBottom: '1px solid var(--border-default)' }}>
          <div>
            <p className="of-eyebrow">Monitor builder</p>
            <h2 className="of-heading-md" style={{ marginTop: 4 }}>New object monitor</h2>
          </div>
          <button type="button" onClick={onClose} className="of-button" aria-label="Close">
            Close
          </button>
        </header>

        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          {localError && (
            <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
              {localError}
            </div>
          )}

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Name</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                className="of-input"
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Status</span>
              <select
                value={draft.status}
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as MonitorStatus }))}
                className="of-input"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="paused">Paused</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Description</span>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              className="of-input"
              rows={3}
            />
          </label>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Target type</span>
              <select
                value={draft.target_kind}
                onChange={(event) => setDraft((current) => ({ ...current, target_kind: event.target.value as MonitorTargetKind }))}
                className="of-input"
              >
                <option value="object_set">Object set</option>
                <option value="object_type">Object type</option>
              </select>
            </label>
            {draft.target_kind === 'object_set' ? (
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>Object set</span>
                <select
                  value={draft.object_set_id}
                  onChange={(event) => setDraft((current) => ({ ...current, object_set_id: event.target.value }))}
                  className="of-input"
                >
                  <option value="">Select object set</option>
                  {objectSets.map((set) => (
                    <option key={set.id} value={set.id}>{set.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>Object type</span>
                <select
                  value={draft.object_type_id}
                  onChange={(event) => setDraft((current) => ({ ...current, object_type_id: event.target.value, action_id: '' }))}
                  className="of-input"
                >
                  <option value="">Select object type</option>
                  {objectTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.display_name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Trigger</span>
              <select
                value={draft.trigger_type}
                onChange={(event) => setDraft((current) => ({ ...current, trigger_type: event.target.value as MonitorTriggerType }))}
                className="of-input"
              >
                <option value="event">Event</option>
                <option value="cron">Cron</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            {draft.trigger_type === 'event' ? (
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>Event name</span>
                <input
                  value={draft.event_name}
                  onChange={(event) => setDraft((current) => ({ ...current, event_name: event.target.value }))}
                  className="of-input"
                />
              </label>
            ) : draft.trigger_type === 'cron' ? (
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>Cron</span>
                <input
                  value={draft.cron}
                  onChange={(event) => setDraft((current) => ({ ...current, cron: event.target.value }))}
                  className="of-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              </label>
            ) : (
              <div style={{ border: '1px dashed var(--border-default)', borderRadius: 8, padding: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                Manual trigger only.
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Severity</span>
              <select
                value={draft.severity}
                onChange={(event) => setDraft((current) => ({ ...current, severity: event.target.value as CreateMonitorDraft['severity'] }))}
                className="of-input"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>Submit action</span>
              <select
                value={draft.action_id}
                onChange={(event) => setDraft((current) => ({ ...current, action_id: event.target.value }))}
                className="of-input"
              >
                <option value="">Notification only</option>
                {actionOptions.map((action) => (
                  <option key={action.id} value={action.id}>{action.display_name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 18, borderTop: '1px solid var(--border-default)' }}>
          <button type="button" onClick={onClose} className="of-button">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} className="of-button of-button--primary">
            {saving ? 'Creating...' : 'Create monitor'}
          </button>
        </footer>
      </div>
    </div>
  );
}
