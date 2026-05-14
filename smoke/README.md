# OpenFoundry — Smoke & Chaos

This folder groups the data plane **smoke scenarios** and the **chaos
suite** that validates their non-SPOF properties.

## Structure

```
smoke/
├── scenarios/              # JSON consumed by `of-cli smoke run`
│   ├── p0-critical-path.json
│   ├── p2-runtime-critical-path.json
│   ├── p3-semantic-governance-critical-path.json
│   ├── p4-developer-platform-critical-path.json
│   ├── p5-ai-ml-critical-path.json
│   └── p6-analytics-enterprise-critical-path.json
├── results/                # Output (one per scenario, overwritten)
│   └── chaos/              # Chaos suite output (chaos__scenario.json)
├── fixtures/
└── chaos/                  # Data plane chaos suite
    ├── lib/common.sh
    ├── kill-one-mon.sh                 # Rook-Ceph mon
    ├── kill-one-kafka-broker.sh        # Strimzi Kafka
    ├── kill-one-nats-node.sh           # NATS
    ├── kill-pg-primary.sh              # CNPG failover
    └── run.sh                          # Orchestrator
```

## Run a single scenario

The current runner is the Go CLI at `tools/of-cli`. From the repo root:

```bash
go run ./tools/of-cli -- smoke run \
  --scenario smoke/scenarios/p2-runtime-critical-path.json \
  --output   smoke/results/p2-runtime-critical-path.json
```

To speed up repeated runs, compile the binary once:

```bash
mkdir -p bin
go build -trimpath -o bin/of ./tools/of-cli
./bin/of smoke run \
  --scenario smoke/scenarios/<file>.json \
  --output   smoke/results/<file>.json
```

The root `justfile` is just a shim over `make`; it contains no
current `just smoke-*` recipes. If a page mentions them, treat it as stale.

## Chaos suite

The suite validates the non-SPOF properties of the data plane: for
each layer (Ceph mon, Kafka, NATS, Postgres primary) it kills 1 pod,
waits for the cluster to go back to green, and then runs scenarios
`p2..p6`. It fails if **any** scenario fails under **any** chaos.

### CI

It is wired into `.github/workflows/chaos-smoke.yml`, which runs:

- On `workflow_dispatch` (manual; optionally with the
  `CHAOS_KUBECONFIG` repo/org secret to inject the target cluster's
  kubeconfig — if absent, the runner is assumed to already have it
  configured).
- Nightly (`cron: "17 4 * * *"`).

It does **not** run on every PR (it's expensive).

### Local — kind

```bash
# 1. Local cluster
kind create cluster --name openfoundry-chaos

# 2. Install the DP operators and CRs you intend to test.
#    Minimum:
#      - Strimzi  + Kafka  (infra/k8s/platform/manifests/strimzi/)
#      - Rook     + Ceph   (infra/k8s/platform/manifests/rook/)
#      - CloudNativePG + Cluster (infra/k8s/platform/manifests/cnpg/)
#      - NATS Helm chart in ns `nats`
#    See the READMEs in each infra/k8s/ subfolder.

# 3. Launch the edge gateway / CP services in another terminal (or port-forwards
#    against the cluster) so that `http://127.0.0.1:8080` serves the
#    `edge-gateway-service` expected by the scenarios (see smoke/scenarios/*.json).

# 4. Compile the CLI once.
mkdir -p bin
go build -trimpath -o bin/of ./tools/of-cli
export OF_CLI="$PWD/bin/of"

# 5. Run the full suite.
./smoke/chaos/run.sh
```

### Local — k3d

```bash
k3d cluster create openfoundry-chaos --agents 3
# rest identical to the kind flow.
```

### Useful environment variables

| Variable                  | Default                | Description                                                    |
|---------------------------|------------------------|----------------------------------------------------------------|
| `OF_CLI`                  | `go run ./tools/of-cli --` | How to invoke the runner. Set to a binary path to speed it up. |
| `CHAOS_RESULTS_DIR`       | `smoke/results/chaos`  | Where to write the JSON output of each combination.            |
| `CHAOS_WAIT_TIMEOUT`      | `600s`                 | Maximum `kubectl wait` timeout after killing a pod.            |
| `CHAOS_DRY_RUN`           | `0`                    | `1` ⇒ do not touch the cluster (to validate script logic).     |
| `ROOK_CEPH_NAMESPACE`     | `rook-ceph`            | NS of the CephCluster.                                         |
| `KAFKA_NAMESPACE`         | `kafka`                | NS of the Strimzi Kafka.                                       |
| `KAFKA_CLUSTER`           | `openfoundry`          | Name of the `Kafka` CR.                                        |
| `KAFKA_POOL`              | `kafka`                | Name of the `KafkaNodePool`.                                   |
| `NATS_NAMESPACE`          | `nats`                 | NS of the NATS cluster.                                        |
| `NATS_SELECTOR`           | `app.kubernetes.io/name=nats` | NATS pod selector.                                      |
| `PG_NAMESPACE`            | `default`              | NS of the CNPG `Cluster`.                                      |
| `PG_CLUSTER`              | `openfoundry-pg`       | Name of the CNPG `Cluster`.                                    |

### Launch a single experiment

Any `kill-*.sh` script can be run in isolation:

```bash
./smoke/chaos/kill-one-kafka-broker.sh
```

…then run a scenario with `go run ./tools/of-cli -- smoke run
--scenario <file> --output <file>` to validate manually.

## Script validation

```bash
shellcheck smoke/chaos/*.sh smoke/chaos/lib/*.sh
# If you have actionlint installed:
actionlint .github/workflows/chaos-smoke.yml
```
