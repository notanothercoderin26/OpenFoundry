import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createPermission } from '@api/auth';
import { usePermissions } from '@/lib/auth/permissions';
import { permissionsQuery, settingsQueryKeys } from './queries';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { toOptionalString } from './utils';

interface PermissionsSectionProps {
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

const DEFAULT_FORM = { resource: '', action: '', description: '' };

export function PermissionsSection({ setNotice, setError }: PermissionsSectionProps) {
  const perms = usePermissions();
  const qc = useQueryClient();

  const result = useQuery({ ...permissionsQuery, enabled: perms.canReadPermissions });
  const permissions = result.data ?? [];

  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return permissions;
    return permissions.filter(
      (permission) =>
        permission.resource.toLowerCase().includes(q) ||
        permission.action.toLowerCase().includes(q) ||
        (permission.description ?? '').toLowerCase().includes(q),
    );
  }, [filter, permissions]);

  const createMutation = useMutation({
    mutationFn: () =>
      createPermission({
        resource: form.resource,
        action: form.action,
        description: toOptionalString(form.description),
      }),
    onSuccess: async () => {
      setForm(DEFAULT_FORM);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.permissions });
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.roles });
      setNotice('Permission created.');
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : 'Failed to create permission'),
  });

  if (!perms.canReadPermissions) return null;

  return (
    <section className="settings-section">
      <SettingsSectionHeader
        title="Permissions"
        description="Permissions are the atomic resource:action pairs that roles bundle together."
        filter={{
          value: filter,
          placeholder: 'Filter resource or action…',
          onChange: setFilter,
        }}
        actions={
          perms.canManagePermissions ? (
            <button
              type="button"
              className="of-btn of-btn-primary"
              onClick={() => {
                setForm(DEFAULT_FORM);
                setOpen(true);
              }}
            >
              + Create permission
            </button>
          ) : null
        }
      />

      {result.isLoading ? (
        <div className="settings-empty">Loading permissions…</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty">
          {filter ? 'No permissions match the filter.' : 'No permissions registered.'}
        </div>
      ) : (
        <table className="settings-table">
          <thead>
            <tr>
              <th style={{ width: '24%' }}>Resource</th>
              <th style={{ width: '24%' }}>Action</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((permission) => (
              <tr key={permission.id}>
                <td>
                  <span className="settings-table__name">{permission.resource}</span>
                </td>
                <td>
                  <span className="of-chip">{permission.action}</span>
                </td>
                <td>
                  <span className="of-text-muted">
                    {permission.description ?? 'No description'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SettingsModal
        open={open}
        title="Create permission"
        description="Register a new resource:action pair that roles can grant."
        primaryLabel="Create permission"
        primaryBusyLabel="Saving…"
        primaryDisabled={!form.resource.trim() || !form.action.trim()}
        busy={createMutation.isPending}
        onSubmit={() => createMutation.mutate()}
        onClose={() => setOpen(false)}
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Resource</span>
          <input
            className="of-input"
            value={form.resource}
            onChange={(e) => setForm((f) => ({ ...f, resource: e.target.value }))}
            placeholder="e.g. notebooks"
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Action</span>
          <input
            className="of-input"
            value={form.action}
            onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
            placeholder="e.g. read"
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Description (optional)</span>
          <textarea
            className="of-textarea"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="Explain what this permission grants."
          />
        </label>
      </SettingsModal>
    </section>
  );
}
