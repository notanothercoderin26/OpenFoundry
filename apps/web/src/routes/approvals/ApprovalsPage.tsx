// Pending-approvals queue, backed by workflow-automation-service.
//
// Replaces the prior `/approvals` route that mounted the AuditPage —
// the launcher's "Approvals" tile now actually shows the approval
// queue described in the Foundry Approvals docs and required by Acts
// 5 + 6 of the geopolitics PoC demo script.
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Glyph } from '@/lib/components/ui/Glyph';
import {
  decideWorkflowApproval,
  listWorkflowApprovals,
  type WorkflowApproval,
} from '@/lib/api/workflows';

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: '', label: 'All' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#fef3c7', fg: '#92400e' },
    escalated: { bg: '#fee2e2', fg: '#991b1b' },
    approved: { bg: '#d1fae5', fg: '#065f46' },
    rejected: { bg: '#fee2e2', fg: '#991b1b' },
    expired: { bg: '#e5e7eb', fg: '#4b5563' },
  };
  const colors = palette[status] ?? palette.expired;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: colors.bg,
        color: colors.fg,
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  );
}

function relativeAge(iso: string) {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60_000);
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function ApprovalsPage() {
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [decisionComment, setDecisionComment] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => ['approvals', status] as const, [status]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => listWorkflowApprovals({ per_page: 50, status: status || undefined }),
  });

  const decide = useMutation({
    mutationFn: (vars: { id: string; decision: 'approve' | 'reject'; comment?: string }) =>
      decideWorkflowApproval(vars.id, { decision: vars.decision, comment: vars.comment }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  const approvals = data?.data ?? [];

  return (
    <section style={{ padding: '24px 28px', display: 'grid', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Glyph name="badge-check" size={18} />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Approvals</h1>
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          Workflow-backed review queue. Decide here or via Workshop.
        </span>
        <button
          type="button"
          className="of-button"
          onClick={() => void refetch()}
          disabled={isFetching}
          style={{ marginLeft: 'auto', fontSize: 12 }}
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            className="of-button"
            onClick={() => setStatus(f.value)}
            style={{
              fontSize: 12,
              fontWeight: status === f.value ? 600 : 400,
              background: status === f.value ? '#1f2937' : undefined,
              color: status === f.value ? '#fff' : undefined,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="of-panel" style={{ padding: 16, borderColor: '#fecaca', color: '#991b1b' }}>
          Failed to load approvals: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {isLoading ? (
        <div className="of-panel" style={{ padding: 36, textAlign: 'center' }}>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 14 }}>
            Loading approvals…
          </p>
        </div>
      ) : approvals.length === 0 ? (
        <div className="of-panel" style={{ padding: 36, textAlign: 'center' }}>
          <p className="of-text-muted" style={{ margin: 0, fontSize: 14 }}>
            {status ? `No ${status} approvals.` : 'No approvals.'}
          </p>
        </div>
      ) : (
        <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Title</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Assigned to</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Requested</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>Workflow</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a: WorkflowApproval) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 500 }}>{a.title || a.step_id}</div>
                    {a.instructions ? (
                      <div className="of-text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {a.instructions}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <StatusBadge status={a.status} />
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--of-font-mono, monospace)', fontSize: 12 }}>
                    {a.assigned_to ?? <span className="of-text-muted">—</span>}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12 }}>
                    <div>{relativeAge(a.requested_at)}</div>
                    <div className="of-text-muted" style={{ fontSize: 11 }}>
                      {new Date(a.requested_at).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--of-font-mono, monospace)', fontSize: 12 }}>
                    {a.workflow_id.slice(0, 8)}…
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    {a.status === 'pending' || a.status === 'escalated' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <input
                          type="text"
                          placeholder="Comment (optional)"
                          className="of-input"
                          value={decisionComment[a.id] ?? ''}
                          onChange={(e) => setDecisionComment((s) => ({ ...s, [a.id]: e.target.value }))}
                          style={{ fontSize: 12, width: 200 }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="of-button"
                            onClick={() =>
                              decide.mutate({
                                id: a.id,
                                decision: 'approve',
                                comment: decisionComment[a.id] || undefined,
                              })
                            }
                            disabled={decide.isPending}
                            style={{ fontSize: 12 }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="of-button"
                            onClick={() =>
                              decide.mutate({
                                id: a.id,
                                decision: 'reject',
                                comment: decisionComment[a.id] || undefined,
                              })
                            }
                            disabled={decide.isPending}
                            style={{ fontSize: 12, color: '#b91c1c', borderColor: '#fecaca' }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="of-text-muted" style={{ fontSize: 12 }}>
                        {a.decided_at ? `decided ${relativeAge(a.decided_at)}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
