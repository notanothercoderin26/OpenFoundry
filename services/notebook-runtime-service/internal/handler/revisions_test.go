package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
	nbrepo "github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/repo"
)

func mountRevisionRouter(s *State) chi.Router {
	r := chi.NewRouter()
	r.Post("/api/v1/notepad/documents", s.CreateDocument)
	r.Patch("/api/v1/notepad/documents/{document_id}", s.UpdateDocument)
	r.Get("/api/v1/notepad/documents/{document_id}/revisions", s.ListRevisions)
	r.Post("/api/v1/notepad/documents/{document_id}/revisions", s.CreateRevision)
	r.Get("/api/v1/notepad/documents/{document_id}/revisions/{rev}", s.GetRevision)
	r.Post("/api/v1/notepad/documents/{document_id}/revisions/{rev}/revert", s.RevertRevision)
	r.Get("/api/v1/notepad/documents/{document_id}", s.GetDocument)
	return r
}

// newRevisionTestState returns a State backed by paired in-memory
// repositories so the ownership oracle works, plus a controllable
// clock so autosave thresholds are deterministic. The same clock
// is wired into both the State (for the threshold check) and the
// revision repo (for CreatedAt stamping) so "now − last" math is
// internally consistent.
func newRevisionTestState() (*State, *fakeClock) {
	docs := nbrepo.NewInMemoryNotepadRepository()
	clock := &fakeClock{t: time.Date(2026, 5, 19, 12, 0, 0, 0, time.UTC)}
	revisions := nbrepo.NewInMemoryNotepadRevisionRepository(docs)
	revisions.Now = clock.Now
	state := &State{
		NotepadRepo:  docs,
		RevisionRepo: revisions,
		Now:          clock.Now,
	}
	return state, clock
}

type fakeClock struct{ t time.Time }

func (c *fakeClock) Now() time.Time { return c.t }
func (c *fakeClock) Advance(d time.Duration) {
	c.t = c.t.Add(d)
}

func createDocForRevisionTest(t *testing.T, r chi.Router, owner uuid.UUID, title string) models.NotepadDocument {
	t.Helper()
	body, _ := json.Marshal(map[string]any{
		"title":       title,
		"description": "Revision probe",
		"content":     "initial body",
	})
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents", bytes.NewReader(body)), owner)
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create doc: status=%d body=%s", w.Code, w.Body.String())
	}
	var doc models.NotepadDocument
	_ = json.Unmarshal(w.Body.Bytes(), &doc)
	return doc
}

// TestInitialRevisionSeededOnCreate verifies the v0 snapshot is
// always present so the panel has a deterministic anchor.
func TestInitialRevisionSeededOnCreate(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state, _ := newRevisionTestState()
	r := mountRevisionRouter(state)
	doc := createDocForRevisionTest(t, r, owner, "First Doc")

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodGet, "/api/v1/notepad/documents/"+doc.ID.String()+"/revisions?include=all", nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []models.NotepadRevision `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Data) != 1 || resp.Data[0].Rev != 0 || resp.Data[0].Kind != models.NotepadRevisionKindInitial {
		t.Fatalf("expected one initial revision (rev=0), got %+v", resp.Data)
	}
}

// TestManualRevisionCreatesEndorsedSnapshot verifies POST /revisions
// stores the requested name + endorsement.
func TestManualRevisionCreatesEndorsedSnapshot(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state, _ := newRevisionTestState()
	r := mountRevisionRouter(state)
	doc := createDocForRevisionTest(t, r, owner, "Manual save")

	body := []byte(`{"name":"v1 release","endorsed":true}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/revisions", bytes.NewReader(body)), owner)
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("manual save status=%d body=%s", w.Code, w.Body.String())
	}
	var revision models.NotepadRevision
	_ = json.Unmarshal(w.Body.Bytes(), &revision)
	if revision.Kind != models.NotepadRevisionKindManual || !revision.Endorsed || revision.Name != "v1 release" || revision.Rev != 1 {
		t.Fatalf("manual save drift: %+v", revision)
	}
}

// TestAutosaveSkippedUnderInterval confirms updates within the
// 5-minute window do NOT generate extra autosave revisions.
func TestAutosaveSkippedUnderInterval(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state, clock := newRevisionTestState()
	r := mountRevisionRouter(state)
	doc := createDocForRevisionTest(t, r, owner, "Autosave skip")

	clock.Advance(2 * time.Minute) // under the threshold
	patch := []byte(`{"content":"second pass"}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPatch, "/api/v1/notepad/documents/"+doc.ID.String(), bytes.NewReader(patch)), owner)
	req.ContentLength = int64(len(patch))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("patch status=%d", w.Code)
	}

	revisions := listRevisionsForTest(t, r, owner, doc.ID, true)
	if len(revisions) != 1 {
		t.Fatalf("expected 1 revision (initial only), got %d: %+v", len(revisions), revisions)
	}
}

// TestAutosaveTriggeredPastInterval verifies an update past the
// threshold snapshots the post-update state.
func TestAutosaveTriggeredPastInterval(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state, clock := newRevisionTestState()
	r := mountRevisionRouter(state)
	doc := createDocForRevisionTest(t, r, owner, "Autosave keep")

	clock.Advance(6 * time.Minute) // past the threshold
	patch := []byte(`{"content":"new draft"}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPatch, "/api/v1/notepad/documents/"+doc.ID.String(), bytes.NewReader(patch)), owner)
	req.ContentLength = int64(len(patch))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("patch status=%d", w.Code)
	}

	revisions := listRevisionsForTest(t, r, owner, doc.ID, true)
	if len(revisions) != 2 {
		t.Fatalf("expected initial + autosave, got %d: %+v", len(revisions), revisions)
	}
	if revisions[0].Kind != models.NotepadRevisionKindAutosave || revisions[0].Content != "new draft" {
		t.Fatalf("autosave drift: %+v", revisions[0])
	}
}

// TestUserCreatedFilterHidesAutosaves confirms the default panel
// filter excludes autosaves.
func TestUserCreatedFilterHidesAutosaves(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state, clock := newRevisionTestState()
	r := mountRevisionRouter(state)
	doc := createDocForRevisionTest(t, r, owner, "Filter probe")

	// Force one autosave + one manual.
	clock.Advance(10 * time.Minute)
	patch := []byte(`{"content":"after time"}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPatch, "/api/v1/notepad/documents/"+doc.ID.String(), bytes.NewReader(patch)), owner)
	req.ContentLength = int64(len(patch))
	r.ServeHTTP(w, req)

	manualBody := []byte(`{"name":"Pre-launch"}`)
	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/revisions", bytes.NewReader(manualBody)), owner)
	req.ContentLength = int64(len(manualBody))
	r.ServeHTTP(w, req)

	all := listRevisionsForTest(t, r, owner, doc.ID, true)
	userOnly := listRevisionsForTest(t, r, owner, doc.ID, false)
	if len(all) != 3 || len(userOnly) != 2 {
		t.Fatalf("filter drift: all=%d user=%d", len(all), len(userOnly))
	}
	for _, rev := range userOnly {
		if rev.Kind == models.NotepadRevisionKindAutosave {
			t.Fatalf("user-only list leaked autosave: %+v", rev)
		}
	}
}

// TestRevertSnapshotsThenRehydrates verifies the revert path:
// 1) current state is autosaved (undoable), 2) live doc swaps to the
// target revision's content.
func TestRevertSnapshotsThenRehydrates(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state, clock := newRevisionTestState()
	r := mountRevisionRouter(state)
	doc := createDocForRevisionTest(t, r, owner, "Revert probe")

	// Move past the threshold and patch — produces an autosave rev.
	clock.Advance(6 * time.Minute)
	patch := []byte(`{"content":"changed body"}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPatch, "/api/v1/notepad/documents/"+doc.ID.String(), bytes.NewReader(patch)), owner)
	req.ContentLength = int64(len(patch))
	r.ServeHTTP(w, req)

	// Revert to rev 0 (the initial empty snapshot).
	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/revisions/0/revert", nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("revert status=%d body=%s", w.Code, w.Body.String())
	}
	var reverted models.NotepadDocument
	_ = json.Unmarshal(w.Body.Bytes(), &reverted)
	if reverted.Content != "initial body" {
		t.Fatalf("revert did not restore initial content: %+v", reverted)
	}

	// History now contains: rev0 initial + rev1 autosave (the
	// "changed body" snapshot) + rev2 autosave (the "changed body"
	// state snapshotted just before the revert).
	all := listRevisionsForTest(t, r, owner, doc.ID, true)
	if len(all) != 3 {
		t.Fatalf("expected 3 revisions after revert, got %d: %+v", len(all), all)
	}
	if all[0].Rev != 2 || all[0].Content != "changed body" {
		t.Fatalf("pre-revert snapshot drift: %+v", all[0])
	}
}

// TestRevisionAccessDeniedForOtherOwner verifies the ownership
// boundary holds: a different user gets 404, never the snapshot.
func TestRevisionAccessDeniedForOtherOwner(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	intruder := uuid.New()
	state, _ := newRevisionTestState()
	r := mountRevisionRouter(state)
	doc := createDocForRevisionTest(t, r, owner, "Private notes")

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodGet, "/api/v1/notepad/documents/"+doc.ID.String()+"/revisions", nil), intruder)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("intruder list expected 404, got %d body=%s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	req = withClaims(httptest.NewRequest(http.MethodGet, "/api/v1/notepad/documents/"+doc.ID.String()+"/revisions/0", nil), intruder)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("intruder get expected 404, got %d", w.Code)
	}
}

// TestMetadataOnlyUpdateDoesNotAutosave ensures last_indexed_at
// pings (AIP) do not pollute the history.
func TestMetadataOnlyUpdateDoesNotAutosave(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state, clock := newRevisionTestState()
	r := mountRevisionRouter(state)
	doc := createDocForRevisionTest(t, r, owner, "Index ping")

	clock.Advance(10 * time.Minute)
	patch := []byte(`{"last_indexed_at":"2026-05-19T13:00:00Z"}`)
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPatch, "/api/v1/notepad/documents/"+doc.ID.String(), bytes.NewReader(patch)), owner)
	req.ContentLength = int64(len(patch))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("patch status=%d", w.Code)
	}

	all := listRevisionsForTest(t, r, owner, doc.ID, true)
	if len(all) != 1 {
		t.Fatalf("expected 1 revision (initial only) after metadata-only patch, got %d: %+v", len(all), all)
	}
}

func listRevisionsForTest(t *testing.T, r chi.Router, owner, documentID uuid.UUID, includeAutosaves bool) []models.NotepadRevision {
	t.Helper()
	url := "/api/v1/notepad/documents/" + documentID.String() + "/revisions"
	if includeAutosaves {
		url += "?include=all"
	}
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodGet, url, nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Data []models.NotepadRevision `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return resp.Data
}
