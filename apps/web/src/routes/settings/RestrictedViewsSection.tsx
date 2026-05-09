import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createRestrictedView, deleteRestrictedView } from '@api/auth';
import { usePermissions } from '@/lib/auth/permissions';
import { restrictedViewsQuery, settingsQueryKeys } from './queries';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { parseJson, toList, toOptionalString } from './utils';

interface RestrictedViewsSectionProps {
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

const DEFAULT_FORM = {
  name: '',
  description: '',
  resource: 'datasets',
  action: 'read',
  conditions:
    '{\n  "subject": {},\n  "resource": {\n    "organization_id": null,\n    "effective_marking": "public"\n  }\n}',
  row_filter: '',
  hidden_columns: 'ssn, salary',
  allowed_org_ids: '',
  allowed_markings: 'public',
  consumer_mode_enabled: false,
  allow_guest_access: true,
  enabled: true,
};

export function RestrictedViewsSection({ setNotice, setError }: RestrictedViewsSectionProps) {
  const perms = usePermissions();
  const qc = useQueryClient();

  const result = useQuery({ ...restrictedViewsQuery, enabled: perms.canReadPolicies });
  const views = result.data ?? [];

  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return views;
    return views.filter(
      (view) =>
        view.name.toLowerCase().includes(q) ||
        view.resource.toLowerCase().includes(q) ||
        view.action.toLowerCase().includes(q),
    );
  }, [filter, views]);

  const createMutation = useMutation({
    mutationFn: () => {
      let conditions: Record<string, unknown>;
      try {
        conditions = parseJson(form.conditions);
      } catch (err) {
        return Promise.reject(
          new Error(err instanceof Error ? `Invalid conditions JSON: ${err.message}` : 'Invalid conditions JSON'),
        );
      }
      return createRestrictedView({
        name: form.name,
        description: toOptionalString(form.description),
        resource: form.resource,
        action: form.action,
        conditions,
        row_filter: toOptionalString(form.row_filter),
        hidden_columns: toList(form.hidden_columns),
        allowed_org_ids: toList(form.allowed_org_ids),
        allowed_markings: toList(form.allowed_markings),
        consumer_mode_enabled: form.consumer_mode_enabled,
        allow_guest_access: form.allow_guest_access,
        enabled: form.enabled,
      });
    },
    onSuccess: async () => {
      setForm(DEFAULT_FORM);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.restrictedViews });
      setNotice('Restricted view created.');
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Failed to create restricted view'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRestrictedView(id),
    onMutate: (id) => setDeletingId(id),
    onSettled: () => setDeletingId(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.restrictedViews });
      setNotice('Restricted view deleted.');
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Failed to delete restricted view'),
  });

  if (!perms.canReadPolicies) return null;

  return (
    <section className="settings-section">
      <SettingsSectionHeader
        title="Restricted views"
        description="Granular row and column cuts with explicit org, marking and consumer-mode boundaries."
        filter={{ value: filter, placeholder: 'Filter views…', onChange: setFilter }}
        actions={
          perms.canManagePolicies ? (
            <button
              type="button"
              className="of-btn of-btn-primary"
              onClick={() => {
                setForm(DEFAULT_FORM);
                setOpen(true);
              }}
            >
              + Create restricted view
            </button>
          ) : null
        }
      />

      {result.isLoading ? (
        <div className="settings-empty">Loading restricted views…</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty">
          {filter ? 'No views match the filter.' : 'No restricted views registered.'}
        </div>
      ) : (
        <table className="settings-table">
          <thead>
            <tr>
              <th style={{ width: '26%' }}>Name</th>
              <th style={{ width: '20%' }}>Resource:Action</th>
              <th>Markings / hidden columns</th>
              <th style={{ width: '18%' }}>Status</th>
              {perms.canManagePolicies && <th style={{ width: '110px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((view) => (
              <tr key={view.id}>
                <td>
                  <div className="settings-table__name">{view.name}</div>
                  {view.description && (
                    <div className="settings-table__sub">{view.description}</div>
                  )}
                </td>
                <td>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {view.resource}:{view.action}
                  </span>
                </td>
                <td>
                  <div className="settings-chip-row">
                    {view.allowed_markings.map((marking) => (
                      <span key={marking} className="of-chip of-chip-active">
                        {marking}
                      </span>
                    ))}
                    {view.hidden_columns.map((column) => (
                      <span key={column} className="of-chip of-status-danger">
                        Hide {column}
                      </span>
                    ))}
                    {view.allowed_markings.length === 0 && view.hidden_columns.length === 0 && (
                      <span className="of-text-soft">—</span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="settings-chip-row">
                    <span className={`of-chip ${view.enabled ? 'of-status-success' : ''}`}>
                      {view.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {view.allow_guest_access && (
                      <span className="of-chip of-status-info">Guest</span>
                    )}
                    {view.consumer_mode_enabled && (
                      <span className="of-chip of-status-warning">Consumer</span>
                    )}
                  </div>
                </td>
                {perms.canManagePolicies && (
                  <td>
                    <button
                      type="button"
                      className="of-btn of-btn-danger"
                      onClick={() => deleteMutation.mutate(view.id)}
                      disabled={deletingId === view.id}
                    >
                      {deletingId === view.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SettingsModal
        open={open}
        title="Create restricted view"
        description="Limit which rows, columns, markings, and orgs can see a resource."
        primaryLabel="Create restricted view"
        primaryBusyLabel="Saving…"
        primaryDisabled={!form.name.trim()}
        busy={createMutation.isPending}
        onSubmit={() => createMutation.mutate()}
        onClose={() => setOpen(false)}
        width={620}
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Name</span>
          <input
            className="of-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Description (optional)</span>
          <textarea
            className="of-textarea"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
        </label>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>Resource</span>
            <input
              className="of-input"
              value={form.resource}
              onChange={(e) => setForm((f) => ({ ...f, resource: e.target.value }))}
              required
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>Action</span>
            <input
              className="of-input"
              value={form.action}
              onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
              required
            />
          </label>
        </div>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Conditions (JSON)</span>
          <textarea
            className="of-textarea"
            value={form.conditions}
            onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
            rows={6}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Row filter template</span>
          <input
            className="of-input"
            value={form.row_filter}
            onChange={(e) => setForm((f) => ({ ...f, row_filter: e.target.value }))}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Hidden columns</span>
          <input
            className="of-input"
            value={form.hidden_columns}
            onChange={(e) => setForm((f) => ({ ...f, hidden_columns: e.target.value }))}
            placeholder="comma separated"
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Allowed organization IDs</span>
          <input
            className="of-input"
            value={form.allowed_org_ids}
            onChange={(e) => setForm((f) => ({ ...f, allowed_org_ids: e.target.value }))}
            placeholder="comma separated"
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Allowed markings</span>
          <input
            className="of-input"
            value={form.allowed_markings}
            onChange={(e) => setForm((f) => ({ ...f, allowed_markings: e.target.value }))}
            placeholder="comma separated"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.allow_guest_access}
            onChange={(e) => setForm((f) => ({ ...f, allow_guest_access: e.target.checked }))}
          />
          Allow guest access
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.consumer_mode_enabled}
            onChange={(e) => setForm((f) => ({ ...f, consumer_mode_enabled: e.target.checked }))}
          />
          Consumer mode enabled
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          />
          Enabled on creation
        </label>
      </SettingsModal>
    </section>
  );
}
