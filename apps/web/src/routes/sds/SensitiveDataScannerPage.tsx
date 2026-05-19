import { useMemo, useState } from 'react';

import { Glyph } from '@/lib/components/ui/Glyph';

type PatternSeverity = 'critical' | 'high' | 'medium' | 'low';
type ScanCadence = 'continuous' | 'daily' | 'weekly' | 'manual';
type ScanStatus = 'succeeded' | 'running' | 'failed';

interface Pattern {
  id: string;
  name: string;
  regulation: string;
  severity: PatternSeverity;
  matchersDescription: string;
  enabled: boolean;
}

interface ScanRun {
  id: string;
  scanName: string;
  cadence: ScanCadence;
  datasetCount: number;
  rowsScanned: number;
  findings: number;
  status: ScanStatus;
  startedAt: string;
  durationSec: number | null;
}

interface Finding {
  id: string;
  pattern: string;
  severity: PatternSeverity;
  dataset: string;
  column: string;
  matchRatio: number;
  sampleMatchCount: number;
  appliedAction: 'masked' | 'quarantined' | 'flagged' | 'none';
  detectedAt: string;
}

const PATTERNS: Pattern[] = [
  { id: 'p-email',  name: 'Email address',           regulation: 'GDPR · CCPA',  severity: 'high',     matchersDescription: 'RFC 5322 + heuristic check on header rows.', enabled: true },
  { id: 'p-cc',     name: 'Credit card (PAN)',       regulation: 'PCI-DSS',      severity: 'critical', matchersDescription: 'Luhn-validated 13–19 digit sequences.',      enabled: true },
  { id: 'p-ssn',    name: 'US Social Security',      regulation: 'GLBA · CCPA',  severity: 'critical', matchersDescription: 'NNN-NN-NNNN with area validation.',          enabled: true },
  { id: 'p-iban',   name: 'IBAN',                    regulation: 'GDPR · LGPD',  severity: 'high',     matchersDescription: 'Country-prefix + mod-97 check.',             enabled: true },
  { id: 'p-phone',  name: 'Phone number',            regulation: 'GDPR',         severity: 'medium',   matchersDescription: 'libphonenumber match across 220 regions.',   enabled: true },
  { id: 'p-mrn',    name: 'Medical record number',   regulation: 'HIPAA',        severity: 'high',     matchersDescription: 'Pattern from configured hospital schemas.',  enabled: false },
  { id: 'p-passport', name: 'Passport number',       regulation: 'GDPR',         severity: 'high',     matchersDescription: 'Per-country length and prefix matchers.',    enabled: true },
];

const SCANS: ScanRun[] = [
  { id: 's-1', scanName: 'gold/* continuous',          cadence: 'continuous', datasetCount: 412, rowsScanned: 18_400_000, findings: 14, status: 'succeeded', startedAt: '2026-05-18T15:48:00Z', durationSec: 612 },
  { id: 's-2', scanName: 'silver/payouts-2026-q2',     cadence: 'daily',      datasetCount: 1,   rowsScanned: 480_000,    findings: 3,  status: 'succeeded', startedAt: '2026-05-18T06:00:00Z', durationSec: 38 },
  { id: 's-3', scanName: 'bronze/raw-stripe-events',   cadence: 'weekly',     datasetCount: 1,   rowsScanned: 9_200_000,  findings: 1,  status: 'running',   startedAt: '2026-05-18T15:30:00Z', durationSec: null },
  { id: 's-4', scanName: 'partner-uploads/*',          cadence: 'manual',     datasetCount: 7,   rowsScanned: 24_000,     findings: 0,  status: 'failed',    startedAt: '2026-05-17T22:14:00Z', durationSec: 12 },
];

const FINDINGS: Finding[] = [
  { id: 'f-1', pattern: 'Email address',           severity: 'high',     dataset: 'gold/customers',       column: 'preferences_blob',  matchRatio: 0.082, sampleMatchCount: 1_240, appliedAction: 'masked',      detectedAt: '2026-05-18T15:48:00Z' },
  { id: 'f-2', pattern: 'Credit card (PAN)',       severity: 'critical', dataset: 'bronze/raw-stripe-events', column: 'last4',         matchRatio: 0.0001, sampleMatchCount: 3,    appliedAction: 'quarantined', detectedAt: '2026-05-18T15:14:00Z' },
  { id: 'f-3', pattern: 'IBAN',                    severity: 'high',     dataset: 'silver/payouts-2026-q2', column: 'note',            matchRatio: 0.014, sampleMatchCount: 88,    appliedAction: 'flagged',     detectedAt: '2026-05-18T06:42:00Z' },
  { id: 'f-4', pattern: 'Phone number',            severity: 'medium',   dataset: 'gold/leads',           column: 'notes',             matchRatio: 0.062, sampleMatchCount: 412,   appliedAction: 'masked',      detectedAt: '2026-05-17T18:30:00Z' },
  { id: 'f-5', pattern: 'US Social Security',      severity: 'critical', dataset: 'partner-uploads/acme', column: 'document_text',     matchRatio: 0.004, sampleMatchCount: 6,    appliedAction: 'quarantined', detectedAt: '2026-05-17T11:08:00Z' },
];

const SEVERITY_TONE: Record<PatternSeverity, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#facc15',
  low: '#60a5fa',
};

const SEVERITY_LABEL: Record<PatternSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const STATUS_TONE: Record<ScanStatus, string> = {
  succeeded: '#34d399',
  running: '#facc15',
  failed: '#f87171',
};

const STATUS_LABEL: Record<ScanStatus, string> = {
  succeeded: 'Succeeded',
  running: 'Running',
  failed: 'Failed',
};

const CADENCE_LABEL: Record<ScanCadence, string> = {
  continuous: 'Continuous',
  daily: 'Daily',
  weekly: 'Weekly',
  manual: 'Manual',
};

const ACTION_TONE: Record<Finding['appliedAction'], string> = {
  masked: '#34d399',
  quarantined: '#f87171',
  flagged: '#facc15',
  none: '#94a3b8',
};

const ACTION_LABEL: Record<Finding['appliedAction'], string> = {
  masked: 'Masked',
  quarantined: 'Quarantined',
  flagged: 'Flagged',
  none: 'No action',
};

function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n);
}

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

export function SensitiveDataScannerPage() {
  const [severityFilter, setSeverityFilter] = useState<'all' | PatternSeverity>('all');

  const filteredFindings = useMemo(
    () => FINDINGS.filter((f) => severityFilter === 'all' || f.severity === severityFilter),
    [severityFilter],
  );

  const stats = useMemo(() => {
    const totalFindings = FINDINGS.length;
    const critical = FINDINGS.filter((f) => f.severity === 'critical').length;
    const datasetsCovered = new Set(SCANS.flatMap((s) => [s.scanName])).size;
    const enabledPatterns = PATTERNS.filter((p) => p.enabled).length;
    return { totalFindings, critical, datasetsCovered, enabledPatterns };
  }, []);

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <header className="of-hero-strip">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 8 }}>
            <p className="of-eyebrow">Security & Governance · Sensitive Data Scanner</p>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Sensitive Data Scanner</h1>
            <p className="of-text-muted" style={{ margin: 0 }}>
              Discover sensitive patterns across datasets, classify them, and trigger governance actions —
              masking, quarantine, or compliance review.
            </p>
          </div>
          <button type="button" className="of-btn of-btn-primary" disabled title="Scan launcher ships in Phase 4.x">
            <Glyph name="search" size={14} /> New scan
          </button>
        </div>
      </header>

      <section
        className="of-panel"
        style={{ padding: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        {[
          { label: 'Findings', value: stats.totalFindings.toString(), tone: '#a78bfa' },
          { label: 'Critical', value: stats.critical.toString(), tone: SEVERITY_TONE.critical },
          { label: 'Scans configured', value: SCANS.length.toString(), tone: '#22d3ee' },
          { label: 'Patterns enabled', value: stats.enabledPatterns.toString(), tone: '#34d399' },
        ].map((m) => (
          <div key={m.label} style={{ display: 'grid', gap: 4 }}>
            <p className="of-eyebrow" style={{ margin: 0 }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: m.tone }}>{m.value}</p>
          </div>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Pattern library</h2>
        <div className="of-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {PATTERNS.map((p) => (
            <article key={p.id} className="of-card" aria-label={p.name} style={{ opacity: p.enabled ? 1 : 0.6 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <h3 className="of-heading-md" style={{ margin: 0 }}>{p.name}</h3>
                  <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 11 }}>{p.regulation}</p>
                </div>
                <span
                  className="of-chip"
                  style={{ color: SEVERITY_TONE[p.severity], borderColor: `${SEVERITY_TONE[p.severity]}55` }}
                >
                  {SEVERITY_LABEL[p.severity]}
                </span>
              </header>
              <p
                className="of-text-muted"
                style={{
                  margin: '10px 0 0',
                  fontSize: 12,
                  lineHeight: 1.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                }}
              >
                {p.matchersDescription}
              </p>
              <p className="of-text-muted" style={{ margin: '10px 0 0', fontSize: 11 }}>
                {p.enabled ? 'Enabled in this enrollment' : 'Disabled'}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <h2 className="of-heading-md" style={{ margin: 0 }}>Recent scans</h2>
        <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                {['Scan', 'Cadence', 'Datasets', 'Rows scanned', 'Findings', 'Duration', 'Status', 'When'].map((h) => (
                  <th key={h} className="of-eyebrow" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCANS.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{s.scanName}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }} className="of-text-muted">{CADENCE_LABEL[s.cadence]}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{s.datasetCount}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{formatNumber(s.rowsScanned)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{s.findings}</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{s.durationSec == null ? '—' : `${s.durationSec}s`}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{ color: STATUS_TONE[s.status], borderColor: `${STATUS_TONE[s.status]}55` }}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12 }} className="of-text-muted">
                    {formatRelative(s.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 className="of-heading-md" style={{ margin: 0 }}>Findings</h2>
          <div role="tablist" aria-label="Filter findings by severity" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map((s) => {
              const active = severityFilter === s;
              const label = s === 'all' ? 'All' : SEVERITY_LABEL[s as PatternSeverity];
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? 'of-chip of-chip-active' : 'of-chip'}
                  onClick={() => setSeverityFilter(s)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </header>
        <div className="of-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.45)' }}>
                {['When', 'Pattern', 'Severity', 'Dataset · Column', 'Match ratio', 'Samples', 'Action'].map((h) => (
                  <th key={h} className="of-eyebrow" style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredFindings.map((f) => (
                <tr key={f.id} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.12)' }}>
                  <td style={{ padding: '10px 14px', fontSize: 12 }} className="of-text-muted">
                    {formatRelative(f.detectedAt)}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{f.pattern}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{ color: SEVERITY_TONE[f.severity], borderColor: `${SEVERITY_TONE[f.severity]}55` }}
                    >
                      {SEVERITY_LABEL[f.severity]}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>
                    <p style={{ margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}>
                      {f.dataset}
                    </p>
                    <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>{f.column}</p>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{(f.matchRatio * 100).toFixed(2)}%</td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{f.sampleMatchCount.toLocaleString()}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      className="of-chip"
                      style={{ color: ACTION_TONE[f.appliedAction], borderColor: `${ACTION_TONE[f.appliedAction]}55` }}
                    >
                      {ACTION_LABEL[f.appliedAction]}
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
