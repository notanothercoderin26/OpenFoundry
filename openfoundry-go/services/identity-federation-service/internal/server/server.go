// Package server wires the chi router for identity-federation-service slice 1.
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
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/handlers"
)

// New builds the http.Server with slice-1 routes.
//
// Slice 1 mounts:
//   GET    /healthz
//   GET    /metrics
//   GET    /api/v1/auth/bootstrap-status
//   POST   /api/v1/auth/register
//   POST   /api/v1/auth/login
//   POST   /api/v1/auth/token/refresh
//
// Subsequent slices add: /auth/sessions/*, /auth/mfa/*, /auth/sso/*,
// /users/*, /roles/*, /groups/*, /permissions/*, /policies/*,
// /control-panel/*, /scim/v2/*, /jwks/rotate, /audit/metrics.
func New(cfg *config.Config, auth *handlers.Auth, m *observability.Metrics) *http.Server {
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer, chimw.Compress(5))
	r.Use(chimw.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	r.Method(http.MethodGet, "/metrics", m.Handler())

	// /api/v1/auth/* — public (no bearer required, the endpoints
	// handle credentials themselves).
	r.Route("/api/v1/auth", func(api chi.Router) {
		api.Get("/bootstrap-status", auth.BootstrapStatus)
		api.Post("/register", auth.Register)
		api.Post("/login", auth.Login)
		api.Post("/token/refresh", auth.Refresh)
	})

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	return &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}
}

// Run blocks until ctx is done or the listener returns.
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
