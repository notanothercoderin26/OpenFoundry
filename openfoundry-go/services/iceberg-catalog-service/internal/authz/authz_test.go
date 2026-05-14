package authz

import (
	"context"
	"errors"
	"testing"
)

func principal(scopes ...string) *Principal {
	set := make(map[string]struct{}, len(scopes))
	for _, s := range scopes {
		set[s] = struct{}{}
	}
	return &Principal{Subject: "00000000-0000-0000-0000-000000000000", Scopes: set, Kind: PrincipalUser}
}

func TestAdminRoleExpandsClearanceLadder(t *testing.T) {
	t.Parallel()
	p := principal("role:admin")
	clearances := principalClearances(p)
	for _, want := range []string{"public", "confidential", "pii", "restricted", "secret"} {
		if !contains(clearances, want) {
			t.Fatalf("missing %q in %v", want, clearances)
		}
	}
}

func TestDenialReasonPrefersScopeOverClearance(t *testing.T) {
	t.Parallel()
	p := principal("api:iceberg-read", "iceberg-clearance:public")
	res := TableResource("t", "n", "default", 2, []string{"pii"}, nil)
	r := inferDenialReason(p, "iceberg::table::write_data", res, "default")
	if r != DenyMissingScope {
		t.Fatalf("got %s, want missing_scope", r)
	}
}

func TestMissingClearanceDetectedWhenScopePresent(t *testing.T) {
	t.Parallel()
	p := principal("api:iceberg-write", "iceberg-clearance:public")
	res := TableResource("t", "n", "default", 2, []string{"pii"}, nil)
	r := inferDenialReason(p, "iceberg::table::write_data", res, "default")
	if r != DenyMissingClearance {
		t.Fatalf("got %s, want missing_clearance", r)
	}
}

func TestPolicyEngineAllowsCleanRead(t *testing.T) {
	t.Parallel()
	eng := NewPolicyEngine("default")
	p := principal("api:iceberg-read", "iceberg-clearance:public")
	res := NamespaceResource("ns", "ri.foundry.main.project.x", "default", "lakehouse", []string{"public"})
	if err := eng.Enforce(context.Background(), p, "iceberg::namespace::view", res); err != nil {
		t.Fatalf("expected allow, got %v", err)
	}
}

func TestPolicyEngineDeniesMutationWithoutWriteScope(t *testing.T) {
	t.Parallel()
	eng := NewPolicyEngine("default")
	p := principal("api:iceberg-read", "iceberg-clearance:public")
	res := TableResource("t", "n", "default", 2, []string{"public"}, nil)
	err := eng.Enforce(context.Background(), p, "iceberg::table::write_data", res)
	var denied *DenyError
	if !errors.As(err, &denied) || denied.Reason != DenyMissingScope {
		t.Fatalf("got %v, want missing_scope", err)
	}
}

func TestPolicyEngineDeniesMissingRoleForManageMarkings(t *testing.T) {
	t.Parallel()
	eng := NewPolicyEngine("default")
	p := principal("api:iceberg-write", "iceberg-clearance:public", "iceberg-clearance:pii", "iceberg-clearance:confidential", "iceberg-clearance:restricted", "iceberg-clearance:secret")
	res := TableResource("t", "n", "default", 2, []string{"public"}, nil)
	err := eng.Enforce(context.Background(), p, "iceberg::table::manage_markings", res)
	var denied *DenyError
	if !errors.As(err, &denied) || denied.Reason != DenyMissingRole {
		t.Fatalf("got %v, want missing_role", err)
	}
}

func TestPolicyEngineAllowsManageMarkingsForAdmin(t *testing.T) {
	t.Parallel()
	eng := NewPolicyEngine("default")
	p := principal("api:iceberg-write", "role:admin")
	res := TableResource("t", "n", "default", 2, []string{"public", "pii"}, nil)
	if err := eng.Enforce(context.Background(), p, "iceberg::table::manage_markings", res); err != nil {
		t.Fatalf("admin should be allowed, got %v", err)
	}
}

func TestPolicyEngineDeniesAcrossTenants(t *testing.T) {
	t.Parallel()
	eng := NewPolicyEngine("acme")
	p := &Principal{Subject: "u", Scopes: map[string]struct{}{"api:iceberg-write": {}, "role:admin": {}}, Kind: PrincipalUser, Tenant: "acme"}
	res := NamespaceResource("ns", "p", "evilcorp", "lakehouse", nil)
	err := eng.Enforce(context.Background(), p, "iceberg::namespace::view", res)
	var denied *DenyError
	if !errors.As(err, &denied) || denied.Reason != DenyOutOfTenant {
		t.Fatalf("got %v, want out_of_tenant", err)
	}
}

func TestPrincipalKindFromScopes(t *testing.T) {
	t.Parallel()
	user := map[string]struct{}{"api:iceberg-read": {}}
	if k := PrincipalKindFromScopes(user); k != PrincipalUser {
		t.Fatalf("expected User, got %s", k)
	}
	svc := map[string]struct{}{"svc:my-app": {}, "api:iceberg-write": {}}
	if k := PrincipalKindFromScopes(svc); k != PrincipalServicePrincipal {
		t.Fatalf("expected ServicePrincipal, got %s", k)
	}
}
