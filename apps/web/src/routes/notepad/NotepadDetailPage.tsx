import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  createKnowledgeDocument,
  listKnowledgeBases,
  type KnowledgeBase,
} from '@/lib/api/ai';
import { MonacoEditor } from '@/lib/components/MonacoEditor';
import { WidgetEmbeds, type WidgetEmbedRecord } from '@/lib/components/notepad/WidgetEmbeds';
import {
  exportNotepadDocument,
  getNotepadDocument,
  listNotepadPresence,
  updateNotepadDocument,
  upsertNotepadPresence,
  type NotepadDocument,
  type NotepadExportPayload,
  type NotepadPresence,
} from '@/lib/api/notepad';
import { useCurrentUser } from '@stores/auth';

function documentWidgets(doc: NotepadDocument | null): WidgetEmbedRecord[] {
  return Array.isArray(doc?.widgets) ? (doc.widgets as WidgetEmbedRecord[]) : [];
}

function widgetReference(widget: WidgetEmbedRecord) {
  const id = typeof widget.id === 'string' && widget.id.trim() ? widget.id.trim() : '';
  if (id) return `{{widget:${id}}}`;
  const title = typeof widget.title === 'string' ? widget.title.trim() : 'embed';
  return `{{widget:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'embed'}}}`;
}

function downloadExportPayload(payload: NotepadExportPayload) {
  const blob = new Blob([payload.html], { type: payload.mime_type || 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = payload.file_name || 'notepad-export.html';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function NotepadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const documentId = id ?? '';
  const navigate = useNavigate();
  const user = useCurrentUser();

  const [doc, setDoc] = useState<NotepadDocument | null>(null);
  const [exportPayload, setExportPayload] = useState<NotepadExportPayload | null>(null);
  const [presence, setPresence] = useState<NotepadPresence[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState('');
  const [exportNotice, setExportNotice] = useState('');

  const sessionIdRef = useRef<string>(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));

  const sendPresence = useCallback(
    async (cursorLabel = 'editing document') => {
      if (!doc || !user) return;
      try {
        await upsertNotepadPresence(doc.id, {
          session_id: sessionIdRef.current,
          display_name: user.name,
          cursor_label: cursorLabel,
          color: '#0f766e',
        });
      } catch {
        // Presence should never block editing.
      }
    },
    [doc, user],
  );

  const refreshPresence = useCallback(async () => {
    if (!doc) return;
    try {
      const result = await listNotepadPresence(doc.id);
      setPresence(result.data);
    } catch {
      // Ignore transient polling failures.
    }
  }, [doc]);

  // Initial load.
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const [d, exp, pres, kbs] = await Promise.all([
          getNotepadDocument(documentId),
          exportNotepadDocument(documentId),
          listNotepadPresence(documentId),
          listKnowledgeBases().catch(() => ({ data: [] as KnowledgeBase[] })),
        ]);
        if (cancelled) return;
        setDoc(d);
        setExportPayload(exp);
        setPresence(pres.data);
        setKnowledgeBases(kbs.data);
        setSelectedKnowledgeBaseId(kbs.data[0]?.id ?? '');
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load document');
          setDoc(null);
          setExportPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Heartbeat + presence polling once the document is loaded.
  useEffect(() => {
    if (!doc) return;
    void sendPresence();
    const heartbeat = setInterval(() => void sendPresence('editing document'), 15_000);
    const polling = setInterval(() => void refreshPresence(), 12_000);
    return () => {
      clearInterval(heartbeat);
      clearInterval(polling);
    };
  }, [doc, sendPresence, refreshPresence]);

  function patchDoc(patch: Partial<NotepadDocument>) {
    setDoc((current) => (current ? { ...current, ...patch } : current));
    setExportNotice('');
  }

  async function renderExportPayload(sourceDoc: NotepadDocument) {
    const exp = await exportNotepadDocument(sourceDoc.id, {
      id: sourceDoc.id,
      title: sourceDoc.title,
      description: sourceDoc.description,
      content: sourceDoc.content,
      widgets: sourceDoc.widgets,
      template_key: sourceDoc.template_key,
    });
    setExportPayload(exp);
    return exp;
  }

  async function saveDocument() {
    if (!doc) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateNotepadDocument(doc.id, {
        title: doc.title,
        description: doc.description,
        content: doc.content,
        widgets: doc.widgets,
      });
      setDoc(updated);
      await renderExportPayload(updated);
      setExportNotice('Saved and refreshed the export preview.');
      await sendPresence('reviewing latest changes');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save document');
    } finally {
      setSaving(false);
    }
  }

  async function exportDocument() {
    if (!doc) return;
    setExporting(true);
    setError('');
    setExportNotice('');
    try {
      const exp = await renderExportPayload(doc);
      downloadExportPayload(exp);
      setExportNotice(`Exported ${exp.file_name}.`);
      await sendPresence('exporting document');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to export document');
    } finally {
      setExporting(false);
    }
  }

  function updateWidgets(widgets: WidgetEmbedRecord[]) {
    if (!doc) return;
    patchDoc({ widgets });
  }

  function insertWidgetReference(widget: WidgetEmbedRecord) {
    if (!doc) return;
    const marker = widgetReference(widget);
    const content = doc.content.trimEnd();
    patchDoc({ content: `${content}${content ? '\n\n' : ''}${marker}` });
    void sendPresence('linking an embed');
  }

  async function indexInKnowledgeBase() {
    if (!doc || !selectedKnowledgeBaseId) return;
    setIndexing(true);
    setError('');
    try {
      await createKnowledgeDocument(selectedKnowledgeBaseId, {
        title: doc.title,
        content: [
          doc.content,
          '',
          ...documentWidgets(doc).map(
            (widget) => `- ${widget.title ?? 'Widget'}: ${widget.summary ?? ''}`,
          ),
        ].join('\n'),
        source_uri: `notepad://${doc.id}`,
        metadata: {
          source: 'notepad',
          widget_count: documentWidgets(doc).length,
        },
      });
      const updated = await updateNotepadDocument(doc.id, {
        last_indexed_at: new Date().toISOString(),
      });
      setDoc(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to index document');
    } finally {
      setIndexing(false);
    }
  }

  async function openPrintView() {
    if (!doc) return;
    const windowRef = window.open('', '_blank', 'noopener,noreferrer');
    if (!windowRef) return;
    setExporting(true);
    setError('');
    setExportNotice('');
    try {
      const exp = await renderExportPayload(doc);
      windowRef.document.write(exp.html);
      windowRef.document.close();
      windowRef.focus();
      windowRef.print();
      setExportNotice('Opened print-ready export.');
    } catch (cause) {
      windowRef.close();
      setError(cause instanceof Error ? cause.message : 'Failed to open print view');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <section className="of-page" style={{ padding: 80, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading document…
      </section>
    );
  }

  if (!doc) {
    return (
      <section className="of-page" style={{ padding: 80, textAlign: 'center' }}>
        <h1 className="of-heading-lg">Document not found</h1>
        <Link to="/notepad" className="of-btn of-btn-primary" style={{ display: 'inline-flex', marginTop: 24 }}>
          Back to Notepad
        </Link>
      </section>
    );
  }

  return (
    <section className="of-page" style={{ display: 'grid', gap: 16 }}>
      <div className="of-panel" style={{ padding: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 720, display: 'grid', gap: 12 }}>
            <Link to="/notepad" className="of-link" style={{ fontSize: 13 }}>
              Back to notepad
            </Link>
            <input
              type="text"
              value={doc.title}
              onChange={(e) => patchDoc({ title: e.target.value })}
              placeholder="Document title"
              style={{
                width: '100%',
                background: 'transparent',
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: 0,
                color: 'var(--text-strong)',
                border: 0,
                outline: 'none',
              }}
            />
            <textarea
              rows={2}
              value={doc.description}
              onChange={(e) => patchDoc({ description: e.target.value })}
              placeholder="What should readers understand after opening this document?"
              style={{
                width: '100%',
                resize: 'none',
                background: 'transparent',
                fontSize: 14,
                lineHeight: 1.7,
                color: 'var(--text-muted)',
                border: 0,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {doc.template_key && (
                <span className="of-chip" style={{ fontSize: 11 }}>
                  {doc.template_key}
                </span>
              )}
              <span className="of-chip" style={{ fontSize: 11 }}>
                {documentWidgets(doc).length} embeds
              </span>
              {doc.last_indexed_at && (
                <span className="of-chip of-status-success" style={{ fontSize: 11 }}>
                  Indexed in AIP
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="of-btn" onClick={() => navigate('/notepad')}>
              Close
            </button>
            <button type="button" className="of-btn" onClick={() => void openPrintView()} disabled={exporting}>
              Print / PDF
            </button>
            <button type="button" className="of-btn" onClick={() => void exportDocument()} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export HTML'}
            </button>
            <button
              type="button"
              className="of-btn of-btn-primary"
              onClick={() => void saveDocument()}
              disabled={saving || exporting}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="of-status-danger"
            style={{ marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
          >
            {error}
          </div>
        )}
        {exportNotice && (
          <div
            className="of-status-success"
            style={{ marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}
          >
            {exportNotice}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="of-panel" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p className="of-eyebrow">Document body</p>
                <h2 className="of-heading-md" style={{ marginTop: 4 }}>
                  Markdown-first collaborative note
                </h2>
              </div>
              <span className="of-text-muted" style={{ fontSize: 12 }}>
                {presence.length} active collaborators
              </span>
            </div>
            <div
              onFocusCapture={() => void sendPresence('editing body')}
              style={{
                marginTop: 16,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-panel-muted)',
                overflow: 'hidden',
              }}
            >
              <MonacoEditor
                value={doc.content}
                language="markdown"
                minHeight={560}
                onChange={(content) => patchDoc({ content })}
                onBlur={() => void sendPresence('reviewing body')}
              />
            </div>
          </section>

          <WidgetEmbeds
            widgets={documentWidgets(doc)}
            onChange={updateWidgets}
            onInsertReference={insertWidgetReference}
          />
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <section className="of-panel" style={{ padding: 24 }}>
            <p className="of-eyebrow">Presence</p>
            <h2 className="of-heading-md" style={{ marginTop: 4 }}>
              Who is in the document
            </h2>

            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              {presence.length === 0 ? (
                <div
                  style={{
                    border: '1px dashed var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  No active collaborators right now.
                </div>
              ) : (
                presence.map((collaborator) => (
                  <div key={collaborator.id} className="of-panel-muted" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: collaborator.color,
                        }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                          {collaborator.display_name}
                        </div>
                        <div className="of-text-muted" style={{ fontSize: 12 }}>
                          {collaborator.cursor_label || 'Browsing the document'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="of-panel" style={{ padding: 24 }}>
            <p className="of-eyebrow">AIP Assist</p>
            <h2 className="of-heading-md" style={{ marginTop: 4 }}>
              Index the document into knowledge
            </h2>

            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              <Field label="Knowledge base">
                <select
                  className="of-select"
                  value={selectedKnowledgeBaseId}
                  onChange={(e) => setSelectedKnowledgeBaseId(e.target.value)}
                >
                  {knowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                className="of-btn of-btn-primary"
                disabled={!selectedKnowledgeBaseId || indexing}
                onClick={() => void indexInKnowledgeBase()}
              >
                {indexing ? 'Indexing…' : 'Index in AIP'}
              </button>
            </div>
          </section>

          <section className="of-panel" style={{ padding: 24 }}>
            <p className="of-eyebrow">Preview</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
              <h2 className="of-heading-md">Rendered export</h2>
              <button type="button" className="of-btn" onClick={() => void exportDocument()} disabled={exporting} style={{ minHeight: 30, fontSize: 12 }}>
                Refresh
              </button>
            </div>

            {exportPayload ? (
              <iframe
                title="Notepad preview"
                srcDoc={exportPayload.html}
                style={{
                  marginTop: 16,
                  height: 540,
                  width: '100%',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: '#fff',
                }}
              />
            ) : (
              <div
                style={{
                  marginTop: 16,
                  border: '1px dashed var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px 16px',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                }}
              >
                Save or export the document to refresh the rendered preview.
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}

function Field({ label, children, fullWidth }: FieldProps) {
  return (
    <label
      style={{ display: 'block', fontSize: 13, gridColumn: fullWidth ? '1 / -1' : undefined }}
    >
      <div className="of-eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </label>
  );
}
