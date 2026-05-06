// Package flightsql implements the gateway's primary surface: an
// Arrow Flight SQL gRPC server on port 50133.
//
// PORT STATUS — divergence from Rust documented up-front
//
// The Rust implementation
// (services/sql-bi-gateway-service/src/flight_sql.rs) embeds Apache
// Arrow's `arrow-flight` crate and uses DataFusion to execute
// statements that target the local catalog. Go has neither: the
// `apache/arrow-go` Flight SQL bindings exist but ship the proto +
// transport only, and there is no production-quality DataFusion
// equivalent in Go. A full port therefore requires either:
//
//  1. Adding `github.com/apache/arrow-go/v18` to the workspace and
//     implementing the local DataFusion-equivalent execution path
//     (out of scope — same strategy as `libs/search-abstraction`
//     deferred its Vespa/OpenSearch HTTP backends), or
//  2. Always delegating local-Iceberg statements to a configured
//     warehousing endpoint, which works today but changes the
//     deployment contract (warehousing URL becomes mandatory).
//
// Until path 1 lands the listener accepts TCP connections, logs the
// dial attempt and closes the socket so probes fail fast with a
// clear message rather than hanging. Authentication, routing and
// audit are all wired and unit-tested via the
// `internal/auth`, `internal/routing` and `internal/audit` packages
// so the day the proxy bindings land the per-RPC handlers can plug
// straight into them with zero churn on the surrounding service.
package flightsql

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"strconv"
	"sync"

	"github.com/openfoundry/openfoundry-go/services/sql-bi-gateway-service/internal/auth"
	"github.com/openfoundry/openfoundry-go/services/sql-bi-gateway-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/sql-bi-gateway-service/internal/routing"
)

// Service is the substrate Flight SQL listener. It accepts TCP
// connections, then logs and closes them with a clear error so BI
// clients see an immediate failure instead of a hung dial.
type Service struct {
	cfg    *config.Config
	auth   *auth.Authenticator
	router *routing.BackendRouter
	log    *slog.Logger

	mu       sync.Mutex
	closed   chan struct{}
	listener net.Listener
}

// New builds a Service. The Authenticator and BackendRouter are
// resolved here once so they are stable across requests.
func New(cfg *config.Config, log *slog.Logger) *Service {
	return &Service{
		cfg:    cfg,
		auth:   auth.NewAuthenticator(cfg.JWTSecret, cfg.AllowAnonymous),
		router: routing.FromConfig(cfg),
		log:    log,
		closed: make(chan struct{}),
	}
}

// Authenticator borrows the gateway's JWT authenticator. Useful for
// in-process tests and for the day the proxy bindings land and the
// Flight SQL service handlers need to call it from the gRPC stack.
func (s *Service) Authenticator() *auth.Authenticator { return s.auth }

// Router borrows the configured BackendRouter — same rationale as
// Authenticator above.
func (s *Service) Router() *routing.BackendRouter { return s.router }

// ListenAndServe binds the TCP port advertised by cfg.Port and runs
// until ctx is cancelled or Stop is called.
func (s *Service) ListenAndServe(ctx context.Context) error {
	addr := s.cfg.Host + ":" + strconv.FormatUint(uint64(s.cfg.Port), 10)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.listener = ln
	s.mu.Unlock()

	s.log.Info("flight-sql listener bound (substrate-only)",
		slog.String("addr", addr),
		slog.Bool("allow_anonymous", s.cfg.AllowAnonymous))

	go func() {
		<-ctx.Done()
		_ = s.Stop()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-s.closed:
				return nil
			default:
			}
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			return err
		}
		go s.serveOne(conn)
	}
}

// Stop closes the listener and unblocks ListenAndServe.
func (s *Service) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	select {
	case <-s.closed:
		return nil
	default:
		close(s.closed)
	}
	if s.listener != nil {
		return s.listener.Close()
	}
	return nil
}

// serveOne logs the connect attempt and closes the socket. When the
// proxy bindings land, this is where the per-connection gRPC server
// will be wired. Until then we fail fast so BI clients fall back to
// the HTTP side router or to direct backend connections.
func (s *Service) serveOne(conn net.Conn) {
	defer conn.Close()
	s.log.Warn("flight-sql request received but execution is unimplemented in the Go port",
		slog.String("remote", conn.RemoteAddr().String()),
		slog.String("port_status", "substrate-only — see internal/flightsql/server.go top comment"),
	)
}
