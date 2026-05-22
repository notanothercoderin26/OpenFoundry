import { PlaceholderDialog } from './PlaceholderDialog';

export interface ResetDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ResetDialog({ open, onClose }: ResetDialogProps) {
  return (
    <PlaceholderDialog
      open={open}
      onClose={onClose}
      title="Reset branch"
      description="Hard reset to origin/<branch> ships in Phase 3."
      phase="Phase 3"
    />
  );
}
