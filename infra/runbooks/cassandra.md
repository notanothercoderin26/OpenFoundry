# Cassandra (k8ssandra-operator) Runbook

OpenFoundry uses **Apache Cassandra 5.0** (Apache-2.0) managed by
**k8ssandra-operator** (Apache-2.0). The umbrella includes `cass-operator`,
**Reaper** (auto-repair), and **Medusa** (backups to Ceph S3). Stargate
is explicitly disabled: services speak CQL directly via `gocql/gocql`.

Manifests: `infra/k8s/platform/manifests/cassandra/`
Related runbooks:
- `infra/runbooks/ceph.md` — node PVs live on `ceph-rbd-fast` (NVMe,
  3x replication with `zone` failure domain).
- `infra/runbooks/disaster-recovery.md` — cross-DC flows and restore
  from Medusa backups.

Related ADRs:
- [ADR-0020](../../docs/architecture/adr/ADR-0020-cassandra-as-operational-store.md) — adoption and modeling rules.
- [ADR-0021](../../docs/architecture/adr/ADR-0021-temporal-on-cassandra-go-workers.md) — Temporal on Cassandra.
- Full data model: [`docs/architecture/data-model-cassandra.md`](../../docs/architecture/data-model-cassandra.md).

## 1. Deployed architecture

| Component               | Configuration                                                                 |
|-------------------------|-------------------------------------------------------------------------------|
| `K8ssandraCluster` prod | 3 DCs (`dc1`, `dc2`, `dc3`) × 3 nodes × 3 racks (zone-aware)                  |
| Replication strategy    | `NetworkTopologyStrategy {dc1:3, dc2:3, dc3:3}` for all keyspaces             |
| Default consistency     | `LOCAL_QUORUM` (read and write)                                               |
| Snitch                  | `GossipingPropertyFileSnitch`                                                 |
| Tokens                  | `num_tokens=16`, `allocate_tokens_for_local_replication_factor=3`             |
| JVM                     | G1GC, heap 32 GiB, young 4 GiB                                                |
| Storage                 | 2 TiB per pod on `ceph-rbd-fast` (NVMe)                                       |
| Reaper                  | `deploymentMode: PER_DC`, autoScheduling every 12h, sub-range parallelism     |
| Medusa                  | Bucket `cassandra-backups-prod` (Ceph RGW), full nightly + diff every 6h, 30d |
| Metrics                 | MCAC sidecar (port 9103) + Reaper `/healthcheck/metrics`                      |
| TLS                     | Internode + client, certificates issued by cert-manager                       |

Application keyspaces (created by
[`keyspaces-job.yaml`](../k8s/platform/manifests/cassandra/keyspaces-job.yaml)):
`ontology_objects`, `ontology_indexes`, `actions_log`, `auth_runtime`,
`notifications_inbox`, `agent_state`. The two Temporal keyspaces
(`temporal_persistence`, `temporal_visibility`) are managed by the
Temporal chart via `temporal-cassandra-tool`.

## 2. Operational access

```bash
# cqlsh shell against DC1 using the superuser credentials.
SU_USER=$(kubectl -n cassandra get secret of-cass-prod-superuser -o jsonpath='{.data.username}' | base64 -d)
SU_PASS=$(kubectl -n cassandra get secret of-cass-prod-superuser -o jsonpath='{.data.password}' | base64 -d)

kubectl -n cassandra exec -it of-cass-prod-dc1-rack1-sts-0 -c cassandra -- \
  cqlsh -u "$SU_USER" -p "$SU_PASS"

# Cluster state (replication, ownership, UN/DN per node).
kubectl -n cassandra exec -it of-cass-prod-dc1-rack1-sts-0 -c cassandra -- \
  nodetool status
```

Any destructive operation (truncate, drop, forced repair in production)
**requires a change ticket** and validation with the on-call.

## 3. Routine operations

### 3.1 Repair (anti-entropy)

Reaper runs by default: per-DC schedule every 12h with sub-range
parallelism. Check the state:

```bash
# Reaper UI (port-forward).
kubectl -n cassandra port-forward svc/of-cass-prod-reaper-service 8080:8080
# http://localhost:8080/webui

# Last successful repair per keyspace (Prometheus).
# Alert: CassandraRepairOverdue (> 10 days) in
# infra/k8s/platform/manifests/cassandra/servicemonitor.yaml.
```

Force a manual repair of a specific keyspace (e.g. after an incident
or a large schema change):

```bash
# Via Reaper (preferred — sub-range, throttled).
curl -X POST "http://localhost:8080/repair_run?clusterName=of-cass-prod&keyspace=ontology_objects&owner=oncall&segmentCount=64&repairParallelism=DATACENTER_AWARE&intensity=0.5"

# Via nodetool (last resort, single DC, primary range).
kubectl -n cassandra exec -it of-cass-prod-dc1-rack1-sts-0 -c cassandra -- \
  nodetool repair -pr -j 4 ontology_objects
```

Rules:
- Never run a full multi-DC `nodetool repair` during traffic hours.
- `-pr` (primary range) is mandatory if it is executed on every node in the DC.
- Monitor `mcac_compaction_pending_tasks` during the repair.

### 3.2 Scale-out (adding nodes to a DC)

```bash
# 1. Edit the K8ssandraCluster: bump `datacenters[i].size`.
kubectl -n cassandra edit k8ssandracluster of-cass-prod
#    Change: spec.cassandra.datacenters[?(@.metadata.name=="dc1")].size
#            from 3 to 6 (always a multiple of #racks to keep balance).

# 2. cass-operator adds nodes one by one, respecting racks.
#    Verify the progressive join:
kubectl -n cassandra get pods -l cassandra.datastax.com/cluster=of-cass-prod -w
kubectl -n cassandra exec -it of-cass-prod-dc1-rack1-sts-0 -c cassandra -- nodetool status

# 3. After all new nodes are `UN` (Up/Normal), run cleanup on the
#    previous nodes to free the ownership that was transferred.
for pod in $(kubectl -n cassandra get pods -l cassandra.datastax.com/datacenter=dc1,cassandra.datastax.com/cluster=of-cass-prod -o name | head -3); do
  kubectl -n cassandra exec -it "$pod" -c cassandra -- nodetool cleanup
done
```

Rules:
- Bump `size` in steps that are multiples of the number of racks (3) so
  ownership stays balanced across zones.
- `concurrent_compactors=4` and throttled throughput avoid saturating
  neighbors during bootstrap.
- After scale-out, run Reaper on all keyspaces (at least
  `ontology_objects` and `actions_log`) before considering the cluster
  stable.

### 3.3 Replace-node (replacing a lost node)

Applies when a PVC is corrupted or a node has been `DN` (Down/Normal)
for > 1h:

```bash
# 1. Confirm the host_id of the lost node.
kubectl -n cassandra exec -it of-cass-prod-dc1-rack1-sts-0 -c cassandra -- \
  nodetool status | grep DN
#    DN  10.42.7.18  ...  cd7e3a1c-...

# 2. cass-operator drives the replacement via a CassandraTask.
cat <<'EOF' | kubectl apply -f -
apiVersion: control.k8ssandra.io/v1alpha1
kind: CassandraTask
metadata:
  name: replace-dc1-rack2-sts-1
  namespace: cassandra
spec:
  datacenter:
    name: of-cass-prod-dc1
    namespace: cassandra
  jobs:
    - name: replace-node
      command: replacenode
      args:
        pod_name: of-cass-prod-dc1-rack2-sts-1
EOF

# 3. Track progress.
kubectl -n cassandra get cassandratask replace-dc1-rack2-sts-1 -w

# 4. Verify the new pod is UN and the old host_id has disappeared from
#    the ring.
kubectl -n cassandra exec -it of-cass-prod-dc1-rack1-sts-0 -c cassandra -- \
  nodetool status
```

If `cass-operator` cannot orchestrate the replacement (degraded case,
without a healthy PVC to start from), the manual procedure is:

```bash
# 1. Decommission the dead node (if it still answers gossip).
nodetool removenode <host_id>

# 2. Delete the PVC and let the StatefulSet recreate the pod.
kubectl -n cassandra delete pvc server-data-of-cass-prod-dc1-rack2-sts-1

# 3. After bootstrap, full DC repair.
```

### 3.4 Restore from Medusa

Assumes backup `full_2026-04-29` and bucket `cassandra-backups-prod`.

```bash
# 1. List available backups.
kubectl -n cassandra exec -it of-cass-prod-dc1-rack1-sts-0 -c medusa -- \
  medusa list-backups

# 2. Restore a specific keyspace in-place (live cluster).
#    Useful after logical corruption (DROP TABLE, etc.).
cat <<'EOF' | kubectl apply -f -
apiVersion: medusa.k8ssandra.io/v1alpha1
kind: MedusaRestoreJob
metadata:
  name: restore-ontology-objects-2026-04-29
  namespace: cassandra
spec:
  cassandraDatacenter: dc1
  backup: full_2026-04-29
  shutdown: false
EOF

# 3. Full cluster restore (DR, see disaster-recovery.md).
#    Requires scaling down all DCs and starting from an empty cluster.
#    Detailed procedure in infra/runbooks/disaster-recovery.md.
```

Rules:
- In-place restore does not scale beyond a single small keyspace; for
  large recoveries, restore into a parallel cluster and bring services
  back up against it.
- Always verify with `nodetool status` and a representative
  `SELECT count(*)` before declaring the restore complete.

## 4. Troubleshooting

### 4.1 Tombstone storms

Symptom: `CassandraTombstoneScans` alert, read p99 spiking on a
specific table.

```sql
-- Identify problematic tables.
SELECT keyspace_name, table_name, tombstones_per_slice_p99
FROM system_views.coordinator_scans;
```

Common causes:
- Very short TTL on a table with LCS compaction.
- "Delete then insert" pattern instead of upsert.

Action: review the model (ADR-0020 §"hard rules"); consider TWCS if the
data is immutable with expiration.

### 4.2 Large partitions

Alert: `CassandraLargePartition` (> 100 MB).

```bash
kubectl -n cassandra exec -it of-cass-prod-dc1-rack1-sts-0 -c cassandra -- \
  nodetool tablehistograms <keyspace> <table>
```

Immediate action: this is **not** fixed by repair or compaction. It is
a modeling bug; open an incident with the schema owner and re-bucket
(add a temporal or hash component to the PK).

### 4.3 Long GC pauses

Symptom: pods briefly marked `DN`, latency spikes at minute intervals.

```bash
kubectl -n cassandra logs of-cass-prod-dc1-rack1-sts-0 -c cassandra | \
  grep -E 'GCInspector|Pause'
```

If G1 pauses consistently exceed 500 ms:
- Increase heap (review the workload, do not exceed 50% of the pod's memory).
- Check `concurrent_compactors` and `compaction_throughput`.
- Verify there is no tombstone storm in progress.

### 4.4 Growing hints backlog

Alert: `CassandraHintsBacklog` (> 10k in progress).

Indicates a node has been unreachable for a long time. Confirm with
`nodetool status` and, if the node does not return within
`max_hint_window` (3h), run `nodetool truncatehints` after a full
repair to avoid inconsistent replays.

## 5. On-call escalation

| Severity  | Trigger                                                                    | Action                                    |
|-----------|----------------------------------------------------------------------------|-------------------------------------------|
| `page`    | `CassandraQuorumAtRisk` (≥ 2 `DN` nodes in a DC)                           | Call the platform on-call immediately.    |
| `page`    | `CassandraNodeDown` (≥ 5 min)                                              | Triage; if `cass-operator` cannot recover, run replace-node. |
| `ticket`  | `CassandraLargePartition`, `CassandraTombstoneScans`, `CassandraReadLatencyP99High` | Open an issue with the schema owner; review ADR-0020. |
| `ticket`  | `CassandraPendingCompactions`, `CassandraHintsBacklog`, `CassandraRepairOverdue` | Operational action per sections §3 and §4. |

## 6. Pre-flight for upgrades

Before bumping the Cassandra or k8ssandra-operator version:

1. `nodetool status` — all nodes `UN` in all DCs.
2. No active alerts in the last 2h.
3. Last successful Reaper run per keyspace ≤ 7 days.
4. Recent Medusa full snapshot (≤ 24h) and listing verification.
5. Validate the k8ssandra-operator ↔ Cassandra compatibility matrix at
   https://docs.k8ssandra.io/install/release-notes/.
6. Apply on `cluster-dev.yaml` first, let it bake for 24h.

The general upgrade procedure (rolling, DC by DC) follows the rules in
`infra/runbooks/upgrade-playbook.md`.
