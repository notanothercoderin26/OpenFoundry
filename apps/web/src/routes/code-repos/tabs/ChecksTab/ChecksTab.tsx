import { CommitHistory } from '@/lib/components/code-repo/CommitHistory';

import { useRepoContext } from '../../state/useRepoContext';

/**
 * Checks tab — Phase 0 mirrors Foundry's surface by showing the CI runs and
 * commit history that drive them. F2 splits this into a dedicated run-detail
 * view with streamed logs (B6) and the error enhancer widget.
 */
export function ChecksTab() {
  const {
    branches,
    commits,
    ciRuns,
    commitDraft,
    pendingFileChanges,
    busy,
    setCommitDraft,
    createCommitAction,
    triggerCiAction,
  } = useRepoContext();

  return (
    <div className="p-4">
      <CommitHistory
        branches={branches}
        commits={commits}
        ciRuns={ciRuns}
        draft={commitDraft}
        busy={busy}
        onDraftChange={setCommitDraft}
        onCreateCommit={() => void createCommitAction()}
        pendingFileCount={pendingFileChanges.length}
        onTriggerCi={() => void triggerCiAction()}
      />
    </div>
  );
}
