// Package repo persists AuditEnvelope records to Postgres and serves
// the query surface backing AuditService.QueryEvents/ExportEvents.
//
// The Iceberg writer remains the durable analytic tier; this table is
// the hot, queryable replica used by the HTTP API.
package repo

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/envelope"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate applies every embedded migration in lexicographic order.
// Idempotent — each file uses IF NOT EXISTS guards.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := pool.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}
	return nil
}

// Repo is the Postgres-backed audit_events repository.
type Repo struct{ Pool *pgxpool.Pool }

// AuditEventRow is the in-memory shape returned by Query/Get/etc.
// Mirrors the audit_events table column-for-column.
type AuditEventRow struct {
	EventID         uuid.UUID
	OccurredAt      time.Time
	Kind            string
	Categories      []string
	ActorID         string
	ResourceRID     string
	ProjectRID      string
	Action          string
	MarkingsAtEvent []string
	SourceService   string
	RequestID       string
	CorrelationID   string
	IP              string
	UserAgent       string
	Payload         json.RawMessage
	Envelope        json.RawMessage
	CreatedAt       time.Time
}

// Insert appends a single envelope. ON CONFLICT DO NOTHING absorbs
// replays from the at-least-once Kafka consumer.
func (r *Repo) Insert(ctx context.Context, env envelope.AuditEnvelope) error {
	_, err := r.InsertBatch(ctx, []envelope.AuditEnvelope{env})
	return err
}

// InsertBatch appends N envelopes in a single transaction. Returns the
// number of newly-inserted rows (duplicates are silently absorbed by
// ON CONFLICT DO NOTHING).
func (r *Repo) InsertBatch(ctx context.Context, batch []envelope.AuditEnvelope) (int, error) {
	if len(batch) == 0 {
		return 0, nil
	}
	inserted := 0
	err := pgx.BeginFunc(ctx, r.Pool, func(tx pgx.Tx) error {
		for i := range batch {
			env := batch[i]
			row, err := decodeForRow(env)
			if err != nil {
				return fmt.Errorf("decode envelope[%d]: %w", i, err)
			}
			tag, err := tx.Exec(ctx, insertSQL,
				row.EventID,
				row.OccurredAt,
				row.Kind,
				row.Categories,
				row.ActorID,
				row.ResourceRID,
				row.ProjectRID,
				row.Action,
				row.MarkingsAtEvent,
				row.SourceService,
				row.RequestID,
				row.CorrelationID,
				row.IP,
				row.UserAgent,
				[]byte(row.Payload),
				[]byte(row.Envelope),
			)
			if err != nil {
				return fmt.Errorf("insert event %s: %w", row.EventID, err)
			}
			inserted += int(tag.RowsAffected())
		}
		return nil
	})
	return inserted, err
}

const insertSQL = `
INSERT INTO audit_events (
    event_id, occurred_at, kind, categories,
    actor_id, resource_rid, project_rid, action, markings_at_event,
    source_service, request_id, correlation_id, ip, user_agent,
    payload, envelope
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8, $9,
    $10, $11, $12, $13, $14,
    $15, $16
)
ON CONFLICT (event_id) DO NOTHING
`

// QueryFilter is the AND-combined filter accepted by Query.
type QueryFilter struct {
	ActorID     string
	ResourceRID string
	Action      string
	From        *time.Time
	To          *time.Time
}

// Cursor is the opaque continuation token used to page Query results.
// Lexicographically sortable by (occurred_at, event_id) so the same
// cursor is stable across re-issuance.
type Cursor struct {
	OccurredAt time.Time `json:"o"`
	EventID    uuid.UUID `json:"e"`
}

// Query returns up to `limit` rows matching `f`, ordered by
// (occurred_at DESC, event_id DESC). `nextCursor` is non-nil when more
// rows are available.
func (r *Repo) Query(ctx context.Context, f QueryFilter, limit int, after *Cursor) ([]AuditEventRow, *Cursor, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}

	clauses := make([]string, 0, 6)
	args := make([]any, 0, 8)
	idx := 1
	add := func(clause string, val any) {
		clauses = append(clauses, fmt.Sprintf(clause, idx))
		args = append(args, val)
		idx++
	}
	if f.ActorID != "" {
		add("actor_id = $%d", f.ActorID)
	}
	if f.ResourceRID != "" {
		add("resource_rid = $%d", f.ResourceRID)
	}
	if f.Action != "" {
		add("action = $%d", f.Action)
	}
	if f.From != nil {
		add("occurred_at >= $%d", *f.From)
	}
	if f.To != nil {
		add("occurred_at < $%d", *f.To)
	}
	if after != nil {
		clauses = append(clauses, fmt.Sprintf("(occurred_at, event_id) < ($%d, $%d)", idx, idx+1))
		args = append(args, after.OccurredAt, after.EventID)
		idx += 2
	}

	sql := selectSQL
	if len(clauses) > 0 {
		sql += " WHERE " + strings.Join(clauses, " AND ")
	}
	sql += fmt.Sprintf(" ORDER BY occurred_at DESC, event_id DESC LIMIT $%d", idx)
	args = append(args, limit+1)

	rows, err := r.Pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	out := make([]AuditEventRow, 0, limit)
	for rows.Next() {
		row, err := scanRow(rows)
		if err != nil {
			return nil, nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	var next *Cursor
	if len(out) > limit {
		// Drop the extra row used as a "has-more" sentinel and emit
		// the cursor pointing past the last returned row.
		last := out[limit-1]
		out = out[:limit]
		next = &Cursor{OccurredAt: last.OccurredAt, EventID: last.EventID}
	}
	return out, next, nil
}

// Stream issues the same query as Query but yields rows through `fn`
// without buffering — used by ExportEvents to stream NDJSON.
func (r *Repo) Stream(ctx context.Context, f QueryFilter, fn func(AuditEventRow) error) error {
	clauses := make([]string, 0, 5)
	args := make([]any, 0, 6)
	idx := 1
	add := func(clause string, val any) {
		clauses = append(clauses, fmt.Sprintf(clause, idx))
		args = append(args, val)
		idx++
	}
	if f.ActorID != "" {
		add("actor_id = $%d", f.ActorID)
	}
	if f.ResourceRID != "" {
		add("resource_rid = $%d", f.ResourceRID)
	}
	if f.Action != "" {
		add("action = $%d", f.Action)
	}
	if f.From != nil {
		add("occurred_at >= $%d", *f.From)
	}
	if f.To != nil {
		add("occurred_at < $%d", *f.To)
	}

	sql := selectSQL
	if len(clauses) > 0 {
		sql += " WHERE " + strings.Join(clauses, " AND ")
	}
	sql += " ORDER BY occurred_at ASC, event_id ASC"

	rows, err := r.Pool.Query(ctx, sql, args...)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		row, err := scanRow(rows)
		if err != nil {
			return err
		}
		if err := fn(row); err != nil {
			return err
		}
	}
	return rows.Err()
}

const selectSQL = `
SELECT event_id, occurred_at, kind, categories,
    actor_id, resource_rid, project_rid, action, markings_at_event,
    source_service, request_id, correlation_id, ip, user_agent,
    payload, envelope, created_at
FROM audit_events`

func scanRow(rows pgx.Rows) (AuditEventRow, error) {
	var r AuditEventRow
	var payload, env []byte
	err := rows.Scan(
		&r.EventID, &r.OccurredAt, &r.Kind, &r.Categories,
		&r.ActorID, &r.ResourceRID, &r.ProjectRID, &r.Action, &r.MarkingsAtEvent,
		&r.SourceService, &r.RequestID, &r.CorrelationID, &r.IP, &r.UserAgent,
		&payload, &env, &r.CreatedAt,
	)
	if err != nil {
		return AuditEventRow{}, err
	}
	r.Payload = json.RawMessage(payload)
	r.Envelope = json.RawMessage(env)
	return r, nil
}

// decodeForRow extracts the fields we materialise into typed columns
// out of the JSON envelope. Missing optional fields default to "".
//
// Prefers env.Raw — the original bytes captured by envelope.Decode —
// since the typed audit-sink envelope intentionally only carries the
// fields the Iceberg writer needs and would otherwise drop the rich
// fields populated by libs/audit-trail (actor_id, ip, …).
func decodeForRow(env envelope.AuditEnvelope) (AuditEventRow, error) {
	var meta envelopeMeta
	if err := json.Unmarshal(env.Payload, &meta); err != nil {
		// Payload is allowed to be non-object (rare); fall through with
		// blank action/markings rather than rejecting the record.
		meta = envelopeMeta{}
	}

	envBytes := env.Raw
	if len(envBytes) == 0 {
		marshalled, err := json.Marshal(env)
		if err != nil {
			return AuditEventRow{}, fmt.Errorf("re-encode envelope: %w", err)
		}
		envBytes = marshalled
	}

	var fullEnv fullEnvelopeView
	if err := json.Unmarshal(envBytes, &fullEnv); err != nil {
		return AuditEventRow{}, fmt.Errorf("decode envelope view: %w", err)
	}

	if fullEnv.EventID == uuid.Nil {
		return AuditEventRow{}, errors.New("envelope missing event_id")
	}

	occurredAt := fullEnv.OccurredAt
	if occurredAt.IsZero() && env.At > 0 {
		occurredAt = time.UnixMicro(env.At).UTC()
	}

	categories := fullEnv.Categories
	if categories == nil {
		categories = []string{}
	}
	markings := fullEnv.MarkingsAtEvent
	if markings == nil {
		markings = []string{}
	}

	payload := env.Payload
	if len(payload) == 0 {
		payload = json.RawMessage("null")
	}

	row := AuditEventRow{
		EventID:         fullEnv.EventID,
		OccurredAt:      occurredAt,
		Kind:            env.Kind,
		Categories:      categories,
		ActorID:         fullEnv.ActorID,
		ResourceRID:     fullEnv.ResourceRID,
		ProjectRID:      fullEnv.ProjectRID,
		Action:          meta.resolveAction(env.Kind),
		MarkingsAtEvent: markings,
		SourceService:   fullEnv.SourceService,
		RequestID:       fullEnv.RequestID,
		CorrelationID:   fullEnv.CorrelationID,
		IP:              fullEnv.IP,
		UserAgent:       fullEnv.UserAgent,
		Payload:         payload,
		Envelope:        envBytes,
	}
	return row, nil
}

// envelopeMeta carries the subset of payload fields we materialise into
// indexed columns. The discriminator `kind` is duplicated at the
// envelope level; we use the payload value when present (preserves
// custom emitter semantics) and fall back to the envelope kind.
type envelopeMeta struct {
	Kind       string `json:"kind"`
	ActionName string `json:"action"`
}

// resolveAction picks the action label: payload.action → payload.kind →
// envelope.kind. Callers index on the result, so empty strings are an
// acceptable degenerate value.
func (m envelopeMeta) resolveAction(envKind string) string {
	if m.ActionName != "" {
		return m.ActionName
	}
	if m.Kind != "" {
		return m.Kind
	}
	return envKind
}

type fullEnvelopeView struct {
	EventID         uuid.UUID `json:"event_id"`
	OccurredAt      time.Time `json:"occurred_at"`
	Categories      []string  `json:"categories"`
	ResourceRID     string    `json:"resource_rid"`
	ProjectRID      string    `json:"project_rid"`
	MarkingsAtEvent []string  `json:"markings_at_event"`
	ActorID         string    `json:"actor_id"`
	IP              string    `json:"ip"`
	UserAgent       string    `json:"user_agent"`
	RequestID       string    `json:"request_id"`
	CorrelationID   string    `json:"correlation_id"`
	SourceService   string    `json:"source_service"`
}
