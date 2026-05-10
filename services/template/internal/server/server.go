// Package server wires the HTTP router, observability and graceful
// shutdown for the template service. Real services should keep this
// file's shape and only extend the routing tables in `mountAPIRoutes`.
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
	"github.com/openfoundry/openfoundry-go/services/template/internal/config"
	"github.com/openfoundry/openfoundry-go/services/template/internal/handler"
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

	// Capability registry — every route that should be discoverable by
	// agents (see docs/agent-automation/AGENT-CAPABILITIES-ROADMAP.md
	// M1.1) is registered through `caps.Register` instead of the bare
	// chi `Get`/`Post` helpers. The catalog itself is mounted at
	// `GET /_meta/capabilities` and self-registers, so it appears in
	// the snapshot.
	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)

	// Public endpoints (no auth).
	r.Get("/healthz", handler.Health(cfg.Service.Name, cfg.Service.Version))
	r.Method(http.MethodGet, "/metrics", metrics.Handler())
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	// Authenticated API mount. We use `With` (not `Route`) so the
	// returned router is still rooted at "/", which keeps the paths in
	// the capability catalog absolute (e.g. `/api/whoami`, not
	// `/whoami`). New routes go through `mountAPIRoutes`.
	api := r.With(authmw.Middleware(jwtCfg))
	mountAPIRoutes(api, caps)

	shutdownTimeout := 15 * time.Second
	if d, err := time.ParseDuration(cfg.Server.ShutdownTimeout); err == nil {
		shutdownTimeout = d
	}

	s := &Server{
		cfg: cfg,
		log: log,
		httpServer: &http.Server{
			Addr:              cfg.Server.Addr,
			Handler:           r,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}
	_ = shutdownTimeout // surfaced via Stop()
	return s, nil
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

// mountAPIRoutes is the single hook real services extend. New routes
// MUST be added through `caps.Register` (or `MustRegister`) so they
// show up in `/_meta/capabilities`. Use bare `chi` only for routes
// that are deliberately invisible to agents (e.g. legacy redirects).
func mountAPIRoutes(r chi.Router, caps *capabilities.Registry) {
	caps.MustRegister(r, capabilities.Capability{
		ID:           "template.whoami.get",
		Method:       http.MethodGet,
		Path:         "/api/whoami",
		Stable:       true,
		RequiresAuth: true,
		Summary:      "Echo the calling principal's email — reference handler.",
		Tags:         []string{"identity", "template"},
	}, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		c, _ := authmw.FromContext(req.Context())
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"email":"` + c.Email + `"}`))
	}))
}
