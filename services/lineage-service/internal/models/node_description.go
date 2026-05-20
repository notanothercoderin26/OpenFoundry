package models

import (
	"time"

	"github.com/google/uuid"
)

// NodeDescription is the persisted body for a lineage node's
// "Add description" Properties helper. Authored by any authenticated
// caller; the most recent writer wins.
type NodeDescription struct {
	NodeID      uuid.UUID `json:"node_id"`
	Description string    `json:"description"`
	UpdatedBy   uuid.UUID `json:"updated_by"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UpsertNodeDescriptionRequest is the PUT body. An empty description
// is treated as a delete by the handler so the API mirrors Foundry's
// "clear" UX without a separate verb.
type UpsertNodeDescriptionRequest struct {
	Description string `json:"description"`
}
