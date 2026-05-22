import { useEffect, useState } from 'react';

import { DiffViewer } from '@/lib/components/code-repo/DiffViewer';

import { CodeTabActionBar } from '../../components/CodeTabActionBar';
import { EditorHomeView } from '../../components/EditorHomeView';
import { EditorPanel } from '../../components/EditorPanel';
import { EditorTabBar } from '../../components/EditorTabBar';
import { FilesPanel } from '../../components/FilesPanel';
import { LeftRail, type LeftPanelId } from '../../components/LeftRail';
import { SearchPanel } from '../../components/SearchPanel';
import { useRepoState } from '../../state/RepoContext';
import { openFiles, useActivePath, useOpenFiles } from '../../state/useOpenFiles';

/**
 * Foundry IDE layout for the Code tab:
 *
 *   [           Action bar (full width)                ]
 *   [ Rail | (Files|Search) | EditorTabBar           | DiffViewer ]
 *                              EditorPanel / Home
 *
 * The middle column drives the multi-tab editor: tabs come from
 * useOpenFiles, content from useRepoState.files (with dirty overlay), and
 * persistence from saveFileAction on blur. When no tabs are open the
 * EditorHomeView shows a Foundry-style dashboard for the repository.
 */
export function CodeTab() {
  const {
    selectedFilePath,
    branchOptions,
    diffBranch,
    diffPatch,
    busy,
    refreshDiff,
    setPendingFileChanges,
    files,
  } = useRepoState();

  const [activeLeftPanel, setActiveLeftPanel] = useState<LeftPanelId>('files');
  const activePath = useActivePath();
  const { dirty, openFiles: openTabs } = useOpenFiles();

  // Forward every dirty file in useOpenFiles into pendingFileChanges so
  // the Commit dialog and the status bar dirty count stay accurate.
  useEffect(() => {
    const entries = Object.entries(dirty).map(([path, content]) => {
      const file = files.find((entry) => entry.path === path);
      return {
        action: 'save' as const,
        path,
        content,
        branch_name: file?.branch_name,
      };
    });
    setPendingFileChanges(entries);
  }, [dirty, files, setPendingFileChanges]);

  // First file becomes the implicit "open tab" once data is loaded so the
  // editor is never blank for an empty session.
  useEffect(() => {
    const snapshot = openFiles.getSnapshot();
    if (snapshot.openFiles.length > 0) return;
    if (selectedFilePath) {
      const file = files.find((entry) => entry.path === selectedFilePath);
      openFiles.open(selectedFilePath, file?.language);
      return;
    }
    const fallback = files[0];
    if (fallback) {
      openFiles.open(fallback.path, fallback.language);
    }
  }, [selectedFilePath, files]);

  const hasTabs = openTabs.length > 0;

  return (
    <div className="flex flex-col">
      <CodeTabActionBar />
      <div className="flex min-h-[calc(100vh-180px)]">
        <LeftRail active={activeLeftPanel} onChange={setActiveLeftPanel} />
        {activeLeftPanel === 'files' ? <FilesPanel /> : <SearchPanel />}

        <div className="flex flex-col flex-1 min-w-0 border-r border-of-border">
          <EditorTabBar />
          {hasTabs && activePath ? (
            <EditorPanel />
          ) : (
            <EditorHomeView />
          )}
        </div>

        <aside className="w-[36%] min-w-[280px] max-w-[520px] p-4 overflow-auto">
          <DiffViewer
            availableBranches={branchOptions}
            branchName={diffBranch}
            patch={diffPatch}
            busy={busy}
            onSelectBranch={(branch) => void refreshDiff(branch)}
          />
        </aside>
      </div>
    </div>
  );
}
