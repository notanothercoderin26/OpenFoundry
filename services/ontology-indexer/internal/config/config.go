// Package config resolves ontology-indexer env config.
//
// ontology-indexer is a worker: Kafka in, SearchBackend out. The HTTP
// surface only exposes /healthz + /metrics for ops.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// BackendKind mirrors the Rust enum.
type BackendKind string

const (
	BackendVespa      BackendKind = "vespa"
	BackendOpenSearch BackendKind = "opensearch"
)

// BackendKindFromEnv defaults to Vespa when unset / empty (matches Rust).
func BackendKindFromEnv(v string) BackendKind {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "opensearch":
		return BackendOpenSearch
	default:
		return BackendVespa
	}
}

type Config struct {
	Service struct{ Name, Version string }
	Server  struct {
		Host string
		Port uint16
	}
	BackendKind         BackendKind
	SearchEndpoint      string
	SearchUsername      string
	SearchPassword      string
	SearchBearerToken   string
	SearchAPIKey        string
	KafkaBootstrap      string
	ConsumerGroup       string
	RetryMaxAttempts    int
	RetryInitialBackoff time.Duration
	RetryMaxBackoff     time.Duration
	DLQTopic            string
	MetricsAddr         string
	// ObjectDatabaseURL is the base URL (no trailing slash) for
	// object-database-service. When set, the indexer exposes
	// POST /api/v1/ontology-indexer/reindex which pages through the
	// service to rebuild the search index for a (tenant, object_type)
	// pair. When empty the endpoint returns 503 — see B03 acceptance
	// criterion #3.
	ObjectDatabaseURL string

	// OntologyDefinitionURL is the base URL (no trailing slash) for
	// ontology-definition-service. The indexer queries it at startup
	// to seed the Vespa schema cache so the first
	// `object_type.changed.v1` envelope after restart does not redeploy
	// a package with only the new schema (which would wipe the rest).
	// Empty disables seeding; the indexer keeps running and the cache
	// grows from Kafka events alone.
	OntologyDefinitionURL string

	// OntologyDefinitionBearerToken is the service-account JWT used
	// to call ontology-definition-service. Empty = anonymous (will
	// 401 unless the service-account check is disabled in dev).
	OntologyDefinitionBearerToken string

	// VespaConfigEndpoint is the base URL of the Vespa Config Server
	// (typically port 19071, distinct from the search endpoint on
	// 8080). When set, the indexer wires the MappingRegistrar so
	// `ontology.object_type.changed.v1` envelopes deploy schemas
	// dynamically. Empty = no-op MappingRegistrar; documents still
	// land via the streaming projector but Vespa runs with whatever
	// schema was deployed at bring-up.
	VespaConfigEndpoint string

	// VespaTenant + VespaApplication scope the Config Server deploys.
	// Defaults to "default" for both.
	VespaTenant      string
	VespaApplication string
}

func FromEnv() (*Config, error) {
	cfg := &Config{}
	cfg.Service.Name = "ontology-indexer"
	cfg.Service.Version = defaultStr(os.Getenv("SERVICE_VERSION"), "dev")
	cfg.Server.Host = defaultStr(os.Getenv("HOST"), "0.0.0.0")
	cfg.Server.Port = parseUint16(os.Getenv("PORT"), 50124)
	cfg.BackendKind = BackendKindFromEnv(os.Getenv("SEARCH_BACKEND"))
	cfg.SearchEndpoint = os.Getenv("SEARCH_ENDPOINT")
	cfg.SearchUsername = os.Getenv("SEARCH_USERNAME")
	cfg.SearchPassword = os.Getenv("SEARCH_PASSWORD")
	cfg.SearchBearerToken = os.Getenv("SEARCH_BEARER_TOKEN")
	cfg.SearchAPIKey = os.Getenv("SEARCH_API_KEY")
	cfg.KafkaBootstrap = os.Getenv("KAFKA_BOOTSTRAP_SERVERS")
	cfg.ConsumerGroup = defaultStr(os.Getenv("KAFKA_CONSUMER_GROUP"), "ontology-indexer")
	cfg.RetryMaxAttempts = parseInt(os.Getenv("INDEXER_RETRY_MAX_ATTEMPTS"), 3)
	cfg.RetryInitialBackoff = parseDuration(os.Getenv("INDEXER_RETRY_INITIAL_BACKOFF"), 100*time.Millisecond)
	cfg.RetryMaxBackoff = parseDuration(os.Getenv("INDEXER_RETRY_MAX_BACKOFF"), 2*time.Second)
	cfg.DLQTopic = parseDLQTopic(os.Getenv("INDEXER_DLQ_TOPIC"), "ontology-indexer.dlq.v1")
	cfg.MetricsAddr = defaultStr(os.Getenv("METRICS_ADDR"), "0.0.0.0:9090")
	cfg.ObjectDatabaseURL = strings.TrimRight(strings.TrimSpace(os.Getenv("OBJECT_DATABASE_URL")), "/")
	cfg.OntologyDefinitionURL = strings.TrimRight(strings.TrimSpace(os.Getenv("ONTOLOGY_DEFINITION_URL")), "/")
	cfg.OntologyDefinitionBearerToken = strings.TrimSpace(os.Getenv("ONTOLOGY_DEFINITION_BEARER_TOKEN"))
	cfg.VespaConfigEndpoint = strings.TrimRight(strings.TrimSpace(os.Getenv("VESPA_CONFIG_ENDPOINT")), "/")
	cfg.VespaTenant = defaultStr(strings.TrimSpace(os.Getenv("VESPA_TENANT")), "default")
	cfg.VespaApplication = defaultStr(strings.TrimSpace(os.Getenv("VESPA_APPLICATION")), "default")
	if err := cfg.validateRequiredEnv(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (cfg *Config) validateRequiredEnv() error {
	if strings.TrimSpace(cfg.KafkaBootstrap) == "" {
		return &MissingEnvError{Key: "KAFKA_BOOTSTRAP_SERVERS"}
	}
	if strings.TrimSpace(cfg.SearchEndpoint) == "" {
		return &MissingEnvError{Key: "SEARCH_ENDPOINT"}
	}
	return nil
}

type MissingEnvError struct{ Key string }

func (e *MissingEnvError) Error() string {
	return fmt.Sprintf("required environment variable %s is not set", e.Key)
}

func IsMissingEnv(err error) bool { var me *MissingEnvError; return errors.As(err, &me) }

func defaultStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

func parseUint16(v string, fallback uint16) uint16 {
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseUint(v, 10, 16)
	if err != nil {
		return fallback
	}
	return uint16(n)
}

func parseInt(v string, fallback int) int {
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

func parseDuration(v string, fallback time.Duration) time.Duration {
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}

func parseDLQTopic(v string, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "off", "none", "disabled":
		return ""
	case "":
		return fallback
	default:
		return strings.TrimSpace(v)
	}
}
