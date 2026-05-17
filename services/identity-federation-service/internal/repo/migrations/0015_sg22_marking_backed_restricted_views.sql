-- residency: us-east-1
-- SG.22 marking-backed restricted views.
--
-- A restricted view can name one or more backing-dataset columns whose
-- cells contain STRING ARRAY values of marking/organization UUIDs. The
-- read plane treats every ID in those cells as a row-level requirement.

ALTER TABLE restricted_views
    ADD COLUMN IF NOT EXISTS marking_columns JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_restricted_views_marking_columns
    ON restricted_views USING GIN (marking_columns);
