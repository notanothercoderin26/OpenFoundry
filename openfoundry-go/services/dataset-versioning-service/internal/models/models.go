// Package models holds wire types for dataset-versioning-service.
package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ListResponse is the canonical envelope used by the legacy dataset surface.
type ListResponse[T any] struct {
	Items []T `json:"items"`
}

// Page is the Rust-compatible paginated envelope for dataset version lists.
type Page[T any] struct {
	Data       []T     `json:"data"`
	NextCursor *string `json:"next_cursor,omitempty"`
	HasMore    bool    `json:"has_more"`
}

// Dataset mirrors the `datasets` row.
type Dataset struct {
	ID             uuid.UUID `json:"id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Format         string    `json:"format"`
	StoragePath    string    `json:"storage_path"`
	SizeBytes      int64     `json:"size_bytes"`
	RowCount       int64     `json:"row_count"`
	OwnerID        uuid.UUID `json:"owner_id"`
	Tags           []string  `json:"tags"`
	CurrentVersion int32     `json:"current_version"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// CreateDatasetRequest is the body of POST /api/v1/datasets.
type CreateDatasetRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Format      *string  `json:"format,omitempty"`
	StoragePath string   `json:"storage_path"`
	Tags        []string `json:"tags,omitempty"`
}

// UpdateDatasetRequest mirrors PATCH semantics.
type UpdateDatasetRequest struct {
	Description *string  `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	SizeBytes   *int64   `json:"size_bytes,omitempty"`
	RowCount    *int64   `json:"row_count,omitempty"`
}

// DatasetVersion mirrors the Rust DatasetVersion model.
type DatasetVersion struct {
	ID            uuid.UUID  `json:"id"`
	DatasetID     uuid.UUID  `json:"dataset_id"`
	Version       int32      `json:"version"`
	Message       string     `json:"message"`
	SizeBytes     int64      `json:"size_bytes"`
	RowCount      int64      `json:"row_count"`
	StoragePath   string     `json:"storage_path"`
	TransactionID *uuid.UUID `json:"transaction_id"`
	CreatedAt     time.Time  `json:"created_at"`
}

// CreateDatasetVersionRequest is the body of POST /api/v1/datasets/{id}/versions.
type CreateDatasetVersionRequest struct {
	Version       *int32     `json:"version,omitempty"`
	Message       string     `json:"message,omitempty"`
	SizeBytes     int64      `json:"size_bytes,omitempty"`
	RowCount      int64      `json:"row_count,omitempty"`
	StoragePath   string     `json:"storage_path"`
	TransactionID *uuid.UUID `json:"transaction_id,omitempty"`
}

// DatasetBranch mirrors the Rust DatasetBranch wire model.
type DatasetBranch struct {
	ID                       uuid.UUID       `json:"id"`
	RID                      string          `json:"rid"`
	DatasetID                uuid.UUID       `json:"dataset_id"`
	DatasetRID               string          `json:"dataset_rid"`
	Name                     string          `json:"name"`
	ParentBranchID           *uuid.UUID      `json:"parent_branch_id"`
	HeadTransactionID        *uuid.UUID      `json:"head_transaction_id"`
	CreatedFromTransactionID *uuid.UUID      `json:"created_from_transaction_id"`
	LastActivityAt           time.Time       `json:"last_activity_at"`
	Labels                   json.RawMessage `json:"labels"`
	FallbackChain            []string        `json:"fallback_chain"`
	Version                  int32           `json:"version"`
	BaseVersion              int32           `json:"base_version"`
	Description              string          `json:"description"`
	IsDefault                bool            `json:"is_default"`
	CreatedAt                time.Time       `json:"created_at"`
	UpdatedAt                time.Time       `json:"updated_at"`
}

// CreateDatasetBranchRequest mirrors Rust CreateDatasetBranchRequest.
type CreateDatasetBranchRequest struct {
	Name          string `json:"name"`
	SourceVersion *int32 `json:"source_version,omitempty"`
	Description   string `json:"description,omitempty"`
}
