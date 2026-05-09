import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@components/ConfirmDialog';
import { CreateNotebookModal } from '@/lib/components/notebook/CreateNotebookModal';
import {
  deleteNotebook,
  listNotebooks,
  type Notebook,
} from '@/lib/api/notebooks';

const PER_PAGE = 20;

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function kernelTone(kernel: string) {
  if (kernel === 'python') return 'of-status-info';
  if (kernel === 'sql') return 'of-status-success';
  if (kernel === 'llm') return 'of-status-warning';
  return '';
}

export function NotebooksListPage() {
  const navigate = useNavigate();

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function load(nextPage = page, nextSearch = search) {
    setLoading(true);
    setError('');
    try {
      const res = await listNotebooks({
        page: nextPage,
        per_page: PER_PAGE,
        search: nextSearch.trim() || undefined,
      });
      setNotebooks(res.data);
      setTotal(res.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load notebooks');
      setNotebooks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback('');
    if (page === 1) {
      void load(1);
    } else {
      setPage(1);
    }
  }

  function clearSearch() {
    setSearch('');
    setFeedback('');
    if (page === 1) {
      void load(1, '');
    } else {
      setPage(1);
    }
  }

  async function confirmDelete() {
    if (!confirmId) return;
    setConfirmBusy(true);
    setError('');
    setFeedback('');
    try {
      await deleteNotebook(confirmId);
      const nextPage = notebooks.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) {
        setPage(nextPage);
      } else {
        await load(nextPage);
      }
      setFeedback('Notebook deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete notebook');
    } finally {
      setConfirmId(null);
      setConfirmBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const firstVisible = notebooks.length === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const lastVisible = Math.min(page * PER_PAGE, total);
  const selectedNotebook = notebooks.find((notebook) => notebook.id === confirmId);
  const kernelCounts = notebooks.reduce<Record<string, number>>((acc, notebook) => {
    acc[notebook.default_kernel] = (acc[notebook.default_kernel] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="of-page" style={{ display: 'grid', gap: 10 }}>
      <header className="of-panel" style={{ display: 'grid', gap: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 280 }}>
            <p className="of-eyebrow">Developer tools</p>
            <h1 className="of-heading-xl" style={{ marginTop: 4 }}>
              Notebooks
            </h1>
            <p className="of-text-muted" style={{ marginTop: 4, maxWidth: 720 }}>
              Create Jupyter-style workbooks, pick a kernel, and open each notebook into its cell and workspace view.
            </p>
          </div>
          <button type="button" className="of-button of-button--primary" onClick={() => setCreateOpen(true)}>
            New notebook
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <div className="of-panel-muted" style={{ padding: 10 }}>
            <p className="of-eyebrow">Total</p>
            <strong style={{ display: 'block', marginTop: 4, color: 'var(--text-strong)', fontSize: 18 }}>{total}</strong>
          </div>
          <div className="of-panel-muted" style={{ padding: 10 }}>
            <p className="of-eyebrow">This page</p>
            <strong style={{ display: 'block', marginTop: 4, color: 'var(--text-strong)', fontSize: 18 }}>{notebooks.length}</strong>
          </div>
          <div className="of-panel-muted" style={{ padding: 10 }}>
            <p className="of-eyebrow">Python kernels</p>
            <strong style={{ display: 'block', marginTop: 4, color: 'var(--text-strong)', fontSize: 18 }}>{kernelCounts.python ?? 0}</strong>
          </div>
          <div className="of-panel-muted" style={{ padding: 10 }}>
            <p className="of-eyebrow">Other kernels</p>
            <strong style={{ display: 'block', marginTop: 4, color: 'var(--text-strong)', fontSize: 18 }}>
              {notebooks.length - (kernelCounts.python ?? 0)}
            </strong>
          </div>
        </div>
      </header>

      <form className="of-toolbar" onSubmit={submitSearch} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
          <input
            className="of-input"
            placeholder="Search notebooks..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ width: 260 }}
          />
          <button type="submit" className="of-button" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
          {search && (
            <button type="button" className="of-button of-button--ghost" onClick={clearSearch}>
              Clear
            </button>
          )}
        </div>
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          Showing {firstVisible}-{lastVisible} of {total}
        </span>
      </form>

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

      <section className="of-panel" style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            borderBottom: '1px solid var(--border-default)',
            padding: '10px 12px',
          }}
        >
          <p className="of-eyebrow">Notebook gallery</p>
          <button type="button" className="of-button" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="of-text-muted" style={{ margin: 0, padding: 14 }}>
            Loading notebooks...
          </p>
        ) : notebooks.length === 0 ? (
          <div style={{ display: 'grid', justifyItems: 'start', gap: 8, padding: 16 }}>
            <p className="of-heading-sm" style={{ margin: 0 }}>
              No notebooks found.
            </p>
            <p className="of-text-muted" style={{ margin: 0, fontSize: 12 }}>
              Create a notebook or clear the current search.
            </p>
            <button type="button" className="of-button of-button--primary" onClick={() => setCreateOpen(true)}>
              New notebook
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="of-table">
              <thead>
                <tr>
                  <th>Notebook</th>
                  <th>Kernel</th>
                  <th>Owner</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {notebooks.map((notebook) => (
                  <tr key={notebook.id}>
                    <td style={{ minWidth: 300 }}>
                      <Link to={`/notebooks/${notebook.id}`} style={{ fontWeight: 700 }}>
                        {notebook.name}
                      </Link>
                      <p className="of-text-muted" style={{ margin: '3px 0 0', fontSize: 11 }}>
                        {notebook.description || 'No description'}
                      </p>
                    </td>
                    <td>
                      <span
                        className={`of-chip ${kernelTone(notebook.default_kernel)}`}
                        style={{ fontSize: 11, textTransform: 'uppercase' }}
                      >
                        {notebook.default_kernel}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{notebook.owner_id}</td>
                    <td>{formatDate(notebook.updated_at)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link to={`/notebooks/${notebook.id}`} className="of-button" style={{ fontSize: 11 }}>
                        Open
                      </Link>
                      <button
                        type="button"
                        className="of-button of-btn-danger"
                        onClick={() => setConfirmId(notebook.id)}
                        style={{ marginLeft: 6, fontSize: 11 }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span className="of-text-muted" style={{ fontSize: 12 }}>
          Page {page} of {totalPages}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="of-button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="of-button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>

      <CreateNotebookModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(notebook) => navigate(`/notebooks/${notebook.id}`)}
      />

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete notebook"
        message={`This permanently removes ${selectedNotebook?.name ?? 'this notebook'} and its history. Continue?`}
        confirmLabel="Delete"
        danger
        busy={confirmBusy}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmId(null)}
      />
    </section>
  );
}
