// Package authz is the iceberg-catalog ABAC engine.
//
// Mirrors services/iceberg-catalog-service/src/authz.rs. The Rust
// version delegates to a Cedar policy store; Go has no Cedar binding,
// so this package ports the bundled iceberg-policy decision logic
// directly into a small `Engine` interface. The decision contract is
// identical:
//
//  1. Mutating actions (`*::write*`, `*::create*`, `*::drop*`,
//     `*::alter*`, `*::manage_markings`) require the
//     `api:iceberg-write` scope on the principal.
//  2. The principal's clearance set must be a superset of the
//     resource's marking set. Clearance scopes are
//     `iceberg-clearance:<name>`. `role:admin` and
//     `iceberg-clearance:*` expand to the full ladder.
//  3. `manage_markings` and `*::drop*` additionally require an
//     elevated role: `role:admin` or `role:editor`.
//  4. The resource's tenant must match the principal's tenant.
//
// On `Deny` an audit event `iceberg.access.denied` is emitted with the
// inferred denial reason — same vocabulary the Rust impl uses.
package authz

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/audit"
)

// PrincipalKind disambiguates the two callers iceberg recognises:
// human users (long-lived `ofty_*` tokens) and machine-to-machine
// service principals (OAuth2 client_credentials JWTs). The bearer
// extractor decides which one based on token shape.
type PrincipalKind int

const (
	PrincipalUser PrincipalKind = iota
	PrincipalServicePrincipal
)

func (k PrincipalKind) String() string {
	switch k {
	case PrincipalServicePrincipal:
		return "ServicePrincipal"
	default:
		return "User"
	}
}

// Principal is the shape the engine inspects. It mirrors the bearer-
// extracted `AuthenticatedPrincipal` minus HTTP plumbing.
type Principal struct {
	Subject string
	Scopes  map[string]struct{}
	Kind    PrincipalKind
	Tenant  string
}

// HasScope reports whether `scope` is in the principal's scope set.
func (p *Principal) HasScope(scope string) bool {
	_, ok := p.Scopes[scope]
	return ok
}

// HasAnyScope reports whether any scope in `candidates` is set.
func (p *Principal) HasAnyScope(candidates ...string) bool {
	for _, c := range candidates {
		if p.HasScope(c) {
			return true
		}
	}
	return false
}

// Resource carries the fully-hydrated attributes the iceberg policies
// inspect. Either `Namespace` or `Table` is populated; the other is
// nil. Mirrors the Rust `AuthzResource` enum.
type Resource struct {
	Namespace *NamespaceAttrs
	Table     *TableAttrs
}

// NamespaceAttrs are the marking + tenant facts policies read off a
// namespace-scoped action.
type NamespaceAttrs struct {
	RID        string
	ProjectRID string
	Tenant     string
	Name       string
	Markings   []string
}

// TableAttrs are the marking + tenant facts policies read off a
// table-scoped action. `ExplicitMarkings` is surfaced for policies
// that want to differentiate explicit overrides from inherited ones.
type TableAttrs struct {
	RID              string
	NamespaceRID     string
	Tenant           string
	FormatVersion    int32
	Markings         []string
	ExplicitMarkings []string
}

// DenialReason mirrors the Rust enum so dashboards can split denial
// counters by cause without duplicating the vocabulary.
type DenialReason int

const (
	DenyMissingClearance DenialReason = iota
	DenyMissingScope
	DenyMissingRole
	DenyOutOfTenant
	DenyUnknown
)

func (r DenialReason) String() string {
	switch r {
	case DenyMissingClearance:
		return "missing_clearance"
	case DenyMissingScope:
		return "missing_scope"
	case DenyMissingRole:
		return "missing_role"
	case DenyOutOfTenant:
		return "out_of_tenant"
	default:
		return "unknown"
	}
}

// DenyError is returned by Engine.Enforce when a request is denied.
// The handler maps it to HTTP 403 + the audit event already written
// by the engine.
type DenyError struct {
	Action string
	Reason DenialReason
}

func (e *DenyError) Error() string {
	return fmt.Sprintf("iceberg authz denied for `%s` (%s)", e.Action, e.Reason)
}

// Engine is the ABAC interface handlers depend on. Production wires
// a `*PolicyEngine`; tests can substitute a fake.
type Engine interface {
	Enforce(ctx context.Context, principal *Principal, action string, resource *Resource) error
}

// PolicyEngine is the production decider. Stateless today — the
// bundled iceberg policies are baked into the decision logic — but
// kept as a struct so future Cedar / Rego backends can replace it
// without churning callers.
type PolicyEngine struct {
	defaultTenant string
}

// NewPolicyEngine constructs the production engine. `defaultTenant`
// is used when a principal token doesn't carry one.
func NewPolicyEngine(defaultTenant string) *PolicyEngine {
	if defaultTenant == "" {
		defaultTenant = "default"
	}
	return &PolicyEngine{defaultTenant: defaultTenant}
}

// Enforce returns nil on allow, a *DenyError otherwise. On deny it
// emits `iceberg.access.denied` audit before returning so callers
// don't need to remember.
func (p *PolicyEngine) Enforce(_ context.Context, principal *Principal, action string, resource *Resource) error {
	if isAllowed(principal, action, resource, p.defaultTenant) {
		return nil
	}
	reason := inferDenialReason(principal, action, resource, p.defaultTenant)
	subject := principalSubject(principal)
	audit.AccessDenied(subject, targetRID(resource), action, reason.String())
	return &DenyError{Action: action, Reason: reason}
}

// isAllowed evaluates the bundled iceberg policy. Kept inline (no
// Cedar) — the Rust authz.rs Cedar policies are equivalent to this
// guard set, and the Rust `infer_denial_reason` is the same predicate
// expressed for dashboard use.
func isAllowed(principal *Principal, action string, resource *Resource, defaultTenant string) bool {
	if !principalTenantMatches(principal, resource, defaultTenant) {
		return false
	}
	if isMutatingAction(action) && !principal.HasScope("api:iceberg-write") {
		return false
	}
	if requiresElevatedRole(action) && !principalHasElevatedRole(principal) {
		return false
	}
	cleared := principalClearances(principal)
	for _, m := range resourceMarkings(resource) {
		if !contains(cleared, m) {
			return false
		}
	}
	return true
}

func inferDenialReason(principal *Principal, action string, resource *Resource, defaultTenant string) DenialReason {
	if !principalTenantMatches(principal, resource, defaultTenant) {
		return DenyOutOfTenant
	}
	if isMutatingAction(action) && !principal.HasScope("api:iceberg-write") {
		return DenyMissingScope
	}
	cleared := principalClearances(principal)
	for _, m := range resourceMarkings(resource) {
		if !contains(cleared, m) {
			return DenyMissingClearance
		}
	}
	if requiresElevatedRole(action) && !principalHasElevatedRole(principal) {
		return DenyMissingRole
	}
	return DenyUnknown
}

func isMutatingAction(action string) bool {
	return strings.Contains(action, "write") ||
		strings.Contains(action, "alter") ||
		strings.Contains(action, "drop") ||
		strings.Contains(action, "create") ||
		strings.Contains(action, "manage_markings")
}

func requiresElevatedRole(action string) bool {
	return strings.Contains(action, "manage_markings") || strings.Contains(action, "drop")
}

func principalHasElevatedRole(principal *Principal) bool {
	return principal.HasAnyScope("role:admin", "role:editor")
}

// principalClearances mirrors the Rust helper: union of token-level
// `iceberg-clearance:<name>` scopes with the standard ladder for
// admin / wildcard tokens.
func principalClearances(principal *Principal) []string {
	out := make([]string, 0, len(principal.Scopes))
	wildcard := false
	for s := range principal.Scopes {
		if name, ok := strings.CutPrefix(s, "iceberg-clearance:"); ok {
			if name == "*" {
				wildcard = true
				continue
			}
			out = append(out, name)
		}
		if s == "role:admin" {
			wildcard = true
		}
	}
	if wildcard {
		out = append(out, "public", "confidential", "pii", "restricted", "secret")
	}
	out = dedup(out)
	return out
}

func resourceMarkings(resource *Resource) []string {
	if resource == nil {
		return nil
	}
	if resource.Namespace != nil {
		return resource.Namespace.Markings
	}
	if resource.Table != nil {
		return resource.Table.Markings
	}
	return nil
}

func principalTenantMatches(principal *Principal, resource *Resource, defaultTenant string) bool {
	wantTenant := ""
	if resource != nil {
		switch {
		case resource.Namespace != nil:
			wantTenant = resource.Namespace.Tenant
		case resource.Table != nil:
			wantTenant = resource.Table.Tenant
		}
	}
	if wantTenant == "" {
		wantTenant = defaultTenant
	}
	have := principal.Tenant
	if have == "" {
		have = defaultTenant
	}
	return have == wantTenant
}

func principalSubject(principal *Principal) uuid.UUID {
	if principal == nil {
		return uuid.Nil
	}
	id, err := uuid.Parse(principal.Subject)
	if err != nil {
		return uuid.Nil
	}
	return id
}

func targetRID(resource *Resource) string {
	if resource == nil {
		return ""
	}
	if resource.Namespace != nil {
		return resource.Namespace.RID
	}
	if resource.Table != nil {
		return resource.Table.RID
	}
	return ""
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func dedup(in []string) []string {
	if len(in) <= 1 {
		return in
	}
	seen := make(map[string]struct{}, len(in))
	out := in[:0]
	for _, v := range in {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

// PrincipalKindFromScopes mirrors the Rust derivation: tokens with a
// `svc:*` scope are service principals, anything else is a user.
func PrincipalKindFromScopes(scopes map[string]struct{}) PrincipalKind {
	for s := range scopes {
		if strings.HasPrefix(s, "svc:") {
			return PrincipalServicePrincipal
		}
	}
	return PrincipalUser
}

// NamespaceResource is a small helper for handlers that build a
// resource from a hydrated namespace.
func NamespaceResource(rid, projectRID, tenant, name string, markings []string) *Resource {
	return &Resource{Namespace: &NamespaceAttrs{
		RID:        rid,
		ProjectRID: projectRID,
		Tenant:     tenant,
		Name:       name,
		Markings:   markings,
	}}
}

// TableResource is the matching helper for table-scoped actions.
func TableResource(rid, namespaceRID, tenant string, formatVersion int32, markings, explicit []string) *Resource {
	return &Resource{Table: &TableAttrs{
		RID:              rid,
		NamespaceRID:     namespaceRID,
		Tenant:           tenant,
		FormatVersion:    formatVersion,
		Markings:         markings,
		ExplicitMarkings: explicit,
	}}
}
