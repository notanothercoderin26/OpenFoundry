import { PlaceholderDialog } from './PlaceholderDialog';

export interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UpgradeDialog({ open, onClose }: UpgradeDialogProps) {
  return (
    <PlaceholderDialog
      open={open}
      onClose={onClose}
      title="Upgrade language versions"
      description="Package upgrade flow ships in Phase 3."
      phase="Phase 3"
    />
  );
}
