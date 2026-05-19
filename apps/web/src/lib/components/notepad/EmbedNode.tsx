// Live embed (Slice C). One TipTap node covers all four kinds —
// Object Card, Contour chart, Quiver chart, Code Workbook chart —
// because the wire shape is identical (NotepadEmbedPreview) and only
// the visual accent changes.
//
// Storage shape: an atom block node with attrs { kind, ref, snapshot }.
//
//   * `kind`     — one of NotepadEmbedKind values
//   * `ref`      — upstream identifier (rid, board id, chart id, …)
//   * `snapshot` — the last fetched NotepadEmbedPreview, persisted so
//                  exports work offline and reloads do not flash.
//
// In the editor a React NodeView renders the live card with a Refresh
// button that hits the resolver. In static HTML (used for save +
// PDF/DOCX export) renderHTML emits the same structural markup so
// downstream consumers don't need a JS runtime — Gotenberg renders a
// real card and the Go DOCX writer picks up the inner <table> +
// headings naturally.

import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useCallback, useEffect, useState } from 'react';

import {
  resolveNotepadEmbed,
  type NotepadEmbedKind,
  type NotepadEmbedPreview,
} from '@/lib/api/notepad';

const EMBED_KIND_LABEL: Record<NotepadEmbedKind, string> = {
  object_card: 'Object Card',
  contour_chart: 'Contour Chart',
  quiver_chart: 'Quiver Chart',
  code_workbook_chart: 'Code Workbook Chart',
};

const EMBED_ACCENT: Record<NotepadEmbedKind, string> = {
  object_card: '#0284c7',
  contour_chart: '#7c3aed',
  quiver_chart: '#0f766e',
  code_workbook_chart: '#b45309',
};

function encodeSnapshot(preview: NotepadEmbedPreview | null): string {
  if (!preview) return '';
  try {
    const json = JSON.stringify(preview);
    if (typeof window === 'undefined') return '';
    return window.btoa(unescape(encodeURIComponent(json)));
  } catch {
    return '';
  }
}

function decodeSnapshot(raw: string | null | undefined): NotepadEmbedPreview | null {
  if (!raw || typeof window === 'undefined') return null;
  try {
    const json = decodeURIComponent(escape(window.atob(raw)));
    return JSON.parse(json) as NotepadEmbedPreview;
  } catch {
    return null;
  }
}

export const Embed = Node.create({
  name: 'notepadEmbed',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: 'object_card' as NotepadEmbedKind,
        parseHTML: (element) => element.getAttribute('data-kind') ?? 'object_card',
        renderHTML: (attrs) => ({ 'data-kind': attrs.kind }),
      },
      ref: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-ref') ?? '',
        renderHTML: (attrs) => ({ 'data-ref': attrs.ref }),
      },
      snapshot: {
        default: null as NotepadEmbedPreview | null,
        parseHTML: (element) => decodeSnapshot(element.getAttribute('data-snapshot')),
        renderHTML: (attrs) => {
          const enc = encodeSnapshot(attrs.snapshot as NotepadEmbedPreview | null);
          return enc ? { 'data-snapshot': enc } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div.of-embed' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const snapshot = node.attrs.snapshot as NotepadEmbedPreview | null;
    const kind = (node.attrs.kind as NotepadEmbedKind) ?? 'object_card';
    const accent = EMBED_ACCENT[kind] ?? '#475569';
    const wrapper = mergeAttributes(HTMLAttributes, {
      class: `of-embed of-embed-${kind}`,
      'data-kind': kind,
      style: `border-left:4px solid ${accent};`,
    });
    if (!snapshot) {
      return [
        'div',
        wrapper,
        [
          'div',
          { class: 'of-embed-empty' },
          `${EMBED_KIND_LABEL[kind] ?? 'Embed'} — no reference selected`,
        ],
      ];
    }
    const header: Array<[string, Record<string, string>, ...string[]]> = [];
    header.push(['div', { class: 'of-embed-kind' }, EMBED_KIND_LABEL[kind] ?? kind]);
    if (snapshot.title) header.push(['h4', { class: 'of-embed-title' }, snapshot.title]);
    if (snapshot.subtitle) header.push(['p', { class: 'of-embed-subtitle' }, snapshot.subtitle]);
    if (snapshot.summary) header.push(['p', { class: 'of-embed-summary' }, snapshot.summary]);
    const rows = (snapshot.fields ?? []).map((field) => [
      'tr',
      {},
      ['th', {}, field.label],
      ['td', {}, field.value],
    ]);
    const body: Array<unknown> = [];
    body.push(['div', { class: 'of-embed-header' }, ...header]);
    if (rows.length > 0) {
      body.push(['table', { class: 'of-embed-fields' }, ['tbody', {}, ...rows]]);
    }
    return ['div', wrapper, ...body] as never;
  },

  addCommands() {
    return {
      setEmbed:
        (attrs: { kind: NotepadEmbedKind; ref: string; snapshot?: NotepadEmbedPreview | null }) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { kind: attrs.kind, ref: attrs.ref, snapshot: attrs.snapshot ?? null },
            })
            .focus()
            .run(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notepadEmbed: {
      setEmbed: (attrs: {
        kind: NotepadEmbedKind;
        ref: string;
        snapshot?: NotepadEmbedPreview | null;
      }) => ReturnType;
    };
  }
}

// ── React node view ──────────────────────────────────────────────────

function EmbedView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const kind = (node.attrs.kind as NotepadEmbedKind) ?? 'object_card';
  const ref = (node.attrs.ref as string) ?? '';
  const initialSnapshot = (node.attrs.snapshot as NotepadEmbedPreview | null) ?? null;

  const [preview, setPreview] = useState<NotepadEmbedPreview | null>(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(
    async (silent = false) => {
      if (!ref) return;
      if (!silent) setLoading(true);
      setError('');
      try {
        const fresh = await resolveNotepadEmbed({ kind, ref });
        setPreview(fresh);
        updateAttributes({ snapshot: fresh });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Embed refresh failed');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [kind, ref, updateAttributes],
  );

  // Auto-fetch when an embed is freshly inserted (no snapshot yet).
  useEffect(() => {
    if (!initialSnapshot && ref) {
      void refresh(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accent = EMBED_ACCENT[kind] ?? '#475569';

  return (
    <NodeViewWrapper
      as="div"
      className={`of-embed of-embed-${kind}`}
      style={{
        borderLeft: `4px solid ${accent}`,
        borderTop: '1px solid var(--border-default)',
        borderRight: '1px solid var(--border-default)',
        borderBottom: '1px solid var(--border-default)',
        borderRadius: 6,
        margin: '14px 0',
        padding: '14px 16px',
        background: 'var(--bg-panel)',
        boxShadow: selected ? `0 0 0 2px ${accent}40` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div
            className="of-embed-kind"
            style={{
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: accent,
            }}
          >
            {EMBED_KIND_LABEL[kind] ?? kind}
          </div>
          {preview?.title && (
            <h4 className="of-embed-title" style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>
              {preview.title}
            </h4>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ref ? (
            <button
              type="button"
              className="of-btn"
              onClick={() => void refresh(false)}
              disabled={loading || !editor.isEditable}
              style={{ height: 26, padding: '0 8px', fontSize: 12 }}
              title="Refresh live data"
            >
              {loading ? '…' : '↻'}
            </button>
          ) : (
            <button
              type="button"
              className="of-btn"
              onClick={() => {
                const next = window.prompt('Upstream reference (rid, board id, chart id, …)');
                if (!next) return;
                updateAttributes({ ref: next });
              }}
              disabled={!editor.isEditable}
              style={{ height: 26, padding: '0 8px', fontSize: 12 }}
            >
              Set ref…
            </button>
          )}
        </div>
      </div>

      {preview?.subtitle && (
        <p className="of-embed-subtitle" style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
          {preview.subtitle}
        </p>
      )}
      {preview?.summary && (
        <p className="of-embed-summary" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-strong)' }}>
          {preview.summary}
        </p>
      )}
      {preview?.fields && preview.fields.length > 0 && (
        <table
          className="of-embed-fields"
          style={{
            marginTop: 12,
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <tbody>
            {preview.fields.map((field) => (
              <tr key={field.label}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '4px 8px 4px 0',
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                    width: '30%',
                  }}
                >
                  {field.label}
                </th>
                <td style={{ padding: '4px 0', color: 'var(--text-strong)' }}>{field.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!preview && !error && (
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          {ref ? 'Loading preview…' : 'Click Set ref… to attach an upstream object.'}
        </p>
      )}
      {error && (
        <p
          className="of-status-danger"
          style={{ marginTop: 8, padding: '6px 10px', borderRadius: 4, fontSize: 12 }}
        >
          {error}
        </p>
      )}
      {preview && (
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          Status: {preview.status || 'live'} · Snapshot {new Date(preview.fetched_at).toLocaleString()}
        </div>
      )}
    </NodeViewWrapper>
  );
}
