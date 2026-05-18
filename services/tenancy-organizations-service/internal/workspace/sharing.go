package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	audittrail "github.com/openfoundry/openfoundry-go/libs/audit-trail"
	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

// AccessLevel discriminates share grant strength.
type AccessLevel string

const (
	AccessViewer AccessLevel = "viewer"
	AccessEditor AccessLevel = "editor"
	AccessOwner  AccessLevel = "owner"
)

func (a AccessLevel) IsValid() bool {
	switch a {
	case AccessViewer, AccessEditor, AccessOwner:
		return true
	}
	return false
}

// ResourceShare mirrors the Rust struct.
//
// Exactly one of `shared_with_user_id` / `shared_with_group_id` is set
// (enforced by the table CHECK constraint resource_shares_principal).
type ResourceShare struct {
	ID                uuid.UUID    `json:"id"`
	ResourceKind      ResourceKind `json:"resource_kind"`
	ResourceID        uuid.UUID    `json:"resource_id"`
	SharedWithUserID  *uuid.UUID   `json:"shared_with_user_id"`
	SharedWithGroupID *uuid.UUID   `json:"shared_with_group_id"`
	SharerID          uuid.UUID    `json:"sharer_id"`
	AccessLevel       AccessLevel  `json:"access_level"`
	Note              string       `json:"note"`
	ExpiresAt         *time.Time   `json:"expires_at"`
	CreatedAt         time.Time    `json:"created_at"`
	UpdatedAt         time.Time    `json:"updated_at"`
}

// CreateShareRequest is the body of POST /workspace/resources/{kind}/{id}/share.
type CreateShareRequest struct {
	SharedWithUserID  *uuid.UUID  `json:"shared_with_user_id,omitempty"`
	SharedWithGroupID *uuid.UUID  `json:"shared_with_group_id,omitempty"`
	AccessLevel       AccessLevel `json:"access_level"`
	Note              *string     `json:"note,omitempty"`
	ExpiresAt         *time.Time  `json:"expires_at,omitempty"`
}

// ListSharesResponse is the {data: [...]} envelope (workspace surface).
type ListSharesResponse struct {
	Data []ResourceShare `json:"data"`
}

// ─── HTTP handlers ──────────────────────────────────────────────────

// CreateShare handles POST /api/v1/workspace/resources/{kind}/{id}/share.
//
// Phase 1: trusts the caller for resource-level ACL — upstream services
// own project/folder RBAC. Validates the principal split (exactly one
// of user/group must be set) and the access_level enum.
func (h *Handlers) CreateShare(w http.ResponseWriter, r *http.Request) {
	c, ok := authmw.FromContext(r.Context())
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
	var body CreateShareRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	userSet := body.SharedWithUserID != nil
	groupSet := body.SharedWithGroupID != nil
	if userSet == groupSet {
		writeJSONErr(w, http.StatusBadRequest,
			"exactly one of 'shared_with_user_id' or 'shared_with_group_id' must be provided")
		return
	}
	if !body.AccessLevel.IsValid() {
		writeJSONErr(w, http.StatusBadRequest, "invalid access_level")
		return
	}
	note := ""
	if body.Note != nil {
		note = *body.Note
	}

	share, status, err := h.Repo.UpsertShare(r.Context(), upsertShareArgs{
		ResourceKind:      kind,
		ResourceID:        resourceID,
		SharedWithUserID:  body.SharedWithUserID,
		SharedWithGroupID: body.SharedWithGroupID,
		SharerID:          c.Sub,
		AccessLevel:       body.AccessLevel,
		Note:              note,
		ExpiresAt:         body.ExpiresAt,
	}, AuditContextFromRequest(c, r), true)
	if err != nil {
		slog.Error("create share", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to create share")
		return
	}
	writeJSON(w, status, share)
}

// RevokeShare handles DELETE /api/v1/workspace/shares/{id}.
//
// Only the original sharer or an admin may revoke. The single SQL
// statement uses `($2 OR sharer_id = $3)` to avoid a load-then-check
// race (matches the Rust impl).
func (h *Handlers) RevokeShare(w http.ResponseWriter, r *http.Request) {
	c, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	shareID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid share id")
		return
	}
	deleted, err := h.Repo.RevokeShare(r.Context(), shareID, c.Sub, c.HasRole("admin"), AuditContextFromRequest(c, r))
	if err != nil {
		slog.Error("revoke share", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to revoke share")
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound,
			"share not found or not revocable by current user")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ListSharedWithMe handles GET /api/v1/workspace/shared-with-me?kind=…&limit=N.
//
// Filters out expired shares (expires_at <= now) at the SQL level.
func (h *Handlers) ListSharedWithMe(w http.ResponseWriter, r *http.Request) {
	c, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	limit := parseLimit(r, 200, 1, 1000)
	kind, ok := optionalKindFromQuery(w, r)
	if !ok {
		return
	}
	out, err := h.Repo.ListSharedWithUser(r.Context(), c.Sub, kind, limit)
	if err != nil {
		slog.Error("list shared-with-me", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list shared-with-me")
		return
	}
	writeJSON(w, http.StatusOK, ListSharesResponse{Data: out})
}

// ListSharedByMe handles GET /api/v1/workspace/shared-by-me?kind=…&limit=N.
func (h *Handlers) ListSharedByMe(w http.ResponseWriter, r *http.Request) {
	c, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	limit := parseLimit(r, 200, 1, 1000)
	kind, ok := optionalKindFromQuery(w, r)
	if !ok {
		return
	}
	out, err := h.Repo.ListSharedBySharer(r.Context(), c.Sub, kind, limit)
	if err != nil {
		slog.Error("list shared-by-me", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list shared-by-me")
		return
	}
	writeJSON(w, http.StatusOK, ListSharesResponse{Data: out})
}

// ListResourceShares handles GET /api/v1/workspace/resources/{kind}/{id}/shares.
//
// Used by the "Manage access" dialog to enumerate every share row
// attached to a single resource.
func (h *Handlers) ListResourceShares(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
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
	out, err := h.Repo.ListSharesForResource(r.Context(), kind, resourceID)
	if err != nil {
		slog.Error("list resource shares", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list resource shares")
		return
	}
	writeJSON(w, http.StatusOK, ListSharesResponse{Data: out})
}

func optionalKindFromQuery(w http.ResponseWriter, r *http.Request) (ResourceKind, bool) {
	raw := r.URL.Query().Get("kind")
	if raw == "" {
		return "", true
	}
	k, err := ParseResourceKind(raw)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return "", false
	}
	return k, true
}

// ─── Repo surface ───────────────────────────────────────────────────

type upsertShareArgs struct {
	ResourceKind      ResourceKind
	ResourceID        uuid.UUID
	SharedWithUserID  *uuid.UUID
	SharedWithGroupID *uuid.UUID
	SharerID          uuid.UUID
	AccessLevel       AccessLevel
	Note              string
	ExpiresAt         *time.Time
}

// UpsertShare creates or updates a share row.
//
// Postgres' ON CONFLICT clause only handles one unique index at a time,
// so the user-share path uses ON CONFLICT against idx_resource_shares_user
// and the group-share path uses a manual UPDATE-then-INSERT to mirror the
// Rust two-path logic. Returns 201 on insert, 200 on update.
func (r *Repo) UpsertShare(ctx context.Context, args upsertShareArgs, auditCtx audittrail.AuditContext, emitAudit bool) (*ResourceShare, int, error) {
	if (args.SharedWithUserID == nil) == (args.SharedWithGroupID == nil) {
		return nil, http.StatusBadRequest, errors.New("exactly one principal required")
	}
	if !args.AccessLevel.IsValid() {
		return nil, http.StatusBadRequest, errors.New("invalid access_level")
	}
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(context.Background())

	// User-share path: ON CONFLICT against the (resource_kind, resource_id,
	// shared_with_user_id) partial unique index. RETURNING xmax = 0 lets us
	// distinguish insert vs update so the handler can pick the right status.
	if args.SharedWithUserID != nil {
		row := tx.QueryRow(ctx,
			`INSERT INTO resource_shares
			    (resource_kind, resource_id, shared_with_user_id, shared_with_group_id,
			     sharer_id, access_level, note, expires_at)
			 VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)
			 ON CONFLICT (resource_kind, resource_id, shared_with_user_id)
			   WHERE shared_with_user_id IS NOT NULL
			   DO UPDATE SET access_level = EXCLUDED.access_level,
			                 note = EXCLUDED.note,
			                 expires_at = EXCLUDED.expires_at,
			                 sharer_id = EXCLUDED.sharer_id,
			                 updated_at = NOW()
			 RETURNING id, resource_kind, resource_id, shared_with_user_id,
			           shared_with_group_id, sharer_id, access_level, note,
			           expires_at, created_at, updated_at, (xmax = 0) AS inserted`,
			string(args.ResourceKind), args.ResourceID, args.SharedWithUserID,
			args.SharerID, string(args.AccessLevel), args.Note, args.ExpiresAt)
		share, inserted, err := scanShareWithFlag(row)
		if err != nil {
			return nil, 0, err
		}
		changeType := "updated"
		status := http.StatusOK
		if inserted {
			changeType = "granted"
			status = http.StatusCreated
		}
		if emitAudit {
			if err := r.EmitResourceShareChangedTx(ctx, tx, *share, changeType, auditCtx); err != nil {
				return nil, 0, err
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, 0, err
		}
		return share, status, nil
	}

	// Group-share path: same partial-index ON CONFLICT pattern as user shares.
	row := tx.QueryRow(ctx,
		`INSERT INTO resource_shares
		    (resource_kind, resource_id, shared_with_user_id, shared_with_group_id,
		     sharer_id, access_level, note, expires_at)
		 VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)
		 ON CONFLICT (resource_kind, resource_id, shared_with_group_id)
		   WHERE shared_with_group_id IS NOT NULL
		   DO UPDATE SET access_level = EXCLUDED.access_level,
		                 note = EXCLUDED.note,
		                 expires_at = EXCLUDED.expires_at,
		                 sharer_id = EXCLUDED.sharer_id,
		                 updated_at = NOW()
		 RETURNING id, resource_kind, resource_id, shared_with_user_id,
		           shared_with_group_id, sharer_id, access_level, note,
		           expires_at, created_at, updated_at, (xmax = 0) AS inserted`,
		string(args.ResourceKind), args.ResourceID, args.SharedWithGroupID,
		args.SharerID, string(args.AccessLevel), args.Note, args.ExpiresAt)
	share, inserted, err := scanShareWithFlag(row)
	if err != nil {
		return nil, 0, err
	}
	changeType := "updated"
	status := http.StatusOK
	if inserted {
		changeType = "granted"
		status = http.StatusCreated
	}
	if emitAudit {
		if err := r.EmitResourceShareChangedTx(ctx, tx, *share, changeType, auditCtx); err != nil {
			return nil, 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return share, status, nil
}

// RevokeShare deletes a share if the caller is the sharer or an admin.
// Returns true when a row was removed.
func (r *Repo) RevokeShare(ctx context.Context, shareID, callerID uuid.UUID, isAdmin bool, auditCtx audittrail.AuditContext) (bool, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(context.Background())
	row := tx.QueryRow(ctx,
		shareSelect+` WHERE id = $1 AND ($2 OR sharer_id = $3)`,
		shareID, isAdmin, callerID)
	share, err := scanShare(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	cmd, err := tx.Exec(ctx,
		`DELETE FROM resource_shares
		 WHERE id = $1 AND ($2 OR sharer_id = $3)`,
		shareID, isAdmin, callerID)
	if err != nil {
		return false, err
	}
	if cmd.RowsAffected() == 0 {
		return false, nil
	}
	if err := r.EmitResourceShareChangedTx(ctx, tx, *share, "revoked", auditCtx); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

// ListSharedWithUser returns active shares (expires_at NULL or future)
// targeting `userID`. Optional kind filter; pass empty kind to skip.
func (r *Repo) ListSharedWithUser(ctx context.Context, userID uuid.UUID, kind ResourceKind, limit int) ([]ResourceShare, error) {
	limit = clamp(limit, 1, 1000)
	if kind == "" {
		rows, err := r.Pool.Query(ctx,
			shareSelect+` WHERE shared_with_user_id = $1
			              AND (expires_at IS NULL OR expires_at > NOW())
			              ORDER BY created_at DESC LIMIT $2`,
			userID, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanShares(rows)
	}
	rows, err := r.Pool.Query(ctx,
		shareSelect+` WHERE shared_with_user_id = $1 AND resource_kind = $2
		              AND (expires_at IS NULL OR expires_at > NOW())
		              ORDER BY created_at DESC LIMIT $3`,
		userID, string(kind), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanShares(rows)
}

// ListSharedBySharer returns every share the user has issued, regardless
// of expiry (the "Shared by me" tab includes expired entries as a record).
func (r *Repo) ListSharedBySharer(ctx context.Context, sharerID uuid.UUID, kind ResourceKind, limit int) ([]ResourceShare, error) {
	limit = clamp(limit, 1, 1000)
	if kind == "" {
		rows, err := r.Pool.Query(ctx,
			shareSelect+` WHERE sharer_id = $1
			              ORDER BY created_at DESC LIMIT $2`,
			sharerID, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanShares(rows)
	}
	rows, err := r.Pool.Query(ctx,
		shareSelect+` WHERE sharer_id = $1 AND resource_kind = $2
		              ORDER BY created_at DESC LIMIT $3`,
		sharerID, string(kind), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanShares(rows)
}

// ListSharesForResource enumerates every share row on a single resource.
func (r *Repo) ListSharesForResource(ctx context.Context, kind ResourceKind, resourceID uuid.UUID) ([]ResourceShare, error) {
	rows, err := r.Pool.Query(ctx,
		shareSelect+` WHERE resource_kind = $1 AND resource_id = $2
		              ORDER BY created_at DESC`,
		string(kind), resourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanShares(rows)
}

const shareSelect = `SELECT id, resource_kind, resource_id, shared_with_user_id,
		shared_with_group_id, sharer_id, access_level, note,
		expires_at, created_at, updated_at
		FROM resource_shares`

func scanShareWithFlag(row interface{ Scan(...any) error }) (*ResourceShare, bool, error) {
	var (
		s        ResourceShare
		k        string
		access   string
		inserted bool
	)
	if err := row.Scan(&s.ID, &k, &s.ResourceID, &s.SharedWithUserID,
		&s.SharedWithGroupID, &s.SharerID, &access, &s.Note,
		&s.ExpiresAt, &s.CreatedAt, &s.UpdatedAt, &inserted); err != nil {
		return nil, false, err
	}
	s.ResourceKind = ResourceKind(k)
	s.AccessLevel = AccessLevel(access)
	return &s, inserted, nil
}

func scanShare(row interface{ Scan(...any) error }) (*ResourceShare, error) {
	var (
		s      ResourceShare
		k      string
		access string
	)
	if err := row.Scan(&s.ID, &k, &s.ResourceID, &s.SharedWithUserID,
		&s.SharedWithGroupID, &s.SharerID, &access, &s.Note,
		&s.ExpiresAt, &s.CreatedAt, &s.UpdatedAt); err != nil {
		return nil, err
	}
	s.ResourceKind = ResourceKind(k)
	s.AccessLevel = AccessLevel(access)
	return &s, nil
}

func scanShares(rows pgxRowsLike) ([]ResourceShare, error) {
	out := make([]ResourceShare, 0)
	for rows.Next() {
		var (
			s      ResourceShare
			k      string
			access string
		)
		if err := rows.Scan(&s.ID, &k, &s.ResourceID, &s.SharedWithUserID,
			&s.SharedWithGroupID, &s.SharerID, &access, &s.Note,
			&s.ExpiresAt, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		s.ResourceKind = ResourceKind(k)
		s.AccessLevel = AccessLevel(access)
		out = append(out, s)
	}
	return out, rows.Err()
}

func clamp(n, lo, hi int) int {
	if n < lo {
		return lo
	}
	if n > hi {
		return hi
	}
	return n
}

// ensure strings import is referenced (used by Trim helpers in handlers).
var _ = strings.TrimSpace
