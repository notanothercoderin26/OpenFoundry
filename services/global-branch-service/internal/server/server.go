// Package server wires the HTTP router, observability and graceful
// shutdown for the global-branch-service stub. New product routes go
// through mountAPIRoutes and currently all answer 501 via
// handler.NotImplemented.
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
	"github.com/openfoundry/openfoundry-go/services/global-branch-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/global-branch-service/internal/handler"
)

// Server bundles the lifecycle of the HTTP listener.
type Server struct {
	httpServer *http.Server
	cfg        *config.Config
	log        *slog.Logger
}

// New builds a Server with all middleware and routes mounted.
func New(cfg *config.Config, metrics *observability.Metrics, log *slog.Logger, probes ...capabilities.DependencyProbe) (*Server, error) {
	jwtCfg := authmw.NewJWTConfig(cfg.JWT.Secret).
		WithIssuer(cfg.JWT.Issuer).
		WithAudience(cfg.JWT.Audience)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Compress(5))
	r.Use(chimw.Timeout(30 * time.Second))

	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)

	// Public endpoints (no auth).
	r.Get("/healthz", handler.Health(cfg.Service.Name, cfg.Service.Version))
	r.Method(http.MethodGet, "/metrics", metrics.Handler())
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	// Authenticated API mount.
	api := r.With(authmw.Middleware(jwtCfg))
	mountAPIRoutes(api, caps)

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

// Run blocks until the listener returns or ctx is cancelled.
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

// mountAPIRoutes registers every product route. All endpoints are
// stubs returning 501 (handler.NotImplemented); they exist so the edge
// gateway has an upstream to route to instead of 502'ing.
//
// Routes mirror the gateway selector
// (services/edge-gateway-service/internal/proxy/router_table.go:285-287),
// which sends `/api/v1/code-repos/repositories/{repository}/branches`
// to this upstream. The catch-all on the same prefix covers nested
// branch endpoints (e.g. `.../branches/{branch}` once added).
func mountAPIRoutes(r chi.Router, caps *capabilities.Registry) {
	caps.MustRegister(r, capabilities.Capability{
		ID:           "global-branch.repository-branches.list",
		Method:       http.MethodGet,
		Path:         "/api/v1/code-repos/repositories/{repository}/branches",
		Stable:       false,
		RequiresAuth: true,
		Summary:      "List branches for a code repository (stub — returns 501).",
		Tags:         []string{"global-branching", "code-repos", "stub"},
	}, handler.NotImplemented())

	caps.MustRegister(r, capabilities.Capability{
		ID:           "global-branch.repository-branches.create",
		Method:       http.MethodPost,
		Path:         "/api/v1/code-repos/repositories/{repository}/branches",
		Stable:       false,
		RequiresAuth: true,
		Summary:      "Create a branch on a code repository (stub — returns 501).",
		Tags:         []string{"global-branching", "code-repos", "stub"},
	}, handler.NotImplemented())

	// Catch-all under the same prefix so anything the gateway forwards
	// (current shape: `/api/v1/code-repos/repositories/{id}/branches`,
	// future nested paths) consistently answers 501 instead of 404.
	r.HandleFunc("/api/v1/code-repos/repositories/{repository}/branches", handler.NotImplemented())
	r.HandleFunc("/api/v1/code-repos/repositories/{repository}/branches/*", handler.NotImplemented())
}
