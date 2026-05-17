-- 0013: CMP.5 — Compass Folder resource metadata.
--
-- Promotes ontology_project_folders from project-local layout rows to
-- Compass-discoverable Folder resources. The stable RID is derived from the
-- existing UUID locator and is intentionally immutable across move/rename.
--
-- Columns:
--   rid — stable folder RID (`ri.compass.main.folder.<uuid>`).
--
-- Access inheritance remains modeled by project memberships/default role plus
-- ontology_project_resource_grants for project/folder overrides; this migration
-- only adds the resource identity needed by filesystem/catalog callers.

ALTER TABLE ontology_project_folders
    ADD COLUMN IF NOT EXISTS rid TEXT;

UPDATE ontology_project_folders
   SET rid = 'ri.compass.main.folder.' || id::text
 WHERE rid IS NULL OR BTRIM(rid) = '';

ALTER TABLE ontology_project_folders
    ALTER COLUMN rid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ontology_project_folders_rid_unique
    ON ontology_project_folders (rid);

CREATE INDEX IF NOT EXISTS ontology_project_folders_project_parent_idx
    ON ontology_project_folders (project_id, parent_folder_id, created_at ASC)
    WHERE is_deleted = FALSE;
