import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { useEffect, useRef, useState } from 'react';

import { DropdownMenu, type DropdownMenuItem } from '@/lib/components/ui/DropdownMenu';
import { Glyph } from '@/lib/components/ui/Glyph';

import { Column, Columns, PageBreak } from './TipTapNodes';
import { SlashCommand } from './SlashCommand';
import { Embed } from './EmbedNode';
import { AIPPopover } from './AIPPopover';

export interface TipTapEditorProps {
  initialContent?: object | null;
  placeholder?: string;
  minHeight?: number;
  editable?: boolean;
  onChange?: (payload: { json: object; html: string }) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onEditorReady?: (editor: Editor) => void;
  // Toolbar bindings (T5.1). When the parent owns the version history
  // panel, pass these so the toolbar's history icon can toggle it.
  onToggleHistory?: () => void;
  historyOpen?: boolean;
  // Stub for the gear icon in the toolbar; opens an editor-settings
  // surface when the parent wants to handle it.
  onOpenSettings?: () => void;
}

const DEFAULT_DOC: object = { type: 'doc', content: [{ type: 'paragraph' }] };

export function TipTapEditor({
  initialContent,
  placeholder,
  minHeight = 480,
  editable = true,
  onChange,
  onFocus,
  onBlur,
  onEditorReady,
  onToggleHistory,
  historyOpen,
  onOpenSettings,
}: TipTapEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Hand off heading level coverage to StarterKit (default H1-H6
        // is fine for our subset; only H1-H3 are emitted by the toolbar).
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder ?? 'Type "/" for commands or paste an image' }),
      Table.configure({ resizable: true, HTMLAttributes: { class: 'of-tiptap-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true, HTMLAttributes: { class: 'of-tiptap-image' } }),
      PageBreak,
      Columns,
      Column,
      Embed,
      SlashCommand,
    ],
    content: initialContent ?? DEFAULT_DOC,
    editable,
    immediatelyRender: false, // SSR-safe and avoids hydration flicker in dev.
    editorProps: {
      // Accept dropped or pasted image files by reading them as base64
      // and inserting them as data URIs. Real uploads will route
      // through media-sets-service in a follow-up slice; data URIs
      // keep things working for v1 and survive DOCX/PDF export.
      handleDrop(view, event) {
        const files = (event as DragEvent).dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'));
        if (!imageFile) return false;
        event.preventDefault();
        void readImageFileAsDataUrl(imageFile).then((url) => {
          const { state } = view;
          const node = state.schema.nodes.image.create({ src: url });
          view.dispatch(state.tr.replaceSelectionWith(node));
        });
        return true;
      },
      handlePaste(view, event) {
        const items = (event as ClipboardEvent).clipboardData?.items;
        if (!items) return false;
        const imageItem = Array.from(items).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
        if (!imageItem) return false;
        const file = imageItem.getAsFile();
        if (!file) return false;
        event.preventDefault();
        void readImageFileAsDataUrl(file).then((url) => {
          const { state } = view;
          const node = state.schema.nodes.image.create({ src: url });
          view.dispatch(state.tr.replaceSelectionWith(node));
        });
        return true;
      },
    },
    onUpdate({ editor }) {
      onChangeRef.current?.({ json: editor.getJSON(), html: editor.getHTML() });
    },
    onFocus,
    onBlur,
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // Toggle read-only mode without remounting the editor.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // Reconcile the editor when the initial content prop changes (e.g.
  // the user loads a different document, or previews a past revision).
  // We intentionally skip the first run — useEditor already seeds with
  // initialContent.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!editor) return;
    if (!seededRef.current) {
      seededRef.current = true;
      return;
    }
    if (initialContent) editor.commands.setContent(initialContent, { emitUpdate: false });
  }, [editor, initialContent]);

  // AIP modal state. Captured when the user clicks "Edit with AIP"
  // so the replace path can re-target the exact range later even if
  // the selection has shifted.
  const [aip, setAip] = useState<{ from: number; to: number; text: string } | null>(null);

  if (!editor) return null;

  return (
    <div className="of-tiptap-editor of-tiptap-shell">
      {editable && (
        <EditorToolbar
          editor={editor}
          onAip={(snapshot) => setAip(snapshot)}
          onToggleHistory={onToggleHistory}
          historyOpen={historyOpen}
          onOpenSettings={onOpenSettings}
        />
      )}
      <div
        className="of-tiptap-content"
        data-readonly={editable ? undefined : 'true'}
        style={{ minHeight }}
        onClick={() => editable && editor.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .of-tiptap-editor .ProseMirror { outline: none; min-height: 100%; }
        .of-tiptap-editor .ProseMirror h1 { font-size: 28px; font-weight: 700; margin: 12px 0 8px; }
        .of-tiptap-editor .ProseMirror h2 { font-size: 22px; font-weight: 700; margin: 14px 0 8px; }
        .of-tiptap-editor .ProseMirror h3 { font-size: 18px; font-weight: 700; margin: 12px 0 6px; }
        .of-tiptap-editor .ProseMirror p  { margin: 6px 0; }
        .of-tiptap-editor .ProseMirror ul, .of-tiptap-editor .ProseMirror ol { padding-left: 22px; margin: 8px 0; }
        .of-tiptap-editor .ProseMirror blockquote {
          border-left: 3px solid var(--border-default);
          padding: 4px 12px;
          color: var(--text-muted);
          font-style: italic;
          margin: 12px 0;
        }
        .of-tiptap-editor .ProseMirror code {
          background: var(--bg-panel-muted);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.92em;
        }
        .of-tiptap-editor .ProseMirror pre {
          background: var(--bg-panel-muted);
          padding: 12px 14px;
          border-radius: 6px;
          overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 13px;
        }
        .of-tiptap-editor .ProseMirror a { color: var(--text-link, #0f766e); text-decoration: underline; }
        .of-tiptap-editor .ProseMirror mark { background: rgba(250, 204, 21, 0.35); }
        .of-tiptap-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--text-muted);
          pointer-events: none;
          height: 0;
        }
        .of-tiptap-editor .ProseMirror table {
          border-collapse: collapse;
          margin: 12px 0;
          width: 100%;
          table-layout: fixed;
          overflow: hidden;
        }
        .of-tiptap-editor .ProseMirror table td,
        .of-tiptap-editor .ProseMirror table th {
          border: 1px solid var(--border-default);
          padding: 6px 10px;
          vertical-align: top;
          min-width: 60px;
          position: relative;
        }
        .of-tiptap-editor .ProseMirror table th {
          background: var(--bg-panel-muted);
          font-weight: 600;
        }
        .of-tiptap-editor .ProseMirror table .selectedCell::after {
          background: rgba(15, 118, 110, 0.15);
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .of-tiptap-editor .ProseMirror img.of-tiptap-image {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          display: block;
          margin: 12px 0;
        }
        .of-tiptap-editor .ProseMirror img.of-tiptap-image.ProseMirror-selectednode {
          outline: 2px solid var(--text-link, #0f766e);
        }
        .of-tiptap-editor .ProseMirror div.of-page-break {
          margin: 18px 0;
          height: 1px;
          background: repeating-linear-gradient(90deg, var(--border-default) 0 8px, transparent 8px 16px);
          position: relative;
        }
        .of-tiptap-editor .ProseMirror div.of-page-break::after {
          content: "Page break";
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--bg-panel);
          color: var(--text-muted);
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          padding: 0 8px;
        }
        .of-tiptap-editor .ProseMirror div.of-columns {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
          gap: 16px;
          margin: 12px 0;
        }
        .of-tiptap-editor .ProseMirror div.of-column {
          border: 1px dashed var(--border-default);
          border-radius: 4px;
          padding: 8px 10px;
          min-height: 60px;
        }
      `}</style>
      {aip && (
        <AIPPopover
          sourceText={aip.text}
          onClose={() => setAip(null)}
          onReplace={(replacement) => {
            editor
              .chain()
              .focus()
              .insertContentAt({ from: aip.from, to: aip.to }, replacement)
              .run();
            setAip(null);
          }}
        />
      )}
    </div>
  );
}

interface ToolbarProps {
  editor: Editor;
  onAip: (snapshot: { from: number; to: number; text: string }) => void;
  onToggleHistory?: () => void;
  historyOpen?: boolean;
  onOpenSettings?: () => void;
}

function currentBlockLabel(editor: Editor): string {
  if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
  if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
  if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
  if (editor.isActive('blockquote')) return 'Quote';
  if (editor.isActive('codeBlock')) return 'Code block';
  if (editor.isActive('bulletList')) return 'Bullet list';
  if (editor.isActive('orderedList')) return 'Numbered list';
  return 'Paragraph';
}

function EditorToolbar({ editor, onAip, onToggleHistory, historyOpen, onOpenSettings }: ToolbarProps) {
  const selectionEmpty = editor.state.selection.empty;
  const selectedText = selectionEmpty
    ? ''
    : editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        '\n',
        ' ',
      );
  // Visual-only state until we add @tiptap/extension-font-size in a
  // follow-up. The input value is captured here so the UI is complete.
  const [fontSize, setFontSize] = useState(15);
  const [blockView, setBlockView] = useState(false);

  const blockItems: DropdownMenuItem[] = [
    { kind: 'item', key: 'p', label: 'Paragraph', onClick: () => editor.chain().focus().setParagraph().run() },
    { kind: 'item', key: 'h1', label: 'Heading 1', onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { kind: 'item', key: 'h2', label: 'Heading 2', onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { kind: 'item', key: 'h3', label: 'Heading 3', onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { kind: 'separator' },
    { kind: 'item', key: 'quote', label: 'Quote', onClick: () => editor.chain().focus().toggleBlockquote().run() },
    { kind: 'item', key: 'code-block', label: 'Code block', onClick: () => editor.chain().focus().toggleCodeBlock().run() },
    { kind: 'separator' },
    { kind: 'item', key: 'bullet', label: 'Bullet list', onClick: () => editor.chain().focus().toggleBulletList().run() },
    { kind: 'item', key: 'numbered', label: 'Numbered list', onClick: () => editor.chain().focus().toggleOrderedList().run() },
  ];

  const widgetItems: DropdownMenuItem[] = [
    { kind: 'item', key: 'image', label: 'Image', icon: 'image', onClick: () => promptImage(editor) },
    {
      kind: 'item',
      key: 'table',
      label: 'Table',
      onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    { kind: 'item', key: 'columns', label: 'Two columns', onClick: () => editor.chain().focus().setColumns(2).run() },
    { kind: 'item', key: 'pagebreak', label: 'Page break', onClick: () => editor.chain().focus().setPageBreak().run() },
  ];

  const aipReady = !selectionEmpty && selectedText.trim().length > 0;
  const actionItems: DropdownMenuItem[] = [
    { kind: 'item', key: 'undo', label: 'Undo', icon: 'undo', shortcut: '⌘Z', onClick: () => editor.chain().focus().undo().run() },
    { kind: 'item', key: 'redo', label: 'Redo', icon: 'undo', shortcut: '⇧⌘Z', onClick: () => editor.chain().focus().redo().run() },
    { kind: 'separator' },
    {
      kind: 'item',
      key: 'aip',
      label: aipReady ? 'Edit selection with AIP' : 'Edit with AIP (select text first)',
      icon: 'sparkles',
      disabled: !aipReady,
      onClick: () => {
        if (!aipReady) return;
        onAip({
          from: editor.state.selection.from,
          to: editor.state.selection.to,
          text: selectedText,
        });
      },
    },
  ];

  return (
    <div className="of-tiptap-toolbar" role="toolbar" aria-label="Editor toolbar">
      <DropdownMenu
        label={
          <>
            <span>{currentBlockLabel(editor)}</span>
            <Glyph name="chevron-down" size={11} />
          </>
        }
        items={blockItems}
        triggerClassName="of-tiptap-toolbar__block-trigger"
      />

      <FontSizeControl
        value={fontSize}
        onChange={setFontSize}
        // TODO(T5.x): apply via TextStyle / extension-font-size once
        // the extension is added — currently captured but not applied.
      />

      <span className="of-tiptap-toolbar__divider" aria-hidden="true" />

      <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)">
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)">
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)">
        <span style={{ textDecoration: 'underline' }}>U</span>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
        {'</>'}
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </ToolbarButton>

      <span className="of-tiptap-toolbar__divider" aria-hidden="true" />

      <ToolbarButton active={editor.isActive('link')} onClick={() => promptLink(editor)} title="Insert link">
        <Glyph name="link" size={14} />
      </ToolbarButton>
      <ToolbarButton
        className="of-tiptap-toolbar__swatch"
        title="Text color (coming soon)"
        // TODO(T5.x): swatch popover wired to TextStyle/Color.
        style={{ ['--swatch-color' as string]: '#1c2127' }}
      >
        A
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('highlight')}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        title="Highlight"
        className="of-tiptap-toolbar__swatch"
        style={{ ['--swatch-color' as string]: '#facc15' }}
      >
        H
      </ToolbarButton>

      <span className="of-tiptap-toolbar__divider" aria-hidden="true" />

      <ToolbarButton
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        title="Align left"
      >
        <Glyph name="align-left" size={14} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        title="Align center"
      >
        <Glyph name="align-center" size={14} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        title="Align right"
      >
        <Glyph name="align-right" size={14} />
      </ToolbarButton>

      <span className="of-tiptap-toolbar__divider" aria-hidden="true" />

      <DropdownMenu
        label={
          <>
            <Glyph name="plus" size={13} />
            <span>Widget</span>
          </>
        }
        items={widgetItems}
        triggerClassName="of-tiptap-toolbar__btn of-tiptap-toolbar__widget"
      />
      <ToolbarButton
        active={blockView}
        onClick={() => setBlockView((open) => !open)}
        title={blockView ? 'Exit block view' : 'Enter block view'}
        // TODO(T5.x): toggle a real `.is-block-view` class on the
        // editor wrapper that surfaces block boundaries.
      >
        <Glyph name="view-grid" size={14} />
      </ToolbarButton>

      <div className="of-tiptap-toolbar__right">
        <span className="of-tiptap-toolbar__status" title="Connected to autosave channel">
          <span className="of-tiptap-toolbar__status-dot" aria-hidden="true" />
          <span>Connected</span>
        </span>
        <ToolbarButton
          active={Boolean(historyOpen)}
          onClick={() => onToggleHistory?.()}
          disabled={!onToggleHistory}
          title="Version history"
        >
          <Glyph name="history" size={14} />
        </ToolbarButton>
        <DropdownMenu
          label={
            <>
              <span>Actions</span>
              <Glyph name="chevron-down" size={11} />
            </>
          }
          items={actionItems}
          triggerClassName="of-tiptap-toolbar__block-trigger"
          align="right"
        />
        <ToolbarButton
          onClick={() => onOpenSettings?.()}
          disabled={!onOpenSettings}
          title="Editor settings"
        >
          <Glyph name="settings" size={14} />
        </ToolbarButton>
      </div>
    </div>
  );
}

interface FontSizeControlProps {
  value: number;
  onChange: (next: number) => void;
}

function FontSizeControl({ value, onChange }: FontSizeControlProps) {
  function step(delta: number) {
    const next = Math.max(8, Math.min(72, value + delta));
    onChange(next);
  }
  return (
    <div className="of-tiptap-toolbar__fontsize" title="Font size">
      <input
        type="number"
        min={8}
        max={72}
        value={value}
        onChange={(event) => {
          const parsed = parseInt(event.target.value || '15', 10);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        aria-label="Font size"
      />
      <div className="of-tiptap-toolbar__fontsize-steps">
        <button type="button" onClick={() => step(1)} aria-label="Increase font size">
          ▲
        </button>
        <button type="button" onClick={() => step(-1)} aria-label="Decrease font size">
          ▼
        </button>
      </div>
    </div>
  );
}

function promptLink(editor: Editor) {
  const current = editor.getAttributes('link')?.href as string | undefined;
  const url = window.prompt('Link URL (leave blank to remove)', current ?? '');
  if (url === null) return;
  if (url === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

function promptImage(editor: Editor) {
  const url = window.prompt(
    'Image URL or data URI. Paste / drag-drop also works for inline upload.',
  );
  if (!url) return;
  editor.chain().focus().setImage({ src: url }).run();
}

interface ToolbarButtonProps {
  active?: boolean;
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function ToolbarButton({ active, onClick, title, disabled, className, style, children }: ToolbarButtonProps) {
  const composed = ['of-tiptap-toolbar__btn', active ? 'is-active' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={composed}
      style={style}
    >
      {children}
    </button>
  );
}
