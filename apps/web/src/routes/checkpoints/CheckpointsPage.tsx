import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type CheckpointEnabled = 'enabled' | 'paused';
type ReviewStatus = 'pending-review' | 'approved' | 'flagged';

interface CheckpointDefinition {
  id: string;
  name: string;
  trigger: string;
  prompt: string;
  status: CheckpointEnabled;
  category: 'access' | 'export' | 'mutation' | 'admin';
  hitsLast24h: number;
}

interface JustificationEvent {
  id: string;
  checkpoint: string;
  user: string;
  resource: string;
  justification: string;
  reviewStatus: ReviewStatus;
  occurredAt: string;
}

const MOCK_CHECKPOINTS: CheckpointDefinition[] = [
  {
    id: 'cp-pii-export',
    name: 'Export PII dataset',
    trigger: 'When a marked-as-PII column is included in a downloaded report.',
    prompt: 'Explain why you need to export PII outside OpenFoundry. Include the recipient and retention plan.',
    status: 'enabled',
    category: 'export',
    hitsLast24h: 14,
  },
  {
    id: 'cp-restricted-view',
    name: 'Open restricted dataset view',
    trigger: 'When opening a dataset tagged with "restricted-finance".',
    prompt: 'State the business purpose and the case or ticket reference.',
    status: 'enabled',
    category: 'access',
    hitsLast24h: 38,
  },
  {
    id: 'cp-bulk-mutation',
    name: 'Bulk-update > 1,000 ontology objects',
    trigger: 'When a single Action affects more than 1,000 objects.',
    prompt: 'Describe the change and link to the approved RFC.',
    status: 'enabled',
    category: 'mutation',
    hitsLast24h: 5,
  },
  {
    id: 'cp-marking-change',
    name: 'Change marking categories',
    trigger: 'When admins modify marking categories at the enrollment level.',
    prompt: 'Explain the security review that authorized this change.',
    status: 'enabled',
    category: 'admin',
    hitsLast24h: 1,
  },
  {
    id: 'cp-mass-share',
    name: 'Share resource with > 50 users',
    trigger: 'When granting access to a single resource to more than 50 principals at once.',
    prompt: 'Confirm that the recipients have a need-to-know basis and list the audit log reference.',
    status: 'paused',
    category: 'access',
    hitsLast24h: 0,
  },
];

const MOCK_EVENTS: JustificationEvent[] = [
  {
    id: 'jev-1',
    checkpoint: 'Export PII dataset',
    user: 'm.alvarez',
    resource: 'gold/customers — PII::email column',
    justification: 'Compliance request from Legal (case L-2026-118). Recipient is auditor@acme.partner, encrypted ZIP, 30-day retention.',
    reviewStatus: 'pending-review',
    occurredAt: '2026-05-18T15:48:00Z',
  },
  {
    id: 'jev-2',
    checkpoint: 'Open restricted dataset view',
    user: 'p.ono',
    resource: 'silver/payouts-2026-q2',
    justification: 'Investigating refund variance ticket FIN-4421.',
    reviewStatus: 'approved',
    occurredAt: '2026-05-18T14:22:00Z',
  },
  {
    id: 'jev-3',
    checkpoint: 'Bulk-update > 1,000 ontology objects',
    user: 'r.aoki',
    resource: 'Shipment ontology — backfill_carrier_id Action',
    justification: 'Backfill required after carrier rename. RFC: ops-rfc-2026-03.',
    reviewStatus: 'approved',
    occurredAt: '2026-05-18T11:05:00Z',
  },
  {
    id: 'jev-4',
    checkpoint: 'Open restricted dataset view',
    user: 'n.diaz',
    resource: 'silver/payouts-2026-q2',
    justification: 'Curious browse.',
    reviewStatus: 'flagged',
    occurredAt: '2026-05-18T09:14:00Z',
  },
  {
    id: 'jev-5',
    checkpoint: 'Change marking categories',
    user: 's.kapoor',
    resource: 'enrollment markings — adding PII::geolocation',
    justification: 'Adding geolocation marking before ingesting mobile telemetry. Reviewed with security lead.',
    reviewStatus: 'approved',
    occurredAt: '2026-05-17T16:42:00Z',
  },
];

const STATUS_TONE: Record<CheckpointEnabled, string> = {
  enabled: '#34d399',
  paused: '#94a3b8',
};

const STATUS_LABEL: Record<CheckpointEnabled, string> = {
  enabled: 'Enabled',
  paused: 'Paused',
};

const CATEGORY_LABEL: Record<CheckpointDefinition['category'], string> = {
  access: 'Access',
  export: 'Export',
  mutation: 'Mutation',
  admin: 'Admin',
};

const REVIEW_TONE: Record<ReviewStatus, string> = {
  'pending-review': '#facc15',
  approved: '#34d399',
  flagged: '#f87171',
};

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  'pending-review': 'Pending review',
  approved: 'Approved',
  flagged: 'Flagged',
};

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function CheckpointsPage() {
  const [categoryFilter, setCategoryFilter] = useState<'all' | CheckpointDefinition['category']>('all');

  const filtered = useMemo(
    () => MOCK_CHECKPOINTS.filter((c) => categoryFilter === 'all' || c.category === categoryFilter),
    [categoryFilter],
  );

  const stats = useMemo(() => {
    const enabled = MOCK_CHECKPOINTS.filter((c) => c.status === 'enabled').length;
    const hits24h = MOCK_CHECKPOINTS.reduce((sum, c) => sum + c.hitsLast24h, 0);
    const pending = MOCK_EVENTS.filter((e) => e.reviewStatus === 'pending-review').length;
    const flagged = MOCK_EVENTS.filter((e) => e.reviewStatus === 'flagged').length;
    return { total: MOCK_CHECKPOINTS.length, enabled, hits24h, pending, flagged };
  }, []);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Security & Governance · Justification Checkpoints</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Justification Checkpoints</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Pause sensitive interactions to capture the user's stated reason. Compliance teams review the
              audit trail and flag anything outside policy.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Checkpoint editor ships in Phase 4.x">
            <Glyph name="plus" size={14} /> New checkpoint
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Checkpoints', value: stats.total.toString(), tone: '#a78bfa' },
          { label: 'Enabled', value: stats.enabled.toString(), tone: STATUS_TONE.enabled },
          { label: 'Prompts (24h)', value: stats.hits24h.toString(), tone: '#22d3ee' },
          { label: 'Pending review', value: stats.pending.toString(), tone: REVIEW_TONE['pending-review'] },
          { label: 'Flagged', value: stats.flagged.toString(), tone: REVIEW_TONE.flagged },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section className="of-panel" style={{ padding: 12 }}>
        <div role="tablist" aria-label="Filter by category" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['all', 'access', 'export', 'mutation', 'admin'] as const).map((c) => {
            const active = categoryFilter === c;
            const label = c === 'all' ? 'All categories' : CATEGORY_LABEL[c as CheckpointDefinition['category']];
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'of-chip of-chip-active' : 'of-chip'}
                onClick={() => setCategoryFilter(c)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>
          Checkpoint definitions{' '}
          <span className="of-text-muted" style={{ fontSize: 14, fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          {filtered.map((c) => (
            <article key={c.id} className="of-card" aria-label={c.name}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <h3 className="of-heading-md" style={{ margin: 0 }}>{c.name}</h3>
                  <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>
                    {CATEGORY_LABEL[c.category]} · {c.hitsLast24h} hit(s) in 24h
                  </p>
                </div>
                <span
                  className="of-chip"
                  style={{ color: STATUS_TONE[c.status], borderColor: `${STATUS_TONE[c.status]}55` }}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </header>
              <p style={{ margin: '10px 0 6px', fontSize: 13, lineHeight: 1.5 }}>
                <strong>Trigger:</strong> {c.trigger}
              </p>
              <p
                className="of-text-muted"
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.5,
                  fontStyle: 'italic',
                  padding: 10,
                  borderRadius: 8,
                  background: 'rgba(15, 23, 42, 0.4)',
                }}
              >
                "{c.prompt}"
              </p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Recent justifications</h2>
        <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                {['When', 'User', 'Checkpoint', 'Resource', 'Justification', 'Review'].map((h) => (
                  <th key={h} className="of-eyebrow" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_EVENTS.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12 }} className="of-text-muted">
                    {formatRelative(e.occurredAt)}
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      fontSize: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}
                  >
                    {e.user}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{e.checkpoint}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{e.resource}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13, lineHeight: 1.5, maxWidth: 360 }}>
                    {e.justification}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{ color: REVIEW_TONE[e.reviewStatus], borderColor: `${REVIEW_TONE[e.reviewStatus]}55` }}
                    >
                      {REVIEW_LABEL[e.reviewStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
