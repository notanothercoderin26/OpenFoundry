import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addUserToGroup,
  assignUserRole,
  deactivateUser,
  removeUserFromGroup,
  removeUserRole,
  updateUser,
  type UserProfile,
} from '@api/auth';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { usePermissions } from '@/lib/auth/permissions';
import { groupsQuery, rolesQuery, settingsQueryKeys, usersQuery } from './queries';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeader } from './SettingsSectionHeader';

interface UsersSectionProps {
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

export function UsersSection({ setNotice, setError }: UsersSectionProps) {
  const perms = usePermissions();
  const qc = useQueryClient();

  const usersResult = useQuery({ ...usersQuery, enabled: perms.canReadUsers });
  const rolesResult = useQuery({ ...rolesQuery, enabled: perms.canReadRoles });
  const groupsResult = useQuery({ ...groupsQuery, enabled: perms.canReadGroups });

  const users = usersResult.data ?? [];
  const roles = rolesResult.data ?? [];
  const groups = groupsResult.data ?? [];

  const [filter, setFilter] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [draftRole, setDraftRole] = useState('');
  const [draftGroup, setDraftGroup] = useState('');
  const [deactivateConfirm, setDeactivateConfirm] = useState<{ user: UserProfile; busy: boolean } | null>(
    null,
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.roles.some((role) => role.toLowerCase().includes(q)) ||
        user.groups.some((group) => group.toLowerCase().includes(q)),
    );
  }, [filter, users]);

  if (!perms.canReadUsers) return null;

  function roleIdByName(name: string) {
    return roles.find((r) => r.name === name)?.id;
  }

  function groupIdByName(name: string) {
    return groups.find((g) => g.name === name)?.id;
  }

  async function withSaving(key: string, work: () => Promise<void>) {
    setSavingKey(key);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSavingKey(null);
    }
  }

  async function handleToggleUser(user: UserProfile) {
    if (user.is_active) {
      setDeactivateConfirm({ user, busy: false });
      return;
    }
    await withSaving(`user-${user.id}`, async () => {
      await updateUser(user.id, { is_active: true });
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.users });
      setNotice('User reactivated.');
    });
  }

  async function confirmDeactivate() {
    if (!deactivateConfirm) return;
    const target = deactivateConfirm.user;
    setDeactivateConfirm({ user: target, busy: true });
    try {
      await withSaving(`user-${target.id}`, async () => {
        await deactivateUser(target.id);
        await qc.invalidateQueries({ queryKey: settingsQueryKeys.users });
        setNotice('User deactivated.');
      });
    } finally {
      setDeactivateConfirm(null);
    }
  }

  async function handleToggleMfa(user: UserProfile) {
    await withSaving(`user-mfa-${user.id}`, async () => {
      await updateUser(user.id, { mfa_enforced: !user.mfa_enforced });
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.users });
      setNotice('MFA enforcement updated.');
    });
  }

  async function handleAssignRole(userId: string) {
    if (!draftRole) return;
    await withSaving(`assign-role-${userId}`, async () => {
      await assignUserRole(userId, draftRole);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.users });
      setDraftRole('');
      setNotice('Role assigned.');
    });
  }

  async function handleRemoveRole(userId: string, roleName: string) {
    const roleId = roleIdByName(roleName);
    if (!roleId) return;
    await withSaving(`remove-role-${userId}-${roleId}`, async () => {
      await removeUserRole(userId, roleId);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.users });
      setNotice('Role removed.');
    });
  }

  async function handleAddGroup(userId: string) {
    if (!draftGroup) return;
    await withSaving(`assign-group-${userId}`, async () => {
      await addUserToGroup(userId, draftGroup);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.users });
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.groups });
      setDraftGroup('');
      setNotice('User added to group.');
    });
  }

  async function handleRemoveGroup(userId: string, groupName: string) {
    const groupId = groupIdByName(groupName);
    if (!groupId) return;
    await withSaving(`remove-group-${userId}-${groupId}`, async () => {
      await removeUserFromGroup(userId, groupId);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.users });
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.groups });
      setNotice('User removed from group.');
    });
  }

  function openEdit(user: UserProfile) {
    setEditingUser(user);
    setDraftRole('');
    setDraftGroup('');
  }

  return (
    <section className="settings-section">
      <SettingsSectionHeader
        title="Users"
        description="Manage workspace identities, role assignments, and group membership."
        filter={{ value: filter, placeholder: 'Filter users…', onChange: setFilter }}
      />

      {usersResult.isLoading ? (
        <div className="settings-empty">Loading users…</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty">
          {filter ? 'No users match the filter.' : 'No users to display.'}
        </div>
      ) : (
        <table className="settings-table">
          <thead>
            <tr>
              <th style={{ width: '24%' }}>User</th>
              <th style={{ width: '14%' }}>Status</th>
              <th>Roles</th>
              <th>Groups</th>
              {(perms.canManageUsers || perms.canManageRoles || perms.canManageGroups) && (
                <th style={{ width: '120px' }}></th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="settings-table__name">{user.name}</div>
                  <div className="settings-table__sub">{user.email}</div>
                </td>
                <td>
                  <span className={`of-chip ${user.is_active ? 'of-status-success' : ''}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="settings-table__sub" style={{ textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                    {user.auth_source}
                  </div>
                </td>
                <td>
                  <div className="settings-chip-row">
                    {user.roles.length > 0 ? (
                      user.roles.map((role) => (
                        <span key={role} className="of-chip of-chip-active">
                          {role}
                        </span>
                      ))
                    ) : (
                      <span className="of-text-soft">No direct roles</span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="settings-chip-row">
                    {user.groups.length > 0 ? (
                      user.groups.map((group) => (
                        <span key={group} className="of-chip">
                          {group}
                        </span>
                      ))
                    ) : (
                      <span className="of-text-soft">No groups</span>
                    )}
                  </div>
                </td>
                {(perms.canManageUsers || perms.canManageRoles || perms.canManageGroups) && (
                  <td>
                    <button
                      type="button"
                      className="of-btn"
                      onClick={() => openEdit(user)}
                    >
                      Manage
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SettingsModal
        open={!!editingUser}
        title={editingUser ? `Manage ${editingUser.name}` : 'Manage user'}
        description={editingUser?.email}
        width={600}
        primaryLabel="Done"
        onSubmit={() => setEditingUser(null)}
        onClose={() => setEditingUser(null)}
      >
        {editingUser && (
          <>
            {perms.canManageUsers && (
              <div className="settings-detail-card">
                <div className="of-eyebrow">Identity controls</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    className="of-btn"
                    onClick={() => handleToggleUser(editingUser)}
                    disabled={savingKey === `user-${editingUser.id}`}
                  >
                    {editingUser.is_active ? 'Deactivate user' : 'Reactivate user'}
                  </button>
                  <button
                    type="button"
                    className="of-btn"
                    onClick={() => handleToggleMfa(editingUser)}
                    disabled={savingKey === `user-mfa-${editingUser.id}`}
                  >
                    {editingUser.mfa_enforced ? 'Unset MFA enforcement' : 'Force MFA'}
                  </button>
                </div>
              </div>
            )}

            {perms.canManageRoles && (
              <div className="settings-detail-card">
                <div className="of-eyebrow">Roles</div>
                <div className="settings-chip-row" style={{ marginTop: 10 }}>
                  {editingUser.roles.length > 0 ? (
                    editingUser.roles.map((roleName) => (
                      <span key={roleName} className="settings-action-chip">
                        {roleName}
                        <button
                          type="button"
                          aria-label={`Remove ${roleName}`}
                          onClick={() => handleRemoveRole(editingUser.id, roleName)}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="of-text-soft">No direct roles</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <select
                    className="of-select"
                    value={draftRole}
                    onChange={(e) => setDraftRole(e.target.value)}
                  >
                    <option value="">Assign role…</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="of-btn of-btn-primary"
                    onClick={() => handleAssignRole(editingUser.id)}
                    disabled={!draftRole || savingKey === `assign-role-${editingUser.id}`}
                  >
                    Assign
                  </button>
                </div>
              </div>
            )}

            {perms.canManageGroups && (
              <div className="settings-detail-card">
                <div className="of-eyebrow">Groups</div>
                <div className="settings-chip-row" style={{ marginTop: 10 }}>
                  {editingUser.groups.length > 0 ? (
                    editingUser.groups.map((groupName) => (
                      <span key={groupName} className="settings-action-chip">
                        {groupName}
                        <button
                          type="button"
                          aria-label={`Remove ${groupName}`}
                          onClick={() => handleRemoveGroup(editingUser.id, groupName)}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="of-text-soft">No groups</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <select
                    className="of-select"
                    value={draftGroup}
                    onChange={(e) => setDraftGroup(e.target.value)}
                  >
                    <option value="">Add to group…</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="of-btn"
                    onClick={() => handleAddGroup(editingUser.id)}
                    disabled={!draftGroup || savingKey === `assign-group-${editingUser.id}`}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            <div className="settings-detail-card">
              <div className="of-eyebrow">Summary</div>
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div>
                  <strong style={{ color: 'var(--text-strong)' }}>Permissions:</strong>{' '}
                  {editingUser.permissions.length}
                </div>
                <div style={{ marginTop: 4 }}>
                  <strong style={{ color: 'var(--text-strong)' }}>Organization:</strong>{' '}
                  {editingUser.organization_id ?? 'Not assigned'}
                </div>
              </div>
            </div>
          </>
        )}
      </SettingsModal>

      <ConfirmDialog
        open={!!deactivateConfirm}
        title="Deactivate user"
        message={
          deactivateConfirm
            ? `Deactivate ${deactivateConfirm.user.name} (${deactivateConfirm.user.email})? They will lose access immediately.`
            : ''
        }
        confirmLabel="Deactivate"
        danger
        busy={deactivateConfirm?.busy ?? false}
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivateConfirm(null)}
      />
    </section>
  );
}
