-- B07 §AC#1 — Persisted Threads + per-message rows + ReAct trace.
--
-- The existing `ai_conversations` table packs every message into a
-- single JSONB blob — fine for cache-hit replay but unworkable for
-- the AC#1 ("UI lists prior conversations after refresh") and AC#2
-- ("ReAct trace visible") requirements. This migration adds a
-- proper relational shape:
--
--   threads          — one row per chat with metadata + budgets.
--   thread_messages  — one row per turn (system / user / assistant /
--                      tool) so the UI can stream incrementally.
--   thread_traces    — one row per ReAct step (plan / tool_call /
--                      observation / final) so the trace panel can
--                      reconstruct the agent's decision path.
--
-- Per-thread budgets default to 6 tool calls + 16k tokens (B07 §AC#3);
-- handlers override on /threads create.

CREATE TABLE IF NOT EXISTS threads (
    id                    UUID PRIMARY KEY,
    user_id               UUID,
    title                 TEXT NOT NULL,
    agent_id              UUID,
    -- Provider RID from llm-catalog-service. NULL = catalog default.
    model_rid             UUID,
    -- Tool registration captured at thread-creation time. JSONB
    -- {tools: [{name, kind, config}]}.
    tool_manifest         JSONB NOT NULL DEFAULT '{"tools":[]}'::jsonb,
    max_tool_calls        INTEGER NOT NULL DEFAULT 6,
    max_prompt_tokens     INTEGER NOT NULL DEFAULT 16000,
    status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','archived','closed')),
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threads_user_updated
    ON threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_status
    ON threads(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS thread_messages (
    id              UUID PRIMARY KEY,
    thread_id       UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    -- Position is monotonically increasing per thread. The handler
    -- looks up MAX(position) inside the same tx as the insert.
    position        INTEGER NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
    content         TEXT NOT NULL,
    -- tool_name + tool_call_id populated on tool / assistant rows.
    tool_name       TEXT,
    tool_call_id    TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(thread_id, position)
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread
    ON thread_messages(thread_id, position);

CREATE TABLE IF NOT EXISTS thread_traces (
    id              UUID PRIMARY KEY,
    thread_id       UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    message_id      UUID REFERENCES thread_messages(id) ON DELETE CASCADE,
    step_index      INTEGER NOT NULL,
    -- Kind: plan | tool_call | observation | final | error | budget_exhausted
    kind            TEXT NOT NULL CHECK (kind IN
                       ('plan','tool_call','observation','final','error','budget_exhausted')),
    tool_name       TEXT,
    -- Free-form payload: tool input, tool output, LLM thought,
    -- error message, ... Capped at 64 KB in handlers.
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    prompt_tokens   INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_traces_thread_step
    ON thread_traces(thread_id, step_index);
CREATE INDEX IF NOT EXISTS idx_thread_traces_message
    ON thread_traces(message_id);
