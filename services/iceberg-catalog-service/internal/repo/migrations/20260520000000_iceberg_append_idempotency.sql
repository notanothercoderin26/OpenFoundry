-- Append-idempotency dedup table for /openfoundry/iceberg/v1/append.
--
-- Without this table, calling the append handler twice with the same
-- payload produces two snapshots: the snapshot_id is derived from
-- time.Now().UnixMilli() and there is no client-supplied key. For the
-- geopolitics PoC demo script ("click Run" in Pipeline Builder), two
-- accidental clicks produce two snapshots with identical content —
-- visibly broken on stage and a Foundry contract violation
-- (Datasets concepts page: "Datasets are first-class versioned
-- objects — readers always see a consistent snapshot").
--
-- Contract:
--   * The append handler reads the `Idempotency-Key` header (any
--     non-empty UTF-8 string up to 200 chars).
--   * For (idempotency_key, table_id) the row is unique. On second
--     submission with the same hash we return the recorded
--     snapshot_id and metadata_location with HTTP 200 instead of
--     committing again.
--   * On second submission with a different request_hash the handler
--     returns HTTP 409 — the same intent-key must not refer to two
--     distinct payloads.
--
-- TTL: rows are retained indefinitely for now; a janitor that prunes
-- by created_at older than N days is a follow-up (B06 Phase 2).

CREATE TABLE IF NOT EXISTS iceberg_append_idempotency (
    idempotency_key   TEXT      NOT NULL,
    table_id          UUID      NOT NULL REFERENCES iceberg_tables(id) ON DELETE CASCADE,
    request_hash      BYTEA     NOT NULL,
    snapshot_id       BIGINT    NOT NULL,
    metadata_location TEXT      NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (idempotency_key, table_id)
);

CREATE INDEX IF NOT EXISTS idx_iceberg_append_idempotency_created
    ON iceberg_append_idempotency(created_at DESC);
