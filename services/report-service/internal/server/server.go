// Package server wires the HTTP router, middleware and graceful
// shutdown for the report-service stub.
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
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/report-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/report-service/internal/handlers"
)

type Server struct {
	httpServer *http.Server
	cfg        *config.Config
	log        *slog.Logger
}

func New(cfg *config.Config, metrics *observability.Metrics, log *slog.Logger) (*Server, error) {
	jwtCfg := authmw.NewJWTConfig(cfg.JWT.Secret).
		WithIssuer(cfg.JWT.Issuer).
		WithAudience(cfg.JWT.Audience)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Compress(5))
	r.Use(chimw.Timeout(30 * time.Second))

	r.Get("/healthz", handlers.Health(cfg.Service.Name, cfg.Service.Version))
	r.Method(http.MethodGet, "/metrics", metrics.Handler())

	placeholder := handlers.NotImplemented(cfg.Service.Name, cfg.Milestone)
	api := r.With(authmw.Middleware(jwtCfg))
	// Single gateway-mapped surface today: every method/path under
	// /api/v1/reports (router_table.go `u.Report` branch). The frontend
	// hits /reports/{overview,catalog,definitions,schedules,executions/*}
	// — all covered by this prefix.
	api.Handle("/api/v1/reports", placeholder)
	api.Handle("/api/v1/reports/*", placeholder)

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
