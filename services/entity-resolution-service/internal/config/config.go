// Package config resolves entity-resolution-service env config.
//
// The Rust binary is `fn main(){}` and the canonical implementation
// is the Go port — same pattern as authorization-policy-service.
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

	// ObjectDatabaseURL — when set, the RunJob handler routes
	// jobs with `Sources` through an HTTPObjectTypeLoader against
	// object-database-service. Unset leaves the loader nil so jobs
	// fall back to synthetic fixtures (CI/dev behaviour).
	ObjectDatabaseURL string
	// Tenant — default x-of-tenant header value sent to
	// object-database-service. Per-source bindings can override it.
	Tenant string
	// TelemetryGovernanceURL — when set, RunJob posts a
	// `health-checks` snapshot after every run so Foundry-style
	// Data Health panels light up. Unset wires a NoopHealthCheckPublisher.
	TelemetryGovernanceURL string
}

func FromEnv() (*Config, error) {
	cfg := &Config{}
	cfg.Service.Name = "entity-resolution-service"
	cfg.Service.Version = defaultStr(os.Getenv("SERVICE_VERSION"), "dev")
	cfg.Server.Host = defaultStr(os.Getenv("HOST"), "0.0.0.0")
	cfg.Server.Port = parseUint16(os.Getenv("PORT"), 50058)
	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	cfg.JWTSecret = os.Getenv("JWT_SECRET")
	cfg.ObjectDatabaseURL = os.Getenv("OBJECT_DATABASE_URL")
	cfg.Tenant = defaultStr(os.Getenv("OF_TENANT"), "default")
	cfg.TelemetryGovernanceURL = os.Getenv("TELEMETRY_GOVERNANCE_URL")

	if cfg.DatabaseURL == "" {
		return nil, &MissingEnvError{Key: "DATABASE_URL"}
	}
	if cfg.JWTSecret == "" {
		return nil, &MissingEnvError{Key: "JWT_SECRET"}
	}
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
