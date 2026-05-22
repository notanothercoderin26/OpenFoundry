import { Glyph } from '@/lib/components/ui/Glyph';

export interface PlaceholderDialogProps {
  open: boolean;
  title: string;
  description?: string;
  phase: string;
  onClose: () => void;
}

/**
 * Shared scaffolding for the Phase 0 dialog stubs. Each dialog file in this
 * folder renders a thin wrapper over this component so the structural plan
 * (NewBranchDialog, NewTagDialog, MergeDialog, ResetDialog, UpgradeDialog) is
 * present and importable, while the real form ships in Phase 3.
 */
export function PlaceholderDialog({ open, title, description, phase, onClose }: PlaceholderDialogProps) {
  if (!open) return null;
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md mx-4 rounded-of-md border border-of-border bg-of-surface-raised shadow-of-card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 h-11 border-b border-of-border">
          <h2 className="text-of-14 font-of-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded-of-sm text-of-text-muted hover:bg-of-surface-muted hover:text-of-text"
            aria-label="Close"
          >
            <Glyph name="x" size={14} tone="currentColor" />
          </button>
        </header>
        <div className="px-4 py-5 text-of-13 text-of-text-muted space-y-3">
          <p>{description ?? `This dialog ships in ${phase}.`}</p>
          <p className="text-of-12 text-of-text-soft">
            Phase 0 scaffolds the file so subsequent work can drop a real form in without touching call sites.
          </p>
        </div>
        <footer className="flex justify-end gap-2 px-4 h-12 border-t border-of-border">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-8 px-3 rounded-of-sm text-of-12 font-of-medium bg-of-surface-muted text-of-text hover:bg-of-border"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
