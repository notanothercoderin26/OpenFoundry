-- residency: us-east-1
-- 0012: CMP.4 — Compass Project resource metadata.
--
-- Promotes ontology_projects from an ontology-only workspace grouping to a
-- Compass-discoverable Project resource. The stable RID is derived from the
-- existing UUID primary key so old rows keep their identity while new API
-- responses expose the canonical `rid` reference.
--
-- New columns:
--   rid                                  — stable project RID.
--   space_rid                            — parent Space RID.
--   organization_rids                    — organizations associated with the project.
--   marking_rids                         — required / inherited markings on the project boundary.
--   default_queue_rid                    — Resource Management queue assigned by default.
--   resource_level_role_grants_allowed   — whether direct grants below the project are allowed.
--   role_policies                        — explicit per-role action policies.

ALTER TABLE ontology_projects
    ADD COLUMN IF NOT EXISTS rid TEXT,
    ADD COLUMN IF NOT EXISTS space_rid TEXT,
    ADD COLUMN IF NOT EXISTS organization_rids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS marking_rids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS default_queue_rid TEXT NULL,
    ADD COLUMN IF NOT EXISTS resource_level_role_grants_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS role_policies JSONB NOT NULL DEFAULT '[
        {"role":"discoverer","actions":["discover"]},
        {"role":"viewer","actions":["discover","view","share"]},
        {"role":"editor","actions":["discover","view","create","edit","move","rename","share"]},
        {"role":"owner","actions":["discover","view","create","edit","move","rename","trash","restore","share","administer"]}
    ]'::jsonb;

UPDATE ontology_projects
   SET rid = 'ri.compass.main.project.' || id::text
 WHERE rid IS NULL OR BTRIM(rid) = '';

UPDATE ontology_projects
   SET space_rid = 'ri.compass.main.folder.default-space'
 WHERE space_rid IS NULL OR BTRIM(space_rid) = '';

UPDATE ontology_projects
   SET role_policies = '[
        {"role":"discoverer","actions":["discover"]},
        {"role":"viewer","actions":["discover","view","share"]},
        {"role":"editor","actions":["discover","view","create","edit","move","rename","share"]},
        {"role":"owner","actions":["discover","view","create","edit","move","rename","trash","restore","share","administer"]}
    ]'::jsonb
 WHERE role_policies IS NULL OR role_policies = '[]'::jsonb;

ALTER TABLE ontology_projects
    ALTER COLUMN rid SET NOT NULL,
    ALTER COLUMN space_rid SET NOT NULL,
    ALTER COLUMN space_rid SET DEFAULT 'ri.compass.main.folder.default-space';

CREATE UNIQUE INDEX IF NOT EXISTS ontology_projects_rid_unique
    ON ontology_projects (rid);

CREATE INDEX IF NOT EXISTS ontology_projects_space_rid_idx
    ON ontology_projects (space_rid);

CREATE INDEX IF NOT EXISTS ontology_projects_organization_rids_gin
    ON ontology_projects USING GIN (organization_rids jsonb_path_ops);

CREATE INDEX IF NOT EXISTS ontology_projects_marking_rids_gin
    ON ontology_projects USING GIN (marking_rids jsonb_path_ops);

CREATE INDEX IF NOT EXISTS ontology_projects_default_queue_rid_idx
    ON ontology_projects (default_queue_rid)
    WHERE default_queue_rid IS NOT NULL;
