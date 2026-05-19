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
    <div className="of-tiptap-editor" style={{ display: 'grid', gap: 0 }}>
      {editable && <EditorToolbar editor={editor} onAip={(snapshot) => setAip(snapshot)} />}
      <div
        style={{
          padding: '16px 18px',
          minHeight,
          background: editable ? 'var(--bg-panel)' : 'var(--bg-panel-muted)',
          borderTop: editable ? '1px solid var(--border-default)' : 0,
          fontSize: 15,
          lineHeight: 1.65,
          color: 'var(--text-strong)',
        }}
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
}

function EditorToolbar({ editor, onAip }: ToolbarProps) {
  const selectionEmpty = editor.state.selection.empty;
  const selectedText = selectionEmpty
    ? ''
    : editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        '\n',
        ' ',
      );
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '8px 10px',
        background: 'var(--bg-panel-muted)',
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)">
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)">
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (⌘U)">
        <span style={{ textDecoration: 'underline' }}>U</span>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
        {'</>'}
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">
        <span style={{ background: 'rgba(250, 204, 21, 0.55)', padding: '0 4px' }}>H</span>
      </ToolbarButton>
      <Divider />
      <ToolbarButton active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
        H1
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
        H2
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
        H3
      </ToolbarButton>
      <Divider />
      <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
        •
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered list">
        1.
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
        “”
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
        {'{}'}
      </ToolbarButton>
      <Divider />
      <ToolbarButton active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left">
        ⯇
      </ToolbarButton>
      <ToolbarButton active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align center">
        ≡
      </ToolbarButton>
      <ToolbarButton active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right">
        ⯈
      </ToolbarButton>
      <Divider />
      <ToolbarButton active={editor.isActive('link')} onClick={() => promptLink(editor)} title="Insert link">
        🔗
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        active={editor.isActive('table')}
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
        title="Insert 3×3 table"
      >
        ⊞
      </ToolbarButton>
      <ToolbarButton onClick={() => promptImage(editor)} title="Insert image">
        🖼
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setPageBreak().run()} title="Page break">
        ⤓
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setColumns(2).run()} title="Two columns">
        ⫴
      </ToolbarButton>
      <Divider />
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo (⌘Z)">
        ↶
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo (⇧⌘Z)">
        ↷
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        onClick={() => {
          if (selectionEmpty || !selectedText.trim()) return;
          onAip({
            from: editor.state.selection.from,
            to: editor.state.selection.to,
            text: selectedText,
          });
        }}
        title={selectionEmpty ? 'Select text first' : 'Edit with AIP'}
      >
        <span
          aria-hidden
          style={{
            color: selectionEmpty || !selectedText.trim() ? 'var(--text-muted)' : '#7c3aed',
            fontWeight: 700,
          }}
        >
          ✨
        </span>
      </ToolbarButton>
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
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ active, onClick, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        minWidth: 28,
        height: 28,
        padding: '0 8px',
        border: '1px solid transparent',
        borderRadius: 4,
        background: active ? 'var(--bg-panel)' : 'transparent',
        color: 'var(--text-strong)',
        fontSize: 13,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        margin: '2px 4px',
        background: 'var(--border-default)',
      }}
    />
  );
}
