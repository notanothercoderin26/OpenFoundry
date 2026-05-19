import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type Severity = 'critical' | 'warning' | 'info';

interface Finding {
  id: string;
  pipelineName: string;
  pipelineId: string;
  severity: Severity;
  rule: string;
  message: string;
  recommendation: string;
  estimatedImpact: string;
  detectedAt: string;
}

const MOCK_FINDINGS: Finding[] = [
  {
    id: 'f-1',
    pipelineName: 'orders-realtime',
    pipelineId: 'pipe-orders-rt',
    severity: 'critical',
    rule: 'streaming.late-data-handling-missing',
    message: 'Streaming pipeline has no late-data handling configured for the orders source.',
    recommendation: 'Add a watermark policy with a 15-minute allowed lateness, or route late events to a side dataset.',
    estimatedImpact: 'Drops up to 1.4% of daily events during upstream lag spikes.',
    detectedAt: '2026-05-18T08:14:00Z',
  },
  {
    id: 'f-2',
    pipelineName: 'customer-360-batch',
    pipelineId: 'pipe-c360',
    severity: 'warning',
    rule: 'transform.full-table-scan',
    message: 'Final transform reads the entire customer_orders dataset (24M rows).',
    recommendation: 'Add a partition filter on order_date or convert to an incremental snapshot.',
    estimatedImpact: 'Saves ~3.2 minutes per run; ~$0.40 in compute per day.',
    detectedAt: '2026-05-18T07:02:00Z',
  },
  {
    id: 'f-3',
    pipelineName: 'shipments-stream-enrich',
    pipelineId: 'pipe-ship-enr',
    severity: 'warning',
    rule: 'streaming.unbounded-state',
    message: 'Stream join accumulates state without TTL.',
    recommendation: 'Set a 24-hour TTL on the broadcast side, or migrate to a window-based join.',
    estimatedImpact: 'State store grows ~120 MB/day; risk of operator restart > 8 minutes.',
    detectedAt: '2026-05-17T22:45:00Z',
  },
  {
    id: 'f-4',
    pipelineName: 'fraud-scoring-v2',
    pipelineId: 'pipe-fraud-v2',
    severity: 'info',
    rule: 'metadata.missing-owner',
    message: 'Pipeline has no owner annotation.',
    recommendation: 'Set a group or user as the pipeline owner so alerts have a routing target.',
    estimatedImpact: 'Improves alert MTTA from 38 min to ~6 min based on org averages.',
    detectedAt: '2026-05-17T15:10:00Z',
  },
  {
    id: 'f-5',
    pipelineName: 'inventory-snapshots',
    pipelineId: 'pipe-inv-snap',
    severity: 'critical',
    rule: 'security.unmarked-pii-column',
    message: 'Column "customer_email" is unmarked but matches a PII pattern.',
    recommendation: 'Apply the "PII::email" marking to the column, or document an exception in the data contract.',
    estimatedImpact: 'Compliance gap; column would be redacted by default once marked.',
    detectedAt: '2026-05-17T09:30:00Z',
  },
  {
    id: 'f-6',
    pipelineName: 'orders-realtime',
    pipelineId: 'pipe-orders-rt',
    severity: 'info',
    rule: 'metadata.no-description',
    message: 'Pipeline description is empty.',
    recommendation: 'Add a one-line description to surface in lineage and catalog views.',
    estimatedImpact: 'Improves discoverability in Data Catalog and Data Lineage.',
    detectedAt: '2026-05-17T08:14:00Z',
  },
];

const SEVERITY_TONE: Record<Severity, string> = {
  critical: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function LinterPage() {
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');

  const counts = useMemo(() => {
    return {
      total: MOCK_FINDINGS.length,
      critical: MOCK_FINDINGS.filter((f) => f.severity === 'critical').length,
      warning: MOCK_FINDINGS.filter((f) => f.severity === 'warning').length,
      info: MOCK_FINDINGS.filter((f) => f.severity === 'info').length,
      pipelines: new Set(MOCK_FINDINGS.map((f) => f.pipelineId)).size,
    };
  }, []);

  const filtered = useMemo(
    () => MOCK_FINDINGS.filter((f) => severityFilter === 'all' || f.severity === severityFilter),
    [severityFilter],
  );

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Data integration · Pipeline Linter</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Pipeline Linter</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Automated review of pipelines for correctness, cost, security, and metadata gaps. Recommendations
              link straight back into Pipeline Builder.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Rescan ships in Phase 4.x">
            <Glyph name="check" size={14} /> Rescan all pipelines
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Findings', value: counts.total.toString(), tone: '#a78bfa' },
          { label: 'Critical', value: counts.critical.toString(), tone: SEVERITY_TONE.critical },
          { label: 'Warnings', value: counts.warning.toString(), tone: SEVERITY_TONE.warning },
          { label: 'Info', value: counts.info.toString(), tone: SEVERITY_TONE.info },
          { label: 'Pipelines scanned', value: counts.pipelines.toString(), tone: '#34d399' },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section className="of-panel" style={{ padding: 12 }}>
        <div role="tablist" aria-label="Filter by severity" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['all', 'critical', 'warning', 'info'] as const).map((s) => {
            const active = severityFilter === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'of-chip of-chip-active' : 'of-chip'}
                onClick={() => setSeverityFilter(s)}
              >
                {s === 'all' ? 'All' : SEVERITY_LABEL[s as Severity]}
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        {filtered.length === 0 ? (
          <div className="of-panel" style={{ padding: 24, textAlign: 'center' }}>
            <p className="of-text-muted" style={{ margin: 0 }}>No findings match this filter.</p>
          </div>
        ) : (
          filtered.map((f) => (
            <article key={f.id} className="of-panel" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{f.message}</p>
                  <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {f.pipelineName} · <code>{f.rule}</code> · {formatRelative(f.detectedAt)}
                  </p>
                </div>
                <span
                  className="of-chip"
                  style={{ color: SEVERITY_TONE[f.severity], borderColor: `${SEVERITY_TONE[f.severity]}55` }}
                >
                  {SEVERITY_LABEL[f.severity]}
                </span>
              </header>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
                <strong>Recommendation:</strong> {f.recommendation}
              </p>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
                <strong>Estimated impact:</strong> {f.estimatedImpact}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="of-btn of-btn-ghost" disabled>Snooze</button>
                <button type="button" className="of-btn of-btn-primary" disabled>Open in Pipeline Builder</button>
              </div>
            </article>
          ))
        )}
      </section>
    </section>
  );
}
