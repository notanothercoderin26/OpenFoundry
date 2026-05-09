import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { MonacoEditor } from '@components/MonacoEditor';
import { CellEditor } from '@/lib/components/notebook/CellEditor';
import { CellOutput } from '@/lib/components/notebook/CellOutput';
import { KernelSelector } from '@/lib/components/notebook/KernelSelector';
import { Glyph } from '@/lib/components/ui/Glyph';
import {
  addCell,
  createSession,
  deleteCell,
  deleteWorkspaceFile,
  executeAllCells,
  executeCell,
  getNotebook,
  listSessions,
  listWorkspaceFiles,
  stopSession,
  updateCell,
  updateNotebook,
  upsertWorkspaceFile,
  type Cell,
  type CellOutput as NotebookCellOutput,
  type Notebook,
  type NotebookKernel,
  type NotebookWorkspaceFile,
  type Session,
} from '@/lib/api/notebooks';

const KERNELS: NotebookKernel[] = ['python', 'sql', 'llm', 'r'];

const KERNEL_LABELS: Record<NotebookKernel, string> = {
  python: 'Python',
  sql: 'SQL',
  llm: 'LLM',
  r: 'R',
};

function emptySessions(): Record<NotebookKernel, Session | null> {
  return { python: null, sql: null, llm: null, r: null };
}

function kernelKey(kernel: string): NotebookKernel {
  if (kernel === 'sql' || kernel === 'llm' || kernel === 'r') return kernel;
  return 'python';
}

function isLiveSession(session: Session | null | undefined) {
  return Boolean(session) && session?.status !== 'dead';
}

function sortCells(cells: Cell[]) {
  return [...cells].sort((a, b) => a.position - b.position);
}

function sortWorkspaceFiles(files: NotebookWorkspaceFile[]) {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

function cellLanguage(cell: Cell) {
  if (cell.cell_type === 'markdown') return 'markdown';
  const kernel = kernelKey(cell.kernel);
  return kernel === 'llm' ? 'markdown' : kernel;
}

function workspaceEditorLanguage(file: NotebookWorkspaceFile | null) {
  if (!file) return 'text';
  const supported = ['markdown', 'typescript', 'javascript', 'json', 'python', 'sql', 'r', 'toml'];
  return supported.includes(file.language) ? file.language : 'text';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export function NotebookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const notebookId = id ?? '';

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [outputs, setOutputs] = useState<Record<string, NotebookCellOutput>>({});
  const [executing, setExecuting] = useState<Record<string, boolean>>({});
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [deletingCells, setDeletingCells] = useState<Record<string, boolean>>({});
  const [sessionsByKernel, setSessionsByKernel] = useState<Record<NotebookKernel, Session | null>>(emptySessions);
  const [activeKernel, setActiveKernel] = useState<NotebookKernel>('python');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runAllBusy, setRunAllBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [workspaceFiles, setWorkspaceFiles] = useState<NotebookWorkspaceFile[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [selectedWorkspaceFilePath, setSelectedWorkspaceFilePath] = useState('');
  const [newWorkspaceFilePath, setNewWorkspaceFilePath] = useState('');
  const [savingWorkspaceFile, setSavingWorkspaceFile] = useState<Record<string, boolean>>({});

  function upsertCell(nextCell: Cell) {
    setCells((prev) =>
      sortCells(prev.map((cell) => (cell.id === nextCell.id ? nextCell : cell))),
    );
  }

  function updateSession(kernel: NotebookKernel, session: Session | null) {
    setSessionsByKernel((prev) => ({ ...prev, [kernel]: session }));
  }

  function syncWorkspaceSelection(files: NotebookWorkspaceFile[], current: string) {
    if (files.length === 0) return '';
    if (!files.some((file) => file.path === current)) return files[0].path;
    return current;
  }

  async function loadSessionsForNotebook() {
    const res = await listSessions(notebookId);
    const next = emptySessions();
    for (const session of res.data) {
      const key = kernelKey(session.kernel);
      if (!next[key] || session.status !== 'dead') next[key] = session;
    }
    setSessionsByKernel(next);
    return next;
  }

  async function loadWorkspace() {
    setLoadingWorkspace(true);
    try {
      const res = await listWorkspaceFiles(notebookId);
      const files = sortWorkspaceFiles(res.data);
      setWorkspaceFiles(files);
      setSelectedWorkspaceFilePath((current) => syncWorkspaceSelection(files, current));
      return files;
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to load notebook workspace'));
      setWorkspaceFiles([]);
      return [];
    } finally {
      setLoadingWorkspace(false);
    }
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [res] = await Promise.all([getNotebook(notebookId), loadWorkspace()]);
      setNotebook(res.notebook);
      const sortedCells = sortCells(res.cells);
      setCells(sortedCells);
      const initialOutputs: Record<string, NotebookCellOutput> = {};
      for (const cell of sortedCells) {
        if (cell.last_output) initialOutputs[cell.id] = cell.last_output;
      }
      setOutputs(initialOutputs);
      setActiveKernel(kernelKey(res.notebook.default_kernel));
      await loadSessionsForNotebook();
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to load notebook'));
      setNotebook(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (notebookId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  async function ensureSession(kernel: NotebookKernel): Promise<Session> {
    const existing = sessionsByKernel[kernel];
    if (isLiveSession(existing)) return existing as Session;
    const session = await createSession(notebookId, kernel);
    updateSession(kernel, session);
    return session;
  }

  async function handleKernelChange(kernel: NotebookKernel) {
    setActiveKernel(kernel);
    if (!notebook || notebook.default_kernel === kernel) return;
    try {
      const next = await updateNotebook(notebookId, { default_kernel: kernel });
      setNotebook(next);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to update default kernel'));
    }
  }

  async function handleStartSession() {
    setSessionBusy(true);
    try {
      await ensureSession(activeKernel);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to start notebook session'));
    } finally {
      setSessionBusy(false);
    }
  }

  async function handleStopSession() {
    const current = sessionsByKernel[activeKernel];
    if (!current) return;
    setSessionBusy(true);
    try {
      const stopped = await stopSession(notebookId, current.id);
      updateSession(activeKernel, stopped);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to stop notebook session'));
    } finally {
      setSessionBusy(false);
    }
  }

  async function handleAddCell(type: 'code' | 'markdown') {
    try {
      const cell = await addCell(notebookId, {
        cell_type: type,
        kernel: type === 'code' ? activeKernel : undefined,
        source: '',
      });
      setCells((prev) => sortCells([...prev, cell]));
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to add cell'));
    }
  }

  function handleSourceChange(cellId: string, source: string) {
    setCells((prev) => prev.map((cell) => (cell.id === cellId ? { ...cell, source } : cell)));
  }

  async function handlePersistSource(cellId: string, source: string) {
    setSavingCells((prev) => ({ ...prev, [cellId]: true }));
    try {
      const updated = await updateCell(notebookId, cellId, { source });
      upsertCell(updated);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to save cell'));
    } finally {
      setSavingCells((prev) => ({ ...prev, [cellId]: false }));
    }
  }

  async function handleCellKernelChange(cellId: string, kernel: NotebookKernel) {
    try {
      const updated = await updateCell(notebookId, cellId, { kernel });
      upsertCell(updated);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to update cell kernel'));
    }
  }

  async function handleDeleteCell(cellId: string) {
    setDeletingCells((prev) => ({ ...prev, [cellId]: true }));
    try {
      await deleteCell(notebookId, cellId);
      setCells((prev) => prev.filter((cell) => cell.id !== cellId));
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to delete cell'));
    } finally {
      setDeletingCells((prev) => ({ ...prev, [cellId]: false }));
    }
  }

  async function handleExecute(cellId: string) {
    const cell = cells.find((entry) => entry.id === cellId);
    if (!cell || cell.cell_type !== 'code') return;

    const key = kernelKey(cell.kernel);
    let sessionForCell: Session | null = null;
    setExecuting((prev) => ({ ...prev, [cellId]: true }));

    try {
      sessionForCell = await ensureSession(key);
      updateSession(key, { ...sessionForCell, status: 'busy' });

      const output = await executeCell(notebookId, cellId, sessionForCell.id);
      setOutputs((prev) => ({ ...prev, [cellId]: output }));
      setCells((prev) =>
        prev.map((entry) =>
          entry.id === cellId
            ? { ...entry, execution_count: output.execution_count, last_output: output }
            : entry,
        ),
      );
      updateSession(key, {
        ...sessionForCell,
        status: 'idle',
        last_activity: new Date().toISOString(),
      });
      setError('');
    } catch (cause) {
      setOutputs((prev) => ({
        ...prev,
        [cellId]: {
          output_type: 'error',
          content: errorMessage(cause, 'Execution failed'),
          execution_count: (cell.execution_count ?? 0) + 1,
        },
      }));
      if (sessionForCell) {
        updateSession(key, { ...sessionForCell, status: 'idle' });
      }
    } finally {
      setExecuting((prev) => ({ ...prev, [cellId]: false }));
    }
  }

  async function handleRunAll() {
    const codeCells = cells.filter((cell) => cell.cell_type === 'code');
    if (codeCells.length === 0) return;

    let sessionForRun: Session | null = null;
    setRunAllBusy(true);
    try {
      sessionForRun = await ensureSession(activeKernel);
      updateSession(activeKernel, { ...sessionForRun, status: 'busy' });
      const res = await executeAllCells(notebookId, sessionForRun.id);
      const nextOutputs = new Map(res.results.map((result) => [result.cell_id, result.output]));

      setOutputs((prev) => {
        const next = { ...prev };
        for (const result of res.results) {
          next[result.cell_id] = result.output;
        }
        return next;
      });
      setCells((prev) =>
        prev.map((cell) => {
          const output = nextOutputs.get(cell.id);
          return output ? { ...cell, execution_count: output.execution_count, last_output: output } : cell;
        }),
      );
      updateSession(activeKernel, {
        ...sessionForRun,
        status: 'idle',
        last_activity: new Date().toISOString(),
      });
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to run notebook'));
      if (sessionForRun) updateSession(activeKernel, { ...sessionForRun, status: 'idle' });
    } finally {
      setRunAllBusy(false);
    }
  }

  async function addWorkspaceFile() {
    const path = newWorkspaceFilePath.trim();
    if (!path) return;
    if (workspaceFiles.some((file) => file.path === path)) {
      setError('That workspace file already exists.');
      return;
    }
    try {
      const file = await upsertWorkspaceFile(notebookId, { path, content: '' });
      const next = sortWorkspaceFiles([...workspaceFiles, file]);
      setWorkspaceFiles(next);
      setSelectedWorkspaceFilePath(file.path);
      setNewWorkspaceFilePath('');
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to add workspace file'));
    }
  }

  function handleWorkspaceContentChange(path: string, content: string) {
    setWorkspaceFiles((prev) => prev.map((file) => (file.path === path ? { ...file, content } : file)));
  }

  async function persistWorkspaceFile(path: string, content: string) {
    setSavingWorkspaceFile((prev) => ({ ...prev, [path]: true }));
    try {
      const file = await upsertWorkspaceFile(notebookId, { path, content });
      setWorkspaceFiles((prev) => sortWorkspaceFiles(prev.map((entry) => (entry.path === path ? file : entry))));
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to save workspace file'));
    } finally {
      setSavingWorkspaceFile((prev) => ({ ...prev, [path]: false }));
    }
  }

  async function removeWorkspaceFile(path: string) {
    try {
      await deleteWorkspaceFile(notebookId, path);
      const next = workspaceFiles.filter((file) => file.path !== path);
      setWorkspaceFiles(next);
      setSelectedWorkspaceFilePath((current) => syncWorkspaceSelection(next, current));
      setError('');
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to remove workspace file'));
    }
  }

  if (loading) {
    return (
      <section className="of-page notebook-detail__loading">
        Loading notebook...
      </section>
    );
  }

  if (!notebook) {
    return (
      <section className="of-page notebook-detail__loading notebook-detail__loading--error">
        <p>Notebook not found.</p>
        <Link to="/notebooks" className="of-btn">
          Back to notebooks
        </Link>
      </section>
    );
  }

  const codeCellCount = cells.filter((cell) => cell.cell_type === 'code').length;
  const liveSessionCount = KERNELS.filter((kernel) => isLiveSession(sessionsByKernel[kernel])).length;
  const selectedWorkspaceFile = workspaceFiles.find((file) => file.path === selectedWorkspaceFilePath) ?? null;

  return (
    <section className="of-page notebook-detail">
      <header className="notebook-detail__header">
        <div className="notebook-detail__title">
          <p className="of-eyebrow">NOTEBOOK-002</p>
          <h1 className="of-heading-xl">{notebook.name}</h1>
          <p className="of-text-muted">
            {notebook.description || 'No description'}
          </p>
        </div>
        <div className="notebook-detail__actions">
          <button
            type="button"
            className="of-btn of-btn-primary"
            disabled={runAllBusy || codeCellCount === 0}
            onClick={() => void handleRunAll()}
          >
            <Glyph name="run" size={14} />
            {runAllBusy ? 'Running...' : 'Run all'}
          </button>
          <Link to="/notebooks" className="of-btn">
            Back
          </Link>
        </div>
      </header>

      {error && (
        <div className="of-status-danger notebook-detail__notice" role="alert">
          {error}
        </div>
      )}

      <div className="notebook-detail__summary">
        <section className="of-panel notebook-detail__stat">
          <p className="of-eyebrow">Cells</p>
          <strong>{cells.length}</strong>
          <span>{codeCellCount} executable</span>
        </section>
        <section className="of-panel notebook-detail__stat">
          <p className="of-eyebrow">Sessions</p>
          <strong>{liveSessionCount}</strong>
          <span>{KERNEL_LABELS[activeKernel]} selected</span>
        </section>
        <section className="of-panel notebook-detail__stat">
          <p className="of-eyebrow">Workspace</p>
          <strong>{workspaceFiles.length}</strong>
          <span>persisted files</span>
        </section>
        <section className="of-panel notebook-detail__stat">
          <p className="of-eyebrow">Updated</p>
          <strong>{formatDateTime(notebook.updated_at).split(',')[0]}</strong>
          <span>{formatDateTime(notebook.updated_at).split(',').slice(1).join(',').trim() || 'local time'}</span>
        </section>
      </div>

      <section className="of-panel-muted notebook-detail__kernel-panel">
        <KernelSelector
          value={activeKernel}
          status={sessionsByKernel[activeKernel]?.status ?? null}
          disabled={sessionBusy}
          onChange={(kernel) => void handleKernelChange(kernel)}
          onStart={() => void handleStartSession()}
          onStop={() => void handleStopSession()}
        />
        <div className="notebook-detail__kernel-strip">
          {KERNELS.map((kernel) => {
            const session = sessionsByKernel[kernel];
            return (
              <span
                key={kernel}
                className={`of-chip ${isLiveSession(session) ? 'of-status-success' : ''}`}
              >
                {KERNEL_LABELS[kernel]}: {session?.status ?? 'offline'}
              </span>
            );
          })}
        </div>
      </section>

      <div className="notebook-detail__workspace">
        <main className="notebook-detail__cells">
          {cells.length === 0 ? (
            <section className="of-panel notebook-detail__empty">
              <p className="of-heading-sm">No cells yet</p>
              <p className="of-text-muted">Add a code or markdown cell to start the notebook.</p>
              <div className="notebook-detail__button-row">
                <button type="button" className="of-btn of-btn-primary" onClick={() => void handleAddCell('code')}>
                  <Glyph name="plus" size={14} />
                  Code cell
                </button>
                <button type="button" className="of-btn" onClick={() => void handleAddCell('markdown')}>
                  <Glyph name="plus" size={14} />
                  Markdown cell
                </button>
              </div>
            </section>
          ) : (
            cells.map((cell) => (
              <section key={cell.id} className="of-panel notebook-cell">
                <div className="notebook-cell__toolbar">
                  <span className="of-chip">In [{cell.execution_count ?? ' '}]</span>
                  <span className="of-chip">{cell.cell_type}</span>

                  {cell.cell_type === 'code' ? (
                    <select
                      className="of-select notebook-cell__kernel"
                      value={kernelKey(cell.kernel)}
                      onChange={(event) =>
                        void handleCellKernelChange(cell.id, event.target.value as NotebookKernel)
                      }
                    >
                      {KERNELS.map((kernel) => (
                        <option key={kernel} value={kernel}>
                          {kernel}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="of-chip">markdown</span>
                  )}

                  <span className="notebook-cell__save-state">
                    {savingCells[cell.id] ? 'Saving...' : `Updated ${formatDateTime(cell.updated_at)}`}
                  </span>

                  <div className="notebook-cell__actions">
                    {cell.cell_type === 'code' && (
                      <button
                        type="button"
                        className="of-btn"
                        disabled={executing[cell.id]}
                        onClick={() => void handleExecute(cell.id)}
                      >
                        <Glyph name="run" size={14} />
                        {executing[cell.id] ? 'Running...' : 'Run'}
                      </button>
                    )}

                    <button
                      type="button"
                      className="of-btn of-btn-danger"
                      disabled={deletingCells[cell.id]}
                      onClick={() => void handleDeleteCell(cell.id)}
                      aria-label="Delete cell"
                      title="Delete cell"
                    >
                      <Glyph name="x" size={14} />
                    </button>
                  </div>
                </div>

                <CellEditor
                  value={cell.source}
                  language={cellLanguage(cell)}
                  minHeight={cell.cell_type === 'markdown' ? 128 : 196}
                  onChange={(source) => handleSourceChange(cell.id, source)}
                  onBlur={(source) => void handlePersistSource(cell.id, source)}
                />

                <CellOutput output={outputs[cell.id] ?? cell.last_output} />
              </section>
            ))
          )}

          {cells.length > 0 && (
            <div className="of-toolbar notebook-detail__add-cell">
              <button type="button" className="of-btn of-btn-primary" onClick={() => void handleAddCell('code')}>
                <Glyph name="plus" size={14} />
                Code cell
              </button>
              <button type="button" className="of-btn" onClick={() => void handleAddCell('markdown')}>
                <Glyph name="plus" size={14} />
                Markdown cell
              </button>
            </div>
          )}
        </main>

        <aside className="notebook-detail__files">
          <section className="of-panel notebook-files">
            <div className="notebook-files__header">
              <div>
                <p className="of-eyebrow">Workspace files</p>
                <p className="of-text-muted">Helper files, prompts, scripts, and notes stored with this notebook.</p>
              </div>
              <span className="of-chip">{workspaceFiles.length}</span>
            </div>

            <div className="notebook-files__create">
              <input
                className="of-input"
                value={newWorkspaceFilePath}
                onChange={(event) => setNewWorkspaceFilePath(event.target.value)}
                placeholder="prompts/system.md"
              />
              <button type="button" className="of-btn" onClick={() => void addWorkspaceFile()}>
                <Glyph name="plus" size={14} />
                Add
              </button>
            </div>

            {loadingWorkspace ? (
              <div className="notebook-files__empty">Loading workspace...</div>
            ) : workspaceFiles.length === 0 ? (
              <div className="notebook-files__empty">No workspace files yet.</div>
            ) : (
              <div className="notebook-files__body">
                <div className="notebook-files__list">
                  {workspaceFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className={`notebook-files__item ${
                        selectedWorkspaceFilePath === file.path ? 'notebook-files__item--active' : ''
                      }`}
                      onClick={() => setSelectedWorkspaceFilePath(file.path)}
                    >
                      <span>{file.path}</span>
                      <small>{file.language} | {file.size_bytes} bytes</small>
                    </button>
                  ))}
                </div>

                {selectedWorkspaceFile && (
                  <div className="notebook-files__editor">
                    <div className="notebook-files__selected">
                      <span className="of-chip">{selectedWorkspaceFile.path}</span>
                      <button
                        type="button"
                        className="of-btn of-btn-danger"
                        onClick={() => void removeWorkspaceFile(selectedWorkspaceFile.path)}
                      >
                        Remove
                      </button>
                    </div>

                    <MonacoEditor
                      value={selectedWorkspaceFile.content ?? ''}
                      language={workspaceEditorLanguage(selectedWorkspaceFile)}
                      minHeight={360}
                      onChange={(content) =>
                        handleWorkspaceContentChange(selectedWorkspaceFile.path, content)
                      }
                      onBlur={(content) =>
                        void persistWorkspaceFile(selectedWorkspaceFile.path, content)
                      }
                    />

                    <div className="notebook-files__saved">
                      {savingWorkspaceFile[selectedWorkspaceFile.path]
                        ? 'Saving...'
                        : `Updated ${formatDateTime(selectedWorkspaceFile.updated_at)}`}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
