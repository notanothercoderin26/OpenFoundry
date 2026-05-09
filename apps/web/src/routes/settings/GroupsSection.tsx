import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createGroup } from '@api/auth';
import { usePermissions } from '@/lib/auth/permissions';
import { groupsQuery, rolesQuery, settingsQueryKeys } from './queries';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { toOptionalString } from './utils';

interface GroupsSectionProps {
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

const DEFAULT_FORM = { name: '', description: '', roleIds: [] as string[] };

export function GroupsSection({ setNotice, setError }: GroupsSectionProps) {
  const perms = usePermissions();
  const qc = useQueryClient();

  const groupsResult = useQuery({ ...groupsQuery, enabled: perms.canReadGroups });
  const rolesResult = useQuery({
    ...rolesQuery,
    enabled: perms.canReadGroups && perms.canManageGroups,
  });

  const groups = groupsResult.data ?? [];
  const roles = rolesResult.data ?? [];

  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(q) ||
        (group.description ?? '').toLowerCase().includes(q),
    );
  }, [filter, groups]);

  const createMutation = useMutation({
    mutationFn: () =>
      createGroup({
        name: form.name,
        description: toOptionalString(form.description),
        role_ids: form.roleIds,
      }),
    onSuccess: async () => {
      setForm(DEFAULT_FORM);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.groups });
      setNotice('Group created.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create group'),
  });

  if (!perms.canReadGroups) return null;

  function toggleRole(id: string) {
    setForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(id)
        ? prev.roleIds.filter((x) => x !== id)
        : [...prev.roleIds, id],
    }));
  }

  return (
    <section className="settings-section">
      <SettingsSectionHeader
        title="Groups"
        description="Bundle users together so they inherit roles and policies as a unit."
        filter={{ value: filter, placeholder: 'Filter groups…', onChange: setFilter }}
        actions={
          perms.canManageGroups ? (
            <button
              type="button"
              className="of-btn of-btn-primary"
              onClick={() => {
                setForm(DEFAULT_FORM);
                setOpen(true);
              }}
            >
              + Create group
            </button>
          ) : null
        }
      />

      {groupsResult.isLoading ? (
        <div className="settings-empty">Loading groups…</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty">
          {filter ? 'No groups match the filter.' : 'No groups registered.'}
        </div>
      ) : (
        <table className="settings-table">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Name</th>
              <th>Description</th>
              <th style={{ width: '12%' }}>Members</th>
              <th style={{ width: '32%' }}>Roles</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((group) => (
              <tr key={group.id}>
                <td>
                  <div className="settings-table__name">{group.name}</div>
                </td>
                <td>
                  <span className="of-text-muted">
                    {group.description ?? 'No description'}
                  </span>
                </td>
                <td>{group.member_count}</td>
                <td>
                  <div className="settings-chip-row">
                    {group.roles.length === 0 ? (
                      <span className="of-text-soft">—</span>
                    ) : (
                      group.roles.map((roleName) => (
                        <span key={roleName} className="of-chip">
                          {roleName}
                        </span>
                      ))
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
        title="Create group"
        description="Groups make it easy to grant the same set of roles to multiple users."
        primaryLabel="Create group"
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
            placeholder="Group name"
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
            placeholder="What does this group represent?"
          />
        </label>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Attach roles</div>
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
            {roles.map((role) => (
              <label key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.roleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                />
                <span>{role.name}</span>
              </label>
            ))}
            {roles.length === 0 && (
              <span className="of-text-muted">
                {rolesResult.isLoading ? 'Loading roles…' : 'No roles available.'}
              </span>
            )}
          </div>
        </div>
      </SettingsModal>
    </section>
  );
}
