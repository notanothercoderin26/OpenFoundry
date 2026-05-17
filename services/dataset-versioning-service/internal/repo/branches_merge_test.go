// Unit tests for Repo.MergeRuntimeBranch — drive the fast-forward
// state machine through pgxmock so we exercise every branch of the
// in-transaction precondition checks without needing testcontainers.
//
// The matching HTTP-layer behaviour (200 / 400 / 404 / 412 mapping,
// audit emission, auth) is covered by handler tests under
// internal/handlers/branches_merge_test.go.
package repo_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/dataset-versioning-service/internal/repo"
)

var branchScanCols = []string{
	"id", "rid", "dataset_id", "dataset_rid", "name", "parent_branch_id", "head_transaction_id",
	"created_from_transaction_id", "last_activity_at", "labels", "fallback_chain", "created_at", "updated_at",
}

// branchRow synthesises a row matching `scanRuntimeBranch`'s column
// list; nil for parent_branch_id flags the root branch.
func branchRow(t *testing.T, id, datasetID uuid.UUID, name string, parent, head, createdFrom *uuid.UUID) *pgxmock.Rows {
	t.Helper()
	now := time.Now().UTC()
	return pgxmock.NewRows(branchScanCols).AddRow(
		id,
		"ri.foundry.main.branch."+id.String(),
		datasetID,
		"ri.foundry.main.dataset."+datasetID.String(),
		name,
		parent,
		head,
		createdFrom,
		now,
		[]byte(`{}`),
		[]string{},
		now,
		now,
	)
}

// TestMergeRuntimeBranchFastForwardsWhenTargetIsAtForkPoint pins the
// happy path: target.head == source.created_from, source is a
// descendant of target — HEAD must advance to source.head, response
// must report FastForwarded=true.
func TestMergeRuntimeBranchFastForwardsWhenTargetIsAtForkPoint(t *testing.T) {
	ctx := context.Background()
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)
	defer mock.Close()

	datasetID := uuid.New()
	targetID := uuid.New()
	sourceID := uuid.New()
	forkTxn := uuid.New()
	sourceHead := uuid.New()
	actor := uuid.New()

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "main").
		WillReturnRows(branchRow(t, targetID, datasetID, "main", nil, &forkTxn, nil))
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "feature").
		WillReturnRows(branchRow(t, sourceID, datasetID, "feature", &targetID, &sourceHead, &forkTxn))
	mock.ExpectQuery("WITH RECURSIVE chain").
		WithArgs(sourceID, datasetID, targetID).
		WillReturnRows(pgxmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectExec("UPDATE dataset_branches").
		WithArgs(targetID, sourceHead, datasetID).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(targetID).
		WillReturnRows(branchRow(t, targetID, datasetID, "main", nil, &sourceHead, nil))
	mock.ExpectCommit()

	r := &repo.Repo{Pool: mock}
	out, err := r.MergeRuntimeBranch(ctx, datasetID, "main", "feature", actor)
	require.NoError(t, err)
	require.NotNil(t, out)
	assert.True(t, out.FastForwarded)
	assert.False(t, out.AlreadyMerged)
	require.NotNil(t, out.Branch.HeadTransactionID)
	assert.Equal(t, sourceHead, *out.Branch.HeadTransactionID)
	require.NotNil(t, out.NewHeadTransactionRID)
	assert.Equal(t, "ri.foundry.main.transaction."+sourceHead.String(), *out.NewHeadTransactionRID)
	require.NotNil(t, out.PreviousHeadTransactionRID)
	assert.Equal(t, "ri.foundry.main.transaction."+forkTxn.String(), *out.PreviousHeadTransactionRID)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestMergeRuntimeBranchIsIdempotentWhenAlreadyAtSourceHead — second
// invocation of FF after the first one succeeded must short-circuit:
// no UPDATE, no lineage check, just commit and return AlreadyMerged.
func TestMergeRuntimeBranchIsIdempotentWhenAlreadyAtSourceHead(t *testing.T) {
	ctx := context.Background()
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)
	defer mock.Close()

	datasetID := uuid.New()
	targetID := uuid.New()
	sourceID := uuid.New()
	sharedHead := uuid.New()
	forkTxn := uuid.New()
	actor := uuid.New()

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "main").
		WillReturnRows(branchRow(t, targetID, datasetID, "main", nil, &sharedHead, nil))
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "feature").
		WillReturnRows(branchRow(t, sourceID, datasetID, "feature", &targetID, &sharedHead, &forkTxn))
	mock.ExpectCommit()

	r := &repo.Repo{Pool: mock}
	out, err := r.MergeRuntimeBranch(ctx, datasetID, "main", "feature", actor)
	require.NoError(t, err)
	require.NotNil(t, out)
	assert.False(t, out.FastForwarded)
	assert.True(t, out.AlreadyMerged)
	require.NotNil(t, out.NewHeadTransactionRID)
	assert.Equal(t, "ri.foundry.main.transaction."+sharedHead.String(), *out.NewHeadTransactionRID)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestMergeRuntimeBranchRejectsDivergedTarget — target moved past
// source's fork point, so no FF is possible without a 3-way merge.
// Must return ErrPreconditionFailed so the handler maps to 412.
func TestMergeRuntimeBranchRejectsDivergedTarget(t *testing.T) {
	ctx := context.Background()
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)
	defer mock.Close()

	datasetID := uuid.New()
	targetID := uuid.New()
	sourceID := uuid.New()
	movedTargetHead := uuid.New()
	forkTxn := uuid.New()
	sourceHead := uuid.New()
	actor := uuid.New()

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "main").
		WillReturnRows(branchRow(t, targetID, datasetID, "main", nil, &movedTargetHead, nil))
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "feature").
		WillReturnRows(branchRow(t, sourceID, datasetID, "feature", &targetID, &sourceHead, &forkTxn))
	mock.ExpectRollback()

	r := &repo.Repo{Pool: mock}
	_, err = r.MergeRuntimeBranch(ctx, datasetID, "main", "feature", actor)
	require.Error(t, err)
	require.True(t, errors.Is(err, repo.ErrPreconditionFailed), "want ErrPreconditionFailed, got %v", err)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestMergeRuntimeBranchRejectsSourceWithoutCommits — source has the
// same head as its parent (or none at all) so there is nothing to
// project. Returning a no-op would hide the user's mistake; we 412.
func TestMergeRuntimeBranchRejectsSourceWithoutCommits(t *testing.T) {
	ctx := context.Background()
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)
	defer mock.Close()

	datasetID := uuid.New()
	targetID := uuid.New()
	sourceID := uuid.New()
	actor := uuid.New()

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "main").
		WillReturnRows(branchRow(t, targetID, datasetID, "main", nil, nil, nil))
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "feature").
		WillReturnRows(branchRow(t, sourceID, datasetID, "feature", &targetID, nil, nil))
	mock.ExpectRollback()

	r := &repo.Repo{Pool: mock}
	_, err = r.MergeRuntimeBranch(ctx, datasetID, "main", "feature", actor)
	require.Error(t, err)
	require.True(t, errors.Is(err, repo.ErrPreconditionFailed), "want ErrPreconditionFailed, got %v", err)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestMergeRuntimeBranchRejectsUnrelatedBranches — source is not a
// descendant of target in the parent_branch_id graph. We refuse to
// invent a merge commit; the user has to rebase or pick a 3-way merge
// flow we haven't shipped yet.
func TestMergeRuntimeBranchRejectsUnrelatedBranches(t *testing.T) {
	ctx := context.Background()
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)
	defer mock.Close()

	datasetID := uuid.New()
	targetID := uuid.New()
	sourceID := uuid.New()
	otherParentID := uuid.New()
	sharedTxn := uuid.New()
	sourceHead := uuid.New()
	actor := uuid.New()

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "main").
		WillReturnRows(branchRow(t, targetID, datasetID, "main", nil, &sharedTxn, nil))
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(datasetID, "feature").
		WillReturnRows(branchRow(t, sourceID, datasetID, "feature", &otherParentID, &sourceHead, &sharedTxn))
	mock.ExpectQuery("WITH RECURSIVE chain").
		WithArgs(sourceID, datasetID, targetID).
		WillReturnRows(pgxmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectRollback()

	r := &repo.Repo{Pool: mock}
	_, err = r.MergeRuntimeBranch(ctx, datasetID, "main", "feature", actor)
	require.Error(t, err)
	require.True(t, errors.Is(err, repo.ErrPreconditionFailed), "want ErrPreconditionFailed, got %v", err)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestMergeRuntimeBranchRejectsSelfMerge — the source==target check
// trips before we even open a transaction, so the result is a
// validation error and nothing is mocked on the pool.
func TestMergeRuntimeBranchRejectsSelfMerge(t *testing.T) {
	ctx := context.Background()
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)
	defer mock.Close()

	r := &repo.Repo{Pool: mock}
	_, err = r.MergeRuntimeBranch(ctx, uuid.New(), "main", "main", uuid.New())
	require.Error(t, err)
	require.True(t, errors.Is(err, repo.ErrValidation), "want ErrValidation, got %v", err)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestMergeRuntimeBranchReturnsNotFoundForMissingTarget — when the
// target branch SELECT returns no rows we expect ErrNotFound and an
// immediate rollback. (Same shape covers a missing source — they go
// through the same scan helper.)
func TestMergeRuntimeBranchReturnsNotFoundForMissingTarget(t *testing.T) {
	ctx := context.Background()
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)
	defer mock.Close()

	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, rid, dataset_id, dataset_rid, name").
		WithArgs(uuid.UUID{}, "main").
		WillReturnRows(pgxmock.NewRows(branchScanCols)) // empty
	mock.ExpectRollback()

	r := &repo.Repo{Pool: mock}
	_, err = r.MergeRuntimeBranch(ctx, uuid.UUID{}, "main", "feature", uuid.New())
	require.Error(t, err)
	require.True(t, errors.Is(err, repo.ErrNotFound), "want ErrNotFound, got %v", err)
	require.NoError(t, mock.ExpectationsWereMet())
}
