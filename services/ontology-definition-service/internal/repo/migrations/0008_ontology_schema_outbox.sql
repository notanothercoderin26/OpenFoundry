-- B02 closure — transactional outbox for ontology schema events.
--
-- Per ADR-0022 (transactional outbox on Postgres, drained by Debezium):
-- every Create/Update/Delete on the ontology schema (object_types,
-- link_types, properties, object_type_groups, interfaces,
-- shared_property_types) writes a row here in the same SQL transaction
-- as the primary mutation. libs/outbox.Enqueue immediately deletes the
-- row in the same transaction; REPLICA IDENTITY FULL keeps the full
-- payload in the WAL so the Debezium EventRouter SMT emits it on the
-- topic carried by the `topic` column.
--
-- Topics produced from this outbox:
--   - ontology.object_type.changed.v1
--   - ontology.link_type.changed.v1
--   - ontology.property.changed.v1
--   - ontology.object_type_group.changed.v1
--   - ontology.interface.changed.v1
--   - ontology.shared_property_type.changed.v1
--
-- Schema mirrors the canonical layout owned by libs/outbox so the
-- helper writes the same columns regardless of which service hosts
-- the table.

CREATE SCHEMA IF NOT EXISTS outbox;

CREATE TABLE IF NOT EXISTS outbox.events (
    event_id     uuid PRIMARY KEY,
    aggregate    text NOT NULL,
    aggregate_id text NOT NULL,
    payload      jsonb NOT NULL,
    headers      jsonb NOT NULL DEFAULT '{}'::jsonb,
    topic        text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- REPLICA IDENTITY FULL keeps the full row payload in the WAL even after
-- the same-tx DELETE, so Debezium's EventRouter SMT can route it. The
-- privilege guard mirrors media-sets-service/0005 — CI sometimes runs
-- as a non-superuser that cannot alter replica identity, and the
-- production CNPG role does have the privilege.
DO $$ BEGIN
    ALTER TABLE outbox.events REPLICA IDENTITY FULL;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

-- created_at index supports debugging queries against a table that is
-- empty in steady state; production lookups are rare.
CREATE INDEX IF NOT EXISTS outbox_events_created_at_idx
    ON outbox.events (created_at);

-- Heartbeat table consumed by the Debezium connector's
-- `heartbeat.action.query`. Bounds replication-slot growth during
-- quiet windows: when no ontology mutation traffic is happening,
-- Debezium still issues UPSERTs here every 30 s, which forces the WAL
-- to advance and the slot to drain. Mirrors the schema used by every
-- other libs/outbox-backed service.
CREATE TABLE IF NOT EXISTS outbox.heartbeat (
    id           text PRIMARY KEY,
    last_seen_at timestamptz NOT NULL DEFAULT now()
);
