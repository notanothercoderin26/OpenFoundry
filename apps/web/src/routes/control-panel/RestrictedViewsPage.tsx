import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  buildRestrictedView,
  checkRestrictedViewTransformInput,
  createRestrictedView,
  deleteRestrictedView,
  listRestrictedViews,
  updateRestrictedView,
  type RestrictedViewRecord,
} from '@/lib/api/restricted-views';
import { GranularPolicyEditor } from '@/lib/components/restricted-views/GranularPolicyEditor';
import { Glyph } from '@/lib/components/ui/Glyph';
import { DEFAULT_GRANULAR_POLICY, formatGranularPolicy, validateGranularPolicyText } from '@/lib/restricted-views/granularPolicy';
import { useCurrentUser } from '@stores/auth';

const QUERY_KEY = ['control-panel', 'restricted-views'] as const;

const DEFAULT_FORM = {
  id: '',
  name: '',
  description: '',
  backing_dataset_rid: '',
  backing_dataset_branch: 'master',
  project_rid: '',
  folder_rid: '',
  path: '',
  owner_ids: '',
  resource: 'datasets',
  action: 'read',
  conditions_json: JSON.stringify({ subject: {}, resource: {} }, null, 2),
  policy_json: formatGranularPolicy(DEFAULT_GRANULAR_POLICY),
  row_filter: '',
  hidden_columns: '',
  marking_columns: '',
  allowed_org_ids: '',
  allowed_markings: 'public',
  assumed_markings: 'public',
  output_metadata_json: JSON.stringify({ output_kind: 'restricted_view' }, null, 2),
  view_metadata_json: JSON.stringify({ view_kind: 'dataset_backed' }, null, 2),
  consumer_mode_enabled: false,
  allow_guest_access: false,
  enabled: true,
};

type FormState = typeof DEFAULT_FORM;

export function RestrictedViewsPage() {
  const currentUser = useCurrentUser();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [transformCheck, setTransformCheck] = useState('');

  const roles = currentUser?.roles ?? [];
  const permissions = currentUser?.permissions ?? [];
  const canRead = canRestrictedView(roles, permissions, [
    'restricted_view:read',
    'restricted_view_policy:read',
    'policies:read',
    'control_panel:write',
  ]);
  const canCreate = canRestrictedView(roles, permissions, ['restricted_view:manage', 'policies:write', 'control_panel:write']) ||
    (
      canRestrictedView(roles, permissions, ['restricted_view:create', 'restricted_view:create_resource']) &&
      canRestrictedView(roles, permissions, ['dataset:create_restricted_view', 'dataset:restricted_view:create'])
    );
  const canEditPolicy = canRestrictedView(roles, permissions, [
    'restricted_view_policy:edit',
    'restricted_view:edit',
    'restricted_view:manage',
    'policies:write',
    'control_panel:write',
  ]);
  const canBuild = canRestrictedView(roles, permissions, ['restricted_view:build', 'restricted_view:manage', 'control_panel:write']);
  const canManage = canRestrictedView(roles, permissions, ['restricted_view:manage', 'policies:write', 'control_panel:write']);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listRestrictedViews(),
    enabled: canRead,
  });
  const views = query.data ?? [];
  const selected = useMemo(
    () => views.find((view) => view.id === selectedId) ?? null,
    [selectedId, views],
  );

  useEffect(() => {
    if (!selectedId && !form.id && views.length > 0) {
      setSelectedId(views[0].id);
      setForm(formFromView(views[0]));
    }
  }, [form.id, selectedId, views]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return views;
    return views.filter((view) =>
      [
        view.name,
        view.backing_dataset_rid,
        view.project_rid ?? '',
        view.folder_rid ?? '',
        view.path ?? '',
        view.allowed_markings.join(' '),
        view.assumed_markings.join(' '),
      ].join(' ').toLowerCase().includes(q),
    );
  }, [filter, views]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = buildRequest(form);
      if (!form.id) {
        return createRestrictedView({
          ...body,
          name: form.name.trim(),
          backing_dataset_rid: form.backing_dataset_rid.trim(),
          enabled: form.enabled,
        });
      }
      return updateRestrictedView(form.id, body);
    },
    onSuccess: async (view) => {
      setNotice(form.id ? 'Restricted view updated.' : 'Restricted view created.');
      setError('');
      setSelectedId(view.id);
      setForm(formFromView(view));
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (cause) => {
      setNotice('');
      setError(cause instanceof Error ? cause.message : 'Save failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRestrictedView(id),
    onSuccess: async () => {
      setSelectedId(null);
      setForm(DEFAULT_FORM);
      setNotice('Restricted view deleted.');
      setError('');
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Delete failed'),
  });

  const buildMutation = useMutation({
    mutationFn: (view: RestrictedViewRecord) =>
      buildRestrictedView(view.id, {
        branch_name: view.backing_dataset_branch ?? 'master',
        reason: 'manual rebuild from Control Panel',
        output_metadata: view.output_metadata,
      }),
    onSuccess: async (view) => {
      setSelectedId(view.id);
      setForm(formFromView(view));
      setNotice('Restricted view build recorded.');
      setError('');
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Build failed'),
  });

  const transformCheckMutation = useMutation({
    mutationFn: (id: string) => checkRestrictedViewTransformInput(id),
    onSuccess: (result) => {
      setTransformCheck(result.reason);
      setNotice('');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Transform check failed'),
  });

  function startCreate() {
    setSelectedId(null);
    setForm(DEFAULT_FORM);
    setTransformCheck('');
    setNotice('');
    setError('');
  }

  function selectView(view: RestrictedViewRecord) {
    setSelectedId(view.id);
    setForm(formFromView(view));
    setTransformCheck('');
    setNotice('');
    setError('');
  }

  if (!canRead) {
    return (
      <section className="of-page" style={{ padding: 24 }}>
        <div className="of-panel" style={{ padding: 18, maxWidth: 720 }}>
          <p className="of-eyebrow">Restricted views</p>
          <h1 className="of-heading-lg">Permission required</h1>
          <p className="of-text-muted">
            This module requires `restricted_view:read`, `restricted_view_policy:read`, `policies:read`,
            or `control_panel:write`.
          </p>
          <Link to="/control-panel" className="of-button">Back to Control Panel</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">Control Panel</p>
          <h1 className="of-heading-xl" style={{ marginTop: 4 }}>Restricted views</h1>
          <p className="of-text-muted" style={{ marginTop: 6, maxWidth: 780 }}>
            Dataset-backed restricted view resources with policy, placement, owners, markings, build metadata, and transaction history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/control-panel" className="of-button">
            <Glyph name="chevron-left" size={16} /> Control Panel
          </Link>
          {canCreate && (
            <button type="button" className="of-button of-btn-primary" onClick={startCreate}>
              <Glyph name="plus" size={16} /> New view
            </button>
          )}
        </div>
      </header>

      {notice && <div className="of-status-success" style={{ padding: '10px 12px', borderRadius: 8 }}>{notice}</div>}
      {error && <div className="of-status-danger" style={{ padding: '10px 12px', borderRadius: 8 }}>{error}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Glyph name="search" size={16} tone="#64748b" />
            <input
              className="of-input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search restricted views..."
            />
          </label>
          {query.isLoading ? (
            <p className="of-text-muted">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="of-text-muted">No restricted views found.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {filtered.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => selectView(view)}
                  className="of-panel-muted"
                  style={{
                    padding: 12,
                    textAlign: 'left',
                    border: selected?.id === view.id ? '1px solid #2563eb' : '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{view.name}</strong>
                    <span className={`of-chip ${view.enabled ? 'of-status-success' : 'of-status-warning'}`}>
                      {view.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="of-text-muted" style={{ margin: '6px 0 0', fontSize: 12, wordBreak: 'break-all' }}>
                    {view.backing_dataset_rid || 'No backing dataset'}
                  </p>
                  <div className="settings-chip-row" style={{ marginTop: 8 }}>
                    <span className="of-chip">{view.build_status || 'not_built'}</span>
                    <span className="of-chip">transactions {view.transactions.length}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <RestrictedViewForm
            form={form}
            selected={selected}
            canCreate={canCreate}
            canEditPolicy={canEditPolicy}
            canManage={canManage}
            busy={saveMutation.isPending}
            onChange={setForm}
            onSave={() => saveMutation.mutate()}
            onDelete={() => form.id && deleteMutation.mutate(form.id)}
          />

          {selected && (
            <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <p className="of-eyebrow">Builds and transactions</p>
                  <h2 className="of-heading-lg" style={{ marginTop: 4 }}>View output state</h2>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="of-button"
                    disabled={transformCheckMutation.isPending}
                    onClick={() => transformCheckMutation.mutate(selected.id)}
                  >
                    <Glyph name="lock" size={16} /> Transform input
                  </button>
                  {canBuild && (
                    <button
                      type="button"
                      className="of-button of-btn-primary"
                      disabled={buildMutation.isPending}
                      onClick={() => buildMutation.mutate(selected)}
                    >
                      <Glyph name="run" size={16} /> {buildMutation.isPending ? 'Building...' : 'Build'}
                    </button>
                  )}
                </div>
              </div>
              <div className="of-panel-muted" style={{ padding: 12 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {selected.transform_input_blocked ? 'Transform input blocked' : 'Transform input policy unset'}
                </p>
                <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {transformCheck || 'Restricted views are marked as non-transform inputs to preserve reproducible build semantics.'}
                </p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="settings-table">
                  <thead>
                    <tr>
                      <th>Transaction</th>
                      <th>Status</th>
                      <th>Branch</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.transactions.length === 0 ? (
                      <tr><td colSpan={4} className="of-text-muted">No transactions yet.</td></tr>
                    ) : selected.transactions.slice().reverse().map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{transaction.kind}</td>
                        <td>{transaction.status}</td>
                        <td>{transaction.branch_name ?? '-'}</td>
                        <td>{formatDate(transaction.completed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </section>
    </section>
  );
}

function RestrictedViewForm(props: {
  form: FormState;
  selected: RestrictedViewRecord | null;
  canCreate: boolean;
  canEditPolicy: boolean;
  canManage: boolean;
  busy: boolean;
  onChange: (next: FormState) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const { form, selected, canCreate, canEditPolicy, canManage, busy, onChange, onSave, onDelete } = props;
  const writable = form.id ? canEditPolicy || canManage : canCreate;
  const policyErrors = validateGranularPolicyText(form.policy_json);
  return (
    <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow">{form.id ? 'Edit resource' : 'Create resource'}</p>
          <h2 className="of-heading-lg" style={{ marginTop: 4 }}>{form.id ? form.name : 'New restricted view'}</h2>
        </div>
        <div className="settings-chip-row">
          {selected?.last_built_at && <span className="of-chip">Built {formatDate(selected.last_built_at)}</span>}
          {selected?.created_by && <span className="of-chip">Owner seed {selected.created_by.slice(0, 8)}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <TextField label="Name" value={form.name} disabled={!writable} onChange={(name) => onChange({ ...form, name })} />
        <TextField label="Backing dataset RID" value={form.backing_dataset_rid} disabled={!writable} onChange={(backing_dataset_rid) => onChange({ ...form, backing_dataset_rid })} />
        <TextField label="Dataset branch" value={form.backing_dataset_branch} disabled={!writable} onChange={(backing_dataset_branch) => onChange({ ...form, backing_dataset_branch })} />
        <TextField label="Project RID" value={form.project_rid} disabled={!writable} onChange={(project_rid) => onChange({ ...form, project_rid })} />
        <TextField label="Folder RID" value={form.folder_rid} disabled={!writable} onChange={(folder_rid) => onChange({ ...form, folder_rid })} />
        <TextField label="Path" value={form.path} disabled={!writable} onChange={(path) => onChange({ ...form, path })} />
        <TextField label="Owners" value={form.owner_ids} disabled={!writable} onChange={(owner_ids) => onChange({ ...form, owner_ids })} />
        <TextField label="Assumed markings" value={form.assumed_markings} disabled={!writable} onChange={(assumed_markings) => onChange({ ...form, assumed_markings })} />
        <TextField label="Allowed org IDs" value={form.allowed_org_ids} disabled={!writable} onChange={(allowed_org_ids) => onChange({ ...form, allowed_org_ids })} />
        <TextField label="Allowed markings" value={form.allowed_markings} disabled={!writable} onChange={(allowed_markings) => onChange({ ...form, allowed_markings })} />
        <TextField label="Hidden columns" value={form.hidden_columns} disabled={!writable} onChange={(hidden_columns) => onChange({ ...form, hidden_columns })} />
        <TextField label="Marking columns" value={form.marking_columns} disabled={!writable} onChange={(marking_columns) => onChange({ ...form, marking_columns })} />
        <TextField label="Row filter" value={form.row_filter} disabled={!writable} onChange={(row_filter) => onChange({ ...form, row_filter })} />
      </div>

      <GranularPolicyEditor
        value={form.policy_json}
        disabled={!writable}
        onChange={(policy_json) => onChange({ ...form, policy_json })}
      />

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <JsonField label="Policy JSON" value={form.policy_json} disabled={!writable} onChange={(policy_json) => onChange({ ...form, policy_json })} />
        <JsonField label="Conditions JSON" value={form.conditions_json} disabled={!writable} onChange={(conditions_json) => onChange({ ...form, conditions_json })} />
        <JsonField label="Output metadata" value={form.output_metadata_json} disabled={!writable} onChange={(output_metadata_json) => onChange({ ...form, output_metadata_json })} />
        <JsonField label="View metadata" value={form.view_metadata_json} disabled={!writable} onChange={(view_metadata_json) => onChange({ ...form, view_metadata_json })} />
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <CheckField label="Enabled" checked={form.enabled} disabled={!writable} onChange={(enabled) => onChange({ ...form, enabled })} />
        <CheckField label="Guest access" checked={form.allow_guest_access} disabled={!writable} onChange={(allow_guest_access) => onChange({ ...form, allow_guest_access })} />
        <CheckField label="Consumer mode" checked={form.consumer_mode_enabled} disabled={!writable} onChange={(consumer_mode_enabled) => onChange({ ...form, consumer_mode_enabled })} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="of-button of-btn-primary"
          disabled={!writable || busy || !form.name.trim() || !form.backing_dataset_rid.trim() || policyErrors.length > 0}
          onClick={onSave}
        >
          <Glyph name="check" size={16} /> {busy ? 'Saving...' : 'Save'}
        </button>
        {form.id && canManage && (
          <button type="button" className="of-button of-btn-danger" onClick={onDelete}>
            <Glyph name="trash" size={16} /> Delete
          </button>
        )}
      </div>
    </section>
  );
}

function TextField(props: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <span style={{ fontWeight: 600 }}>{props.label}</span>
      <input className="of-input" value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function JsonField(props: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <span style={{ fontWeight: 600 }}>{props.label}</span>
      <textarea
        className="of-textarea"
        rows={8}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
      />
    </label>
  );
}

function CheckField(props: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      {props.label}
    </label>
  );
}

function formFromView(view: RestrictedViewRecord): FormState {
  return {
    id: view.id,
    name: view.name,
    description: view.description ?? '',
    backing_dataset_rid: view.backing_dataset_rid,
    backing_dataset_branch: view.backing_dataset_branch ?? 'master',
    project_rid: view.project_rid ?? '',
    folder_rid: view.folder_rid ?? '',
    path: view.path ?? '',
    owner_ids: view.owner_ids.join(', '),
    resource: view.resource,
    action: view.action,
    conditions_json: JSON.stringify(view.conditions ?? {}, null, 2),
    policy_json: JSON.stringify(view.policy ?? {}, null, 2),
    row_filter: view.row_filter ?? '',
    hidden_columns: view.hidden_columns.join(', '),
    marking_columns: (view.marking_columns ?? []).join(', '),
    allowed_org_ids: view.allowed_org_ids.join(', '),
    allowed_markings: view.allowed_markings.join(', '),
    assumed_markings: view.assumed_markings.join(', '),
    output_metadata_json: JSON.stringify(view.output_metadata ?? {}, null, 2),
    view_metadata_json: JSON.stringify(view.view_metadata ?? {}, null, 2),
    consumer_mode_enabled: view.consumer_mode_enabled,
    allow_guest_access: view.allow_guest_access,
    enabled: view.enabled,
  };
}

function buildRequest(form: FormState) {
  return {
    name: form.name.trim(),
    description: optional(form.description),
    backing_dataset_rid: form.backing_dataset_rid.trim(),
    backing_dataset_branch: optional(form.backing_dataset_branch),
    project_rid: optional(form.project_rid),
    folder_rid: optional(form.folder_rid),
    path: optional(form.path),
    owner_ids: list(form.owner_ids),
    resource: form.resource.trim() || 'datasets',
    action: form.action.trim() || 'read',
    conditions: parseObject(form.conditions_json, 'conditions'),
    policy: parseObject(form.policy_json, 'policy'),
    row_filter: optional(form.row_filter),
    hidden_columns: list(form.hidden_columns),
    marking_columns: list(form.marking_columns),
    allowed_org_ids: list(form.allowed_org_ids),
    allowed_markings: list(form.allowed_markings),
    assumed_markings: list(form.assumed_markings),
    output_metadata: parseObject(form.output_metadata_json, 'output metadata'),
    view_metadata: parseObject(form.view_metadata_json, 'view metadata'),
    consumer_mode_enabled: form.consumer_mode_enabled,
    allow_guest_access: form.allow_guest_access,
    enabled: form.enabled,
  };
}

function parseObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value || '{}') as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function list(value: string) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function canRestrictedView(roles: string[], permissions: string[], accepted: string[]) {
  if (roles.includes('admin')) return true;
  return accepted.some((permission) => {
    const resource = permission.split(':', 1)[0];
    return permissions.includes(permission) ||
      permissions.includes('*:*') ||
      permissions.includes(`${resource}:*`);
  });
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}
