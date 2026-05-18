-- SG.36 — Retention policy management parity.
--
-- Extends the older P4 retention rows with the Retention application model:
-- policy types, space scope, structured dataset/transaction selectors, and
-- explicit acknowledgement for dangerous latest-view/open-transaction flags.

ALTER TABLE retention_policies
    ADD COLUMN IF NOT EXISTS policy_type TEXT NOT NULL DEFAULT 'custom',
    ADD COLUMN IF NOT EXISTS space_id UUID NULL,
    ADD COLUMN IF NOT EXISTS legacy_deprecation_status TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS legacy_config_yaml TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS dataset_selectors JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS transaction_selectors JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS allow_latest_view_deletion BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS abort_open_transactions BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS danger_acknowledgement TEXT NOT NULL DEFAULT '';

UPDATE retention_policies
   SET policy_type = 'recommended'
 WHERE is_system = TRUE
   AND policy_type = 'custom';

UPDATE retention_policies
   SET legacy_deprecation_status = 'deprecated'
 WHERE policy_type = 'legacy'
   AND legacy_deprecation_status = '';

CREATE INDEX IF NOT EXISTS idx_retention_policies_space_type
    ON retention_policies (org_id, space_id, policy_type)
    WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retention_policies_type_active
    ON retention_policies (policy_type, active);
