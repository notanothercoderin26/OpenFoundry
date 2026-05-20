// Command ontology-indexer hosts the worker that consumes
// `ontology.object.changed.v1` / `ontology.link.changed.v1` /
// `ontology.object_type.changed.v1` and projects ontology objects +
// links into the configured search backend (Vespa / OpenSearch). It
// also deploys per-type Vespa schemas when VESPA_CONFIG_ENDPOINT is
// set (B03 §G5).
//
// Runtime slice: ops HTTP surface (/healthz, /metrics, /status,
// /reindex) plus the Kafka consumer and configured SearchBackend
// projection loop. Startup requires Kafka bootstrap servers and a
// search endpoint so missing infrastructure is surfaced before the
// worker begins consuming.
package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/config"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/reindex"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/runtime"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/schemasync"
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

	// Build the search backend once and share it across the streaming
	// loop and the reindex endpoint. Sharing matters for B03 §G5: the
	// Vespa backend keeps the schema cache in-memory, and the schema
	// registrar deploys must run against the same instance that the
	// streaming loop later writes documents to.
	backend, err := runtime.NewSearchBackend(cfg)
	if err != nil {
		log.Error("search backend init failed", slog.String("error", err.Error()))
		os.Exit(1)
	}

	// Seed the schema cache from ontology-definition-service so the
	// first `object_type.changed.v1` envelope after restart does not
	// redeploy a Vespa package containing only the new schema (which
	// would silently wipe the rest). Best-effort: a failure here is
	// logged and execution continues with an empty cache — the
	// operator can replay the Kafka topic from earliest to rehydrate.
	if cfg.OntologyDefinitionURL != "" {
		seedSchemas(ctx, cfg, backend, log)
	}

	// The reindex endpoints share the live tracker + search backend with
	// the Kafka projector. Only wired when the operator supplies
	// OBJECT_DATABASE_URL — otherwise the indexer keeps running as a
	// streaming-only worker and POST /reindex returns 503.
	reindexDeps := &server.ReindexDeps{Tracker: tracker, Log: log, PageSize: 500}
	if cfg.ObjectDatabaseURL != "" {
		reindexDeps.Source = reindex.NewHTTPSource(cfg.ObjectDatabaseURL)
		reindexDeps.Backend = backend
		reindexDeps.Registry = reindex.NewRegistry()
	}

	srv := server.New(cfg, metrics, tracker, reindexDeps)

	runtimeErr := make(chan error, 1)
	go func() {
		runtimeErr <- runtime.RunWithBackendAndTracker(ctx, cfg, log, backend, tracker)
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

// seedSchemas hydrates the backend's MappingRegistrar cache from
// ontology-definition-service. Best-effort: failures (network, auth,
// unconfigured backend) are logged and execution continues. A 5s
// deadline is applied so a slow definition service does not block
// startup indefinitely.
func seedSchemas(ctx context.Context, cfg *config.Config, backend searchabstraction.SearchBackend, log *slog.Logger) {
	sink, ok := backend.(schemasync.SeedSink)
	if !ok {
		log.Info("schemasync: backend does not implement SeedSink; skipping seed")
		return
	}
	src := schemasync.NewHTTPSeedSource(cfg.OntologyDefinitionURL)
	src.BearerToken = cfg.OntologyDefinitionBearerToken
	seedCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	n, err := schemasync.SeedMappingsFrom(seedCtx, src, sink)
	if err != nil {
		log.Warn("schemasync: seed failed; continuing with empty cache",
			slog.String("url", cfg.OntologyDefinitionURL),
			slog.String("error", err.Error()))
		return
	}
	log.Info("schemasync: seeded schema cache",
		slog.Int("count", n),
		slog.String("url", cfg.OntologyDefinitionURL))
}
