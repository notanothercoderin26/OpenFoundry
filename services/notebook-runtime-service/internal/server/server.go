// Package server wires the HTTP surface for notebook-runtime-service.
//
// URL grid mirrors `services/notebook-runtime-service/src/handlers/*`
// — same paths, same verbs. Auth-protected routes live under
// `/api/v1`; `/healthz` and `/metrics` stay public.
package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/capabilities"
	"github.com/openfoundry/openfoundry-go/libs/core-models/health"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/domain/notepad"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/handler"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/kernelgw"
)

// GatewayDeps bundles the optional jupyter/kernel-gateway proxy
// dependencies. When any of these is nil, the gateway-backed routes
// return 503.
type GatewayDeps struct {
	Client   *kernelgw.Client
	Mappings kernelgw.MappingRepo
	Guard    kernelgw.ExecuteGuard
}

func New(cfg *config.Config, pool *pgxpool.Pool, m *observability.Metrics, probes ...capabilities.DependencyProbe) *http.Server {
	return NewWithKernel(cfg, pool, m, nil, probes...)
}

func NewWithKernel(cfg *config.Config, pool *pgxpool.Pool, m *observability.Metrics, py handler.NotebookPythonKernel, probes ...capabilities.DependencyProbe) *http.Server {
	return NewWithDeps(cfg, pool, m, py, GatewayDeps{}, probes...)
}

func NewWithDeps(cfg *config.Config, pool *pgxpool.Pool, m *observability.Metrics, py handler.NotebookPythonKernel, gw GatewayDeps, probes ...capabilities.DependencyProbe) *http.Server {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	return &http.Server{
		Addr:              addr,
		Handler:           BuildRouterWithDeps(cfg, pool, m, py, gw, probes...),
		ReadHeaderTimeout: 5 * time.Second,
	}
}

func BuildRouter(cfg *config.Config, pool *pgxpool.Pool, m *observability.Metrics, probes ...capabilities.DependencyProbe) http.Handler {
	return BuildRouterWithKernel(cfg, pool, m, nil, probes...)
}

func BuildRouterWithKernel(cfg *config.Config, pool *pgxpool.Pool, m *observability.Metrics, py handler.NotebookPythonKernel, probes ...capabilities.DependencyProbe) http.Handler {
	return BuildRouterWithDeps(cfg, pool, m, py, GatewayDeps{}, probes...)
}

func BuildRouterWithDeps(cfg *config.Config, pool *pgxpool.Pool, m *observability.Metrics, py handler.NotebookPythonKernel, gw GatewayDeps, probes ...capabilities.DependencyProbe) http.Handler {
	var gotenberg *notepad.GotenbergClient
	if cfg.GotenbergURL != "" {
		timeout := time.Duration(cfg.GotenbergTimeoutSeconds) * time.Second
		if timeout <= 0 {
			timeout = 30 * time.Second
		}
		gotenberg = notepad.NewGotenbergClient(cfg.GotenbergURL, &http.Client{Timeout: timeout})
	}

	state := &handler.State{
		Cfg:            cfg,
		Pool:           pool,
		PythonKernel:   py,
		KernelGW:       gw.Client,
		KernelMappings: gw.Mappings,
		ExecuteGuard:   gw.Guard,
		Gotenberg:      gotenberg,
	}

	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(health.OK(cfg.Service.Name, cfg.Service.Version))
	})
	if m != nil {
		r.Method(http.MethodGet, "/metrics", m.Handler())
	}

	// Capability registry — see docs/agent-automation/AGENT-CAPABILITIES-ROADMAP.md (M1.1).
	caps := capabilities.New(cfg.Service.Name, cfg.Service.Version)
	for _, p := range probes {
		caps.RegisterDependency(p)
	}
	caps.Mount(r)

	jwt := authmw.NewJWTConfig(cfg.JWTSecret)
	r.Route("/api/v1", func(api chi.Router) {
		api.Use(authmw.Middleware(jwt))

		// Notebook CRUD.
		api.Get("/notebooks", state.ListNotebooks)
		api.Post("/notebooks", state.CreateNotebook)
		api.Get("/notebooks/{notebook_id}", state.GetNotebook)
		api.Put("/notebooks/{notebook_id}", state.UpdateNotebook)
		api.Patch("/notebooks/{notebook_id}", state.UpdateNotebook)
		api.Delete("/notebooks/{notebook_id}", state.DeleteNotebook)

		// Cells.
		api.Post("/notebooks/{notebook_id}/cells", state.AddCell)
		api.Patch("/notebooks/{notebook_id}/cells/{cell_id}", state.UpdateCell)
		api.Delete("/notebooks/{notebook_id}/cells/{cell_id}", state.DeleteCell)

		// Sessions (legacy python-sidecar path).
		api.Get("/notebooks/{notebook_id}/sessions", state.ListSessions)
		api.Post("/notebooks/{notebook_id}/sessions", state.CreateSession)
		api.Post("/notebooks/{notebook_id}/sessions/{session_id}/stop", state.StopSession)

		// Execute (legacy python-sidecar / SQL / R / LLM dispatch).
		api.Post("/notebooks/{notebook_id}/cells/{cell_id}/execute", state.ExecuteCell)
		api.Post("/notebooks/{notebook_id}/cells/execute-all", state.ExecuteAllCells)

		// Workspace files.
		api.Get("/notebooks/{notebook_id}/workspace", state.ListWorkspaceFiles)
		api.Put("/notebooks/{notebook_id}/workspace", state.UpsertWorkspaceFile)
		api.Delete("/notebooks/{notebook_id}/workspace", state.DeleteWorkspaceFile)

		// Notepad documents + presence + export.
		api.Get("/notepad/documents", state.ListDocuments)
		api.Post("/notepad/documents", state.CreateDocument)
		api.Get("/notepad/documents/{document_id}", state.GetDocument)
		api.Patch("/notepad/documents/{document_id}", state.UpdateDocument)
		api.Delete("/notepad/documents/{document_id}", state.DeleteDocument)
		api.Get("/notepad/documents/{document_id}/presence", state.ListPresence)
		api.Post("/notepad/documents/{document_id}/presence", state.UpsertPresence)
		api.Post("/notepad/documents/{document_id}/export", state.ExportDocument)

		// Notepad version history (Slice F).
		api.Get("/notepad/documents/{document_id}/revisions", state.ListRevisions)
		api.Post("/notepad/documents/{document_id}/revisions", state.CreateRevision)
		api.Get("/notepad/documents/{document_id}/revisions/{rev}", state.GetRevision)
		api.Post("/notepad/documents/{document_id}/revisions/{rev}/revert", state.RevertRevision)

		// Notepad live embeds (Slice C).
		api.Post("/notepad/embeds/resolve", state.ResolveEmbed)

		// Notepad AIP transforms (Slice D — Edit with AIP).
		api.Post("/notepad/aip/transform", state.AIPTransform)

		// Notepad templates v2 (Slice G).
		api.Get("/notepad/templates", state.ListTemplates)
		api.Post("/notepad/templates", state.CreateTemplate)
		api.Get("/notepad/templates/{template_id}", state.GetTemplate)
		api.Patch("/notepad/templates/{template_id}", state.UpdateTemplate)
		api.Delete("/notepad/templates/{template_id}", state.DeleteTemplate)
		api.Post("/notepad/templates/{template_id}/instantiate", state.InstantiateTemplate)

		// jupyter/kernel-gateway proxy surface. CRUD over upstream
		// kernels + per-session execute streaming.
		api.Post("/kernels", state.CreateKernel)
		api.Get("/kernels", state.ListKernels)
		api.Delete("/kernels/{kernel_id}", state.DeleteKernel)
		api.Post("/notebooks/{notebook_id}/gateway-sessions", state.CreateGatewaySession)
		api.Delete("/notebooks/{notebook_id}/gateway-sessions/{session_id}", state.DeleteGatewaySession)
		api.Post("/notebooks/{notebook_id}/gateway-sessions/{session_id}/execute", state.ExecuteGatewayCell)
	})

	if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
		IDPrefix:  "notebook-runtime",
		AuthPaths: []string{"/api/v1"},
		Tags:      []string{"notebook"},
	}); err != nil {
		panic("notebook-runtime-service: capability ingest failed: " + err.Error())
	}

	return r
}
