import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createApiKey, revokeApiKey, type ApiKeyWithSecret } from '@api/auth';
import { apiKeysQuery, settingsQueryKeys } from './queries';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { toIsoDateTime, toScopes } from './utils';

interface ApiKeysSectionProps {
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

const DEFAULT_FORM = { name: '', scopes: '', expires_at: '' };

export function ApiKeysSection({ setNotice, setError }: ApiKeysSectionProps) {
  const qc = useQueryClient();

  const result = useQuery(apiKeysQuery);
  const apiKeys = result.data ?? [];

  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [newKey, setNewKey] = useState<ApiKeyWithSecret | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return apiKeys;
    return apiKeys.filter(
      (key) =>
        key.name.toLowerCase().includes(q) ||
        key.prefix.toLowerCase().includes(q) ||
        key.scopes.some((scope) => scope.toLowerCase().includes(q)),
    );
  }, [filter, apiKeys]);

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey({
        name: form.name,
        scopes: toScopes(form.scopes),
        expires_at: toIsoDateTime(form.expires_at),
      }),
    onSuccess: async (data) => {
      setNewKey(data);
      setForm(DEFAULT_FORM);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.apiKeys });
      setNotice('API key created. Copy the token now; it will not be shown again.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create API key'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onMutate: (id) => setRevokingId(id),
    onSettled: () => setRevokingId(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.apiKeys });
      setNotice('API key revoked.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to revoke API key'),
  });

  return (
    <section className="settings-section">
      <SettingsSectionHeader
        title="API keys"
        description="Issue scoped programmatic credentials for automation and service integrations."
        filter={{ value: filter, placeholder: 'Filter keys…', onChange: setFilter }}
        actions={
          <button
            type="button"
            className="of-btn of-btn-primary"
            onClick={() => {
              setForm(DEFAULT_FORM);
              setOpen(true);
            }}
          >
            + Create API key
          </button>
        }
      />

      {newKey && (
        <div
          style={{
            padding: 16,
            border: '1px dashed var(--status-warning)',
            background: 'var(--status-warning-bg)',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>New key token</div>
            <button
              type="button"
              className="of-btn of-btn-ghost"
              onClick={() => setNewKey(null)}
            >
              Dismiss
            </button>
          </div>
          <div
            style={{
              marginTop: 8,
              wordBreak: 'break-all',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--status-warning)',
            }}
          >
            {newKey.token}
          </div>
        </div>
      )}

      {result.isLoading ? (
        <div className="settings-empty">Loading API keys…</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty">
          {filter ? 'No keys match the filter.' : 'No API keys issued yet.'}
        </div>
      ) : (
        <table className="settings-table">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Name</th>
              <th style={{ width: '20%' }}>Prefix</th>
              <th>Scopes</th>
              <th style={{ width: '20%' }}>Created</th>
              <th style={{ width: '110px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((apiKey) => (
              <tr key={apiKey.id}>
                <td>
                  <div className="settings-table__name">{apiKey.name}</div>
                  {apiKey.revoked_at && (
                    <div className="settings-table__sub" style={{ color: 'var(--status-danger)' }}>
                      Revoked
                    </div>
                  )}
                </td>
                <td>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{apiKey.prefix}</span>
                </td>
                <td>
                  <div className="settings-chip-row">
                    {apiKey.scopes.length === 0 ? (
                      <span className="of-text-soft">—</span>
                    ) : (
                      apiKey.scopes.map((scope) => (
                        <span key={scope} className="of-chip of-status-info">
                          {scope}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td>
                  <span className="of-text-muted">
                    {new Date(apiKey.created_at).toLocaleString()}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="of-btn"
                    onClick={() => revokeMutation.mutate(apiKey.id)}
                    disabled={revokingId === apiKey.id || apiKey.revoked_at !== null}
                  >
                    {apiKey.revoked_at !== null
                      ? 'Revoked'
                      : revokingId === apiKey.id
                        ? 'Revoking…'
                        : 'Revoke'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SettingsModal
        open={open}
        title="Create API key"
        description="Tokens are shown once when issued. Copy and store yours securely."
        primaryLabel="Create API key"
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
            placeholder="e.g. CI deploy bot"
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Scopes (optional)</span>
          <input
            className="of-input"
            value={form.scopes}
            onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))}
            placeholder="comma separated, e.g. datasets:read,datasets:write"
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Expires at (optional)</span>
          <input
            className="of-input"
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
          />
        </label>
      </SettingsModal>
    </section>
  );
}
