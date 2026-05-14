// Package server wires the HTTP router and lifecycle for
// compute-module-service. Matches the shape of services/template so
// platform tooling (k8s probes, capability scrapers, OTel pipelines)
// is uniform across the Go service fleet.
package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/capabilities"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/handler"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/repo"
)

// Server bundles the lifecycle of the HTTP listener.
type Server struct {
	httpServer *http.Server
	cfg        *config.Config
	log        *slog.Logger
}

// New builds a Server with all middleware, capabilities, and Compute
// Module CRUD routes mounted.
func New(cfg *config.Config, store repo.Repository, metrics *observability.Metrics, log *slog.Logger, probes ...capabilities.DependencyProbe) (*Server, error) {
	jwtCfg := authmw.NewJWTConfig(cfg.JWT.Secret).
		WithIssuer(cfg.JWT.Issuer).
		WithAudience(cfg.JWT.Audience)

	r := BuildRouter(cfg, store, metrics, jwtCfg, probes...)

	s := &Server{
		cfg: cfg,
		log: log,
		httpServer: &http.Server{
			Addr:              cfg.Server.Addr,
			Handler:           r,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}
	return s, nil
}

// BuildRouter assembles the chi router with middleware, capability
// registry, and Compute Module routes. Exposed as a top-level helper
// so handler tests can exercise the same routing logic via
// httptest.NewServer.
func BuildRouter(cfg *config.Config, store repo.Repository, metrics *observability.Metrics, jwtCfg *authmw.JWTConfig, probes ...capabilities.DependencyProbe) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Compress(5))
	r.Use(chimw.Timeout(30 * time.Second))

	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)

	// Public endpoints.
	r.Get("/healthz", handler.Health(cfg.Service.Name, cfg.Service.Version))
	if metrics != nil {
		r.Method(http.MethodGet, "/metrics", metrics.Handler())
	}
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	state := &handler.State{Repo: store}

	api := r.With(authmw.Middleware(jwtCfg))
	mountModuleRoutes(api, caps, state)
	return r
}

// Run blocks until the listener returns or `ctx` is cancelled.
func (s *Server) Run(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() {
		s.log.Info("listening", slog.String("addr", s.cfg.Server.Addr))
		if err := s.httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		return s.shutdown()
	case err := <-errCh:
		return err
	}
}

func (s *Server) shutdown() error {
	timeout := 15 * time.Second
	if d, err := time.ParseDuration(s.cfg.Server.ShutdownTimeout); err == nil {
		timeout = d
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	s.log.Info("shutting down")
	return s.httpServer.Shutdown(ctx)
}

func mountModuleRoutes(r chi.Router, caps *capabilities.Registry, state *handler.State) {
	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.create",
		Method:       http.MethodPost,
		Path:         "/api/v1/compute-modules",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Create a Compute Module with function- or pipeline-mode selection.",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.Create))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.list",
		Method:       http.MethodGet,
		Path:         "/api/v1/compute-modules",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "List Compute Modules filtered by project/folder/execution mode/state.",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.List))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.get",
		Method:       http.MethodGet,
		Path:         "/api/v1/compute-modules/{id}",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Fetch a single Compute Module by id (active or archived).",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.Get))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.update",
		Method:       http.MethodPatch,
		Path:         "/api/v1/compute-modules/{id}",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Update Compute Module metadata (name, description, labels).",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.UpdateMetadata))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.move",
		Method:       http.MethodPost,
		Path:         "/api/v1/compute-modules/{id}/move",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Move a Compute Module to a new project/folder.",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.Move))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.duplicate",
		Method:       http.MethodPost,
		Path:         "/api/v1/compute-modules/{id}/duplicate",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Duplicate a Compute Module's metadata to a new active resource.",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.Duplicate))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.archive",
		Method:       http.MethodPost,
		Path:         "/api/v1/compute-modules/{id}/archive",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Archive a Compute Module (soft delete).",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.Archive))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.restore",
		Method:       http.MethodPost,
		Path:         "/api/v1/compute-modules/{id}/restore",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Restore an archived Compute Module to active state.",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.Restore))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.delete",
		Method:       http.MethodDelete,
		Path:         "/api/v1/compute-modules/{id}",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Hard-delete a Compute Module record.",
		Tags:         []string{"compute-modules"},
	}, http.HandlerFunc(state.Delete))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.execution_mode.get",
		Method:       http.MethodGet,
		Path:         "/api/v1/compute-modules/{id}/execution-mode",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Return execution mode and UI affordances for a Compute Module.",
		Tags:         []string{"compute-modules", "execution-mode"},
	}, http.HandlerFunc(state.GetExecutionMode))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.pipeline_io.set",
		Method:       http.MethodPut,
		Path:         "/api/v1/compute-modules/{id}/pipeline-io",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Set pipeline-mode I/O config (pipeline execution mode only).",
		Tags:         []string{"compute-modules", "pipeline-mode"},
	}, http.HandlerFunc(state.SetPipelineIOConfig))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.pipeline_io.clear",
		Method:       http.MethodDelete,
		Path:         "/api/v1/compute-modules/{id}/pipeline-io",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Clear pipeline-mode I/O config (pipeline execution mode only).",
		Tags:         []string{"compute-modules", "pipeline-mode"},
	}, http.HandlerFunc(state.ClearPipelineIOConfig))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.functions.query",
		Method:       http.MethodPost,
		Path:         "/api/v1/compute-modules/{id}/functions/query",
		Stable:       false,
		RequiresAuth: true,
		Summary:      "Query a Compute Module function (function execution mode only; full dispatcher tracked by CM.6/CM.8).",
		Tags:         []string{"compute-modules", "function-mode"},
	}, http.HandlerFunc(state.QueryFunction))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.container_image.set",
		Method:       http.MethodPut,
		Path:         "/api/v1/compute-modules/{id}/container-image",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Set the container image reference, running compatibility validation.",
		Tags:         []string{"compute-modules", "container-image"},
	}, http.HandlerFunc(state.SetContainerImage))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.container_image.get",
		Method:       http.MethodGet,
		Path:         "/api/v1/compute-modules/{id}/container-image",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Fetch the container image reference and stored compatibility findings.",
		Tags:         []string{"compute-modules", "container-image"},
	}, http.HandlerFunc(state.GetContainerImage))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.container_image.clear",
		Method:       http.MethodDelete,
		Path:         "/api/v1/compute-modules/{id}/container-image",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Clear the container image reference.",
		Tags:         []string{"compute-modules", "container-image"},
	}, http.HandlerFunc(state.ClearContainerImage))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.container_image.validate",
		Method:       http.MethodPost,
		Path:         "/api/v1/compute-modules/container-image/validate",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Dry-run the container-image compatibility policy without persisting.",
		Tags:         []string{"compute-modules", "container-image"},
	}, http.HandlerFunc(state.ValidateContainerImage))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.runtime.set",
		Method:       http.MethodPut,
		Path:         "/api/v1/compute-modules/{id}/runtime",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Set the single-container runtime config (command/args/env/ports/resources/logging/health/role/secret bindings); secret-like env values are redacted.",
		Tags:         []string{"compute-modules", "runtime"},
	}, http.HandlerFunc(state.SetRuntimeConfig))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.runtime.get",
		Method:       http.MethodGet,
		Path:         "/api/v1/compute-modules/{id}/runtime",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Fetch the runtime configuration and stored policy findings.",
		Tags:         []string{"compute-modules", "runtime"},
	}, http.HandlerFunc(state.GetRuntimeConfig))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.modules.runtime.clear",
		Method:       http.MethodDelete,
		Path:         "/api/v1/compute-modules/{id}/runtime",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Clear the runtime configuration from the module.",
		Tags:         []string{"compute-modules", "runtime"},
	}, http.HandlerFunc(state.ClearRuntimeConfig))

	caps.MustRegister(r, capabilities.Capability{
		ID:           "compute-module.runtime.validate",
		Method:       http.MethodPost,
		Path:         "/api/v1/compute-modules/runtime/validate",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Dry-run the runtime policy (validation + secret-value redaction) without persisting.",
		Tags:         []string{"compute-modules", "runtime"},
	}, http.HandlerFunc(state.ValidateRuntimeConfig))
}
