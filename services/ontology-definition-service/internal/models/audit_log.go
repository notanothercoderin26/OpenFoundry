package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AuditLogFilter scopes a ListAuditLog query. All fields are
// optional; zero values mean "no filter". Used by the History view
// to narrow to a single resource, a single batch, or a single
// author.
type AuditLogFilter struct {
	ResourceKind string
	ResourceID   *uuid.UUID
	BatchID      *uuid.UUID
	ChangedBy    *uuid.UUID
	Limit        int
	Offset       int
}

// AuditLogEntry is the read shape returned by GET /audit-log and by
// the per-resource History tab. Each row corresponds to one resource-
// level mutation; rows that share a `batch_id` belong to the same
// "edit session" the Review-edits modal flushed.
type AuditLogEntry struct {
	ID              uuid.UUID         `json:"id"`
	BatchID         *uuid.UUID        `json:"batch_id,omitempty"`
	ResourceKind    string            `json:"resource_kind"`
	ResourceID      uuid.UUID         `json:"resource_id"`
	Operation       string            `json:"operation"`
	ChangedBy       uuid.UUID         `json:"changed_by"`
	ChangedAt       time.Time         `json:"changed_at"`
	ExpectedVersion *int              `json:"expected_version,omitempty"`
	NewVersion      int               `json:"new_version"`
	BeforeState     json.RawMessage   `json:"before_state,omitempty"`
	AfterState      json.RawMessage   `json:"after_state,omitempty"`
	FieldDiffs      []AuditDiffEntry  `json:"field_diffs"`
	Source          string            `json:"source"`
	Note            string            `json:"note,omitempty"`
}

// AuditLogPage is the envelope the HTTP layer returns. Mirrors the
// `data + total + limit + offset` shape used elsewhere in the
// service for list endpoints.
type AuditLogPage struct {
	Data   []AuditLogEntry `json:"data"`
	Limit  int             `json:"limit"`
	Offset int             `json:"offset"`
}
