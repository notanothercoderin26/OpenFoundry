import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoIdentity, useRepoState } from '../../../state/RepoContext';
import { useDirtyContent } from '../../../state/useOpenFiles';

type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api');

let monacoApiPromise: Promise<MonacoApi> | null = null;
function loadMonacoApi() {
  monacoApiPromise ??= import('monaco-editor/esm/vs/editor/editor.api');
  return monacoApiPromise;
}

interface DiffPaneProps {
  original: string;
  modified: string;
  language: string;
}

/**
 * Inline diff editor backed by monaco.editor.createDiffEditor. Mirrors
 * the lightweight lifecycle of the regular MonacoEditor wrapper but
 * skips the change/blur callbacks since the helper is read-only.
 */
function DiffPane({ original, modified, language }: DiffPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      const monaco = await loadMonacoApi();
      if (disposed || !containerRef.current) return;

      const editor = monaco.editor.createDiffEditor(containerRef.current, {
        automaticLayout: true,
        fontSize: 13,
        readOnly: true,
        renderSideBySide: true,
        renderOverviewRuler: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        theme: 'vs',
      });

      const originalModel = monaco.editor.createModel(original, language);
      const modifiedModel = monaco.editor.createModel(modified, language);
      editor.setModel({ original: originalModel, modified: modifiedModel });

      editorRef.current = editor;

      return () => {
        originalModel.dispose();
        modifiedModel.dispose();
        editor.dispose();
      };
    })();

    return () => {
      disposed = true;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sync models when the inputs change without recreating the editor.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    if (model.original.getValue() !== original) {
      model.original.setValue(original);
    }
    if (model.modified.getValue() !== modified) {
      model.modified.setValue(modified);
    }
  }, [original, modified]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/**
 * File Changes helper.
 *
 * For the active file we compute a diff between the committed content
 * (RepositoryFile.content) and the working content — the dirty buffer
 * from useOpenFiles when present, falling back to the same committed
 * content (no-op diff).
 *
 * The previous-versions navigator (older commits → restore button)
 * arrives once the backend ships GET /repositories/{id}/files/{path}/history
 * (master plan §10 B4). For Phase 1 we show a placeholder strip listing
 * the most recent commits that touched any file on the branch.
 */
export function FileChangesHelper() {
  const { selectedFile, currentBranch } = useRepoIdentity();
  const { commits } = useRepoState();
  const dirtyContent = useDirtyContent(selectedFile?.path ?? '');

  if (!selectedFile) {
    return (
      <div className="px-3 py-6 text-of-12 text-of-text-soft text-center">
        Open a file in the editor to see its changes against HEAD.
      </div>
    );
  }

  const original = selectedFile.content;
  const modified = dirtyContent ?? selectedFile.content;
  const hasChanges = modified !== original;
  const recentCommits = commits.slice(0, 6);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-of-border bg-of-surface-raised">
        <Glyph name="history" size={14} tone="muted" />
        <span className="text-of-13 font-of-semibold">File changes</span>
        <span className="text-of-12 text-of-text-soft font-mono truncate">
          {selectedFile.path}
        </span>
        <span aria-hidden className="text-of-text-soft">·</span>
        <span className="text-of-12 text-of-text-soft">
          {hasChanges ? 'pending edits vs HEAD' : 'no pending changes'}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_220px] flex-1 min-h-0">
        <div className="flex flex-col min-h-0">
          {hasChanges ? (
            <DiffPane original={original} modified={modified} language={selectedFile.language || 'text'} />
          ) : (
            <div className="flex-1 grid place-items-center text-of-12 text-of-text-soft">
              No diff to display — edit the file to compare against HEAD.
            </div>
          )}
        </div>

        <aside className="border-l border-of-border bg-of-surface">
          <div className="px-3 py-2 border-b border-of-border">
            <p className="text-of-12 font-of-semibold uppercase tracking-wider text-of-text-muted">
              Previous versions
            </p>
            <p className="mt-1 text-of-12 text-of-text-soft">
              Showing recent commits on {currentBranch}. Per-file history needs gap B4 to surface
              line-accurate older revisions.
            </p>
          </div>
          <ul className="overflow-auto divide-y divide-of-border">
            {recentCommits.length === 0 ? (
              <li className="px-3 py-3 text-of-12 text-of-text-soft">No commits yet.</li>
            ) : (
              recentCommits.map((commit) => (
                <li key={commit.id} className="px-3 py-2">
                  <p className="text-of-13 text-of-text truncate" title={commit.title}>
                    {commit.title}
                  </p>
                  <p className="mt-0.5 text-of-12 text-of-text-soft font-mono truncate">
                    {commit.sha.slice(0, 8)} · {commit.author_name || 'unknown'}
                  </p>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}
