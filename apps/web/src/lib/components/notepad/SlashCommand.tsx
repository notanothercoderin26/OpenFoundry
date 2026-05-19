// Slash-command suggestion built on @tiptap/suggestion + tippy.js.
// Triggers when the user types `/`; renders a floating searchable
// menu next to the cursor and runs the chosen ProseMirror command on
// Enter / click.

import { Extension, type Range, type Editor } from '@tiptap/core';
import Suggestion, { type SuggestionOptions, type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';

export interface SlashCommandItem {
  title: string;
  description?: string;
  keywords?: string[];
  icon?: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    title: 'Heading 1',
    description: 'Top-level section title',
    keywords: ['h1', 'title'],
    icon: 'H1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run();
    },
  },
  {
    title: 'Heading 2',
    description: 'Subsection title',
    keywords: ['h2'],
    icon: 'H2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Heading 3',
    description: 'Tertiary heading',
    keywords: ['h3'],
    icon: 'H3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: 'Bullet list',
    description: 'Unordered list',
    keywords: ['ul', 'list', 'bullet'],
    icon: '•',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Ordered list',
    description: 'Numbered list',
    keywords: ['ol', 'numbered'],
    icon: '1.',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Quote',
    description: 'Blockquote with a left rule',
    keywords: ['blockquote', 'quote'],
    icon: '“”',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: 'Code block',
    description: 'Monospaced code block',
    keywords: ['code', 'pre'],
    icon: '{}',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Table',
    description: 'Insert a 3×3 table with a header row',
    keywords: ['table', 'grid'],
    icon: '⊞',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: 'Image',
    description: 'Insert an image from a URL',
    keywords: ['image', 'picture', 'photo'],
    icon: '🖼',
    command: ({ editor, range }) => {
      const url = window.prompt('Image URL');
      if (!url) return;
      editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
    },
  },
  {
    title: 'Page break',
    description: 'Force a new page when exporting to PDF / DOCX',
    keywords: ['page', 'break', 'pdf', 'docx'],
    icon: '⤓',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setPageBreak().run();
    },
  },
  {
    title: 'Two columns',
    description: 'Side-by-side text layout',
    keywords: ['columns', 'layout', '2'],
    icon: '⫴',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setColumns(2).run();
    },
  },
  {
    title: 'Three columns',
    description: 'Three-column layout',
    keywords: ['columns', 'layout', '3'],
    icon: '⫶',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setColumns(3).run();
    },
  },
  {
    title: 'Object Card',
    description: 'Embed a live ontology object card',
    keywords: ['object', 'card', 'ontology', 'embed'],
    icon: '📇',
    command: ({ editor, range }) => {
      const refValue = window.prompt('Object reference (rid / id)');
      if (!refValue) return;
      editor.chain().focus().deleteRange(range).setEmbed({ kind: 'object_card', ref: refValue }).run();
    },
  },
  {
    title: 'Contour chart',
    description: 'Embed a Contour board chart',
    keywords: ['contour', 'chart', 'board', 'embed'],
    icon: '📊',
    command: ({ editor, range }) => {
      const refValue = window.prompt('Contour board id');
      if (!refValue) return;
      editor.chain().focus().deleteRange(range).setEmbed({ kind: 'contour_chart', ref: refValue }).run();
    },
  },
  {
    title: 'Quiver chart',
    description: 'Embed a Quiver object lens / time-series chart',
    keywords: ['quiver', 'chart', 'embed', 'timeseries'],
    icon: '📈',
    command: ({ editor, range }) => {
      const refValue = window.prompt('Quiver chart id');
      if (!refValue) return;
      editor.chain().focus().deleteRange(range).setEmbed({ kind: 'quiver_chart', ref: refValue }).run();
    },
  },
  {
    title: 'Code Workbook chart',
    description: 'Embed the latest output of a notebook chart cell',
    keywords: ['code', 'workbook', 'notebook', 'embed'],
    icon: '🧪',
    command: ({ editor, range }) => {
      const refValue = window.prompt('Notebook chart cell id');
      if (!refValue) return;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setEmbed({ kind: 'code_workbook_chart', ref: refValue })
        .run();
    },
  },
];

function matchItems(query: string): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMAND_ITEMS;
  return SLASH_COMMAND_ITEMS.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true;
    return item.keywords?.some((kw) => kw.includes(q)) ?? false;
  });
}

// ── React list component ─────────────────────────────────────────────

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

interface SlashCommandListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListHandle, SlashCommandListProps>(function SlashCommandList(
  { items, command },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div
        style={{
          padding: '10px 12px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--text-muted)',
        }}
      >
        No matches
      </div>
    );
  }

  return (
    <div
      role="menu"
      style={{
        maxHeight: 320,
        overflowY: 'auto',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        boxShadow: '0 10px 30px rgba(15,23,42,0.18)',
        minWidth: 280,
        padding: 4,
      }}
    >
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          role="menuitem"
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(index)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            padding: '8px 10px',
            border: 0,
            background: index === selectedIndex ? 'var(--bg-panel-muted)' : 'transparent',
            cursor: 'pointer',
            borderRadius: 4,
            textAlign: 'left',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              background: 'var(--bg-panel-muted)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-strong)',
            }}
          >
            {item.icon ?? '•'}
          </span>
          <div style={{ display: 'grid' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{item.title}</span>
            {item.description && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.description}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
});

// ── TipTap extension ─────────────────────────────────────────────────

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommandItem }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => matchItems(query),
      } as Partial<SuggestionOptions<SlashCommandItem>>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        ...this.options.suggestion,
        render: () => {
          let renderer: ReactRenderer<SlashCommandListHandle, SlashCommandListProps> | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              renderer = new ReactRenderer(SlashCommandList, {
                props: {
                  items: props.items,
                  command: (item: SlashCommandItem) =>
                    props.command({ editor: props.editor, range: props.range, props: item } as never),
                },
                editor: props.editor,
              });
              popup = tippy('body', {
                getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
                appendTo: () => document.body,
                content: renderer.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              })[0];
            },
            onUpdate(props: SuggestionProps<SlashCommandItem>) {
              renderer?.updateProps({
                items: props.items,
                command: (item: SlashCommandItem) =>
                  props.command({ editor: props.editor, range: props.range, props: item } as never),
              });
              popup?.setProps({
                getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(0, 0, 0, 0),
              });
            },
            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === 'Escape') {
                popup?.hide();
                return true;
              }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
            onExit() {
              popup?.destroy();
              renderer?.destroy();
            },
          };
        },
      }),
    ];
  },
});
