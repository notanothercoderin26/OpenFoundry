import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createRole } from '@api/auth';
import { usePermissions } from '@/lib/auth/permissions';
import { permissionsQuery, rolesQuery, settingsQueryKeys } from './queries';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { toOptionalString } from './utils';

interface RolesSectionProps {
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

const DEFAULT_FORM = { name: '', description: '', permissionIds: [] as string[] };

export function RolesSection({ setNotice, setError }: RolesSectionProps) {
  const perms = usePermissions();
  const qc = useQueryClient();

  const rolesResult = useQuery({ ...rolesQuery, enabled: perms.canReadRoles });
  const permissionsResult = useQuery({
    ...permissionsQuery,
    enabled: perms.canReadRoles && perms.canManageRoles,
  });

  const roles = rolesResult.data ?? [];
  const permissions = permissionsResult.data ?? [];

  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (role) =>
        role.name.toLowerCase().includes(q) ||
        (role.description ?? '').toLowerCase().includes(q),
    );
  }, [filter, roles]);

  const createMutation = useMutation({
    mutationFn: () =>
      createRole({
        name: form.name,
        description: toOptionalString(form.description),
        permission_ids: form.permissionIds,
      }),
    onSuccess: async () => {
      setForm(DEFAULT_FORM);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.roles });
      setNotice('Role created.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create role'),
  });

  if (!perms.canReadRoles) return null;

  function togglePermission(id: string) {
    setForm((prev) => ({
      ...prev,
      permissionIds: prev.permissionIds.includes(id)
        ? prev.permissionIds.filter((x) => x !== id)
        : [...prev.permissionIds, id],
    }));
  }

  return (
    <section className="settings-section">
      <SettingsSectionHeader
        title="Roles"
        description="Create and manage roles and their permissions."
        filter={{ value: filter, placeholder: 'Filter roles…', onChange: setFilter }}
        actions={
          perms.canManageRoles ? (
            <button
              type="button"
              className="of-btn of-btn-primary"
              onClick={() => {
                setForm(DEFAULT_FORM);
                setOpen(true);
              }}
            >
              + Create role
            </button>
          ) : null
        }
      />

      {rolesResult.isLoading ? (
        <div className="settings-empty">Loading roles…</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty">
          {filter ? 'No roles match the filter.' : 'No roles registered.'}
        </div>
      ) : (
        <table className="settings-table">
          <thead>
            <tr>
              <th style={{ width: '34%' }}>Name</th>
              <th>Description</th>
              <th style={{ width: '40%' }}>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((role) => (
              <tr key={role.id}>
                <td>
                  <div className="settings-table__name">{role.name}</div>
                  <div className="settings-table__sub">
                    {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
                  </div>
                </td>
                <td>
                  <span className="of-text-muted">
                    {role.description ?? 'No description'}
                  </span>
                </td>
                <td>
                  <div className="settings-chip-row">
                    {role.permissions.length === 0 ? (
                      <span className="of-text-soft">—</span>
                    ) : (
                      role.permissions.slice(0, 8).map((permission) => (
                        <span key={permission} className="of-chip of-chip-active">
                          {permission}
                        </span>
                      ))
                    )}
                    {role.permissions.length > 8 && (
                      <span className="of-chip">+{role.permissions.length - 8}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SettingsModal
        open={open}
        title="Create role"
        description="Roles bundle permissions and can be assigned to users or attached to groups."
        primaryLabel="Create role"
        primaryBusyLabel="Saving…"
        primaryDisabled={!form.name.trim()}
        busy={createMutation.isPending}
        onSubmit={() => createMutation.mutate()}
        onClose={() => setOpen(false)}
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Name</span>
          <input
            className="of-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Role name"
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
            placeholder="What does this role grant?"
          />
        </label>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Permissions</div>
          <div
            className="of-scrollbar"
            style={{
              display: 'grid',
              gap: 6,
              maxHeight: 220,
              overflow: 'auto',
              padding: 12,
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
            }}
          >
            {permissions.map((permission) => (
              <label
                key={permission.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={form.permissionIds.includes(permission.id)}
                  onChange={() => togglePermission(permission.id)}
                />
                <span>
                  {permission.resource}:{permission.action}
                </span>
              </label>
            ))}
            {permissions.length === 0 && (
              <span className="of-text-muted">
                {permissionsResult.isLoading ? 'Loading permissions…' : 'No permissions available.'}
              </span>
            )}
          </div>
        </div>
      </SettingsModal>
    </section>
  );
}
