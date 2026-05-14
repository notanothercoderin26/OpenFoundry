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

func TestLogicFileValidationRequiresProjectFolderPlacement(t *testing.T) {
	t.Parallel()
	assert.False(t, validateLogicName("   "))
	assert.True(t, validateLogicName("Summarize complaint"))
	assert.True(t, isZeroUUID(uuid.Nil))
	assert.False(t, isZeroUUID(uuid.New()))
}

func TestValidateExecutionMode(t *testing.T) {
	t.Parallel()
	userScoped := "user_scoped"
	projectScoped := "project_scoped"
	bad := "personal_home"
	assert.True(t, validateExecutionMode(nil))
	assert.True(t, validateExecutionMode(&userScoped))
	assert.True(t, validateExecutionMode(&projectScoped))
	assert.False(t, validateExecutionMode(&bad))
}

func TestValidateRunHistoryMaxRows(t *testing.T) {
	t.Parallel()
	low := int32(0)
	high := int32(1_000_001)
	ok := int32(500)
	assert.True(t, validateRunHistoryMaxRows(nil))
	assert.True(t, validateRunHistoryMaxRows(&ok))
	assert.False(t, validateRunHistoryMaxRows(&low))
	assert.False(t, validateRunHistoryMaxRows(&high))
}

func TestParseOptionalUUIDQuery(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	got, err := parseOptionalUUIDQuery(id.String())
	assert.NoError(t, err)
	assert.Equal(t, id, *got)

	got, err = parseOptionalUUIDQuery("   ")
	assert.NoError(t, err)
	assert.Nil(t, got)

	_, err = parseOptionalUUIDQuery("not-a-uuid")
	assert.Error(t, err)
}

func TestParseLogicVersionIDRejectsInvalidUUID(t *testing.T) {
	t.Parallel()
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("version_id", "not-a-uuid")
	req := httptest.NewRequest(http.MethodGet, "/logic/files/id/versions/not-a-uuid", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()
	_, ok := parseLogicVersionID(rec, req)
	assert.False(t, ok)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "version_id must be a uuid")
}

func TestCreateLogicFileRequiresAuthBeforeBodyValidation(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	req := httptest.NewRequest(http.MethodPost, "/logic/files", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	h.CreateLogicFile(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "authentication required")
}

func TestCreateLogicFileRejectsPersonalOnlyPlacement(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	claims := &authmw.Claims{Sub: uuid.New()}
	req := httptest.NewRequest(http.MethodPost, "/logic/files", strings.NewReader(`{"name":"Draft"}`))
	req = req.WithContext(authmw.ContextWithClaims(req.Context(), claims))
	rec := httptest.NewRecorder()
	h.CreateLogicFile(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "project_id and folder_id")
}

func TestUpdateLogicFileRejectsInvalidExecutionModeBeforeRepo(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	claims := &authmw.Claims{Sub: uuid.New()}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req := httptest.NewRequest(http.MethodPatch, "/logic/files/id", strings.NewReader(`{"execution_mode":"personal_home"}`))
	req = req.WithContext(authmw.ContextWithClaims(context.WithValue(req.Context(), chi.RouteCtxKey, rctx), claims))
	rec := httptest.NewRecorder()
	h.UpdateLogicFileMetadata(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "execution_mode")
}

func TestDuplicateLogicFileRequiresProjectAndFolderTogether(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	claims := &authmw.Claims{Sub: uuid.New()}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	body := `{"project_id":"` + uuid.New().String() + `"}`
	req := httptest.NewRequest(http.MethodPost, "/logic/files/id/duplicate", strings.NewReader(body))
	req = req.WithContext(authmw.ContextWithClaims(context.WithValue(req.Context(), chi.RouteCtxKey, rctx), claims))
	rec := httptest.NewRecorder()
	h.DuplicateLogicFile(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "provided together")
}

func TestSaveLogicDraftVersionRequiresDefinitionBeforeRepo(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	claims := &authmw.Claims{Sub: uuid.New()}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req := httptest.NewRequest(http.MethodPost, "/logic/files/id/versions/save", strings.NewReader(`{"definition":""}`))
	req = req.WithContext(authmw.ContextWithClaims(context.WithValue(req.Context(), chi.RouteCtxKey, rctx), claims))
	rec := httptest.NewRecorder()
	h.SaveLogicDraftVersion(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "definition")
}

func TestCompareLogicVersionsRequiresVersionIDsBeforeRepo(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	claims := &authmw.Claims{Sub: uuid.New()}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req := httptest.NewRequest(http.MethodGet, "/logic/files/id/versions/compare?base_version_id=bad&head_version_id=also-bad", nil)
	req = req.WithContext(authmw.ContextWithClaims(context.WithValue(req.Context(), chi.RouteCtxKey, rctx), claims))
	rec := httptest.NewRecorder()
	h.CompareLogicVersions(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "base_version_id")
}

func TestRequestBaseURLHonorsForwardedHeaders(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/logic/files/id/uses", nil)
	req.Host = "internal:8080"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "foundry.example.com")

	assert.Equal(t, "https://foundry.example.com", requestBaseURL(req))
}

func TestInvokeLogicFunctionRequiresAuthBeforeBodyValidation(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("function_rid", "logic.customer-triage")
	req := httptest.NewRequest(http.MethodPost, "/logic/functions/logic.customer-triage/invoke", strings.NewReader(`{`))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()

	h.InvokeLogicFunction(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "authentication required")
}

func TestListLogicRunsRequiresAuthBeforeRepo(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req := httptest.NewRequest(http.MethodGet, "/logic/files/id/runs", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()

	h.ListLogicRuns(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "authentication required")
}

func TestGetLogicMetricsRequiresAuthBeforeRepo(t *testing.T) {
	t.Parallel()
	h := &Handlers{}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req := httptest.NewRequest(http.MethodGet, "/logic/files/id/metrics?window=7d", nil)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()

	h.GetLogicMetrics(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "authentication required")
}
