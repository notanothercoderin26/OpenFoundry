package workspace

// resource_ops.go ports services/tenancy-organizations-service/src/handlers/resource_ops.rs.
//
// These endpoints are scoped to the *ontology* workspace surface for
// Phase 1 (projects, folders, resource bindings). Other resource kinds
// continue to expose their own move/rename APIs in their owning
// services; the workspace UI is expected to call those services
// directly when a non-ontology row is acted upon — the `/batch`
// endpoint will gain a router for that in a later phase.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	audittrail "github.com/openfoundry/openfoundry-go/libs/audit-trail"
	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/core-models/ids"
	"github.com/openfoundry/openfoundry-go/libs/core-models/rid"
	"github.com/openfoundry/openfoundry-go/services/tenancy-organizations-service/internal/models"
)

const DefaultTrashRetentionDays = 30

// MoveRequest is the body of POST /workspace/resources/{kind}/{id}/move.
type MoveRequest struct {
	// TargetFolderID is the destination folder. nil moves the resource
	// to the project root (or, for resource bindings, leaves the binding
	// without folder ownership — folder ownership for bindings is
	// reserved for a later phase).
	TargetFolderID *uuid.UUID `json:"target_folder_id,omitempty"`
	// TargetFolderRID is the canonical Compass parent folder RID. When it
	// equals the target project RID, the folder moves to the project root.
	TargetFolderRID *string `json:"target_folder_rid,omitempty"`
	// TargetProjectID is the destination project. Only meaningful for
	// resource bindings — folders cannot hop projects in Phase 1
	// because that requires a deep clone.
	TargetProjectID *uuid.UUID `json:"target_project_id,omitempty"`
	// TargetProjectRID is the canonical Compass target project RID.
	TargetProjectRID *string `json:"target_project_rid,omitempty"`
	// ConfirmAccessPolicyChange is required when a folder crosses a project
	// boundary because inherited project roles and folder grants can change.
	ConfirmAccessPolicyChange bool `json:"confirm_access_policy_change,omitempty"`
	// ConfirmMarkingChange is required when the target project has a different
	// compatible marking set.
	ConfirmMarkingChange bool `json:"confirm_marking_change,omitempty"`
}

// RenameRequest is the body of POST /workspace/resources/{kind}/{id}/rename.
type RenameRequest struct {
	Name string `json:"name"`
}

type folderMoveSnapshot struct {
	ID             uuid.UUID
	RID            string
	ProjectID      uuid.UUID
	ParentFolderID *uuid.UUID
}

type projectMoveSnapshot struct {
	ID                             uuid.UUID
	RID                            string
	MarkingRIDs                    []string
	ResourceLevelRoleGrantsAllowed bool
	DefaultRole                    string
}

// DuplicateRequest is the body of POST /workspace/resources/{kind}/{id}/duplicate.
type DuplicateRequest struct {
	NewName        *string    `json:"new_name,omitempty"`
	TargetFolderID *uuid.UUID `json:"target_folder_id,omitempty"`
}

// BatchAction is one entry in a /workspace/resources/batch payload.
type BatchAction struct {
	Op                        string      `json:"op"` // "move" | "delete"/"trash" | "share"
	ResourceKind              string      `json:"resource_kind"`
	ResourceID                uuid.UUID   `json:"resource_id"`
	TargetFolderID            *uuid.UUID  `json:"target_folder_id,omitempty"`
	TargetFolderRID           *string     `json:"target_folder_rid,omitempty"`
	TargetProjectID           *uuid.UUID  `json:"target_project_id,omitempty"`
	TargetProjectRID          *string     `json:"target_project_rid,omitempty"`
	ConfirmAccessPolicyChange bool        `json:"confirm_access_policy_change,omitempty"`
	ConfirmMarkingChange      bool        `json:"confirm_marking_change,omitempty"`
	RetentionDays             *int        `json:"retention_days,omitempty"`
	SharedWithUserID          *uuid.UUID  `json:"shared_with_user_id,omitempty"`
	SharedWithGroupID         *uuid.UUID  `json:"shared_with_group_id,omitempty"`
	AccessLevel               AccessLevel `json:"access_level,omitempty"`
	Note                      *string     `json:"note,omitempty"`
	ExpiresAt                 *time.Time  `json:"expires_at,omitempty"`
}

// BatchRequest is the body of POST /workspace/resources/batch.
type BatchRequest struct {
	Actions []BatchAction `json:"actions"`
}

// BatchResultEntry is the per-action outcome reported back to the UI.
type BatchResultEntry struct {
	Op              string     `json:"op"`
	ResourceKind    string     `json:"resource_kind"`
	ResourceID      uuid.UUID  `json:"resource_id"`
	OK              bool       `json:"ok"`
	Error           *string    `json:"error"`
	ShareID         *uuid.UUID `json:"share_id,omitempty"`
	ShareChangeType string     `json:"share_change_type,omitempty"`
}

// BatchResponse pins the batch envelope.
type BatchResponse struct {
	BatchID         string             `json:"batch_id,omitempty"`
	PreflightFailed bool               `json:"preflight_failed,omitempty"`
	Results         []BatchResultEntry `json:"results"`
}

// ─── HTTP handlers ──────────────────────────────────────────────────

// MoveResource handles POST /api/v1/workspace/resources/{kind}/{id}/move.
//
// Folders can be re-parented within a project or moved to another project
// after explicit policy/marking confirmation. RIDs are never modified; path
// and breadcrumb views are derived from the updated project/parent chain.
func (h *Handlers) MoveResource(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	kind, err := ParseResourceKind(chi.URLParam(r, "kind"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	resourceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid resource id")
		return
	}
	var body MoveRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if kind == ResourceOntologyFolder && (body.TargetProjectID != nil || body.TargetProjectRID != nil) && !body.ConfirmAccessPolicyChange {
		writeJSONErr(w, http.StatusConflict, "moving a folder across projects changes inherited access policies; set confirm_access_policy_change=true")
		return
	}
	if status, msg := h.Repo.ensureOwnerOrAdmin(r.Context(), claims, kind, resourceID); status != 0 {
		writeJSONErr(w, status, msg)
		return
	}
	switch kind {
	case ResourceOntologyFolder:
		if err := h.Repo.moveFolder(r.Context(), claims, resourceID, body, AuditContextFromRequest(claims, r), true); err != nil {
			writeMoveError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case ResourceOntologyResourceBinding:
		// Move a resource binding to a different project. We do not
		// model folder ownership for bindings yet, so target_folder_id
		// is currently ignored — kept in the API for forward-compat.
		if body.TargetProjectID == nil {
			writeJSONErr(w, http.StatusBadRequest,
				"'target_project_id' is required for resource bindings")
			return
		}
		if err := h.Repo.moveResourceBinding(r.Context(), resourceID, *body.TargetProjectID, AuditContextFromRequest(claims, r), true); err != nil {
			writeMoveError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeJSONErr(w, http.StatusBadRequest,
			fmt.Sprintf("move is not supported for resource_kind '%s'", kind))
	}
}

// RenameResource handles POST /api/v1/workspace/resources/{kind}/{id}/rename.
func (h *Handlers) RenameResource(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	kind, err := ParseResourceKind(chi.URLParam(r, "kind"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	resourceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid resource id")
		return
	}
	var body RenameRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	newName := strings.TrimSpace(body.Name)
	if newName == "" {
		writeJSONErr(w, http.StatusBadRequest, "'name' must not be empty")
		return
	}
	if status, msg := h.Repo.ensureOwnerOrAdmin(r.Context(), claims, kind, resourceID); status != 0 {
		writeJSONErr(w, status, msg)
		return
	}
	switch kind {
	case ResourceOntologyProject:
		tx, err := h.Repo.Pool.Begin(r.Context())
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to start resource rename transaction: %s", err))
			return
		}
		defer tx.Rollback(context.Background())
		before, err := h.Repo.loadResourceAuditSnapshotTx(r.Context(), tx, kind, resourceID, false)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to load resource rename audit snapshot: %s", err))
			return
		}
		ct, err := tx.Exec(r.Context(),
			`UPDATE ontology_projects
			   SET display_name = $2, updated_at = NOW()
			   WHERE id = $1 AND is_deleted = FALSE`,
			resourceID, newName)
		if err != nil {
			slog.Error("failed to rename project", slog.String("error", err.Error()))
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to rename project: %s", err))
			return
		}
		if ct.RowsAffected() == 0 {
			writeJSONErr(w, http.StatusNotFound, "no row matched")
			return
		}
		if err := UpsertProjectSearchIndexTx(r.Context(), tx, resourceID, ResourceSearchEventUpdated); err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to index renamed project: %s", err))
			return
		}
		after, err := h.Repo.loadResourceAuditSnapshotTx(r.Context(), tx, kind, resourceID, false)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to load renamed project audit snapshot: %s", err))
			return
		}
		if before != nil && after != nil {
			if err := audittrail.EmitToOutbox(r.Context(), tx, after.renamedEvent(before), AuditContextFromRequest(claims, r)); err != nil {
				writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to audit renamed project: %s", err))
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to commit resource rename transaction: %s", err))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case ResourceOntologyFolder:
		slug, err := folderSlugFromName(newName)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, err.Error())
			return
		}
		tx, err := h.Repo.Pool.Begin(r.Context())
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to start resource rename transaction: %s", err))
			return
		}
		defer tx.Rollback(context.Background())
		before, err := h.Repo.loadResourceAuditSnapshotTx(r.Context(), tx, kind, resourceID, false)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to load resource rename audit snapshot: %s", err))
			return
		}
		ct, err := tx.Exec(r.Context(),
			`UPDATE ontology_project_folders
			   SET name = $2, slug = $3, updated_at = NOW()
			   WHERE id = $1 AND is_deleted = FALSE`,
			resourceID, newName, slug)
		if err != nil {
			slog.Error("failed to rename folder", slog.String("error", err.Error()))
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to rename folder: %s", err))
			return
		}
		if ct.RowsAffected() == 0 {
			writeJSONErr(w, http.StatusNotFound, "no row matched")
			return
		}
		if err := UpsertFolderSearchIndexTx(r.Context(), tx, resourceID, ResourceSearchEventUpdated); err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to index renamed folder: %s", err))
			return
		}
		after, err := h.Repo.loadResourceAuditSnapshotTx(r.Context(), tx, kind, resourceID, false)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to load renamed folder audit snapshot: %s", err))
			return
		}
		if before != nil && after != nil {
			if err := audittrail.EmitToOutbox(r.Context(), tx, after.renamedEvent(before), AuditContextFromRequest(claims, r)); err != nil {
				writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to audit renamed folder: %s", err))
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to commit resource rename transaction: %s", err))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeJSONErr(w, http.StatusBadRequest,
			fmt.Sprintf("rename is not supported for resource_kind '%s'", kind))
	}
}

// DuplicateResource handles POST /api/v1/workspace/resources/{kind}/{id}/duplicate.
//
// Phase 1 only supports duplicating *folders* (shallow: the folder row
// is cloned with a new id; children are not copied). Duplicating
// projects or resource bindings requires a deeper clone routine that is
// out of scope here and deferred to Phase 2.
func (h *Handlers) DuplicateResource(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	kind, err := ParseResourceKind(chi.URLParam(r, "kind"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	resourceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid resource id")
		return
	}
	var body DuplicateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if status, msg := h.Repo.ensureOwnerOrAdmin(r.Context(), claims, kind, resourceID); status != 0 {
		writeJSONErr(w, status, msg)
		return
	}

	switch kind {
	case ResourceOntologyFolder:
		newID := ids.New()
		newRID := models.FolderRIDFromID(newID)
		tx, err := h.Repo.Pool.Begin(r.Context())
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError,
				fmt.Sprintf("failed to start duplicate folder transaction: %s", err))
			return
		}
		defer tx.Rollback(context.Background())
		ct, err := tx.Exec(r.Context(),
			`INSERT INTO ontology_project_folders
			       (id, rid, project_id, parent_folder_id, name, slug, description, created_by)
			   SELECT $1,
			          $2,
			          project_id,
			          COALESCE($3, parent_folder_id),
			          COALESCE($4, name || ' (copy)'),
			          slug || '-' || substr($1::text, 1, 8),
			          description,
			          $5
			   FROM ontology_project_folders
			   WHERE id = $6 AND is_deleted = FALSE`,
			newID, newRID, body.TargetFolderID, body.NewName, claims.Sub, resourceID)
		if err != nil {
			slog.Error("duplicate folder", slog.String("error", err.Error()))
			writeJSONErr(w, http.StatusInternalServerError,
				fmt.Sprintf("failed to duplicate folder: %s", err))
			return
		}
		if ct.RowsAffected() == 0 {
			writeJSONErr(w, http.StatusNotFound, "source folder not found")
			return
		}
		if err := UpsertFolderSearchIndexTx(r.Context(), tx, newID, ResourceSearchEventCreated); err != nil {
			writeJSONErr(w, http.StatusInternalServerError,
				fmt.Sprintf("failed to index duplicated folder: %s", err))
			return
		}
		if err := h.Repo.EmitResourceCreatedTx(r.Context(), tx, ResourceOntologyFolder, newID, AuditContextFromRequest(claims, r)); err != nil {
			writeJSONErr(w, http.StatusInternalServerError,
				fmt.Sprintf("failed to audit duplicated folder: %s", err))
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			writeJSONErr(w, http.StatusInternalServerError,
				fmt.Sprintf("failed to commit duplicate folder transaction: %s", err))
			return
		}
		writeJSON(w, http.StatusCreated, map[string]uuid.UUID{"id": newID})
	default:
		writeJSONErr(w, http.StatusBadRequest,
			fmt.Sprintf("duplicate is not supported for resource_kind '%s' in Phase 1", kind))
	}
}

// SoftDeleteResource handles DELETE /api/v1/workspace/resources/{kind}/{id}.
// Soft-delete sends the row to the trash. Hard delete is `…/purge` in the
// trash handler (TO-6).
func (h *Handlers) SoftDeleteResource(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	kind, err := ParseResourceKind(chi.URLParam(r, "kind"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	resourceID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid resource id")
		return
	}
	if status, msg := h.Repo.ensureOwnerOrAdmin(r.Context(), claims, kind, resourceID); status != 0 {
		writeJSONErr(w, status, msg)
		return
	}
	retentionDays, err := trashRetentionDaysFromRequest(r)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}

	switch kind {
	case ResourceOntologyProject, ResourceOntologyFolder, ResourceOntologyResourceBinding:
		tx, err := h.Repo.Pool.Begin(r.Context())
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to start resource delete transaction: %s", err))
			return
		}
		defer tx.Rollback(context.Background())
		rowsAffected, err := h.Repo.softDeleteOneTx(r.Context(), tx, claims.Sub, kind, resourceID, retentionDays, AuditContextFromRequest(claims, r), true)
		if err != nil {
			slog.Error("failed to delete resource", slog.String("error", err.Error()))
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to delete resource: %s", err))
			return
		}
		if rowsAffected == 0 {
			writeJSONErr(w, http.StatusNotFound, "no row matched")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to commit resource delete transaction: %s", err))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeJSONErr(w, http.StatusBadRequest,
			fmt.Sprintf("soft delete is not supported for resource_kind '%s'", kind))
	}
}

// BatchApply handles POST /api/v1/workspace/resources/batch.
//
// The handler performs a full pre-flight pass before mutating anything:
// policy checks, confirmation gates, and request-shape validation must all
// pass before the selected resources are changed. Successful batches emit one
// aggregate Compass audit event instead of per-resource audit rows.
func (h *Handlers) BatchApply(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	batchID := ids.New()
	results := make([]BatchResultEntry, len(body.Actions))
	prepared := make([]preparedBatchAction, 0, len(body.Actions))
	auditCtx := AuditContextFromRequest(claims, r)
	preflightFailed := false
	for i, action := range body.Actions {
		action.Op = strings.TrimSpace(action.Op)
		entry := BatchResultEntry{
			Op:           action.Op,
			ResourceKind: action.ResourceKind,
			ResourceID:   action.ResourceID,
		}
		p, err := h.preflightBatchAction(r.Context(), claims, i, action)
		if err != nil {
			msg := err.Error()
			entry.Error = &msg
			preflightFailed = true
		} else {
			prepared = append(prepared, p)
		}
		results[i] = entry
	}

	if preflightFailed {
		for i := range results {
			if results[i].Error == nil {
				msg := "preflight aborted before mutation"
				results[i].Error = &msg
			}
		}
		if err := h.emitBatchOperationAudit(r.Context(), batchID, body.Actions, results, true, auditCtx); err != nil {
			slog.Error("emit batch resource audit", slog.String("error", err.Error()))
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to audit batch operation: %s", err))
			return
		}
		writeJSON(w, http.StatusOK, BatchResponse{BatchID: batchID.String(), PreflightFailed: true, Results: results})
		return
	}

	for _, p := range prepared {
		entry := &results[p.index]
		opErr := h.applyPreparedBatchAction(r.Context(), claims, p, auditCtx, entry)
		if opErr != nil {
			msg := opErr.Error()
			entry.Error = &msg
		} else {
			entry.OK = true
		}
	}
	if err := h.emitBatchOperationAudit(r.Context(), batchID, body.Actions, results, false, auditCtx); err != nil {
		slog.Error("emit batch resource audit", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to audit batch operation: %s", err))
		return
	}

	writeJSON(w, http.StatusOK, BatchResponse{BatchID: batchID.String(), Results: results})
}

type preparedBatchAction struct {
	index           int
	action          BatchAction
	kind            ResourceKind
	retentionDays   int
	targetProjectID uuid.UUID
	shareArgs       upsertShareArgs
}

func (h *Handlers) preflightBatchAction(ctx context.Context, claims *authmw.Claims, index int, action BatchAction) (preparedBatchAction, error) {
	prepared := preparedBatchAction{index: index, action: action}
	if action.ResourceID == uuid.Nil {
		return prepared, errors.New("resource_id required")
	}
	kind, err := ParseResourceKind(action.ResourceKind)
	if err != nil {
		return prepared, err
	}
	prepared.kind = kind
	switch action.Op {
	case "delete", "trash":
		if err := h.requireBatchRepo(); err != nil {
			return prepared, err
		}
		if kind != ResourceOntologyProject && kind != ResourceOntologyFolder && kind != ResourceOntologyResourceBinding {
			return prepared, fmt.Errorf("batch trash only supported for ontology workspace resources (got '%s')", kind)
		}
		retentionDays, err := normalizeTrashRetentionDays(action.RetentionDays)
		if err != nil {
			return prepared, err
		}
		if status, msg := h.Repo.ensureOwnerOrAdmin(ctx, claims, kind, action.ResourceID); status != 0 {
			return prepared, batchPolicyError(status, msg)
		}
		prepared.retentionDays = retentionDays
	case "move":
		if err := h.requireBatchRepo(); err != nil {
			return prepared, err
		}
		if status, msg := h.Repo.ensureOwnerOrAdmin(ctx, claims, kind, action.ResourceID); status != 0 {
			return prepared, batchPolicyError(status, msg)
		}
		switch kind {
		case ResourceOntologyFolder:
			_, err := h.Repo.resolveFolderMovePlan(ctx, claims, action.ResourceID, batchMoveRequest(action))
			if err != nil {
				return prepared, err
			}
		case ResourceOntologyResourceBinding:
			targetProjectID, err := resolveBatchTargetProjectID(action)
			if err != nil {
				return prepared, err
			}
			if status, msg := h.Repo.ensureOwnerOrAdmin(ctx, claims, ResourceOntologyProject, targetProjectID); status != 0 {
				return prepared, batchPolicyError(status, msg)
			}
			prepared.targetProjectID = targetProjectID
		default:
			return prepared, fmt.Errorf("batch move only supported for ontology_folder or ontology_resource_binding (got '%s')", kind)
		}
	case "share":
		userSet := action.SharedWithUserID != nil
		groupSet := action.SharedWithGroupID != nil
		if userSet == groupSet {
			return prepared, errors.New("exactly one of 'shared_with_user_id' or 'shared_with_group_id' must be provided")
		}
		if !action.AccessLevel.IsValid() {
			return prepared, errors.New("invalid access_level")
		}
		if err := h.requireBatchRepo(); err != nil {
			return prepared, err
		}
		switch kind {
		case ResourceOntologyProject, ResourceOntologyFolder, ResourceOntologyResourceBinding:
			if status, msg := h.Repo.ensureOwnerOrAdmin(ctx, claims, kind, action.ResourceID); status != 0 {
				return prepared, batchPolicyError(status, msg)
			}
		default:
			if !claims.HasRole("admin") {
				return prepared, errors.New("only an admin may bulk-share externally owned resources")
			}
		}
		note := ""
		if action.Note != nil {
			note = *action.Note
		}
		prepared.shareArgs = upsertShareArgs{
			ResourceKind:      kind,
			ResourceID:        action.ResourceID,
			SharedWithUserID:  action.SharedWithUserID,
			SharedWithGroupID: action.SharedWithGroupID,
			SharerID:          claims.Sub,
			AccessLevel:       action.AccessLevel,
			Note:              note,
			ExpiresAt:         action.ExpiresAt,
		}
	default:
		return prepared, fmt.Errorf("unsupported batch op '%s'", action.Op)
	}
	return prepared, nil
}

func (h *Handlers) applyPreparedBatchAction(ctx context.Context, claims *authmw.Claims, prepared preparedBatchAction, auditCtx audittrail.AuditContext, entry *BatchResultEntry) error {
	switch prepared.action.Op {
	case "delete", "trash":
		return h.Repo.softDeleteOne(ctx, claims.Sub, prepared.kind, prepared.action.ResourceID, prepared.retentionDays, auditCtx, false)
	case "move":
		switch prepared.kind {
		case ResourceOntologyFolder:
			return h.Repo.moveFolder(ctx, claims, prepared.action.ResourceID, batchMoveRequest(prepared.action), auditCtx, false)
		case ResourceOntologyResourceBinding:
			return h.Repo.moveResourceBinding(ctx, prepared.action.ResourceID, prepared.targetProjectID, auditCtx, false)
		default:
			return fmt.Errorf("batch move only supported for ontology_folder or ontology_resource_binding (got '%s')", prepared.kind)
		}
	case "share":
		share, status, err := h.Repo.UpsertShare(ctx, prepared.shareArgs, auditCtx, false)
		if err != nil {
			return err
		}
		if share != nil {
			entry.ShareID = &share.ID
		}
		if status == http.StatusCreated {
			entry.ShareChangeType = "granted"
		} else {
			entry.ShareChangeType = "updated"
		}
		return nil
	default:
		return fmt.Errorf("unsupported batch op '%s'", prepared.action.Op)
	}
}

func (h *Handlers) requireBatchRepo() error {
	if h == nil || h.Repo == nil || h.Repo.Pool == nil {
		return errors.New("batch repository not configured")
	}
	return nil
}

func batchPolicyError(status int, msg string) error {
	if strings.TrimSpace(msg) != "" {
		return errors.New(msg)
	}
	if status == http.StatusForbidden {
		return errors.New("forbidden")
	}
	if status == http.StatusNotFound {
		return errors.New("resource not found")
	}
	return fmt.Errorf("policy check failed with status %d", status)
}

func batchMoveRequest(action BatchAction) MoveRequest {
	return MoveRequest{
		TargetFolderID:            action.TargetFolderID,
		TargetFolderRID:           action.TargetFolderRID,
		TargetProjectID:           action.TargetProjectID,
		TargetProjectRID:          action.TargetProjectRID,
		ConfirmAccessPolicyChange: action.ConfirmAccessPolicyChange,
		ConfirmMarkingChange:      action.ConfirmMarkingChange,
	}
}

func resolveBatchTargetProjectID(action BatchAction) (uuid.UUID, error) {
	targetProjectID := uuid.Nil
	targetProjectExplicit := false
	if action.TargetProjectID != nil {
		targetProjectID = *action.TargetProjectID
		targetProjectExplicit = true
	}
	if action.TargetProjectRID != nil {
		id, err := parseProjectRIDLocator(*action.TargetProjectRID, "target_project_rid")
		if err != nil {
			return uuid.Nil, err
		}
		if targetProjectExplicit && targetProjectID != id {
			return uuid.Nil, errors.New("target_project_id and target_project_rid refer to different projects")
		}
		targetProjectID = id
		targetProjectExplicit = true
	}
	if !targetProjectExplicit {
		return uuid.Nil, errors.New("'target_project_id' or 'target_project_rid' is required for resource bindings")
	}
	return targetProjectID, nil
}

func (h *Handlers) emitBatchOperationAudit(ctx context.Context, batchID uuid.UUID, actions []BatchAction, results []BatchResultEntry, preflightFailed bool, auditCtx audittrail.AuditContext) error {
	if len(actions) == 0 || h == nil || h.Repo == nil || h.Repo.Pool == nil {
		return nil
	}
	return h.Repo.EmitResourceBulkOperation(ctx, batchID, batchAuditActions(actions, results, preflightFailed), preflightFailed, auditCtx)
}

func batchAuditActions(actions []BatchAction, results []BatchResultEntry, preflightFailed bool) []audittrail.BulkResourceAction {
	out := make([]audittrail.BulkResourceAction, 0, len(actions))
	for i, action := range actions {
		result := BatchResultEntry{Op: strings.TrimSpace(action.Op), ResourceKind: action.ResourceKind, ResourceID: action.ResourceID}
		if i < len(results) {
			result = results[i]
		}
		status := "failed"
		if result.OK {
			status = "succeeded"
		} else if preflightFailed {
			status = "preflight_failed"
			if result.Error != nil && *result.Error == "preflight aborted before mutation" {
				status = "skipped"
			}
		}
		errorText := ""
		if result.Error != nil {
			errorText = *result.Error
		}
		kindText := action.ResourceKind
		resourceRID := ""
		if kind, err := ParseResourceKind(action.ResourceKind); err == nil {
			kindText = string(kind)
			if action.ResourceID != uuid.Nil {
				resourceRID = resourceRIDForKind(kind, action.ResourceID)
			}
		}
		auditAction := audittrail.BulkResourceAction{
			Op:           result.Op,
			ResourceKind: kindText,
			ResourceID:   action.ResourceID.String(),
			ResourceRID:  resourceRID,
			Status:       status,
			Error:        errorText,
		}
		if action.TargetProjectRID != nil && strings.TrimSpace(*action.TargetProjectRID) != "" {
			auditAction.TargetProjectRID = strings.TrimSpace(*action.TargetProjectRID)
		} else if action.TargetProjectID != nil {
			auditAction.TargetProjectRID = models.ProjectRIDFromID(*action.TargetProjectID)
		}
		if action.TargetFolderRID != nil && strings.TrimSpace(*action.TargetFolderRID) != "" {
			auditAction.TargetFolderRID = strings.TrimSpace(*action.TargetFolderRID)
		} else if action.TargetFolderID != nil {
			auditAction.TargetFolderRID = models.FolderRIDFromID(*action.TargetFolderID)
		}
		if action.RetentionDays != nil {
			days := *action.RetentionDays
			auditAction.RetentionDays = &days
		} else if result.Op == "delete" || result.Op == "trash" {
			days := DefaultTrashRetentionDays
			auditAction.RetentionDays = &days
		}
		if result.ShareID != nil {
			auditAction.ShareID = result.ShareID.String()
		}
		if result.ShareChangeType != "" {
			auditAction.ShareChangeType = result.ShareChangeType
		}
		if action.SharedWithUserID != nil {
			auditAction.SharePrincipalKind = "user"
			auditAction.SharePrincipalID = action.SharedWithUserID.String()
		}
		if action.SharedWithGroupID != nil {
			auditAction.SharePrincipalKind = "group"
			auditAction.SharePrincipalID = action.SharedWithGroupID.String()
		}
		if action.AccessLevel != "" {
			auditAction.ShareAccessLevel = string(action.AccessLevel)
		}
		out = append(out, auditAction)
	}
	return out
}

// ─── Internal helpers ───────────────────────────────────────────────

type resourceOpError struct {
	status int
	msg    string
}

func (e *resourceOpError) Error() string { return e.msg }

func newResourceOpError(status int, msg string) error {
	return &resourceOpError{status: status, msg: msg}
}

func writeMoveError(w http.ResponseWriter, err error) {
	var opErr *resourceOpError
	if errors.As(err, &opErr) {
		writeJSONErr(w, opErr.status, opErr.msg)
		return
	}
	slog.Error("failed to move folder", slog.String("error", err.Error()))
	writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to move folder: %s", err))
}

func folderSlugFromName(value string) (string, error) {
	var slug strings.Builder
	lastWasDash := false
	for _, ch := range value {
		if isASCIIAlphaNum(ch) {
			if ch >= 'A' && ch <= 'Z' {
				ch += 'a' - 'A'
			}
			slug.WriteRune(ch)
			lastWasDash = false
			continue
		}
		if slug.Len() > 0 && !lastWasDash {
			slug.WriteByte('-')
			lastWasDash = true
		}
	}
	out := strings.Trim(slug.String(), "-")
	if out == "" {
		return "", errors.New("folder name must contain letters or numbers")
	}
	return out, nil
}

func isASCIIAlphaNum(r rune) bool {
	return ('a' <= r && r <= 'z') || ('A' <= r && r <= 'Z') || ('0' <= r && r <= '9')
}

func parseProjectRIDLocator(value, field string) (uuid.UUID, error) {
	parsed, err := rid.ParseUUID(strings.TrimSpace(value))
	if err != nil {
		return uuid.Nil, fmt.Errorf("%s must be a valid project RID: %s", field, err)
	}
	if parsed.Service != "compass" || parsed.ResourceType != "project" {
		return uuid.Nil, fmt.Errorf("%s must be a compass project RID", field)
	}
	id, ok := parsed.UUID()
	if !ok {
		return uuid.Nil, fmt.Errorf("%s must carry a UUID locator", field)
	}
	return id, nil
}

func parseFolderRIDLocator(value, field string) (uuid.UUID, error) {
	parsed, err := rid.ParseUUID(strings.TrimSpace(value))
	if err != nil {
		return uuid.Nil, fmt.Errorf("%s must be a valid folder RID: %s", field, err)
	}
	if parsed.Service != "compass" || parsed.ResourceType != "folder" {
		return uuid.Nil, fmt.Errorf("%s must be a compass folder RID", field)
	}
	id, ok := parsed.UUID()
	if !ok {
		return uuid.Nil, fmt.Errorf("%s must carry a UUID locator", field)
	}
	return id, nil
}

type folderMovePlan struct {
	sourceFolder    *folderMoveSnapshot
	targetProjectID uuid.UUID
	targetFolderID  *uuid.UUID
	crossProject    bool
}

func (r *Repo) resolveFolderMovePlan(ctx context.Context, claims *authmw.Claims, folderID uuid.UUID, body MoveRequest) (*folderMovePlan, error) {
	sourceFolder, err := r.loadFolderMoveSnapshot(ctx, folderID)
	if err != nil {
		return nil, err
	}
	if sourceFolder == nil {
		return nil, newResourceOpError(http.StatusNotFound, "source folder not found")
	}
	sourceProject, err := r.loadProjectMoveSnapshot(ctx, sourceFolder.ProjectID)
	if err != nil {
		return nil, err
	}
	if sourceProject == nil {
		return nil, newResourceOpError(http.StatusNotFound, "source project not found")
	}

	targetProjectID := sourceFolder.ProjectID
	targetProjectExplicit := false
	if body.TargetProjectID != nil {
		targetProjectID = *body.TargetProjectID
		targetProjectExplicit = true
	}
	if body.TargetProjectRID != nil {
		id, err := parseProjectRIDLocator(*body.TargetProjectRID, "target_project_rid")
		if err != nil {
			return nil, newResourceOpError(http.StatusBadRequest, err.Error())
		}
		if targetProjectExplicit && targetProjectID != id {
			return nil, newResourceOpError(http.StatusBadRequest, "target_project_id and target_project_rid refer to different projects")
		}
		targetProjectID = id
		targetProjectExplicit = true
	}

	var targetFolderID *uuid.UUID
	if body.TargetFolderID != nil {
		target := *body.TargetFolderID
		targetFolderID = &target
	}
	if body.TargetFolderRID != nil {
		clean := strings.TrimSpace(*body.TargetFolderRID)
		if clean == "" {
			return nil, newResourceOpError(http.StatusBadRequest, "target_folder_rid must be a non-empty RID")
		}
		targetProjectRID := models.ProjectRIDFromID(targetProjectID)
		if clean == targetProjectRID {
			targetFolderID = nil
		} else {
			id, err := parseFolderRIDLocator(clean, "target_folder_rid")
			if err != nil {
				return nil, newResourceOpError(http.StatusBadRequest, err.Error())
			}
			if targetFolderID != nil && *targetFolderID != id {
				return nil, newResourceOpError(http.StatusBadRequest, "target_folder_id and target_folder_rid refer to different folders")
			}
			targetFolderID = &id
		}
	}

	if targetFolderID != nil {
		if *targetFolderID == folderID {
			return nil, newResourceOpError(http.StatusConflict, "cannot move a folder into itself")
		}
		parent, err := r.loadFolderMoveSnapshot(ctx, *targetFolderID)
		if err != nil {
			return nil, err
		}
		if parent == nil {
			return nil, newResourceOpError(http.StatusNotFound, "target folder not found")
		}
		if targetProjectExplicit && parent.ProjectID != targetProjectID {
			return nil, newResourceOpError(http.StatusBadRequest, "target folder does not belong to target project")
		}
		targetProjectID = parent.ProjectID
		if parent.ProjectID == sourceFolder.ProjectID {
			descendant, err := r.isDescendantFolder(ctx, sourceFolder.ProjectID, folderID, *targetFolderID)
			if err != nil {
				return nil, err
			}
			if descendant {
				return nil, newResourceOpError(http.StatusConflict, "cannot move a folder into one of its descendants")
			}
		}
	}

	targetProject, err := r.loadProjectMoveSnapshot(ctx, targetProjectID)
	if err != nil {
		return nil, err
	}
	if targetProject == nil {
		return nil, newResourceOpError(http.StatusNotFound, "target project not found")
	}
	crossProject := targetProjectID != sourceFolder.ProjectID
	if crossProject {
		if status, msg := r.ensureOwnerOrAdmin(ctx, claims, ResourceOntologyProject, targetProjectID); status != 0 {
			return nil, newResourceOpError(status, msg)
		}
		if !body.ConfirmAccessPolicyChange {
			return nil, newResourceOpError(http.StatusConflict, "moving a folder across projects changes inherited access policies; set confirm_access_policy_change=true")
		}
		missing := missingStrings(sourceProject.MarkingRIDs, targetProject.MarkingRIDs)
		if len(missing) > 0 {
			return nil, newResourceOpError(http.StatusConflict, fmt.Sprintf("target project markings are incompatible; missing: %s", strings.Join(missing, ", ")))
		}
		if !sameStringSet(sourceProject.MarkingRIDs, targetProject.MarkingRIDs) && !body.ConfirmMarkingChange {
			return nil, newResourceOpError(http.StatusConflict, "moving a folder changes inherited markings; set confirm_marking_change=true")
		}
	}

	return &folderMovePlan{
		sourceFolder:    sourceFolder,
		targetProjectID: targetProjectID,
		targetFolderID:  targetFolderID,
		crossProject:    crossProject,
	}, nil
}

func (r *Repo) moveFolder(ctx context.Context, claims *authmw.Claims, folderID uuid.UUID, body MoveRequest, auditCtx audittrail.AuditContext, emitAudit bool) error {
	plan, err := r.resolveFolderMovePlan(ctx, claims, folderID, body)
	if err != nil {
		return err
	}
	if plan.crossProject {
		return r.moveFolderAcrossProjects(ctx, folderID, plan.targetProjectID, plan.targetFolderID, auditCtx, emitAudit)
	}
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var before *resourceAuditSnapshot
	if emitAudit {
		before, err = r.loadResourceAuditSnapshotTx(ctx, tx, ResourceOntologyFolder, folderID, false)
		if err != nil {
			return err
		}
	}
	ct, err := tx.Exec(ctx,
		`UPDATE ontology_project_folders
		   SET parent_folder_id = $2, updated_at = NOW()
		   WHERE id = $1 AND is_deleted = FALSE`,
		folderID, plan.targetFolderID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return newResourceOpError(http.StatusNotFound, "source folder not found")
	}
	if err := UpsertFolderSearchIndexTx(ctx, tx, folderID, ResourceSearchEventMoved); err != nil {
		return err
	}
	if emitAudit {
		after, err := r.loadResourceAuditSnapshotTx(ctx, tx, ResourceOntologyFolder, folderID, false)
		if err != nil {
			return err
		}
		if before != nil && after != nil {
			if err := audittrail.EmitToOutbox(ctx, tx, after.movedEvent(before), auditCtx); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}

func (r *Repo) moveResourceBinding(ctx context.Context, resourceID, targetProjectID uuid.UUID, auditCtx audittrail.AuditContext, emitAudit bool) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	var before *resourceAuditSnapshot
	if emitAudit {
		before, err = r.loadResourceAuditSnapshotTx(ctx, tx, ResourceOntologyResourceBinding, resourceID, false)
		if err != nil {
			return err
		}
	}
	ct, err := tx.Exec(ctx,
		`UPDATE ontology_project_resources
		   SET project_id = $2
		   WHERE resource_id = $1 AND is_deleted = FALSE`,
		resourceID, targetProjectID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return newResourceOpError(http.StatusNotFound, "no row matched")
	}
	if emitAudit {
		after, err := r.loadResourceAuditSnapshotTx(ctx, tx, ResourceOntologyResourceBinding, resourceID, false)
		if err != nil {
			return err
		}
		if before != nil && after != nil {
			if err := audittrail.EmitToOutbox(ctx, tx, after.movedEvent(before), auditCtx); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}

func (r *Repo) loadFolderMoveSnapshot(ctx context.Context, folderID uuid.UUID) (*folderMoveSnapshot, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, rid, project_id, parent_folder_id
		   FROM ontology_project_folders
		  WHERE id = $1 AND is_deleted = FALSE`,
		folderID,
	)
	var f folderMoveSnapshot
	if err := row.Scan(&f.ID, &f.RID, &f.ProjectID, &f.ParentFolderID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if strings.TrimSpace(f.RID) == "" {
		f.RID = models.FolderRIDFromID(f.ID)
	}
	return &f, nil
}

func (r *Repo) loadProjectMoveSnapshot(ctx context.Context, projectID uuid.UUID) (*projectMoveSnapshot, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(rid, 'ri.compass.main.project.' || id::text),
		        COALESCE(marking_rids, '[]'::jsonb),
		        COALESCE(resource_level_role_grants_allowed, TRUE),
		        COALESCE(default_role, 'viewer')
		   FROM ontology_projects
		  WHERE id = $1 AND is_deleted = FALSE`,
		projectID,
	)
	var (
		p       projectMoveSnapshot
		rawJSON []byte
	)
	if err := row.Scan(&p.ID, &p.RID, &rawJSON, &p.ResourceLevelRoleGrantsAllowed, &p.DefaultRole); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(rawJSON, &p.MarkingRIDs); err != nil {
		return nil, fmt.Errorf("decode project marking_rids: %w", err)
	}
	if p.MarkingRIDs == nil {
		p.MarkingRIDs = []string{}
	}
	return &p, nil
}

func (r *Repo) isDescendantFolder(ctx context.Context, projectID, ancestorID, candidateID uuid.UUID) (bool, error) {
	row := r.Pool.QueryRow(ctx,
		`WITH RECURSIVE descendants AS (
		     SELECT id
		       FROM ontology_project_folders
		      WHERE project_id = $1 AND parent_folder_id = $2 AND is_deleted = FALSE
		     UNION ALL
		     SELECT f.id
		       FROM ontology_project_folders f
		       JOIN descendants d ON f.parent_folder_id = d.id
		      WHERE f.project_id = $1 AND f.is_deleted = FALSE
		 )
		 SELECT EXISTS(SELECT 1 FROM descendants WHERE id = $3)`,
		projectID, ancestorID, candidateID,
	)
	var exists bool
	if err := row.Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (r *Repo) moveFolderAcrossProjects(ctx context.Context, folderID, targetProjectID uuid.UUID, targetFolderID *uuid.UUID, auditCtx audittrail.AuditContext, emitAudit bool) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())

	rows, err := tx.Query(ctx,
		`WITH RECURSIVE moved AS (
		     SELECT id
		       FROM ontology_project_folders
		      WHERE id = $1 AND is_deleted = FALSE
		     UNION ALL
		     SELECT f.id
		       FROM ontology_project_folders f
		       JOIN moved m ON f.parent_folder_id = m.id
		      WHERE f.is_deleted = FALSE
		 )
		 SELECT id FROM moved`,
		folderID,
	)
	if err != nil {
		return err
	}
	movedIDs := make([]uuid.UUID, 0, 8)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		movedIDs = append(movedIDs, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	if len(movedIDs) == 0 {
		return newResourceOpError(http.StatusNotFound, "source folder not found")
	}
	beforeSnapshots := make(map[uuid.UUID]*resourceAuditSnapshot, len(movedIDs))
	if emitAudit {
		for _, movedID := range movedIDs {
			before, err := r.loadResourceAuditSnapshotTx(ctx, tx, ResourceOntologyFolder, movedID, false)
			if err != nil {
				return err
			}
			beforeSnapshots[movedID] = before
		}
	}

	ct, err := tx.Exec(ctx,
		`UPDATE ontology_project_folders
		    SET project_id = $2,
		        parent_folder_id = CASE WHEN id = $1 THEN $3 ELSE parent_folder_id END,
		        updated_at = NOW()
		  WHERE id = ANY($4) AND is_deleted = FALSE`,
		folderID, targetProjectID, targetFolderID, movedIDs,
	)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return newResourceOpError(http.StatusNotFound, "source folder not found")
	}
	if _, err := tx.Exec(ctx,
		`UPDATE ontology_project_resource_grants
		    SET project_id = $2, updated_at = NOW()
		  WHERE scope_kind = 'folder' AND scope_id = ANY($1)`,
		movedIDs, targetProjectID,
	); err != nil {
		return err
	}
	for _, movedID := range movedIDs {
		if err := UpsertFolderSearchIndexTx(ctx, tx, movedID, ResourceSearchEventMoved); err != nil {
			return err
		}
		if emitAudit {
			after, err := r.loadResourceAuditSnapshotTx(ctx, tx, ResourceOntologyFolder, movedID, false)
			if err != nil {
				return err
			}
			if before := beforeSnapshots[movedID]; before != nil && after != nil {
				if err := audittrail.EmitToOutbox(ctx, tx, after.movedEvent(before), auditCtx); err != nil {
					return err
				}
			}
		}
	}
	return tx.Commit(ctx)
}

func sameStringSet(a, b []string) bool {
	return len(missingStrings(a, b)) == 0 && len(missingStrings(b, a)) == 0
}

func missingStrings(required, available []string) []string {
	seen := make(map[string]struct{}, len(available))
	for _, value := range available {
		seen[value] = struct{}{}
	}
	missing := make([]string, 0)
	for _, value := range required {
		if _, ok := seen[value]; !ok {
			missing = append(missing, value)
		}
	}
	return missing
}

// writeExecOutcome maps a pgx.CommandTag/error pair into the standard
// 204/404/500 envelopes used by the Rust resource_ops handler.
type rowsAffectedTag interface{ RowsAffected() int64 }

func writeExecOutcome(w http.ResponseWriter, ct rowsAffectedTag, err error, failureMsg string) {
	if err != nil {
		slog.Error(failureMsg, slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError,
			fmt.Sprintf("%s: %s", failureMsg, err))
		return
	}
	if ct == nil || ct.RowsAffected() == 0 {
		writeJSONErr(w, http.StatusNotFound, "no row matched")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// softDeleteOne runs the same UPDATE as SoftDeleteResource but in the
// batch path, where no per-row response envelope is emitted.
func (r *Repo) softDeleteOne(ctx context.Context, actor uuid.UUID, kind ResourceKind, resourceID uuid.UUID, retentionDays int, auditCtx audittrail.AuditContext, emitAudit bool) error {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err := r.softDeleteOneTx(ctx, tx, actor, kind, resourceID, retentionDays, auditCtx, emitAudit); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repo) softDeleteOneTx(ctx context.Context, tx pgx.Tx, actor uuid.UUID, kind ResourceKind, resourceID uuid.UUID, retentionDays int, auditCtx audittrail.AuditContext, emitAudit bool) (int64, error) {
	switch kind {
	case ResourceOntologyProject:
		ct, err := tx.Exec(ctx,
			`UPDATE ontology_projects
			   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2,
			       trash_retention_days = $3,
			       purge_after = NOW() + ($3::int * INTERVAL '1 day'),
			       original_project_id = NULL,
			       original_parent_folder_id = NULL,
			       updated_at = NOW()
			   WHERE id = $1 AND is_deleted = FALSE`,
			resourceID, actor, retentionDays)
		if err != nil || ct.RowsAffected() == 0 {
			return ct.RowsAffected(), err
		}
		if err := UpsertProjectSearchIndexTx(ctx, tx, resourceID, ResourceSearchEventTrashed); err != nil {
			return 0, err
		}
		if emitAudit {
			if err := r.EmitResourceTrashedTx(ctx, tx, kind, resourceID, actor.String(), retentionDays, auditCtx); err != nil {
				return 0, err
			}
		}
		return ct.RowsAffected(), nil
	case ResourceOntologyFolder:
		ct, err := tx.Exec(ctx,
			`UPDATE ontology_project_folders
			   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2,
			       trash_retention_days = $3,
			       purge_after = NOW() + ($3::int * INTERVAL '1 day'),
			       original_project_id = project_id,
			       original_parent_folder_id = parent_folder_id,
			       updated_at = NOW()
			   WHERE id = $1 AND is_deleted = FALSE`,
			resourceID, actor, retentionDays)
		if err != nil || ct.RowsAffected() == 0 {
			return ct.RowsAffected(), err
		}
		if err := UpsertFolderSearchIndexTx(ctx, tx, resourceID, ResourceSearchEventTrashed); err != nil {
			return 0, err
		}
		if emitAudit {
			if err := r.EmitResourceTrashedTx(ctx, tx, kind, resourceID, actor.String(), retentionDays, auditCtx); err != nil {
				return 0, err
			}
		}
		return ct.RowsAffected(), nil
	case ResourceOntologyResourceBinding:
		ct, err := tx.Exec(ctx,
			`UPDATE ontology_project_resources
			   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2,
			       trash_retention_days = $3,
			       purge_after = NOW() + ($3::int * INTERVAL '1 day'),
			       original_project_id = project_id,
			       original_parent_folder_id = NULL
			   WHERE resource_id = $1 AND is_deleted = FALSE`,
			resourceID, actor, retentionDays)
		if err != nil || ct.RowsAffected() == 0 {
			return ct.RowsAffected(), err
		}
		if emitAudit {
			if err := r.EmitResourceTrashedTx(ctx, tx, kind, resourceID, actor.String(), retentionDays, auditCtx); err != nil {
				return 0, err
			}
		}
		return ct.RowsAffected(), nil
	}
	// Unsupported kinds are filtered before reaching here in BatchApply.
	return 0, nil
}

func trashRetentionDaysFromRequest(r *http.Request) (int, error) {
	days, err := normalizeTrashRetentionDays(nil)
	if err != nil {
		return 0, err
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("retention_days")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			return 0, fmt.Errorf("retention_days must be an integer")
		}
		days, err = normalizeTrashRetentionDays(&n)
		if err != nil {
			return 0, err
		}
	}
	if r.Body == nil || r.Body == http.NoBody || r.ContentLength == 0 {
		return days, nil
	}
	var body struct {
		RetentionDays *int `json:"retention_days,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		if errors.Is(err, io.EOF) {
			return days, nil
		}
		return 0, fmt.Errorf("invalid trash body")
	}
	if body.RetentionDays == nil {
		return days, nil
	}
	return normalizeTrashRetentionDays(body.RetentionDays)
}

func normalizeTrashRetentionDays(value *int) (int, error) {
	days := DefaultTrashRetentionDays
	if value != nil {
		days = *value
	}
	if days < 1 || days > 3650 {
		return 0, fmt.Errorf("retention_days must be between 1 and 3650")
	}
	return days, nil
}

// ensureOwnerOrAdmin authorises a single resource_ops action.
//
// Returns (0, "") when the caller may proceed. Otherwise returns the
// HTTP status + JSON error message the handler should write back. The
// status taxonomy mirrors the Rust impl exactly:
//
//   - 400 for unsupported kinds (forwarded by the caller as `bad`).
//   - 403 when the caller is neither admin nor the project owner.
//   - 404 when the resource does not exist.
//   - 500 on database errors.
func (r *Repo) ensureOwnerOrAdmin(ctx context.Context, claims *authmw.Claims, kind ResourceKind, resourceID uuid.UUID) (int, string) {
	if claims.HasRole("admin") {
		return 0, ""
	}
	var (
		owner uuid.UUID
		err   error
	)
	switch kind {
	case ResourceOntologyProject:
		err = r.Pool.QueryRow(ctx,
			`SELECT owner_id FROM ontology_projects WHERE id = $1`,
			resourceID).Scan(&owner)
	case ResourceOntologyFolder:
		err = r.Pool.QueryRow(ctx,
			`SELECT p.owner_id
			   FROM ontology_project_folders f
			   JOIN ontology_projects p ON p.id = f.project_id
			   WHERE f.id = $1`,
			resourceID).Scan(&owner)
	case ResourceOntologyResourceBinding:
		err = r.Pool.QueryRow(ctx,
			`SELECT p.owner_id
			   FROM ontology_project_resources r
			   JOIN ontology_projects p ON p.id = r.project_id
			   WHERE r.resource_id = $1`,
			resourceID).Scan(&owner)
	default:
		return http.StatusBadRequest,
			fmt.Sprintf("operation not supported for resource_kind '%s'", kind)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return http.StatusNotFound, "resource not found"
	}
	if err != nil {
		slog.Error("load resource owner", slog.String("error", err.Error()))
		return http.StatusInternalServerError,
			fmt.Sprintf("failed to load resource owner: %s", err)
	}
	if owner == claims.Sub {
		return 0, ""
	}
	return http.StatusForbidden,
		"only the project owner or an admin may perform this action"
}
