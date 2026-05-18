import { useEffect, useState } from 'react';

import {
  createRetentionPolicy,
  deleteRetentionPolicy,
  getApplicablePolicies,
  getRetentionPreview,
  type ApplicablePoliciesResponse,
  type RetentionDatasetSelectorKind,
  type RetentionPolicy,
  type RetentionPolicyType,
  type RetentionPreviewResponse,
  type RetentionTransactionSelectorKind,
} from '@/lib/api/datasets';

interface RetentionPoliciesTabProps {
  datasetRid: string;
  projectId?: string;
  spaceId?: string;
  orgId?: string;
  canManage?: boolean;
}

function PolicyRow({ policy, onDelete }: { policy: RetentionPolicy; onDelete?: () => void }) {
  const warning = policy.warnings?.[0];
  return (
    <li
      style={{
        padding: 8,
        background: 'var(--bg-subtle)',
        borderRadius: 6,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
      }}
    >
      <div>
        <strong>{policy.name}</strong>
        <span className="of-text-muted" style={{ marginLeft: 8, fontSize: 11 }}>
          · {policy.policy_type ?? (policy.is_system ? 'recommended' : 'custom')} · {policy.target_kind} · {policy.retention_days}d · {policy.purge_mode}{policy.legal_hold ? ' · legal hold' : ''}
          {policy.space_id ? ` · space ${policy.space_id.slice(0, 8)}` : ''}
          {policy.legacy_deprecation_status ? ` · ${policy.legacy_deprecation_status}` : ''}
        </span>
        {warning && (
          <div style={{ marginTop: 4, color: warning.severity === 'critical' ? '#b91c1c' : '#92400e', fontSize: 11 }}>
            {warning.message}
          </div>
        )}
      </div>
      {onDelete && (
        <button type="button" onClick={onDelete} className="of-button" style={{ fontSize: 10, color: '#b91c1c', borderColor: '#fecaca' }}>
          Delete
        </button>
      )}
    </li>
  );
}

export function RetentionPoliciesTab({ datasetRid, projectId, spaceId, orgId, canManage = false }: RetentionPoliciesTabProps) {
  const [applicable, setApplicable] = useState<ApplicablePoliciesResponse | null>(null);
  const [preview, setPreview] = useState<RetentionPreviewResponse | null>(null);
  const [asOfDays, setAsOfDays] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [retentionDays, setRetentionDays] = useState(90);
  const [policyType, setPolicyType] = useState<RetentionPolicyType>('custom');
  const [targetKind, setTargetKind] = useState<'dataset' | 'transaction'>('transaction');
  const [datasetSelectorKind, setDatasetSelectorKind] = useState<RetentionDatasetSelectorKind>('dataset_rids');
  const [transactionSelectorKind, setTransactionSelectorKind] = useState<RetentionTransactionSelectorKind>('older_than');
  const [branchName, setBranchName] = useState('master');
  const [selectorCount, setSelectorCount] = useState(20);
  const [selectorAgeDays, setSelectorAgeDays] = useState(90);
  const [allowLatestViewDeletion, setAllowLatestViewDeletion] = useState(false);
  const [abortOpenTransactions, setAbortOpenTransactions] = useState(false);
  const [dangerAcknowledged, setDangerAcknowledged] = useState(false);
  const [legacyConfigYaml, setLegacyConfigYaml] = useState('');

  async function loadApplicable() {
    setError(null);
    try {
      setApplicable(await getApplicablePolicies(datasetRid, { project_id: projectId, space_id: spaceId, org_id: orgId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Applicable-policies failed.');
    }
  }
  async function loadPreview() {
    try {
      setPreview(await getRetentionPreview(datasetRid, asOfDays, { project_id: projectId, space_id: spaceId, org_id: orgId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview failed.');
    }
  }

  useEffect(() => { void loadApplicable(); }, [datasetRid, projectId, spaceId, orgId]);
  useEffect(() => { void loadPreview(); }, [datasetRid, asOfDays]);

  async function createPolicy() {
    if (!policyName.trim()) return;
    const danger = allowLatestViewDeletion || abortOpenTransactions;
    if (danger && !dangerAcknowledged) {
      setError('Confirm the destructive retention warning before saving this policy.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createRetentionPolicy({
        name: policyName.trim(),
        scope: spaceId ? `space:${spaceId}` : `dataset:${datasetRid}`,
        target_kind: targetKind,
        retention_days: retentionDays,
        legal_hold: false,
        purge_mode: 'soft',
        rules: [],
        policy_type: policyType,
        space_id: spaceId ?? null,
        legacy_deprecation_status: policyType === 'legacy' ? 'deprecated' : undefined,
        legacy_config_yaml: policyType === 'legacy' ? legacyConfigYaml : undefined,
        selector: { dataset_rid: datasetRid } as Parameters<typeof createRetentionPolicy>[0]['selector'],
        criteria: transactionSelectorKind === 'aborted'
          ? { transaction_state: 'ABORTED' }
          : transactionSelectorKind === 'older_than'
            ? { transaction_age_seconds: selectorAgeDays * 24 * 60 * 60 }
            : {},
        dataset_selectors: [{
          mode: 'select',
          kind: datasetSelectorKind,
          dataset_rids: datasetSelectorKind === 'dataset_rids' ? [datasetRid] : undefined,
        }],
        transaction_selectors: [buildTransactionSelector(transactionSelectorKind, branchName, selectorCount, selectorAgeDays)],
        allow_latest_view_deletion: allowLatestViewDeletion,
        abort_open_transactions: abortOpenTransactions,
        danger_acknowledgement: danger ? 'DELETE_CURRENT_DATA' : '',
        grace_period_minutes: 60,
        updated_by: 'ui',
      });
      setPolicyName('');
      setCreating(false);
      setDangerAcknowledged(false);
      await loadApplicable();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Create policy failed.');
    } finally {
      setBusy(false);
    }
  }

  async function deletePolicy(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete policy?')) return;
    setBusy(true);
    try {
      await deleteRetentionPolicy(id);
      await loadApplicable();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <div style={{ padding: '8px 12px', background: '#1e3a8a', color: '#bfdbfe', borderRadius: 6, fontSize: 11 }}>
        <strong>Beta:</strong> retention policies. Inherited bottom-up: org to space to project to explicit.
      </div>

      {error && <div className="of-status-danger" style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>{error}</div>}

      {applicable && (
        <>
          {(['org', 'space', 'project'] as const).map((scope) => {
            const list = applicable.inherited[scope];
            return (
              <section key={scope} className="of-panel" style={{ padding: 12 }}>
                <p className="of-eyebrow" style={{ fontSize: 10 }}>{scope.toUpperCase()} ({list.length})</p>
                <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                  {list.map((p) => <PolicyRow key={p.id} policy={p} />)}
                  {list.length === 0 && <li className="of-text-muted" style={{ fontSize: 11 }}>None.</li>}
                </ul>
              </section>
            );
          })}

          <section className="of-panel" style={{ padding: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <p className="of-eyebrow" style={{ fontSize: 10 }}>Explicit on this dataset ({applicable.explicit.length})</p>
              {canManage && !creating && (
                <button type="button" onClick={() => setCreating(true)} className="of-button" style={{ fontSize: 11 }}>+ New policy</button>
              )}
            </header>
            <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
              {applicable.explicit.map((p) => (
                <PolicyRow key={p.id} policy={p} onDelete={canManage ? () => void deletePolicy(p.id) : undefined} />
              ))}
              {applicable.explicit.length === 0 && <li className="of-text-muted" style={{ fontSize: 11 }}>No explicit policies on this dataset.</li>}
            </ul>
            {creating && (
              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                <input value={policyName} onChange={(e) => setPolicyName(e.target.value)} placeholder="Policy name" className="of-input" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  <label style={{ fontSize: 12 }}>
                    Policy type
                    <select value={policyType} onChange={(e) => setPolicyType(e.target.value as RetentionPolicyType)} className="of-input" style={{ marginTop: 4 }}>
                      <option value="custom">Custom</option>
                      <option value="legacy">Legacy YAML-style</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Target
                    <select value={targetKind} onChange={(e) => setTargetKind(e.target.value as 'dataset' | 'transaction')} className="of-input" style={{ marginTop: 4 }}>
                      <option value="transaction">Transactions</option>
                      <option value="dataset">Dataset</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Retention days
                    <input type="number" min={0} value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value) || 0)} className="of-input" style={{ marginTop: 4 }} />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  <label style={{ fontSize: 12 }}>
                    Dataset selector
                    <select value={datasetSelectorKind} onChange={(e) => setDatasetSelectorKind(e.target.value as RetentionDatasetSelectorKind)} className="of-input" style={{ marginTop: 4 }}>
                      <option value="dataset_rids">This dataset</option>
                      <option value="all">All datasets in scope</option>
                      <option value="derived">Derived datasets</option>
                      <option value="trash">Trash</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Transaction selector
                    <select value={transactionSelectorKind} onChange={(e) => setTransactionSelectorKind(e.target.value as RetentionTransactionSelectorKind)} className="of-input" style={{ marginTop: 4 }}>
                      <option value="older_than">Older than age</option>
                      <option value="transaction_count">Keep latest count</option>
                      <option value="view_count">Keep latest views</option>
                      <option value="only_branch">Only branch</option>
                      <option value="not_branch">Exclude branch</option>
                      <option value="aborted">Aborted transactions</option>
                    </select>
                  </label>
                  {(transactionSelectorKind === 'only_branch' || transactionSelectorKind === 'not_branch') && (
                    <label style={{ fontSize: 12 }}>
                      Branch
                      <input value={branchName} onChange={(e) => setBranchName(e.target.value)} className="of-input" style={{ marginTop: 4 }} />
                    </label>
                  )}
                  {(transactionSelectorKind === 'transaction_count' || transactionSelectorKind === 'view_count') && (
                    <label style={{ fontSize: 12 }}>
                      Count
                      <input type="number" min={0} value={selectorCount} onChange={(e) => setSelectorCount(Number(e.target.value) || 0)} className="of-input" style={{ marginTop: 4 }} />
                    </label>
                  )}
                  {(transactionSelectorKind === 'older_than' || transactionSelectorKind === 'only_present_in_views_older_than') && (
                    <label style={{ fontSize: 12 }}>
                      Age days
                      <input type="number" min={1} value={selectorAgeDays} onChange={(e) => setSelectorAgeDays(Number(e.target.value) || 1)} className="of-input" style={{ marginTop: 4 }} />
                    </label>
                  )}
                </div>
                {policyType === 'legacy' && (
                  <label style={{ fontSize: 12 }}>
                    Legacy YAML
                    <textarea value={legacyConfigYaml} onChange={(e) => setLegacyConfigYaml(e.target.value)} rows={3} className="of-input" style={{ marginTop: 4 }} />
                  </label>
                )}
                <div className="of-status-warning" style={{ padding: 10, borderRadius: 6, display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={allowLatestViewDeletion} onChange={(e) => setAllowLatestViewDeletion(e.target.checked)} />
                    Allow current/latest-view transaction deletion
                  </label>
                  <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={abortOpenTransactions} onChange={(e) => setAbortOpenTransactions(e.target.checked)} />
                    Allow aborting open transactions
                  </label>
                  {(allowLatestViewDeletion || abortOpenTransactions) && (
                    <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="checkbox" checked={dangerAcknowledged} onChange={(e) => setDangerAcknowledged(e.target.checked)} />
                      I understand this can delete current data or abort active writes
                    </label>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => void createPolicy()} disabled={busy} className="of-button of-button--primary" style={{ fontSize: 11 }}>Create</button>
                  <button type="button" onClick={() => setCreating(false)} className="of-button" style={{ fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            )}
          </section>

          <section className="of-panel" style={{ padding: 12 }}>
            <p className="of-eyebrow" style={{ fontSize: 10 }}>Effective policy</p>
            {applicable.effective ? <PolicyRow policy={applicable.effective} /> : <p className="of-text-muted" style={{ fontSize: 11 }}>No policy applies — data retained indefinitely.</p>}
            {applicable.conflicts.length > 0 && (
              <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 11 }}>
                {applicable.conflicts.map((c, i) => (
                  <li key={i} style={{ color: '#fbbf24' }}>
                    Conflict: {c.winner_id} won over {c.loser_id} — {c.reason}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="of-panel" style={{ padding: 12, display: 'grid', gap: 8 }}>
        <p className="of-eyebrow" style={{ fontSize: 10 }}>Preview deletions</p>
        <label style={{ fontSize: 12 }}>
          As of (days from now): {asOfDays}
          <input
            type="range"
            min={0}
            max={365}
            value={asOfDays}
            onChange={(e) => setAsOfDays(Number(e.target.value))}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        {preview && (
          <ul className="of-text-muted" style={{ paddingLeft: 18, fontSize: 12, marginTop: 0 }}>
            <li>{preview.summary.transactions_would_delete} of {preview.summary.transactions_total} transactions would be purged</li>
            <li>{preview.summary.files_total} files · {preview.summary.bytes_total.toLocaleString()} bytes</li>
            {preview.warnings.length > 0 && preview.warnings.map((w, i) => <li key={i} style={{ color: '#fbbf24' }}>{w}</li>)}
          </ul>
        )}
      </section>
    </section>
  );
}

function buildTransactionSelector(kind: RetentionTransactionSelectorKind, branch: string, count: number, ageDays: number) {
  if (kind === 'only_branch' || kind === 'not_branch') return { kind, branch };
  if (kind === 'transaction_count' || kind === 'view_count') return { kind, count };
  if (kind === 'older_than' || kind === 'only_present_in_views_older_than') return { kind, duration_seconds: ageDays * 24 * 60 * 60 };
  return { kind };
}
