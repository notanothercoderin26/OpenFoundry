-- B06 §AC#1 — Row-storage backing for the Phase B append/scan path.
--
-- The Apache Iceberg storage model puts row data in object storage as
-- Parquet files, addressed via manifest lists per snapshot. Production
-- deployments swap that in by replacing the AppendBatch handler's
-- store with a Parquet writer. For the PoC we persist rows in
-- Postgres alongside the snapshot record so pipeline-runtime can read
-- them back end-to-end without an object-storage round-trip.
--
-- The (table_id, snapshot_pk, row_index) primary key gives every row a
-- stable identity per snapshot — that's what /openfoundry/iceberg/v1/scan
-- streams back and what data-health checks (null-rate, etc.) iterate
-- over.

CREATE TABLE IF NOT EXISTS iceberg_table_rows (
    table_id     UUID    NOT NULL REFERENCES iceberg_tables(id) ON DELETE CASCADE,
    snapshot_pk  BIGINT  NOT NULL REFERENCES iceberg_snapshots(id) ON DELETE CASCADE,
    row_index    INTEGER NOT NULL,
    payload      JSONB   NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (table_id, snapshot_pk, row_index)
);

-- Scan endpoint: "give me rows for table T at snapshot S, paginated"
-- — row_index is the deterministic ordering key the writer assigns.
CREATE INDEX IF NOT EXISTS idx_iceberg_table_rows_snapshot
    ON iceberg_table_rows(snapshot_pk, row_index);

-- Reads against the latest snapshot of a table — used by the default
-- /scan path when no snapshot_id is supplied.
CREATE INDEX IF NOT EXISTS idx_iceberg_table_rows_table_snapshot
    ON iceberg_table_rows(table_id, snapshot_pk);
