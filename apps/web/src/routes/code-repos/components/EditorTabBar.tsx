import { useState, type DragEvent, type MouseEvent } from 'react';

import { Glyph, type GlyphName } from '@/lib/components/ui/Glyph';
import { notifications } from '@stores/notifications';

import { openFiles, useOpenFiles } from '../state/useOpenFiles';

function languageGlyph(language?: string): GlyphName {
  switch (language) {
    case 'json':
      return 'spreadsheet';
    case 'sql':
      return 'database';
    case 'markdown':
      return 'document';
    case 'yaml':
    case 'yml':
      return 'cube';
    case 'python':
    case 'r':
    case 'javascript':
    case 'typescript':
    case 'java':
    case 'go':
    case 'rust':
      return 'code';
    default:
      return 'document';
  }
}

function basename(path: string) {
  return path.split('/').at(-1) ?? path;
}

/**
 * Foundry / VS Code style editor tab strip:
 *
 *   🏠  | document.py × | spreadsheet.json × | …
 *
 * Tabs in italic until pinned (double-click anywhere on the tab pins
 * them). Drag a tab over another to reorder. The leading Home button
 * closes every tab and surfaces the EditorHomeView; useOpenFiles.close
 * already guards against losing dirty content via clearDirty so closing
 * a clean tab is unconditional.
 */
export function EditorTabBar() {
  const { openFiles: tabs, activePath, dirty } = useOpenFiles();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tabs[index].path);
      setDragIndex(index);
    };
  }

  function handleDragOver(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      if (dragIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (dropIndex !== index) setDropIndex(index);
    };
  }

  function handleDrop(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        openFiles.reorder(dragIndex, index);
      }
      setDragIndex(null);
      setDropIndex(null);
    };
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDropIndex(null);
  }

  function handleClose(event: MouseEvent<HTMLButtonElement>, path: string) {
    event.stopPropagation();
    if (dirty[path] && !window.confirm(`Discard unsaved changes in ${path}?`)) return;
    openFiles.close(path);
  }

  function handleDoubleClick(path: string) {
    const tab = tabs.find((entry) => entry.path === path);
    if (tab && !tab.pinned) {
      openFiles.pin(path);
    } else {
      // Split-view is on the F2 roadmap; surface a hint so users know.
      notifications.info('Split-view editor ships in Phase 2');
    }
  }

  return (
    <div className="flex items-stretch h-9 border-b border-of-border bg-of-surface">
      <button
        type="button"
        title="Home — close all tabs"
        aria-label="Home — close all tabs"
        onClick={() => openFiles.closeAll()}
        className={`inline-flex items-center justify-center w-9 h-9 border-r border-of-border ${
          tabs.length === 0
            ? 'text-of-accent bg-of-accent-soft'
            : 'text-of-text-muted hover:bg-of-surface-muted hover:text-of-text'
        }`}
      >
        <Glyph name="home" size={14} tone="currentColor" />
      </button>

      <div className="flex items-stretch overflow-x-auto min-w-0">
        {tabs.map((tab, index) => {
          const active = tab.path === activePath;
          const isDirty = tab.path in dirty;
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <div
              key={tab.path}
              draggable
              onDragStart={handleDragStart(index)}
              onDragOver={handleDragOver(index)}
              onDrop={handleDrop(index)}
              onDragEnd={handleDragEnd}
              onClick={() => openFiles.setActive(tab.path)}
              onDoubleClick={() => handleDoubleClick(tab.path)}
              role="tab"
              aria-selected={active}
              title={tab.path}
              className={`group relative inline-flex items-center gap-1.5 h-9 px-2.5 border-r border-of-border cursor-pointer select-none ${
                active ? 'bg-of-surface-raised text-of-text' : 'bg-of-surface text-of-text-muted hover:bg-of-surface-muted'
              } ${isDropTarget ? 'border-l-2 border-l-of-accent' : ''}`}
            >
              <Glyph name={languageGlyph(tab.language)} size={12} tone="muted" />
              <span
                className={`text-of-12 ${tab.pinned ? '' : 'italic'} truncate max-w-[180px]`}
              >
                {basename(tab.path)}
              </span>
              {isDirty ? (
                <span
                  aria-label="Unsaved"
                  title="Unsaved changes"
                  className="w-1.5 h-1.5 rounded-full bg-of-accent"
                />
              ) : null}
              <button
                type="button"
                aria-label={`Close ${tab.path}`}
                onClick={(event) => handleClose(event, tab.path)}
                className="inline-flex items-center justify-center w-4 h-4 rounded-of-sm text-of-text-soft hover:bg-of-surface-raised hover:text-of-text opacity-60 group-hover:opacity-100"
              >
                <Glyph name="x" size={10} tone="currentColor" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
