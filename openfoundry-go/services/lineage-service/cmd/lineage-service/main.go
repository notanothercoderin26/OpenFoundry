// Command lineage-service is the OpenLineage events sink + lineage
// graph query service.
//
// Two runtime modes (selected via LINEAGE_RUNTIME_MODE):
//   - kafka_to_iceberg: Kafka `lineage.events.v1` → Iceberg of_lineage.*
//   - http_health: minimal /health endpoint for service-discovery
//     environments where the query surface is disabled
//
// Foundation slice ships:
//   - HTTP-health mode complete (matches Rust /health = "ok").
//   - kafkatoiceberg + icebergschema constants pinned (consumer
//     group, source topic, namespace, table names, field IDs,
//     partition + sort policy) so the follow-up runtime slice does
//     not break the on-disk format.
//   - Migrations copied verbatim.
//
// kafka_to_iceberg mode boots into HTTP-health for now and emits a
// warning — the runtime slice (Kafka subscriber + Iceberg writer +
// libs/iceberg-go integration) lands separately.
package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/repo"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/server"
)

var version = "dev"

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	cfg, err := config.FromEnv()
	if err != nil {
		slog.Error("config load failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	if cfg.Service.Version == "dev" {
		cfg.Service.Version = version
	}

	log := observability.InitLogging(cfg.Service.Name, cfg.Service.Version)
	shutdownTracing, err := observability.InitTracing(ctx, cfg.Service.Name, cfg.Service.Version)
	if err != nil {
		log.Error("tracing init failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer func() { _ = shutdownTracing(context.Background()) }()

	mode := config.RuntimeModeFromEnv()
	log.Info("runtime mode resolved", slog.String("mode", string(mode)))
	if mode == config.ModeKafkaToIceberg {
		log.Warn("kafka_to_iceberg runtime is deferred to a follow-up slice; falling back to HTTP-health for now")
	}

	// Migrations only run when DATABASE_URL is provided. In
	// HTTP-health mode the binary still boots without a database.
	if cfg.DatabaseURL != "" {
		pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Error("pgx pool failed", slog.String("error", err.Error()))
			os.Exit(1)
		}
		defer pool.Close()
		if err := repo.Migrate(ctx, pool); err != nil {
			log.Error("migrations failed", slog.String("error", err.Error()))
			os.Exit(1)
		}
	} else {
		log.Warn("DATABASE_URL unset — migrations skipped (lineage query surface lands with the runtime slice)")
	}

	metrics := observability.NewMetrics()
	srv := server.New(cfg, metrics)
	if err := server.Run(ctx, srv, log); err != nil && !errors.Is(err, context.Canceled) {
		log.Error("server exited with error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}
