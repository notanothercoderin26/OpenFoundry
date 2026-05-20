// Package server hosts the HTTP surface for ontology-indexer.
//
// ontology-indexer is primarily a Kafka worker. The HTTP server exposes
// /healthz + /metrics for probes / Prometheus, plus a read-only
// /api/v1/ontology-indexer/status surface so the Ontology Manager UI can
// answer "is type X indexed yet?" without hitting the search backend
// directly (B03 §G4).
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/openfoundry/openfoundry-go/libs/core-models/health"
	"github.com/openfoundry/openfoundry-go/libs/capabilities"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/config"
	"github.com/openfoundry/openfoundry-go/services/ontology-indexer/internal/status"
)

func New(cfg *config.Config, m *observability.Metrics, tracker *status.Tracker, probes ...capabilities.DependencyProbe) *http.Server {
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer)
	r.Use(chimw.Timeout(15 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	r.Method(http.MethodGet, "/metrics", m.Handler())

	if tracker != nil {
		r.Get("/api/v1/ontology-indexer/status", newStatusHandler(tracker))
	}

	// Capability registry — see docs/agent-automation/AGENT-CAPABILITIES-ROADMAP.md (M1.1).
	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
		IDPrefix:  "ontology-indexer",
		AuthPaths: nil,
		Tags:      []string{"ontology"},
	}); err != nil {
		panic("ontology-indexer: capability ingest failed: " + err.Error())
	}

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	return &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}
}

func Run(ctx context.Context, srv *http.Server, log *slog.Logger) error {
	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", slog.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		log.Info("shutting down")
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}
