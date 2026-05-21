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

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

// CompassTag is the wire shape of a tag definition.
type CompassTag struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedBy uuid.UUID `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// ResourceTagAttachment is one (resource, tag) link, used for both the
// "attach" response and the per-resource enumeration.
type ResourceTagAttachment struct {
	ResourceKind string    `json:"resource_kind"`
	ResourceID   uuid.UUID `json:"resource_id"`
	TagID        uuid.UUID `json:"tag_id"`
	TaggedBy     uuid.UUID `json:"tagged_by"`
	TaggedAt     time.Time `json:"tagged_at"`
}

// ListCompassTagsResponse is the envelope for GET /workspace/tags.
type ListCompassTagsResponse struct {
	Data []CompassTag `json:"data"`
}

// CreateCompassTagRequest is the body for POST /workspace/tags.
type CreateCompassTagRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// TagResourceRequest is the body for POST /workspace/resources/{kind}/{id}/tags.
type TagResourceRequest struct {
	TagID uuid.UUID `json:"tag_id"`
}

// ListResourceTagsResponse is the envelope for GET .../tags on a resource.
type ListResourceTagsResponse struct {
	Data []CompassTag `json:"data"`
}

// BulkResourceTagsRequest is the body for POST /workspace/tags:bulk
// — given a list of (kind, id) tuples, returns the tags attached to each.
type BulkResourceTagsRequest struct {
	Resources []BulkResourceTagsResource `json:"resources"`
}

// BulkResourceTagsResource identifies one resource in the batch request.
type BulkResourceTagsResource struct {
	ResourceKind string    `json:"resource_kind"`
	ResourceID   uuid.UUID `json:"resource_id"`
}

// BulkResourceTagsResponse is the response for the bulk lookup.
type BulkResourceTagsResponse struct {
	Data []ResourceTagsEntry `json:"data"`
}

// ResourceTagsEntry is one row of the bulk response — resource + its tags.
type ResourceTagsEntry struct {
	ResourceKind string       `json:"resource_kind"`
	ResourceID   uuid.UUID    `json:"resource_id"`
	Tags         []CompassTag `json:"tags"`
}

// ─── Repo ───────────────────────────────────────────────────────────

// ListCompassTags returns every tag in the catalog, ordered by name.
func (r *Repo) ListCompassTags(ctx context.Context) ([]CompassTag, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT id, name, color, created_by, created_at
		   FROM compass_tags
		  ORDER BY name ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]CompassTag, 0)
	for rows.Next() {
		var t CompassTag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// CreateCompassTag inserts a new tag. Returns ErrTagNameTaken if the
// (case-insensitive) name already exists.
func (r *Repo) CreateCompassTag(ctx context.Context, createdBy uuid.UUID, name, color string) (*CompassTag, error) {
	id := uuid.New()
	if color == "" {
		color = "#5f6b7a"
	}
	t := &CompassTag{ID: id, Name: name, Color: color, CreatedBy: createdBy}
	err := r.Pool.QueryRow(ctx,
		`INSERT INTO compass_tags (id, name, color, created_by)
		 VALUES ($1, $2, $3, $4)
		 RETURNING created_at`,
		id, name, color, createdBy,
	).Scan(&t.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "compass_tags_name_key") || strings.Contains(err.Error(), "duplicate key") {
			return nil, ErrTagNameTaken
		}
		return nil, err
	}
	return t, nil
}

// DeleteCompassTag removes a tag (and cascades attachments).
func (r *Repo) DeleteCompassTag(ctx context.Context, id uuid.UUID) (bool, error) {
	cmd, err := r.Pool.Exec(ctx, `DELETE FROM compass_tags WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return cmd.RowsAffected() > 0, nil
}

// TagResource attaches a tag to a (kind, id) target. Idempotent.
func (r *Repo) TagResource(ctx context.Context, kind ResourceKind, id uuid.UUID, tagID uuid.UUID, taggedBy uuid.UUID) (*ResourceTagAttachment, error) {
	att := &ResourceTagAttachment{
		ResourceKind: string(kind),
		ResourceID:   id,
		TagID:        tagID,
		TaggedBy:     taggedBy,
	}
	err := r.Pool.QueryRow(ctx,
		`INSERT INTO compass_resource_tags (resource_kind, resource_id, tag_id, tagged_by)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (resource_kind, resource_id, tag_id)
		 DO UPDATE SET tagged_by = EXCLUDED.tagged_by
		 RETURNING tagged_at`,
		string(kind), id, tagID, taggedBy,
	).Scan(&att.TaggedAt)
	if err != nil {
		if strings.Contains(err.Error(), "fk") || strings.Contains(err.Error(), "foreign key") {
			return nil, ErrTagNotFound
		}
		return nil, err
	}
	return att, nil
}

// UntagResource detaches a tag from a resource. Returns false if the
// attachment did not exist.
func (r *Repo) UntagResource(ctx context.Context, kind ResourceKind, id uuid.UUID, tagID uuid.UUID) (bool, error) {
	cmd, err := r.Pool.Exec(ctx,
		`DELETE FROM compass_resource_tags
		  WHERE resource_kind = $1 AND resource_id = $2 AND tag_id = $3`,
		string(kind), id, tagID,
	)
	if err != nil {
		return false, err
	}
	return cmd.RowsAffected() > 0, nil
}

// ListTagsForResource returns the tags attached to one resource.
func (r *Repo) ListTagsForResource(ctx context.Context, kind ResourceKind, id uuid.UUID) ([]CompassTag, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT t.id, t.name, t.color, t.created_by, t.created_at
		   FROM compass_tags t
		   JOIN compass_resource_tags rt ON rt.tag_id = t.id
		  WHERE rt.resource_kind = $1 AND rt.resource_id = $2
		  ORDER BY t.name ASC`,
		string(kind), id,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]CompassTag, 0)
	for rows.Next() {
		var t CompassTag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// BulkListTagsForResources returns tags grouped by (kind, id) for a batch.
func (r *Repo) BulkListTagsForResources(ctx context.Context, resources []BulkResourceTagsResource) ([]ResourceTagsEntry, error) {
	if len(resources) == 0 {
		return []ResourceTagsEntry{}, nil
	}
	kinds := make([]string, 0, len(resources))
	ids := make([]uuid.UUID, 0, len(resources))
	for _, res := range resources {
		kinds = append(kinds, res.ResourceKind)
		ids = append(ids, res.ResourceID)
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT rt.resource_kind, rt.resource_id, t.id, t.name, t.color, t.created_by, t.created_at
		   FROM compass_resource_tags rt
		   JOIN compass_tags t ON t.id = rt.tag_id
		  WHERE (rt.resource_kind, rt.resource_id) IN (
		      SELECT unnest($1::text[]), unnest($2::uuid[])
		  )
		  ORDER BY rt.resource_kind, rt.resource_id, t.name`,
		kinds, ids,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	index := make(map[string]*ResourceTagsEntry)
	for _, res := range resources {
		key := res.ResourceKind + ":" + res.ResourceID.String()
		index[key] = &ResourceTagsEntry{
			ResourceKind: res.ResourceKind,
			ResourceID:   res.ResourceID,
			Tags:         []CompassTag{},
		}
	}
	for rows.Next() {
		var kind string
		var resID uuid.UUID
		var tag CompassTag
		if err := rows.Scan(&kind, &resID, &tag.ID, &tag.Name, &tag.Color, &tag.CreatedBy, &tag.CreatedAt); err != nil {
			return nil, err
		}
		key := kind + ":" + resID.String()
		entry, ok := index[key]
		if !ok {
			continue
		}
		entry.Tags = append(entry.Tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]ResourceTagsEntry, 0, len(resources))
	for _, res := range resources {
		key := res.ResourceKind + ":" + res.ResourceID.String()
		if entry, ok := index[key]; ok {
			out = append(out, *entry)
		}
	}
	return out, nil
}

// ─── Errors ─────────────────────────────────────────────────────────

// ErrTagNameTaken signals a unique-constraint violation on `name`.
var ErrTagNameTaken = errors.New("tag name already taken")

// ErrTagNotFound signals an attach against a missing tag id.
var ErrTagNotFound = errors.New("tag not found")

// ─── HTTP handlers ──────────────────────────────────────────────────

func (h *Handlers) ListCompassTags(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	tags, err := h.Repo.ListCompassTags(r.Context())
	if err != nil {
		slog.Error("list compass tags", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list tags")
		return
	}
	writeJSON(w, http.StatusOK, ListCompassTagsResponse{Data: tags})
}

func (h *Handlers) CreateCompassTag(w http.ResponseWriter, r *http.Request) {
	c, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body CreateCompassTagRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSONErr(w, http.StatusBadRequest, "name required")
		return
	}
	tag, err := h.Repo.CreateCompassTag(r.Context(), c.Sub, name, strings.TrimSpace(body.Color))
	if err != nil {
		if errors.Is(err, ErrTagNameTaken) {
			writeJSONErr(w, http.StatusConflict, err.Error())
			return
		}
		slog.Error("create compass tag", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to create tag")
		return
	}
	writeJSON(w, http.StatusCreated, tag)
}

func (h *Handlers) DeleteCompassTag(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	ok, err := h.Repo.DeleteCompassTag(r.Context(), id)
	if err != nil {
		slog.Error("delete compass tag", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to delete tag")
		return
	}
	if !ok {
		writeJSONErr(w, http.StatusNotFound, "tag not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) ListResourceTags(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	kind, err := ParseResourceKind(chi.URLParam(r, "kind"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	tags, err := h.Repo.ListTagsForResource(r.Context(), kind, id)
	if err != nil {
		slog.Error("list resource tags", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list resource tags")
		return
	}
	writeJSON(w, http.StatusOK, ListResourceTagsResponse{Data: tags})
}

func (h *Handlers) TagResource(w http.ResponseWriter, r *http.Request) {
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
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body TagResourceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.TagID == uuid.Nil {
		writeJSONErr(w, http.StatusBadRequest, "tag_id required")
		return
	}
	att, err := h.Repo.TagResource(r.Context(), kind, id, body.TagID, c.Sub)
	if err != nil {
		if errors.Is(err, ErrTagNotFound) || errors.Is(err, pgx.ErrNoRows) {
			writeJSONErr(w, http.StatusNotFound, "tag not found")
			return
		}
		slog.Error("tag resource", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to tag resource")
		return
	}
	writeJSON(w, http.StatusCreated, att)
}

func (h *Handlers) UntagResource(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	kind, err := ParseResourceKind(chi.URLParam(r, "kind"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	tagID, err := uuid.Parse(chi.URLParam(r, "tag_id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid tag_id")
		return
	}
	ok, err := h.Repo.UntagResource(r.Context(), kind, id, tagID)
	if err != nil {
		slog.Error("untag resource", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to untag resource")
		return
	}
	if !ok {
		writeJSONErr(w, http.StatusNotFound, "tag attachment not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) BulkListResourceTags(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body BulkResourceTagsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	for _, entry := range body.Resources {
		if _, err := ParseResourceKind(entry.ResourceKind); err != nil {
			writeJSONErr(w, http.StatusBadRequest, err.Error())
			return
		}
		if entry.ResourceID == uuid.Nil {
			writeJSONErr(w, http.StatusBadRequest, "resource_id required")
			return
		}
	}
	out, err := h.Repo.BulkListTagsForResources(r.Context(), body.Resources)
	if err != nil {
		slog.Error("bulk list resource tags", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list resource tags")
		return
	}
	writeJSON(w, http.StatusOK, BulkResourceTagsResponse{Data: out})
}
