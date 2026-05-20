// Command lineage-service is the OpenLineage events sink + lineage
// graph query service.
//
// Two runtime modes (selected via LINEAGE_RUNTIME_MODE):
//   - kafka_to_iceberg: Kafka `lineage.events.v1` → Iceberg of_lineage.*
//   - http_health: minimal /health endpoint for service-discovery
//     environments where the query surface is disabled
//
// Foundation slice ships:
//   - HTTP-health mode complete (matches Rust /health = "ok").
//   - kafkatoiceberg + icebergschema constants pinned (consumer
//     group, source topic, namespace, table names, field IDs,
//     partition + sort policy) so the follow-up runtime slice does
//     not break the on-disk format.
//   - Migrations copied verbatim.
//
// kafka_to_iceberg mode boots into HTTP-health for now and emits a
// warning — the runtime slice (Kafka subscriber + Iceberg writer +
// libs/iceberg-go integration) lands separately.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gocql/gocql"
	"github.com/jackc/pgx/v5/pgxpool"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/capabilities/probes"
	databus "github.com/openfoundry/openfoundry-go/libs/event-bus-data"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineage"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineageconsumer"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineagegraph"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineagestore"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/repo"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/server"
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

	mode := config.RuntimeModeFromEnv()
	log.Info("runtime mode resolved", slog.String("mode", string(mode)))
	if mode == config.ModeKafkaToIceberg {
		log.Warn("kafka_to_iceberg runtime is deferred to a follow-up slice; falling back to HTTP-health for now")
	}

	// AppState is only constructed when DATABASE_URL + JWT_SECRET are
	// both set — same fallback rule as the Rust HTTP-health mode.
	// Without those, only /health, /healthz and /metrics are mounted.
	var lineageOpts *server.Options
	var pool *pgxpool.Pool
	if cfg.DatabaseURL != "" && cfg.JWTSecret != "" {
		var err error
		pool, err = pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Error("pgx pool failed", slog.String("error", err.Error()))
			os.Exit(1)
		}
		defer pool.Close()
		if err := repo.Migrate(ctx, pool); err != nil {
			log.Error("migrations failed", slog.String("error", err.Error()))
			os.Exit(1)
		}

		// Lineage runtime store. Default is the in-memory implementation;
		// when CASSANDRA_CONTACT_POINTS is set we boot a gocql session,
		// run the keyspace + table DDL idempotently, and use the
		// Cassandra-backed store instead. Any failure logs a warning
		// and degrades back to memory so the service stays up.
		var (
			store           lineagestore.Store = lineagestore.NewMemoryStore()
			cassandraSession *gocql.Session
		)
		if contactPoints := strings.TrimSpace(os.Getenv("CASSANDRA_CONTACT_POINTS")); contactPoints != "" {
			cluster := gocql.NewCluster(strings.Split(contactPoints, ",")...)
			if keyspace := strings.TrimSpace(os.Getenv("CASSANDRA_KEYSPACE")); keyspace != "" {
				cluster.Keyspace = keyspace
			} else {
				cluster.Keyspace = lineagestore.Keyspace
			}
			cluster.Consistency = gocql.LocalQuorum
			cluster.Timeout = 10 * time.Second
			cluster.ConnectTimeout = 10 * time.Second
			username := strings.TrimSpace(os.Getenv("CASSANDRA_USERNAME"))
			password := strings.TrimSpace(os.Getenv("CASSANDRA_PASSWORD"))
			if username != "" && password != "" {
				cluster.Authenticator = gocql.PasswordAuthenticator{
					Username: username,
					Password: password,
				}
			}
			session, err := cluster.CreateSession()
			if err != nil {
				log.Warn("cassandra session failed, falling back to in-memory store",
					slog.String("error", err.Error()),
					slog.String("contact_points", contactPoints))
			} else {
				cassandraStore := lineagestore.NewCassandraStore(session)
				if err := cassandraStore.Migrate(ctx); err != nil {
					log.Warn("cassandra migrations failed, falling back to in-memory store",
						slog.String("error", err.Error()))
					session.Close()
				} else {
					store = cassandraStore
					cassandraSession = session
					log.Info("lineage runtime store: cassandra",
						slog.String("contact_points", contactPoints),
						slog.String("keyspace", cluster.Keyspace))
				}
			}
		}
		if cassandraSession == nil {
			log.Info("lineage runtime store: in-memory (set CASSANDRA_CONTACT_POINTS to enable Cassandra-backed store)")
		} else {
			defer cassandraSession.Close()
		}

		state := &lineage.AppState{
			DB:                         pool,
			Store:                      store,
			HTTPClient:                 &http.Client{Timeout: 30 * time.Second},
			DatasetServiceURL:          cfg.DatasetServiceURL,
			WorkflowServiceURL:         cfg.WorkflowServiceURL,
			DistributedPipelineWorkers: int(cfg.DistributedPipelineWorkers),
		}

		graphRepo := lineagegraph.New(pool)
		savedGraphsRepo := lineage.NewSavedGraphRepo(pool)
		descriptionsRepo := lineage.NewNodeDescriptionRepo(pool)
		lineageOpts = &server.Options{
			JWT:              authmw.NewJWTConfig(cfg.JWTSecret),
			Handlers:         handlers.NewHandlers(state),
			Graph:            handlers.NewGraphHandlers(graphRepo),
			SavedGraphs:      handlers.NewSavedGraphHandlers(savedGraphsRepo),
			NodeDescriptions: handlers.NewNodeDescriptionHandlers(descriptionsRepo),
		}

		// OpenLineage Kafka consumer. Only boots when KAFKA_BOOTSTRAP_SERVERS
		// is set so the binary stays usable in pure-HTTP environments (CI,
		// single-process compose, the legacy http_health mode). Producers
		// can always fall back to POST /api/v1/lineage/events.
		if brokers := strings.TrimSpace(os.Getenv("KAFKA_BOOTSTRAP_SERVERS")); brokers != "" {
			busCfg := databus.NewConfig(strings.Split(brokers, ","), databus.InsecureDev(cfg.Service.Name))
			sub, err := databus.NewKafkaSubscriber(busCfg, lineageconsumer.ConsumerGroup, []string{lineageconsumer.Topic})
			if err != nil {
				log.Error("lineage Kafka subscriber init failed", slog.String("error", err.Error()))
				os.Exit(1)
			}
			go func() {
				defer func() { _ = sub.Close() }()
				if err := lineageconsumer.Run(ctx, sub, graphRepo, log); err != nil {
					log.Error("lineage consumer exited", slog.String("error", err.Error()))
				}
			}()
			log.Info("lineage OpenLineage consumer started",
				slog.String("topic", lineageconsumer.Topic),
				slog.String("group", lineageconsumer.ConsumerGroup))
		} else {
			log.Info("KAFKA_BOOTSTRAP_SERVERS unset — OpenLineage Kafka consumer disabled (POST /api/v1/lineage/events still available)")
		}
	} else {
		log.Warn("DATABASE_URL or JWT_SECRET unset — booting in HTTP-health-only mode (lineage query surface disabled)")
	}

	metrics := observability.NewMetrics()
	srv := server.New(cfg, metrics, lineageOpts, probes.Postgres("primary", pool))
	if err := server.Run(ctx, srv, log); err != nil && !errors.Is(err, context.Canceled) {
		log.Error("server exited with error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}
