package config

import (
	"errors"
	"testing"
)

func TestFromEnvResolvesIcebergTableWriterURL(t *testing.T) {
	t.Setenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
	t.Setenv("ICEBERG_CATALOG_URL", "http://lakekeeper:8181")
	t.Setenv("AI_SINK_TABLE_WRITER_URL", "http://ai-table-writer:8080")
	t.Setenv("ICEBERG_WAREHOUSE", "wh")
	t.Setenv("OPENFOUNDRY_JWT_SECRET", "test-secret")

	cfg, err := FromEnv()
	if err != nil {
		t.Fatalf("FromEnv() error = %v", err)
	}
	if cfg.CatalogURL != "http://lakekeeper:8181" {
		t.Fatalf("CatalogURL = %q", cfg.CatalogURL)
	}
	if cfg.TableWriterURL != "http://ai-table-writer:8080" {
		t.Fatalf("TableWriterURL = %q", cfg.TableWriterURL)
	}
	if cfg.Warehouse != "wh" {
		t.Fatalf("Warehouse = %q", cfg.Warehouse)
	}
}

func TestFromEnvFallsBackToCatalogURLForCoLocatedTableWriter(t *testing.T) {
	t.Setenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
	t.Setenv("ICEBERG_CATALOG_URL", "http://co-located:8181")
	t.Setenv("OPENFOUNDRY_JWT_SECRET", "test-secret")

	cfg, err := FromEnv()
	if err != nil {
		t.Fatalf("FromEnv() error = %v", err)
	}
	if cfg.TableWriterURL != cfg.CatalogURL {
		t.Fatalf("TableWriterURL = %q, want CatalogURL %q", cfg.TableWriterURL, cfg.CatalogURL)
	}
}

func TestFromEnvJSONLModeDoesNotRequireIcebergCatalog(t *testing.T) {
	t.Setenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
	t.Setenv("AI_SINK_JSONL_DIR", t.TempDir())
	t.Setenv("OPENFOUNDRY_JWT_SECRET", "test-secret")

	cfg, err := FromEnv()
	if err != nil {
		t.Fatalf("FromEnv() error = %v", err)
	}
	if cfg.JSONLWriterDir == "" {
		t.Fatalf("JSONLWriterDir is empty")
	}
	if cfg.CatalogURL != "" || cfg.TableWriterURL != "" {
		t.Fatalf("Iceberg URLs = catalog %q table-writer %q", cfg.CatalogURL, cfg.TableWriterURL)
	}
}

func TestFromEnvRequiresIcebergCatalogForIcebergMode(t *testing.T) {
	t.Setenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

	_, err := FromEnv()
	var missing *MissingEnvError
	if !errors.As(err, &missing) || missing.Key != "ICEBERG_CATALOG_URL" {
		t.Fatalf("FromEnv() error = %v, want missing ICEBERG_CATALOG_URL", err)
	}
}

// FromEnv must refuse to boot without OPENFOUNDRY_JWT_SECRET so the
// /api/v1/ai/* write-through POST can never be mounted unauthenticated.
func TestFromEnvRequiresJWTSecret(t *testing.T) {
	t.Setenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
	t.Setenv("ICEBERG_CATALOG_URL", "http://lakekeeper:8181")
	t.Setenv("OPENFOUNDRY_JWT_SECRET", "")
	t.Setenv("JWT_SECRET", "")

	_, err := FromEnv()
	var missing *MissingEnvError
	if !errors.As(err, &missing) || missing.Key != "OPENFOUNDRY_JWT_SECRET" {
		t.Fatalf("FromEnv() error = %v, want missing OPENFOUNDRY_JWT_SECRET", err)
	}
}
