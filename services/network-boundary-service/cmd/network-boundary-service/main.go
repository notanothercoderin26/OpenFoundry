// Command network-boundary-service is the stub binary that backs the
// `/api/v1/network-boundaries`, `/api/v1/network-boundary` and
// `/api/v1/data-connection/egress-policies` routes fanned out by
// `edge-gateway-service`. Real implementation is pending the S8.6 / B14
// consolidation into `authorization-policy-service` (see ADR-0030); the
// stub exists so the gateway returns 501 to clients instead of 502.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/network-boundary-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/network-boundary-service/internal/server"
)

var version = "dev"

func main() {
	cfgPath := flag.String("config", "services/network-boundary-service/config.yaml", "path to config file")
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

	srv, err := server.New(cfg, metrics, log)
	if err != nil {
		log.Error("server build failed", slog.String("error", err.Error()))
		os.Exit(1)
	}

	if err := srv.Run(ctx); err != nil {
		log.Error("server exited with error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}
