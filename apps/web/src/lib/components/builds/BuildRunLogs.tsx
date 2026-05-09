import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

import { listJobLogsV1, type Job, type JobLogEntry, type JobLogLevel } from '@/lib/api/buildsV1';

const LEVELS: JobLogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

const LEVEL_STYLE: Record<string, { bg: string; text: string }> = {
  TRACE: { bg: '#e5e7eb', text: '#374151' },
  DEBUG: { bg: '#dbeafe', text: '#1d4ed8' },
  INFO: { bg: '#dcfce7', text: '#166534' },
  WARN: { bg: '#fef3c7', text: '#92400e' },
  ERROR: { bg: '#fee2e2', text: '#991b1b' },
  FATAL: { bg: '#7f1d1d', text: '#fee2e2' },
};

interface BuildRunLogsProps {
  job: Job | null;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function levelStyle(level: string) {
  return LEVEL_STYLE[level] ?? { bg: '#e5e7eb', text: '#374151' };
}

function isLiveState(job: Job | null) {
  return job ? ['WAITING', 'RUN_PENDING', 'RUNNING', 'ABORT_PENDING'].includes(job.state) : false;
}

function paramsText(params: unknown) {
  if (params === undefined || params === null || params === '') return '';
  try {
    return JSON.stringify(params);
  } catch {
    return String(params);
  }
}

export function BuildRunLogs({ job }: BuildRunLogsProps) {
  const [logs, setLogs] = useState<JobLogEntry[]>([]);
  const [level, setLevel] = useState<JobLogLevel | ''>('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const selectedLevels = useMemo(() => (level ? [level] : undefined), [level]);

  const loadLogs = useCallback(
    async (showSpinner = true) => {
      if (!job) {
        setLogs([]);
        return;
      }
      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      setError('');
      try {
        const res = await listJobLogsV1(job.rid, { limit: 1000, levels: selectedLevels });
        setLogs(res.data);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load job logs');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [job, selectedLevels],
  );

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!isLiveState(job)) return;
    const timer = window.setInterval(() => void loadLogs(false), 5000);
    return () => window.clearInterval(timer);
  }, [job, loadLogs]);

  if (!job) {
    return (
      <section className="of-panel" style={{ padding: 16 }}>
        <p className="of-text-muted" style={{ margin: 0 }}>No job selected.</p>
      </section>
    );
  }

  return (
    <section className="of-panel" style={{ display: 'grid', gap: 12, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="of-eyebrow" style={{ margin: 0 }}>Run logs</p>
          <h2 className="of-heading-md" style={{ margin: '4px 0 0', fontFamily: 'var(--font-mono)' }}>{job.rid}</h2>
          <p className="of-text-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {logs.length} entries{refreshing ? ' · refreshing' : ''}
          </p>
        </div>
        <button type="button" className="of-button" onClick={() => void loadLogs()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh logs'}
        </button>
      </header>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setLevel('')} className={level === '' ? 'of-button of-button--primary' : 'of-button'} style={{ fontSize: 11 }}>
          All
        </button>
        {LEVELS.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setLevel(entry)}
            className={level === entry ? 'of-button of-button--primary' : 'of-button'}
            style={{ fontSize: 11 }}
          >
            {entry}
          </button>
        ))}
      </div>

      {error && (
        <div className="of-status-warning" style={{ padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading && logs.length === 0 ? (
        <p className="of-text-muted" style={{ margin: 0 }}>Loading logs…</p>
      ) : logs.length === 0 ? (
        <div style={{ padding: 24, border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <p className="of-text-muted" style={{ margin: 0 }}>No persisted logs for this job.</p>
        </div>
      ) : (
        <div
          style={{
            maxHeight: 520,
            overflow: 'auto',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: '#0f172a',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={logHeadStyle}>Seq</th>
                <th style={logHeadStyle}>Time</th>
                <th style={logHeadStyle}>Level</th>
                <th style={logHeadStyle}>Message</th>
                <th style={logHeadStyle}>Params</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((entry) => {
                const style = levelStyle(entry.level);
                return (
                  <tr key={entry.sequence}>
                    <td style={logCellStyle}>{entry.sequence}</td>
                    <td style={logCellStyle}>{formatTimestamp(entry.ts)}</td>
                    <td style={logCellStyle}>
                      <span style={{ display: 'inline-flex', borderRadius: 999, padding: '1px 7px', background: style.bg, color: style.text, fontWeight: 700 }}>
                        {entry.level}
                      </span>
                    </td>
                    <td style={{ ...logCellStyle, color: '#f8fafc', whiteSpace: 'pre-wrap' }}>{entry.message}</td>
                    <td style={{ ...logCellStyle, maxWidth: 320 }}>
                      <code style={{ color: '#cbd5e1', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{paramsText(entry.params)}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const logHeadStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  padding: '7px 8px',
  borderBottom: '1px solid #1f2937',
  background: '#111827',
  color: '#94a3b8',
  fontWeight: 700,
  textAlign: 'left',
};

const logCellStyle: CSSProperties = {
  padding: '7px 8px',
  borderBottom: '1px solid #1f2937',
  color: '#cbd5e1',
  fontFamily: 'var(--font-mono)',
  verticalAlign: 'top',
};
