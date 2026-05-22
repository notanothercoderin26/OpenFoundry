import { Glyph } from '@/lib/components/ui/Glyph';

import { useErrorCount, useProblemCount } from '../state/problems';
import { useRepoIdentity, useRepoState } from '../state/RepoContext';
import { useDirtyFileCount, useSavingCount } from '../state/useOpenFiles';
import { helperPanels } from '../state/useHelperPanels';

/**
 * Sticky strip at the bottom of the IDE — 24px tall, full width, on top
 * of the canvas background:
 *
 *   ⚠ N problems · Code Assist running…          Project scoped · Saving… · Checks passed 1/1
 *
 * Every segment maps to a real signal:
 *   • Problems count comes from the shared problems store; clicking
 *     focuses the bottom-dock Problems helper.
 *   • Code Assist state derives from the global busy flag with a tooltip
 *     that explains the placeholder while the LSP gateway (gap B9) is
 *     missing.
 *   • Project scoped vs. Global tracks the repository visibility.
 *   • Files status switches between "Files saved", "Saving…" and
 *     "N unsaved" based on useOpenFiles.
 *   • Checks reflects the last CI run for the active branch.
 */
export function RepoStatusBar() {
  const { repository, currentBranch } = useRepoIdentity();
  const { ciRuns, busy } = useRepoState();
  const dirtyCount = useDirtyFileCount();
  const savingCount = useSavingCount();
  const problemCount = useProblemCount();
  const errorCount = useErrorCount();

  const latestCiForBranch = ciRuns.find((run) => run.branch_name === currentBranch);
  const checksLabel = !latestCiForBranch
    ? 'No checks yet'
    : latestCiForBranch.status === 'passed'
      ? 'Checks passed 1/1'
      : latestCiForBranch.status === 'failed'
        ? 'Checks failed 1/1'
        : 'Checks started running';
  const checksTone =
    latestCiForBranch?.status === 'passed'
      ? 'text-of-success'
      : latestCiForBranch?.status === 'failed'
        ? 'text-of-danger'
        : 'text-of-text-muted';

  const filesLabel =
    savingCount > 0
      ? 'Saving…'
      : dirtyCount === 0
        ? 'Files saved'
        : `${dirtyCount} unsaved`;
  const filesTone =
    savingCount > 0
      ? 'text-of-accent'
      : dirtyCount === 0
        ? 'text-of-text-muted'
        : 'text-of-warning';

  const codeAssistLabel = busy ? 'Code Assist running…' : problemCount === 0 ? 'Ready' : 'Ready';
  const codeAssistTone = busy ? 'bg-of-accent animate-pulse' : 'bg-of-success';
  const codeAssistTooltip = busy
    ? 'Initialising Code Assist · indexing files and warming language servers…'
    : `Code Assist ready · ${problemCount} diagnostic${
        problemCount === 1 ? '' : 's'
      } on file. Real diagnostics arrive once the LSP gateway (gap B9) ships.`;

  const problemsTooltip =
    problemCount === 0
      ? 'No problems detected'
      : `${errorCount} error${errorCount === 1 ? '' : 's'}, ${
          problemCount - errorCount
        } warning${problemCount - errorCount === 1 ? '' : 's'} · Click to open Problems`;

  return (
    <footer
      data-tour="status-bar"
      className="flex items-center h-6 px-3 gap-4 border-t border-of-border text-of-12 text-of-text-muted"
      style={{ background: 'var(--bg-default)' }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => helperPanels.activate('problems')}
          title={problemsTooltip}
          className="inline-flex items-center gap-1 h-5 px-1 rounded-of-sm hover:bg-of-surface-muted"
        >
          <Glyph
            name={errorCount > 0 ? 'circle-x' : 'info'}
            size={12}
            tone={errorCount > 0 ? 'danger' : 'currentColor'}
          />
          <span>
            {problemCount} {problemCount === 1 ? 'problem' : 'problems'}
          </span>
        </button>
        <span className="inline-flex items-center gap-1" title={codeAssistTooltip}>
          <span className={`w-2 h-2 rounded-full ${codeAssistTone}`} aria-hidden />
          Code Assist {codeAssistLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <span title={`Repository visibility: ${repository.visibility}`}>
          {repository.visibility === 'private' ? 'Project scoped' : 'Global'}
        </span>
        <span aria-hidden className="text-of-text-soft">·</span>
        <span className={filesTone} title={savingCount > 0 ? 'Persisting changes…' : undefined}>
          {filesLabel}
        </span>
        <span aria-hidden className="text-of-text-soft">·</span>
        <button
          type="button"
          onClick={() => helperPanels.activate('build')}
          title="Open the Build helper"
          className={`inline-flex items-center gap-1 h-5 px-1 rounded-of-sm hover:bg-of-surface-muted ${checksTone}`}
        >
          {checksLabel}
        </button>
      </div>
    </footer>
  );
}
