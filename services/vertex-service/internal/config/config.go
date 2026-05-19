// Package config resolves vertex-service env config.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Service struct{ Name, Version string }
	Server  struct {
		Host string
		Port uint16
	}
	DatabaseURL string
	JWTSecret   string
	PGSchema    string
	NATSURL     string
	MetricsAddr string

	// Upstream URLs vertex-service calls into.
	OntologyQueryURL    string
	OntologyActionsURL  string
	FunctionRuntimeURL  string
}

func FromEnv() (*Config, error) {
	cfg := &Config{}
	cfg.Service.Name = "vertex-service"
	cfg.Service.Version = defaultStr(os.Getenv("SERVICE_VERSION"), "dev")
	cfg.Server.Host = defaultStr(os.Getenv("HOST"), "0.0.0.0")
	cfg.Server.Port = parseUint16(os.Getenv("PORT"), 50180)
	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	if cfg.DatabaseURL == "" {
		return nil, &MissingEnvError{Key: "DATABASE_URL"}
	}
	cfg.JWTSecret = defaultStr(os.Getenv("OPENFOUNDRY_JWT_SECRET"), os.Getenv("JWT_SECRET"))
	if cfg.JWTSecret == "" {
		return nil, &MissingEnvError{Key: "JWT_SECRET"}
	}
	cfg.PGSchema = defaultStr(os.Getenv("PG_SCHEMA"), "vertex")
	cfg.NATSURL = os.Getenv("NATS_URL")
	cfg.MetricsAddr = defaultStr(os.Getenv("METRICS_ADDR"), "0.0.0.0:9090")
	cfg.OntologyQueryURL = defaultStr(os.Getenv("ONTOLOGY_QUERY_URL"), "http://ontology-query-service:50104")
	cfg.OntologyActionsURL = defaultStr(os.Getenv("ONTOLOGY_ACTIONS_URL"), "http://ontology-actions-service:50105")
	cfg.FunctionRuntimeURL = defaultStr(os.Getenv("FUNCTION_RUNTIME_URL"), "http://function-runtime-service:50113")
	return cfg, nil
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
