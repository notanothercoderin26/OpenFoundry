import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Link } from 'react-router-dom';

import {
  createActionType,
  createActionWhatIfBranch,
  deleteActionType,
  deleteActionWhatIfBranch,
  executeAction,
  executeActionBatch,
  getActionMetrics,
  listActionTypes,
  listActionWhatIfBranches,
  listObjectTypes,
  updateActionType,
  validateAction,
  type ActionMetricsResponse,
  type ActionOperationKind,
  type ActionType,
  type ActionWhatIfBranch,
  type ObjectType,
} from '@/lib/api/ontology';
import { JsonEditor } from '@/lib/components/JsonEditor';
import { Drawer } from '@/lib/components/ui/Drawer';

type DetailTab =
  | 'overview'
  | 'form'
  | 'rules'
  | 'operate'
  | 'submission'
  | 'log'
  | 'monitoring';

type ActionFamily = 'object' | 'link' | 'function' | 'webhook' | 'interface' | 'notification';
type ObjectMode = 'create' | 'modify' | 'modify_or_create' | 'delete';
type InterfaceMode = 'create' | 'modify' | 'delete' | 'create_link' | 'delete_link';
type WizardStep = 1 | 2 | 3 | 4 | 5;

interface FamilyTab {
  id: ActionFamily;
}

const FAMILY_TABS: FamilyTab[] = [
  { id: 'object' },
  { id: 'link' },
  { id: 'function' },
  { id: 'webhook' },
  { id: 'interface' },
  { id: 'notification' },
];

const OBJECT_MODES: Array<{ id: ObjectMode; label: string; description: string; icon: string }> = [
  {
    id: 'create',
    label: 'Create object',
    description: 'Configure an action type that adds a new object instance.',
    icon: '➕',
  },
  {
    id: 'modify',
    label: 'Modify object(s)',
    description: 'Configure an action type that edits existing object instances.',
    icon: '✏',
  },
  {
    id: 'modify_or_create',
    label: 'Modify or create object',
    description: 'Modify an existing instance, otherwise create a new one.',
    icon: '↻',
  },
  {
    id: 'delete',
    label: 'Delete object(s)',
    description: 'Remove one or more existing object instances.',
    icon: '\u{1F5D1}',
  },
];

const INTERFACE_MODES: Array<{ id: InterfaceMode; label: string; description: string }> = [
  { id: 'create', label: 'Create interface', description: 'Bind an object type to an interface.' },
  { id: 'modify', label: 'Modify interface', description: 'Change interface implementation.' },
  { id: 'delete', label: 'Delete interface', description: 'Remove the binding to an interface.' },
  { id: 'create_link', label: 'Create interface link', description: 'Add a link via the interface.' },
  { id: 'delete_link', label: 'Delete interface link', description: 'Remove a link via the interface.' },
];

const FAMILY_TO_OPERATION_KIND: Record<ActionFamily, (mode: string) => ActionOperationKind> = {
  object: (mode) => (mode === 'delete' ? 'delete_object' : 'update_object'),
  link: () => 'create_link',
  function: () => 'invoke_function',
  webhook: () => 'invoke_webhook',
  interface: (mode) => {
    switch (mode as InterfaceMode) {
      case 'modify':
        return 'modify_interface';
      case 'delete':
        return 'delete_interface';
      case 'create_link':
        return 'create_interface_link';
      case 'delete_link':
        return 'delete_interface_link';
      case 'create':
      default:
        return 'create_interface';
    }
  },
  notification: () => 'invoke_webhook',
};

const KIND_TO_FAMILY: Record<ActionOperationKind, { family: ActionFamily; mode: string }> = {
  update_object: { family: 'object', mode: 'modify' },
  delete_object: { family: 'object', mode: 'delete' },
  create_link: { family: 'link', mode: '' },
  invoke_function: { family: 'function', mode: '' },
  invoke_webhook: { family: 'webhook', mode: '' },
  create_interface: { family: 'interface', mode: 'create' },
  modify_interface: { family: 'interface', mode: 'modify' },
  delete_interface: { family: 'interface', mode: 'delete' },
  create_interface_link: { family: 'interface', mode: 'create_link' },
  delete_interface_link: { family: 'interface', mode: 'delete_link' },
};

const OPERATION_KINDS: ActionOperationKind[] = [
  'update_object',
  'create_link',
  'delete_object',
  'invoke_function',
  'invoke_webhook',
  'create_interface',
  'modify_interface',
  'delete_interface',
  'create_interface_link',
  'delete_interface_link',
];

interface Draft {
  id?: string;
  name: string;
  display_name: string;
  description: string;
  object_type_id: string;
  operation_kind: ActionOperationKind;
  confirmation_required: boolean;
  permission_key: string;
  input_schema_json: string;
  form_schema_json: string;
  config_json: string;
  authorization_policy_json: string;
}

function emptyDraft(): Draft {
  return {
    name: 'my_action',
    display_name: 'My action',
    description: '',
    object_type_id: '',
    operation_kind: 'update_object',
    confirmation_required: false,
    permission_key: '',
    input_schema_json: JSON.stringify(
      [{ name: 'target_id', property_type: 'reference', required: true }],
      null,
      2,
    ),
    form_schema_json: JSON.stringify({ sections: [] }, null, 2),
    config_json: JSON.stringify(
      { operation: { kind: 'update_object', mappings: [] }, notification_side_effects: [] },
      null,
      2,
    ),
    authorization_policy_json: JSON.stringify({}, null, 2),
  };
}

function draftFromAction(a: ActionType): Draft {
  return {
    id: a.id,
    name: a.name,
    display_name: a.display_name,
    description: a.description,
    object_type_id: a.object_type_id,
    operation_kind: a.operation_kind,
    confirmation_required: a.confirmation_required,
    permission_key: a.permission_key ?? '',
    input_schema_json: JSON.stringify(a.input_schema, null, 2),
    form_schema_json: JSON.stringify(a.form_schema, null, 2),
    config_json: JSON.stringify(a.config, null, 2),
    authorization_policy_json: JSON.stringify(a.authorization_policy, null, 2),
  };
}

function familyLabelFromKind(kind: ActionOperationKind): ActionFamily {
  return KIND_TO_FAMILY[kind].family;
}

function kindBadgeStyle(kind: ActionOperationKind): CSSProperties {
  const family = familyLabelFromKind(kind);
  switch (family) {
    case 'object':
      return { background: '#dbeafe', color: '#1d4ed8' };
    case 'link':
      return { background: '#dcfce7', color: '#15803d' };
    case 'function':
      return { background: '#ede9fe', color: '#6d28d9' };
    case 'webhook':
      return { background: '#fef3c7', color: '#a16207' };
    case 'interface':
      return { background: '#fce7f3', color: '#be185d' };
    case 'notification':
      return { background: '#e0e7ff', color: '#3730a3' };
  }
}

function familyChipLabel(family: ActionFamily) {
  return family.charAt(0).toUpperCase() + family.slice(1);
}

export function ActionTypesPage() {
  const [actions, setActions] = useState<ActionType[]>([]);
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState<'all' | ActionFamily>('all');
  const [objectTypeFilter, setObjectTypeFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editorOpen, setEditorOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // operate
  const [executeTargetId, setExecuteTargetId] = useState('');
  const [executeParamsJson, setExecuteParamsJson] = useState('{}');
  const [executeJustification, setExecuteJustification] = useState('');
  const [executeResult, setExecuteResult] = useState<unknown>(null);
  const [validateResult, setValidateResult] = useState<unknown>(null);
  const [batchTargetsText, setBatchTargetsText] = useState('');
  const [batchResult, setBatchResult] = useState<unknown>(null);

  // what-if
  const [whatIfBranches, setWhatIfBranches] = useState<ActionWhatIfBranch[]>([]);
  const [whatIfDraftJson, setWhatIfDraftJson] = useState(
    JSON.stringify({ target_object_id: '', parameters: {}, name: 'Branch 1', description: '' }, null, 2),
  );

  // monitoring
  const [metrics, setMetrics] = useState<ActionMetricsResponse | null>(null);
  const [metricsWindow, setMetricsWindow] = useState('30d');

  async function refresh() {
    setError('');
    try {
      const [acts, types] = await Promise.all([
        listActionTypes({ per_page: 200 }),
        listObjectTypes({ per_page: 200 }),
      ]);
      setActions(acts.data);
      setObjectTypes(types.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const objectTypeMap = useMemo(() => {
    const map = new Map<string, ObjectType>();
    objectTypes.forEach((t) => map.set(t.id, t));
    return map;
  }, [objectTypes]);

  const filteredActions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return actions.filter((a) => {
      if (familyFilter !== 'all' && familyLabelFromKind(a.operation_kind) !== familyFilter) return false;
      if (objectTypeFilter && a.object_type_id !== objectTypeFilter) return false;
      if (!q) return true;
      return (
        a.display_name.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.operation_kind.includes(q)
      );
    });
  }, [actions, search, familyFilter, objectTypeFilter]);

  const selectedAction = useMemo(
    () => actions.find((a) => a.id === selectedId) ?? null,
    [actions, selectedId],
  );

  const selectedObjectType = useMemo(
    () => (selectedAction ? objectTypeMap.get(selectedAction.object_type_id) ?? null : null),
    [selectedAction, objectTypeMap],
  );

  function selectAction(a: ActionType) {
    setSelectedId(a.id);
    setDraft(draftFromAction(a));
    setTab('overview');
    setExecuteResult(null);
    setValidateResult(null);
    setBatchResult(null);
    setMetrics(null);
    setWhatIfBranches([]);
  }

  function clearSelection() {
    setSelectedId(null);
    setDraft(emptyDraft());
    setTab('overview');
  }

  function openEditor() {
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    if (selectedAction) {
      setDraft(draftFromAction(selectedAction));
    }
  }

  function openWizard() {
    setDraft(emptyDraft());
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const input_schema = JSON.parse(draft.input_schema_json);
      const form_schema = JSON.parse(draft.form_schema_json);
      const config = JSON.parse(draft.config_json);
      const authorization_policy = JSON.parse(draft.authorization_policy_json);
      let saved: ActionType;
      if (draft.id) {
        saved = await updateActionType(draft.id, {
          display_name: draft.display_name,
          description: draft.description,
          operation_kind: draft.operation_kind,
          input_schema,
          form_schema,
          config,
          confirmation_required: draft.confirmation_required,
          permission_key: draft.permission_key || undefined,
          authorization_policy,
        });
      } else {
        saved = await createActionType({
          name: draft.name,
          display_name: draft.display_name,
          description: draft.description,
          object_type_id: draft.object_type_id,
          operation_kind: draft.operation_kind,
          input_schema,
          form_schema,
          config,
          confirmation_required: draft.confirmation_required,
          permission_key: draft.permission_key || undefined,
          authorization_policy,
        });
      }
      await refresh();
      setSelectedId(saved.id);
      setDraft(draftFromAction(saved));
      setEditorOpen(false);
      setWizardOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!selectedAction) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete action type?')) return;
    setBusy(true);
    setError('');
    try {
      await deleteActionType(selectedAction.id);
      clearSelection();
      setEditorOpen(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function runValidate() {
    if (!selectedAction) return;
    setBusy(true);
    setError('');
    try {
      setValidateResult(
        await validateAction(selectedAction.id, {
          target_object_id: executeTargetId || undefined,
          parameters: JSON.parse(executeParamsJson || '{}'),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Validate failed');
    } finally {
      setBusy(false);
    }
  }

  async function runExecute() {
    if (!selectedAction) return;
    setBusy(true);
    setError('');
    try {
      setExecuteResult(
        await executeAction(selectedAction.id, {
          target_object_id: executeTargetId || undefined,
          parameters: JSON.parse(executeParamsJson || '{}'),
          justification: executeJustification || undefined,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Execute failed');
    } finally {
      setBusy(false);
    }
  }

  async function runBatch() {
    if (!selectedAction) return;
    setBusy(true);
    setError('');
    try {
      const target_object_ids = batchTargetsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      setBatchResult(
        await executeActionBatch(selectedAction.id, {
          target_object_ids,
          parameters: JSON.parse(executeParamsJson || '{}'),
          justification: executeJustification || undefined,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Batch execute failed');
    } finally {
      setBusy(false);
    }
  }

  async function loadWhatIf() {
    if (!selectedAction) return;
    setBusy(true);
    try {
      const res = await listActionWhatIfBranches(selectedAction.id, { per_page: 50 });
      setWhatIfBranches(res.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load what-if branches');
    } finally {
      setBusy(false);
    }
  }

  async function createWhatIf() {
    if (!selectedAction) return;
    setBusy(true);
    try {
      await createActionWhatIfBranch(selectedAction.id, JSON.parse(whatIfDraftJson));
      await loadWhatIf();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create what-if failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteWhatIf(branchId: string) {
    if (!selectedAction) return;
    setBusy(true);
    try {
      await deleteActionWhatIfBranch(selectedAction.id, branchId);
      await loadWhatIf();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete what-if failed');
    } finally {
      setBusy(false);
    }
  }

  async function loadMetrics() {
    if (!selectedAction) return;
    setBusy(true);
    try {
      setMetrics(await getActionMetrics(selectedAction.id, { window: metricsWindow }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Metrics failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 12 }}>
      {selectedAction ? (
        <DetailView
          action={selectedAction}
          objectType={selectedObjectType}
          tab={tab}
          onTabChange={setTab}
          onBack={clearSelection}
          onEdit={openEditor}
          onDelete={remove}
          executeTargetId={executeTargetId}
          setExecuteTargetId={setExecuteTargetId}
          executeParamsJson={executeParamsJson}
          setExecuteParamsJson={setExecuteParamsJson}
          executeJustification={executeJustification}
          setExecuteJustification={setExecuteJustification}
          executeResult={executeResult}
          validateResult={validateResult}
          batchTargetsText={batchTargetsText}
          setBatchTargetsText={setBatchTargetsText}
          batchResult={batchResult}
          whatIfBranches={whatIfBranches}
          whatIfDraftJson={whatIfDraftJson}
          setWhatIfDraftJson={setWhatIfDraftJson}
          metrics={metrics}
          metricsWindow={metricsWindow}
          setMetricsWindow={setMetricsWindow}
          busy={busy}
          error={error}
          onValidate={runValidate}
          onExecute={runExecute}
          onBatch={runBatch}
          onLoadWhatIf={loadWhatIf}
          onCreateWhatIf={createWhatIf}
          onDeleteWhatIf={deleteWhatIf}
          onLoadMetrics={loadMetrics}
        />
      ) : (
        <ListView
          actions={filteredActions}
          allActions={actions}
          objectTypeMap={objectTypeMap}
          objectTypes={objectTypes}
          search={search}
          onSearch={setSearch}
          familyFilter={familyFilter}
          onFamilyFilter={setFamilyFilter}
          objectTypeFilter={objectTypeFilter}
          onObjectTypeFilter={setObjectTypeFilter}
          onCreate={openWizard}
          onSelect={selectAction}
          error={error}
        />
      )}

      <ActionTypeEditor
        open={editorOpen}
        action={selectedAction}
        draft={draft}
        objectTypes={objectTypes}
        busy={busy}
        error={editorOpen ? error : ''}
        onDraftChange={setDraft}
        onClose={closeEditor}
        onSave={save}
        onDelete={remove}
      />

      <CreateActionWizard
        open={wizardOpen}
        objectTypes={objectTypes}
        draft={draft}
        onDraftChange={setDraft}
        onClose={closeWizard}
        onSubmit={save}
        busy={busy}
        error={wizardOpen ? error : ''}
      />
    </section>
  );
}

interface ListViewProps {
  actions: ActionType[];
  allActions: ActionType[];
  objectTypeMap: Map<string, ObjectType>;
  objectTypes: ObjectType[];
  search: string;
  onSearch: (v: string) => void;
  familyFilter: 'all' | ActionFamily;
  onFamilyFilter: (v: 'all' | ActionFamily) => void;
  objectTypeFilter: string;
  onObjectTypeFilter: (v: string) => void;
  onCreate: () => void;
  onSelect: (a: ActionType) => void;
  error: string;
}

function ListView({
  actions,
  allActions,
  objectTypeMap,
  objectTypes,
  search,
  onSearch,
  familyFilter,
  onFamilyFilter,
  objectTypeFilter,
  onObjectTypeFilter,
  onCreate,
  onSelect,
  error,
}: ListViewProps) {
  const familyCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allActions.length };
    FAMILY_TABS.forEach((f) => (counts[f.id] = 0));
    allActions.forEach((a) => {
      const fam = familyLabelFromKind(a.operation_kind);
      counts[fam] = (counts[fam] ?? 0) + 1;
    });
    return counts;
  }, [allActions]);

  return (
    <>
      <div className="of-panel" style={{ padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Link to="/ontology" className="of-link" style={{ fontSize: 12 }}>
                Ontology
              </Link>
              <span className="of-text-muted">/</span>
              <span className="of-eyebrow">ONT-015</span>
            </div>
            <h1 className="of-heading-xl" style={{ marginTop: 8 }}>
              Action types
            </h1>
            <p className="of-text-muted" style={{ marginTop: 8, maxWidth: 820, lineHeight: 1.65 }}>
              Author actions on object types, validate and execute against targets, manage what-if
              branches, and monitor performance metrics.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <button
              type="button"
              className="of-button of-button--primary"
              onClick={onCreate}
            >
              + Create new action type
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="of-status-danger"
          role="alert"
          style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
        >
          {error}
        </div>
      )}

      <section className="of-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="of-tabbar" role="tablist" aria-label="Action family" style={{ borderBottom: 0 }}>
          {[{ id: 'all' as const, label: 'All' }, ...FAMILY_TABS.map((f) => ({ id: f.id, label: familyChipLabel(f.id) }))].map(
            (entry) => {
              const active = familyFilter === entry.id;
              const count = familyCounts[entry.id] ?? 0;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? 'of-tab of-tab-active' : 'of-tab'}
                  onClick={() => onFamilyFilter(entry.id)}
                >
                  {entry.label}
                  <span className="of-badge" style={{ marginLeft: 6 }}>{count}</span>
                </button>
              );
            },
          )}
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search action types..."
            className="of-input"
          />
        </div>

        <select
          value={objectTypeFilter}
          onChange={(e) => onObjectTypeFilter(e.target.value)}
          className="of-select"
          style={{ width: 240 }}
          aria-label="Filter by object type"
        >
          <option value="">All object types</option>
          {objectTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.display_name}
            </option>
          ))}
        </select>
      </section>

      <article className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {actions.length === 0 ? (
          <div style={{ padding: 56, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {allActions.length === 0
              ? 'No action types yet. Use Create new action type to get started.'
              : 'No action types match the current filters.'}
          </div>
        ) : (
          <table className="of-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Title</th>
                <th>Type</th>
                <th>Object type</th>
                <th>Confirmation</th>
                <th>Permission</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => {
                const objectType = objectTypeMap.get(a.object_type_id);
                return (
                  <tr key={a.id} onClick={() => onSelect(a)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <strong>{a.display_name}</strong>
                        <span className="of-text-muted" style={{ fontSize: 11 }}>{a.name}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className="of-chip"
                        style={kindBadgeStyle(a.operation_kind)}
                      >
                        {a.operation_kind}
                      </span>
                    </td>
                    <td>
                      {objectType ? (
                        <span>{objectType.display_name}</span>
                      ) : (
                        <span className="of-text-muted">{a.object_type_id}</span>
                      )}
                    </td>
                    <td>
                      {a.confirmation_required ? (
                        <span className="of-chip" style={{ background: '#fef3c7', color: '#a16207' }}>
                          Required
                        </span>
                      ) : (
                        <span className="of-text-muted" style={{ fontSize: 12 }}>None</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{a.permission_key || <span className="of-text-muted">—</span>}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(a.updated_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}

interface DetailViewProps {
  action: ActionType;
  objectType: ObjectType | null;
  tab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  executeTargetId: string;
  setExecuteTargetId: (v: string) => void;
  executeParamsJson: string;
  setExecuteParamsJson: (v: string) => void;
  executeJustification: string;
  setExecuteJustification: (v: string) => void;
  executeResult: unknown;
  validateResult: unknown;
  batchTargetsText: string;
  setBatchTargetsText: (v: string) => void;
  batchResult: unknown;
  whatIfBranches: ActionWhatIfBranch[];
  whatIfDraftJson: string;
  setWhatIfDraftJson: (v: string) => void;
  metrics: ActionMetricsResponse | null;
  metricsWindow: string;
  setMetricsWindow: (v: string) => void;
  busy: boolean;
  error: string;
  onValidate: () => Promise<void>;
  onExecute: () => Promise<void>;
  onBatch: () => Promise<void>;
  onLoadWhatIf: () => Promise<void>;
  onCreateWhatIf: () => Promise<void>;
  onDeleteWhatIf: (id: string) => Promise<void>;
  onLoadMetrics: () => Promise<void>;
}

function DetailView(props: DetailViewProps) {
  const {
    action,
    objectType,
    tab,
    onTabChange,
    onBack,
    onEdit,
    onDelete,
    busy,
    error,
  } = props;

  return (
    <>
      <div className="of-panel" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="of-button of-button--ghost" onClick={onBack}>
            ← Back to Action types
          </button>
          <span className="of-text-muted">/</span>
          <Link to="/ontology" className="of-link" style={{ fontSize: 12 }}>
            Ontology
          </Link>
          <span className="of-text-muted">/</span>
          <span className="of-eyebrow">ONT-015</span>
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="of-chip" style={kindBadgeStyle(action.operation_kind)}>
                {action.operation_kind}
              </span>
              {action.confirmation_required && (
                <span className="of-chip" style={{ background: '#fef3c7', color: '#a16207' }}>
                  Confirmation required
                </span>
              )}
            </div>
            <h1 className="of-heading-xl" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>
              {action.display_name}
            </h1>
            <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              {action.name}
            </p>
            {action.description && (
              <p className="of-text-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
                {action.description}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="of-button" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="of-button"
              style={{ color: '#b91c1c', borderColor: '#fecaca' }}
              onClick={() => void onDelete()}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="of-status-danger"
          role="alert"
          style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 240px) minmax(0, 1fr)',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <DetailSidebar tab={tab} onChange={onTabChange} />

        <article className="of-panel" style={{ padding: 16, minWidth: 0 }}>
          {tab === 'overview' && <OverviewPane action={action} objectType={objectType} />}
          {tab === 'form' && <FormPane action={action} />}
          {tab === 'rules' && <RulesPane action={action} />}
          {tab === 'submission' && <SubmissionPane action={action} />}
          {tab === 'log' && <LogPane action={action} />}
          {tab === 'operate' && <OperatePane {...props} />}
          {tab === 'monitoring' && <MonitoringPane {...props} />}
        </article>
      </div>
    </>
  );
}

const SIDEBAR_ITEMS: Array<{ id: DetailTab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '▤' },
  { id: 'rules', label: 'Rules', icon: '≡' },
  { id: 'form', label: 'Form', icon: '✏' },
  { id: 'log', label: 'Log', icon: '⧖' },
  { id: 'submission', label: 'Security & Submission Criteria', icon: '\u{1F512}' },
  { id: 'operate', label: 'Operate', icon: '▶' },
  { id: 'monitoring', label: 'Monitoring', icon: '\u{1F4CA}' },
];

function DetailSidebar({ tab, onChange }: { tab: DetailTab; onChange: (t: DetailTab) => void }) {
  return (
    <aside
      className="of-panel"
      style={{ padding: 8, position: 'sticky', top: 12, alignSelf: 'start' }}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {SIDEBAR_ITEMS.map((item) => {
          const active = tab === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onChange(item.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  borderRadius: 6,
                  background: active ? 'rgba(63, 123, 224, 0.10)' : 'transparent',
                  color: active ? 'var(--status-info)' : 'var(--text-default)',
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <span aria-hidden style={{ width: 16, textAlign: 'center', opacity: 0.7 }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function OverviewPane({ action, objectType }: { action: ActionType; objectType: ObjectType | null }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section>
        <p className="of-eyebrow">Properties</p>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '180px minmax(0, 1fr)',
            gap: 8,
            marginTop: 8,
            fontSize: 13,
          }}
        >
          <dt className="of-text-muted">Operation kind</dt>
          <dd style={{ margin: 0 }}>{action.operation_kind}</dd>
          <dt className="of-text-muted">Object type</dt>
          <dd style={{ margin: 0 }}>
            {objectType ? `${objectType.display_name} (${objectType.name})` : action.object_type_id}
          </dd>
          <dt className="of-text-muted">Description</dt>
          <dd style={{ margin: 0 }}>{action.description || <span className="of-text-muted">—</span>}</dd>
          <dt className="of-text-muted">Permission key</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {action.permission_key || <span className="of-text-muted">—</span>}
          </dd>
          <dt className="of-text-muted">Confirmation</dt>
          <dd style={{ margin: 0 }}>{action.confirmation_required ? 'Required' : 'None'}</dd>
          <dt className="of-text-muted">Inputs</dt>
          <dd style={{ margin: 0 }}>{action.input_schema.length}</dd>
          <dt className="of-text-muted">Created</dt>
          <dd style={{ margin: 0 }}>{new Date(action.created_at).toLocaleString()}</dd>
          <dt className="of-text-muted">Updated</dt>
          <dd style={{ margin: 0 }}>{new Date(action.updated_at).toLocaleString()}</dd>
        </dl>
      </section>

      <section>
        <p className="of-eyebrow">Parameters</p>
        {action.input_schema.length === 0 ? (
          <p className="of-text-muted" style={{ fontSize: 13, marginTop: 6 }}>
            No parameters defined.
          </p>
        ) : (
          <table className="of-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Display name</th>
                <th>Type</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {action.input_schema.map((p) => (
                <tr key={p.name}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{p.name}</td>
                  <td>{p.display_name || <span className="of-text-muted">—</span>}</td>
                  <td>
                    <span className="of-chip">{p.property_type}</span>
                  </td>
                  <td>{p.required ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <p className="of-eyebrow">Runtime config</p>
        <pre
          style={{
            marginTop: 8,
            padding: 12,
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            overflow: 'auto',
            maxHeight: 280,
          }}
        >
          {JSON.stringify(action.config, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function FormPane({ action }: { action: ActionType }) {
  const sections = action.form_schema.sections ?? [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
      <section className="of-panel-muted" style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="of-eyebrow">Form content</p>
        </div>
        {sections.length === 0 ? (
          <p className="of-text-muted" style={{ fontSize: 13, marginTop: 8 }}>
            No sections configured. Use Edit to define a form layout, or
            parameters appear in a single default section.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}>
            {sections.map((s) => (
              <li
                key={s.id}
                className="of-panel-muted"
                style={{ padding: 10, background: 'var(--bg-panel)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span aria-hidden>☰</span>
                  <strong>{s.title || s.id}</strong>
                </div>
                {s.description && (
                  <p className="of-text-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                    {s.description}
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {(s.parameter_names ?? []).map((p) => (
                    <span key={p} className="of-chip" style={{ fontSize: 11 }}>
                      {p}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="of-panel-muted" style={{ padding: 12 }}>
        <p className="of-eyebrow">Form preview</p>
        <div
          style={{
            marginTop: 8,
            padding: 14,
            border: '1px solid var(--border-default)',
            borderRadius: 6,
            background: 'var(--bg-panel)',
          }}
        >
          <strong style={{ display: 'block', fontSize: 14 }}>{action.display_name}</strong>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {action.input_schema.length === 0 ? (
              <p className="of-text-muted" style={{ fontSize: 12 }}>No parameters.</p>
            ) : (
              action.input_schema.map((p) => (
                <label key={p.name} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  <span>
                    {p.display_name || p.name}
                    {p.required && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
                  </span>
                  <input
                    placeholder={`Select an option (${p.property_type})`}
                    disabled
                    className="of-input"
                  />
                </label>
              ))
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
            <button type="button" className="of-button" disabled>Cancel</button>
            <button type="button" className="of-button of-button--success" disabled>Submit</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function RulesPane({ action }: { action: ActionType }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="of-eyebrow">Rules</p>
      <p className="of-text-muted" style={{ fontSize: 13 }}>
        Rules define the runtime behavior of this action: which property mappings are applied, which
        side-effects fire, and how the operation is executed.
      </p>
      <pre
        style={{
          padding: 12,
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          overflow: 'auto',
          maxHeight: 360,
        }}
      >
        {JSON.stringify(action.config, null, 2)}
      </pre>
    </div>
  );
}

function SubmissionPane({ action }: { action: ActionType }) {
  const policy = action.authorization_policy;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section>
        <p className="of-eyebrow">Apply action</p>
        <p className="of-text-muted" style={{ fontSize: 13, marginTop: 6 }}>
          Controls which users can submit this action and under what conditions.
        </p>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: '200px minmax(0, 1fr)',
            gap: 8,
            marginTop: 12,
            fontSize: 13,
          }}
        >
          <dt className="of-text-muted">Confirmation required</dt>
          <dd style={{ margin: 0 }}>{action.confirmation_required ? 'Yes' : 'No'}</dd>
          <dt className="of-text-muted">Permission key</dt>
          <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {action.permission_key || <span className="of-text-muted">—</span>}
          </dd>
          <dt className="of-text-muted">Required permissions</dt>
          <dd style={{ margin: 0 }}>
            {(policy.required_permission_keys ?? []).length === 0 ? (
              <span className="of-text-muted">—</span>
            ) : (
              policy.required_permission_keys!.map((k) => (
                <span key={k} className="of-chip" style={{ marginRight: 4 }}>
                  {k}
                </span>
              ))
            )}
          </dd>
          <dt className="of-text-muted">Any role</dt>
          <dd style={{ margin: 0 }}>
            {(policy.any_role ?? []).join(', ') || <span className="of-text-muted">—</span>}
          </dd>
          <dt className="of-text-muted">All roles</dt>
          <dd style={{ margin: 0 }}>
            {(policy.all_roles ?? []).join(', ') || <span className="of-text-muted">—</span>}
          </dd>
          <dt className="of-text-muted">Markings allowed</dt>
          <dd style={{ margin: 0 }}>
            {(policy.allowed_markings ?? []).join(', ') || <span className="of-text-muted">—</span>}
          </dd>
          <dt className="of-text-muted">Minimum clearance</dt>
          <dd style={{ margin: 0 }}>
            {policy.minimum_clearance || <span className="of-text-muted">—</span>}
          </dd>
          <dt className="of-text-muted">Deny guest sessions</dt>
          <dd style={{ margin: 0 }}>{policy.deny_guest_sessions ? 'Yes' : 'No'}</dd>
        </dl>
      </section>

      <section>
        <p className="of-eyebrow">Authorization policy (raw)</p>
        <pre
          style={{
            padding: 12,
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            overflow: 'auto',
            maxHeight: 240,
            marginTop: 8,
          }}
        >
          {JSON.stringify(policy, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function LogPane({ action }: { action: ActionType }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="of-eyebrow">Action log</p>
      <p className="of-text-muted" style={{ fontSize: 13 }}>
        Each submission of <strong>{action.display_name}</strong> is recorded with the submitting
        user, parameters, and outcome. Use Operate to submit and Monitoring to track aggregate
        success and failure metrics.
      </p>
      <p className="of-text-muted" style={{ fontSize: 12 }}>
        The streaming log surface will land alongside ONT-008 indexing.
      </p>
    </div>
  );
}

function OperatePane({
  action,
  executeTargetId,
  setExecuteTargetId,
  executeParamsJson,
  setExecuteParamsJson,
  executeJustification,
  setExecuteJustification,
  executeResult,
  validateResult,
  batchTargetsText,
  setBatchTargetsText,
  batchResult,
  whatIfBranches,
  whatIfDraftJson,
  setWhatIfDraftJson,
  busy,
  onValidate,
  onExecute,
  onBatch,
  onLoadWhatIf,
  onCreateWhatIf,
  onDeleteWhatIf,
}: DetailViewProps) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gap: 8 }}>
        <p className="of-eyebrow">Operate · {action.display_name}</p>
        <label style={{ fontSize: 13 }}>
          Target object id
          <input
            value={executeTargetId}
            onChange={(e) => setExecuteTargetId(e.target.value)}
            className="of-input"
            style={{ marginTop: 4 }}
          />
        </label>
        <JsonEditor
          label="Parameters JSON"
          value={executeParamsJson}
          onChange={setExecuteParamsJson}
          minHeight={100}
        />
        <label style={{ fontSize: 13 }}>
          Justification
          <input
            value={executeJustification}
            onChange={(e) => setExecuteJustification(e.target.value)}
            className="of-input"
            style={{ marginTop: 4 }}
          />
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => void onValidate()} disabled={busy} className="of-button">
            Validate
          </button>
          <button
            type="button"
            onClick={() => void onExecute()}
            disabled={busy}
            className="of-button of-button--primary"
          >
            Execute
          </button>
        </div>
        {!!validateResult && (
          <ResultBlock label="Validate" tone="muted" data={validateResult} />
        )}
        {!!executeResult && <ResultBlock label="Execute" tone="dark" data={executeResult} />}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <p className="of-eyebrow">Batch execute</p>
        <textarea
          value={batchTargetsText}
          onChange={(e) => setBatchTargetsText(e.target.value)}
          placeholder="One target id per line"
          className="of-input"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, minHeight: 80 }}
        />
        <div>
          <button
            type="button"
            onClick={() => void onBatch()}
            disabled={busy}
            className="of-button"
          >
            Execute batch
          </button>
        </div>
        {!!batchResult && <ResultBlock label="Batch" tone="dark" data={batchResult} />}
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <p className="of-eyebrow">What-if branches</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => void onLoadWhatIf()}
            disabled={busy}
            className="of-button"
          >
            Load branches
          </button>
        </div>
        {whatIfBranches.length > 0 && (
          <ul style={{ paddingLeft: 18, fontSize: 12, margin: 0 }}>
            {whatIfBranches.map((b) => (
              <li key={b.id}>
                <strong>{b.name}</strong> · {b.target_object_id ?? '—'}
                <button
                  type="button"
                  onClick={() => void onDeleteWhatIf(b.id)}
                  disabled={busy}
                  className="of-button"
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    color: '#b91c1c',
                    borderColor: '#fecaca',
                  }}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <JsonEditor value={whatIfDraftJson} onChange={setWhatIfDraftJson} minHeight={100} />
        <div>
          <button
            type="button"
            onClick={() => void onCreateWhatIf()}
            disabled={busy}
            className="of-button of-button--primary"
          >
            Create branch
          </button>
        </div>
      </section>
    </div>
  );
}

function MonitoringPane({
  action,
  metrics,
  metricsWindow,
  setMetricsWindow,
  busy,
  onLoadMetrics,
}: DetailViewProps) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="of-eyebrow">Action monitoring · {action.display_name}</p>
      <p className="of-text-muted" style={{ fontSize: 13 }}>
        Configure monitoring rules (alerts on action errors and 90th percentile execution time
        thresholds) and inspect aggregate metrics.
      </p>
      <label style={{ fontSize: 13, display: 'grid', gap: 4 }}>
        Window (e.g. 30d, 12h, 45m)
        <input
          value={metricsWindow}
          onChange={(e) => setMetricsWindow(e.target.value)}
          className="of-input"
          style={{ maxWidth: 160 }}
        />
      </label>
      <div>
        <button
          type="button"
          onClick={() => void onLoadMetrics()}
          disabled={busy}
          className="of-button"
        >
          Load metrics
        </button>
      </div>
      {metrics && (
        <div
          className="of-panel-muted"
          style={{
            padding: 12,
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          }}
        >
          <MetricCard label="Successes" value={metrics.success_count} tone="success" />
          <MetricCard label="Failures" value={metrics.failure_count} tone="danger" />
          <MetricCard
            label="p95 duration"
            value={metrics.p95_duration_ms !== null ? `${metrics.p95_duration_ms} ms` : '—'}
          />
          <MetricCard label="Window" value={metrics.window} />
        </div>
      )}
      {metrics && Object.keys(metrics.failure_categories).length > 0 && (
        <section>
          <p className="of-eyebrow">Failure categories</p>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 12 }}>
            {Object.entries(metrics.failure_categories).map(([cat, count]) => (
              <li key={cat}>
                <strong>{cat}</strong>: {count}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'success' | 'danger';
}) {
  const color =
    tone === 'success' ? 'var(--status-success)' : tone === 'danger' ? 'var(--status-danger)' : undefined;
  return (
    <div className="of-panel" style={{ padding: 12 }}>
      <p className="of-eyebrow">{label}</p>
      <p style={{ marginTop: 6, fontSize: 22, fontWeight: 600, color }}>{value}</p>
    </div>
  );
}

function ResultBlock({
  label,
  tone,
  data,
}: {
  label: string;
  tone: 'muted' | 'dark';
  data: unknown;
}) {
  const style: CSSProperties =
    tone === 'dark'
      ? { background: '#0c0a09', color: '#a5f3fc' }
      : { background: 'var(--bg-subtle)', color: 'var(--text-default)' };
  return (
    <pre
      style={{
        ...style,
        marginTop: 4,
        padding: 10,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        borderRadius: 12,
        overflow: 'auto',
        maxHeight: 240,
      }}
    >
      {label}: {JSON.stringify(data, null, 2)}
    </pre>
  );
}

interface ActionTypeEditorProps {
  open: boolean;
  action: ActionType | null;
  draft: Draft;
  objectTypes: ObjectType[];
  busy: boolean;
  error: string;
  onDraftChange: (next: SetStateAction<Draft>) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
}

function ActionTypeEditor({
  open,
  action,
  draft,
  objectTypes,
  busy,
  error,
  onDraftChange,
  onClose,
  onSave,
  onDelete,
}: ActionTypeEditorProps) {
  const dirty = useMemo(() => isDraftDirty(draft, action), [action, draft]);
  const status = busy ? 'saving' : error ? 'error' : dirty ? 'dirty' : 'idle';
  const tone = actionStatusTone(status);
  const title = draft.id ? `Edit action type: ${draft.display_name || draft.name}` : 'New action type';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave();
  }

  return (
    <Drawer open={open} title={title} width="720px" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <header style={{ display: 'grid', gap: 8, paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <p className="of-eyebrow" style={{ color: '#93c5fd' }}>
                Action type definition
              </p>
              <h2
                style={{
                  margin: '4px 0 0',
                  fontSize: 20,
                  lineHeight: 1.2,
                  color: '#f8fafc',
                  overflowWrap: 'anywhere',
                }}
              >
                {draft.display_name || draft.name}
              </h2>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 11,
                  color: '#94a3b8',
                  fontFamily: 'var(--font-mono)',
                  overflowWrap: 'anywhere',
                }}
              >
                {draft.id ?? 'unsaved'}
              </p>
            </div>
            <span
              className="of-chip"
              style={{ background: tone.background, color: tone.color, borderColor: 'transparent' }}
            >
              {status}
            </span>
          </div>
        </header>

        {error && (
          <div className="of-status-danger" style={{ padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Name
            <input
              value={draft.name}
              disabled={Boolean(draft.id)}
              onChange={(e) => onDraftChange((d) => ({ ...d, name: e.target.value }))}
              className="of-input"
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Display name
            <input
              value={draft.display_name}
              onChange={(e) => onDraftChange((d) => ({ ...d, display_name: e.target.value }))}
              className="of-input"
            />
          </label>
        </div>

        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Description
          <input
            value={draft.description}
            onChange={(e) => onDraftChange((d) => ({ ...d, description: e.target.value }))}
            className="of-input"
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Object type
            <select
              value={draft.object_type_id}
              disabled={Boolean(draft.id)}
              onChange={(e) => onDraftChange((d) => ({ ...d, object_type_id: e.target.value }))}
              className="of-input"
            >
              <option value="">— pick —</option>
              {objectTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name} ({t.name})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Operation kind
            <select
              value={draft.operation_kind}
              onChange={(e) =>
                onDraftChange((d) => ({ ...d, operation_kind: e.target.value as ActionOperationKind }))
              }
              className="of-input"
            >
              {OPERATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            Permission key
            <input
              value={draft.permission_key}
              onChange={(e) => onDraftChange((d) => ({ ...d, permission_key: e.target.value }))}
              className="of-input"
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 30, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={draft.confirmation_required}
              onChange={(e) =>
                onDraftChange((d) => ({ ...d, confirmation_required: e.target.checked }))
              }
            />
            Confirmation required
          </label>
        </div>

        <JsonEditor
          label="Input schema JSON"
          value={draft.input_schema_json}
          onChange={(v) => onDraftChange((d) => ({ ...d, input_schema_json: v }))}
          minHeight={120}
        />
        <JsonEditor
          label="Form schema JSON"
          value={draft.form_schema_json}
          onChange={(v) => onDraftChange((d) => ({ ...d, form_schema_json: v }))}
          minHeight={90}
        />
        <JsonEditor
          label="Config JSON"
          value={draft.config_json}
          onChange={(v) => onDraftChange((d) => ({ ...d, config_json: v }))}
          minHeight={150}
        />
        <JsonEditor
          label="Authorization policy JSON"
          value={draft.authorization_policy_json}
          onChange={(v) => onDraftChange((d) => ({ ...d, authorization_policy_json: v }))}
          minHeight={90}
        />

        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            paddingTop: 10,
            borderTop: '1px solid #1e293b',
          }}
        >
          <div>
            {draft.id && (
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={busy}
                className="of-button"
                style={{ color: '#fecaca', borderColor: '#7f1d1d', background: '#450a0a' }}
              >
                Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} disabled={busy} className="of-button">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !dirty}
              className="of-button of-button--primary"
            >
              {busy ? 'Saving...' : draft.id ? 'Save action type' : 'Create action type'}
            </button>
          </div>
        </footer>
      </form>
    </Drawer>
  );
}

interface CreateActionWizardProps {
  open: boolean;
  objectTypes: ObjectType[];
  draft: Draft;
  onDraftChange: (next: SetStateAction<Draft>) => void;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  busy: boolean;
  error: string;
}

function CreateActionWizard({
  open,
  objectTypes,
  draft,
  onDraftChange,
  onClose,
  onSubmit,
  busy,
  error,
}: CreateActionWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [family, setFamily] = useState<ActionFamily>('object');
  const [objectMode, setObjectMode] = useState<ObjectMode>('create');
  const [interfaceMode, setInterfaceMode] = useState<InterfaceMode>('create');

  useEffect(() => {
    if (open) {
      setStep(1);
      setFamily('object');
      setObjectMode('create');
      setInterfaceMode('create');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const mode = family === 'object' ? objectMode : family === 'interface' ? interfaceMode : '';
    const operation_kind = FAMILY_TO_OPERATION_KIND[family](mode);
    onDraftChange((d) => ({ ...d, operation_kind }));
  }, [open, family, objectMode, interfaceMode, onDraftChange]);

  if (!open) return null;

  const canStep1 = (() => {
    if (family === 'object' || family === 'link' || family === 'interface') {
      return Boolean(draft.object_type_id);
    }
    return true;
  })();
  const canStep3 = draft.name.trim().length > 0 && draft.display_name.trim().length > 0;

  function next() {
    setStep((s) => (Math.min(5, s + 1) as WizardStep));
  }
  function back() {
    setStep((s) => (Math.max(1, s - 1) as WizardStep));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create a new action type"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(960px, 100%)',
          maxHeight: 'calc(100vh - 48px)',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          background: 'var(--bg-panel)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 24px 48px rgba(15,23,42,0.32)',
          border: '1px solid var(--border-default)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <strong style={{ fontSize: 14 }}>Create a new action type</strong>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="of-button of-button--ghost"
          >
            ×
          </button>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '220px minmax(0, 1fr)',
            minHeight: 0,
          }}
        >
          <aside
            style={{
              borderRight: '1px solid var(--border-default)',
              padding: 18,
              background: 'var(--bg-panel-muted)',
            }}
          >
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {(
                [
                  { n: 1, label: 'Action type' },
                  { n: 2, label: 'Mapping' },
                  { n: 3, label: 'Metadata' },
                  { n: 4, label: 'Submission criteria' },
                  { n: 5, label: 'Save location' },
                ] as Array<{ n: WizardStep; label: string }>
              ).map((s) => (
                <li key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      background: step === s.n ? '#2d72d2' : step > s.n ? '#d1d5db' : '#e5e7eb',
                      color: step === s.n ? '#fff' : '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {s.n}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color:
                        step === s.n
                          ? 'var(--status-info)'
                          : step > s.n
                            ? 'var(--text-default)'
                            : 'var(--text-muted)',
                      fontWeight: step === s.n ? 600 : 500,
                    }}
                  >
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
          </aside>

          <div style={{ padding: 22, overflow: 'auto' }}>
            {error && (
              <div
                className="of-status-danger"
                style={{ padding: 10, borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 12 }}
              >
                {error}
              </div>
            )}

            {step === 1 && (
              <WizardStep1
                family={family}
                onFamilyChange={setFamily}
                objectMode={objectMode}
                onObjectMode={setObjectMode}
                interfaceMode={interfaceMode}
                onInterfaceMode={setInterfaceMode}
                draft={draft}
                onDraftChange={onDraftChange}
                objectTypes={objectTypes}
              />
            )}
            {step === 2 && <WizardStep2 draft={draft} onDraftChange={onDraftChange} />}
            {step === 3 && <WizardStep3 draft={draft} onDraftChange={onDraftChange} />}
            {step === 4 && <WizardStep4 draft={draft} onDraftChange={onDraftChange} />}
            {step === 5 && <WizardStep5 draft={draft} family={family} objectTypes={objectTypes} />}
          </div>
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            borderTop: '1px solid var(--border-default)',
          }}
        >
          <button type="button" className="of-button of-button--ghost" onClick={onClose}>
            Skip
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 && (
              <button type="button" className="of-button" onClick={back}>
                Back
              </button>
            )}
            {step < 5 ? (
              <button
                type="button"
                className="of-button of-button--primary"
                onClick={next}
                disabled={(step === 1 && !canStep1) || (step === 3 && !canStep3)}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="of-button of-button--primary"
                onClick={() => void onSubmit()}
                disabled={busy}
              >
                {busy ? 'Saving...' : 'Create action type'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function WizardStep1({
  family,
  onFamilyChange,
  objectMode,
  onObjectMode,
  interfaceMode,
  onInterfaceMode,
  draft,
  onDraftChange,
  objectTypes,
}: {
  family: ActionFamily;
  onFamilyChange: (f: ActionFamily) => void;
  objectMode: ObjectMode;
  onObjectMode: (m: ObjectMode) => void;
  interfaceMode: InterfaceMode;
  onInterfaceMode: (m: InterfaceMode) => void;
  draft: Draft;
  onDraftChange: (next: SetStateAction<Draft>) => void;
  objectTypes: ObjectType[];
}) {
  const showObjectType = family === 'object' || family === 'link' || family === 'interface';
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header>
        <p className="of-eyebrow">Step 1</p>
        <h2 className="of-heading-lg" style={{ margin: '4px 0 0' }}>
          Select an action type you want to configure
        </h2>
        <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
          Enable users to make changes to the ontology by configuring actions they can execute.
        </p>
      </header>

      <div className="of-tabbar" role="tablist" aria-label="Action family">
        {FAMILY_TABS.map((f) => {
          const active = family === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? 'of-tab of-tab-active' : 'of-tab'}
              onClick={() => onFamilyChange(f.id)}
            >
              {familyChipLabel(f.id)}
            </button>
          );
        })}
      </div>

      {showObjectType && (
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>Object type</span>
          <select
            value={draft.object_type_id}
            onChange={(e) => onDraftChange((d) => ({ ...d, object_type_id: e.target.value }))}
            className="of-select"
          >
            <option value="">Choose an object type</option>
            {objectTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.display_name} ({t.name})
              </option>
            ))}
          </select>
        </label>
      )}

      {family === 'object' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend style={{ fontWeight: 600, fontSize: 13, padding: 0 }}>Object actions</legend>
          {OBJECT_MODES.map((mode) => (
            <RadioCard
              key={mode.id}
              checked={objectMode === mode.id}
              onChange={() => onObjectMode(mode.id)}
              icon={mode.icon}
              label={mode.label}
              description={mode.description}
            />
          ))}
        </fieldset>
      )}

      {family === 'interface' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <legend style={{ fontWeight: 600, fontSize: 13, padding: 0 }}>Interface action</legend>
          {INTERFACE_MODES.map((mode) => (
            <RadioCard
              key={mode.id}
              checked={interfaceMode === mode.id}
              onChange={() => onInterfaceMode(mode.id)}
              icon="◇"
              label={mode.label}
              description={mode.description}
            />
          ))}
        </fieldset>
      )}

      {family === 'link' && (
        <p className="of-text-muted" style={{ fontSize: 13 }}>
          A link action will create or remove a link between two object instances. The link type and
          its endpoints are configured in the Mapping step.
        </p>
      )}

      {family === 'function' && (
        <p className="of-text-muted" style={{ fontSize: 13 }}>
          A function-backed action runs a registered Foundry function on submission. Configure the
          function reference and parameter mapping in the next step.
        </p>
      )}

      {family === 'webhook' && (
        <p className="of-text-muted" style={{ fontSize: 13 }}>
          A webhook action invokes an external HTTP endpoint with the submission payload. Configure
          the destination and headers in the next step.
        </p>
      )}

      {family === 'notification' && (
        <p className="of-text-muted" style={{ fontSize: 13 }}>
          A notification action delivers a message to users or groups. The delivery channel is
          configured as a webhook side-effect in the next step.
        </p>
      )}
    </div>
  );
}

function RadioCard({
  checked,
  onChange,
  icon,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  icon: ReactNode;
  label: string;
  description: string;
}) {
  return (
    <label
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 24px minmax(0, 1fr)',
        gap: 12,
        alignItems: 'start',
        padding: 12,
        border: `1px solid ${checked ? 'var(--status-info)' : 'var(--border-default)'}`,
        borderRadius: 6,
        background: checked ? 'rgba(63, 123, 224, 0.06)' : 'var(--bg-panel)',
        cursor: 'pointer',
      }}
    >
      <input type="radio" checked={checked} onChange={onChange} />
      <span aria-hidden style={{ fontSize: 16, color: 'var(--text-strong)' }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {description}
        </p>
      </div>
    </label>
  );
}

function WizardStep2({
  draft,
  onDraftChange,
}: {
  draft: Draft;
  onDraftChange: (next: SetStateAction<Draft>) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header>
        <p className="of-eyebrow">Step 2</p>
        <h2 className="of-heading-lg" style={{ margin: '4px 0 0' }}>
          Define parameters and runtime mapping
        </h2>
        <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
          The input schema lists parameters users will fill on submission. The runtime config maps
          those parameters to the operation that the action performs.
        </p>
      </header>
      <JsonEditor
        label="Input schema JSON"
        value={draft.input_schema_json}
        onChange={(v) => onDraftChange((d) => ({ ...d, input_schema_json: v }))}
        minHeight={140}
      />
      <JsonEditor
        label="Runtime config JSON"
        value={draft.config_json}
        onChange={(v) => onDraftChange((d) => ({ ...d, config_json: v }))}
        minHeight={180}
      />
    </div>
  );
}

function WizardStep3({
  draft,
  onDraftChange,
}: {
  draft: Draft;
  onDraftChange: (next: SetStateAction<Draft>) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header>
        <p className="of-eyebrow">Step 3</p>
        <h2 className="of-heading-lg" style={{ margin: '4px 0 0' }}>
          Metadata
        </h2>
        <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
          Provide the action name (used as identifier), a friendly display name, and an optional
          description. The display name appears on the submission form and in the action log.
        </p>
      </header>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Name
        <input
          value={draft.name}
          onChange={(e) => onDraftChange((d) => ({ ...d, name: e.target.value }))}
          className="of-input"
          placeholder="my_action"
        />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Display name
        <input
          value={draft.display_name}
          onChange={(e) => onDraftChange((d) => ({ ...d, display_name: e.target.value }))}
          className="of-input"
          placeholder="My action"
        />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Description
        <textarea
          value={draft.description}
          onChange={(e) => onDraftChange((d) => ({ ...d, description: e.target.value }))}
          className="of-textarea"
          style={{ minHeight: 80 }}
        />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Permission key
        <input
          value={draft.permission_key}
          onChange={(e) => onDraftChange((d) => ({ ...d, permission_key: e.target.value }))}
          className="of-input"
          placeholder="ontology.actions.run"
        />
      </label>
    </div>
  );
}

function WizardStep4({
  draft,
  onDraftChange,
}: {
  draft: Draft;
  onDraftChange: (next: SetStateAction<Draft>) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header>
        <p className="of-eyebrow">Step 4</p>
        <h2 className="of-heading-lg" style={{ margin: '4px 0 0' }}>
          Submission criteria
        </h2>
        <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
          Define who can submit this action and under what conditions. Match-all conditions and
          authorization policy fields enforce role and permission requirements server-side.
        </p>
      </header>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={draft.confirmation_required}
          onChange={(e) =>
            onDraftChange((d) => ({ ...d, confirmation_required: e.target.checked }))
          }
        />
        Require confirmation before executing
      </label>
      <JsonEditor
        label="Authorization policy JSON"
        value={draft.authorization_policy_json}
        onChange={(v) => onDraftChange((d) => ({ ...d, authorization_policy_json: v }))}
        minHeight={140}
      />
      <JsonEditor
        label="Form schema JSON"
        value={draft.form_schema_json}
        onChange={(v) => onDraftChange((d) => ({ ...d, form_schema_json: v }))}
        minHeight={120}
      />
    </div>
  );
}

function WizardStep5({
  draft,
  family,
  objectTypes,
}: {
  draft: Draft;
  family: ActionFamily;
  objectTypes: ObjectType[];
}) {
  const objectType = objectTypes.find((t) => t.id === draft.object_type_id);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header>
        <p className="of-eyebrow">Step 5</p>
        <h2 className="of-heading-lg" style={{ margin: '4px 0 0' }}>
          Review and save
        </h2>
        <p className="of-text-muted" style={{ marginTop: 6, fontSize: 13 }}>
          Confirm the action type definition. The action will be registered in the active ontology
          immediately. Permissions, form layout, and runtime mapping can be revised later.
        </p>
      </header>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '180px minmax(0, 1fr)',
          gap: 8,
          fontSize: 13,
        }}
      >
        <dt className="of-text-muted">Family</dt>
        <dd style={{ margin: 0 }}>{familyChipLabel(family)}</dd>
        <dt className="of-text-muted">Operation kind</dt>
        <dd style={{ margin: 0 }}>{draft.operation_kind}</dd>
        <dt className="of-text-muted">Object type</dt>
        <dd style={{ margin: 0 }}>
          {objectType ? `${objectType.display_name} (${objectType.name})` : draft.object_type_id || <span className="of-text-muted">—</span>}
        </dd>
        <dt className="of-text-muted">Name</dt>
        <dd style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>{draft.name}</dd>
        <dt className="of-text-muted">Display name</dt>
        <dd style={{ margin: 0 }}>{draft.display_name}</dd>
        <dt className="of-text-muted">Description</dt>
        <dd style={{ margin: 0 }}>
          {draft.description || <span className="of-text-muted">—</span>}
        </dd>
        <dt className="of-text-muted">Permission key</dt>
        <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {draft.permission_key || <span className="of-text-muted">—</span>}
        </dd>
        <dt className="of-text-muted">Confirmation</dt>
        <dd style={{ margin: 0 }}>{draft.confirmation_required ? 'Required' : 'None'}</dd>
      </dl>
    </div>
  );
}

function isDraftDirty(draft: Draft, action: ActionType | null) {
  const baseline = action ? draftFromAction(action) : emptyDraft();
  return JSON.stringify(draft) !== JSON.stringify(baseline);
}

function actionStatusTone(status: 'idle' | 'dirty' | 'saving' | 'error') {
  if (status === 'error') return { background: '#7f1d1d', color: '#fecaca' };
  if (status === 'saving') return { background: '#1d4ed8', color: '#dbeafe' };
  if (status === 'dirty') return { background: '#78350f', color: '#fde68a' };
  return { background: '#1f2937', color: '#cbd5e1' };
}
