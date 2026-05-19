// Custom TipTap nodes that round out the layout primitives our editor
// exposes (page break + multi-column wrappers). The Table / Image
// extensions live in their own packages; only the in-house nodes live
// here so the editor file stays focused on wiring.

import { Node, mergeAttributes } from '@tiptap/core';

// ── Page break ───────────────────────────────────────────────────────
//
// Renders as a thin gray divider in the editor and as a
// `<div class="of-page-break"></div>` in HTML output. The export CSS
// (libs/notepad envelope styles) maps `.of-page-break` to
// `page-break-after: always` so Chromium / Gotenberg start a new
// page; the DOCX writer maps the same class to `<w:br w:type="page"/>`.
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  selectable: true,
  atom: true,

  parseHTML() {
    return [{ tag: 'div.of-page-break' }, { tag: 'hr.of-page-break' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'of-page-break',
        'data-page-break': 'true',
        contenteditable: 'false',
      }),
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});

// ── Multi-column layout ──────────────────────────────────────────────
//
// `columns` is the wrapper (a horizontal grid). It holds N `column`
// children, each of which behaves like a self-contained block
// container. Default to 2 columns; the `setColumns(n)` command lets
// the toolbar / slash menu insert 2-3.
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,3}',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div.of-columns' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'of-columns' }), 0];
  },

  addCommands() {
    return {
      setColumns:
        (count = 2) =>
        ({ chain }) => {
          const columns = Math.max(2, Math.min(3, count));
          const content = Array.from({ length: columns }, () => ({
            type: 'column',
            content: [{ type: 'paragraph' }],
          }));
          return chain().insertContent({ type: this.name, content }).focus().run();
        },
    };
  },
});

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div.of-column' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'of-column' }), 0];
  },
});

// TypeScript augmentation so editor.chain().setPageBreak() /
// setColumns() type-check.
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
    columns: {
      setColumns: (count?: number) => ReturnType;
    };
  }
}
