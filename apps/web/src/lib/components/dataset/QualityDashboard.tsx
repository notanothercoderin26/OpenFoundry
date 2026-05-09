import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import {
  getDatasetHealth,
  type DatasetHealthResponse,
  type DatasetQualityResponse,
  type DatasetQualityRule,
} from '@/lib/api/datasets';

interface QualityDashboardProps {
  datasetRid?: string;
  quality: DatasetQualityResponse | null;
  loading?: boolean;
  refreshing?: boolean;
  freshnessSlaSeconds?: number;
  onRefreshProfile?: () => void;
  onAddRule?: () => void;
  onEditRule?: (rule: DatasetQualityRule) => void;
  onDeleteRule?: (rule: DatasetQualityRule) => void;
}

function fmtSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

function fmtPct(v: number | null | undefined, precision = 1) {
  if (v == null || Number.isNaN(v)) return '-';
  if (v === 1 || v === 0) return `${Math.round(v * 100)}%`;
  if (precision === 0) return `${Math.round(v * 100)}%`;
  return `${(v * 100).toFixed(precision)}%`;
}

function buildStatusIcon(status: string) {
  if (status === 'success') return 'OK';
  if (status === 'failed') return 'Failed';
  if (status === 'stale') return 'Stale';
  return 'Unknown';
}

export function QualityDashboard({
  datasetRid,
  quality,
  loading = false,
  refreshing = false,
  freshnessSlaSeconds = 24 * 3600,
  onRefreshProfile,
  onAddRule,
  onEditRule,
  onDeleteRule,
}: QualityDashboardProps) {
  const [health, setHealth] = useState<DatasetHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    if (!datasetRid) return;
    let cancelled = false;
    setHealthLoading(true);
    setHealthError(null);
    getDatasetHealth(datasetRid)
      .then((h) => { if (!cancelled) setHealth(h); })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setHealthError(cause instanceof Error ? cause.message : 'Health snapshot unavailable.');
          setHealth(null);
        }
      })
      .finally(() => { if (!cancelled) setHealthLoading(false); });
    return () => { cancelled = true; };
  }, [datasetRid]);

  const profile = quality?.profile ?? null;
  const failedRuleResults = profile?.rule_results.filter((rule) => !rule.passed) ?? [];
  const enabledRules = quality?.rules.filter((rule) => rule.enabled).length ?? 0;
  const historyLatest = quality?.history[0] ?? null;
  const worstColumns = useMemo(() => {
    return [...(profile?.columns ?? [])]
      .sort((a, b) => b.null_rate - a.null_rate)
      .slice(0, 5);
  }, [profile?.columns]);

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14 }}>Quality dashboard</h3>
          <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
            {quality?.profiled_at ? `Profiled ${new Date(quality.profiled_at).toLocaleString()}` : 'No profile snapshot yet.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {onRefreshProfile && (
            <button type="button" onClick={onRefreshProfile} disabled={refreshing} className="of-button" style={{ fontSize: 11 }}>
              {refreshing ? 'Profiling...' : 'Refresh profile'}
            </button>
          )}
          {onAddRule && (
            <button type="button" onClick={onAddRule} className="of-button of-button--primary" style={{ fontSize: 11 }}>
              + Quality rule
            </button>
          )}
        </div>
      </header>
      {loading && <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>Loading quality profile...</p>}

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Metric title="Score" value={fmtPct(quality?.score, 0)} detail={scoreDetail(historyLatest)} tone={scoreTone(quality?.score)} />
        <Metric title="Completeness" value={fmtPct(profile?.completeness_ratio, 1)} detail={`${profile?.duplicate_rows ?? 0} duplicate rows`} />
        <Metric title="Uniqueness" value={fmtPct(profile?.uniqueness_ratio, 1)} detail={`${profile?.column_count ?? 0} columns`} />
        <Metric title="Rules" value={`${enabledRules}/${quality?.rules.length ?? 0}`} detail={`${failedRuleResults.length} failing in profile`} />
        <Metric title="Alerts" value={String(quality?.alerts.length ?? 0)} detail="Active quality alerts" tone={(quality?.alerts.length ?? 0) > 0 ? 'danger' : 'success'} />
      </div>

      <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <p className="of-heading-sm" style={{ margin: 0 }}>Rules</p>
          <span className="of-text-muted" style={{ fontSize: 11 }}>{quality?.rules.length ?? 0} configured</span>
        </header>
        <table className="of-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Config</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {(quality?.rules ?? []).map((rule) => (
              <tr key={rule.id}>
                <td>{rule.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{rule.rule_type}</td>
                <td><SeverityBadge severity={rule.severity} /></td>
                <td>{rule.enabled ? <span className="of-chip of-chip-active">enabled</span> : <span className="of-chip">paused</span>}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 260, overflowWrap: 'anywhere' }}>{summarizeConfig(rule.config)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {onEditRule && <button type="button" onClick={() => onEditRule(rule)} className="of-button" style={{ fontSize: 11 }}>Edit</button>}
                    {onDeleteRule && <button type="button" onClick={() => onDeleteRule(rule)} className="of-button" style={{ fontSize: 11, color: 'var(--status-danger)', borderColor: '#d6a9a9' }}>Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
            {(quality?.rules.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="of-text-muted">No rules configured yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
        <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <p className="of-heading-sm" style={{ margin: 0 }}>Rule results</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {(profile?.rule_results ?? []).map((result) => (
              <div key={result.rule_id} style={{ display: 'grid', gap: 3, padding: '7px 8px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-panel)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ color: 'var(--text-strong)' }}>{result.name}</strong>
                  <span className={result.passed ? 'of-status-success' : 'of-status-danger'} style={{ padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
                    {result.passed ? 'passed' : 'failed'}
                  </span>
                </div>
                <p className="of-text-muted" style={{ margin: 0, fontSize: 11 }}>{result.message || result.rule_type}</p>
                {result.measured_value && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{result.measured_value}</span>}
              </div>
            ))}
            {(profile?.rule_results.length ?? 0) === 0 && <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>No rule results in the current profile.</p>}
          </div>
        </section>

        <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <p className="of-heading-sm" style={{ margin: 0 }}>Column profile</p>
          <table className="of-table" style={{ fontSize: 12 }}>
            <thead>
              <tr><th>Column</th><th>Nulls</th><th>Unique</th></tr>
            </thead>
            <tbody>
              {worstColumns.map((column) => (
                <tr key={column.name}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{column.name}</td>
                  <td>{fmtPct(column.null_rate, 1)}</td>
                  <td>{fmtPct(column.uniqueness_rate, 1)}</td>
                </tr>
              ))}
              {worstColumns.length === 0 && <tr><td colSpan={3} className="of-text-muted">No column profile yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      {quality?.alerts.length ? (
        <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <p className="of-heading-sm" style={{ margin: 0 }}>Active alerts</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {quality.alerts.map((alert) => (
              <div key={alert.id} className={alert.level === 'high' || alert.level === 'critical' ? 'of-status-danger' : 'of-status-warning'} style={{ padding: 8, borderRadius: 'var(--radius-sm)' }}>
                <strong>{alert.message}</strong>
                <p style={{ margin: '2px 0 0', fontSize: 11 }}>{alert.kind} / {alert.status}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {(health || healthLoading || healthError) && (
        <section className="of-panel-muted" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <p className="of-heading-sm" style={{ margin: 0 }}>Operational health</p>
            {healthLoading && <span className="of-text-muted" style={{ fontSize: 11 }}>refreshing...</span>}
          </header>
          {healthError && !health && <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>{healthError}</p>}
          {health && (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              <Metric title="Freshness" value={fmtSeconds(health.freshness_seconds)} detail={health.last_commit_at ? new Date(health.last_commit_at).toLocaleString() : 'No commit timestamp'} tone={healthTone(health.freshness_seconds, freshnessSlaSeconds)} />
              <Metric title="Last build" value={buildStatusIcon(health.last_build_status)} detail={health.last_build_status} tone={health.last_build_status === 'success' ? 'success' : health.last_build_status === 'failed' ? 'danger' : 'warning'} />
              <Metric title="Schema drift" value={health.schema_drift_flag ? 'Detected' : 'None'} detail="Latest health check" tone={health.schema_drift_flag ? 'warning' : 'success'} />
              <Metric title="Txn failures" value={fmtPct(health.txn_failure_rate_24h, 1)} detail="Last 24 hours" tone={health.txn_failure_rate_24h > 0 ? 'warning' : 'success'} />
            </div>
          )}
        </section>
      )}
    </section>
  );
}

function Metric({ title, value, detail, tone = 'neutral' }: { title: string; value: string; detail: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneStyle: CSSProperties =
    tone === 'success'
      ? { color: 'var(--status-success)' }
      : tone === 'warning'
        ? { color: 'var(--status-warning)' }
        : tone === 'danger'
          ? { color: 'var(--status-danger)' }
          : { color: 'var(--text-strong)' };

  return (
    <div style={{ padding: 10, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-panel)' }}>
      <p className="of-eyebrow" style={{ fontSize: 10 }}>{title}</p>
      <p style={{ margin: '5px 0 0', fontSize: 18, fontWeight: 600, ...toneStyle }}>{value}</p>
      <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>{detail}</p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase();
  const className = normalized === 'high' || normalized === 'critical'
    ? 'of-status-danger'
    : normalized === 'medium'
      ? 'of-status-warning'
      : 'of-status-info';
  return <span className={className} style={{ padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>{severity}</span>;
}

function scoreTone(score: number | null | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (score == null) return 'neutral';
  if (score >= 0.95) return 'success';
  if (score >= 0.8) return 'warning';
  return 'danger';
}

function healthTone(seconds: number, sla: number): 'success' | 'warning' | 'danger' {
  if (seconds <= sla) return 'success';
  if (seconds <= 2 * sla) return 'warning';
  return 'danger';
}

function scoreDetail(entry: DatasetQualityResponse['history'][number] | null) {
  if (!entry) return 'No history yet';
  return `${entry.passed_rules} passed / ${entry.failed_rules} failed`;
}

function summarizeConfig(config: Record<string, unknown>) {
  const entries = Object.entries(config);
  if (entries.length === 0) return '{}';
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatConfigValue(value)}`)
    .join(', ');
}

function formatConfigValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(formatConfigValue).join(', ')}]`;
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  return String(value);
}
