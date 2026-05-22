import { PlaceholderDialog } from './PlaceholderDialog';

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ShareDialog({ open, onClose }: ShareDialogProps) {
  return (
    <PlaceholderDialog
      open={open}
      onClose={onClose}
      title="Share repository"
      description="Per-repo ACL (Owner / Editor / Viewer) ships in Phase 5 once the code-repository-review-service exposes a permissions endpoint."
      phase="Phase 5"
    />
  );
}
