package geopolitica

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	kmodels "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/models"
)

// --- fake repo --------------------------------------------------------------

type fakeRepo struct {
	created []kmodels.ActionType
}

func (f *fakeRepo) ListActionTypes(_ context.Context) ([]kmodels.ActionType, error) {
	return append([]kmodels.ActionType{}, f.created...), nil
}

func (f *fakeRepo) CreateActionType(_ context.Context, body *kmodels.CreateActionTypeRequest, ownerID uuid.UUID) (*kmodels.ActionType, error) {
	at := kmodels.ActionType{
		ID:            uuid.New(),
		Name:          body.Name,
		ObjectTypeID:  body.ObjectTypeID,
		OperationKind: body.OperationKind,
		OwnerID:       ownerID,
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
	}
	if body.DisplayName != nil {
		at.DisplayName = *body.DisplayName
	}
	if body.Description != nil {
		at.Description = *body.Description
	}
	if body.ConfirmationRequired != nil {
		at.ConfirmationRequired = *body.ConfirmationRequired
	}
	if body.PermissionKey != nil {
		at.PermissionKey = body.PermissionKey
	}
	f.created = append(f.created, at)
	return &at, nil
}

// --- catalog shape ----------------------------------------------------------

func TestActionTypesCatalogHasEightEntries(t *testing.T) {
	got := ActionTypes()
	require.Len(t, got, expectedCount)

	names := map[string]struct{}{}
	for _, a := range got {
		names[a.Name] = struct{}{}
	}
	for _, want := range []string{
		"add-to-watchlist", "flag-actor", "open-investigation-case",
		"acknowledge-alert", "propose-sanctions-extension",
		"merge-actors", "assign-investigation", "close-investigation-case",
	} {
		_, ok := names[want]
		require.True(t, ok, "expected action %q in catalog", want)
	}
}

func TestEveryActionTypeHasOperationKind(t *testing.T) {
	for _, a := range ActionTypes() {
		require.NotEmpty(t, a.OperationKind, "%s missing operation_kind", a.Name)
		require.Contains(t, []string{"create", "modify", "delete"}, a.OperationKind,
			"%s has unsupported operation_kind %q", a.Name, a.OperationKind)
		require.NotEmpty(t, a.PermissionKey, "%s missing permission_key", a.Name)
		require.NotEmpty(t, a.TargetObjectTypeName, "%s missing target object type", a.Name)
	}
}

func TestProposeSanctionsExtensionIsCreateOnSanctionsEntry(t *testing.T) {
	for _, a := range ActionTypes() {
		if a.Name == "propose-sanctions-extension" {
			require.Equal(t, "create", a.OperationKind)
			require.Equal(t, "SanctionsEntry", a.TargetObjectTypeName)
			require.True(t, a.ConfirmationRequired, "destructive branch-only action must require confirmation")
			return
		}
	}
	t.Fatal("propose-sanctions-extension not found in catalog")
}

// --- load behaviour ---------------------------------------------------------

func defaultResolver(t *testing.T) ObjectTypeResolver {
	t.Helper()
	// Provide UUIDs for every object type the catalog references; if
	// the seed grows we'll learn about missing entries through the
	// resolver's "not found" error.
	m := map[string]uuid.UUID{
		"ActorAlert":        uuid.New(),
		"Watchlist":         uuid.New(),
		"InvestigationCase": uuid.New(),
		"Actor":             uuid.New(),
		"SanctionsEntry":    uuid.New(),
	}
	return ResolverFromMap(m)
}

func TestLoadOnEmptyRepoCreatesAllEight(t *testing.T) {
	repo := &fakeRepo{}
	out, err := Load(context.Background(), repo, defaultResolver(t), uuid.New())
	require.NoError(t, err)
	require.Len(t, out.CreatedActionTypes, 8)
	require.Empty(t, out.SkippedActionTypes)
	require.Len(t, repo.created, 8)
}

func TestLoadIsIdempotentOnSecondRun(t *testing.T) {
	repo := &fakeRepo{}
	resolver := defaultResolver(t)
	_, err := Load(context.Background(), repo, resolver, uuid.New())
	require.NoError(t, err)

	out, err := Load(context.Background(), repo, resolver, uuid.New())
	require.NoError(t, err)
	require.Empty(t, out.CreatedActionTypes)
	require.Len(t, out.SkippedActionTypes, 8)
}

func TestLoadFailsLoudlyWhenTargetObjectTypeIsMissing(t *testing.T) {
	repo := &fakeRepo{}
	resolver := ResolverFromMap(map[string]uuid.UUID{
		// Missing entries on purpose — only ActorAlert is registered.
		"ActorAlert": uuid.New(),
	})
	_, err := Load(context.Background(), repo, resolver, uuid.New())
	require.Error(t, err)
	require.Contains(t, err.Error(), "not found")
}

func TestLoadRejectsNilRepoOrResolver(t *testing.T) {
	_, err := Load(context.Background(), nil, defaultResolver(t), uuid.New())
	require.Error(t, err)

	_, err = Load(context.Background(), &fakeRepo{}, nil, uuid.New())
	require.Error(t, err)
}

// Sanity: the broken-resolver test above is also a regression guard
// against accidentally swallowing errors inside Load() and producing a
// partial seed.
var _ = errors.New
