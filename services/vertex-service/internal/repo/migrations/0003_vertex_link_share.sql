-- Link sharing slice for vertex-service.
--
-- A graph can opt-in to "anyone with the link" sharing. When enabled,
-- the owner publishes an opaque token (32 bytes of crypto/rand, base64url
-- encoded) and chooses the role conferred to token holders.
--
-- Token holders STILL need to be authenticated against the gateway —
-- this is not a public-internet sharing scheme. Per Palantir's docs:
-- the link grants graph-level access only; resources referenced from
-- the graph still apply their own permission checks. Concretely, the
-- traversal endpoint in ontology-query-service continues to enforce
-- markings and tenant scope independently of any link-share role.
--
-- Role precedence when both a grant and a link-share apply:
--   effective_role = max(grant_role, link_share_role)
--
-- Allowed link-share roles deliberately exclude `owner`: that would
-- effectively let any link holder transfer ownership, which is not
-- what users expect from a "Viewer" toggle.
SET search_path TO vertex, public;

ALTER TABLE graph
    ADD COLUMN IF NOT EXISTS link_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS link_share_token     TEXT,
    ADD COLUMN IF NOT EXISTS link_share_role      TEXT;

-- Constraint and uniqueness applied after the columns exist so the
-- migration is idempotent on re-application.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'graph_link_share_role_check'
    ) THEN
        ALTER TABLE graph ADD CONSTRAINT graph_link_share_role_check
            CHECK (link_share_role IS NULL
                   OR link_share_role IN ('discoverer', 'viewer', 'editor'));
    END IF;
END $$;

-- Tokens are globally unique so the public `/shared/{token}` route can
-- look them up without ambiguity. The partial index avoids penalising
-- the 99 % of graphs that never enable link sharing.
CREATE UNIQUE INDEX IF NOT EXISTS graph_link_share_token_idx
    ON graph(link_share_token)
    WHERE link_share_token IS NOT NULL;
