import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  applySweep,
  runSweep,
  type AppliedSweepAction,
  type LinterFinding,
  type LinterRuleId,
  type SweepReport,
} from '@/lib/api/schedules';
import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

interface RuleMeta {
  code: string;
  title: string;
  summary: string;
}

interface FindingGroup {
  ruleId: LinterRuleId;
  meta: RuleMeta;
  findings: LinterFinding[];
  selectedCount: number;
}

const RULE_ORDER: LinterRuleId[] = [
  'Sch001InactiveLastNinety',
  'Sch002PausedLongerThanThirty',
  'Sch003HighFailureRate',
  'Sch004OwnerInactive',
  'Sch005UserScopeOwnerStale',
  'Sch006HighFrequencyCron',
  'Sch007EventTriggerWithoutBranchFilter',
];

const RULE_META: Record<LinterRuleId, RuleMeta> = {
  Sch001InactiveLastNinety: {
    code: 'SCH-001',
    title: 'Inactive for 90 days',
    summary: 'No recent runs.',
  },
  Sch002PausedLongerThanThirty: {
    code: 'SCH-002',
    title: 'Paused longer than 30 days',
    summary: 'Paused schedules that are ready to archive.',
  },
  Sch003HighFailureRate: {
    code: 'SCH-003',
    title: 'High failure rate',
    summary: 'More than half of recent runs failed.',
  },
  Sch004OwnerInactive: {
    code: 'SCH-004',
    title: 'Inactive owner',
    summary: 'Run-as user can no longer execute the schedule.',
  },
  Sch005UserScopeOwnerStale: {
    code: 'SCH-005',
    title: 'Stale user scope',
    summary: 'User-scoped schedule owner has not signed in recently.',
  },
  Sch006HighFrequencyCron: {
    code: 'SCH-006',
    title: 'High-frequency production cron',
    summary: 'Production cron fires more often than policy allows.',
  },
  Sch007EventTriggerWithoutBranchFilter: {
    code: 'SCH-007',
    title: 'Event trigger without branch filter',
    summary: 'Event trigger fires across every branch.',
  },
};

const SEVERITY_STYLE: Record<LinterFinding['severity'], { background: string; color: string }> = {
  Info: { background: 'var(--status-info-bg)', color: 'var(--status-info)' },
  Warning: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' },
  Error: { background: 'var(--status-danger-bg)', color: 'var(--status-danger)' },
};

const ACTION_STYLE: Record<LinterFinding['recommended_action'], { background: string; color: string }> = {
  Notify: { background: 'var(--status-info-bg)', color: 'var(--status-info)' },
  Pause: { background: 'var(--status-warning-bg)', color: 'var(--status-warning)' },
  Delete: { background: 'var(--status-danger-bg)', color: 'var(--status-danger)' },
  Archive: { background: '#eef2f7', color: 'var(--text-muted)' },
};

const ACTIONS: Array<LinterFinding['recommended_action']> = ['Notify', 'Pause', 'Archive', 'Delete'];

function countByAction(findings: LinterFinding[]) {
  return findings.reduce<Record<LinterFinding['recommended_action'], number>>(
    (acc, finding) => {
      acc[finding.recommended_action] += 1;
      return acc;
    },
    { Notify: 0, Pause: 0, Delete: 0, Archive: 0 },
  );
}

function defaultSelectedFindings(findings: LinterFinding[]) {
  return new Set(findings.filter((finding) => finding.recommended_action !== 'Delete').map((finding) => finding.id));
}

function shortRid(rid: string) {
  if (rid.length <= 34) return rid;
  return `${rid.slice(0, 18)}...${rid.slice(-10)}`;
}

function badgeStyle(tone: { background: string; color: string }) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 20,
    padding: '0 7px',
    borderRadius: 'var(--radius-sm)',
    background: tone.background,
    color: tone.color,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
  };
}

export function SweepPage() {
  const [report, setReport] = useState<SweepReport | null>(null);
  const [project, setProject] = useState('');
  const [production, setProduction] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyResult, setApplyResult] = useState<AppliedSweepAction[] | null>(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  const findings = report?.findings ?? [];

  const grouped = useMemo<FindingGroup[]>(() => {
    const buckets = new Map<LinterRuleId, LinterFinding[]>();
    for (const finding of findings) {
      buckets.set(finding.rule_id, [...(buckets.get(finding.rule_id) ?? []), finding]);
    }
    return RULE_ORDER.filter((ruleId) => buckets.has(ruleId)).map((ruleId) => {
      const ruleFindings = buckets.get(ruleId) ?? [];
      return {
        ruleId,
        meta: RULE_META[ruleId],
        findings: ruleFindings,
        selectedCount: ruleFindings.filter((finding) => selected.has(finding.id)).length,
      };
    });
  }, [findings, selected]);

  const selectedFindings = useMemo(
    () => findings.filter((finding) => selected.has(finding.id)),
    [findings, selected],
  );

  const stats = useMemo(() => {
    const errors = findings.filter((finding) => finding.severity === 'Error').length;
    const warnings = findings.filter((finding) => finding.severity === 'Warning').length;
    const info = findings.filter((finding) => finding.severity === 'Info').length;
    return {
      total: findings.length,
      errors,
      warnings,
      info,
      selected: selectedFindings.length,
      actions: countByAction(selectedFindings),
    };
  }, [findings, selectedFindings]);

  const busy = running || applying;

  async function run() {
    setRunning(true);
    setError('');
    setApplyResult(null);
    try {
      const params: { project?: string; production?: boolean } = { production };
      if (project.trim()) params.project = project.trim();
      const res = await runSweep(params);
      setReport({ findings: res.findings });
      setSelected(defaultSelectedFindings(res.findings));
      notifications.success(`Sweep completed with ${res.findings.length} finding${res.findings.length === 1 ? '' : 's'}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Sweep failed';
      setError(message);
      setReport(null);
      setSelected(new Set());
      notifications.error(message);
    } finally {
      setRunning(false);
    }
  }

  async function applySelection() {
    if (!report || selectedFindings.length === 0) {
      notifications.warning('Select at least one finding to apply');
      return;
    }

    const deleteCount = selectedFindings.filter((finding) => finding.recommended_action === 'Delete').length;
    if (
      deleteCount > 0 &&
      typeof window !== 'undefined' &&
      !window.confirm(`Apply ${deleteCount} delete action${deleteCount === 1 ? '' : 's'}?`)
    ) {
      return;
    }

    setApplying(true);
    setError('');
    try {
      const res = await applySweep({
        finding_ids: selectedFindings.map((finding) => finding.id),
        report,
      });
      setApplyResult(res.applied);
      setSelected((current) => {
        const next = new Set(current);
        for (const applied of res.applied) next.delete(applied.finding_id);
        return next;
      });
      notifications.success(`Applied ${res.applied.length} action${res.applied.length === 1 ? '' : 's'}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Apply failed';
      setError(message);
      notifications.error(message);
    } finally {
      setApplying(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setGroupSelection(group: FindingGroup, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const finding of group.findings) {
        if (checked) next.add(finding.id);
        else next.delete(finding.id);
      }
      return next;
    });
  }

  return (
    <main
      className="of-page"
      data-testid="schedule-sweep-page"
      style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 1280, margin: '0 auto' }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <Link to="/build-schedules" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Back to Build schedules
          </Link>
          <div>
            <h1 className="of-heading-xl" style={{ margin: 0 }}>Schedule sweep</h1>
            <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              SCH-001 through SCH-007 across the schedule inventory.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="of-button of-button--primary"
          data-testid="sweep-run-button"
        >
          <Glyph name="run" size={15} />
          {running ? 'Running' : 'Run sweep'}
        </button>
      </header>

      {error && (
        <div role="alert" className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <section className="of-panel" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
            Project RID
            <input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="ri.foundry.main.project.alpha"
              className="of-input"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </label>

          <div style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Environment</span>
            <div className="of-pill-toggle" style={{ width: 'fit-content' }}>
              <button type="button" data-active={!production} onClick={() => setProduction(false)} disabled={busy}>
                Standard
              </button>
              <button type="button" data-active={production} onClick={() => setProduction(true)} disabled={busy}>
                Production
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setSelected(defaultSelectedFindings(findings))} disabled={!report || busy} className="of-button">
              Select suggested
            </button>
            <button type="button" onClick={() => setSelected(new Set(findings.map((finding) => finding.id)))} disabled={!report || busy} className="of-button">
              Select all
            </button>
            <button type="button" onClick={() => setSelected(new Set())} disabled={!report || busy} className="of-button">
              Clear
            </button>
          </div>
        </div>
      </section>

      {report && (
        <section style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {[
            { label: 'Findings', value: stats.total, color: 'var(--text-strong)' },
            { label: 'Errors', value: stats.errors, color: 'var(--status-danger)' },
            { label: 'Warnings', value: stats.warnings, color: 'var(--status-warning)' },
            { label: 'Info', value: stats.info, color: 'var(--status-info)' },
            { label: 'Selected', value: stats.selected, color: 'var(--text-link)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="of-panel" style={{ padding: 12, minHeight: 72 }}>
              <p className="of-eyebrow" style={{ margin: 0 }}>{label}</p>
              <strong style={{ display: 'block', marginTop: 6, color, fontSize: 24, lineHeight: 1 }}>{value}</strong>
            </div>
          ))}
        </section>
      )}

      {!report && (
        <section className="of-panel" style={{ padding: 18 }}>
          <p className="of-text-muted" style={{ margin: 0 }}>No sweep report loaded.</p>
        </section>
      )}

      {report && findings.length === 0 && (
        <section className="of-panel of-status-success" style={{ padding: 18, borderColor: '#bbdfc7' }}>
          No schedule findings in the current scope.
        </section>
      )}

      {report && findings.length > 0 && (
        <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'start' }}>
          <div className="of-panel" style={{ padding: 16, minWidth: 0 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <div>
                <p className="of-eyebrow" style={{ margin: 0 }}>Findings by rule</p>
                <h2 className="of-heading-md" style={{ margin: '4px 0 0' }}>
                  {grouped.length} active rule{grouped.length === 1 ? '' : 's'}
                </h2>
              </div>
              <span className="of-text-muted" style={{ fontSize: 12 }}>
                {selectedFindings.length} selected
              </span>
            </header>

            <div style={{ display: 'grid', gap: 12 }}>
              {grouped.map((group) => {
                const allSelected = group.selectedCount === group.findings.length;
                return (
                  <section key={group.ruleId} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <header
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: 10,
                        alignItems: 'center',
                        padding: '10px 12px',
                        background: 'var(--bg-panel-muted)',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={allSelected}
                        aria-label={`Select all ${group.meta.code} findings`}
                        onChange={(event) => setGroupSelection(group, event.target.checked)}
                        disabled={busy}
                      />
                      <div style={{ minWidth: 0 }}>
                        <h3 className="of-section-title" style={{ margin: 0 }}>
                          {group.meta.code} · {group.meta.title}
                        </h3>
                        <p className="of-text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                          {group.meta.summary}
                        </p>
                      </div>
                      <span className="of-badge">
                        {group.selectedCount}/{group.findings.length}
                      </span>
                    </header>

                    <div className="of-scrollbar" style={{ overflowX: 'auto' }}>
                      <table className="of-table" data-testid="sweep-findings-table" style={{ minWidth: 880 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 44 }} aria-label="Selection" />
                            <th>Severity</th>
                            <th>Schedule</th>
                            <th>Project</th>
                            <th>Message</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.findings.map((finding) => (
                            <tr key={finding.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selected.has(finding.id)}
                                  aria-label={`Select finding ${finding.id}`}
                                  onChange={() => toggle(finding.id)}
                                  disabled={busy}
                                />
                              </td>
                              <td>
                                <span style={badgeStyle(SEVERITY_STYLE[finding.severity])}>{finding.severity}</span>
                              </td>
                              <td>
                                <Link to={`/schedules/${encodeURIComponent(finding.schedule_rid)}`} style={{ fontFamily: 'var(--font-mono)' }}>
                                  {shortRid(finding.schedule_rid)}
                                </Link>
                              </td>
                              <td>
                                <code style={{ fontSize: 11 }}>{shortRid(finding.project_rid)}</code>
                              </td>
                              <td>{finding.message}</td>
                              <td>
                                <span style={badgeStyle(ACTION_STYLE[finding.recommended_action])}>
                                  {finding.recommended_action}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="of-panel" style={{ padding: 16, minWidth: 0 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <p className="of-eyebrow" style={{ margin: 0 }}>Apply preview</p>
                <h2 className="of-heading-md" style={{ margin: '4px 0 0' }}>{selectedFindings.length} queued</h2>
              </div>
              <button
                type="button"
                onClick={() => void applySelection()}
                disabled={selectedFindings.length === 0 || busy}
                className="of-button of-button--primary"
                data-testid="sweep-apply-button"
              >
                <Glyph name="run" size={15} />
                {applying ? 'Applying' : 'Apply'}
              </button>
            </header>

            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              {ACTIONS.map((action) => (
                <div
                  key={action}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={badgeStyle(ACTION_STYLE[action])}>{action}</span>
                  <strong>{stats.actions[action]}</strong>
                </div>
              ))}
            </div>

            {stats.actions.Delete > 0 && (
              <p className="of-status-danger" style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', margin: '12px 0 0', fontSize: 12 }}>
                Delete actions require confirmation before apply.
              </p>
            )}

            {applyResult && (
              <section style={{ marginTop: 18 }}>
                <p className="of-eyebrow" style={{ margin: 0 }}>Last apply</p>
                <div className="of-scrollbar" style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table className="of-table" style={{ minWidth: 460 }}>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Schedule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applyResult.map((applied) => (
                        <tr key={applied.finding_id}>
                          <td>
                            <span style={badgeStyle(ACTION_STYLE[applied.action])}>{applied.action}</span>
                          </td>
                          <td>
                            <code style={{ fontSize: 11 }}>{shortRid(applied.schedule_rid)}</code>
                          </td>
                        </tr>
                      ))}
                      {applyResult.length === 0 && (
                        <tr>
                          <td colSpan={2} className="of-text-muted">No actions returned.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
