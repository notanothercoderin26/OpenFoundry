// Package cassandrakernel is the OpenFoundry Cassandra/Scylla helper.
//
// What this package owns
//
//   - Cluster / Session wiring (gocql) with sane defaults for the
//     auth_runtime + ontology workloads OpenFoundry runs.
//   - Migration ledger: Apply() drops a list of CREATE TABLE IF NOT
//     EXISTS / ALTER TABLE statements, idempotent by construction.
//   - Helpers shared by the per-service adapters
//     (identity-federation's sessions, ontology object/link stores, etc.).
//
// Each per-service adapter lives next to its service
// (`services/<name>/internal/cassandra*`); this package stays a small
// primitives lib.
//
// Implementation note: uses `gocql/gocql`. Schema + query strings,
// keyspace and table DDL flow through the keyspaces-job and the
// per-service Migration arrays.
package cassandrakernel
