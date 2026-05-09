import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createSsoProvider, deleteSsoProvider } from '@api/auth';
import { usePermissions } from '@/lib/auth/permissions';
import { settingsQueryKeys, ssoProvidersQuery } from './queries';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { parseJson, toOptionalString, toScopes } from './utils';

interface SsoProvidersSectionProps {
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

const DEFAULT_FORM = {
  slug: '',
  name: '',
  provider_type: 'oidc',
  enabled: true,
  client_id: '',
  client_secret: '',
  issuer_url: '',
  authorization_url: '',
  token_url: '',
  userinfo_url: '',
  scopes: 'openid,profile,email',
  saml_metadata_url: '',
  saml_entity_id: '',
  saml_sso_url: '',
  saml_certificate: '',
  attribute_mapping: '{\n  "subject": "sub",\n  "email": "email",\n  "name": "name"\n}',
};

export function SsoProvidersSection({ setNotice, setError }: SsoProvidersSectionProps) {
  const perms = usePermissions();
  const qc = useQueryClient();

  const result = useQuery({ ...ssoProvidersQuery, enabled: perms.canReadSso });
  const providers = result.data ?? [];

  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (provider) =>
        provider.name.toLowerCase().includes(q) ||
        provider.slug.toLowerCase().includes(q) ||
        provider.provider_type.toLowerCase().includes(q),
    );
  }, [filter, providers]);

  const createMutation = useMutation({
    mutationFn: () => {
      let attributeMapping: Record<string, unknown>;
      try {
        attributeMapping = parseJson(form.attribute_mapping);
      } catch (err) {
        return Promise.reject(
          new Error(
            err instanceof Error
              ? `Invalid attribute mapping JSON: ${err.message}`
              : 'Invalid attribute mapping JSON',
          ),
        );
      }
      return createSsoProvider({
        slug: form.slug,
        name: form.name,
        provider_type: form.provider_type,
        enabled: form.enabled,
        client_id: toOptionalString(form.client_id),
        client_secret: toOptionalString(form.client_secret),
        issuer_url: toOptionalString(form.issuer_url),
        authorization_url: toOptionalString(form.authorization_url),
        token_url: toOptionalString(form.token_url),
        userinfo_url: toOptionalString(form.userinfo_url),
        scopes: toScopes(form.scopes),
        saml_metadata_url: toOptionalString(form.saml_metadata_url),
        saml_entity_id: toOptionalString(form.saml_entity_id),
        saml_sso_url: toOptionalString(form.saml_sso_url),
        saml_certificate: toOptionalString(form.saml_certificate),
        attribute_mapping: attributeMapping,
      });
    },
    onSuccess: async () => {
      setForm(DEFAULT_FORM);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.ssoProviders });
      setNotice('SSO provider created.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create SSO provider'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSsoProvider(id),
    onMutate: (id) => setDeletingId(id),
    onSettled: () => setDeletingId(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.ssoProviders });
      setNotice('SSO provider deleted.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete SSO provider'),
  });

  if (!perms.canReadSso) return null;

  return (
    <section className="settings-section">
      <SettingsSectionHeader
        title="Third-party applications"
        description="Connect identity providers (OIDC and SAML) and federate sign-in into the workspace."
        filter={{ value: filter, placeholder: 'Filter providers…', onChange: setFilter }}
        actions={
          perms.canManageSso ? (
            <button
              type="button"
              className="of-btn of-btn-primary"
              onClick={() => {
                setForm(DEFAULT_FORM);
                setOpen(true);
              }}
            >
              + Connect provider
            </button>
          ) : null
        }
      />

      {result.isLoading ? (
        <div className="settings-empty">Loading providers…</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty">
          {filter ? 'No providers match the filter.' : 'No SSO providers configured.'}
        </div>
      ) : (
        <table className="settings-table">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Name</th>
              <th style={{ width: '14%' }}>Type</th>
              <th>Slug / scopes</th>
              <th style={{ width: '14%' }}>Status</th>
              {perms.canManageSso && <th style={{ width: '110px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((provider) => (
              <tr key={provider.id}>
                <td>
                  <div className="settings-table__name">{provider.name}</div>
                </td>
                <td>
                  <span className="of-chip">{provider.provider_type.toUpperCase()}</span>
                </td>
                <td>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    /{provider.slug}
                  </div>
                  <div className="settings-chip-row" style={{ marginTop: 6 }}>
                    {provider.scopes.map((scope) => (
                      <span key={scope} className="of-chip">
                        {scope}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={`of-chip ${provider.enabled ? 'of-status-success' : ''}`}>
                    {provider.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                {perms.canManageSso && (
                  <td>
                    <button
                      type="button"
                      className="of-btn of-btn-danger"
                      onClick={() => deleteMutation.mutate(provider.id)}
                      disabled={deletingId === provider.id}
                    >
                      {deletingId === provider.id ? 'Deleting…' : 'Delete'}
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
        title="Connect identity provider"
        description="Federate sign-in via OIDC or SAML."
        primaryLabel="Connect provider"
        primaryBusyLabel="Saving…"
        primaryDisabled={!form.name.trim() || !form.slug.trim()}
        busy={createMutation.isPending}
        onSubmit={() => createMutation.mutate()}
        onClose={() => setOpen(false)}
        width={680}
      >
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>Display name</span>
            <input
              className="of-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>Slug</span>
            <input
              className="of-input"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              required
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <span style={{ fontWeight: 500 }}>Provider type</span>
            <select
              className="of-select"
              value={form.provider_type}
              onChange={(e) => setForm((f) => ({ ...f, provider_type: e.target.value }))}
            >
              <option value="oidc">OIDC</option>
              <option value="saml">SAML</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            Enabled on creation
          </label>
        </div>

        {form.provider_type === 'oidc' ? (
          <>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <input
                className="of-input"
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                placeholder="Client ID"
              />
              <input
                className="of-input"
                value={form.client_secret}
                onChange={(e) => setForm((f) => ({ ...f, client_secret: e.target.value }))}
                placeholder="Client secret"
              />
              <input
                className="of-input"
                value={form.issuer_url}
                onChange={(e) => setForm((f) => ({ ...f, issuer_url: e.target.value }))}
                placeholder="Issuer URL"
              />
              <input
                className="of-input"
                value={form.authorization_url}
                onChange={(e) => setForm((f) => ({ ...f, authorization_url: e.target.value }))}
                placeholder="Authorization URL"
              />
              <input
                className="of-input"
                value={form.token_url}
                onChange={(e) => setForm((f) => ({ ...f, token_url: e.target.value }))}
                placeholder="Token URL"
              />
              <input
                className="of-input"
                value={form.userinfo_url}
                onChange={(e) => setForm((f) => ({ ...f, userinfo_url: e.target.value }))}
                placeholder="Userinfo URL"
              />
            </div>
            <input
              className="of-input"
              value={form.scopes}
              onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))}
              placeholder="Scopes, comma separated"
            />
          </>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              className="of-input"
              value={form.saml_metadata_url}
              onChange={(e) => setForm((f) => ({ ...f, saml_metadata_url: e.target.value }))}
              placeholder="SAML metadata URL"
            />
            <input
              className="of-input"
              value={form.saml_entity_id}
              onChange={(e) => setForm((f) => ({ ...f, saml_entity_id: e.target.value }))}
              placeholder="SAML entity ID"
            />
            <input
              className="of-input"
              value={form.saml_sso_url}
              onChange={(e) => setForm((f) => ({ ...f, saml_sso_url: e.target.value }))}
              placeholder="SAML SSO URL"
            />
            <input
              className="of-input"
              value={form.saml_certificate}
              onChange={(e) => setForm((f) => ({ ...f, saml_certificate: e.target.value }))}
              placeholder="SAML certificate"
            />
          </div>
        )}

        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Attribute mapping (JSON)</span>
          <textarea
            className="of-textarea"
            value={form.attribute_mapping}
            onChange={(e) => setForm((f) => ({ ...f, attribute_mapping: e.target.value }))}
            rows={7}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </label>
      </SettingsModal>
    </section>
  );
}
