package workspace

// Internal-package tests for the trash registry. These live in the
// `workspace` package (rather than `workspace_test`) so they can reach
// the unexported trashRegistry and sqlKindHandler directly — the
// registry's shape is implementation detail and shouldn't grow a public
// listing API just for test ergonomics.

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeExecutor records the last Exec call and returns a canned
// CommandTag so we can drive rows-affected branches without Postgres.
type fakeExecutor struct {
	tag      pgconn.CommandTag
	err      error
	gotSQL   string
	gotArgs  []any
	gotCalls int
}

func (f *fakeExecutor) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.gotCalls++
	f.gotSQL = sql
	f.gotArgs = args
	return f.tag, f.err
}

func TestTrashRegistry_ContainsSupportedKinds(t *testing.T) {
	t.Parallel()
	// The three ontology trash kinds are the canonical "supported" set
	// — adding a kind here without a registry entry would silently
	// regress the HTTP layer to 422.
	for _, k := range []ResourceKind{
		ResourceOntologyProject,
		ResourceOntologyFolder,
		ResourceOntologyResourceBinding,
	} {
		assert.True(t, IsTrashKindSupported(k), "expected %q to be a registered trash kind", k)
		h, err := lookupTrashHandler(k)
		require.NoError(t, err)
		assert.NotNil(t, h, "lookup must return a handler for %q", k)
	}
}

func TestTrashRegistry_OmitsNonTrashKinds(t *testing.T) {
	t.Parallel()
	// These kinds are valid wire spellings (favorites/recents accept
	// them) but trash is delegated to the resource-owning service —
	// they MUST NOT acquire a default trash handler by accident.
	for _, k := range []ResourceKind{
		ResourceDataset, ResourcePipeline, ResourceNotebook,
		ResourceApp, ResourceDashboard, ResourceReport,
		ResourceModel, ResourceWorkflow, ResourceOther,
	} {
		assert.False(t, IsTrashKindSupported(k), "kind %q should not have a trash handler", k)
	}
}

func TestLookupTrashHandler_UnknownKindReturnsSentinel(t *testing.T) {
	t.Parallel()
	h, err := lookupTrashHandler(ResourceKind("definitely_not_a_real_kind"))
	assert.Nil(t, h)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrResourceKindUnsupported),
		"lookup miss must surface ErrResourceKindUnsupported so the HTTP layer can map to 422")
}

func TestSQLKindHandler_RestoreSuccess(t *testing.T) {
	t.Parallel()
	rid := uuid.New()
	exec := &fakeExecutor{tag: pgconn.NewCommandTag("UPDATE 1")}
	h := sqlKindHandler{restoreSQL: "UPDATE t SET is_deleted=FALSE WHERE id=$1", purgeSQL: "noop"}
	require.NoError(t, h.Restore(context.Background(), exec, rid))
	assert.Equal(t, 1, exec.gotCalls)
	assert.Equal(t, "UPDATE t SET is_deleted=FALSE WHERE id=$1", exec.gotSQL)
	require.Len(t, exec.gotArgs, 1)
	assert.Equal(t, rid, exec.gotArgs[0])
}

func TestSQLKindHandler_RestoreZeroRowsReturnsNotFound(t *testing.T) {
	t.Parallel()
	exec := &fakeExecutor{tag: pgconn.NewCommandTag("UPDATE 0")}
	h := sqlKindHandler{restoreSQL: "noop", purgeSQL: "noop"}
	err := h.Restore(context.Background(), exec, uuid.New())
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrTrashedRowNotFound))
}

func TestSQLKindHandler_PurgeSuccess(t *testing.T) {
	t.Parallel()
	rid := uuid.New()
	exec := &fakeExecutor{tag: pgconn.NewCommandTag("DELETE 1")}
	h := sqlKindHandler{restoreSQL: "noop", purgeSQL: "DELETE FROM t WHERE id=$1"}
	require.NoError(t, h.Purge(context.Background(), exec, rid))
	assert.Equal(t, "DELETE FROM t WHERE id=$1", exec.gotSQL)
	require.Len(t, exec.gotArgs, 1)
	assert.Equal(t, rid, exec.gotArgs[0])
}

func TestSQLKindHandler_PurgeZeroRowsReturnsNotFound(t *testing.T) {
	t.Parallel()
	exec := &fakeExecutor{tag: pgconn.NewCommandTag("DELETE 0")}
	h := sqlKindHandler{restoreSQL: "noop", purgeSQL: "noop"}
	err := h.Purge(context.Background(), exec, uuid.New())
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrTrashedRowNotFound))
}

func TestSQLKindHandler_PropagatesExecError(t *testing.T) {
	t.Parallel()
	wantErr := errors.New("boom")
	exec := &fakeExecutor{err: wantErr}
	h := sqlKindHandler{restoreSQL: "noop", purgeSQL: "noop"}
	assert.ErrorIs(t, h.Restore(context.Background(), exec, uuid.New()), wantErr)
	assert.ErrorIs(t, h.Purge(context.Background(), exec, uuid.New()), wantErr)
}
