package models

import (
	"encoding/json"

	"github.com/google/uuid"
)

// BatchSaveRequest is the wire payload for POST /api/v1/ontology/batch-save.
//
// It carries the working-state of the Ontology-Manager Review-edits modal:
// every mutation the user staged on their working copy, together with
// the version of each resource the client believed it was editing.
//
// Semantics are atomic-or-nothing. If any edit fails validation or hits
// a version conflict, the entire batch is rolled back and the response
// carries per-edit error/conflict details so the modal can render them
// in its Warnings / Errors / Conflicts tabs.
type BatchSaveRequest struct {
	// Note is an optional free-form description shown in the audit log
	// when the History tab consolidates this batch into a single entry.
	Note string `json:"note,omitempty"`

	// Source identifies the producer of the batch (defaults to
	// "ontology-manager"). Other producers — for example Marketplace
	// installers — set their own value so the History view can label
	// their entries differently.
	Source string `json:"source,omitempty"`

	// Edits is the ordered list of mutations to apply. The server
	// applies them in this order inside a single transaction; later
	// edits in the batch may reference resources created by earlier
	// edits via the synthetic IDs they returned.
	Edits []BatchEdit `json:"edits"`
}

// BatchEditOp values.
const (
	BatchOpCreate = "create"
	BatchOpUpdate = "update"
	BatchOpDelete = "delete"
)

// BatchEditResource values.
const (
	BatchResourceObjectType         = "object_type"
	BatchResourceProperty           = "property"
	BatchResourceLinkType           = "link_type"
	BatchResourceObjectTypeGroup    = "object_type_group"
	BatchResourceSharedPropertyType = "shared_property_type"
)

// BatchEditStatus values.
const (
	BatchStatusOK       = "ok"
	BatchStatusConflict = "conflict"
	BatchStatusError    = "error"
	// BatchStatusSkipped marks edits that did not apply because a
	// sibling edit in the same atomic batch failed. The UI uses this to
	// keep the unsaved-changes badge accurate without re-rendering the
	// edit card as "saved".
	BatchStatusSkipped = "skipped"
)

// BatchEdit is one mutation inside a BatchSaveRequest.
type BatchEdit struct {
	// ClientID is a caller-assigned correlation token (typically a
	// uuid string generated in the working-state store) so the UI can
	// match results back to its in-memory edit cards even across
	// retries. Required.
	ClientID string `json:"client_id"`

	// Op is one of create | update | delete.
	Op string `json:"op"`

	// Resource picks which table this edit targets: object_type,
	// property, link_type, or object_type_group.
	Resource string `json:"resource"`

	// ID is the target row's primary key. Required for update/delete.
	// Optional on create (the server generates a fresh uuid when nil).
	ID *uuid.UUID `json:"id,omitempty"`

	// ExpectedVersion is the version the client read for this resource
	// before editing it. Required for update/delete. The server
	// compares it against the current row version and rejects the
	// batch with a conflict result when they disagree.
	ExpectedVersion *int `json:"expected_version,omitempty"`

	// Body is the resource-specific payload. Its shape matches the
	// existing single-resource endpoint payloads:
	//   - object_type create  → CreateObjectTypeRequest
	//   - object_type update  → UpdateObjectTypeRequest
	//   - link_type create    → CreateLinkTypeRequest
	//   - link_type update    → UpdateLinkTypeRequest
	//   - object_type_group   → Create/UpdateObjectTypeGroupRequest
	//   - property create     → CreatePropertyRequest
	//   - property update     → UpdatePropertyRequest (added in batch flow)
	// Empty for deletes.
	Body json.RawMessage `json:"body,omitempty"`

	// ConfirmedWarnings carries the codes of destructive warnings the
	// user explicitly confirmed in the Review-edits modal (e.g.
	// "discouraged_primary_key_type"). Without confirmation the batch
	// is rejected as if the warning were an error.
	ConfirmedWarnings []string `json:"confirmed_warnings,omitempty"`
}

// BatchSaveResponse is the result of POST /api/v1/ontology/batch-save.
type BatchSaveResponse struct {
	// BatchID groups all edits in this save together in the audit log.
	BatchID uuid.UUID `json:"batch_id"`

	// Status is "ok" if every edit applied successfully, otherwise
	// "failed". When failed, the transaction was rolled back and no
	// row in the database changed.
	Status string `json:"status"`

	// Results carries one entry per edit, in the same order the client
	// sent them. The UI matches them up by ClientID.
	Results []BatchEditResult `json:"results"`
}

// BatchEditResult reports the outcome of a single BatchEdit.
type BatchEditResult struct {
	ClientID string `json:"client_id"`
	Resource string `json:"resource"`
	Op       string `json:"op"`
	Status   string `json:"status"`

	// ResourceID is the row's primary key after the operation. For
	// creates it is the server-assigned uuid; for update/delete it
	// echoes the request ID.
	ResourceID *uuid.UUID `json:"resource_id,omitempty"`

	// NewVersion is the row's version after a successful create/update.
	// Nil for deletes.
	NewVersion *int `json:"new_version,omitempty"`

	// After is the resource's state after the operation, for the UI to
	// hydrate its caches without re-fetching. Nil for deletes.
	After json.RawMessage `json:"after,omitempty"`

	// CurrentVersion / CurrentBody are populated when Status ==
	// "conflict": the row's current version and serialized state so the
	// modal can offer the "Use latest / Keep my changes" choice.
	CurrentVersion *int            `json:"current_version,omitempty"`
	CurrentBody    json.RawMessage `json:"current_body,omitempty"`

	// Errors / Warnings carry validation issues. Both are non-nil only
	// when the batch failed validation.
	Errors   []ValidationIssue `json:"errors,omitempty"`
	Warnings []ValidationIssue `json:"warnings,omitempty"`
}

// ValidationIssue is the shared shape that powers the Errors and
// Warnings tabs of the Review-edits modal and the inline error/warning
// banners on individual edit cards.
type ValidationIssue struct {
	// Code is a stable machine-readable identifier (e.g.
	// "base_type_incompatible", "discouraged_primary_key_type") so the
	// UI can branch on it for confirmation flows.
	Code string `json:"code"`

	// Field is the JSON-pointer-ish path inside the resource body the
	// issue attaches to ("properties[seat_number].property_type",
	// "title_property", …). Empty when the issue is resource-level.
	Field string `json:"field,omitempty"`

	// Message is the human-readable text rendered next to the field.
	Message string `json:"message"`

	// Severity is "error" or "warning". Errors block save; warnings
	// surface in the Warnings tab but only block save when they carry
	// RequiresConfirmation and the client hasn't acknowledged them
	// (see BatchEdit.ConfirmedWarnings).
	Severity string `json:"severity"`

	// RequiresConfirmation, when non-nil, asks the user to type the
	// supplied string back into the modal to acknowledge a destructive
	// change ("388" for the "388 edits will be undone" pattern in the
	// Foundry docs). The UI hides the Save button until the user types
	// the exact value.
	RequiresConfirmation *string `json:"requires_confirmation,omitempty"`

	// Detail is an open-ended bag for code-specific context the UI may
	// render (e.g. affected-app list, lost-edit count).
	Detail map[string]any `json:"detail,omitempty"`
}

// ValidationResult bundles errors and warnings for a single
// resource-level validation pass, used by the per-resource validators
// in the repo / handler layer.
type ValidationResult struct {
	Errors   []ValidationIssue
	Warnings []ValidationIssue
}

// HasErrors reports whether the result blocks the save.
func (v ValidationResult) HasErrors() bool { return len(v.Errors) > 0 }

// AddError appends a fatal validation issue.
func (v *ValidationResult) AddError(code, field, message string) {
	v.Errors = append(v.Errors, ValidationIssue{
		Code:     code,
		Field:    field,
		Message:  message,
		Severity: "error",
	})
}

// AddWarning appends a non-fatal validation issue.
func (v *ValidationResult) AddWarning(code, field, message string) {
	v.Warnings = append(v.Warnings, ValidationIssue{
		Code:     code,
		Field:    field,
		Message:  message,
		Severity: "warning",
	})
}

// AuditDiffEntry is one row of the JSONB field_diffs array stored in
// ontology_audit_log. The History view renders these directly as the
// strikethrough/green diff lines shown next to "Property display name",
// "Title property", etc.
type AuditDiffEntry struct {
	Path   string          `json:"path"`
	Before json.RawMessage `json:"before,omitempty"`
	After  json.RawMessage `json:"after,omitempty"`
}
