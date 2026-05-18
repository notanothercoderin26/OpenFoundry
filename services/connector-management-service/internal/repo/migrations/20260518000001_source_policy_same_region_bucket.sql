-- SG.34 network egress: allow workloads and source imports to attach the
-- same-region cloud bucket egress policies managed by network-boundary-service.
ALTER TABLE source_policy_bindings
    DROP CONSTRAINT IF EXISTS source_policy_bindings_kind_check;

ALTER TABLE source_policy_bindings
    ADD CONSTRAINT source_policy_bindings_kind_check
    CHECK (kind IN ('direct','agent_proxy','same_region_bucket'));
