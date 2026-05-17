// Package server hosts the substrate HTTP surface for model-deployment-service.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/capabilities"
	"github.com/openfoundry/openfoundry-go/libs/core-models/health"
	"github.com/openfoundry/openfoundry-go/libs/ml-kernel-go/domain/serving"
	mlhandlers "github.com/openfoundry/openfoundry-go/libs/ml-kernel-go/handlers"
	mlmodels "github.com/openfoundry/openfoundry-go/libs/ml-kernel-go/models"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/config"
	lifecyclehandlers "github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/model-deployment-service/internal/repo"
)

var (
	SeedModelID        = uuid.MustParse("10000000-0000-0000-0000-000000000001")
	SeedModelVersionID = uuid.MustParse("10000000-0000-0000-0000-000000000101")
)

func New(cfg *config.Config, m *observability.Metrics, probes ...capabilities.DependencyProbe) *http.Server {
	srv, err := NewE(cfg, m, probes...)
	if err != nil {
		panic(err)
	}
	return srv
}

func NewE(cfg *config.Config, m *observability.Metrics, probes ...capabilities.DependencyProbe) (*http.Server, error) {
	r, err := buildRouterE(cfg, m, probes...)
	if err != nil {
		return nil, err
	}
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	return &http.Server{
		Addr:              addr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}, nil
}

func BuildRouter(cfg *config.Config, m *observability.Metrics, probes ...capabilities.DependencyProbe) http.Handler {
	r, err := buildRouterE(cfg, m, probes...)
	if err != nil {
		panic(err)
	}
	return r
}

func BuildRouterE(cfg *config.Config, m *observability.Metrics, probes ...capabilities.DependencyProbe) (http.Handler, error) {
	return buildRouterE(cfg, m, probes...)
}

func buildRouterE(cfg *config.Config, m *observability.Metrics, probes ...capabilities.DependencyProbe) (chi.Router, error) {
	deploymentHandler, err := defaultDeploymentHandler(cfg)
	if err != nil {
		return nil, err
	}
	lifecycleRepo, err := defaultLifecycleRepository(cfg, deploymentHandler.Pool)
	if err != nil {
		return nil, err
	}
	r := chi.NewRouter()
	r.Use(chimw.RequestID, chimw.RealIP, chimw.Recoverer)
	r.Use(chimw.Timeout(15 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
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

	// Lifecycle CRUD (POST/GET/PATCH/DELETE /api/v1/deployments) — auth
	// required, owner-scoped mutations enforced inside the handler.
	jwt := authmw.NewJWTConfig(cfg.JWTSecret)
	lifecycle := lifecyclehandlers.New(lifecycleRepo)
	r.Route("/api/v1/deployments", func(api chi.Router) {
		api.Use(authmw.Middleware(jwt))
		api.Post("/", lifecycle.Create)
		api.Get("/", lifecycle.List)
		api.Get("/{id}", lifecycle.Get)
		api.Patch("/{id}/status", lifecycle.UpdateStatus)
		api.Delete("/{id}", lifecycle.Delete)
	})

	// Legacy ml-kernel-go surface remains under the namespaced prefix
	// so the richer ModelDeployment shape (traffic split, drift reports)
	// stays available without colliding with the lifecycle CRUD.
	mountDeploymentRoutes(r, "/api/v1/model-deployment/deployments", deploymentHandler)

	if _, err := caps.IngestChiRoutes(r, capabilities.IngestOptions{
		IDPrefix:  "model-deployment",
		AuthPaths: []string{"/api/v1"},
		Tags:      []string{"models"},
	}); err != nil {
		panic("model-deployment-service: capability ingest failed: " + err.Error())
	}
	return r, nil
}

// defaultLifecycleRepository wires the lifecycle CRUD repo. When a
// Postgres pool is already configured (DATABASE_URL set) the
// pgx-backed implementation runs its migrations and returns. In the
// fake-runtime test mode (OF_MODEL_DEPLOYMENT_RUNTIME=fake without
// DATABASE_URL) we fall back to the in-memory repo so the service can
// boot without a database.
func defaultLifecycleRepository(cfg *config.Config, pool *pgxpool.Pool) (repo.DeploymentRepository, error) {
	if pool != nil {
		if err := repo.Migrate(context.Background(), pool); err != nil {
			return nil, fmt.Errorf("apply lifecycle migrations: %w", err)
		}
		return &repo.PGDeploymentRepository{Pool: pool}, nil
	}
	if explicitFakeRuntime(cfg) {
		return repo.NewMemoryDeploymentRepository(nil), nil
	}
	return nil, errors.New("DATABASE_URL is required for lifecycle deployments repository")
}

func defaultDeploymentHandler(cfg *config.Config) (*mlhandlers.DeploymentsHandlers, error) {
	store, pool, err := deploymentStoreFromConfig(cfg)
	if err != nil {
		return nil, err
	}
	runtime, err := deploymentRuntimeFromConfig(cfg)
	if err != nil {
		if pool != nil {
			pool.Close()
		}
		return nil, err
	}
	return &mlhandlers.DeploymentsHandlers{Pool: pool, Store: store, Runtime: runtime}, nil
}

func deploymentStoreFromConfig(cfg *config.Config) (mlhandlers.DeploymentStore, *pgxpool.Pool, error) {
	if cfg != nil && strings.TrimSpace(cfg.DatabaseURL) != "" {
		pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
		if err != nil {
			return nil, nil, fmt.Errorf("configure deployment postgres store: %w", err)
		}
		return mlhandlers.NewPGDeploymentStore(pool), pool, nil
	}
	if explicitFakeRuntime(cfg) {
		return seededFakeDeploymentStore(), nil, nil
	}
	return nil, nil, errors.New("DATABASE_URL is required unless OF_MODEL_DEPLOYMENT_RUNTIME=fake is set")
}

func deploymentRuntimeFromConfig(cfg *config.Config) (serving.DeploymentRuntime, error) {
	mode := strings.ToLower(strings.TrimSpace(cfgValue(cfg, func(c *config.Config) string { return c.DeploymentRuntime })))
	backendURL := strings.TrimSpace(cfgValue(cfg, func(c *config.Config) string { return c.ServingBackendURL }))
	switch mode {
	case "fake":
		return serving.NewFakeDeploymentRuntime(), nil
	case "", "http", "serving", "remote":
		if backendURL != "" {
			return serving.NewHTTPDeploymentRuntime(backendURL, nil), nil
		}
		return serving.UnavailableDeploymentRuntime{Reason: "serving backend URL not configured"}, nil
	default:
		return nil, fmt.Errorf("unsupported OF_MODEL_DEPLOYMENT_RUNTIME %q", mode)
	}
}

func explicitFakeRuntime(cfg *config.Config) bool {
	return strings.EqualFold(strings.TrimSpace(cfgValue(cfg, func(c *config.Config) string { return c.DeploymentRuntime })), "fake")
}

func cfgValue(cfg *config.Config, get func(*config.Config) string) string {
	if cfg == nil {
		return ""
	}
	return get(cfg)
}

func seededFakeDeploymentStore() *mlhandlers.FakeDeploymentStore {
	store := mlhandlers.NewFakeDeploymentStore()
	store.SeedModel(mlmodels.RegisteredModel{
		ID:          SeedModelID,
		Name:        "seed-model",
		ProblemType: mlmodels.DefaultProblemType,
		Status:      "active",
	}, mlmodels.ModelVersion{
		ID:            SeedModelVersionID,
		ModelID:       SeedModelID,
		VersionNumber: 1,
		VersionLabel:  "v1",
		Stage:         "production",
	})
	return store
}

func mountDeploymentRoutes(r chi.Router, prefix string, h *mlhandlers.DeploymentsHandlers) {
	r.Get(prefix, h.ListDeployments)
	r.Post(prefix, h.CreateDeployment)
	r.Get(prefix+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "id must be a uuid", http.StatusBadRequest)
			return
		}
		h.GetDeployment(w, r, id)
	})
	r.Patch(prefix+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "id must be a uuid", http.StatusBadRequest)
			return
		}
		h.UpdateDeployment(w, r, id)
	})
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
