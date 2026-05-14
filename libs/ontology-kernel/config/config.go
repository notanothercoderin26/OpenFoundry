// Package config holds the environment-driven configuration consumed
// by every ontology-* binary.
//
// Every field is flat: the table reads scalar env vars by their
// UPPER_SNAKE name. Tests pin each default.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// AppConfig is the env-driven configuration shared by ontology-* binaries.
type AppConfig struct {
	Host                          string
	Port                          uint16
	DatabaseURL                   string
	JWTSecret                     string
	AuditServiceURL               string
	DatasetServiceURL             string
	OntologyServiceURL            string
	PipelineServiceURL            string
	AIServiceURL                  string
	SearchEmbeddingProvider       string
	NotificationServiceURL        string
	NodeRuntimeCommand            string
	ConnectorManagementServiceURL string
}

// Defaults populate optional fields when the corresponding env var is unset.
const (
	DefaultHost                          = "0.0.0.0"
	DefaultPort                          = uint16(50057)
	DefaultAuditServiceURL               = "http://localhost:50070"
	DefaultDatasetServiceURL             = "http://localhost:50079"
	DefaultOntologyServiceURL            = "http://localhost:50057"
	DefaultPipelineServiceURL            = "http://localhost:50081"
	DefaultAIServiceURL                  = "http://localhost:50127"
	DefaultSearchEmbeddingProvider       = "deterministic-hash"
	DefaultNotificationServiceURL        = "http://localhost:50114"
	DefaultNodeRuntimeCommand            = "node"
	DefaultConnectorManagementServiceURL = "http://localhost:50130"
)

// Default returns a zero-environment AppConfig with every defaulted
// field populated and the two required fields (DatabaseURL, JWTSecret)
// left empty. [FromEnv] then layers env values on top.
func Default() AppConfig {
	return AppConfig{
		Host:                          DefaultHost,
		Port:                          DefaultPort,
		AuditServiceURL:               DefaultAuditServiceURL,
		DatasetServiceURL:             DefaultDatasetServiceURL,
		OntologyServiceURL:            DefaultOntologyServiceURL,
		PipelineServiceURL:            DefaultPipelineServiceURL,
		AIServiceURL:                  DefaultAIServiceURL,
		SearchEmbeddingProvider:       DefaultSearchEmbeddingProvider,
		NotificationServiceURL:        DefaultNotificationServiceURL,
		NodeRuntimeCommand:            DefaultNodeRuntimeCommand,
		ConnectorManagementServiceURL: DefaultConnectorManagementServiceURL,
	}
}

// FromEnv loads the configuration from process env vars (UPPER_SNAKE,
// no prefix). Required fields without a default (DatabaseURL, JWTSecret)
// return an error when unset.
func FromEnv() (AppConfig, error) {
	return FromGetenv(os.Getenv)
}

// FromGetenv is the testable inner that takes any `func(key) string`
// resolver. Tests pass a stub map-backed getter.
func FromGetenv(get func(string) string) (AppConfig, error) {
	c := Default()

	pickString := func(key string, dst *string) {
		if v := get(key); v != "" {
			*dst = v
		}
	}
	pickString("HOST", &c.Host)
	pickString("DATABASE_URL", &c.DatabaseURL)
	pickString("JWT_SECRET", &c.JWTSecret)
	pickString("AUDIT_SERVICE_URL", &c.AuditServiceURL)
	pickString("DATASET_SERVICE_URL", &c.DatasetServiceURL)
	pickString("ONTOLOGY_SERVICE_URL", &c.OntologyServiceURL)
	pickString("PIPELINE_SERVICE_URL", &c.PipelineServiceURL)
	pickString("AI_SERVICE_URL", &c.AIServiceURL)
	pickString("SEARCH_EMBEDDING_PROVIDER", &c.SearchEmbeddingProvider)
	pickString("NOTIFICATION_SERVICE_URL", &c.NotificationServiceURL)
	pickString("NODE_RUNTIME_COMMAND", &c.NodeRuntimeCommand)
	pickString("CONNECTOR_MANAGEMENT_SERVICE_URL", &c.ConnectorManagementServiceURL)

	if v := strings.TrimSpace(get("PORT")); v != "" {
		n, err := strconv.ParseUint(v, 10, 16)
		if err != nil {
			return AppConfig{}, fmt.Errorf("PORT: %w", err)
		}
		c.Port = uint16(n)
	}

	if c.DatabaseURL == "" {
		return AppConfig{}, fmt.Errorf("missing required env var: DATABASE_URL")
	}
	if c.JWTSecret == "" {
		return AppConfig{}, fmt.Errorf("missing required env var: JWT_SECRET")
	}
	return c, nil
}
