-- residency: us-east-1
-- 0025: CMP.26 - Compass resource tags.
--
-- compass_tags is the catalog of tag definitions (name + color + creator).
-- compass_resource_tags is the N:M attachment between any (resource_kind,
-- resource_id) and a tag. Tag deletes cascade to attachments so callers do
-- not see dangling links. We index by resource and by tag separately to
-- support both "show tags on this resource" and "list resources with this
-- tag" queries.

CREATE TABLE IF NOT EXISTS compass_tags (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#5f6b7a',
    created_by  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS compass_resource_tags (
    resource_kind TEXT NOT NULL,
    resource_id   UUID NOT NULL,
    tag_id        UUID NOT NULL REFERENCES compass_tags(id) ON DELETE CASCADE,
    tagged_by     UUID NOT NULL,
    tagged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (resource_kind, resource_id, tag_id)
);

CREATE INDEX IF NOT EXISTS compass_resource_tags_resource_idx
    ON compass_resource_tags (resource_kind, resource_id);

CREATE INDEX IF NOT EXISTS compass_resource_tags_tag_idx
    ON compass_resource_tags (tag_id);
