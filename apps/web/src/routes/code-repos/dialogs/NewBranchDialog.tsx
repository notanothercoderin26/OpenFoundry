import { PlaceholderDialog } from './PlaceholderDialog';

export interface NewBranchDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewBranchDialog({ open, onClose }: NewBranchDialogProps) {
  return (
    <PlaceholderDialog
      open={open}
      onClose={onClose}
      title="Create new branch"
      description="The full Foundry-style flow — Global vs. Code Repositories branch, ontology selector, branch security — lands in Phase 3."
      phase="Phase 3"
    />
  );
}
