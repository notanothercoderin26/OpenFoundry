package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// PipelineAccessRepository persists link-share state, resource-level role
// grants, the follower set, the view counter, and the comment thread.
type PipelineAccessRepository interface {
	GetPipelineOwner(ctx context.Context, pipelineID uuid.UUID) (uuid.UUID, error)
	GetPipelineLinkShare(ctx context.Context, pipelineID uuid.UUID) (models.PipelineLinkShare, error)
	PutPipelineLinkShare(ctx context.Context, pipelineID uuid.UUID, req models.UpdatePipelineLinkShareRequest) (models.PipelineLinkShare, error)
	ResolvePipelineLinkShareToken(ctx context.Context, token string) (uuid.UUID, models.PipelineRole, bool, error)
	ListPipelineGrants(ctx context.Context, pipelineID uuid.UUID) ([]models.PipelineGrant, error)
	PutPipelineGrant(ctx context.Context, pipelineID uuid.UUID, req models.PutPipelineGrantRequest, grantedBy uuid.UUID) (*models.PipelineGrant, error)
	DeletePipelineGrant(ctx context.Context, pipelineID, grantID uuid.UUID) (bool, error)
	FollowPipeline(ctx context.Context, pipelineID, followerID uuid.UUID) (bool, error)
	UnfollowPipeline(ctx context.Context, pipelineID, followerID uuid.UUID) (bool, error)
	GetPipelineFollowerSummary(ctx context.Context, pipelineID, callerID uuid.UUID) (models.PipelineFollowerSummary, error)
	RecordPipelineView(ctx context.Context, pipelineID uuid.UUID) error
	GetPipelineViewSummary(ctx context.Context, pipelineID uuid.UUID) (models.PipelineViewSummary, error)
	ListPipelineComments(ctx context.Context, pipelineID uuid.UUID, limit int) ([]models.PipelineComment, error)
	CreatePipelineComment(ctx context.Context, pipelineID, authorID uuid.UUID, body string) (*models.PipelineComment, error)
	DeletePipelineComment(ctx context.Context, pipelineID, commentID, callerID uuid.UUID, isOwner bool) (bool, error)
}

type pipelineAccessSlot struct {
	repo PipelineAccessRepository
}

var pipelineAccessRepository atomic.Value // stores *pipelineAccessSlot

// ErrPipelineNotFoundSentinel is matched by handlers when the repo signals a
// missing pipeline. Implementations must wrap their own sentinel with
// errors.Is(err, errPipelineNotFound) — but for ease, the postgres adapter
// exports its sentinel and we string-match on "pipeline not found" too.
var errPipelineNotFound = errors.New("pipeline not found")

// SetPipelineAccessRepository injects the persistence adapter; returns a
// restore function for tests.
func SetPipelineAccessRepository(repo PipelineAccessRepository) func() {
	previous, _ := pipelineAccessRepository.Load().(*pipelineAccessSlot)
	if previous == nil {
		previous = &pipelineAccessSlot{}
	}
	pipelineAccessRepository.Store(&pipelineAccessSlot{repo: repo})
	return func() { pipelineAccessRepository.Store(previous) }
}

func currentPipelineAccessRepository() (PipelineAccessRepository, bool) {
	slot, _ := pipelineAccessRepository.Load().(*pipelineAccessSlot)
	if slot == nil || slot.repo == nil {
		return nil, false
	}
	return slot.repo, true
}

func requirePipelineAccessRepository(w http.ResponseWriter, detail string) (PipelineAccessRepository, bool) {
	repo, ok := currentPipelineAccessRepository()
	if !ok {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "pipeline_access_repository_not_configured", "detail": detail})
		return nil, false
	}
	return repo, true
}

// requirePipelineOwner returns the caller UUID if they own the pipeline; it
// writes the appropriate HTTP error otherwise.
func requirePipelineOwner(w http.ResponseWriter, r *http.Request, repo PipelineAccessRepository, pipelineID uuid.UUID) (uuid.UUID, bool) {
	actor := actorIDFromRequest(r)
	if actor == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal", "detail": "request has no authenticated principal"})
		return uuid.Nil, false
	}
	owner, err := repo.GetPipelineOwner(r.Context(), pipelineID)
	if err != nil {
		if err.Error() == "pipeline not found" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "pipeline_not_found"})
			return uuid.Nil, false
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pipeline_owner_lookup_failed", "detail": err.Error()})
		return uuid.Nil, false
	}
	if owner != *actor {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "owner_required", "detail": "only the pipeline owner can manage access"})
		return uuid.Nil, false
	}
	return *actor, true
}

// GET /pipelines/{id}/link-share — owner-only.
func GetPipelineLinkShare(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "GetPipelineLinkShare requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	if _, ok := requirePipelineOwner(w, r, repo, pipelineID); !ok {
		return
	}
	share, err := repo.GetPipelineLinkShare(r.Context(), pipelineID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "link_share_lookup_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, share)
}

// PUT /pipelines/{id}/link-share — owner-only.
func PutPipelineLinkShare(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "PutPipelineLinkShare requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	if _, ok := requirePipelineOwner(w, r, repo, pipelineID); !ok {
		return
	}
	var req models.UpdatePipelineLinkShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "detail": err.Error()})
		return
	}
	share, err := repo.PutPipelineLinkShare(r.Context(), pipelineID, req)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "link_share_update_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, share)
}

// GET /pipelines/{id}/grants — owner-only.
func ListPipelineGrants(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "ListPipelineGrants requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	if _, ok := requirePipelineOwner(w, r, repo, pipelineID); !ok {
		return
	}
	items, err := repo.ListPipelineGrants(r.Context(), pipelineID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_grants_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// PUT /pipelines/{id}/grants — owner-only.
func PutPipelineGrant(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "PutPipelineGrant requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	grantedBy, ok := requirePipelineOwner(w, r, repo, pipelineID)
	if !ok {
		return
	}
	var req models.PutPipelineGrantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "detail": err.Error()})
		return
	}
	grant, err := repo.PutPipelineGrant(r.Context(), pipelineID, req, grantedBy)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "grant_update_failed", "detail": err.Error()})
		return
	}
	if grant == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, grant)
}

// DELETE /pipelines/{id}/grants/{grant_id} — owner-only.
func DeletePipelineGrant(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "DeletePipelineGrant requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	if _, ok := requirePipelineOwner(w, r, repo, pipelineID); !ok {
		return
	}
	grantID, err := uuid.Parse(chi.URLParam(r, "grant_id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant_id", "detail": err.Error()})
		return
	}
	removed, err := repo.DeletePipelineGrant(r.Context(), pipelineID, grantID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete_grant_failed", "detail": err.Error()})
		return
	}
	if !removed {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /pipelines/{id}/followers/summary — any authenticated principal.
func GetPipelineFollowerSummary(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "GetPipelineFollowerSummary requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	actor := actorIDFromRequest(r)
	if actor == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	summary, err := repo.GetPipelineFollowerSummary(r.Context(), pipelineID, *actor)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "follower_summary_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// POST /pipelines/{id}/followers — current authenticated principal follows.
func FollowPipeline(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "FollowPipeline requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	actor := actorIDFromRequest(r)
	if actor == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	if _, err := repo.FollowPipeline(r.Context(), pipelineID, *actor); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "follow_failed", "detail": err.Error()})
		return
	}
	summary, err := repo.GetPipelineFollowerSummary(r.Context(), pipelineID, *actor)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "follower_summary_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// DELETE /pipelines/{id}/followers — current authenticated principal unfollows.
func UnfollowPipeline(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "UnfollowPipeline requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	actor := actorIDFromRequest(r)
	if actor == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	if _, err := repo.UnfollowPipeline(r.Context(), pipelineID, *actor); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unfollow_failed", "detail": err.Error()})
		return
	}
	summary, err := repo.GetPipelineFollowerSummary(r.Context(), pipelineID, *actor)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "follower_summary_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// POST /pipelines/{id}/views — any authenticated principal records a view.
func RecordPipelineView(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "RecordPipelineView requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	if actorIDFromRequest(r) == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	if err := repo.RecordPipelineView(r.Context(), pipelineID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "record_view_failed", "detail": err.Error()})
		return
	}
	summary, err := repo.GetPipelineViewSummary(r.Context(), pipelineID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "view_summary_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// GET /pipelines/{id}/views/summary — any authenticated principal reads.
func GetPipelineViewSummary(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "GetPipelineViewSummary requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	if actorIDFromRequest(r) == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	summary, err := repo.GetPipelineViewSummary(r.Context(), pipelineID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "view_summary_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

// GET /pipelines/{id}/comments — any authenticated principal.
func ListPipelineComments(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "ListPipelineComments requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	if actorIDFromRequest(r) == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	limit := 100
	items, err := repo.ListPipelineComments(r.Context(), pipelineID, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list_comments_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// POST /pipelines/{id}/comments — any authenticated principal.
func CreatePipelineComment(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "CreatePipelineComment requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	actor := actorIDFromRequest(r)
	if actor == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	var req models.CreatePipelineCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json", "detail": err.Error()})
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "empty_comment_body"})
		return
	}
	if len(body) > 8192 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "comment_body_too_long", "detail": "max 8192 characters"})
		return
	}
	comment, err := repo.CreatePipelineComment(r.Context(), pipelineID, *actor, body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create_comment_failed", "detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

// DELETE /pipelines/{id}/comments/{comment_id} — author or pipeline owner.
func DeletePipelineComment(w http.ResponseWriter, r *http.Request) {
	repo, ok := requirePipelineAccessRepository(w, "DeletePipelineComment requires DATABASE_URL-backed pipeline access repository wiring")
	if !ok {
		return
	}
	pipelineID, err := pipelineIDFromRequest(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_pipeline_id", "detail": err.Error()})
		return
	}
	commentID, err := uuid.Parse(chi.URLParam(r, "comment_id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_comment_id", "detail": err.Error()})
		return
	}
	actor := actorIDFromRequest(r)
	if actor == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing_principal"})
		return
	}
	owner, err := repo.GetPipelineOwner(r.Context(), pipelineID)
	if err != nil {
		if err.Error() == "pipeline not found" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "pipeline_not_found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pipeline_owner_lookup_failed", "detail": err.Error()})
		return
	}
	removed, err := repo.DeletePipelineComment(r.Context(), pipelineID, commentID, *actor, owner == *actor)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete_comment_failed", "detail": err.Error()})
		return
	}
	if !removed {
		// Not found OR not authorized — return 404 to avoid leaking existence
		// to unrelated principals; the owner check above is the only
		// privilege escalation path.
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

var _ = errPipelineNotFound
