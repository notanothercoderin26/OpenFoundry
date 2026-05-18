import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  dataConnection,
  type EgressApprovalTask,
  type EgressPolicyStatus,
  type NetworkEgressPolicy,
} from '@/lib/api/data-connection';
import { CreateEgressPolicyModal } from '@/lib/components/data-connection/CreateEgressPolicyModal';

export function EgressPoliciesPage() {
  const [policies, setPolicies] = useState<NetworkEgressPolicy[]>([]);
  const [approvals, setApprovals] = useState<EgressApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const pendingApprovalByPolicyId = useMemo(() => {
    const map = new Map<string, EgressApprovalTask>();
    const add = (task: EgressApprovalTask) => {
      if (task.status === 'pending' && !map.has(task.policy_id)) {
        map.set(task.policy_id, task);
      }
    };
    approvals.forEach(add);
    policies.forEach((policy) => (policy.approval_tasks ?? []).forEach(add));
    return map;
  }, [approvals, policies]);

  const summary = useMemo(() => ({
    total: policies.length,
    active: policies.filter((policy) => policyState(policy) === 'active').length,
    approvals: pendingApprovalByPolicyId.size,
    exportWorkloads: policies.reduce((total, policy) => total + (policy.workload_usages ?? []).filter((use) => use.potential_data_export).length, 0),
  }), [pendingApprovalByPolicyId.size, policies]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const nextPolicies = await dataConnection.listEgressPolicies();
      setPolicies(nextPolicies);
      try {
        setApprovals(await dataConnection.listEgressApprovals('pending'));
      } catch {
        setApprovals([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function changeState(p: NetworkEgressPolicy, state: EgressPolicyStatus) {
    const verb = state === 'revoked' ? 'revoke' : state;
    if (state === 'revoked' && typeof window !== 'undefined' && !window.confirm(`Revoke policy "${p.name}"? Revoked policies cannot be reactivated.`)) return;
    setBusyId(p.id);
    setNotice('');
    try {
      await dataConnection.updateEgressPolicyState(p.id, { state, reason: `${verb} from Data Connection egress policies` });
      setNotice(`Policy "${p.name}" moved to ${state}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'State update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function decideApproval(task: EgressApprovalTask, decision: 'approved' | 'denied') {
    setBusyId(task.id);
    setNotice('');
    try {
      await dataConnection.decideEgressApproval(task.id, {
        decision,
        reason: `${decision} ${task.action} from Data Connection egress policies`,
      });
      setNotice(`Approval ${decision} for policy request.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Approval decision failed');
    } finally {
      setBusyId(null);
    }
  }

  function handleCreated(policy: NetworkEgressPolicy) {
    setNotice(`Policy "${policy.name}" created.`);
    void load();
  }

  return (
    <section className="of-page" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Link to="/data-connection" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← Back to sources</Link>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 className="of-heading-xl">Egress policies</h1>
          <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 720 }}>
            Governed direct, agent-proxy, and same-region bucket routes for workloads that explicitly import egress policies.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="of-button of-button--primary">
          + Egress policy
        </button>
      </header>

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {notice && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {notice}
        </div>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <Metric label="Policies" value={summary.total} />
        <Metric label="Active" value={summary.active} />
        <Metric label="Pending approvals" value={summary.approvals} />
        <Metric label="Export workloads" value={summary.exportWorkloads} />
      </section>
      <section className="of-panel-muted" style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>
        Importer grants are high-risk: they allow a workload to import a policy and reach an external destination at runtime. Policies remain immutable after creation; revoke instead of deleting.
      </section>

      {loading ? (
        <p className="of-text-muted">Loading policies...</p>
      ) : (
        <section className="of-panel" style={{ padding: 16, overflow: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Kind', 'Address', 'Port', 'Runtime', 'Route controls', 'Risk and audit', 'Approval', 'Importer grants', ''].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--border-default)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const approval = pendingApprovalByPolicyId.get(p.id);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: 6, fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: 6 }}>{p.kind}</td>
                    <td style={{ padding: 6, fontFamily: 'var(--font-mono)' }}>{p.address.kind}:{p.address.value}</td>
                    <td style={{ padding: 6, fontFamily: 'var(--font-mono)' }}>{p.port.kind === 'any' ? 'any' : p.port.value}</td>
                    <td style={{ padding: 6 }}>
                      <span className={stateClass(policyState(p))}>{policyState(p)}</span>
                    </td>
                    <td style={{ padding: 6, fontSize: 11 }}>
                      {routeControlSummary(p)}
                    </td>
                    <td style={{ padding: 6, fontSize: 11 }}>
                      <PolicySignals policy={p} />
                    </td>
                    <td style={{ padding: 6, fontSize: 11 }}>
                      <ApprovalSummary task={approval} policy={p} />
                    </td>
                    <td style={{ padding: 6, fontSize: 11 }}>{(p.importer_grants ?? p.permissions ?? []).join(', ') || 'None'}</td>
                    <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {approval ? (
                        <>
                          <button type="button" onClick={() => void decideApproval(approval, 'approved')} disabled={busyId === approval.id} className="of-button" style={{ fontSize: 11 }}>
                            Approve
                          </button>
                          <button type="button" onClick={() => void decideApproval(approval, 'denied')} disabled={busyId === approval.id} className="of-button" style={{ fontSize: 11, marginLeft: 6, color: '#b91c1c', borderColor: '#fecaca' }}>
                            Deny
                          </button>
                        </>
                      ) : (
                        <>
                          {policyState(p) === 'pending_approval' && (
                            <button type="button" onClick={() => void changeState(p, 'active')} disabled={busyId === p.id} className="of-button" style={{ fontSize: 11 }}>
                              Activate
                            </button>
                          )}
                          {policyState(p) === 'active' && (
                            <button type="button" onClick={() => void changeState(p, 'paused')} disabled={busyId === p.id} className="of-button" style={{ fontSize: 11 }}>
                              Pause
                            </button>
                          )}
                          {policyState(p) === 'paused' && (
                            <button type="button" onClick={() => void changeState(p, 'active')} disabled={busyId === p.id} className="of-button" style={{ fontSize: 11 }}>
                              Resume
                            </button>
                          )}
                          {policyState(p) !== 'revoked' && (
                            <button type="button" onClick={() => void changeState(p, 'revoked')} disabled={busyId === p.id} className="of-button" style={{ fontSize: 11, marginLeft: 6, color: '#b91c1c', borderColor: '#fecaca' }}>
                              Revoke
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {policies.length === 0 && (
                <tr><td colSpan={10} className="of-text-muted" style={{ padding: 18, textAlign: 'center' }}>No egress policies.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <CreateEgressPolicyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="of-panel-muted" style={{ padding: 12 }}>
      <p className="of-eyebrow" style={{ margin: 0 }}>{label}</p>
      <p className="of-heading-lg" style={{ margin: '4px 0 0' }}>{value}</p>
    </div>
  );
}

function PolicySignals({ policy }: { policy: NetworkEgressPolicy }) {
  const signals: string[] = [];
  const warnings = policy.risk_warnings ?? [];
  const exports = (policy.workload_usages ?? []).filter((use) => use.potential_data_export);
  if (policy.importer_grants_high_risk) signals.push('high-risk importers');
  if (warnings.length > 0) signals.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  if ((policy.egress_ip_ranges ?? []).length > 0) signals.push(`IP/CIDR ${(policy.egress_ip_ranges ?? []).length}`);
  if ((policy.agent_hosts ?? []).length > 0) signals.push(`agents ${(policy.agent_hosts ?? []).join(', ')}`);
  if ((policy.overlap_policy_ids ?? []).length > 0) signals.push(`overlaps ${(policy.overlap_policy_ids ?? []).length}`);
  if ((policy.bucket_policy_requirements ?? []).length > 0) signals.push(`S3 requirements ${(policy.bucket_policy_requirements ?? []).length}`);
  if (exports.length > 0) signals.push(`export workloads ${exports.length}`);
  return <span>{signals.join(' / ') || 'No warnings'}</span>;
}

function ApprovalSummary({ task, policy }: { task?: EgressApprovalTask; policy: NetworkEgressPolicy }) {
  if (task) {
    const roles = task.required_roles.length > 0 ? task.required_roles.join(', ') : 'security approver';
    return <span>{task.action} pending / {roles}</span>;
  }
  const latest = (policy.approval_tasks ?? []).find((approval) => approval.status !== 'pending');
  return <span>{latest ? `${latest.action} ${latest.status}` : 'No pending approval'}</span>;
}

function policyState(policy: NetworkEgressPolicy): EgressPolicyStatus {
  return policy.state ?? policy.status ?? 'pending_approval';
}

function routeControlSummary(policy: NetworkEgressPolicy) {
  const parts = [`${policy.protocol ?? 'tcp'}`, `SNI ${policy.sni_behavior ?? 'verify'}`];
  parts.push((policy.allowed_organizations ?? []).join(', ') || (policy.is_global ? 'all organizations' : 'source scoped'));
  if (policy.kind === 'agent_proxy') {
    parts.push(`proxy ${policy.proxy_mode ?? 'none'}`);
    parts.push(`${(policy.agents ?? []).length} agent${(policy.agents ?? []).length === 1 ? '' : 's'}`);
  }
  if (policy.kind === 'same_region_bucket') {
    parts.push(policy.bucket_name ? `bucket ${policy.bucket_name}` : 'bucket unset');
    parts.push(policy.bucket_access_level ?? 'access unset');
  }
  return parts.join(' / ');
}

function stateClass(state: EgressPolicyStatus) {
  if (state === 'active') return 'of-status-success';
  if (state === 'pending_approval') return 'of-status-warning';
  return 'of-status-danger';
}
