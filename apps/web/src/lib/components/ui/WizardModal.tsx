import { useEffect, useRef, type ReactNode } from 'react';
import { Glyph } from '@/lib/components/ui/Glyph';

export interface WizardStep {
  id: string;
  label: string;
}

export interface WizardModalProps {
  open: boolean;
  title: string;
  steps: WizardStep[];
  activeStepId: string;
  completedStepIds?: string[];
  onClose: () => void;
  onStepClick?: (stepId: string) => void;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  children: ReactNode;
  width?: number | string;
  height?: number | string;
}

export function WizardModal({
  open,
  title,
  steps,
  activeStepId,
  completedStepIds = [],
  onClose,
  onStepClick,
  footerLeft,
  footerRight,
  children,
  width = 960,
  height = 640,
}: WizardModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    // Move focus into the dialog so subsequent Tabs land inside it instead of
    // the previously focused control behind the backdrop.
    const id = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(id);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: 'calc(100vw - 48px)',
          height,
          maxHeight: 'calc(100vh - 48px)',
          background: 'var(--bg-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)' }}>
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <Glyph name="x" size={18} />
          </button>
        </header>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <nav
            aria-label="Wizard steps"
            style={{
              width: 240,
              flexShrink: 0,
              borderRight: '1px solid var(--border-subtle)',
              padding: '24px 0',
              background: 'var(--bg-default)',
              overflowY: 'auto',
            }}
          >
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {steps.map((step, index) => {
                const isActive = step.id === activeStepId;
                const isCompleted = completedStepIds.includes(step.id);
                const isClickable = Boolean(onStepClick) && (isCompleted || isActive);

                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      disabled={!isClickable}
                      onClick={() => isClickable && onStepClick?.(step.id)}
                      aria-current={isActive ? 'step' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        width: '100%',
                        padding: '10px 20px',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: isClickable ? 'pointer' : 'default',
                        font: 'inherit',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: isActive
                            ? 'var(--status-info)'
                            : isCompleted
                              ? 'var(--badge-healthy-bg)'
                              : 'var(--bg-chip)',
                          color: isActive
                            ? '#ffffff'
                            : isCompleted
                              ? 'var(--badge-healthy-text)'
                              : 'var(--text-muted)',
                          fontSize: 12,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {isCompleted ? <Glyph name="check" size={14} /> : index + 1}
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: isActive ? 600 : 500,
                          color: isActive
                            ? 'var(--status-info)'
                            : isCompleted
                              ? 'var(--text-default)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {step.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              padding: '24px 28px',
              overflowY: 'auto',
              background: 'var(--bg-default)',
            }}
          >
            {children}
          </div>
        </div>

        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel-muted)',
            minHeight: 56,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{footerLeft}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{footerRight}</div>
        </footer>
      </div>
    </div>
  );
}
