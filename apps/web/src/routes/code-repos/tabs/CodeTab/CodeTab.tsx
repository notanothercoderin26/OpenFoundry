import { useState } from 'react';

import { DiffViewer } from '@/lib/components/code-repo/DiffViewer';
import { FileViewer } from '@/lib/components/code-repo/FileViewer';

import { CodeTabActionBar } from '../../components/CodeTabActionBar';
import { FilesPanel } from '../../components/FilesPanel';
import { LeftRail, type LeftPanelId } from '../../components/LeftRail';
import { SearchPanel } from '../../components/SearchPanel';
import { useRepoState } from '../../state/RepoContext';

/**
 * The Code tab now follows the Foundry IDE layout:
 *
 *   [           Action bar (full width)                ]
 *   [ LeftRail | (Files | Search) | Editor | DiffViewer]
 *
 * LeftRail toggles between FilesPanel and SearchPanel. The middle column
 * still uses the legacy FileViewer for editing — its tree and search are
 * hidden with the new props so the new side panels become the single
 * source of truth for navigation and search. The full multi-tab editor
 * arrives in the next F1 subtask (Task 4).
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

  const [activeLeftPanel, setActiveLeftPanel] = useState<LeftPanelId>('files');

  return (
    <div className="flex flex-col">
      <CodeTabActionBar />
      <div className="flex min-h-[calc(100vh-160px)]">
        <LeftRail active={activeLeftPanel} onChange={setActiveLeftPanel} />
        {activeLeftPanel === 'files' ? <FilesPanel /> : <SearchPanel />}
        <div
          className="grid gap-4 p-4 flex-1 min-w-0"
          style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 0.8fr)' }}
        >
          <FileViewer
            files={files}
            selectedFilePath={selectedFilePath}
            searchQuery={searchQuery}
            searchResults={searchResults}
            busy={busy}
            hideHeader
            hideTree
            hideSearchResults
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
    </div>
  );
}
