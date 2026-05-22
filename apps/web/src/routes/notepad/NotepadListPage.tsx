import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@components/ConfirmDialog';
import { CreateDocumentPanel } from '@/lib/components/notepad/CreateDocumentPanel';
import {
  NewFromTemplateModal,
  type TemplateRow,
} from '@/lib/components/notepad/TemplateModals';
import { useCurrentUser } from '@/lib/stores/auth';
import {
  createNotepadDocument,
  deleteNotepadDocument,
  instantiateNotepadTemplate,
  listNotepadDocuments,
  listNotepadPresence,
  listNotepadTemplates,
  type NotepadDocument,
  type NotepadListSort,
  type NotepadPresence,
  type NotepadTemplate,
} from '@/lib/api/notepad';

type ViewKey = 'recents' | 'mine' | 'favorites' | 'all';

const VIEW_TABS: Array<{ key: ViewKey; label: string; sort: NotepadListSort }> = [
  { key: 'recents', label: 'Recents', sort: 'recent' },
  { key: 'mine', label: 'Created by me', sort: 'created_by_me' },
  { key: 'favorites', label: 'Favorites', sort: 'favorite' },
  { key: 'all', label: 'All', sort: 'all' },
];

function sortForView(view: ViewKey): NotepadListSort {
  return VIEW_TABS.find((tab) => tab.key === view)?.sort ?? 'recent';
}

interface Template {
  key: string;
  name: string;
  description: string;
  content: string;
  widgets: Array<Record<string, unknown>>;
}

type CreateTarget = 'blank' | string | null;

const TEMPLATES: Template[] = [
  {
    key: 'executive-brief',
    name: 'Executive Brief',
    description: 'One-page summary with highlights, decisions, and next moves.',
    content: `# Executive brief

## Situation
- Summarize the current state in plain language.

## What changed
- Highlight the biggest movement.

## Decisions
- Record approvals, blockers, and owners.

## Next week
- List the actions that need to happen next.`,
    widgets: [
      {
        kind: 'contour',
        title: 'Top-down trend',
        summary: 'Embed a Contour board or exported insight snapshot.',
      },
    ],
  },
  {
    key: 'investigation',
    name: 'Investigation',
    description: 'Evidence-first writeup with hypotheses and findings.',
    content: `# Investigation log

## Hypothesis
- State the working theory.

## Evidence
- Capture the signals that support or contradict it.

## Findings
- List the confirmed facts.

## Follow-up
- Record the next analysis steps.`,
    widgets: [
      {
        kind: 'quiver',
        title: 'Object/time-series lens',
        summary: 'Attach Quiver object analytics and relationship snapshots.',
      },
    ],
  },
  {
    key: 'operating-review',
    name: 'Operating Review',
    description: 'Recurring operating cadence with metrics, narrative, and actions.',
    content: `# Operating review

## KPI pulse
- Describe the current business pulse.

## Risks
- Call out material risks.

## Opportunities
- Capture upside and experiments.

## Commitments
- Make ownership explicit.`,
    widgets: [
      {
        kind: 'report',
        title: 'Scheduled report',
        summary: 'Link the latest report execution or exported deck.',
      },
      {
        kind: 'fusion',
        title: 'Spreadsheet decision log',
        summary: 'Reference Fusion edits and reconciliations.',
      },
    ],
  },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function countWords(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function documentTitle(doc: NotepadDocument) {
  return doc.title.trim() || 'Untitled document';
}

function documentPreview(doc: NotepadDocument) {
  const source = doc.description?.trim() || doc.content.replace(/^#\s*/gm, '').trim();
  if (!source) return 'No description yet.';
  return source.length > 150 ? `${source.slice(0, 147)}...` : source;
}

function documentWidgets(doc: NotepadDocument) {
  return Array.isArray(doc.widgets) ? doc.widgets : [];
}

function templateLabel(key: string | null) {
  if (!key) return 'Blank';
  return TEMPLATES.find((template) => template.key === key)?.name ?? key;
}

export function NotepadListPage() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [documents, setDocuments] = useState<NotepadDocument[]>([]);
  const [presenceByDocument, setPresenceByDocument] = useState<Record<string, NotepadPresence[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewKey>('recents');
  const [creatingTarget, setCreatingTarget] = useState<CreateTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotepadDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [userTemplates, setUserTemplates] = useState<NotepadTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  async function hydratePresence(nextDocuments: NotepadDocument[]) {
    if (nextDocuments.length === 0) {
      setPresenceByDocument({});
      return;
    }

    const visibleDocuments = nextDocuments.slice(0, 20);
    const entries = await Promise.all(
      visibleDocuments.map(async (document) => {
        try {
          const response = await listNotepadPresence(document.id);
          return [document.id, response.data] as const;
        } catch {
          return [document.id, []] as const;
        }
      }),
    );
    setPresenceByDocument(Object.fromEntries(entries));
  }

  async function load(
    nextSearch = search,
    options: { clearFeedback?: boolean } = {},
    nextView: ViewKey = view,
  ) {
    setLoading(true);
    setError('');
    if (options.clearFeedback ?? true) setFeedback('');
    try {
      const response = await listNotepadDocuments({
        search: nextSearch.trim() || undefined,
        sort: sortForView(nextView),
        per_page: 100,
      });
      const data = response.data ?? [];
      setDocuments(data);
      setPresenceByDocument({});
      void hydratePresence(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load notepad documents');
      setDocuments([]);
      setPresenceByDocument({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(search, { clearFeedback: false }, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function refreshUserTemplates() {
    try {
      const result = await listNotepadTemplates();
      setUserTemplates(result.data);
    } catch {
      // The list page should not block on template loading; show
      // the regular built-in templates if the call fails.
    }
  }

  useEffect(() => {
    void refreshUserTemplates();
  }, []);

  // Dispatch creation for the merged template list shown in the modal.
  // Row ids carry a "builtin:" or "user:" prefix so the same callback
  // covers both code paths without leaking the discriminator into the
  // modal itself.
  async function createFromAnyTemplate(
    rowId: string,
    inputs: Record<string, string>,
    titleOverride: string,
  ) {
    setError('');
    setFeedback('');
    if (rowId.startsWith('builtin:')) {
      const key = rowId.slice('builtin:'.length);
      const tpl = TEMPLATES.find((t) => t.key === key);
      if (!tpl) throw new Error('Template not found');
      const created = await createNotepadDocument({
        title: titleOverride.trim() || tpl.name,
        description: tpl.description,
        content: tpl.content,
        template_key: tpl.key,
        widgets: tpl.widgets,
      });
      setShowTemplateModal(false);
      navigate(`/notepad/${created.id}`);
      return;
    }
    if (rowId.startsWith('user:')) {
      const id = rowId.slice('user:'.length);
      const created = await instantiateNotepadTemplate(id, {
        inputs,
        title: titleOverride.trim() || undefined,
      });
      setShowTemplateModal(false);
      navigate(`/notepad/${created.id}`);
      return;
    }
    throw new Error(`Unknown template row id: ${rowId}`);
  }

  const templateRows = useMemo<TemplateRow[]>(() => {
    const builtIn: TemplateRow[] = TEMPLATES.map((t) => ({
      id: `builtin:${t.key}`,
      name: t.name,
      description: t.description,
      author: 'OpenFoundry',
      path: '/Foundry/Built-in/Notepad templates',
      updatedAt: null,
      hasInputs: false,
      defaultTitle: t.name,
    }));
    const userRows: TemplateRow[] = userTemplates.map((t) => ({
      id: `user:${t.id}`,
      name: t.name,
      description: t.description,
      author: currentUser?.name ?? 'You',
      path: '/Personal/Notepad/Templates',
      updatedAt: t.updated_at,
      hasInputs: (t.inputs_schema?.length ?? 0) > 0,
      inputsSchema: t.inputs_schema,
      defaultTitle: t.title || t.name,
    }));
    return [...builtIn, ...userRows];
  }, [userTemplates, currentUser]);

  async function createFromTemplate(template: Template) {
    setCreatingTarget(template.key);
    setError('');
    setFeedback('');
    try {
      const document = await createNotepadDocument({
        title: template.name,
        description: template.description,
        content: template.content,
        template_key: template.key,
        widgets: template.widgets,
      });
      navigate(`/notepad/${document.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create document');
    } finally {
      setCreatingTarget(null);
    }
  }

  async function createBlankDocument() {
    setCreatingTarget('blank');
    setError('');
    setFeedback('');
    try {
      const document = await createNotepadDocument({
        title: 'Untitled document',
        content: '# New document\n\nStart writing here.',
        widgets: [],
      });
      navigate(`/notepad/${document.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create document');
    } finally {
      setCreatingTarget(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    setFeedback('');
    try {
      await deleteNotepadDocument(deleteTarget.id);
      setDeleteTarget(null);
      await load(search, { clearFeedback: false });
      setFeedback('Document deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  function openRow(event: MouseEvent<HTMLTableRowElement>, id: string) {
    const target = event.target as HTMLElement;
    if (target.closest('a,button')) return;
    navigate(`/notepad/${id}`);
  }

  function openRowWithKeyboard(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement;
    if (target.closest('a,button')) return;
    event.preventDefault();
    navigate(`/notepad/${id}`);
  }

  const indexedCount = useMemo(
    () => documents.filter((document) => document.last_indexed_at).length,
    [documents],
  );
  const embedCount = useMemo(
    () => documents.reduce((sum, document) => sum + documentWidgets(document).length, 0),
    [documents],
  );
  const wordCount = useMemo(
    () => documents.reduce((sum, document) => sum + countWords(document.content), 0),
    [documents],
  );
  const latestDocument = useMemo(() => {
    return [...documents].sort((left, right) => {
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    })[0] ?? null;
  }, [documents]);
  const activePresence = useMemo(() => {
    return documents.flatMap((document) =>
      (presenceByDocument[document.id] ?? []).map((collaborator) => ({ document, collaborator })),
    );
  }, [documents, presenceByDocument]);

  const creating = creatingTarget !== null;

  return (
    <section className="of-page" style={{ display: 'grid', gap: 10 }}>
      <header style={{ display: 'grid', gap: 4, padding: '4px 4px 0' }}>
        <h1 className="of-heading-xl">Notepad</h1>
        <p className="of-text-muted" style={{ maxWidth: 720 }}>
          Create, share and export object-aware documents and reports.
        </p>
      </header>

      <CreateDocumentPanel
        onBlank={() => void createBlankDocument()}
        onFromTemplate={() => setShowTemplateModal(true)}
        onDocumentTemplate={() => navigate('/notepad?new=template')}
        disabled={creating}
      />

      {error && (
        <div className="of-status-danger" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {feedback && (
        <div className="of-status-success" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {feedback}
        </div>
      )}

      <form
        className="of-toolbar"
        style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
        onSubmit={(event) => {
          event.preventDefault();
          void load(search);
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
          <input
            className="of-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documents"
            style={{ width: 260 }}
          />
          <button type="submit" className="of-button" disabled={loading}>
            {loading ? 'Applying...' : 'Apply'}
          </button>
          {search.trim() && (
            <button
              type="button"
              className="of-button of-button--ghost"
              onClick={() => {
                setSearch('');
                void load('');
              }}
            >
              Clear
            </button>
          )}
        </div>
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          {latestDocument ? `Last update ${formatDateTime(latestDocument.updated_at)}` : 'No recent updates'}
        </span>
      </form>

      <div className="of-view-tabs" role="tablist" aria-label="View">
        <span className="of-view-tabs__label">View</span>
        {VIEW_TABS.map((tab) => {
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`of-view-tabs__chip${active ? ' is-active' : ''}`}
              onClick={() => setView(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        <section className="of-panel" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border-default)' }}>
            <p className="of-eyebrow">Document gallery</p>
            <span className="of-chip">{documents.length} loaded</span>
          </div>

          {loading ? (
            <p className="of-text-muted" style={{ margin: 0, padding: 14 }}>
              Loading documents...
            </p>
          ) : documents.length === 0 ? (
            <div style={{ display: 'grid', justifyItems: 'start', gap: 8, padding: 16 }}>
              <p className="of-heading-sm" style={{ margin: 0 }}>
                No documents match this view.
              </p>
              <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
                Start a blank note or use one of the templates.
              </p>
              <button
                type="button"
                className="of-button of-button--primary"
                onClick={() => void createBlankDocument()}
                disabled={creating}
              >
                {creatingTarget === 'blank' ? 'Creating...' : 'New document'}
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="of-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Template</th>
                    <th>Embeds</th>
                    <th>Presence</th>
                    <th>Updated</th>
                    <th style={{ width: 150 }} />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => {
                    const presence = presenceByDocument[doc.id] ?? [];
                    return (
                      <tr
                        key={doc.id}
                        role="link"
                        tabIndex={0}
                        aria-label={`Open ${documentTitle(doc)}`}
                        onClick={(event) => openRow(event, doc.id)}
                        onKeyDown={(event) => openRowWithKeyboard(event, doc.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ minWidth: 280 }}>
                          <Link to={`/notepad/${doc.id}`} style={{ fontWeight: 700, color: 'var(--text-link)' }}>
                            {documentTitle(doc)}
                          </Link>
                          <p className="of-text-muted" style={{ margin: '3px 0 0', maxWidth: 560, fontSize: 12 }}>
                            {documentPreview(doc)}
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            <span className="of-chip" style={{ fontSize: 11 }}>
                              {countWords(doc.content)} words
                            </span>
                            {doc.last_indexed_at && (
                              <span className="of-chip of-status-success" style={{ fontSize: 11 }}>
                                Indexed in AIP
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="of-text-muted" style={{ minWidth: 120 }}>
                          {templateLabel(doc.template_key)}
                        </td>
                        <td>{documentWidgets(doc).length}</td>
                        <td style={{ minWidth: 150 }}>
                          {presence.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {presence.slice(0, 3).map((collaborator) => (
                                <span
                                  key={collaborator.id}
                                  title={`${collaborator.display_name}: ${collaborator.cursor_label}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 22,
                                    height: 22,
                                    borderRadius: 3,
                                    background: collaborator.color || '#2d72d2',
                                    color: '#fff',
                                    fontSize: 10,
                                    fontWeight: 700,
                                  }}
                                >
                                  {collaborator.display_name.slice(0, 1).toUpperCase()}
                                </span>
                              ))}
                              {presence.length > 3 && (
                                <span className="of-chip" style={{ minHeight: 22, fontSize: 11 }}>
                                  +{presence.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="of-text-muted">-</span>
                          )}
                        </td>
                        <td className="of-text-muted" style={{ minWidth: 150 }}>
                          {formatDateTime(doc.updated_at)}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Link to={`/notepad/${doc.id}`} className="of-button" style={{ fontSize: 11 }}>
                            Open
                          </Link>
                          <button
                            type="button"
                            className="of-button of-btn-danger"
                            onClick={() => setDeleteTarget(doc)}
                            disabled={deleteBusy}
                            style={{ marginLeft: 6, fontSize: 11 }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside style={{ display: 'grid', gap: 10 }}>
          <section className="of-panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-default)' }}>
              <p className="of-eyebrow">Templates</p>
              <h2 className="of-heading-sm" style={{ marginTop: 4 }}>
                Structured starts
              </h2>
            </div>
            <div style={{ display: 'grid', gap: 8, padding: 10 }}>
              {TEMPLATES.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => void createFromTemplate(template)}
                  disabled={creating}
                  className="of-panel-muted"
                  style={{
                    width: '100%',
                    display: 'grid',
                    gap: 4,
                    padding: 12,
                    textAlign: 'left',
                    cursor: creating ? 'not-allowed' : 'pointer',
                    opacity: creating && creatingTarget !== template.key ? 0.58 : 1,
                  }}
                >
                  <span style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{template.name}</span>
                  <span className="of-text-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                    {template.description}
                  </span>
                  <span className="of-text-muted" style={{ fontSize: 11 }}>
                    {creatingTarget === template.key ? 'Creating...' : `${template.widgets.length} starter embeds`}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="of-panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-default)' }}>
              <p className="of-eyebrow">Live presence</p>
              <h2 className="of-heading-sm" style={{ marginTop: 4 }}>
                Active collaborators
              </h2>
            </div>
            {activePresence.length === 0 ? (
              <p className="of-text-muted" style={{ margin: 0, padding: 12, fontSize: 12 }}>
                No active collaborators.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 8, padding: 10 }}>
                {activePresence.slice(0, 6).map(({ document, collaborator }) => (
                  <div key={collaborator.id} className="of-panel-muted" style={{ display: 'grid', gap: 4, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: '0 0 auto',
                          width: 22,
                          height: 22,
                          borderRadius: 3,
                          background: collaborator.color || '#2d72d2',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {collaborator.display_name.slice(0, 1).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {collaborator.display_name}
                        </p>
                        <p className="of-text-muted" style={{ margin: 0, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {collaborator.cursor_label || 'viewing'}
                        </p>
                      </div>
                    </div>
                    <Link to={`/notepad/${document.id}`} className="of-link" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {documentTitle(document)}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="of-panel" style={{ padding: 12 }}>
            <p className="of-eyebrow">Corpus</p>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px', margin: '10px 0 0', fontSize: 12 }}>
              <dt className="of-text-muted">Words</dt>
              <dd style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 700 }}>{wordCount}</dd>
              <dt className="of-text-muted">Indexed documents</dt>
              <dd style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 700 }}>{indexedCount}</dd>
              <dt className="of-text-muted">Workspace embeds</dt>
              <dd style={{ margin: 0, color: 'var(--text-strong)', fontWeight: 700 }}>{embedCount}</dd>
            </dl>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete document"
        message={deleteTarget ? `Delete "${documentTitle(deleteTarget)}"? This permanently removes the document.` : ''}
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {showTemplateModal && (
        <NewFromTemplateModal
          templates={templateRows}
          onCancel={() => setShowTemplateModal(false)}
          onCreate={createFromAnyTemplate}
        />
      )}
    </section>
  );
}
