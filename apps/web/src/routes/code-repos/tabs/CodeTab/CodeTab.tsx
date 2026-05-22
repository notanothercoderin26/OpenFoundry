import { DiffViewer } from '@/lib/components/code-repo/DiffViewer';
import { FileViewer } from '@/lib/components/code-repo/FileViewer';

import { CodeTabActionBar } from '../../components/CodeTabActionBar';
import { useRepoState } from '../../state/RepoContext';

/**
 * The Code tab now has the Foundry-style top action bar (branch selector +
 * Preview/Test/Commit/Build/Propose changes/⋯) followed by the file editor
 * and diff side panel. The multi-tab editor, left rail (Files / Search),
 * and bottom helper panels land in the next F1 subtasks.
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
    <div className="flex flex-col">
      <CodeTabActionBar />
      <div
        className="grid gap-4 p-4"
        style={{ gridTemplateColumns: 'minmax(0, 1.02fr) minmax(0, 0.98fr)' }}
      >
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
          onFileAction={(action, path, nextPath, content) =>
            void fileTreeAction(action, path, nextPath, content)
          }
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
    </div>
  );
}
