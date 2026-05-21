// Command agent-runtime-service hosts the agent runtime + tool
// registry plane (S8.1.b ADR-0030 absorbed tool-registry-service).
//
// Foundation port: full agents CRUD + runs + steps + human-approval,
// plus OpenAI-style chat-completions and copilot ask routes backed by
// the injectable ai-kernel-go LLM runtime. The tool-registry HTTP
// routes (`/api/v1/agent-runtime/tools`) port alongside
// libs/ai-kernel-go/handlers/tools in a follow-up slice.
//
// AI-event Kafka producer wires alongside libs/event-bus-data-go in a
// follow-up slice; the Topic, TxnIDPrefix, AiEventKind enum and
// envelope shape are pinned now in internal/aievents.
package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/google/uuid"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/domain/llm"
	"github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/domain/llm/anthropic"
	aimodels "github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/capabilities/probes"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/logicexec"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/react"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/repo"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/server"
)

var version = "dev"

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	cfg, err := config.FromEnv()
	if err != nil {
		slog.Error("config load failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	if cfg.Service.Version == "dev" {
		cfg.Service.Version = version
	}

	log := observability.InitLogging(cfg.Service.Name, cfg.Service.Version)
	shutdownTracing, err := observability.InitTracing(ctx, cfg.Service.Name, cfg.Service.Version)
	if err != nil {
		log.Error("tracing init failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer func() { _ = shutdownTracing(context.Background()) }()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("pgx pool failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()
	if err := repo.Migrate(ctx, pool); err != nil {
		log.Error("migrations failed", slog.String("error", err.Error()))
		os.Exit(1)
	}

	if cfg.KafkaBootstrap == "" {
		log.Warn("KAFKA_BOOTSTRAP_SERVERS unset — ai.events.v1 producer wires in follow-up slice")
	}

	var purposeCheckpoint *authmw.PurposeCheckpointClient
	if cfg.PurposeCheckpointURL != "" {
		purposeCheckpoint = authmw.NewPurposeCheckpointClient(cfg.PurposeCheckpointURL)
	} else {
		log.Warn("AUTHORIZATION_POLICY_SERVICE_URL/PURPOSE_CHECKPOINT_URL unset — sensitive AI chat purpose checks are disabled")
	}

	jwt := authmw.NewJWTConfig(cfg.JWTSecret)
	mainRepo := &repo.Repo{Pool: pool}
	h := &handlers.Handlers{Repo: mainRepo, AllowFakeLLMProvider: cfg.AllowFakeLLMProvider, PurposeCheckpoint: purposeCheckpoint}
	wireLLMRuntime(h, log)
	metrics := observability.NewMetrics()

	// B07: Threads + ReAct wiring. nil-safe — handler is omitted from
	// the route table when its repo isn't wired (e.g. dev without a
	// catalog URL).
	threadsRepo := &repo.ThreadsRepo{Pool: pool}
	var threadsHandler *handlers.Threads
	if cfg.LLMCatalogURL != "" {
		llmClient := react.NewHTTPLLMClient(cfg.LLMCatalogURL)
		toolRouter := &react.HTTPToolRouter{
			ObjectDatabaseURL:  cfg.ObjectDatabaseURL,
			OntologyActionsURL: cfg.OntologyActionsURL,
			RetrievalURL:       cfg.RetrievalURL,
			LogicFunctionsURL:  cfg.SelfBaseURL,
			Proposals:          &handlers.RepoProposalSink{Repo: mainRepo},
			HTTP:               &http.Client{Timeout: 30 * time.Second},
		}
		runner := &react.Runner{
			LLM:    llmClient,
			Tools:  toolRouter,
			Traces: handlers.NewTraceSink(threadsRepo),
		}
		threadsHandler = &handlers.Threads{Repo: threadsRepo, Runner: runner}

		// Logic function executor reuses the same LLM seam + tool
		// router, so Logic-from-API and Agent-from-thread invocations
		// route through the identical downstream gates (B07 §AC#6).
		//
		// All three URLs are required: a Logic function whose blocks
		// call ontology query / action tools is undefined without the
		// downstream services. Wiring the executor in a partial state
		// would let invocations succeed for some shapes (text-only
		// LLM blocks) and silently 5xx for others — a confusing fail
		// surface. Better to refuse and keep the synthetic preview
		// path until the operator wires the missing service.
		missing := logicExecutorMissingURLs(cfg)
		if len(missing) == 0 {
			mainRepo.Logic = logicexec.NewHTTPExecutor(llmClient, toolRouter)
			log.Info("logic function executor wired",
				slog.String("llm_catalog_url", cfg.LLMCatalogURL),
				slog.String("object_database_url", cfg.ObjectDatabaseURL),
				slog.String("ontology_actions_url", cfg.OntologyActionsURL),
			)
		} else {
			log.Warn("logic function executor disabled: required downstream URLs missing — falling back to synthetic preview outputs",
				slog.String("missing_env_vars", strings.Join(missing, ",")),
			)
		}
	} else {
		log.Warn("LLM_CATALOG_SERVICE_URL unset — /threads ReAct loop disabled; CRUD only; Logic invocation returns synthetic preview outputs")
		threadsHandler = &handlers.Threads{Repo: threadsRepo}
	}

	proposalsHandler := &handlers.Proposals{
		Repo:               mainRepo,
		OntologyActionsURL: cfg.OntologyActionsURL,
		HTTP:               &http.Client{Timeout: 30 * time.Second},
	}
	srv := server.NewWithDeps(cfg, jwt, h, server.Deps{Threads: threadsHandler, Proposals: proposalsHandler}, metrics, probes.Postgres("primary", pool))
	if err := server.Run(ctx, srv, log); err != nil && !errors.Is(err, context.Canceled) {
		log.Error("server exited with error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

// logicExecutorMissingURLs returns the env-var names whose absence
// blocks wiring the Logic executor. The executor reuses Threads'
// downstream clients, so the same URLs must be present — listing
// each one explicitly lets the operator see what to set without
// reading source.
func logicExecutorMissingURLs(cfg *config.Config) []string {
	var missing []string
	if strings.TrimSpace(cfg.LLMCatalogURL) == "" {
		missing = append(missing, "LLM_CATALOG_SERVICE_URL")
	}
	if strings.TrimSpace(cfg.ObjectDatabaseURL) == "" {
		missing = append(missing, "OBJECT_DATABASE_SERVICE_URL")
	}
	if strings.TrimSpace(cfg.OntologyActionsURL) == "" {
		missing = append(missing, "ONTOLOGY_ACTIONS_SERVICE_URL")
	}
	return missing
}

// wireLLMRuntime selects the LLM runtime based on env: ANTHROPIC_API_KEY
// engages the real Anthropic provider; otherwise we fall back to the
// in-process FakeRuntime so dev/test setups keep working, and log a
// WARN so operators notice the missing production credential.
func wireLLMRuntime(h *handlers.Handlers, log *slog.Logger) {
	if provider, ok := anthropic.FromEnv(); ok {
		h.Runtime = provider
		h.Provider = anthropicCatalogEntry(provider.Model)
		log.Info("anthropic llm runtime engaged",
			slog.String("model", provider.Model),
			slog.String("base_url", provider.BaseURL),
		)
		return
	}
	log.Warn("ANTHROPIC_API_KEY unset — falling back to in-process FakeRuntime (non-production)")
	h.Runtime = &llm.FakeRuntime{}
	h.AllowFakeLLMProvider = true
}

// anthropicCatalogEntry mints a synthetic LlmProvider so the chat
// handler's provider-required gate passes without a DB-provisioned row.
// The api_mode/model fields drive estimated-cost calculations and the
// provider name surfaced in copilot responses.
func anthropicCatalogEntry(model string) *aimodels.LlmProvider {
	rules := aimodels.DefaultProviderRoutingRules()
	return &aimodels.LlmProvider{
		ID:              uuid.MustParse("00000000-0000-0000-0000-0000000a17c1"),
		Name:            "anthropic-env",
		ProviderType:    "anthropic",
		ModelName:       model,
		EndpointURL:     anthropic.DefaultBaseURL,
		APIMode:         "messages",
		Enabled:         true,
		MaxOutputTokens: 1024,
		RouteRules:      rules,
	}
}
