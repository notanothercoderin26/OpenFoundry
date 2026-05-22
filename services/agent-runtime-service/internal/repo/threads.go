// Threads repo for B07. Co-exists with the legacy ai_conversations
// path — every handler that wants the per-message granularity uses
// this; cache replay / hit stats stay on the JSONB blob.

package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// ErrThreadNotFound surfaces from GET / mutate operations when the
// thread id is missing. Handlers map to 404.
var ErrThreadNotFound = errors.New("thread not found")

// ThreadsRepo wraps the SQL surface for threads / thread_messages /
// thread_traces.
type ThreadsRepo struct{ Pool *pgxpool.Pool }

const threadCols = `id, user_id, title, agent_id, model_rid,
                    tool_manifest, max_tool_calls, max_prompt_tokens,
                    status, metadata, mode, mode_config,
                    active_mode_tools, created_at, updated_at`

const messageCols = `id, thread_id, position, role, content,
                     tool_name, tool_call_id, metadata, created_at`

const traceCols = `id, thread_id, message_id, step_index, kind,
                   tool_name, payload, prompt_tokens, completion_tokens,
                   latency_ms, created_at`

// ── Threads ─────────────────────────────────────────────────────────

func (r *ThreadsRepo) CreateThread(ctx context.Context, userID *uuid.UUID, body models.CreateThreadRequest) (*models.Thread, error) {
	title := body.Title
	if title == "" {
		title = "New conversation"
	}
	for _, t := range body.Tools {
		if !t.Kind.IsValid() {
			return nil, fmt.Errorf("unknown tool kind %q", t.Kind)
		}
	}
	manifest, err := json.Marshal(models.ToolManifest{Tools: body.Tools})
	if err != nil {
		return nil, fmt.Errorf("encode tool manifest: %w", err)
	}
	maxCalls := int32(6)
	if body.MaxToolCalls != nil && *body.MaxToolCalls > 0 {
		maxCalls = *body.MaxToolCalls
	}
	maxTokens := int32(16000)
	if body.MaxPromptTokens != nil && *body.MaxPromptTokens > 0 {
		maxTokens = *body.MaxPromptTokens
	}
	metadata := body.Metadata
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO threads
		    (id, user_id, title, agent_id, model_rid, tool_manifest,
		     max_tool_calls, max_prompt_tokens, status, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
		 RETURNING `+threadCols,
		uuid.New(), userID, title, body.AgentID, body.ModelRID, manifest,
		maxCalls, maxTokens, []byte(metadata),
	)
	return scanThread(row)
}

func (r *ThreadsRepo) ListThreads(ctx context.Context, userID *uuid.UUID, limit int) ([]models.Thread, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := "SELECT " + threadCols + " FROM threads"
	var args []any
	if userID != nil {
		q += " WHERE (user_id = $1 OR user_id IS NULL)"
		args = append(args, *userID)
	} else {
		q += " WHERE user_id IS NULL"
	}
	q += " ORDER BY updated_at DESC LIMIT " + intToStr(limit)
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.Thread, 0)
	for rows.Next() {
		t, err := scanThread(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

func (r *ThreadsRepo) GetThread(ctx context.Context, id uuid.UUID) (*models.Thread, error) {
	row := r.Pool.QueryRow(ctx,
		"SELECT "+threadCols+" FROM threads WHERE id = $1", id)
	t, err := scanThread(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrThreadNotFound
	}
	return t, err
}

func (r *ThreadsRepo) DeleteThread(ctx context.Context, id uuid.UUID) error {
	_, err := r.Pool.Exec(ctx, "DELETE FROM threads WHERE id = $1", id)
	return err
}

// SetThreadMode updates threads.mode + mode_config + active_mode_tools
// in a single UPDATE and returns the refreshed row. mode is the
// caller-validated AgentMode string (the CHECK constraint on the column
// is the final guard — handlers must call agents.ValidateAgentMode
// before reaching here).
//
// A nil modeConfig is stored as the empty JSON object (matching the
// column default); a nil activeModeTools is stored as the empty JSON
// array so callers can "clear" overrides explicitly.
func (r *ThreadsRepo) SetThreadMode(
	ctx context.Context,
	id uuid.UUID,
	mode string,
	modeConfig json.RawMessage,
	activeModeTools []string,
) (*models.Thread, error) {
	if len(modeConfig) == 0 {
		modeConfig = json.RawMessage(`{}`)
	}
	if activeModeTools == nil {
		activeModeTools = []string{}
	}
	toolsJSON, err := json.Marshal(activeModeTools)
	if err != nil {
		return nil, fmt.Errorf("encode active_mode_tools: %w", err)
	}
	row := r.Pool.QueryRow(ctx,
		`UPDATE threads
		    SET mode = $2,
		        mode_config = $3,
		        active_mode_tools = $4,
		        updated_at = now()
		  WHERE id = $1
		  RETURNING `+threadCols,
		id, mode, []byte(modeConfig), toolsJSON,
	)
	t, err := scanThread(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrThreadNotFound
	}
	return t, err
}

// touchThread bumps updated_at after a message is appended. Called
// inside the same tx as the append.
func touchThread(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	_, err := tx.Exec(ctx, "UPDATE threads SET updated_at = now() WHERE id = $1", id)
	return err
}

// ── Messages ────────────────────────────────────────────────────────

// AppendMessage persists a single turn under the next position
// (atomic via MAX(position) + 1 inside a tx).
func (r *ThreadsRepo) AppendMessage(ctx context.Context, threadID uuid.UUID, role models.ThreadMessageRole, content string, toolName, toolCallID *string, metadata json.RawMessage) (*models.ThreadMessage, error) {
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var next int32
	err = tx.QueryRow(ctx,
		`SELECT COALESCE(MAX(position), -1) + 1
		   FROM thread_messages WHERE thread_id = $1`,
		threadID,
	).Scan(&next)
	if err != nil {
		return nil, err
	}
	row := tx.QueryRow(ctx,
		`INSERT INTO thread_messages
		    (id, thread_id, position, role, content,
		     tool_name, tool_call_id, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING `+messageCols,
		uuid.New(), threadID, next, string(role), content,
		toolName, toolCallID, []byte(metadata),
	)
	m, err := scanMessage(row)
	if err != nil {
		return nil, err
	}
	if err := touchThread(ctx, tx, threadID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return m, nil
}

// ListMessages returns the message stream for a thread, in position
// order. Used by the UI on thread open.
func (r *ThreadsRepo) ListMessages(ctx context.Context, threadID uuid.UUID) ([]models.ThreadMessage, error) {
	rows, err := r.Pool.Query(ctx,
		"SELECT "+messageCols+" FROM thread_messages WHERE thread_id = $1 ORDER BY position",
		threadID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.ThreadMessage, 0)
	for rows.Next() {
		m, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

// ── Trace ───────────────────────────────────────────────────────────

func (r *ThreadsRepo) AppendTraceStep(ctx context.Context, threadID uuid.UUID, messageID *uuid.UUID, kind models.TraceStepKind, toolName *string, payload json.RawMessage, promptTokens, completionTokens, latencyMS int32) (*models.ThreadTraceStep, error) {
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	var next int32
	err := r.Pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(step_index), -1) + 1
		   FROM thread_traces WHERE thread_id = $1`,
		threadID,
	).Scan(&next)
	if err != nil {
		return nil, err
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO thread_traces
		    (id, thread_id, message_id, step_index, kind,
		     tool_name, payload, prompt_tokens, completion_tokens, latency_ms)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING `+traceCols,
		uuid.New(), threadID, messageID, next, string(kind),
		toolName, []byte(payload), promptTokens, completionTokens, latencyMS,
	)
	return scanTrace(row)
}

func (r *ThreadsRepo) ListTrace(ctx context.Context, threadID uuid.UUID) ([]models.ThreadTraceStep, error) {
	rows, err := r.Pool.Query(ctx,
		"SELECT "+traceCols+" FROM thread_traces WHERE thread_id = $1 ORDER BY step_index",
		threadID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.ThreadTraceStep, 0)
	for rows.Next() {
		s, err := scanTrace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *s)
	}
	return out, rows.Err()
}

// ── Scanners ────────────────────────────────────────────────────────

type rowScannerThreads interface {
	Scan(...any) error
}

func scanThread(row rowScannerThreads) (*models.Thread, error) {
	var (
		t               models.Thread
		userID          *uuid.UUID
		agentID         *uuid.UUID
		modelRID        *uuid.UUID
		manifest        []byte
		metadata        []byte
		modeConfig      []byte
		activeModeTools []byte
	)
	err := row.Scan(
		&t.ID, &userID, &t.Title, &agentID, &modelRID,
		&manifest, &t.MaxToolCalls, &t.MaxPromptTokens,
		&t.Status, &metadata, &t.Mode, &modeConfig,
		&activeModeTools, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	t.UserID = userID
	t.AgentID = agentID
	t.ModelRID = modelRID
	if len(manifest) > 0 {
		_ = json.Unmarshal(manifest, &t.ToolManifest)
	}
	if t.ToolManifest.Tools == nil {
		t.ToolManifest.Tools = []models.ToolDefinition{}
	}
	if len(metadata) > 0 {
		t.Metadata = json.RawMessage(metadata)
	}
	if len(modeConfig) > 0 {
		t.ModeConfig = json.RawMessage(modeConfig)
	}
	if len(activeModeTools) > 0 {
		_ = json.Unmarshal(activeModeTools, &t.ActiveModeTools)
	}
	if t.ActiveModeTools == nil {
		t.ActiveModeTools = []string{}
	}
	return &t, nil
}

func scanMessage(row rowScannerThreads) (*models.ThreadMessage, error) {
	var (
		m          models.ThreadMessage
		toolName   *string
		toolCallID *string
		metadata   []byte
	)
	err := row.Scan(
		&m.ID, &m.ThreadID, &m.Position, &m.Role, &m.Content,
		&toolName, &toolCallID, &metadata, &m.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	m.ToolName = toolName
	m.ToolCallID = toolCallID
	if len(metadata) > 0 {
		m.Metadata = json.RawMessage(metadata)
	}
	return &m, nil
}

func scanTrace(row rowScannerThreads) (*models.ThreadTraceStep, error) {
	var (
		s         models.ThreadTraceStep
		messageID *uuid.UUID
		toolName  *string
		payload   []byte
	)
	err := row.Scan(
		&s.ID, &s.ThreadID, &messageID, &s.StepIndex, &s.Kind,
		&toolName, &payload, &s.PromptTokens, &s.CompletionTokens,
		&s.LatencyMS, &s.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	s.MessageID = messageID
	s.ToolName = toolName
	if len(payload) > 0 {
		s.Payload = json.RawMessage(payload)
	}
	return &s, nil
}

// intToStr keeps the LIMIT clause out of the parameter array — a
// trivial helper that avoids `strconv` pollution for one call.
func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [10]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

var _ time.Time // ensure time is imported even if scanners stay pgx-typed
