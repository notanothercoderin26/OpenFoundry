import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface SettingsModalProps {
  open: boolean;
  title: string;
  description?: string;
  width?: number;
  busy?: boolean;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryBusyLabel?: string;
  cancelLabel?: string;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function SettingsModal({
  open,
  title,
  description,
  width = 520,
  busy = false,
  primaryLabel,
  primaryDisabled = false,
  primaryBusyLabel,
  cancelLabel = 'Cancel',
  onSubmit,
  onClose,
  children,
}: SettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="settings-modal-backdrop"
    >
      <form
        className="settings-modal"
        style={{ width: '100%', maxWidth: width }}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || primaryDisabled) return;
          onSubmit();
        }}
      >
        <header className="settings-modal__header">
          <div>
            <div id="settings-modal-title" className="of-heading-sm">
              {title}
            </div>
            {description && (
              <p className="of-text-muted" style={{ marginTop: 4, fontSize: 12 }}>
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="of-btn of-btn-ghost settings-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="settings-modal__body of-scrollbar">{children}</div>
        <footer className="settings-modal__footer">
          <button
            type="button"
            className="of-btn of-btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className="of-btn of-btn-primary"
            disabled={busy || primaryDisabled}
          >
            {busy ? primaryBusyLabel ?? 'Saving…' : primaryLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
