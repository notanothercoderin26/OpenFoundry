// Package server hosts the federation-product-exchange-service HTTP surface.
// It exposes public health/metrics endpoints plus the first marketplace
// listings and install planning slice under /api/v1/marketplace when handlers are wired.
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
	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/marketplace"
	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/productdistribution"
	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/products"
)

func New(cfg *config.Config, jwt *authmw.JWTConfig, h *marketplace.Handlers, d *productdistribution.Handlers, p *products.Handlers, m *observability.Metrics, probes ...capabilities.DependencyProbe) *http.Server {
	r := buildRouter(cfg, jwt, h, d, p, m, probes...)
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	return &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}
}

func BuildRouter(cfg *config.Config, jwt *authmw.JWTConfig, h *marketplace.Handlers, d *productdistribution.Handlers, p *products.Handlers, m *observability.Metrics, probes ...capabilities.DependencyProbe) http.Handler {
	return buildRouter(cfg, jwt, h, d, p, m, probes...)
}

func buildRouter(cfg *config.Config, jwt *authmw.JWTConfig, h *marketplace.Handlers, d *productdistribution.Handlers, p *products.Handlers, m *observability.Metrics, probes ...capabilities.DependencyProbe) chi.Router {
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer, chimw.Compress(5))
	r.Use(chimw.Timeout(30 * time.Second))

	healthHandler := func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	}
	r.Get("/healthz", healthHandler)
	r.Get("/health", healthHandler)
	if m != nil {
		r.Method(http.MethodGet, "/metrics", m.Handler())
	}

	// Capability registry — see docs/agent-automation/AGENT-CAPABILITIES-ROADMAP.md (M1.1).
	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	if h != nil {
		r.Route("/api/v1/marketplace", func(api chi.Router) {
			if jwt != nil {
				api.Use(authmw.Middleware(jwt))
			}
			api.Get("/listings", h.ListListings)
			api.Post("/listings", h.CreateListing)
			api.Get("/listings/slug/{slug}", h.GetListing)
			api.Get("/listings/{ref}", h.GetListing)
			api.Patch("/listings/{id}", h.UpdateListing)
			api.Post("/listings/{id}/versions", h.PublishVersion)
			api.Get("/installs", h.ListInstalls)
			api.Post("/installs", h.CreateInstall)
			api.Post("/dependency-plan", h.PreviewDependencyPlan)
		})

		r.Route("/v1/marketplace", func(api chi.Router) {
			if jwt != nil {
				api.Use(authmw.Middleware(jwt))
			}
			api.Get("/overview", h.GetOverview)
			api.Get("/categories", h.ListCategories)
			api.Get("/listings", h.ListListingsEnvelope)
			api.Post("/listings", h.CreateListing)
			api.Get("/listings/{id}", h.GetListing)
			api.Patch("/listings/{id}", h.UpdateListing)
			api.Get("/listings/{id}/versions", h.ListVersions)
			api.Post("/listings/{id}/versions", h.PublishVersion)
			api.Post("/listings/{id}/actions", h.IncludeActionInProduct)
			api.Get("/search", h.SearchListings)
			api.Get("/installs", h.ListInstallsEnvelope)
			api.Post("/installs", h.CreateInstall)
			api.Post("/products/from-dataset/{rid}", h.CreateDatasetProduct)
			api.Get("/products/{id}", h.GetDatasetProduct)
			api.Post("/products/{id}/install", h.InstallDatasetProduct)
			api.Post("/products/{id}/schedules", h.AddScheduleManifest)
			api.Post("/products/{id}/install:schedules", h.MaterialiseInstallSchedules)
		})

		r.Route("/v1/products", func(api chi.Router) {
			if jwt != nil {
				api.Use(authmw.Middleware(jwt))
			}
			api.Post("/from-dataset/{rid}", h.CreateDatasetProduct)
			api.Get("/{id}", h.GetDatasetProduct)
			api.Post("/{id}/install", h.InstallDatasetProduct)
			api.Post("/{id}/schedules", h.AddScheduleManifest)
			api.Post("/{id}/install:schedules", h.MaterialiseInstallSchedules)
		})
	}

	if p != nil {
		r.Route("/api/v1/marketplace/products", func(api chi.Router) {
			if jwt != nil {
				api.Use(authmw.Middleware(jwt))
			}
			api.Get("/", p.ListProducts)
			api.Post("/", p.CreateProduct)
			api.Get("/installations", p.ListInstallations)
			api.Post("/installations/{rid}/uninstall", p.Uninstall)
			api.Get("/{rid}", p.GetProduct)
			api.Post("/{rid}/versions", p.PublishVersion)
			api.Post("/{rid}/install", p.InstallProduct)
		})
	}

	if d != nil {
		r.Route("/api/v1/product-distribution", func(api chi.Router) {
			if jwt != nil {
				api.Use(authmw.Middleware(jwt))
			}
			api.Get("/peers", d.ListPeers)
			api.Post("/peers", d.CreatePeer)
			api.Get("/peers/{id}", d.GetPeer)
			api.Patch("/peers/{id}", d.UpdatePeer)
			api.Delete("/peers/{id}", d.DeletePeer)
			api.Get("/contracts", d.ListContracts)
			api.Post("/contracts", d.CreateContract)
			api.Patch("/contracts/{id}", d.UpdateContract)
			api.Get("/shares", d.ListShareManifests)
			api.Post("/shares", d.CreateShareManifest)
			api.Get("/shares/{id}", d.GetShareManifest)
			api.Get("/sync-statuses", d.ListSyncStatuses)
			api.Patch("/shares/{id}/sync-status", d.UpdateSyncStatus)
			api.Post("/queries", d.ConsumeQuery)
		})
	}

	if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
		IDPrefix:  "federation",
		AuthPaths: []string{"/api/v1/marketplace", "/v1/marketplace", "/v1/products", "/api/v1/product-distribution", "/api/v1/marketplace/products"},
		Tags:      []string{"marketplace"},
	}); err != nil {
		panic("federation-product-exchange-service: capability ingest failed: " + err.Error())
	}

	return r
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
