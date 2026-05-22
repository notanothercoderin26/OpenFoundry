import { PlaceholderDialog } from './PlaceholderDialog';

export interface MergeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function MergeDialog({ open, onClose }: MergeDialogProps) {
  return (
    <PlaceholderDialog
      open={open}
      onClose={onClose}
      title="Merge another branch"
      description="Branch-into-branch merge with commit message + sign-off ships in Phase 3."
      phase="Phase 3"
    />
  );
}
