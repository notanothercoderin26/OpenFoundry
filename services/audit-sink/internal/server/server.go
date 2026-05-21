// Package server hosts the audit-sink HTTP surface — `/healthz`,
// `/metrics`, and the read/write `/api/v1/audit/*` API backing
// AuditService.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/core-models/health"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/audit-sink/internal/runtime"
)

// Server bundles the chi router + http.Server.
type Server struct {
	srv    *http.Server
	Router chi.Router
}

// New wires:
//
//	GET  /healthz
//	GET  /metrics
//	GET  /api/v1/audit/events
//	GET  /api/v1/audit/events/export   (NDJSON stream)
//	POST /api/v1/audit/events          (write-through; see handlers.RecordEvent)
//
// `h` may be nil — in writer-only deployments (no Postgres pool) the
// API routes are skipped and only /healthz + /metrics are served.
//
// `jwt` is required when `h` is non-nil: every /api/v1/audit/* route
// is fronted by [authmw.Middleware], so an unauthenticated caller can
// neither forge audit events via POST nor exfiltrate the audit ledger
// via GET. Health + metrics remain public for kubelet probes and
// Prometheus scrape.
func New(addr, serviceName, version string, m *runtime.Metrics, h *handlers.Handlers, jwt *authmw.JWTConfig) *Server {
	r := chi.NewRouter()
	r.Get("/healthz", healthHandler(serviceName, version))
	r.Handle("/metrics", promhttp.HandlerFor(m.Registry, promhttp.HandlerOpts{Registry: m.Registry}))
	if h != nil {
		r.Route("/api/v1/audit", func(r chi.Router) {
			r.Use(authmw.Middleware(jwt))
			r.Get("/events", h.QueryEvents)
			r.Get("/events/export", h.ExportEvents)
			r.Post("/events", h.RecordEvent)
		})
	}
	return &Server{
		srv: &http.Server{
			Addr:              addr,
			Handler:           r,
			ReadHeaderTimeout: 5 * time.Second,
		},
		Router: r,
	}
}

// Run blocks until ctx is done or the listener returns.
func (s *Server) Run(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() {
		if err := s.srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return s.srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}

func healthHandler(serviceName, version string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(serviceName, version))
	}
}
