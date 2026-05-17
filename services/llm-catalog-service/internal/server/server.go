// Package server wires the chi router for llm-catalog-service.
//
// Routing tree:
//
//	/healthz                           — health probe
//	/metrics                           — Prometheus
//	/api/v1/kernel-defaults            — proof-point (libs/ai-kernel-go DTOs)
//	/api/v1/llm/models                 — admin CRUD (RequireAdmin)
//	/api/v1/llm/invoke                 — authenticated invocation
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

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/capabilities"
	"github.com/openfoundry/openfoundry-go/libs/core-models/health"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/llm-catalog-service/internal/handlers"
)

// Deps groups the dependencies injected into the router. Tests build it
// with the in-memory repo + an httptest provider; main.go builds it
// from the resolved config.
type Deps struct {
	Catalog *handlers.Catalog
	Invoke  *handlers.Invoke
	JWT     *authmw.JWTConfig
}

// New constructs the production http.Server.
func New(cfg *config.Config, deps Deps, m *observability.Metrics, probes ...capabilities.DependencyProbe) *http.Server {
	r := buildRouter(cfg, deps, m, probes...)
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	return &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}
}

// BuildRouter is the test-facing builder.
func BuildRouter(cfg *config.Config, deps Deps, m *observability.Metrics, probes ...capabilities.DependencyProbe) http.Handler {
	return buildRouter(cfg, deps, m, probes...)
}

func buildRouter(cfg *config.Config, deps Deps, m *observability.Metrics, probes ...capabilities.DependencyProbe) chi.Router {
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer)
	r.Use(chimw.Timeout(120 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	r.Get("/api/v1/kernel-defaults", writeKernelDefaults)
	if m != nil {
		r.Method(http.MethodGet, "/metrics", m.Handler())
	}

	// Capability registry — see docs/agent-automation/AGENT-CAPABILITIES-ROADMAP.md (M1.1).
	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	if deps.Catalog != nil || deps.Invoke != nil {
		r.Route("/api/v1/llm", func(api chi.Router) {
			api.Use(authmw.Middleware(deps.JWT))

			if deps.Catalog != nil {
				api.Group(func(adm chi.Router) {
					adm.Use(authmw.RequireAdmin())
					adm.Post("/models", deps.Catalog.RegisterModel)
					adm.Get("/models", deps.Catalog.ListModels)
					adm.Get("/models/{rid}", deps.Catalog.GetModel)
					adm.Post("/models/{rid}/enable", deps.Catalog.EnableModel)
					adm.Post("/models/{rid}/disable", deps.Catalog.DisableModel)
				})
			}

			if deps.Invoke != nil {
				api.With(handlers.CaptureRawBody()).
					Post("/invoke", deps.Invoke.InvokeModel)
			}
		})
	}

	if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
		IDPrefix:  "llm-catalog",
		AuthPaths: []string{"/api/v1/llm"},
		Tags:      []string{"ai"},
	}); err != nil {
		panic("llm-catalog-service: capability ingest failed: " + err.Error())
	}

	return r
}

// Run starts the configured server and shuts it down on ctx cancellation.
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
