import { useEffect, useState, type FormEvent } from 'react';

interface RequestDataDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { title: string; description: string; useCase: string }) => void;
}

export function RequestDataDialog({ open, onClose, onSubmit }: RequestDataDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setUseCase('');
    setSubmitting(false);
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    onSubmit({ title: title.trim(), description: description.trim(), useCase: useCase.trim() });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-data-title"
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
        background: 'rgba(17, 24, 39, 0.42)',
        padding: 16,
      }}
    >
      <form
        className="of-panel"
        onSubmit={submit}
        style={{ width: '100%', maxWidth: 540, background: 'var(--bg-panel)', boxShadow: 'var(--shadow-popover)' }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: '1px solid var(--border-default)',
            padding: '14px 16px',
          }}
        >
          <div>
            <p className="of-eyebrow" style={{ margin: 0 }}>Data Catalog</p>
            <h2 id="request-data-title" className="of-heading-md" style={{ marginTop: 4 }}>
              Request data
            </h2>
          </div>
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={submitting}>
            Close
          </button>
        </header>

        <div style={{ display: 'grid', gap: 12, padding: 16 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
            What data are you looking for?
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Aviation flight delays 2024"
              className="of-input"
              autoFocus
            />
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Why do you need it?
            <textarea
              value={useCase}
              onChange={(event) => setUseCase(event.target.value)}
              rows={2}
              placeholder="Use case, downstream pipeline or dashboard"
              className="of-input"
              style={{ minHeight: 60, resize: 'vertical' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Additional context
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Schema, refresh frequency, owners you have already contacted"
              className="of-input"
              style={{ minHeight: 80, resize: 'vertical' }}
            />
          </label>
        </div>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            borderTop: '1px solid var(--border-default)',
            padding: '12px 16px',
          }}
        >
          <button type="button" className="of-button of-button--ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="of-button of-button--primary" disabled={submitting || !title.trim()}>
            {submitting ? 'Sending...' : 'Send request'}
          </button>
        </footer>
      </form>
    </div>
  );
}
