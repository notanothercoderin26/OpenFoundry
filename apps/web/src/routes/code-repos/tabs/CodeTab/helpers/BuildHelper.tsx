import { Glyph } from '@/lib/components/ui/Glyph';

import type { CiRun } from '@/lib/api/code-repos';

import { useRepoState } from '../../../state/RepoContext';

function statusTone(status: CiRun['status']) {
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

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Build helper. Lists every CI run returned by listCiRuns (already cached
 * on useRepoState) and surfaces the pipeline name, branch, commit and
 * duration. Log streaming over WebSocket is the eventual backend gap B6;
 * until then the helper opens the run row in a collapsible card without
 * live tailing.
 */
export function BuildHelper() {
  const { ciRuns, busy, triggerCiAction, currentBranch } = useRepoState();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-of-border bg-of-surface-raised">
        <Glyph name="pipeline" size={14} tone="muted" />
        <span className="text-of-13 font-of-semibold">CI runs</span>
        <span className="text-of-12 text-of-text-soft">{ciRuns.length}</span>
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
      </div>

      {ciRuns.length === 0 ? (
        <p className="px-3 py-6 text-of-12 text-of-text-soft text-center">
          No CI runs yet. Trigger one with the button above.
        </p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-auto divide-y divide-of-border">
          {ciRuns.map((run) => {
            const meta = statusTone(run.status);
            return (
              <li key={run.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Glyph
                    name={meta.glyph}
                    size={13}
                    tone={meta.cls === 'text-of-danger' ? 'danger' : 'currentColor'}
                  />
                  <span className="text-of-13 font-of-semibold">{run.pipeline_name}</span>
                  <span className={`text-of-12 ${meta.cls}`}>{meta.label}</span>
                  <span className="ml-auto text-of-12 text-of-text-soft">
                    {formatDuration(run.started_at, run.completed_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-of-12 text-of-text-soft font-mono truncate">
                  {run.branch_name} · {run.commit_sha.slice(0, 8)} · trigger {run.trigger}
                </p>
                {run.checks && run.checks.length > 0 ? (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {run.checks.map((check) => (
                      <li
                        key={check}
                        className="inline-flex items-center px-1.5 py-0.5 rounded-of-sm bg-of-surface-muted text-of-12 text-of-text-muted"
                      >
                        {check}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
