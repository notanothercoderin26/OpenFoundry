import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api');

let monacoApiPromise: Promise<MonacoApi> | null = null;
function loadMonacoApi() {
  monacoApiPromise ??= import('monaco-editor/esm/vs/editor/editor.api');
  return monacoApiPromise;
}

interface MonacoDiffEditorProps {
  original: string;
  modified: string;
  language: string;
  minHeight?: number;
  renderSideBySide?: boolean;
  readOnly?: boolean;
}

/**
 * Thin wrapper around monaco.editor.createDiffEditor. Mirrors the
 * lifecycle of the existing MonacoEditor wrapper (lazy API load,
 * dispose on unmount, re-sync models when inputs change) but renders a
 * read-only side-by-side diff view by default. Used by the Code
 * Repositories File Changes helper and the Pull request "Files changed"
 * tab.
 */
export function MonacoDiffEditor({
  original,
  modified,
  language,
  minHeight = 320,
  renderSideBySide = true,
  readOnly = true,
}: MonacoDiffEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<{
    original: Monaco.editor.ITextModel;
    modified: Monaco.editor.ITextModel;
  } | null>(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      const monaco = await loadMonacoApi();
      if (disposed || !containerRef.current) return;

      const editor = monaco.editor.createDiffEditor(containerRef.current, {
        automaticLayout: true,
        fontSize: 13,
        readOnly,
        renderSideBySide,
        renderOverviewRuler: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        theme: 'vs',
      });

      const originalModel = monaco.editor.createModel(original, language);
      const modifiedModel = monaco.editor.createModel(modified, language);
      editor.setModel({ original: originalModel, modified: modifiedModel });

      editorRef.current = editor;
      modelsRef.current = { original: originalModel, modified: modifiedModel };
    })();

    return () => {
      disposed = true;
      modelsRef.current?.original.dispose();
      modelsRef.current?.modified.dispose();
      modelsRef.current = null;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const models = modelsRef.current;
    if (!models) return;
    if (models.original.getValue() !== original) models.original.setValue(original);
    if (models.modified.getValue() !== modified) models.modified.setValue(modified);
  }, [original, modified]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ renderSideBySide, readOnly });
  }, [renderSideBySide, readOnly]);

  return <div ref={containerRef} style={{ width: '100%', height: `max(${minHeight}px, 100%)`, minHeight }} />;
}
