-- AI Operator modes — thread-level mode binding (task 1.2).
--
-- Extends `threads` (20260520150000_threads.sql) with the per-thread
-- operator mode introduced in proto/ai/v1/agent_modes.proto. A thread
-- carries exactly one active mode at a time; the `change_mode` agent
-- skill (task 2.x) swaps it mid-session by updating these columns
-- inside the same tx that records the trace step.
--
-- Columns:
--   mode               String name of the AgentMode enum (e.g.
--                      'DATA_INTEGRATION'). The CHECK constraint
--                      enumerates the 9 modes from AI FDE; adding a
--                      new mode is a coordinated proto + SQL change.
--                      Default is PLATFORM_QA so pre-existing threads
--                      retain a safe, read-only baseline.
--   mode_config        Serialised proto ModeConfig (the JSONB form of
--                      the oneof + documentation_bundle_id). Modes
--                      without configurable knobs (DATA_CONNECTION,
--                      EXPLORATION, GOVERNANCE, PLATFORM_QA) keep
--                      this empty.
--   active_mode_tools  JSON array of tool kinds (subset of the
--                      execution_mode vocabulary in
--                      libs/ai-kernel-go/models/tool.go) that the
--                      agent may invoke under the active mode. Empty
--                      array means "allow all tools registered for
--                      this agent" — the mode_context registry
--                      defaults the allowlist when this column is
--                      empty.
--
-- Migrations apply on every service boot (see repo/migrations.go),
-- so every statement is idempotent.

ALTER TABLE threads
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'PLATFORM_QA';

ALTER TABLE threads
    ADD COLUMN IF NOT EXISTS mode_config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE threads
    ADD COLUMN IF NOT EXISTS active_mode_tools JSONB NOT NULL DEFAULT '[]'::jsonb;

-- CHECK constraint enumerating valid AgentMode values. Dropped before
-- re-adding so a future mode addition only needs to update this block.
ALTER TABLE threads
    DROP CONSTRAINT IF EXISTS threads_mode_check;
ALTER TABLE threads
    ADD CONSTRAINT threads_mode_check CHECK (mode IN (
        'DATA_INTEGRATION',
        'DATA_CONNECTION',
        'ONTOLOGY_EDITING',
        'FUNCTIONS_EDITING',
        'EXPLORATION',
        'GOVERNANCE',
        'MACHINE_LEARNING',
        'OSDK_REACT',
        'PLATFORM_QA'
    ));

-- Filter recent threads by mode for the "sessions by mode" UI dropdown.
CREATE INDEX IF NOT EXISTS idx_threads_user_mode_updated
    ON threads(user_id, mode, updated_at DESC);
