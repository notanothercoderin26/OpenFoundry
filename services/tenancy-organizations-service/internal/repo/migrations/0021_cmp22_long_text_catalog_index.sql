-- residency: us-east-1
-- 0021: CMP.22 - Long-text catalog index.
--
-- Extends the Compass resource search projection with long-text bodies and
-- source metadata so Quicksearch/Data Catalog results can match descriptions,
-- README content, ontology object/property descriptions, code repository
-- READMEs, and dashboard descriptions without polling owning resource tables.

ALTER TABLE compass_resource_search_index
    ADD COLUMN IF NOT EXISTS long_text TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS long_text_sources JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE compass_resource_search_index
   SET long_text = summary,
       long_text_sources = CASE
           WHEN COALESCE(summary, '') = '' THEN '[]'::jsonb
           WHEN resource_type = 'project' THEN jsonb_build_array(jsonb_build_object(
               'kind', 'resource_description',
               'label', 'Project description'
           ))
           WHEN resource_type = 'folder' THEN jsonb_build_array(jsonb_build_object(
               'kind', 'resource_description',
               'label', 'Folder description'
           ))
           ELSE jsonb_build_array(jsonb_build_object(
               'kind', 'resource_description',
               'label', 'Resource description'
           ))
       END,
       indexed_at = NOW()
 WHERE COALESCE(long_text, '') = ''
   AND COALESCE(summary, '') <> '';

DROP INDEX IF EXISTS compass_resource_search_vector_gin;

ALTER TABLE compass_resource_search_index
    DROP COLUMN IF EXISTS search_vector;

ALTER TABLE compass_resource_search_index
    ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', COALESCE(display_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(summary, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(long_text, '')), 'C') ||
        setweight(to_tsvector('simple', COALESCE(resource_rid, '')), 'D') ||
        setweight(to_tsvector('simple', COALESCE(resource_type, '')), 'D')
    ) STORED;

CREATE INDEX IF NOT EXISTS compass_resource_search_vector_gin
    ON compass_resource_search_index USING GIN (search_vector);
