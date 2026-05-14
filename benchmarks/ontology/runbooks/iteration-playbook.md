# Iteration playbook (S1.8.e) — what to tweak if the SLO fails

> Owner: ontology-query-service maintainers + platform performance owner.
> Last evidence attempt: 2026-05-03.
> Current result: BLOCKED; no accepted S1 latency/throughput run is attached.

If the `bench-ontology` run closes with red thresholds, this runbook
orders the mitigation levers from **lowest to highest cost**. Apply
one at a time, re-run the bench, and only escalate to the next lever
if the failing metric persists.

## Last execution attempt

| Field | Value |
|---|---|
| Date | 2026-05-03 |
| Owner | ontology-query-service maintainers + platform performance owner |
| Environment | Kubernetes context `default` |
| Evidence | [`docs/architecture/slo-evidence/2026-05-03/summary.md`](../../../docs/architecture/slo-evidence/2026-05-03/summary.md) |
| Result | BLOCKED; no accepted k6 run |

Commands and results:

```bash
command -v k6
kubectl get cassandradatacenters -A
kubectl get deploy -A
```

Summarised output:

```text
k6 is not installed locally.
No CassandraDatacenter resources found.
OpenFoundry identity/gateway services are 0/1 in this context.
```

Without k6, Cassandra and the S1 services ready, p50/p95/p99,
throughput, dropped iterations and error rate cannot be collected.
This attempt does not satisfy the ADR-0012 evidence.

## Symptom → lever

### High P50 (> 5 ms) on `read-by-id`

1. **Elevated cache miss-rate** — check the `cache::tests` rate on the
   read service (`/metrics` exposes `ontology_query_cache_hits_total`
   / `ontology_query_cache_misses_total`). If miss > 30 %:
   - Raise `CACHE_CAPACITY` (default 100 000, S1.5.a). Each entry is
     ≈ 4 KiB → 100 k = 400 MiB heap. 200 k is safe on 1 GiB pods.
   - Raise `CACHE_TTL_SECONDS` (default 30) to 60-120 if the NATS
     invalidation arrives reliably (check
     `ontology_query_invalidation_consumed_total`).
2. **Scylla driver connection-pool starvation** — `scylla::session`
   defaults to 1 conn/host; raise via `ClusterConfig::connection_pool_per_host`
   to 4 if there are > 2 cores and CPU headroom.
3. **Forced quorum** — if > 80 % of the load is `X-Consistency:
   strong`, check whether the real client actually needs
   LOCAL_QUORUM. Most UI reads tolerate `eventual`. Document the
   default per route.

### High P95/P99 (> 20 / > 50 ms)

1. **Hot partition** — see
   [`hot-partitions.md`](hot-partitions.md). A `tablehistograms` P99
   partition size > 10 MiB is the most common cause. Apply PK
   bucketing (the traditional S1.8.e fix) and re-run.
2. **Cassandra JVM GC** — `nodetool gcstats`. If `MaxGCPause` > 200
   ms, raise the heap (`MAX_HEAP_SIZE` 8G→16G), validate G1
   collector config, and consider Cassandra 5.0 with JDK 17 + ZGC
   on the bench pods.
3. **Amplified read repair** — `nodetool tablestats … | grep
   "Read repaired"`. If > 0.1 % under LOCAL_QUORUM there's drift
   between replicas; run `nodetool repair -pr` per node during a
   quiet window.

### Throughput < 5 000 RPS

1. **Dropped iterations in k6** — the k6 summary reports
   `dropped_iterations`. If > 0:
   - Raise `preAllocatedVUs` and `maxVUs` in
     [`k6/ontology-mix.js`](../k6/ontology-mix.js).
   - Check `noConnectionReuse: false` (the default). Each VU keeps
     a keep-alive connection to the read service.
2. **Read service CPU** — `kubectl top pod -n ontology`. If > 80 %
   sustained, scale the HPA and re-run. The RPS target assumes 3
   replicas on `m5.large`-equivalent t-shirt sizing.
3. **NIC saturation between k6 and the read service** — if k6 runs
   outside the cluster, move it to an in-cluster pod using the
   in-cluster path documented in
   [`benchmarks/ontology/README.md`](../README.md#running-against-a-live-cluster).

### Error rate > 0.1 %

1. **`429 Too Many Requests`** — the gateway rate limit is lower
   than the load. The bench bypasses the gateway (points directly at
   the read service); if the run is done through the gateway, raise
   the per-tenant quota for the bench in
   `services/edge-gateway-service/config/`.
2. **`503 Service Unavailable`** — Cassandra unreachable or LWT
   timeout. Check `nodetool status`; if a node is `DN`, abort the
   run and document it — do not accept an SLO with a degraded
   cluster.
3. **`401 / 403`** — the token expired. Refresh `OF_BENCH_TOKEN`.
   The suite does not implement automatic refresh, to avoid polluting
   the metric with client-side CPU.

## When to change the data model

Reaching the model is the last resort because it breaks client
contracts. Only proceed if:

- The previous levers are exhausted and P95 is still > 20 ms with
  P99 < 50 ms.
- `tablehistograms` shows a sustained P99 partition > 10 MiB even
  after major compaction.
- Real traffic (not the bench) resembles the profile that triggers
  the hot partition.

Viable changes, **always with an ADR**:

1. **Add a bucket to the PK** of `objects_by_type` (`tenant, type,
   bucket = object_id_hash % N`). Requires the read service to emit
   N parallel queries.
2. **Materialized view** of `objects_by_id` with `marking` as
   clustering — only if authorised queries dominate; watch out for
   write amplification.
3. **SAI secondary index** on `marking` — Cassandra 5.0 ships
   `StorageAttachedIndex` with a decent cost model for filters with
   > 5 % selectivity. Validate with a dedicated benchmark first.

Any of these three changes closes a minor migration (data backfill +
proto/SDK change) and must be documented before being merged to the
main trunk.

## Definition of success for the iteration

The bench closes green when, across 3 consecutive runs within a
1-hour window:

- All 4 k6 global thresholds pass.
- `dropped_iterations` < 0.01 % of `iterations`.
- `nodetool tablestats … | grep "Compacted partition maximum"` did
  not exceed 100 MiB on any touched CF.
- `nodetool tpstats` reports 0 drops in `ReadStage` and
  `MutationStage`.

Only then is the result recorded in `ADR-0012-data-plane-slos.md`
(S1.9.c) and S1.8 closed.
