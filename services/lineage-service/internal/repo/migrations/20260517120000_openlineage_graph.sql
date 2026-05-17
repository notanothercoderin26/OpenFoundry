-- OpenLineage dataset-level lineage graph.
--
-- The runs/datasets/edges trio is independent from the legacy
-- `lineage_nodes` + `lineage_relations` overlay. They speak the canonical
-- OpenLineage object model so any producer that emits to the
-- `lineage.events` Kafka topic (or POSTs to /api/v1/lineage/events)
-- shows up in upstream/downstream BFS queries without further plumbing.

CREATE TABLE IF NOT EXISTS lineage_runs (
    run_id          TEXT PRIMARY KEY,
    job_namespace   TEXT NOT NULL,
    job_name        TEXT NOT NULL,
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    state           TEXT NOT NULL DEFAULT 'RUNNING',
    facets          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_runs_job
    ON lineage_runs(job_namespace, job_name, COALESCE(started_at, created_at) DESC);

CREATE TABLE IF NOT EXISTS lineage_datasets (
    rid         TEXT PRIMARY KEY,
    namespace   TEXT NOT NULL,
    name        TEXT NOT NULL,
    facets      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lineage_datasets_ns_name
    ON lineage_datasets(namespace, name);

CREATE TABLE IF NOT EXISTS lineage_edges (
    run_id            TEXT NOT NULL,
    src_dataset_rid   TEXT NOT NULL,
    dst_dataset_rid   TEXT NOT NULL,
    edge_type         TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (run_id, src_dataset_rid, dst_dataset_rid, edge_type),
    CONSTRAINT chk_lineage_edges_type CHECK (edge_type IN ('INPUT', 'OUTPUT'))
);

CREATE INDEX IF NOT EXISTS idx_lineage_edges_src ON lineage_edges(src_dataset_rid);
CREATE INDEX IF NOT EXISTS idx_lineage_edges_dst ON lineage_edges(dst_dataset_rid);
CREATE INDEX IF NOT EXISTS idx_lineage_edges_run ON lineage_edges(run_id);
