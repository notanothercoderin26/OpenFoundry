// Command object-database-service hosts the runtime owner for ontology object
// storage (S1.7 of the Cassandra-Foundry parity plan).
//
// Production startup wires ObjectStore / LinkStore to libs/cassandra-kernel.
// In-memory storage is available only for explicit local/test execution via
// OF_DEV_STUB_MODE=true (or OBJECT_DATABASE_BACKEND=in_memory together with
// dev mode) so production deployments fail fast when Cassandra is missing.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/gocql/gocql"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/libs/capabilities"
	"github.com/openfoundry/openfoundry-go/libs/capabilities/probes"
	cassandrakernel "github.com/openfoundry/openfoundry-go/libs/cassandra-kernel"
	"github.com/openfoundry/openfoundry-go/libs/observability"
	"github.com/openfoundry/openfoundry-go/services/object-database-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/object-database-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/object-database-service/internal/server"
	"github.com/openfoundry/openfoundry-go/services/object-database-service/internal/storage"
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

	objects, links, backend, session, cleanup, err := buildStores(ctx, cfg, log)
	if err != nil {
		log.Error("storage wiring failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
	if cleanup != nil {
		defer cleanup()
	}

	// Optional Postgres pool — backs the transactional outbox per
	// ADR-0022 (B03 §G2 in PoC/blockers/). When DATABASE_URL is set,
	// every successful PutObject pairs the Cassandra row with an
	// outbox.events insert so `ontology-indexer` (and any other
	// Debezium consumer) eventually projects the change. When empty,
	// the service runs the legacy direct-write path with no event
	// emission — useful for stub / in-memory tests.
	var pgPool *pgxpool.Pool
	if strings.TrimSpace(cfg.DatabaseURL) != "" {
		pgPool, err = pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Error("pgx pool failed", slog.String("error", err.Error()))
			os.Exit(1)
		}
		defer pgPool.Close()
	} else if !cfg.DevMode {
		log.Error("DATABASE_URL is required outside dev mode for B03 outbox emission")
		os.Exit(1)
	}

	h := &handlers.Handlers{Objects: objects, Links: links, Backend: backend, OutboxPool: pgPool}
	if strings.TrimSpace(cfg.OntologyDefinitionURL) != "" {
		h.ObjectTypes = handlers.NewHTTPObjectTypePolicyResolver(cfg.OntologyDefinitionURL, 5*time.Second)
	}
	metrics := observability.NewMetrics()

	var deps []capabilities.DependencyProbe
	if session != nil {
		deps = append(deps, probes.Cassandra("object-store", session))
	}

	srv := server.New(cfg, h, metrics, deps...)
	if err := server.Run(ctx, srv, log); err != nil && !errors.Is(err, context.Canceled) {
		log.Error("server exited with error", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

var keyspaceNameRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{0,47}$`)

func buildStores(ctx context.Context, cfg *config.Config, log *slog.Logger) (storage.ObjectStore, storage.LinkStore, config.BackendMode, *gocql.Session, func(), error) {
	if cfg.Backend == config.BackendInMemory {
		if !cfg.DevMode {
			return nil, nil, "", nil, nil, errors.New("OBJECT_DATABASE_BACKEND=in_memory requires OF_DEV_STUB_MODE=true; in-memory storage is limited to local/test execution")
		}
		if log != nil {
			log.Warn("OF_DEV_STUB_MODE enabled with OBJECT_DATABASE_BACKEND=in_memory — using in-memory object/link stores for local/test execution")
		}
		return storage.NewInMemoryObjectStore(), storage.NewInMemoryLinkStore(), config.BackendInMemory, nil, nil, nil
	}

	if strings.TrimSpace(cfg.CassandraContactPoints) == "" {
		if cfg.DevMode {
			if log != nil {
				log.Warn("OF_DEV_STUB_MODE enabled with CASSANDRA_CONTACT_POINTS unset — using in-memory object/link stores for local/test execution")
			}
			return storage.NewInMemoryObjectStore(), storage.NewInMemoryLinkStore(), config.BackendInMemory, nil, nil, nil
		}
		return nil, nil, "", nil, nil, errors.New("CASSANDRA_CONTACT_POINTS is required for object-database-service production stores; set OF_DEV_STUB_MODE=true only for explicit local/test in-memory state")
	}

	if err := validateKeyspace("CASSANDRA_OBJECT_KEYSPACE", cfg.CassandraObjectKeyspace); err != nil {
		return nil, nil, "", nil, nil, err
	}
	if err := validateKeyspace("CASSANDRA_LINK_KEYSPACE", cfg.CassandraLinkKeyspace); err != nil {
		return nil, nil, "", nil, nil, err
	}

	hosts := cfg.CassandraPoints()
	if len(hosts) == 0 {
		return nil, nil, "", nil, nil, fmt.Errorf("CASSANDRA_CONTACT_POINTS resolved to no hosts: %q", cfg.CassandraContactPoints)
	}

	cluster := &cassandrakernel.Cluster{
		Hosts:       hosts,
		Username:    cfg.CassandraUsername,
		Password:    cfg.CassandraPassword,
		Datacenter:  cfg.CassandraLocalDC,
		DialTimeout: 5 * time.Second,
		NumConns:    2,
		Consistency: gocql.LocalQuorum,
	}
	session, err := cluster.Connect()
	if err != nil {
		return nil, nil, "", nil, nil, fmt.Errorf("connect Cassandra/Scylla: %w", err)
	}
	cleanup := func() { session.Close() }

	if err := cassandrakernel.Apply(session, cfg.CassandraObjectKeyspace, cassandrakernel.OntologyObjectStoreMigrations(cfg.CassandraObjectKeyspace)); err != nil {
		cleanup()
		return nil, nil, "", nil, nil, err
	}
	if err := cassandrakernel.Apply(session, cfg.CassandraLinkKeyspace, cassandrakernel.OntologyLinkStoreMigrations(cfg.CassandraLinkKeyspace)); err != nil {
		cleanup()
		return nil, nil, "", nil, nil, err
	}

	select {
	case <-ctx.Done():
		cleanup()
		return nil, nil, "", nil, nil, ctx.Err()
	default:
	}

	objects, links := storage.NewCassandraStores(session, cfg.CassandraObjectKeyspace, cfg.CassandraLinkKeyspace)
	if log != nil {
		log.Info("object-database storage wired to Cassandra", slog.String("object_keyspace", cfg.CassandraObjectKeyspace), slog.String("link_keyspace", cfg.CassandraLinkKeyspace))
	}
	return objects, links, config.BackendCassandra, session, cleanup, nil
}

func validateKeyspace(envName, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required for object-database-service production stores", envName)
	}
	if !keyspaceNameRe.MatchString(value) {
		return fmt.Errorf("%s %q is not a valid CQL identifier", envName, value)
	}
	return nil
}
