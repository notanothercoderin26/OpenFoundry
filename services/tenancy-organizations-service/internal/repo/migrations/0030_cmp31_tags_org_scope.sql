-- residency: us-east-1
-- 0030: CMP.31 - Org-scoped compass tags.
--
-- The original tags table (CMP.26) was instance-global. Adding a nullable
-- organization_id lets tenants own their own tag catalogues without losing
-- the existing global tags (NULL stays "shared"). The uniqueness constraint
-- moves from (name) to (organization_id, name) so different orgs can
-- independently define a "PII" tag.

ALTER TABLE compass_tags
    ADD COLUMN IF NOT EXISTS organization_id UUID NULL;

ALTER TABLE compass_tags
    DROP CONSTRAINT IF EXISTS compass_tags_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS compass_tags_org_name_uniq
    ON compass_tags (COALESCE(organization_id::text, ''), name);
