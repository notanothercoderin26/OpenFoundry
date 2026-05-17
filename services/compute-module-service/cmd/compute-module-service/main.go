// Command compute-module-service runs the Compute Modules CRUD and
// project-placement API described in
// docs/migration/foundry-compute-modules-1to1-checklist.md (CM.1).
//
// The entrypoint mirrors docs/templates/service-skeleton: config → observability →
// server. Persistence is in-memory by default; a Postgres
// implementation is wired through internal/repo when DATABASE_URL is
// set.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/repo"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/server"
)

// version is injected at build time via -ldflags "-X main.version=...".
var version = "dev"

func main() {
	cfgPath := flag.String("config", "services/compute-module-service/config.yaml", "path to config file")
	flag.Parse()

	envOverride := os.Getenv("CONFIG_FILE")
	cfg, err := config.Load(*cfgPath, envOverride)
	if err != nil {
		slog.Error("config load failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	if cfg.Service.Version == "" {
		cfg.Service.Version = version
	}

	log := observability.InitLogging(cfg.Service.Name, cfg.Service.Version)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	shutdownTracing, err := observability.InitTracing(ctx, cfg.Service.Name, cfg.Service.Version)
	if err != nil {
		log.Error("tracing init failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer func() {
		_ = shutdownTracing(context.Background())
	}()

	metrics := observability.NewMetrics()

	store := repo.NewMemoryRepository()

	srv, err := server.New(cfg, store, metrics, log)
	if err != nil {
		log.Error("server build failed", slog.String("error", err.Error()))
		os.Exit(1)
	}

	if err := srv.Run(ctx); err != nil {
		log.Error("server exited with error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}
