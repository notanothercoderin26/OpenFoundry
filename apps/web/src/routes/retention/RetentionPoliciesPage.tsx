import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type PolicyMode = 'enforce' | 'monitor' | 'paused';
type EventOutcome = 'deleted' | 'skipped' | 'overridden' | 'failed';

interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  scope: string;
  retentionDays: number;
  mode: PolicyMode;
  scope_kind: 'pii' | 'finance' | 'logs' | 'partner';
  governedDatasets: number;
  pendingDeletions: number;
  enforcedAt: string;
  ownerGroup: string;
}

interface RetentionEvent {
  id: string;
  policy: string;
  dataset: string;
  rowsDeleted: number;
  rowsKept: number;
  outcome: EventOutcome;
  reason: string;
  occurredAt: string;
}

const MOCK_POLICIES: RetentionPolicy[] = [
  {
    id: 'rp-pii',
    name: 'PII 90-day retention',
    description: 'Delete PII-tagged transactions and their downstream derivatives once they age past 90 days.',
    scope: 'gold/customers · gold/leads · downstream Workshop bindings',
    retentionDays: 90,
    mode: 'enforce',
    scope_kind: 'pii',
    governedDatasets: 28,
    pendingDeletions: 1_240_000,
    enforcedAt: '2026-05-18T03:00:00Z',
    ownerGroup: 'privacy-office',
  },
  {
    id: 'rp-finance',
    name: 'Finance 7-year archive',
    description: 'Retain finance datasets for 7 years per regulatory requirement; delete anything older.',
    scope: 'silver/payouts-* · gold/general-ledger',
    retentionDays: 2555,
    mode: 'enforce',
    scope_kind: 'finance',
    governedDatasets: 12,
    pendingDeletions: 88_000,
    enforcedAt: '2026-05-17T03:00:00Z',
    ownerGroup: 'finance-ops',
  },
  {
    id: 'rp-logs',
    name: 'Telemetry logs 30-day window',
    description: 'Aggressive 30-day window for raw telemetry logs to minimize footprint.',
    scope: 'bronze/raw-telemetry-*',
    retentionDays: 30,
    mode: 'enforce',
    scope_kind: 'logs',
    governedDatasets: 18,
    pendingDeletions: 4_120_000,
    enforcedAt: '2026-05-18T02:00:00Z',
    ownerGroup: 'observability',
  },
  {
    id: 'rp-partner-acme',
    name: 'ACME partner data 1-year',
    description: 'Retain ACME partner uploads for 365 days, per DPA-2026-04. Monitor mode while contract is in review.',
    scope: 'partner-uploads/acme/*',
    retentionDays: 365,
    mode: 'monitor',
    scope_kind: 'partner',
    governedDatasets: 7,
    pendingDeletions: 0,
    enforcedAt: '2026-04-12T03:00:00Z',
    ownerGroup: 'legal-data-ops',
  },
  {
    id: 'rp-sandbox',
    name: 'Sandbox cleanup',
    description: 'Drop sandbox datasets older than 14 days to recover storage.',
    scope: 'sandbox/*',
    retentionDays: 14,
    mode: 'paused',
    scope_kind: 'logs',
    governedDatasets: 4,
    pendingDeletions: 0,
    enforcedAt: '2026-03-10T03:00:00Z',
    ownerGroup: 'platform-admins',
  },
];

const MOCK_EVENTS: RetentionEvent[] = [
  { id: 'ev-1', policy: 'PII 90-day retention',          dataset: 'gold/customers',          rowsDeleted: 18_400, rowsKept: 0,      outcome: 'deleted',    reason: 'Aged past 90-day cutoff.',                                           occurredAt: '2026-05-18T03:14:00Z' },
  { id: 'ev-2', policy: 'Telemetry logs 30-day window',  dataset: 'bronze/raw-telemetry-app', rowsDeleted: 2_400_000, rowsKept: 0,  outcome: 'deleted',    reason: 'Daily enforcement run.',                                             occurredAt: '2026-05-18T02:32:00Z' },
  { id: 'ev-3', policy: 'PII 90-day retention',          dataset: 'workshop-bindings/leads', rowsDeleted: 0,      rowsKept: 12_300, outcome: 'overridden', reason: 'Legal hold L-2026-118 active; deletion deferred until 2026-09-01.',  occurredAt: '2026-05-18T03:14:00Z' },
  { id: 'ev-4', policy: 'Finance 7-year archive',        dataset: 'gold/general-ledger',     rowsDeleted: 124,    rowsKept: 0,      outcome: 'deleted',    reason: 'Aged past 7-year cutoff.',                                           occurredAt: '2026-05-17T03:08:00Z' },
  { id: 'ev-5', policy: 'Telemetry logs 30-day window',  dataset: 'bronze/raw-telemetry-edge', rowsDeleted: 0,    rowsKept: 8_400_000, outcome: 'failed',  reason: 'Storage backend returned 503; will retry at next window.',           occurredAt: '2026-05-17T02:32:00Z' },
  { id: 'ev-6', policy: 'ACME partner data 1-year',      dataset: 'partner-uploads/acme/manifests', rowsDeleted: 0, rowsKept: 1_240, outcome: 'skipped',   reason: 'Policy in monitor mode; deletion not enforced.',                       occurredAt: '2026-05-17T03:00:00Z' },
];

const MODE_TONE: Record<PolicyMode, string> = {
  enforce: '#34d399',
  monitor: '#facc15',
  paused: '#94a3b8',
};

const MODE_LABEL: Record<PolicyMode, string> = {
  enforce: 'Enforcing',
  monitor: 'Monitor only',
  paused: 'Paused',
};

const SCOPE_TONE: Record<RetentionPolicy['scope_kind'], string> = {
  pii: '#f472b6',
  finance: '#22d3ee',
  logs: '#a78bfa',
  partner: '#fb923c',
};

const SCOPE_LABEL: Record<RetentionPolicy['scope_kind'], string> = {
  pii: 'PII',
  finance: 'Finance',
  logs: 'Logs',
  partner: 'Partner',
};

const OUTCOME_TONE: Record<EventOutcome, string> = {
  deleted: '#34d399',
  skipped: '#94a3b8',
  overridden: '#facc15',
  failed: '#f87171',
};

const OUTCOME_LABEL: Record<EventOutcome, string> = {
  deleted: 'Deleted',
  skipped: 'Skipped',
  overridden: 'Overridden',
  failed: 'Failed',
};

function formatRetention(days: number) {
  if (days >= 365) return `${Math.round(days / 365)} yr`;
  if (days >= 30) return `${Math.round(days / 30)} mo`;
  return `${days} d`;
}

function formatNumber(n: number) {
  if (n === 0) return '0';
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n);
}

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function RetentionPoliciesPage() {
  const [modeFilter, setModeFilter] = useState<'all' | PolicyMode>('all');

  const filtered = useMemo(
    () => MOCK_POLICIES.filter((p) => modeFilter === 'all' || p.mode === modeFilter),
    [modeFilter],
  );

  const stats = useMemo(() => {
    const enforcing = MOCK_POLICIES.filter((p) => p.mode === 'enforce').length;
    const datasets = MOCK_POLICIES.reduce((sum, p) => sum + p.governedDatasets, 0);
    const pending = MOCK_POLICIES.reduce((sum, p) => sum + p.pendingDeletions, 0);
    return { policies: MOCK_POLICIES.length, enforcing, datasets, pending };
  }, []);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Security & Governance · Retention Policies</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Retention Policies</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Lineage-aware retention. Policies delete transactions and every downstream derivative across the
              data flow when retention expires — with legal-hold overrides and per-run audit.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Policy editor ships in Phase 4.x">
            <Glyph name="plus" size={14} /> New policy
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Policies', value: stats.policies.toString(), tone: '#a78bfa' },
          { label: 'Enforcing', value: stats.enforcing.toString(), tone: MODE_TONE.enforce },
          { label: 'Datasets governed', value: stats.datasets.toString(), tone: '#22d3ee' },
          { label: 'Rows pending deletion', value: formatNumber(stats.pending), tone: '#f472b6' },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section className="of-panel" style={{ padding: 12 }}>
        <div role="tablist" aria-label="Filter by mode" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['all', 'enforce', 'monitor', 'paused'] as const).map((m) => {
            const active = modeFilter === m;
            const label = m === 'all' ? 'All policies' : MODE_LABEL[m as PolicyMode];
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'of-chip of-chip-active' : 'of-chip'}
                onClick={() => setModeFilter(m)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>
          Policies{' '}
          <span className="of-text-muted" style={{ fontSize: 14, fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
          {filtered.map((p) => (
            <article key={p.id} className="of-card" aria-label={p.name}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <h3 className="of-heading-md" style={{ margin: 0 }}>{p.name}</h3>
                  <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>
                    Retention {formatRetention(p.retentionDays)} · Owner {p.ownerGroup}
                  </p>
                </div>
                <span
                  className="of-chip"
                  style={{ color: MODE_TONE[p.mode], borderColor: `${MODE_TONE[p.mode]}55` }}
                >
                  {MODE_LABEL[p.mode]}
                </span>
              </header>
              <p className="of-text-muted" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, minHeight: 44 }}>
                {p.description}
              </p>
              <p
                style={{
                  margin: '10px 0 0',
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                }}
              >
                <span style={{ color: SCOPE_TONE[p.scope_kind] }}>{SCOPE_LABEL[p.scope_kind]}</span> · {p.scope}
              </p>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  margin: '12px 0 0',
                  paddingTop: 10,
                  borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                }}
              >
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Datasets</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{p.governedDatasets}</dd>
                </div>
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Pending rows</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{formatNumber(p.pendingDeletions)}</dd>
                </div>
                <div>
                  <dt className="of-eyebrow" style={{ margin: 0, fontSize: 10 }}>Last run</dt>
                  <dd className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{formatRelative(p.enforcedAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Recent enforcement events</h2>
        <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                {['When', 'Policy', 'Dataset', 'Deleted', 'Kept', 'Outcome', 'Reason'].map((h) => (
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
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{e.policy}</td>
                  <td
                    style={{
                      padding: '10px 14px',
                      fontSize: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}
                  >
                    {e.dataset}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{formatNumber(e.rowsDeleted)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{formatNumber(e.rowsKept)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{ color: OUTCOME_TONE[e.outcome], borderColor: `${OUTCOME_TONE[e.outcome]}55` }}
                    >
                      {OUTCOME_LABEL[e.outcome]}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, lineHeight: 1.5, maxWidth: 320 }} className="of-text-muted">
                    {e.reason}
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
