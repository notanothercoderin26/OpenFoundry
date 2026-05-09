import { useEffect, useState, type FormEvent } from 'react';

import { createNotebook, type Notebook, type NotebookKernel } from '@/lib/api/notebooks';

import { KernelSelector } from './KernelSelector';

interface CreateNotebookModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (notebook: Notebook) => void;
}

export function CreateNotebookModal({ open, onClose, onCreated }: CreateNotebookModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kernel, setKernel] = useState<NotebookKernel>('python');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setKernel('python');
    setSubmitting(false);
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, onClose, submitting]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSubmitting(true);
    setError('');
    try {
      const notebook = await createNotebook({
        name: trimmedName,
        description: description.trim() || undefined,
        default_kernel: kernel,
      });
      onCreated(notebook);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create notebook');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(31, 37, 45, 0.46)',
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-notebook-title"
        className="of-panel"
        onSubmit={(event) => void submit(event)}
        style={{ width: 'min(560px, 100%)', overflow: 'hidden', background: 'var(--bg-panel)' }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: '1px solid var(--border-default)',
            padding: '12px 16px',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>
              NOTEBOOK-001
            </p>
            <h2 id="create-notebook-title" className="of-heading-sm" style={{ marginTop: 4 }}>
              New notebook
            </h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </header>

        <div style={{ display: 'grid', gap: 12, padding: 16 }}>
          {error ? (
            <div className="of-status-danger" style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
              {error}
            </div>
          ) : null}

          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="of-input"
              placeholder="Customer churn exploration"
              autoFocus
              required
            />
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="of-input"
              rows={3}
              placeholder="Analysis scope, source datasets, and intended audience."
              style={{ minHeight: 86, resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Default kernel</span>
            <KernelSelector
              value={kernel}
              disabled={submitting}
              showSessionControls={false}
              onChange={setKernel}
            />
          </div>
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            borderTop: '1px solid var(--border-default)',
            background: 'var(--bg-panel-muted)',
            padding: '12px 16px',
          }}
        >
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="of-button of-button--primary" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating...' : 'Create notebook'}
          </button>
        </footer>
      </form>
    </div>
  );
}
