// Package server wires the chi router for iceberg-catalog-service.
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
	"github.com/openfoundry/openfoundry-go/libs/core-models/health"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/handlers/auth"
)

// Deps bundles the runtime adapters the server wires into its routers.
// `Bearer`, `BearerStore`, `IssueAPIStore` and `OAuthValidator` are
// optional: when nil, the iceberg REST surface continues to authenticate
// via the standard Foundry JWT middleware (the existing /api/v1 +
// /iceberg/v1 admin path).
type Deps struct {
	Handlers       *handlers.Handlers
	Markings       *handlers.MarkingsHandlers
	Bearer         *auth.Config
	BearerStore    auth.TokenStore
	IssueAPIStore  auth.IssueAPITokenStore
	OAuthValidator auth.OAuthClientValidator
}

func New(cfg *config.Config, jwt *authmw.JWTConfig, deps Deps, m *observability.Metrics) *http.Server {
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer, chimw.Compress(5))
	r.Use(chimw.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	r.Method(http.MethodGet, "/metrics", m.Handler())

	h := deps.Handlers

	r.Route("/api/v1", func(api chi.Router) {
		api.Use(authmw.Middleware(jwt))

		api.Get("/namespaces", h.ListNamespaces)
		api.Post("/namespaces", h.CreateNamespace)
		api.Get("/namespaces/{id}", h.GetNamespace)
		api.Patch("/namespaces/{id}", h.UpdateNamespace)
		api.Delete("/namespaces/{id}", h.DeleteNamespace)

		api.Get("/namespaces/{namespace}/tables", h.ListTables)
		api.Post("/namespaces/{namespace}/tables", h.CreateTable)
		api.Post("/tables/rename", h.RenameTable)
		api.Get("/namespaces/{namespace}/tables/{table}", h.LoadTable)
		api.Post("/namespaces/{namespace}/tables/{table}", h.CommitTable)
		api.Delete("/namespaces/{namespace}/tables/{table}", h.DropTable)
		api.Get("/namespaces/{namespace}/tables/{table}/refs", h.ListRefs)
		api.Get("/namespaces/{namespace}/tables/{table}/refs/{ref}", h.GetRef)
		api.Put("/namespaces/{namespace}/tables/{table}/refs/{ref}", h.UpsertRef)
		api.Delete("/namespaces/{namespace}/tables/{table}/refs/{ref}", h.DeleteRef)
		api.Get("/namespaces/{namespace}/tables/{table}/metadata", h.ListMetadataFiles)
		api.Get("/namespaces/{namespace}/tables/{table}/metadata/{version}", h.GetMetadataFile)
		api.Get("/namespaces/{namespace}/tables/{table}/snapshots", h.ListSnapshots)
		api.Get("/namespaces/{namespace}/tables/{table}/snapshots/{snapshot_id}", h.GetSnapshot)
	})

	r.Post("/openfoundry/iceberg/v1/append", h.AppendBatch)

	// Iceberg OAuth2 token endpoint — public per spec.
	if deps.Bearer != nil {
		r.Post("/iceberg/v1/oauth/tokens", auth.IssueTokenHandler(deps.Bearer, deps.OAuthValidator))
	}
	// Foundry-internal API token mint — gated by the standard JWT middleware
	// because the principal must be a real user (UUID `sub`).
	if deps.IssueAPIStore != nil {
		r.Group(func(grp chi.Router) {
			grp.Use(authmw.Middleware(jwt))
			ttl := cfg.LongLivedTokenTTLSec
			if ttl == 0 {
				ttl = 90 * 24 * 3600
			}
			grp.Post("/v1/iceberg-clients/api-tokens", auth.CreateAPITokenHandler(deps.IssueAPIStore, ttl))
		})
	}

	r.Route("/iceberg/v1", func(api chi.Router) {
		api.Use(authmw.Middleware(jwt))
		api.Get("/namespaces/{namespace}/tables", h.ListTables)
		api.Post("/namespaces/{namespace}/tables", h.CreateTable)
		api.Post("/tables/rename", h.RenameTable)
		api.Get("/namespaces/{namespace}/tables/{table}", h.LoadTable)
		api.Post("/namespaces/{namespace}/tables/{table}", h.CommitTable)
		api.Delete("/namespaces/{namespace}/tables/{table}", h.DropTable)
		api.Get("/namespaces/{namespace}/tables/{table}/refs", h.ListRefs)
		api.Get("/namespaces/{namespace}/tables/{table}/refs/{ref}", h.GetRef)
		api.Put("/namespaces/{namespace}/tables/{table}/refs/{ref}", h.UpsertRef)
		api.Delete("/namespaces/{namespace}/tables/{table}/refs/{ref}", h.DeleteRef)
		api.Get("/namespaces/{namespace}/tables/{table}/metadata", h.ListMetadataFiles)
		api.Get("/namespaces/{namespace}/tables/{table}/metadata/{version}", h.GetMetadataFile)
		api.Get("/namespaces/{namespace}/tables/{table}/snapshots", h.ListSnapshots)
		api.Get("/namespaces/{namespace}/tables/{table}/snapshots/{snapshot_id}", h.GetSnapshot)
	})

	// Marking CRUD on the iceberg surface uses the iceberg-flavoured
	// bearer middleware (ofty / iceberg JWT) — admin tokens authenticate
	// per the REST Catalog spec, not the Foundry JWT.
	if deps.Markings != nil && deps.Bearer != nil {
		r.Route("/iceberg/v1/namespaces/{namespace}/markings", func(api chi.Router) {
			api.Use(auth.Middleware(deps.Bearer, deps.BearerStore))
			api.Get("/", deps.Markings.GetNamespaceMarkings)
			api.Post("/", deps.Markings.UpdateNamespaceMarkings)
		})
		r.Route("/iceberg/v1/namespaces/{namespace}/tables/{table}/markings", func(api chi.Router) {
			api.Use(auth.Middleware(deps.Bearer, deps.BearerStore))
			api.Get("/", deps.Markings.GetTableMarkings)
			api.Patch("/", deps.Markings.UpdateTableMarkings)
		})
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
