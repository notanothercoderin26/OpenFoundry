import { useEffect, useMemo, useRef } from 'react';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

import type { RepositoryFile } from '@/lib/api/code-repos';
import { MonacoEditor } from '@/lib/components/MonacoEditor';
import { Glyph } from '@/lib/components/ui/Glyph';

import { useRepoState } from '../state/RepoContext';
import {
  openFiles,
  useActivePath,
  useBreakpoints,
  useDirtyContent,
  useExecutionLine,
} from '../state/useOpenFiles';

interface EditorPanelProps {
  /**
   * Optional minHeight override; the editor expands to fill its container,
   * but Monaco needs a sensible minimum so the layout does not collapse on
   * narrow viewports.
   */
  minHeight?: number;
}

function findFile(files: ReadonlyArray<RepositoryFile>, path: string) {
  return files.find((file) => file.path === path) ?? null;
}

/**
 * Multi-tab Monaco editor for the Code Repositories IDE.
 *
 *   • Watches useOpenFiles.activePath to decide which file is on screen.
 *   • Reads pending edits from useOpenFiles.dirty so switching tabs and
 *     coming back preserves uncommitted work.
 *   • On change → markDirty(path, content) so the tab strip's dot, the
 *     status bar counter, and the Commit dialog stay in sync.
 *   • On blur → persist through saveFileAction (the existing Phase 0
 *     handler) and clear the dirty flag.
 *   • Enables Monaco's glyph margin and translates clicks into breakpoint
 *     toggles persisted in useOpenFiles (in-memory only — see master plan
 *     §6 for the eventual debugger backend).
 *   • Highlights the execution line — useful once the debugger ships.
 */
export function EditorPanel({ minHeight = 480 }: EditorPanelProps) {
  const { files, saveFileAction } = useRepoState();
  const activePath = useActivePath();
  const dirtyContent = useDirtyContent(activePath);
  const breakpoints = useBreakpoints(activePath);
  const executionLine = useExecutionLine();

  const activeFile = useMemo(() => findFile(files, activePath), [files, activePath]);
  const value = dirtyContent ?? activeFile?.content ?? '';
  const language = activeFile?.language ?? 'text';

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const handlersRef = useRef({ activePath: '' });

  // Keep the latest active path inside the editor mouse handler. We attach
  // the mouse listener once on mount; re-running it on every active-path
  // change would tear down and rebuild the listener for every tab switch.
  useEffect(() => {
    handlersRef.current.activePath = activePath;
  }, [activePath]);

  function applyDecorations() {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const decorations: Monaco.editor.IModelDeltaDecoration[] = breakpoints.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'of-monaco-breakpoint',
        glyphMarginHoverMessage: { value: `Breakpoint at line ${line}` },
      },
    }));

    if (executionLine && executionLine.path === activePath) {
      decorations.push({
        range: new monaco.Range(executionLine.line, 1, executionLine.line, 1),
        options: {
          isWholeLine: true,
          className: 'of-monaco-execution-line',
          glyphMarginClassName: 'of-monaco-execution-glyph',
        },
      });
    }

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
  }

  // Re-apply decorations whenever breakpoints / execution line / active
  // path change.
  useEffect(() => {
    applyDecorations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpoints, executionLine, activePath]);

  function handleMount(editor: Monaco.editor.IStandaloneCodeEditor) {
    editorRef.current = editor;
    void import('monaco-editor/esm/vs/editor/editor.api').then((monaco) => {
      monacoRef.current = monaco;
      editor.updateOptions({ glyphMargin: true });
      applyDecorations();
    });

    editor.onMouseDown((event) => {
      // Glyph margin (id 2) is the column where breakpoints live.
      if (event.target.type !== 2) return;
      const line = event.target.position?.lineNumber;
      if (!line) return;
      const path = handlersRef.current.activePath;
      if (!path) return;
      openFiles.toggleBreakpoint(path, line);
    });
  }

  if (!activePath || !activeFile) {
    return null;
  }

  return (
    <div data-tour="editor" className="flex flex-col flex-1 min-h-0">
      <FileMetaBar file={activeFile} />
      <div className="flex-1 min-h-0 border border-of-border bg-of-surface-raised">
        <MonacoEditor
          value={value}
          language={language}
          minHeight={minHeight}
          onMount={handleMount}
          onChange={(next) => openFiles.markDirty(activePath, next)}
          onBlur={async (next) => {
            const file = findFile(files, activePath);
            if (!file) return;
            const content = next ?? value;
            // Persist only if the content actually differs from the
            // server-side version; otherwise skip the round-trip.
            if (content === file.content) {
              openFiles.clearDirty(activePath);
              return;
            }
            openFiles.markSaving(activePath);
            try {
              await saveFileAction(file, content);
              openFiles.clearDirty(activePath);
            } finally {
              openFiles.markSaved(activePath);
            }
          }}
        />
      </div>
    </div>
  );
}

function FileMetaBar({ file }: { file: RepositoryFile }) {
  return (
    <div className="flex items-center gap-3 h-7 px-3 border-b border-of-border bg-of-surface text-of-12 text-of-text-muted">
      <Glyph name="document" size={12} tone="muted" />
      <span className="font-mono text-of-text truncate">{file.path}</span>
      <span aria-hidden className="text-of-text-soft">·</span>
      <span>{file.language || 'plain'}</span>
      <span aria-hidden className="text-of-text-soft">·</span>
      <span>commit {file.last_commit_sha?.slice(0, 8) || 'unstaged'}</span>
    </div>
  );
}
