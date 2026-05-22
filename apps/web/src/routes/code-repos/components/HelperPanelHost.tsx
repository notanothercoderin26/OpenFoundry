import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';

import { helperPanels, useHelperPanels, type HelperPanelId } from '../state/useHelperPanels';
import { BuildHelper } from '../tabs/CodeTab/helpers/BuildHelper';
import { DebuggerHelper } from '../tabs/CodeTab/helpers/DebuggerHelper';
import { DocsHelper } from '../tabs/CodeTab/helpers/DocsHelper';
import { FileChangesHelper } from '../tabs/CodeTab/helpers/FileChangesHelper';
import { FoundryExplorerHelper } from '../tabs/CodeTab/helpers/FoundryExplorerHelper';
import { PreviewHelper } from '../tabs/CodeTab/helpers/PreviewHelper';
import { ProblemsHelper } from '../tabs/CodeTab/helpers/ProblemsHelper';
import { SqlScratchpadHelper } from '../tabs/CodeTab/helpers/SqlScratchpadHelper';
import { TestsHelper } from '../tabs/CodeTab/helpers/TestsHelper';

interface HelperDescriptor {
  id: HelperPanelId;
  label: string;
  glyph: GlyphName;
  render: () => ReactNode;
}

const HELPERS: ReadonlyArray<HelperDescriptor> = [
  { id: 'foundry-explorer', label: 'Foundry Explorer', glyph: 'database', render: () => <FoundryExplorerHelper /> },
  { id: 'problems', label: 'Problems', glyph: 'circle-x', render: () => <ProblemsHelper /> },
  { id: 'debugger', label: 'Debugger', glyph: 'eye', render: () => <DebuggerHelper /> },
  { id: 'preview', label: 'Preview', glyph: 'run', render: () => <PreviewHelper /> },
  { id: 'tests', label: 'Tests', glyph: 'badge-check', render: () => <TestsHelper /> },
  { id: 'file-changes', label: 'File Changes', glyph: 'history', render: () => <FileChangesHelper /> },
  { id: 'build', label: 'Build', glyph: 'pipeline', render: () => <BuildHelper /> },
  { id: 'docs', label: 'Docs', glyph: 'book-open', render: () => <DocsHelper /> },
  { id: 'sql', label: 'SQL', glyph: 'query', render: () => <SqlScratchpadHelper /> },
];

/**
 * The bottom dock for the Code Repositories IDE. Mirrors Foundry's
 * helper strip: nine tabs, an active helper, a vertical drag handle to
 * resize, and a collapse button on the right. Size is persisted in
 * localStorage by the useHelperPanels store.
 */
export function HelperPanelHost() {
  const { active, collapsed, height } = useHelperPanels();
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(height);

  const activeDescriptor = HELPERS.find((helper) => helper.id === active) ?? null;

  // Drag-to-resize: capture the initial coordinates, then mutate height
  // as the cursor moves. We use document listeners so the drag continues
  // even if the cursor escapes the resize handle.
  useEffect(() => {
    if (!dragging) return;

    function handleMove(event: MouseEvent) {
      const delta = startYRef.current - event.clientY;
      helperPanels.setHeight(startHeightRef.current + delta);
    }
    function handleUp() {
      setDragging(false);
    }

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  function handleStartDrag(event: React.MouseEvent<HTMLDivElement>) {
    if (collapsed) return;
    event.preventDefault();
    startYRef.current = event.clientY;
    startHeightRef.current = height;
    setDragging(true);
  }

  const bodyHeight = collapsed ? 0 : height;

  return (
    <section
      aria-label="Bottom helper panel"
      className="flex flex-col shrink-0 border-t border-of-border bg-of-surface-raised"
      style={{ height: collapsed ? 34 : 34 + height }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        onMouseDown={handleStartDrag}
        title={collapsed ? 'Expand helper panel to resize' : 'Drag to resize'}
        className={`h-1 ${collapsed ? 'cursor-default' : 'cursor-row-resize'} ${
          dragging ? 'bg-of-accent' : 'bg-transparent hover:bg-of-border'
        }`}
      />

      <div className="flex items-center h-8 px-2 border-b border-of-border bg-of-surface-raised overflow-x-auto">
        {HELPERS.map((helper) => {
          const isActive = helper.id === active && !collapsed;
          return (
            <button
              key={helper.id}
              type="button"
              onClick={() => helperPanels.toggle(helper.id)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-of-sm text-of-12 font-of-medium whitespace-nowrap ${
                isActive
                  ? 'bg-of-accent-soft text-of-accent'
                  : 'text-of-text-muted hover:bg-of-surface-muted hover:text-of-text'
              }`}
            >
              <Glyph name={helper.glyph} size={12} tone="currentColor" />
              {helper.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-0.5">
          {!collapsed ? (
            <button
              type="button"
              title="Collapse panel"
              aria-label="Collapse panel"
              onClick={() => helperPanels.collapse()}
              className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            >
              <Glyph name="chevron-down" size={12} tone="currentColor" />
            </button>
          ) : null}
        </div>
      </div>

      {!collapsed && activeDescriptor ? (
        <div className="flex-1 min-h-0 overflow-hidden" style={{ height: bodyHeight }}>
          {activeDescriptor.render()}
        </div>
      ) : null}
    </section>
  );
}
