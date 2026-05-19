// Package server wires the chi router for vertex-service.
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
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/handlers"
)

func New(cfg *config.Config, jwt *authmw.JWTConfig, h *handlers.Handlers, m *observability.Metrics, probes ...capabilities.DependencyProbe) *http.Server {
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer, chimw.Compress(5))
	r.Use(chimw.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	r.Method(http.MethodGet, "/metrics", m.Handler())

	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	mount := func(api chi.Router) {
		api.Use(authmw.Middleware(jwt))

		// Graphs ----------------------------------------------------
		api.Get("/graphs", h.ListGraphs)
		api.Post("/graphs", h.CreateGraph)
		api.Get("/graphs/{id}", h.GetGraph)
		api.Patch("/graphs/{id}", h.UpdateGraph)
		api.Delete("/graphs/{id}", h.DeleteGraph)
		api.Post("/graphs/{id}/fork", h.ForkGraph)

		// Graph versions --------------------------------------------
		api.Post("/graphs/{id}/versions", h.CreateGraphVersion)
		api.Get("/graphs/{id}/versions", h.ListGraphVersions)
		api.Get("/graphs/{id}/versions/{version}", h.GetGraphVersion)
		api.Post("/graphs/{id}/versions/{version}/revert", h.RevertGraphVersion)
		api.Post("/graphs/{id}/versioning", h.SetVersioningEnabled)

		// Grants / ACL ----------------------------------------------
		api.Get("/graphs/{id}/grants", h.ListGrants)
		api.Put("/graphs/{id}/grants", h.PutGrant)
		api.Delete("/graphs/{id}/grants/{grantId}", h.DeleteGrant)

		// Link sharing ----------------------------------------------
		api.Get("/graphs/{id}/link-share", h.GetLinkShare)
		api.Put("/graphs/{id}/link-share", h.PutLinkShare)
		api.Get("/shared/{token}", h.ResolveShared)

		// Annotations -----------------------------------------------
		api.Get("/graphs/{id}/annotations", h.ListAnnotations)
		api.Post("/graphs/{id}/annotations", h.CreateAnnotation)
		api.Patch("/graphs/{id}/annotations/{annotationId}", h.UpdateAnnotation)
		api.Delete("/graphs/{id}/annotations/{annotationId}", h.DeleteAnnotation)

		// Scenarios --------------------------------------------------
		api.Get("/graphs/{id}/scenarios", h.ListScenarios)
		api.Post("/graphs/{id}/scenarios", h.CreateScenario)
		api.Get("/graphs/{id}/scenarios/{scenarioId}", h.GetScenario)
		api.Patch("/graphs/{id}/scenarios/{scenarioId}", h.UpdateScenario)
		api.Delete("/graphs/{id}/scenarios/{scenarioId}", h.DeleteScenario)
		api.Post("/graphs/{id}/scenarios/{scenarioId}/diff", h.DiffScenario)
		api.Post("/graphs/{id}/scenarios/{scenarioId}/promote", h.PromoteScenario)

		// Search Arounds (saved resources) --------------------------
		api.Get("/search-arounds", h.ListSearchArounds)
		api.Post("/search-arounds", h.CreateSearchAround)
		api.Get("/search-arounds/{id}", h.GetSearchAround)
		api.Patch("/search-arounds/{id}", h.UpdateSearchAround)
		api.Delete("/search-arounds/{id}", h.DeleteSearchAround)

		// Derived property bindings ---------------------------------
		api.Get("/derived-property-bindings", h.ListDerivedPropertyBindings)
		api.Post("/derived-property-bindings", h.CreateDerivedPropertyBinding)
		api.Delete("/derived-property-bindings/{id}", h.DeleteDerivedPropertyBinding)

		// Graph templates --------------------------------------------
		api.Get("/graph-templates", h.ListGraphTemplates)
		api.Post("/graph-templates", h.CreateGraphTemplate)
		api.Get("/graph-templates/{id}", h.GetGraphTemplate)
		api.Patch("/graph-templates/{id}", h.UpdateGraphTemplate)
		api.Delete("/graph-templates/{id}", h.DeleteGraphTemplate)
		api.Post("/graph-templates/{id}/instantiate", h.InstantiateGraphTemplate)
	}

	r.Route("/api/v1/vertex", mount)

	if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
		IDPrefix:  "vertex",
		AuthPaths: []string{"/api/v1/vertex"},
		Tags:      []string{"vertex", "graph"},
	}); err != nil {
		panic("vertex-service: capability ingest failed: " + err.Error())
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
