-- Human-in-the-loop gate for agent-proposed Actions. When an agent
-- attempts to invoke an Action tool flagged as `requires_human_approval`,
-- the tool router stages a proposal in this table instead of dispatching
-- to ontology-actions-service. A separate human reviewer applies or
-- dismisses the proposal via the /action-proposals/{id}/approve|dismiss
-- endpoints; only on approval does the action actually execute, under
-- the approver's JWT.
--
-- Foundry parity (palantir.com/docs/foundry/logic/aip-logic-integration-automate):
--   "When you configure your automation to stage Actions for approval,
--    you can see an overview of Agent proposals that require review by
--    navigating to the Proposals tab. When you accept a proposal, the
--    Action will be automatically executed, and the proposal card will
--    be moved to the Applied column."

CREATE TABLE IF NOT EXISTS agent_action_proposals (
    id UUID PRIMARY KEY,
    -- Source of the proposal. agent_run_id is nullable because Logic
    -- function invocations stage proposals too (no agent run involved).
    agent_run_id UUID,
    logic_run_id UUID,
    initiating_user_id UUID NOT NULL,
    -- The action being proposed. action_type_id is opaque here — the
    -- approver dispatches to ontology-actions-service which validates it.
    action_type_id TEXT NOT NULL,
    -- Arguments the agent proposed to apply. Validated by
    -- ontology-actions-service on approve, not here.
    arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Free-text justification the agent or initiating user supplied.
    justification TEXT,
    -- pending | approved | dismissed
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by UUID,
    decision_note TEXT,
    -- Set when approval triggered a successful action execution.
    applied_action_id TEXT,
    -- Captured downstream response so the UI can show what happened
    -- without re-querying ontology-actions.
    applied_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ,
    CONSTRAINT agent_action_proposals_status_check
        CHECK (status IN ('pending', 'approved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS agent_action_proposals_status_idx
    ON agent_action_proposals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_action_proposals_initiator_idx
    ON agent_action_proposals (initiating_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_action_proposals_run_idx
    ON agent_action_proposals (agent_run_id)
    WHERE agent_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_action_proposals_logic_run_idx
    ON agent_action_proposals (logic_run_id)
    WHERE logic_run_id IS NOT NULL;
