// Package server wires the HTTP surface for ontology-actions-service.
package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/capabilities"
	"github.com/openfoundry/openfoundry-go/libs/core-models/health"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	ontologykernel "github.com/openfoundry/openfoundry-go/libs/ontology-kernel"
	kernelactions "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/handlers/actions"
	kernelfunctions "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/handlers/functions"
	kernelfunnel "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/handlers/funnel"
	kernelrules "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/handlers/rules"
	kernelstorage "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/handlers/storage"
	ontologymetrics "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/metrics"
	"github.com/openfoundry/openfoundry-go/services/ontology-actions-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/ontology-actions-service/internal/handlers"
)

// New builds the HTTP server bound to cfg.Server.{Host,Port}.
//
// The optional `lifted` handler set carries the action-type
// schema-mutation routes that have been lifted out of the kernel
// (POST/PUT/PATCH/DELETE on /actions[/{id}]) so they can pair their
// SQL writes with libs/outbox.Enqueue inside a single Postgres
// transaction (ADR-0022). Passing `nil` keeps the kernel-only path
// in place — useful for stub-mode tests that don't need outbox
// behavior.
func New(cfg *config.Config, state *ontologykernel.AppState, m *observability.Metrics, lifted *handlers.Handlers, probes ...capabilities.DependencyProbe) *http.Server {
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	return &http.Server{
		Addr:              addr,
		Handler:           BuildRouter(cfg, state, m, lifted, probes...),
		ReadHeaderTimeout: 5 * time.Second,
	}
}

// BuildRouter exposes the chi.Router for in-process tests
// (parity with `tower::ServiceExt::oneshot` callers in Rust).
func BuildRouter(cfg *config.Config, state *ontologykernel.AppState, m *observability.Metrics, lifted *handlers.Handlers, probes ...capabilities.DependencyProbe) http.Handler {
	if state == nil {
		panic("ontology-actions-service requires non-nil AppState; set DATABASE_URL or enable OF_DEV_STUB_MODE for explicit local/test in-memory state")
	}
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

	// Capability registry — exposes `GET /_meta/capabilities` so the
	// gateway aggregator (services/edge-gateway-service/internal/meta)
	// can discover what this binary serves. The kernel handlers mount
	// their routes through chi directly (Mount(r, state)); after the
	// API surface is fully built we walk it with `IngestChiRoutes`
	// to synthesise capability entries automatically.
	// M1.2: caller-supplied probes (PG/Cassandra/Kafka) feed `/_meta/health`.
	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	// Public probes.
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	if m != nil {
		ontologymetrics.RegisterActionMetrics(m.Registry)
		r.Method(http.MethodGet, "/metrics", m.Handler())
	}

	// /api/v1/ontology/* requires a Bearer token (auth applied
	// uniformly via authmw.Middleware below).
	jwt := authmw.NewJWTConfig(cfg.JWTSecret)
	r.Route("/api/v1/ontology", func(api chi.Router) {
		api.Use(authmw.Middleware(jwt))
		mountActions(api, state, lifted)
		mountFunnel(api, state)
		mountFunctions(api, state)
		mountRules(api, state)
	})

	// Walk the fully built router and synthesise capabilities for
	// every ontology route. Curated entries (none yet) would have
	// taken precedence; auth flag is derived from the path prefix.
	if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
		IDPrefix:  "ontology",
		AuthPaths: []string{"/api/v1/ontology"},
		Tags:      []string{"ontology"},
	}); err != nil {
		panic("ontology-actions-service: capability ingest failed: " + err.Error())
	}

	return r
}

// mountActions wires the actions surface. When `lifted` is non-nil
// the three schema-mutation routes (POST/PUT/PATCH/DELETE on
// /actions[/{id}]) come from the local outbox-aware handlers; the
// remaining 13 routes (List, Get, Validate, Execute, Metrics, Batch,
// WhatIf, InlineEdit, Applicable, Upload) are mounted exactly as the
// kernel exposes them. When `lifted` is nil (stub / test runs) we
// fall back to the pure kernel Mount.
func mountActions(r chi.Router, state *ontologykernel.AppState, lifted *handlers.Handlers) {
	if lifted == nil {
		kernelactions.Mount(r, state)
		return
	}
	// Schema-mutation routes — lifted, outbox-aware.
	r.Post("/actions", lifted.CreateActionType)
	r.Put("/actions/{id}", lifted.UpdateActionType)
	r.Patch("/actions/{id}", lifted.UpdateActionType)
	r.Delete("/actions/{id}", lifted.DeleteActionType)
	// Read + execution routes — straight from the kernel.
	r.Get("/actions", kernelactions.ListActionTypes(state))
	r.Get("/actions/{id}", kernelactions.GetActionType(state))
	r.Post("/actions/{id}/validate", kernelactions.ValidateAction(state))
	r.Post("/actions/{id}/execute", kernelactions.ExecuteAction(state))
	r.Get("/actions/{id}/metrics", kernelactions.GetActionMetrics(state))
	r.Post("/actions/{id}/execute-batch", kernelactions.ExecuteActionBatchHandler(state))
	r.Get("/actions/{id}/what-if", kernelactions.ListActionWhatIfBranches(state))
	r.Post("/actions/{id}/what-if", kernelactions.CreateActionWhatIfBranch(state))
	r.Delete("/actions/{id}/what-if/{branch_id}", kernelactions.DeleteActionWhatIfBranch(state))
	r.Post("/types/{type_id}/properties/{property_id}/objects/{obj_id}/inline-edit", kernelactions.ExecuteInlineEditHandler(state))
	r.Post("/types/{type_id}/inline-edit-batch", kernelactions.ExecuteInlineEditBatchHandler(state))
	r.Get("/types/{type_id}/applicable-actions", kernelactions.ListApplicableActions(state))
	r.Post("/actions/uploads", kernelactions.UploadActionAttachment(state))
}

func mountFunnel(r chi.Router, state *ontologykernel.AppState) {
	r.Get("/storage/insights", kernelstorage.GetStorageInsights(state))
	kernelfunnel.Mount(r, state)
}

func mountFunctions(r chi.Router, state *ontologykernel.AppState) {
	kernelfunctions.Mount(r, state)
}

func mountRules(r chi.Router, state *ontologykernel.AppState) {
	kernelrules.Mount(r, state)
}
