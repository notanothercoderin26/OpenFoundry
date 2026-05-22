import { PlaceholderDialog } from './PlaceholderDialog';

export interface NewTagDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewTagDialog({ open, onClose }: NewTagDialogProps) {
  return (
    <PlaceholderDialog
      open={open}
      onClose={onClose}
      title="Create new tag"
      description="Tag creation with regex validation from repoSettings.json ships in Phase 3."
      phase="Phase 3"
    />
  );
}
