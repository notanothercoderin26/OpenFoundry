import { useEffect, useMemo, useRef, useState } from 'react';

import type { CiRun } from '@/lib/api/code-repos';
import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoState } from '../../state/RepoContext';

type DetailTab = 'summary' | 'logs' | 'tests';

interface StatusMeta {
  glyph: GlyphName;
  cls: string;
  label: string;
}

function relativeTime(iso: string) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffSeconds = Math.round((Date.now() - then) / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(startedAt: string, completedAt: string | null) {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function statusMeta(status: CiRun['status']): StatusMeta {
  switch (status) {
    case 'passed':
      return { glyph: 'check', cls: 'text-of-success', label: 'Passed' };
    case 'failed':
      return { glyph: 'circle-x', cls: 'text-of-danger', label: 'Failed' };
    case 'running':
      return { glyph: 'run', cls: 'text-of-accent', label: 'Running' };
    case 'queued':
      return { glyph: 'history', cls: 'text-of-text-muted', label: 'Queued' };
    case 'skipped':
      return { glyph: 'circle-x', cls: 'text-of-text-soft', label: 'Skipped' };
    default:
      return { glyph: 'info', cls: 'text-of-text-muted', label: status };
  }
}

const MOCK_LOG = `[runner] preparing workspace…
[runner] cloning branch @ HEAD
[lint]   golangci-lint run ./...
[lint]   ok                  60.231s
[test]   go test -race ./...
[test]   ok  github.com/openfoundry/...
[test]   PASS                42.108s
[finish] check passed in 1m 42.3s`;

interface MockTestResult {
  framework: 'pytest' | 'go-test' | 'junit';
  suite: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  failure_message?: string;
}

const MOCK_TESTS: ReadonlyArray<MockTestResult> = [
  { framework: 'pytest', suite: 'tests/test_filters.py', name: 'test_blank_arr_time', status: 'passed', duration_ms: 18 },
  {
    framework: 'pytest',
    suite: 'tests/test_filters.py',
    name: 'test_unknown_carrier',
    status: 'failed',
    duration_ms: 22,
    failure_message:
      'AssertionError: expected carrier to be "UA" but got None\n  at filters.py:88 in apply_filters',
  },
  { framework: 'pytest', suite: 'tests/test_uniq.py', name: 'test_unique_airports', status: 'passed', duration_ms: 8 },
  { framework: 'pytest', suite: 'tests/test_uniq.py', name: 'test_skips_blanks', status: 'skipped', duration_ms: 0 },
];

/**
 * Foundry-style Checks tab. Left column lists every CiRun (filterable by
 * branch) with per-row Re-run; right column expands the selected run
 * into Summary / Logs / Tests sub-tabs and surfaces an AIP error-enhancer
 * widget for failures. Real log streaming and structured test results
 * await master plan gaps B6 (WebSocket logs) and B2 (test runner) — the
 * mock data here mirrors the eventual wire shape.
 */
export function ChecksTab() {
  const { ciRuns, branchOptions, currentBranch, triggerCiAction, busy } = useRepoState();

  const [filterBranch, setFilterBranch] = useState<string>(currentBranch || branchOptions[0] || '');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!filterBranch) return ciRuns;
    return ciRuns.filter((run) => run.branch_name === filterBranch);
  }, [ciRuns, filterBranch]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((run) => run.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selectedRun = filtered.find((run) => run.id === selectedId) ?? null;

  return (
    <div className="p-4 grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 0.6fr) minmax(0, 1fr)' }}>
      <section className="rounded-of-md border border-of-border bg-of-surface-raised overflow-hidden">
        <header className="flex items-center gap-2 px-3 h-9 border-b border-of-border bg-of-surface">
          <Glyph name="pipeline" size={14} tone="muted" />
          <select
            value={filterBranch}
            onChange={(event) => setFilterBranch(event.target.value)}
            className="h-7 px-2 rounded-of-sm border border-of-border bg-of-surface-raised text-of-12"
          >
            <option value="">All branches</option>
            {branchOptions.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void triggerCiAction()}
            disabled={busy || !currentBranch}
            className={`ml-auto inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm text-of-12 font-of-medium ${
              busy || !currentBranch
                ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
                : 'bg-of-accent text-white hover:bg-of-accent-hover'
            }`}
          >
            <Glyph name="run" size={12} tone="currentColor" />
            Trigger build
          </button>
        </header>
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">No CI runs for this filter.</p>
        ) : (
          <ul className="divide-y divide-of-border max-h-[70vh] overflow-auto">
            {filtered.map((run) => (
              <CheckRunRow
                key={run.id}
                run={run}
                active={selectedId === run.id}
                onSelect={() => setSelectedId(run.id)}
                onReRun={() => void triggerCiAction()}
                disabled={busy}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-of-md border border-of-border bg-of-surface-raised overflow-hidden flex flex-col min-h-[60vh]">
        {selectedRun ? (
          <CheckRunDetail run={selectedRun} onReRun={() => void triggerCiAction()} busy={busy} />
        ) : (
          <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">
            Select a run on the left to inspect its checks, tests and output.
          </p>
        )}
      </section>
    </div>
  );
}

interface CheckRunRowProps {
  run: CiRun;
  active: boolean;
  onSelect: () => void;
  onReRun: () => void;
  disabled: boolean;
}

function CheckRunRow({ run, active, onSelect, onReRun, disabled }: CheckRunRowProps) {
  const meta = statusMeta(run.status);
  return (
    <li className="relative group">
      <button
        type="button"
        onClick={onSelect}
        className={`flex items-start gap-2 w-full text-left px-3 py-2 ${
          active ? 'bg-of-accent-soft' : 'hover:bg-of-surface-muted'
        }`}
      >
        <Glyph
          name={meta.glyph}
          size={13}
          tone={meta.cls === 'text-of-danger' ? 'danger' : 'currentColor'}
        />
        <div className="min-w-0 flex-1">
          <p className="text-of-13 font-of-semibold truncate">{run.pipeline_name}</p>
          <p className="mt-0.5 text-of-12 text-of-text-soft font-mono truncate">
            {run.branch_name} · {run.commit_sha.slice(0, 8)}
          </p>
        </div>
        <div className="text-right text-of-12 text-of-text-soft whitespace-nowrap">
          <p>{relativeTime(run.started_at)}</p>
          <p>{formatDuration(run.started_at, run.completed_at)}</p>
        </div>
      </button>
      <button
        type="button"
        aria-label={`Re-run ${run.pipeline_name}`}
        title="Re-run"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onReRun();
        }}
        className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-of-sm text-of-text-muted hover:bg-of-surface-raised hover:text-of-text ${
          disabled ? 'opacity-30 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <Glyph name="undo" size={11} tone="currentColor" />
      </button>
    </li>
  );
}

interface CheckRunDetailProps {
  run: CiRun;
  onReRun: () => void;
  busy: boolean;
}

function CheckRunDetail({ run, onReRun, busy }: CheckRunDetailProps) {
  const meta = statusMeta(run.status);
  const [tab, setTab] = useState<DetailTab>('summary');

  useEffect(() => {
    setTab('summary');
  }, [run.id]);

  return (
    <>
      <header className="flex items-start gap-3 px-3 py-3 border-b border-of-border">
        <Glyph
          name={meta.glyph}
          size={18}
          tone={meta.cls === 'text-of-danger' ? 'danger' : 'currentColor'}
        />
        <div className="min-w-0 flex-1">
          <p className="text-of-13 font-of-semibold">{run.pipeline_name}</p>
          <p className="mt-0.5 text-of-12 text-of-text-soft font-mono truncate">
            {run.branch_name} · commit {run.commit_sha.slice(0, 12)} · trigger {run.trigger}
          </p>
          <p className="mt-0.5 text-of-12 text-of-text-soft">
            Started {relativeTime(run.started_at)} · {formatDuration(run.started_at, run.completed_at)} elapsed
          </p>
        </div>
        <button
          type="button"
          onClick={onReRun}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-of-sm text-of-12 font-of-medium ${
            busy
              ? 'bg-of-surface-muted text-of-text-soft cursor-not-allowed'
              : 'border border-of-border text-of-text hover:bg-of-surface-muted'
          }`}
          title="Re-run"
        >
          <Glyph name="run" size={12} tone="currentColor" />
          Re-run
        </button>
      </header>

      <nav className="flex items-end gap-1 px-3 border-b border-of-border">
        {([
          ['summary', 'Summary'],
          ['logs', 'Logs'],
          ['tests', 'Tests'],
        ] as Array<[DetailTab, string]>).map(([id, label]) => {
          const active = id === tab;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center h-8 px-3 -mb-px border-b-2 text-of-12 font-of-medium ${
                active
                  ? 'border-of-accent text-of-accent'
                  : 'border-transparent text-of-text-muted hover:text-of-text'
              }`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-h-0 overflow-auto">
        {tab === 'summary' ? <SummaryPane run={run} meta={meta} /> : null}
        {tab === 'logs' ? <LogsPane run={run} /> : null}
        {tab === 'tests' ? <TestsPane /> : null}
      </div>

      {run.status === 'failed' ? <ErrorEnhancer /> : null}
    </>
  );
}

function SummaryPane({ run, meta }: { run: CiRun; meta: StatusMeta }) {
  return (
    <section className="px-3 py-3 space-y-4">
      <div>
        <h3 className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
          Checks
        </h3>
        {run.checks && run.checks.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {run.checks.map((check) => (
              <li
                key={check}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-of-sm text-of-12 ${meta.cls} bg-of-surface-muted`}
              >
                <Glyph name="badge-check" size={10} tone="currentColor" />
                {check}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-of-12 text-of-text-soft">
            No individual checks reported. The run is treated as a single black-box CI invocation.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
          Test summary
        </h3>
        <TestStatsRow />
      </div>
    </section>
  );
}

function TestStatsRow() {
  const totals = MOCK_TESTS.reduce(
    (acc, test) => {
      acc[test.status] += 1;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0 } as Record<MockTestResult['status'], number>,
  );

  return (
    <ul className="mt-2 grid grid-cols-3 gap-2">
      <li className="rounded-of-sm border border-of-border bg-of-surface p-2 text-center">
        <p className="text-of-12 text-of-text-soft uppercase tracking-wider">Passed</p>
        <p className="mt-1 text-of-14 font-of-semibold text-of-success">{totals.passed}</p>
      </li>
      <li className="rounded-of-sm border border-of-border bg-of-surface p-2 text-center">
        <p className="text-of-12 text-of-text-soft uppercase tracking-wider">Failed</p>
        <p className="mt-1 text-of-14 font-of-semibold text-of-danger">{totals.failed}</p>
      </li>
      <li className="rounded-of-sm border border-of-border bg-of-surface p-2 text-center">
        <p className="text-of-12 text-of-text-soft uppercase tracking-wider">Skipped</p>
        <p className="mt-1 text-of-14 font-of-semibold text-of-text-muted">{totals.skipped}</p>
      </li>
    </ul>
  );
}

function LogsPane({ run }: { run: CiRun }) {
  const streaming = run.status === 'running' || run.status === 'queued';
  const [chunkCount, setChunkCount] = useState(streaming ? 4 : MOCK_LOG.split('\n').length);
  const scrollRef = useRef<HTMLPreElement | null>(null);

  // Fake streaming: when the run is still running, drop one log line at a
  // time into view until the mock log is exhausted. Once the WebSocket
  // endpoint (gap B6) ships, swap this for a useEffect that subscribes
  // and pushes new chunks into the same state shape.
  useEffect(() => {
    if (!streaming) {
      setChunkCount(MOCK_LOG.split('\n').length);
      return;
    }
    const total = MOCK_LOG.split('\n').length;
    setChunkCount(Math.min(4, total));
    const id = window.setInterval(() => {
      setChunkCount((value) => Math.min(total, value + 1));
    }, 1500);
    return () => window.clearInterval(id);
  }, [streaming, run.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chunkCount]);

  const lines = MOCK_LOG.split('\n').slice(0, chunkCount).join('\n');

  return (
    <section className="px-3 py-3 flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-2 text-of-12 text-of-text-soft">
        {streaming ? (
          <>
            <span className="w-2 h-2 rounded-full bg-of-accent animate-pulse" aria-hidden />
            Streaming…
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-of-text-soft" aria-hidden />
            Run finished — log replay is offline until the WebSocket endpoint ships (gap B6)
          </>
        )}
        <button
          type="button"
          onClick={() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
          className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-of-sm text-of-12 text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
        >
          <Glyph name="chevron-down" size={10} tone="currentColor" />
          Scroll to bottom
        </button>
      </div>
      <pre
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto text-of-12 font-mono text-of-text bg-of-surface-muted rounded-of-sm p-3 whitespace-pre"
      >
        {lines}
      </pre>
    </section>
  );
}

function TestsPane() {
  const grouped = useMemo(() => {
    const map = new Map<string, MockTestResult[]>();
    for (const test of MOCK_TESTS) {
      const list = map.get(test.suite) ?? [];
      list.push(test);
      map.set(test.suite, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <section className="px-3 py-3 space-y-3">
      <p className="text-of-12 text-of-text-soft">
        Structured test output is mocked until the runner endpoint (gap B2) populates this view.
      </p>
      {grouped.map(([suite, tests]) => {
        const framework = tests[0]?.framework ?? 'pytest';
        return (
          <article
            key={suite}
            className="rounded-of-md border border-of-border bg-of-surface-raised overflow-hidden"
          >
            <header className="flex items-center gap-2 px-3 h-9 border-b border-of-border bg-of-surface">
              <Glyph name="badge-check" size={12} tone="muted" />
              <span className="text-of-13 font-of-semibold font-mono truncate">{suite}</span>
              <span className="text-of-12 text-of-text-soft uppercase tracking-wider">{framework}</span>
              <span className="ml-auto text-of-12 text-of-text-soft">{tests.length} tests</span>
            </header>
            <ul className="divide-y divide-of-border">
              {tests.map((test, index) => {
                const tone =
                  test.status === 'passed'
                    ? { glyph: 'check' as const, cls: 'text-of-success' }
                    : test.status === 'failed'
                      ? { glyph: 'circle-x' as const, cls: 'text-of-danger' }
                      : { glyph: 'circle-x' as const, cls: 'text-of-text-soft' };
                return (
                  <li key={`${suite}:${test.name}:${index}`} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Glyph
                        name={tone.glyph}
                        size={12}
                        tone={tone.cls === 'text-of-danger' ? 'danger' : 'currentColor'}
                      />
                      <span className="text-of-13 font-mono truncate">{test.name}</span>
                      <span className={`text-of-12 ml-2 capitalize ${tone.cls}`}>{test.status}</span>
                      <span className="ml-auto text-of-12 text-of-text-soft">{test.duration_ms}ms</span>
                    </div>
                    {test.status === 'failed' && test.failure_message ? (
                      <pre className="mt-1 px-2 py-1 text-of-12 font-mono text-of-danger bg-of-danger-soft rounded-of-sm whitespace-pre-wrap">
                        {test.failure_message}
                      </pre>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </section>
  );
}

function ErrorEnhancer() {
  return (
    <section className="px-3 py-3 border-t border-of-border bg-of-warning-soft">
      <div className="flex items-start gap-2">
        <Glyph name="sparkles" size={14} tone="warning" />
        <div>
          <p className="text-of-13 font-of-semibold text-of-warning">AIP error enhancer</p>
          <p className="mt-1 text-of-12 text-of-warning">
            When AIP is enabled, this widget surfaces an explanation of the failure plus suggested fixes. The
            hook-up arrives in Phase 5.
          </p>
          <button
            type="button"
            onClick={() => notifications.info('AIP error enhancer is wired in Phase 5')}
            className="mt-2 inline-flex items-center gap-1 h-7 px-2 rounded-of-sm text-of-12 font-of-medium bg-of-warning text-white hover:opacity-90"
          >
            <Glyph name="sparkles" size={12} tone="currentColor" />
            Explain failure
          </button>
        </div>
      </div>
    </section>
  );
}
