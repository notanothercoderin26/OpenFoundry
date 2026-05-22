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
)

// These tests cover the validation surface of POST /threads/{id}/mode.
// Every case must fail (and respond) before the handler reaches
// h.Repo.SetThreadMode, so the nil Repo never triggers a panic.

func newSetModeRequest(t *testing.T, idParam, body string) (*httptest.ResponseRecorder, *http.Request) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/threads/"+idParam+"/mode", strings.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", idParam)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	return httptest.NewRecorder(), req
}

func TestSetModeRejectsInvalidUUID(t *testing.T) {
	t.Parallel()
	h := &Threads{}
	rec, req := newSetModeRequest(t, "not-a-uuid", `{"mode":"DATA_INTEGRATION"}`)
	h.SetMode(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "id must be a uuid")
}

func TestSetModeRejectsMalformedBody(t *testing.T) {
	t.Parallel()
	h := &Threads{}
	rec, req := newSetModeRequest(t, uuid.New().String(), `{not-json`)
	h.SetMode(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "invalid body")
}

func TestSetModeRejectsEmptyMode(t *testing.T) {
	t.Parallel()
	h := &Threads{}
	rec, req := newSetModeRequest(t, uuid.New().String(), `{}`)
	h.SetMode(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "mode is required")
}

func TestSetModeRejectsUnknownMode(t *testing.T) {
	t.Parallel()
	h := &Threads{}
	rec, req := newSetModeRequest(t, uuid.New().String(),
		`{"mode":"WORLD_DOMINATION"}`)
	h.SetMode(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "unknown AgentMode")
}

func TestSetModeRejectsLowercaseMode(t *testing.T) {
	// AgentMode validation is case-sensitive — matches the SQL CHECK
	// constraint and the proto enum (uppercase canonical names).
	t.Parallel()
	h := &Threads{}
	rec, req := newSetModeRequest(t, uuid.New().String(),
		`{"mode":"data_integration"}`)
	h.SetMode(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "unknown AgentMode")
}

func TestSetModeRejectsUnknownExecutionMode(t *testing.T) {
	t.Parallel()
	h := &Threads{}
	rec, req := newSetModeRequest(t, uuid.New().String(),
		`{"mode":"DATA_INTEGRATION","active_mode_tools":["native_pipeline","bogus_mode"]}`)
	h.SetMode(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "bogus_mode")
}
