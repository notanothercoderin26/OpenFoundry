# Hot-partition runbook (S1.8.d)

> Owner: ontology-query-service maintainers + Cassandra/SRE on-call.
> Last evidence attempt: 2026-05-03.
> Current result: BLOCKED; no accepted S1 benchmark run is attached.

During (and at the end of) each `bench-ontology` run the hottest
partitions of the keyspaces touched by the mix are inspected:
`ontology_objects`, `ontology_indexes` and `actions_log`. This runbook
documents the metrics that matter, the operational thresholds and the
corrective actions if a table falls out of range.

## Last execution attempt

| Field | Value |
|---|---|
| Date | 2026-05-03 |
| Owner | ontology-query-service maintainers + Cassandra/SRE on-call |
| Environment | Kubernetes context `default` |
| Evidence | [`docs/architecture/slo-evidence/2026-05-03/summary.md`](../../../docs/architecture/slo-evidence/2026-05-03/summary.md) |
| Result | BLOCKED; no accepted `nodetool tablestats` snapshot |

Commands and results:

```bash
kubectl get cassandradatacenters -A
kubectl get statefulset -A
```

Result:

```text
No resources found.
No resources found.
```

Without a `CassandraDatacenter` or Cassandra StatefulSet you can't
run `nodetool tablestats`, `toppartitions` or `tablehistograms`. This
attempt does not satisfy the S1 hot-partition evidence.

## Flow

```bash
# Pre-run snapshot (baseline).
kubectl exec -n data cassandra-0 -- nodetool tablestats -F json \
  ontology_objects ontology_indexes actions_log \
  > benchmarks/results/ontology-mix-tablestats-pre.json

# Run (5 minutes, 5 000 RPS) — see README.md.
just bench-ontology

# Post-run snapshot.
kubectl exec -n data cassandra-0 -- nodetool tablestats -F json \
  ontology_objects ontology_indexes actions_log \
  > benchmarks/results/ontology-mix-tablestats-post.json

# Human diff.
diff <(jq -S . benchmarks/results/ontology-mix-tablestats-pre.json) \
     <(jq -S . benchmarks/results/ontology-mix-tablestats-post.json) | less
```

## Metrics to watch

Per CF (`objects_by_id`, `objects_by_type`, `objects_by_owner`,
`objects_by_marking`, `links_outgoing`, `links_incoming`, `actions_log.*`):

| Metric | Operational threshold | Action if crossed |
|---|---|---|
| `Compacted partition maximum bytes` | < 100 MiB | Repartition the PK (S1.8.e). Likely a hot tenant or type. |
| `Compacted partition mean bytes` | < 1 MiB | Review the CF design; add a temporal bucket. |
| `Local read latency p99` | < 5 ms | Check `nodetool tpstats` (`ReadStage` queue). |
| `Local write latency p99` | < 3 ms | Check tombstones and compaction backlog. |
| `Tombstones per slice (avg)` | < 100 | Truncate the bench dataset and clean up; review TTLs. |
| `Bloom filter false positive ratio` | < 0.01 | `nodetool upgradesstables` or a targeted `compact`. |
| `Off heap memory used` | < 2 GiB per node | Raise the heap or repartition the keyspace. |

`nodetool tpstats` complements this: `ReadStage` and `MutationStage`
must keep `Pending` ≈ 0 with `Active` ≤ `concurrent_reads/_writes`
from the yaml. `Dropped` must be 0 in any category.

## Targeted inspection of the hottest partition

```bash
# Top-10 partitions by size in a CF.
kubectl exec -n data cassandra-0 -- nodetool toppartitions \
  ontology_objects objects_by_id 30000 -k 10 -s 1000

# Histogram of sizes and latency per host.
kubectl exec -n data cassandra-0 -- nodetool tablehistograms \
  ontology_objects objects_by_id
```

`tablehistograms` reports percentiles of **partition size**, **cell
count**, **read latency** and **write latency**. If the P99 partition
size is > 10 MiB, the PK needs a second bucket level (typically an
`hour_bucket` or `marking_band` column).

## Hot tenants

`objects_by_type` can become hot on (tenant, type) if a tenant
concentrates 80 % of the catalog. Mitigations, in order of preference:

1. **Client-side fan-out**: have the read service emit N parallel
   queries with `IN (bucket_0, bucket_1, …)` against a deterministic
   bucket column (`object_id % 16`).
2. **Re-model the PK**: add `object_id_bucket smallint` to the
   composite PK. This changes the contract of `list_by_type` (it
   stops being ordered). Only do this if (1) doesn't meet the SLO.
3. **Hot read replica**: increase `caching = { 'keys': 'ALL',
   'rows_per_partition': 'NONE' }` on the specific CF. Validate that
   the key cache on heap doesn't overflow.

## Post-bench cleanup

Each run uses a unique `tenant_id`. To free space:

```bash
# Delete all rows of the run's tenant with an earlier timestamp.
kubectl exec -n data cassandra-0 -- cqlsh -e "
  DELETE FROM ontology_objects.objects_by_id
   WHERE tenant_id = 'tenant-bench-2026-05-02';
  DELETE FROM ontology_objects.objects_by_type
   WHERE tenant_id = 'tenant-bench-2026-05-02';"

# Force major compaction (bench environment only, NOT in prod).
kubectl exec -n data cassandra-0 -- nodetool compact ontology_objects
```

Tombstones are evicted with `gc_grace_seconds = 86400` (1 d) on the
bench keyspace, so the next dataset doesn't carry over tombstones
from the previous one. **Do not** copy this `gc_grace` to production
— the default of 10 days remains correct there.
