// Package handlers serves the AuditService surface over HTTP. The
// underlying contract matches proto/audit/v1/audit.proto; the JSON
// shapes are protobuf-compatible (snake_case, occurred_at as RFC3339).
package handlers

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/envelope"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/repo"
)

// MaxPageSize caps QueryEvents.page_size server-side. Mirrors the
// limit baked into the AuditService proto contract.
const MaxPageSize = 1000

// DefaultPageSize is used when the request omits page_size.
const DefaultPageSize = 100

// Recorder is the write path used by RecordEvent. The production
// wiring uses libs/audit-trail.Publisher; tests inject an inline
// recorder that writes straight to the repo (skipping Kafka).
type Recorder interface {
	Record(ctx interface{ Done() <-chan struct{} }, raw []byte) error
}

// Handlers is the audit-sink HTTP handler set.
type Handlers struct {
	Repo *repo.Repo
	// DirectInsert, when true, bypasses Kafka and writes RecordEvent
	// straight to the repo. Used by tests and by callers that have no
	// Kafka principal.
	DirectInsert bool
}

// AuditEventJSON is the JSON shape returned by Query/Export. Field
// names match the AuditService proto (snake_case).
type AuditEventJSON struct {
	EventID         string          `json:"event_id"`
	OccurredAt      time.Time       `json:"occurred_at"`
	Kind            string          `json:"kind"`
	Categories      []string        `json:"categories"`
	ActorID         string          `json:"actor_id"`
	ResourceRID     string          `json:"resource_rid"`
	ProjectRID      string          `json:"project_rid"`
	Action          string          `json:"action"`
	MarkingsAtEvent []string        `json:"markings_at_event"`
	SourceService   string          `json:"source_service"`
	RequestID       string          `json:"request_id,omitempty"`
	CorrelationID   string          `json:"correlation_id,omitempty"`
	IP              string          `json:"ip,omitempty"`
	UserAgent       string          `json:"user_agent,omitempty"`
	Payload         json.RawMessage `json:"payload"`
}

func rowToJSON(r repo.AuditEventRow) AuditEventJSON {
	cats := r.Categories
	if cats == nil {
		cats = []string{}
	}
	marks := r.MarkingsAtEvent
	if marks == nil {
		marks = []string{}
	}
	payload := r.Payload
	if len(payload) == 0 {
		payload = json.RawMessage("null")
	}
	return AuditEventJSON{
		EventID:         r.EventID.String(),
		OccurredAt:      r.OccurredAt.UTC(),
		Kind:            r.Kind,
		Categories:      cats,
		ActorID:         r.ActorID,
		ResourceRID:     r.ResourceRID,
		ProjectRID:      r.ProjectRID,
		Action:          r.Action,
		MarkingsAtEvent: marks,
		SourceService:   r.SourceService,
		RequestID:       r.RequestID,
		CorrelationID:   r.CorrelationID,
		IP:              r.IP,
		UserAgent:       r.UserAgent,
		Payload:         payload,
	}
}

// QueryEventsResponse mirrors proto QueryEventsResponse.
type QueryEventsResponse struct {
	Events     []AuditEventJSON `json:"events"`
	NextCursor string           `json:"next_cursor,omitempty"`
}

// QueryEvents is GET /api/v1/audit/events.
//
// Filters are AND-combined. Empty filter returns the most-recent rows.
// Pagination uses the opaque `cursor` query param emitted in
// `next_cursor`.
func (h *Handlers) QueryEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repo.QueryFilter{
		ActorID:     q.Get("actor_id"),
		ResourceRID: q.Get("resource_rid"),
		Action:      q.Get("action"),
	}
	if from, ok, err := parseTime(q.Get("from")); err != nil {
		writeError(w, http.StatusBadRequest, "invalid from: "+err.Error())
		return
	} else if ok {
		filter.From = &from
	}
	if to, ok, err := parseTime(q.Get("to")); err != nil {
		writeError(w, http.StatusBadRequest, "invalid to: "+err.Error())
		return
	} else if ok {
		filter.To = &to
	}
	size := DefaultPageSize
	if raw := q.Get("page_size"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			writeError(w, http.StatusBadRequest, "page_size must be a positive integer")
			return
		}
		size = n
	}
	if size > MaxPageSize {
		size = MaxPageSize
	}
	var after *repo.Cursor
	if raw := q.Get("cursor"); raw != "" {
		c, err := decodeCursor(raw)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid cursor")
			return
		}
		after = &c
	}

	rows, next, err := h.Repo.Query(r.Context(), filter, size, after)
	if err != nil {
		slog.Error("query audit events", slog.String("error", err.Error()))
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	out := QueryEventsResponse{Events: make([]AuditEventJSON, 0, len(rows))}
	for i := range rows {
		out.Events = append(out.Events, rowToJSON(rows[i]))
	}
	if next != nil {
		out.NextCursor = encodeCursor(*next)
	}
	writeJSON(w, http.StatusOK, out)
}

// ExportEvents is GET /api/v1/audit/events/export — streams NDJSON.
func (h *Handlers) ExportEvents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repo.QueryFilter{
		ActorID:     q.Get("actor_id"),
		ResourceRID: q.Get("resource_rid"),
		Action:      q.Get("action"),
	}
	if from, ok, err := parseTime(q.Get("from")); err != nil {
		writeError(w, http.StatusBadRequest, "invalid from: "+err.Error())
		return
	} else if ok {
		filter.From = &from
	}
	if to, ok, err := parseTime(q.Get("to")); err != nil {
		writeError(w, http.StatusBadRequest, "invalid to: "+err.Error())
		return
	} else if ok {
		filter.To = &to
	}

	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)

	enc := json.NewEncoder(w)
	err := h.Repo.Stream(r.Context(), filter, func(row repo.AuditEventRow) error {
		if err := enc.Encode(rowToJSON(row)); err != nil {
			return err
		}
		if flusher != nil {
			flusher.Flush()
		}
		return nil
	})
	if err != nil {
		slog.Error("export audit events", slog.String("error", err.Error()))
	}
}

// RecordEventRequest is the JSON body accepted by RecordEvent. Either
// `event` (structured) or `envelope` (raw libs/audit-trail bytes) must
// be set.
type RecordEventRequest struct {
	Envelope json.RawMessage `json:"envelope,omitempty"`
}

// RecordEventResponse mirrors proto RecordEventResponse.
type RecordEventResponse struct {
	EventID string `json:"event_id"`
}

// RecordEvent is POST /api/v1/audit/events. Synchronously persists one
// envelope. Production callers should publish via libs/audit-trail to
// audit.events.v1 instead; this endpoint is the write-through escape
// hatch for low-volume system callers and tests.
//
// Always direct-inserts: the audit-sink owns the table and there is no
// value in round-tripping through Kafka when the caller has already
// reached the sink.
func (h *Handlers) RecordEvent(w http.ResponseWriter, r *http.Request) {
	var body RecordEventRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: "+err.Error())
		return
	}
	if len(body.Envelope) == 0 {
		writeError(w, http.StatusBadRequest, "envelope is required")
		return
	}
	env, err := envelope.Decode(body.Envelope)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid envelope: "+err.Error())
		return
	}
	if err := h.Repo.Insert(r.Context(), env); err != nil {
		slog.Error("record audit event", slog.String("error", err.Error()))
		writeError(w, http.StatusInternalServerError, "record failed")
		return
	}
	writeJSON(w, http.StatusOK, RecordEventResponse{EventID: env.EventID.String()})
}

// ─── helpers ───────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func parseTime(raw string) (time.Time, bool, error) {
	if raw == "" {
		return time.Time{}, false, nil
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err == nil {
		return t.UTC(), true, nil
	}
	t, err = time.Parse(time.RFC3339, raw)
	if err == nil {
		return t.UTC(), true, nil
	}
	return time.Time{}, false, errors.New("expected RFC3339 timestamp")
}

func encodeCursor(c repo.Cursor) string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeCursor(s string) (repo.Cursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return repo.Cursor{}, fmt.Errorf("decode cursor: %w", err)
	}
	var c repo.Cursor
	if err := json.Unmarshal(b, &c); err != nil {
		return repo.Cursor{}, fmt.Errorf("unmarshal cursor: %w", err)
	}
	if c.EventID == uuid.Nil || c.OccurredAt.IsZero() {
		return repo.Cursor{}, errors.New("cursor missing fields")
	}
	return c, nil
}
