import { DiffViewer } from '@/lib/components/code-repo/DiffViewer';
import { FileViewer } from '@/lib/components/code-repo/FileViewer';

import { useRepoState } from '../../state/RepoContext';

/**
 * The Code tab is the main authoring surface. Phase 0 lays out the existing
 * file editor and diff viewer side by side — the multi-tab editor, left rail,
 * action buttons (Preview/Test/Commit/Build) and bottom helper panels arrive
 * in F1/F4 per the master plan.
 */
export function CodeTab() {
  const {
    files,
    selectedFilePath,
    searchQuery,
    searchResults,
    busy,
    branchOptions,
    diffBranch,
    diffPatch,
    selectFile,
    setSearchQuery,
    runSearchAction,
    saveFileAction,
    fileTreeAction,
    setPendingFileChanges,
    refreshDiff,
  } = useRepoState();

  return (
    <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'minmax(0, 1.02fr) minmax(0, 0.98fr)' }}>
      <FileViewer
        files={files}
        selectedFilePath={selectedFilePath}
        searchQuery={searchQuery}
        searchResults={searchResults}
        busy={busy}
        onSelectFile={selectFile}
        onSearchQueryChange={setSearchQuery}
        onRunSearch={() => void runSearchAction()}
        onSaveFile={(file, content) => void saveFileAction(file, content)}
        onFileAction={(action, path, nextPath, content) => void fileTreeAction(action, path, nextPath, content)}
        onPendingFileChanges={setPendingFileChanges}
      />
      <DiffViewer
        availableBranches={branchOptions}
        branchName={diffBranch}
        patch={diffPatch}
        busy={busy}
        onSelectBranch={(branch) => void refreshDiff(branch)}
      />
    </div>
  );
}
