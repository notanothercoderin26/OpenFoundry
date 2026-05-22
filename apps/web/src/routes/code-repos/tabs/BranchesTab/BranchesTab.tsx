import { BranchManager } from '@/lib/components/code-repo/BranchManager';

import { useRepoContext } from '../../state/useRepoContext';

export function BranchesTab() {
  const {
    branches,
    tags,
    branchDraft,
    busy,
    setBranchDraft,
    createBranchAction,
    switchBranchAction,
    deleteBranchAction,
    mergeBranchAction,
    createTagAction,
  } = useRepoContext();

  return (
    <div className="p-4">
      <BranchManager
        branches={branches}
        tags={tags}
        draft={branchDraft}
        busy={busy}
        onDraftChange={setBranchDraft}
        onCreateBranch={() => void createBranchAction()}
        onSwitchBranch={(branch) => void switchBranchAction(branch)}
        onDeleteBranch={(branch) => void deleteBranchAction(branch)}
        onMergeBranch={(branch, target) => void mergeBranchAction(branch, target)}
        onCreateTag={(name, target, message, protectedTag) =>
          void createTagAction(name, target, message, protectedTag)
        }
      />
    </div>
  );
}
