// Package capabilities is the agent-facing self-description layer for
// every OpenFoundry HTTP service.
//
// A *capability* is a stable, machine-readable record of one HTTP
// endpoint a service exposes. Services register their capabilities at
// router-wiring time; the package then serves them under
// `GET /_meta/capabilities` so an AI agent (or any external caller)
// can enumerate the surface without reading source code.
//
// Design goals (see docs/agent-automation/AGENT-CAPABILITIES-ROADMAP.md
// — Milestone M1.1):
//
//   - **Co-located with the handler.** Drift between the registered
//     capability and the actual route is impossible because both are
//     declared in the same call site (see [Register]).
//   - **Zero coupling to chi.** The library accepts any router that
//     implements [Router]; chi happens to satisfy it.
//   - **Stable JSON shape.** The on-the-wire schema is version 1 and
//     additive only. New optional fields may be appended; existing
//     fields never change meaning.
//   - **No globals.** A service builds one [Registry] and threads it
//     through wiring — same pattern as `*AppState` / `*Handlers`.
//
// The library does *not* perform discovery across services. The
// gateway aggregator (M1.1 task #3) consumes per-service
// `/_meta/capabilities` responses and unions them.
package capabilities

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// SchemaVersion is bumped only on breaking changes to the wire shape.
// Additive changes (new optional fields) keep the version unchanged.
const SchemaVersion = 1

// Capability is a single HTTP endpoint declaration.
//
// JSON tags match the wire contract documented in the roadmap. All
// optional fields use `omitempty` so the snapshot stays compact.
type Capability struct {
	// ID is a stable, dot-separated identifier
	// (`<service>.<resource>.<verb>`). Used as the primary key when
	// agents need to refer to a capability across releases.
	ID string `json:"id"`

	// Service is the owning service's short name (e.g.
	// `ontology-actions`). Set automatically by [Registry.Register]
	// from the registry's own service name; callers may leave it empty.
	Service string `json:"service"`

	// Method is the HTTP verb (`GET`, `POST`, …). Always upper-case.
	Method string `json:"method"`

	// Path is the chi route pattern (e.g.
	// `/api/v1/ontology/types/{id}`). Path parameters keep their chi
	// `{name}` form so agents can substitute them mechanically.
	Path string `json:"path"`

	// Stable signals API-stability. `true` means the capability is
	// covered by the drift CI guard (M1.1 task #4) and may not
	// disappear without an ADR. Default `false` for in-development
	// endpoints.
	Stable bool `json:"stable"`

	// RequiresAuth is true when the handler is mounted behind
	// `authmw.Middleware`. The aggregator uses this to short-circuit
	// auth probes when listing public endpoints.
	RequiresAuth bool `json:"requires_auth"`

	// ProtoMessage is the fully-qualified protobuf message name that
	// describes the request/response body, when one exists. Empty for
	// REST-only endpoints. Example: `openfoundry.ontology.v1.Action`.
	ProtoMessage string `json:"proto_message,omitempty"`

	// Summary is a one-line human-readable description. Optional but
	// recommended; `of-cli capability list` renders it.
	Summary string `json:"summary,omitempty"`

	// Tags group capabilities for browsing (`ontology`, `admin`,
	// `meta`, …). Free-form; the gateway aggregator uses them for
	// filtering.
	Tags []string `json:"tags,omitempty"`
}

// Validate enforces the invariants the registry depends on. It is
// called automatically by [Registry.Register]; tests may invoke it
// directly when asserting on a hand-crafted [Capability].
//
// Errors are returned with stable prefixes so callers can match on
// them with [errors.Is] using the sentinels below.
func (c Capability) Validate() error {
	if strings.TrimSpace(c.ID) == "" {
		return ErrInvalidCapability
	}
	if strings.ContainsAny(c.ID, " \t\n") {
		return fmt.Errorf("%w: id %q contains whitespace", ErrInvalidCapability, c.ID)
	}
	if !knownMethods[strings.ToUpper(c.Method)] {
		return fmt.Errorf("%w: method %q is not a known HTTP verb", ErrInvalidCapability, c.Method)
	}
	if !strings.HasPrefix(c.Path, "/") {
		return fmt.Errorf("%w: path %q must start with '/'", ErrInvalidCapability, c.Path)
	}
	return nil
}

// ErrInvalidCapability is returned by [Capability.Validate] and
// [Registry.Register] when a capability declaration is malformed.
var ErrInvalidCapability = errors.New("capabilities: invalid capability")

// ErrDuplicateCapability is returned when two capabilities with the
// same `ID` are registered against the same [Registry].
var ErrDuplicateCapability = errors.New("capabilities: duplicate capability id")

// knownMethods is the closed set of verbs the registry accepts. Chi
// supports a few exotic ones (CONNECT, TRACE) we deliberately omit
// because the agent surface should not expose them.
var knownMethods = map[string]bool{
	http.MethodGet:     true,
	http.MethodHead:    true,
	http.MethodPost:    true,
	http.MethodPut:     true,
	http.MethodPatch:   true,
	http.MethodDelete:  true,
	http.MethodOptions: true,
}
