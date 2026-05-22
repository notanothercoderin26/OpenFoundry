import { MergeRequestDetail } from '@/lib/components/code-repo/MergeRequestDetail';
import { MergeRequestList } from '@/lib/components/code-repo/MergeRequestList';

import { useRepoState } from '../../state/RepoContext';

export function PullRequestsTab() {
  const {
    mergeRequests,
    mergeRequestDetail,
    selectedMergeRequestId,
    branchOptions,
    mergeRequestDraft,
    commentDraft,
    busy,
    mergeBlockers,
    latestSourceCi,
    targetBranchProtected,
    selectMergeRequest,
    setMergeRequestDraft,
    createMergeRequestAction,
    setCommentDraft,
    createCommentAction,
    changeMergeRequestStatus,
    updateReviewerState,
    mergeSelectedMergeRequest,
  } = useRepoState();

  return (
    <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'minmax(0, 0.92fr) minmax(0, 1.08fr)' }}>
      <MergeRequestList
        mergeRequests={mergeRequests}
        selectedMergeRequestId={selectedMergeRequestId}
        branchOptions={branchOptions}
        draft={mergeRequestDraft}
        busy={busy}
        onSelectMergeRequest={(id) => void selectMergeRequest(id)}
        onDraftChange={setMergeRequestDraft}
        onCreateMergeRequest={() => void createMergeRequestAction()}
      />
      <MergeRequestDetail
        detail={mergeRequestDetail}
        draft={commentDraft}
        busy={busy}
        mergeBlockers={mergeBlockers}
        latestSourceCi={latestSourceCi}
        targetBranchProtected={targetBranchProtected}
        onDraftChange={setCommentDraft}
        onCreateComment={() => void createCommentAction()}
        onStatusChange={(status) => void changeMergeRequestStatus(status)}
        onReviewerStateChange={(reviewer, approved, state) =>
          void updateReviewerState(reviewer, approved, state)
        }
        onMerge={() => void mergeSelectedMergeRequest()}
      />
    </div>
  );
}
