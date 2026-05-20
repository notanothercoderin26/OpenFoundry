package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// TestBatchSaveRequiresAuth covers the authentication gate. The
// handler must reject anonymous requests with 401 before it tries to
// decode the body or hit the repo, otherwise the BatchSave audit
// entries would attribute changes to a zero-uuid actor.
func TestBatchSaveRequiresAuth(t *testing.T) {
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	body := `{"edits": []}`
	req := httptest.NewRequest(http.MethodPost, "/batch-save", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

// TestBatchSaveInvalidJSON exercises the JSON-decode error path. The
// frontend's working-state store should never produce malformed JSON,
// but if it does we expose 400 with a useful message rather than 500.
func TestBatchSaveInvalidJSON(t *testing.T) {
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	req := authed(http.MethodPost, "/batch-save", `{"edits": [`)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

// TestBatchSaveTooLarge proves the 500-edit ceiling is enforced. A
// runaway working state shouldn't be able to push the service into a
// minutes-long transaction.
func TestBatchSaveTooLarge(t *testing.T) {
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	edits := make([]models.BatchEdit, 0, 501)
	for i := 0; i < 501; i++ {
		edits = append(edits, models.BatchEdit{
			ClientID: uuid.New().String(),
			Op:       models.BatchOpCreate,
			Resource: models.BatchResourceObjectType,
			Body:     json.RawMessage(`{}`),
		})
	}
	body, _ := json.Marshal(models.BatchSaveRequest{Edits: edits})
	req := authed(http.MethodPost, "/batch-save", string(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}

// TestBatchSaveEchoesPerEditResults checks the success envelope. The
// fake store returns OK for every edit; the handler must serialize the
// response with the client_ids preserved so the frontend modal can
// match results back to its in-memory edit cards.
func TestBatchSaveEchoesPerEditResults(t *testing.T) {
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	edits := []models.BatchEdit{
		{
			ClientID: "client-a",
			Op:       models.BatchOpCreate,
			Resource: models.BatchResourceObjectType,
			Body:     json.RawMessage(`{"name": "Aircraft", "display_name": "Aircraft"}`),
		},
		{
			ClientID: "client-b",
			Op:       models.BatchOpUpdate,
			Resource: models.BatchResourceLinkType,
			ID:       uuidPtr(uuid.New()),
			ExpectedVersion: intPtr(3),
			Body:     json.RawMessage(`{"display_name": "Flies"}`),
		},
	}
	body, _ := json.Marshal(models.BatchSaveRequest{Edits: edits})
	req := authed(http.MethodPost, "/batch-save", string(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	var resp models.BatchSaveResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	assert.Equal(t, models.BatchStatusOK, resp.Status)
	assert.Len(t, resp.Results, 2)
	assert.Equal(t, "client-a", resp.Results[0].ClientID)
	assert.Equal(t, "client-b", resp.Results[1].ClientID)
	assert.Equal(t, models.BatchStatusOK, resp.Results[0].Status)
	assert.Equal(t, models.BatchStatusOK, resp.Results[1].Status)
	assert.NotEqual(t, uuid.Nil, resp.BatchID)
}

func intPtr(v int) *int       { return &v }
func uuidPtr(v uuid.UUID) *uuid.UUID { return &v }
