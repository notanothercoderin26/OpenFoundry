# Upgrade Playbook

Date: April 25, 2026

## Objective

Run repeatable OpenFoundry upgrades with prior validation, a maintenance window, and an explicit rollback.

## Preflight

- Validate the environment's Terraform/Helm
- Confirm migration compatibility
- Generate a logical PostgreSQL backup
- Generate a backup of critical buckets
- Review promotion gates on sensitive fleets

## Recommended strategy

1. `canary` in one deployment cell
2. Metrics validation and smoke checks
3. Promotion to `stable`
4. Rollout to the remaining cells within the maintenance window

## Rollback

- Revert image or chart version
- Restore the DB only if there was a destructive change or data corruption
- Re-enable reconcilers once the previous version is in place

## Minimum evidence

- Deployed commit or tag
- Start and end time
- Smoke check results
- Gate status
- Previous and new versions

## KRaft upgrade preflight

For Kafka cluster upgrades (Strimzi operator, `spec.kafka.version`,
`spec.kafka.metadataVersion`, or structural changes to the `KafkaNodePool`),
the **KRaft-specific policy** documented in
[ADR-0013](../../docs/architecture/adr/ADR-0013-kafka-kraft-no-spof-policy.md)
also applies. Operational summary:

1. **Mandatory gates before merging the upgrade PR:**
   - `python3 tools/kafka-lint/check_kraft.py` clean against the
     resulting manifest (Layer A).
   - Last hour without firings of `KafkaUnderMinIsrPartitions` or
     `KafkaActiveControllerCountAbnormal` in production (Layer B —
     `infra/k8s/platform/observability/prometheus-rules/kafka.yaml`).
   - `kafka-topics.sh ... --under-replicated-partitions` empty.
   - Last green run of the *Chaos Smoke (Data Plane no-SPOF)* workflow
     ≤ 7 days ago (Layer C — includes `kill-active-kafka-controller.sh`).
2. **Order of application** (do not bundle changes into a single PR):
   1. **Strimzi operator** first (CRDs + controller). Do not touch
      `spec.kafka.version` in the same PR.
   2. **`spec.kafka.version`**, one minor at a time, following the
      Strimzi upgrade matrix.
   3. **`spec.kafka.metadataVersion`** only once the cluster has been
      stable for at least one full chaos-smoke cycle on the new
      `kafka.version`. This bump is **not reversible**: it locks the
      on-disk format of the quorum.
3. **Immediate abort / rollback criteria:**
   - Either of the two KRaft alerts above fires during the rollout.
   - The `Kafka/openfoundry` CR does not reach `Ready` within 30 minutes
     after `kubectl apply`.
   - Quorum loss: `sum(ActiveControllerCount)` stays at `0` for more
     than 5 minutes.
4. **Forbidden in the same upgrade PR:** moving
   `min.insync.replicas`, `default.replication.factor`,
   `unclean.leader.election.enable`, or `KafkaNodePool.roles` alongside
   a version change. Each is its own PR (gated by Layer A).

The operational step-by-step and commands live in `infra/runbooks/kafka.md`
§2.1.
