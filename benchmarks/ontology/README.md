# Ontology data-plane performance baseline (Stream S1.8)

Reproducible benchmark harness for the post-Cassandra ontology hot path.
Focuses on the workload mix that S1.8.b mandates and the SLO targets
that S1.8.c locks in:

| Mix | Path | Endpoint (substrate today) |
|---|---|---|
| 80 % | read by id | `GET /api/v1/ontology/objects/{tenant}/{object_id}` |
| 15 % | read by type | `GET /api/v1/ontology/objects/{tenant}/by-type/{type_id}` |
|  5 % | write | `POST /api/v1/ontology/actions/{id}/execute` |

## SLO targets (3-node Cassandra 5.0.2, single AZ)

| Percentile | Target | k6 threshold name |
|---|---|---|
| P50 | < 5 ms | `http_req_duration{group:read-by-id}` p(50) < 5 |
| P95 | < 20 ms | `http_req_duration` p(95) < 20 |
| P99 | < 50 ms | `http_req_duration` p(99) < 50 |
| Sustained | 5 000 RPS | `iterations_per_second` ≥ 5000 |
| Errors | < 0.1 % | `http_req_failed` rate < 0.001 |

The thresholds are wired into [`k6/ontology-mix.js`](k6/ontology-mix.js)
and the run aborts early if breached.

## Authorization mix

50 % of reads run with `X-Consistency: strong` (LOCAL_QUORUM,
cache bypass) and 50 % with `X-Consistency: eventual` (LOCAL_ONE + moka
cache — see S1.5.a/d). This ensures coverage of both the hot-cache path
and the quorum-bound path. All requests carry `Authorization:
Bearer ${OF_BENCH_TOKEN}` to exercise the `auth-middleware` middleware
and the Cedar evaluation in `authz-cedar`.

## Layout

```
benchmarks/ontology/
├── README.md                       # this file
├── k6/
│   ├── ontology-mix.js             # primary harness (RPS-shaped, threshold-aware)
│   └── seed.sh                     # populate fixture ids via the API
├── scenarios/
│   └── ontology-mix.json           # latency-only baseline for `of-cli bench`
└── runbooks/
    ├── hot-partitions.md           # S1.8.d — `nodetool tablestats` workflow
    └── iteration-playbook.md       # S1.8.e — what to tweak if the SLO fails
```

## How to run

### k6 (canonical path, 5 000 sustained RPS)

Requires k6 1.0+ (`brew install k6` or `docker run grafana/k6`).

```bash
export OF_BENCH_BASE_URL=https://ontology.dev.openfoundry.local
export OF_BENCH_TOKEN=<bearer>
export OF_BENCH_TENANT=tenant-bench
export OF_BENCH_TYPE_ID=Aircraft
export OF_BENCH_OBJECT_IDS=./benchmarks/ontology/k6/object-ids.txt
export OF_BENCH_ACTION_ID=<action-id-fixture>

just bench-ontology
```

Results land in `benchmarks/results/ontology-mix-k6.json` (k6 native
format), `benchmarks/results/ontology-mix-summary.json` and
`benchmarks/results/ontology-mix-metadata.json`. The recipe calls
[`scripts/run-s1-baseline.sh`](scripts/run-s1-baseline.sh), which
preflight-checks variables/dataset, runs k6 and generates
`benchmarks/results/adr-0012-s1-baseline.md` with the table that gets
pasted into ADR-0012. For Grafana, just point the Prometheus data source
at the k6 exporter (`--out experimental-prometheus-rw`).

### `of-cli bench` (sequential latency baseline, no RPS shape)

Useful for quick regression in CI; measures warmup×1 + samples×5 without
maintaining concurrent load. It is not meant to validate the 5 000 RPS
SLO, only to catch regressions in median latency.

```bash
make bench-critical-paths   # ya existente, no toca este harness
go run ./tools/of-cli bench run \
  --scenario benchmarks/ontology/scenarios/ontology-mix.json \
  --output benchmarks/results/ontology-mix-baseline.json
```

## Cassandra observability during the run

While k6 is running, in a second shell (point it at any node of the
3-node cluster):

```bash
watch -n5 'kubectl exec -n data cassandra-0 -- nodetool tablestats \
  ontology_objects ontology_indexes actions_log | grep -E "Read|Write|Tombstone|Bloom|Compaction"'
```

And at the end of the run:

```bash
kubectl exec -n data cassandra-0 -- nodetool tablestats -F json \
  ontology_objects ontology_indexes actions_log \
  > benchmarks/results/ontology-mix-tablestats.json
```

The [`runbooks/hot-partitions.md`](runbooks/hot-partitions.md) runbook
explains which metrics to watch (S1.8.d).

## Conventions

* UUIDv7 ids (temporal order). The fixture loader (`k6/seed.sh`)
  produces `object-ids.txt` so the harness can pick randomly.
* `tenant_id` is **unique per run** so it doesn't contaminate
  partitions from prior benchmarks; subsequent cleanup is a
  `TRUNCATE … USING TIMESTAMP …` documented in the iteration runbook.
* The harness assumes the read service exposes the endpoint over plain
  HTTP (the S1.5 substrate); the TLS gateway is tested in the smoke
  suite, not here.

## Running against a live cluster

To populate table A.4 of
[`docs/architecture/adr/ADR-0012-data-plane-slos.md`](../../docs/architecture/adr/ADR-0012-data-plane-slos.md)
and close the **G-S1** gate from
[`migration-plan-cassandra-foundry-parity.md`](../../migration-plan-cassandra-foundry-parity.md)
the harness must be run **inside the cluster**. Running it from a
laptop introduces 10–40 ms of WAN jitter that masks the P99 < 50 ms
SLO, so the supported path is a Job + PVC under
`infra/k8s/bench/`:

| Manifest | Contents |
|---|---|
| [`infra/k8s/bench/ontology-bench-namespace.yaml`](../../infra/k8s/bench/ontology-bench-namespace.yaml) | Namespace `openfoundry-bench`, RBAC (`bench-runner` SA with `pods/exec` in the `cassandra` ns), PVC `bench-artefacts` (5 GiB RWO), `CronJob ontology-bench-k6` with `suspend: true` running k6 0.55. |
| [`infra/k8s/bench/ontology-bench-credentials.yaml`](../../infra/k8s/bench/ontology-bench-credentials.yaml) | `ExternalSecret` that projects from Vault (`secret/data/openfoundry/bench/ontology-bench-token`) a JWT signed by identity-federation with `tenant=bench-tenant` and the minimum required scopes. |
| [`infra/k8s/bench/ontology-bench-seed-job.yaml`](../../infra/k8s/bench/ontology-bench-seed-job.yaml) | Idempotent Job that inserts 50 000 objects (5 000 × 10 type_ids `bench-type-T01…T10`, same shape as the `libs/cassandra-kernel` IT) and then invokes `seed.sh` to harvest `object-ids.txt`. |

### 1. Bootstrap

```bash
# Create the namespace, RBAC, PVC and the (suspended) k6 CronJob.
kubectl apply -f infra/k8s/bench/ontology-bench-namespace.yaml

# Project the JWT from Vault (requires the external-secrets operator).
kubectl apply -f infra/k8s/bench/ontology-bench-credentials.yaml

# Push the repo's canonical scripts into a ConfigMap. Re-run this
# command whenever you change ontology-mix.js or seed.sh: the
# manifests intentionally DO NOT embed the contents, to avoid drift.
kubectl -n openfoundry-bench create configmap bench-k6-scripts \
  --from-file=ontology-mix.js=benchmarks/ontology/k6/ontology-mix.js \
  --from-file=seed.sh=benchmarks/ontology/k6/seed.sh \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 2. Populate the tenant (seed Job)

```bash
kubectl apply -f infra/k8s/bench/ontology-bench-seed-job.yaml
kubectl -n openfoundry-bench wait --for=condition=complete \
  job/ontology-bench-seed --timeout=45m
kubectl -n openfoundry-bench logs -l app.kubernetes.io/name=ontology-bench-seed --tail=-1
```

The Job exits with code 2 if the harvest falls > 10 % below the
expected 50 000 (a symptom that the tenant was truncated mid-run).
The JSON summary lands at `/data/results/seed-summary.json` on the PVC.

### 3. Trigger the k6 bench

The `CronJob` is `suspend: true` by design — operators kick off a
one-off run with `kubectl create job --from`:

```bash
kubectl -n openfoundry-bench create job \
  --from=cronjob/ontology-bench-k6 \
  ontology-bench-k6-$(date +%Y%m%d-%H%M)

kubectl -n openfoundry-bench wait --for=condition=complete \
  job/ontology-bench-k6-<timestamp> --timeout=15m
kubectl -n openfoundry-bench logs -l app.kubernetes.io/name=ontology-bench-k6 --tail=-1
```

k6 writes to the PVC:

* `/data/results/ontology-mix-k6.json` — k6 native JSON output.
* `/data/results/ontology-mix-summary.json` — `--summary-export`,
  useful for CI dashboards.

### 4. Collect artefacts from the PVC

The PVC is `ReadWriteOnce`, so it can't be mounted in two pods at
once. To extract the JSON to local disk we spin up an ephemeral pod
(`tar` + `kubectl cp` doesn't work against unmounted PVCs):

```bash
kubectl -n openfoundry-bench run bench-fetch \
  --rm -it --restart=Never \
  --overrides='{
    "spec": {
      "containers": [{
        "name":"fetch",
        "image":"busybox:1.37",
        "command":["sh","-c","sleep 600"],
        "volumeMounts":[{"name":"d","mountPath":"/data","readOnly":true}]
      }],
      "volumes":[{"name":"d","persistentVolumeClaim":{"claimName":"bench-artefacts","readOnly":true}}]
    }
  }' \
  --image=busybox:1.37 -- sh

# in another shell:
kubectl -n openfoundry-bench cp \
  bench-fetch:/data/results/ontology-mix-k6.json \
  benchmarks/results/ontology-mix-k6.json
kubectl -n openfoundry-bench cp \
  bench-fetch:/data/results/ontology-mix-summary.json \
  benchmarks/results/ontology-mix-summary.json
```

### 5. `nodetool tablestats` snapshot post-run

The `bench-runner` SA has `pods/exec` in the `cassandra` namespace
(via `RoleBinding bench-cassandra-exec`). We launch an ephemeral
sidecar pod in `openfoundry-bench` that exercises that permission and
persists the JSON to the same PVC:

```bash
kubectl -n openfoundry-bench run bench-tablestats \
  --rm -it --restart=Never \
  --serviceaccount=bench-runner \
  --image=bitnami/kubectl:1.31 \
  --overrides='{
    "spec":{
      "serviceAccountName":"bench-runner",
      "containers":[{
        "name":"ts","image":"bitnami/kubectl:1.31",
        "command":["sh","-c","kubectl -n cassandra exec of-cass-prod-dc1-default-sts-0 -c cassandra -- nodetool tablestats -F json ontology_objects ontology_indexes actions_log > /data/results/ontology-mix-tablestats.json"],
        "volumeMounts":[{"name":"d","mountPath":"/data"}]
      }],
      "volumes":[{"name":"d","persistentVolumeClaim":{"claimName":"bench-artefacts"}}]
    }
  }' -- sh
```

Afterwards copy it with the same pattern as step 4
(`bench-fetch:/data/results/ontology-mix-tablestats.json` →
`benchmarks/results/`).

### 6. Cleanup

```bash
kubectl -n openfoundry-bench delete job ontology-bench-seed
kubectl -n openfoundry-bench delete job -l app.kubernetes.io/name=ontology-bench-k6
# The PVC is kept so we can diff between runs; delete it once you've
# checked the artefacts into benchmarks/results/.
kubectl -n openfoundry-bench delete pvc bench-artefacts
# And run the TRUNCATE documented in runbooks/iteration-playbook.md
# against the `ontology_objects` keyspace (tenant_id = 'bench-tenant').
```

> **G-S1 notice.** Until the three JSON files
> (`ontology-mix-k6.json`, `ontology-mix-summary.json`,
> `ontology-mix-tablestats.json`) live under `benchmarks/results/`
> and table A.4 of ADR-0012 is complete, gate G-S1 stays open. The
> real execution happens in Prompt 3 — this Prompt only ships the
> in-cluster harness.
