import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { useDirtyFileCount } from '../state/useOpenFiles';

/**
 * Sticky bar at the bottom of the IDE.
 *
 *   ⚠ N problems · Code Assist running           Project scoped · Files saved · Checks passed 1/1
 *
 * Phase 0 wires the parts that are derivable from existing state. The
 * "Problems" counter and the Code Assist health indicator are placeholders
 * until F4 ships the helpers.
 */
export function RepoStatusBar() {
  const { repository, currentBranch } = useRepoIdentity();
  const { ciRuns, busy } = useRepoState();
  const dirtyCount = useDirtyFileCount();

  const latestCiForBranch = ciRuns.find((run) => run.branch_name === currentBranch);
  const checksLabel = latestCiForBranch
    ? latestCiForBranch.status === 'passed'
      ? 'Checks passed'
      : latestCiForBranch.status === 'failed'
        ? 'Checks failed'
        : 'Checks running'
    : 'No checks yet';

  const checksTone =
    latestCiForBranch?.status === 'passed'
      ? 'text-of-success'
      : latestCiForBranch?.status === 'failed'
        ? 'text-of-danger'
        : 'text-of-text-muted';

  const fileSavingLabel = dirtyCount > 0 ? `${dirtyCount} unsaved` : 'Files saved';

  return (
    <footer className="flex items-center h-6 px-3 gap-4 border-t border-of-border bg-of-surface-raised text-of-12 text-of-text-muted">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <Glyph name="info" size={12} tone="currentColor" />
          0 problems
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className={`w-2 h-2 rounded-full ${busy ? 'bg-of-warning animate-pulse' : 'bg-of-success'}`}
            aria-hidden
          />
          Code Assist {busy ? 'running…' : 'ready'}
        </span>
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <span>{repository.visibility === 'private' ? 'Project scoped' : 'Global'}</span>
        <span aria-hidden className="text-of-text-soft">·</span>
        <span className={dirtyCount > 0 ? 'text-of-warning' : undefined}>{fileSavingLabel}</span>
        <span aria-hidden className="text-of-text-soft">·</span>
        <span className={checksTone}>{checksLabel}</span>
      </div>
    </footer>
  );
}
