package workspace_test

// HTTP-layer tests for the trash registry: an "unsupported but
// wire-valid" kind (e.g. dataset, which is accepted by ParseResourceKind
// for favorites/recents but has no trash handler) must surface as 422,
// not 500 or 400. Pairs with the registry-internal tests in
// kindops_internal_test.go which pin the registry's contents.

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/tenancy-organizations-service/internal/workspace"
)

func TestIsTrashKindSupported_TableDriven(t *testing.T) {
	t.Parallel()
	cases := []struct {
		kind     workspace.ResourceKind
		expected bool
	}{
		{workspace.ResourceOntologyProject, true},
		{workspace.ResourceOntologyFolder, true},
		{workspace.ResourceOntologyResourceBinding, true},
		{workspace.ResourceDataset, false},
		{workspace.ResourcePipeline, false},
		{workspace.ResourceKind("bogus"), false},
	}
	for _, tc := range cases {
		assert.Equal(t, tc.expected, workspace.IsTrashKindSupported(tc.kind),
			"IsTrashKindSupported(%q)", tc.kind)
	}
}

func TestRestoreResource_Returns422ForUnsupportedKind(t *testing.T) {
	t.Parallel()
	// `dataset` parses successfully (workspace surface accepts it for
	// favorites/recents) but has no trash handler — 422 not 500/400.
	h := &workspace.Handlers{}
	c := &authmw.Claims{Sub: uuid.New()}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("kind", "dataset")
	rctx.URLParams.Add("id", uuid.New().String())
	req := httptest.NewRequest("POST", "/x/restore", nil)
	req = req.WithContext(authmw.ContextWithClaims(
		context.WithValue(req.Context(), chi.RouteCtxKey, rctx), c))
	rec := httptest.NewRecorder()
	h.RestoreResource(rec, req)
	assert.Equal(t, 422, rec.Code,
		"unsupported-but-wire-valid kind must be 422 (Unprocessable Entity), not 400/500")
	assert.Contains(t, rec.Body.String(), workspace.ErrResourceKindUnsupported.Error())
}

func TestPurgeResource_Returns422ForUnsupportedKind(t *testing.T) {
	t.Parallel()
	h := &workspace.Handlers{}
	c := &authmw.Claims{Sub: uuid.New()}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("kind", "pipeline")
	rctx.URLParams.Add("id", uuid.New().String())
	req := httptest.NewRequest("DELETE", "/x/purge", nil)
	req = req.WithContext(authmw.ContextWithClaims(
		context.WithValue(req.Context(), chi.RouteCtxKey, rctx), c))
	rec := httptest.NewRecorder()
	h.PurgeResource(rec, req)
	assert.Equal(t, 422, rec.Code)
	assert.Contains(t, rec.Body.String(), workspace.ErrResourceKindUnsupported.Error())
}
