package repo

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// auditWriter is a thin adapter over a Querier (pool or transaction)
// that knows how to append a row to ontology_audit_log. It is the
// single producer of audit entries; both the batch-save flow and any
// future single-resource paths funnel writes through here so the
// History view can render every change uniformly.
type auditWriter struct{ q Querier }

func newAuditWriter(q Querier) *auditWriter { return &auditWriter{q: q} }

// auditEntry captures one row of ontology_schema.ontology_audit_log.
// before_state / after_state are full serialized snapshots; field_diffs
// is the precomputed strikethrough/green pair list the History view
// renders directly.
type auditEntry struct {
	BatchID         *uuid.UUID
	ResourceKind    string
	ResourceID      uuid.UUID
	Operation       string
	ChangedBy       uuid.UUID
	ExpectedVersion *int
	NewVersion      int
	Before          any
	After           any
	FieldDiffs      []models.AuditDiffEntry
	Source          string
	Note            string
}

func (a *auditWriter) write(ctx context.Context, e auditEntry) error {
	if e.Source == "" {
		e.Source = "ontology-manager"
	}
	beforeBytes, err := marshalNullable(e.Before)
	if err != nil {
		return fmt.Errorf("audit: marshal before_state: %w", err)
	}
	afterBytes, err := marshalNullable(e.After)
	if err != nil {
		return fmt.Errorf("audit: marshal after_state: %w", err)
	}
	diffs := e.FieldDiffs
	if diffs == nil {
		diffs = []models.AuditDiffEntry{}
	}
	diffsBytes, err := json.Marshal(diffs)
	if err != nil {
		return fmt.Errorf("audit: marshal field_diffs: %w", err)
	}
	_, err = a.q.Exec(ctx, `
		INSERT INTO ontology_schema.ontology_audit_log
		    (id, batch_id, resource_kind, resource_id, operation,
		     changed_by, expected_version, new_version,
		     before_state, after_state, field_diffs, source, note)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULLIF($13, ''))`,
		uuid.New(), e.BatchID, e.ResourceKind, e.ResourceID, e.Operation,
		e.ChangedBy, e.ExpectedVersion, e.NewVersion,
		beforeBytes, afterBytes, diffsBytes, e.Source, e.Note)
	return err
}

func marshalNullable(v any) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	// Treat the JSON `null` literal as SQL NULL so the audit table
	// stores absence rather than a JSON-null sentinel.
	if string(b) == "null" {
		return nil, nil
	}
	return b, nil
}

// ── Read paths ─────────────────────────────────────────────────────────

// AuditLogFilter scopes a ListAuditLog query. All fields are optional;
// zero values mean "no filter".
type AuditLogFilter struct {
	ResourceKind string
	ResourceID   *uuid.UUID
	BatchID      *uuid.UUID
	ChangedBy    *uuid.UUID
	Limit        int
	Offset       int
}

// AuditLogEntry is the read shape exposed by ListAuditLog.
type AuditLogEntry struct {
	ID              uuid.UUID               `json:"id"`
	BatchID         *uuid.UUID              `json:"batch_id,omitempty"`
	ResourceKind    string                  `json:"resource_kind"`
	ResourceID      uuid.UUID               `json:"resource_id"`
	Operation       string                  `json:"operation"`
	ChangedBy       uuid.UUID               `json:"changed_by"`
	ChangedAt       time.Time               `json:"changed_at"`
	ExpectedVersion *int                    `json:"expected_version,omitempty"`
	NewVersion      int                     `json:"new_version"`
	BeforeState     json.RawMessage         `json:"before_state,omitempty"`
	AfterState      json.RawMessage         `json:"after_state,omitempty"`
	FieldDiffs      []models.AuditDiffEntry `json:"field_diffs"`
	Source          string                  `json:"source"`
	Note            string                  `json:"note,omitempty"`
}

// ListAuditLog returns audit-log entries ordered most-recent-first.
// Defaults: limit = 100, max 1000; offset = 0.
func (r *Repo) ListAuditLog(ctx context.Context, filter AuditLogFilter) ([]AuditLogEntry, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}
	var (
		args    []any
		clauses []string
	)
	if filter.ResourceKind != "" {
		args = append(args, filter.ResourceKind)
		clauses = append(clauses, fmt.Sprintf("resource_kind = $%d", len(args)))
	}
	if filter.ResourceID != nil {
		args = append(args, *filter.ResourceID)
		clauses = append(clauses, fmt.Sprintf("resource_id = $%d", len(args)))
	}
	if filter.BatchID != nil {
		args = append(args, *filter.BatchID)
		clauses = append(clauses, fmt.Sprintf("batch_id = $%d", len(args)))
	}
	if filter.ChangedBy != nil {
		args = append(args, *filter.ChangedBy)
		clauses = append(clauses, fmt.Sprintf("changed_by = $%d", len(args)))
	}
	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}
	args = append(args, limit, filter.Offset)
	q := `SELECT id, batch_id, resource_kind, resource_id, operation,
	             changed_by, changed_at, expected_version, new_version,
	             before_state, after_state, field_diffs, source, COALESCE(note, '')
	      FROM ontology_schema.ontology_audit_log` + where +
		fmt.Sprintf(" ORDER BY changed_at DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]AuditLogEntry, 0)
	for rows.Next() {
		var (
			entry      AuditLogEntry
			diffsBytes []byte
		)
		if err := rows.Scan(&entry.ID, &entry.BatchID, &entry.ResourceKind,
			&entry.ResourceID, &entry.Operation, &entry.ChangedBy,
			&entry.ChangedAt, &entry.ExpectedVersion, &entry.NewVersion,
			&entry.BeforeState, &entry.AfterState, &diffsBytes,
			&entry.Source, &entry.Note); err != nil {
			return nil, err
		}
		if len(diffsBytes) > 0 {
			if err := json.Unmarshal(diffsBytes, &entry.FieldDiffs); err != nil {
				return nil, fmt.Errorf("audit: unmarshal field_diffs: %w", err)
			}
		}
		if entry.FieldDiffs == nil {
			entry.FieldDiffs = []models.AuditDiffEntry{}
		}
		out = append(out, entry)
	}
	return out, rows.Err()
}
