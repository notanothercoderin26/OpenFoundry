// Package server wires the chi router for ontology-definition-service.
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
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/handlers"
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

	// Capability registry — M1.1.
	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	mountObjectTypes := func(api chi.Router) {
		api.Use(authmw.Middleware(jwt))

		// Canonical resource = `object-types`. The edge-gateway router
		// (and the apps/web SPA) reach this service at `/types` —
		// register the same handlers under both names so neither
		// surface sees a 404.
		for _, base := range []string{"/object-types", "/types"} {
			api.Get(base, h.ListObjectTypes)
			api.Post(base, h.CreateObjectType)
			api.Get(base+"/{id}", h.GetObjectType)
			api.Patch(base+"/{id}", h.UpdateObjectType)
			api.Delete(base+"/{id}", h.DeleteObjectType)

			// Properties — list/create nested under each type
			api.Get(base+"/{id}/properties", h.ListProperties)
			api.Post(base+"/{id}/properties", h.CreateProperty)
			// Per-property update/delete by property id (not type-scoped).
			// Lets agents and SDKs touch a single property without
			// going through the Review-edits batch flow.
			api.Get(base+"/{id}/properties/{propertyID}", h.GetProperty)
			api.Patch(base+"/{id}/properties/{propertyID}", h.UpdateProperty)
			api.Delete(base+"/{id}/properties/{propertyID}", h.DeleteProperty)

			// App capabilities (per-app metadata, e.g. vertex_event)
			api.Put(base+"/{id}/app-capabilities", h.UpdateObjectTypeAppCapabilities)
		}

		// Link types — top-level (/links). The frontend `listLinkTypes`
		// optionally filters by `object_type_id`; same handler for both.
		api.Get("/links", h.ListLinkTypes)
		api.Post("/links", h.CreateLinkType)
		api.Get("/links/{id}", h.GetLinkType)
		api.Patch("/links/{id}", h.UpdateLinkType)
		api.Put("/links/{id}/app-capabilities", h.UpdateLinkTypeAppCapabilities)
		api.Delete("/links/{id}", h.DeleteLinkType)

		api.Get("/object-type-groups", h.ListObjectTypeGroups)
		api.Post("/object-type-groups", h.CreateObjectTypeGroup)
		api.Get("/object-type-groups/{id}", h.GetObjectTypeGroup)
		api.Patch("/object-type-groups/{id}", h.UpdateObjectTypeGroup)
		api.Delete("/object-type-groups/{id}", h.DeleteObjectTypeGroup)
		api.Post("/object-type-groups/{id}/object-types/{objectTypeId}", h.AddObjectTypeToGroup)
		api.Delete("/object-type-groups/{id}/object-types/{objectTypeId}", h.RemoveObjectTypeFromGroup)

		// Interfaces — Foundry-equivalent "shape" types for object-type
		// polymorphism. List endpoint is what the Ontology Manager UI
		// hits on first paint; CRUD endpoints below let an agent
		// declare interfaces before binding object types via batch-save.
		api.Get("/interfaces", h.ListInterfaces)
		api.Post("/interfaces", h.CreateInterface)
		api.Get("/interfaces/{id}", h.GetInterface)
		api.Patch("/interfaces/{id}", h.UpdateInterface)
		api.Delete("/interfaces/{id}", h.DeleteInterface)

		// Shared property types — semantic wrappers around a base type,
		// reusable across object types. Same CRUD shape as interfaces.
		api.Get("/shared-property-types", h.ListSharedPropertyTypes)
		api.Post("/shared-property-types", h.CreateSharedPropertyType)
		api.Get("/shared-property-types/{id}", h.GetSharedPropertyType)
		api.Patch("/shared-property-types/{id}", h.UpdateSharedPropertyType)
		api.Delete("/shared-property-types/{id}", h.DeleteSharedPropertyType)

		// Object views — per-object-type rendering definitions surfaced
		// in the Ontology Manager "Object Views" tab and consumed by
		// the object detail surfaces (Workshop, Object Explorer,
		// Vertex). Also mounted top-level at /api/v1/object-views (see
		// mountObjectViewsTopLevel below) to match the historical
		// apps/web client path.
		api.Get("/object-views", h.ListObjectViews)
		api.Post("/object-views", h.CreateObjectView)
		api.Get("/object-views/{id}", h.GetObjectView)
		api.Patch("/object-views/{id}", h.UpdateObjectView)
		api.Delete("/object-views/{id}", h.DeleteObjectView)

		// Atomic batch save for the Ontology-Manager Review-edits
		// modal. All staged edits succeed together or none of them
		// do; per-edit results (errors / conflicts / warnings) come
		// back inside the response body so the modal can render its
		// All / Warnings / Errors / Conflicts tabs.
		api.Post("/batch-save", h.BatchSave)

		// History feed for the Ontology Manager. Returns rows from
		// ontology_audit_log most-recent-first; optional filters by
		// resource_kind / resource_id / batch_id / changed_by let
		// the per-resource History tab narrow the view.
		api.Get("/audit-log", h.ListAuditLog)
	}

	// Mount on both the legacy `/api/v1/ontology-definition` prefix
	// (kept for backwards compatibility) and the gateway-canonical
	// `/api/v1/ontology` prefix.
	r.Route("/api/v1/ontology-definition", mountObjectTypes)
	r.Route("/api/v1/ontology", mountObjectTypes)

	// Object views are also reachable at the top-level
	// `/api/v1/object-views` path — apps/web has shipped that URL since
	// the Rust era and changing it would invalidate every cached
	// bookmark / saved deep link. The gateway routes the same prefix
	// here (see edge-gateway-service/internal/proxy/router_table.go).
	r.Group(func(api chi.Router) {
		api.Use(authmw.Middleware(jwt))
		api.Get("/api/v1/object-views", h.ListObjectViews)
		api.Post("/api/v1/object-views", h.CreateObjectView)
		api.Get("/api/v1/object-views/{id}", h.GetObjectView)
		api.Patch("/api/v1/object-views/{id}", h.UpdateObjectView)
		api.Delete("/api/v1/object-views/{id}", h.DeleteObjectView)
	})

	if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
		IDPrefix:  "ontology-definition",
		AuthPaths: []string{"/api/v1/ontology-definition", "/api/v1/ontology", "/api/v1/object-views"},
		Tags:      []string{"ontology", "definition"},
	}); err != nil {
		panic("ontology-definition-service: capability ingest failed: " + err.Error())
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
