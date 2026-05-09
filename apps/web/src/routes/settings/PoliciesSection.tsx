import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createPolicy,
  deletePolicy,
  evaluatePolicy,
  type PolicyEvaluationResult,
} from '@api/auth';
import { usePermissions } from '@/lib/auth/permissions';
import { policiesQuery, settingsQueryKeys } from './queries';
import { SettingsModal } from './SettingsModal';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { parseJson, toOptionalString } from './utils';

interface PoliciesSectionProps {
  setNotice: (msg: string) => void;
  setError: (msg: string) => void;
}

const DEFAULT_POLICY_FORM = {
  name: '',
  description: '',
  effect: 'allow',
  resource: 'datasets',
  action: 'read',
  conditions: '{\n  "subject": {},\n  "resource": {}\n}',
  row_filter: '',
  enabled: true,
};

const DEFAULT_EVAL_FORM = {
  resource: 'datasets',
  action: 'read',
  resource_attributes:
    '{\n  "organization_id": null,\n  "effective_marking": "public",\n  "consumer_surface": "workshop"\n}',
};

export function PoliciesSection({ setNotice, setError }: PoliciesSectionProps) {
  const perms = usePermissions();
  const qc = useQueryClient();

  const result = useQuery({ ...policiesQuery, enabled: perms.canReadPolicies });
  const policies = result.data ?? [];

  const [filter, setFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_POLICY_FORM);
  const [evalForm, setEvalForm] = useState(DEFAULT_EVAL_FORM);
  const [evaluation, setEvaluation] = useState<PolicyEvaluationResult | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter(
      (policy) =>
        policy.name.toLowerCase().includes(q) ||
        policy.resource.toLowerCase().includes(q) ||
        policy.action.toLowerCase().includes(q),
    );
  }, [filter, policies]);

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
      return createPolicy({
        name: form.name,
        description: toOptionalString(form.description),
        effect: form.effect,
        resource: form.resource,
        action: form.action,
        conditions,
        row_filter: toOptionalString(form.row_filter),
        enabled: form.enabled,
      });
    },
    onSuccess: async () => {
      setForm(DEFAULT_POLICY_FORM);
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.policies });
      setNotice('Policy created.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create policy'),
  });

  const deleteMutation = useMutation({
    mutationFn: (policyId: string) => deletePolicy(policyId),
    onMutate: (policyId) => setDeletingId(policyId),
    onSettled: () => setDeletingId(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: settingsQueryKeys.policies });
      setNotice('Policy deleted.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete policy'),
  });

  const evaluateMutation = useMutation({
    mutationFn: () => {
      let resourceAttributes: Record<string, unknown>;
      try {
        resourceAttributes = parseJson(evalForm.resource_attributes);
      } catch (err) {
        return Promise.reject(
          new Error(
            err instanceof Error
              ? `Invalid resource attributes JSON: ${err.message}`
              : 'Invalid resource attributes JSON',
          ),
        );
      }
      return evaluatePolicy({
        resource: evalForm.resource,
        action: evalForm.action,
        resource_attributes: resourceAttributes,
      });
    },
    onSuccess: (data) => {
      setEvaluation(data);
      setNotice('Policy evaluation completed.');
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Evaluation failed'),
  });

  if (!perms.canReadPolicies) return null;

  return (
    <section className="settings-section">
      <SettingsSectionHeader
        title="Policies"
        description="Attribute-based access control rules. Allow or deny actions based on subject and resource attributes."
        filter={{ value: filter, placeholder: 'Filter policies…', onChange: setFilter }}
        actions={
          <>
            <button type="button" className="of-btn" onClick={() => setEvalOpen(true)}>
              Evaluate access
            </button>
            {perms.canManagePolicies && (
              <button
                type="button"
                className="of-btn of-btn-primary"
                onClick={() => {
                  setForm(DEFAULT_POLICY_FORM);
                  setCreateOpen(true);
                }}
              >
                + Create policy
              </button>
            )}
          </>
        }
      />

      {result.isLoading ? (
        <div className="settings-empty">Loading policies…</div>
      ) : filtered.length === 0 ? (
        <div className="settings-empty">
          {filter ? 'No policies match the filter.' : 'No policies registered.'}
        </div>
      ) : (
        <table className="settings-table">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Name</th>
              <th style={{ width: '12%' }}>Effect</th>
              <th>Resource:Action</th>
              <th style={{ width: '12%' }}>Status</th>
              {perms.canManagePolicies && <th style={{ width: '110px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((policy) => (
              <tr key={policy.id}>
                <td>
                  <div className="settings-table__name">{policy.name}</div>
                  {policy.description && (
                    <div className="settings-table__sub">{policy.description}</div>
                  )}
                </td>
                <td>
                  <span
                    className={`of-chip ${policy.effect === 'allow' ? 'of-status-success' : 'of-status-danger'}`}
                  >
                    {policy.effect}
                  </span>
                </td>
                <td>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {policy.resource}:{policy.action}
                  </span>
                  {policy.row_filter && (
                    <div className="settings-table__sub">Row filter applied</div>
                  )}
                </td>
                <td>
                  <span className={`of-chip ${policy.enabled ? 'of-status-success' : ''}`}>
                    {policy.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                {perms.canManagePolicies && (
                  <td>
                    <button
                      type="button"
                      className="of-btn of-btn-danger"
                      onClick={() => deleteMutation.mutate(policy.id)}
                      disabled={deletingId === policy.id}
                    >
                      {deletingId === policy.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SettingsModal
        open={createOpen}
        title="Create policy"
        description="Policies evaluate subject and resource attributes to allow or deny actions."
        primaryLabel="Create policy"
        primaryBusyLabel="Saving…"
        primaryDisabled={!form.name.trim()}
        busy={createMutation.isPending}
        onSubmit={() => createMutation.mutate()}
        onClose={() => setCreateOpen(false)}
        width={620}
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Name</span>
          <input
            className="of-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Policy name"
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
            placeholder="What does this policy enforce?"
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
          <span style={{ fontWeight: 500 }}>Effect</span>
          <select
            className="of-select"
            value={form.effect}
            onChange={(e) => setForm((f) => ({ ...f, effect: e.target.value }))}
          >
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Conditions (JSON)</span>
          <textarea
            className="of-textarea"
            value={form.conditions}
            onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
            rows={7}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Row filter template (optional)</span>
          <input
            className="of-input"
            value={form.row_filter}
            onChange={(e) => setForm((f) => ({ ...f, row_filter: e.target.value }))}
            placeholder="e.g. organization_id = :organization_id"
          />
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

      <SettingsModal
        open={evalOpen}
        title="Evaluate access"
        description="Simulate a policy evaluation given resource and action with attribute context."
        primaryLabel="Evaluate"
        primaryBusyLabel="Evaluating…"
        busy={evaluateMutation.isPending}
        onSubmit={() => evaluateMutation.mutate()}
        onClose={() => {
          setEvalOpen(false);
          setEvaluation(null);
        }}
        width={620}
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Resource</span>
          <input
            className="of-input"
            value={evalForm.resource}
            onChange={(e) => setEvalForm((f) => ({ ...f, resource: e.target.value }))}
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Action</span>
          <input
            className="of-input"
            value={evalForm.action}
            onChange={(e) => setEvalForm((f) => ({ ...f, action: e.target.value }))}
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>Resource attributes (JSON)</span>
          <textarea
            className="of-textarea"
            value={evalForm.resource_attributes}
            onChange={(e) =>
              setEvalForm((f) => ({ ...f, resource_attributes: e.target.value }))
            }
            rows={6}
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </label>

        {evaluation && (
          <div className="of-panel-muted" style={{ padding: 12, fontSize: 13 }}>
            <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>
              {evaluation.allowed ? 'Allowed' : 'Denied'}
            </div>
            <div className="of-text-muted" style={{ marginTop: 6 }}>
              Matched: {evaluation.matched_policy_ids.length}
              {' · '}Restricted views: {evaluation.matched_restricted_view_ids.length}
              {' · '}Deny hits: {evaluation.deny_policy_ids.length}
            </div>
            <div className="settings-chip-row" style={{ marginTop: 10 }}>
              {evaluation.allowed_markings.map((marking) => (
                <span key={marking} className="of-chip of-chip-active">
                  {marking}
                </span>
              ))}
              {evaluation.hidden_columns.map((column) => (
                <span key={column} className="of-chip of-status-danger">
                  Hide {column}
                </span>
              ))}
              {evaluation.consumer_mode && (
                <span className="of-chip of-status-warning">Consumer mode</span>
              )}
            </div>
            {evaluation.deny_reasons.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'var(--status-danger-bg)',
                  color: 'var(--status-danger)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                }}
              >
                {evaluation.deny_reasons.join(' · ')}
              </div>
            )}
          </div>
        )}
      </SettingsModal>
    </section>
  );
}
