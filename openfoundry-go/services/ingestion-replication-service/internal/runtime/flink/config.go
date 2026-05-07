// Package flink ports event_streaming::runtime::flink — the Flink
// integration split that surfaces a pure DAG → Flink SQL emitter
// (sql.go), an HTTP proxy for the JobManager job-graph endpoint
// (job_graph.go), plus the shared runtime configuration / consistency
// resolver from the Rust mod.rs.
//
// The deployer + metrics_poller live behind the `flink-runtime` feature
// flag in Rust and are not part of IRF-2; this package focuses on the
// pieces engine.processor (local) and the REST handlers already need.
package flink

import (
	"os"
	"strconv"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/ingestion-replication-service/internal/domain"
)

// FlinkJobCoords mirrors event_streaming::runtime::flink::FlinkJobCoords.
type FlinkJobCoords struct {
	DeploymentName string
	Namespace      string
	JobID          *string
}

// FlinkRuntimeConfig mirrors event_streaming::runtime::flink::FlinkRuntimeConfig.
type FlinkRuntimeConfig struct {
	DefaultNamespace      string
	SQLRunnerImage        string
	FlinkVersion          string
	JobManagerURLTemplate string
	MetricsPollIntervalMS uint64
	StateBucketURI        string
}

// ConfigFromEnv mirrors FlinkRuntimeConfig::from_env.
func ConfigFromEnv() FlinkRuntimeConfig {
	return FlinkRuntimeConfig{
		DefaultNamespace:      envOr("FLINK_NAMESPACE", "flink"),
		SQLRunnerImage:        envOr("FLINK_SQL_RUNNER_IMAGE", "ghcr.io/unnamedlab/openfoundry/flink-sql-runner:1.19.1-0.1.0"),
		FlinkVersion:          envOr("FLINK_VERSION", "v1_19"),
		JobManagerURLTemplate: envOr("FLINK_JOBMANAGER_URL_TEMPLATE", "http://{deployment}-rest.{namespace}.svc:8081"),
		MetricsPollIntervalMS: envUint64("FLINK_METRICS_POLL_INTERVAL_MS", 15_000),
		StateBucketURI:        envOr("FLINK_STATE_BUCKET_URI", "s3://openfoundry-iceberg/flink"),
	}
}

// JobManagerURL resolves the JobManager URL for a given deployment.
func (c FlinkRuntimeConfig) JobManagerURL(deployment, namespace string) string {
	url := strings.ReplaceAll(c.JobManagerURLTemplate, "{deployment}", deployment)
	return strings.ReplaceAll(url, "{namespace}", namespace)
}

// EffectiveExactlyOnce mirrors event_streaming::runtime::flink::effective_exactly_once.
//
// Returns true when either the topology asks for exactly-once or any of
// its source streams declares pipeline_consistency = exactly-once. The
// stronger guarantee always wins — the Foundry docs commit to honouring
// the operator's intent on either side.
func EffectiveExactlyOnce(topology *domain.TopologyDefinition, streams []domain.DomainStreamDefinition) bool {
	if strings.EqualFold(topology.ConsistencyGuarantee, "exactly-once") {
		return true
	}
	for _, s := range streams {
		if !containsUUID(topology.SourceStreamIDs, s.ID) {
			continue
		}
		if strings.EqualFold(s.PipelineConsistency, "exactly-once") {
			return true
		}
	}
	return false
}

func envOr(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envUint64(key string, fallback uint64) uint64 {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	n, err := strconv.ParseUint(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}
