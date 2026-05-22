import { useEffect, useMemo, useState } from 'react';

import type { CiRun } from '@/lib/api/code-repos';
import { Glyph } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { useRepoState } from '../../state/RepoContext';

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

function statusMeta(status: CiRun['status']) {
  switch (status) {
    case 'passed':
      return { glyph: 'check', cls: 'text-of-success', label: 'Passed' } as const;
    case 'failed':
      return { glyph: 'circle-x', cls: 'text-of-danger', label: 'Failed' } as const;
    case 'running':
      return { glyph: 'run', cls: 'text-of-accent', label: 'Running' } as const;
    case 'queued':
      return { glyph: 'history', cls: 'text-of-text-muted', label: 'Queued' } as const;
    default:
      return { glyph: 'info', cls: 'text-of-text-muted', label: status } as const;
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

/**
 * Foundry-style Checks tab. The left column lists every CiRun grouped by
 * branch (filterable via a dropdown); the right column expands the
 * selected run with summary, checks list, mock log output and an
 * "Error enhancer" placeholder.
 *
 * Real log streaming will go through the WebSocket endpoint planned in
 * master plan gap B6; the mock log here keeps the layout honest until
 * that ships.
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
          <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">
            No CI runs for this filter.
          </p>
        ) : (
          <ul className="divide-y divide-of-border max-h-[70vh] overflow-auto">
            {filtered.map((run) => {
              const meta = statusMeta(run.status);
              const active = selectedId === run.id;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(run.id)}
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
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-of-md border border-of-border bg-of-surface-raised overflow-hidden flex flex-col min-h-[60vh]">
        {selectedRun ? (
          <CheckRunDetail run={selectedRun} onReRun={() => void triggerCiAction()} busy={busy} />
        ) : (
          <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">
            Select a run on the left to inspect its checks and output.
          </p>
        )}
      </section>
    </div>
  );
}

interface CheckRunDetailProps {
  run: CiRun;
  onReRun: () => void;
  busy: boolean;
}

function CheckRunDetail({ run, onReRun, busy }: CheckRunDetailProps) {
  const meta = statusMeta(run.status);

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

      <section className="px-3 py-3 border-b border-of-border">
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
      </section>

      <section className="flex-1 min-h-0 flex flex-col">
        <h3 className="px-3 pt-3 text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
          Output
        </h3>
        <pre className="mx-3 my-2 flex-1 min-h-0 overflow-auto text-of-12 font-mono text-of-text bg-of-surface-muted rounded-of-sm p-3 whitespace-pre">
          {MOCK_LOG}
        </pre>
        <p className="px-3 pb-2 text-of-12 text-of-text-soft">
          Mock log — live streaming arrives with gap B6 (WebSocket endpoint).
        </p>
      </section>

      {run.status === 'failed' ? (
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
                onClick={() =>
                  notifications.info('AIP error enhancer is wired in Phase 5')
                }
                className="mt-2 inline-flex items-center gap-1 h-7 px-2 rounded-of-sm text-of-12 font-of-medium bg-of-warning text-white hover:opacity-90"
              >
                <Glyph name="sparkles" size={12} tone="currentColor" />
                Explain failure
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
