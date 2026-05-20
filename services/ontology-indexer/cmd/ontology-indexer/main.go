// Command ontology-indexer hosts the worker that consumes
// `ontology.object.changed.v1` / `ontology.link.changed.v1` and
// projects ontology objects + links into the configured search
// backend (Vespa / OpenSearch).
//
// Runtime slice: ops HTTP surface (/healthz, /metrics) plus the
// Kafka consumer and configured SearchBackend projection loop. Startup
// requires Kafka bootstrap servers and a search endpoint so missing
// infrastructure is surfaced before the worker begins consuming.
package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/config"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/reindex"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/runtime"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/server"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/status"
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

	metrics := observability.NewMetrics()
	tracker := status.NewTracker()

	// The reindex endpoints share the live tracker + search backend with
	// the Kafka projector. They are only wired when the operator supplies
	// OBJECT_DATABASE_URL — otherwise the indexer keeps running as a
	// streaming-only worker and POST /reindex returns 503.
	reindexDeps := &server.ReindexDeps{Tracker: tracker, Log: log, PageSize: 500}
	if cfg.ObjectDatabaseURL != "" {
		backend, err := runtime.NewSearchBackend(cfg)
		if err != nil {
			log.Error("reindex search backend init failed", slog.String("error", err.Error()))
			os.Exit(1)
		}
		reindexDeps.Source = reindex.NewHTTPSource(cfg.ObjectDatabaseURL)
		reindexDeps.Backend = backend
		reindexDeps.Registry = reindex.NewRegistry()
	}

	srv := server.New(cfg, metrics, tracker, reindexDeps)

	runtimeErr := make(chan error, 1)
	go func() {
		runtimeErr <- runtime.RunWithStatusTracker(ctx, cfg, log, tracker)
	}()

	if err := server.Run(ctx, srv, log); err != nil && !errors.Is(err, context.Canceled) {
		log.Error("server exited with error", slog.String("error", err.Error()))
		os.Exit(1)
	}

	if err := <-runtimeErr; err != nil && !errors.Is(err, context.Canceled) {
		log.Error("runtime exited with error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}
