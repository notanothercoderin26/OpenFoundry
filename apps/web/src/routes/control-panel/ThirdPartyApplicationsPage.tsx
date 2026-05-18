import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { listRoles, type RoleRecord } from '@/lib/api/auth';
import {
  assignThirdPartyServiceUserRole,
  createThirdPartyApplication,
  createThirdPartyServiceUserGrant,
  deleteThirdPartyApplication,
  disableThirdPartyApplicationEnablement,
  ensureThirdPartyApplicationServiceUser,
  getThirdPartyApplicationServiceUser,
  listThirdPartyApplications,
  rotateThirdPartyApplicationSecret,
  revokeThirdPartyServiceUserGrant,
  revokeThirdPartyServiceUserRole,
  upsertThirdPartyApplicationEnablement,
  type CreateThirdPartyApplicationRequest,
  type ThirdPartyServiceUserInspection,
  type ThirdPartyApplication,
  type ThirdPartyGrantType,
} from '@/lib/api/third-party-applications';

const DEFAULT_FORM = {
  name: '',
  description: '',
  client_type: 'confidential',
  grants: ['authorization_code'] as ThirdPartyGrantType[],
  redirect_uris: '',
  scopes: '',
  owner_user_ids: '',
  managing_organization_id: '',
  discoverable_organization_ids: '',
  enablement_organization_ids: '',
};

type ServiceGrantForm = {
  scope_type: 'project' | 'resource';
  scope_id: string;
  role_key: string;
};

const DEFAULT_GRANT_FORM: ServiceGrantForm = {
  scope_type: 'project',
  scope_id: '',
  role_key: 'viewer',
};

function splitList(value: string) {
  return value
    .split(/[\n, ]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toCreateBody(form: typeof DEFAULT_FORM): CreateThirdPartyApplicationRequest {
  return {
    name: form.name,
    description: form.description.trim() || null,
    client_type: form.client_type as 'confidential' | 'public',
    enabled_grant_types: form.grants,
    redirect_uris: splitList(form.redirect_uris),
    scopes: splitList(form.scopes),
    owner_user_ids: splitList(form.owner_user_ids),
    managing_organization_id: form.managing_organization_id.trim() || null,
    discoverable_organization_ids: splitList(form.discoverable_organization_ids),
    enablement_organization_ids: splitList(form.enablement_organization_ids),
    preferred_management_surface: 'developer_console',
    control_panel_fallback: true,
  };
}

export function ThirdPartyApplicationsPage() {
  const [apps, setApps] = useState<ThirdPartyApplication[]>([]);
  const [warning, setWarning] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [enablementOrg, setEnablementOrg] = useState('');
  const [selectedAppID, setSelectedAppID] = useState('');
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [serviceUser, setServiceUser] = useState<ThirdPartyServiceUserInspection | null>(null);
  const [serviceRoleID, setServiceRoleID] = useState('');
  const [grantForm, setGrantForm] = useState(DEFAULT_GRANT_FORM);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedApp = useMemo(
    () => apps.find((app) => app.id === selectedAppID) ?? apps[0],
    [apps, selectedAppID],
  );

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const response = await listThirdPartyApplications();
      setApps(response.items);
      setWarning(response.warning);
      if (!selectedAppID && response.items.length > 0) setSelectedAppID(response.items[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load third-party applications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    void listRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    if (!selectedApp?.id) {
      setServiceUser(null);
      return;
    }
    void loadServiceUser(selectedApp.id);
  }, [selectedApp?.id]);

  async function loadServiceUser(appID: string) {
    try {
      const response = await getThirdPartyApplicationServiceUser(appID);
      setServiceUser(response);
    } catch {
      setServiceUser(null);
    }
  }

  function toggleGrant(grant: ThirdPartyGrantType) {
    setForm((current) => {
      const present = current.grants.includes(grant);
      const grants = present
        ? current.grants.filter((entry) => entry !== grant)
        : [...current.grants, grant];
      return { ...current, grants };
    });
  }

  async function createApp() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await createThirdPartyApplication(toCreateBody(form));
      setSecret(response.client_secret ?? '');
      setNotice(`Registered ${response.application.name}.`);
      setForm(DEFAULT_FORM);
      await reload();
      setSelectedAppID(response.application.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register application');
    } finally {
      setSaving(false);
    }
  }

  async function rotateSecret(app: ThirdPartyApplication) {
    setSaving(true);
    setError('');
    try {
      const response = await rotateThirdPartyApplicationSecret(app.id);
      setSecret(response.client_secret);
      setNotice(response.warning);
      await reload();
      await loadServiceUser(app.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate secret');
    } finally {
      setSaving(false);
    }
  }

  async function ensureServiceUser() {
    if (!selectedApp) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await ensureThirdPartyApplicationServiceUser(selectedApp.id);
      setServiceUser(response);
      setNotice(`Service user ready for ${selectedApp.name}.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare service user');
    } finally {
      setSaving(false);
    }
  }

  async function assignServiceRole() {
    if (!selectedApp || !serviceRoleID) return;
    setSaving(true);
    setError('');
    try {
      const response = await assignThirdPartyServiceUserRole(selectedApp.id, serviceRoleID);
      setServiceUser(response);
      setServiceRoleID('');
      setNotice('Service-user role assigned.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign service-user role');
    } finally {
      setSaving(false);
    }
  }

  async function revokeServiceRole(roleID: string) {
    if (!selectedApp) return;
    setSaving(true);
    setError('');
    try {
      const response = await revokeThirdPartyServiceUserRole(selectedApp.id, roleID);
      setServiceUser(response);
      setNotice('Service-user role revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke service-user role');
    } finally {
      setSaving(false);
    }
  }

  async function createServiceGrant() {
    if (!selectedApp || !grantForm.scope_id.trim() || !grantForm.role_key.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createThirdPartyServiceUserGrant(selectedApp.id, {
        scope_type: grantForm.scope_type,
        scope_id: grantForm.scope_id.trim(),
        role_key: grantForm.role_key.trim(),
      });
      setGrantForm(DEFAULT_GRANT_FORM);
      await loadServiceUser(selectedApp.id);
      setNotice('Service-user project/resource grant saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create service-user grant');
    } finally {
      setSaving(false);
    }
  }

  async function revokeServiceGrant(grantID: string) {
    if (!selectedApp) return;
    setSaving(true);
    setError('');
    try {
      await revokeThirdPartyServiceUserGrant(selectedApp.id, grantID);
      await loadServiceUser(selectedApp.id);
      setNotice('Service-user grant revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke service-user grant');
    } finally {
      setSaving(false);
    }
  }

  async function revokeApp(app: ThirdPartyApplication) {
    setSaving(true);
    setError('');
    try {
      await deleteThirdPartyApplication(app.id);
      setNotice(`Revoked ${app.name}.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke application');
    } finally {
      setSaving(false);
    }
  }

  async function enableSelectedApp(enabled: boolean) {
    if (!selectedApp || !enablementOrg.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (enabled) {
        await upsertThirdPartyApplicationEnablement(selectedApp.id, enablementOrg.trim(), {
          enabled: true,
          project_resource_ids: [],
          marking_ids: [],
          organization_consent: false,
        });
      } else {
        await disableThirdPartyApplicationEnablement(selectedApp.id, enablementOrg.trim());
      }
      setNotice(`${enabled ? 'Enabled' : 'Disabled'} ${selectedApp.name} for organization.`);
      setEnablementOrg('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update enablement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 18 }}>
      <Link to="/control-panel" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Control Panel
      </Link>

      <header>
        <p className="of-eyebrow">Security & governance</p>
        <h1 style={{ margin: 0 }}>Third-party applications</h1>
        <p className="of-text-muted" style={{ maxWidth: 900 }}>
          Developer Console remains the preferred management surface. This Control Panel fallback
          registers OAuth2 clients, service users, owners, discovery, and organization enablement.
        </p>
      </header>

      {warning && (
        <div className="of-status-warning" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          {warning}
        </div>
      )}
      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
          {notice}
        </div>
      )}
      {secret && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 8 }}>
          <p className="of-eyebrow">Client secret</p>
          <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{secret}</code>
        </section>
      )}

      <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
        <div>
          <p className="of-eyebrow">Register</p>
          <h2 style={{ margin: 0, fontSize: 18 }}>New OAuth2 client</h2>
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <label style={{ fontSize: 13 }}>
            Name
            <input className="of-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label style={{ fontSize: 13 }}>
            Client type
            <select
              className="of-input"
              value={form.client_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  client_type: e.target.value,
                  grants:
                    e.target.value === 'public'
                      ? f.grants.filter((grant) => grant !== 'client_credentials')
                      : f.grants,
                }))
              }
            >
              <option value="confidential">Confidential</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Managing organization
            <input
              className="of-input"
              value={form.managing_organization_id}
              onChange={(e) => setForm((f) => ({ ...f, managing_organization_id: e.target.value }))}
              placeholder="Defaults to caller organization"
            />
          </label>
          <label style={{ fontSize: 13 }}>
            Description
            <input className="of-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
        </div>
        <div className="settings-chip-row">
          <label className="of-chip">
            <input
              type="checkbox"
              checked={form.grants.includes('authorization_code')}
              onChange={() => toggleGrant('authorization_code')}
            />{' '}
            Authorization code
          </label>
          <label className="of-chip">
            <input
              type="checkbox"
              checked={form.grants.includes('client_credentials')}
              disabled={form.client_type === 'public'}
              onChange={() => toggleGrant('client_credentials')}
            />{' '}
            Client credentials
          </label>
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <label style={{ fontSize: 13 }}>
            Redirect URIs
            <textarea className="of-input" rows={3} value={form.redirect_uris} onChange={(e) => setForm((f) => ({ ...f, redirect_uris: e.target.value }))} />
          </label>
          <label style={{ fontSize: 13 }}>
            Scopes
            <textarea className="of-input" rows={3} value={form.scopes} onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))} />
          </label>
          <label style={{ fontSize: 13 }}>
            Owner user IDs
            <textarea className="of-input" rows={3} value={form.owner_user_ids} onChange={(e) => setForm((f) => ({ ...f, owner_user_ids: e.target.value }))} />
          </label>
          <label style={{ fontSize: 13 }}>
            Discoverable organization IDs
            <textarea className="of-input" rows={3} value={form.discoverable_organization_ids} onChange={(e) => setForm((f) => ({ ...f, discoverable_organization_ids: e.target.value }))} />
          </label>
          <label style={{ fontSize: 13 }}>
            Initial enablement organization IDs
            <textarea className="of-input" rows={3} value={form.enablement_organization_ids} onChange={(e) => setForm((f) => ({ ...f, enablement_organization_ids: e.target.value }))} />
          </label>
        </div>
        <button type="button" className="of-button" disabled={saving || !form.name.trim()} onClick={() => void createApp()}>
          {saving ? 'Saving...' : 'Register application'}
        </button>
      </section>

      <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p className="of-eyebrow">Registry</p>
            <h2 style={{ margin: 0, fontSize: 18 }}>Applications</h2>
          </div>
          <button type="button" className="of-button" onClick={() => void reload()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <table className="settings-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Client</th>
              <th>Grants</th>
              <th>Organizations</th>
              <th style={{ width: 220 }}></th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id}>
                <td>
                  <button type="button" className="of-link-button" onClick={() => setSelectedAppID(app.id)}>
                    {app.name}
                  </button>
                  <div className="settings-table__sub">{app.preferred_management_surface}</div>
                </td>
                <td>
                  <code>{app.client_id}</code>
                  <div className="settings-table__sub">{app.client_type}{app.requires_pkce ? ' · PKCE' : ''}</div>
                </td>
                <td>
                  <div className="settings-chip-row">
                    {app.enabled_grant_types.map((grant) => (
                      <span key={grant} className="of-chip of-status-info">{grant}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <span>{app.enablements.filter((entry) => entry.enabled).length} enabled</span>
                  <div className="settings-table__sub">{app.discoverable_organization_ids.length} discoverable</div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="of-button" disabled={saving || app.client_type !== 'confidential'} onClick={() => void rotateSecret(app)}>
                      Rotate secret
                    </button>
                    <button type="button" className="of-button" disabled={saving} onClick={() => void revokeApp(app)}>
                      Revoke
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selectedApp && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div>
            <p className="of-eyebrow">Organization enablement</p>
            <h2 style={{ margin: 0, fontSize: 18 }}>{selectedApp.name}</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="of-input"
              value={enablementOrg}
              onChange={(e) => setEnablementOrg(e.target.value)}
              placeholder="Organization UUID"
              style={{ maxWidth: 360 }}
            />
            <button type="button" className="of-button" disabled={saving || !enablementOrg.trim()} onClick={() => void enableSelectedApp(true)}>
              Enable
            </button>
            <button type="button" className="of-button" disabled={saving || !enablementOrg.trim()} onClick={() => void enableSelectedApp(false)}>
              Disable
            </button>
          </div>
          <div className="settings-chip-row">
            {selectedApp.enablements.length === 0 ? (
              <span className="of-text-muted">No organization enablements.</span>
            ) : (
              selectedApp.enablements.map((entry) => (
                <span key={entry.organization_id} className={`of-chip ${entry.enabled ? 'of-status-success' : 'of-status-danger'}`}>
                  {entry.organization_id}: {entry.enabled ? 'enabled' : 'disabled'}
                </span>
              ))
            )}
          </div>
        </section>
      )}

      {selectedApp && (
        <section className="of-panel" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p className="of-eyebrow">Client credentials</p>
              <h2 style={{ margin: 0, fontSize: 18 }}>Service user</h2>
              {serviceUser?.warning && <p className="of-text-muted" style={{ marginBottom: 0 }}>{serviceUser.warning}</p>}
            </div>
            <button
              type="button"
              className="of-button"
              disabled={saving || selectedApp.client_type !== 'confidential'}
              onClick={() => void ensureServiceUser()}
            >
              Prepare service user
            </button>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <div>
              <p className="of-eyebrow">Identity</p>
              <dl className="settings-definition-list">
                <dt>Client credentials</dt>
                <dd>{serviceUser?.client_credentials_enabled ? 'Enabled' : 'Disabled'}</dd>
                <dt>User ID</dt>
                <dd><code>{serviceUser?.service_user?.id ?? selectedApp.service_user_id ?? 'Not created'}</code></dd>
                <dt>Username</dt>
                <dd><code>{serviceUser?.service_user?.username ?? selectedApp.client_id}</code></dd>
              </dl>
            </div>
            <div>
              <p className="of-eyebrow">Effective API permissions</p>
              <div className="settings-chip-row">
                {(serviceUser?.permissions ?? []).length === 0 ? (
                  <span className="of-text-muted">No platform permissions assigned.</span>
                ) : (
                  serviceUser?.permissions.map((permission) => <span key={permission} className="of-chip">{permission}</span>)
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <p className="of-eyebrow">Platform roles</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select className="of-input" value={serviceRoleID} onChange={(e) => setServiceRoleID(e.target.value)} style={{ maxWidth: 320 }}>
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              <button type="button" className="of-button" disabled={saving || !serviceRoleID || !serviceUser?.service_user} onClick={() => void assignServiceRole()}>
                Assign role
              </button>
            </div>
            <div className="settings-chip-row">
              {(serviceUser?.platform_roles ?? []).length === 0 ? (
                <span className="of-text-muted">No platform roles.</span>
              ) : (
                serviceUser?.platform_roles.map((role) => (
                  <button key={role.id} type="button" className="of-chip" onClick={() => void revokeServiceRole(role.id)} disabled={saving}>
                    {role.name} ×
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <p className="of-eyebrow">Project and resource roles</p>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
              <label style={{ fontSize: 13 }}>
                Scope
                <select
                  className="of-input"
                  value={grantForm.scope_type}
                  onChange={(e) => setGrantForm((current) => ({ ...current, scope_type: e.target.value as 'project' | 'resource' }))}
                >
                  <option value="project">Project</option>
                  <option value="resource">Resource</option>
                </select>
              </label>
              <label style={{ fontSize: 13 }}>
                Scope ID
                <input className="of-input" value={grantForm.scope_id} onChange={(e) => setGrantForm((current) => ({ ...current, scope_id: e.target.value }))} />
              </label>
              <label style={{ fontSize: 13 }}>
                Role key
                <input className="of-input" value={grantForm.role_key} onChange={(e) => setGrantForm((current) => ({ ...current, role_key: e.target.value }))} />
              </label>
              <button
                type="button"
                className="of-button"
                disabled={saving || !serviceUser?.service_user || !grantForm.scope_id.trim() || !grantForm.role_key.trim()}
                onClick={() => void createServiceGrant()}
              >
                Add grant
              </button>
            </div>
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Role</th>
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {(serviceUser?.resource_grants ?? []).map((grant) => (
                  <tr key={grant.id}>
                    <td>
                      <code>{grant.scope_id}</code>
                      <div className="settings-table__sub">{grant.scope_type}</div>
                    </td>
                    <td>{grant.role_key}</td>
                    <td>
                      <button type="button" className="of-button" disabled={saving} onClick={() => void revokeServiceGrant(grant.id)}>
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
                {(serviceUser?.resource_grants ?? []).length === 0 && (
                  <tr><td colSpan={3} className="of-text-muted">No project or resource grants.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <p className="of-eyebrow">Audit history</p>
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {(serviceUser?.audit_events ?? []).map((event) => (
                  <tr key={event.id}>
                    <td>{event.action}</td>
                    <td><code>{event.actor_id ?? 'system'}</code></td>
                    <td>{new Date(event.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {(serviceUser?.audit_events ?? []).length === 0 && (
                  <tr><td colSpan={3} className="of-text-muted">No service-user audit events yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
