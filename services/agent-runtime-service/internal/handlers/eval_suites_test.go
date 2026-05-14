package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

func TestValidateEvaluationSuiteSourceSurface(t *testing.T) {
	t.Parallel()
	logicPreview := "logic_preview"
	evalsSidebar := "evals_sidebar"
	app := "aip_evals_app"
	codeFunction := "code_function_published"
	bad := "unknown"

	assert.True(t, validateEvaluationSuiteSourceSurface(nil))
	assert.True(t, validateEvaluationSuiteSourceSurface(&logicPreview))
	assert.True(t, validateEvaluationSuiteSourceSurface(&evalsSidebar))
	assert.True(t, validateEvaluationSuiteSourceSurface(&app))
	assert.True(t, validateEvaluationSuiteSourceSurface(&codeFunction))
	assert.False(t, validateEvaluationSuiteSourceSurface(&bad))
}

func TestCreateEvaluationSuiteRequiresAuthBeforeBodyValidation(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	req := httptest.NewRequest(http.MethodPost, "/eval-suites", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()

	h.CreateEvaluationSuite(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "authentication required")
}

func TestCreateEvaluationSuiteRequiresProjectFolderPlacement(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	claims := &authmw.Claims{Sub: uuid.New()}
	req := httptest.NewRequest(http.MethodPost, "/eval-suites", strings.NewReader(`{"name":"Regression suite"}`))
	req = req.WithContext(authmw.ContextWithClaims(req.Context(), claims))
	rec := httptest.NewRecorder()

	h.CreateEvaluationSuite(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "project_id and folder_id")
}

func TestMoveEvaluationSuiteRejectsInvalidPlacementBeforeRepo(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	claims := &authmw.Claims{Sub: uuid.New()}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req := httptest.NewRequest(http.MethodPost, "/eval-suites/id/move", strings.NewReader(`{"project_id":"`+uuid.New().String()+`"}`))
	req = req.WithContext(authmw.ContextWithClaims(context.WithValue(req.Context(), chi.RouteCtxKey, rctx), claims))
	rec := httptest.NewRecorder()

	h.MoveEvaluationSuite(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "project_id and folder_id")
}
