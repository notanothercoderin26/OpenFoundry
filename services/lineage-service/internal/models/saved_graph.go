package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// SavedGraph mirrors a row in `lineage_saved_graphs`. The opaque
// `Payload` field carries the React snapshot blob the frontend
// computes (graph state, camera, selected node ids, etc.) — the DB
// is intentionally schema-agnostic about that body so future
// frontend snapshot revisions don't require migrations.
type SavedGraph struct {
	ID            uuid.UUID       `json:"id"`
	OwnerID       uuid.UUID       `json:"owner_id"`
	Name          string          `json:"name"`
	Branch        string          `json:"branch"`
	ColoringMode  string          `json:"coloring_mode"`
	Payload       json.RawMessage `json:"payload"`
	ShareToken    *string         `json:"share_token,omitempty"`
	ShareReadOnly bool            `json:"share_read_only"`
	SharedAt      *time.Time      `json:"shared_at,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// CreateSavedGraphRequest is the POST body for /saved-graphs. The
// `Payload` field is treated as opaque JSON; everything else is
// validated server-side (name non-empty, branch present, …).
type CreateSavedGraphRequest struct {
	Name         string          `json:"name"`
	Branch       string          `json:"branch"`
	ColoringMode string          `json:"coloring_mode"`
	Payload      json.RawMessage `json:"payload"`
}

// UpdateSavedGraphRequest is the PUT body. Each field is optional so
// the frontend can patch e.g. just the name without re-uploading the
// whole graph blob.
type UpdateSavedGraphRequest struct {
	Name         *string          `json:"name,omitempty"`
	Branch       *string          `json:"branch,omitempty"`
	ColoringMode *string          `json:"coloring_mode,omitempty"`
	Payload      *json.RawMessage `json:"payload,omitempty"`
}

// ShareTokenResponse is the 201 body returned by `POST /share`. It
// carries the freshly-minted token plus a hint URL the frontend can
// directly hand to clipboard helpers.
type ShareTokenResponse struct {
	Token    string    `json:"token"`
	ReadOnly bool      `json:"read_only"`
	SharedAt time.Time `json:"shared_at"`
}

// SharedGraphResponse is the body of the unauthenticated read-only
// endpoint. It omits owner_id so we don't leak account IDs to anyone
// holding a share link.
type SharedGraphResponse struct {
	ID           uuid.UUID       `json:"id"`
	Name         string          `json:"name"`
	Branch       string          `json:"branch"`
	ColoringMode string          `json:"coloring_mode"`
	Payload      json.RawMessage `json:"payload"`
	ReadOnly     bool            `json:"read_only"`
	SharedAt     time.Time       `json:"shared_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}
