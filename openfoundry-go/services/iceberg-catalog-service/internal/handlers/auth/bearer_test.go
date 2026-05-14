package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/authz"
)

func TestExtractBearerHandlesLowercase(t *testing.T) {
	t.Parallel()
	h := http.Header{}
	h.Set("Authorization", "bearer abc")
	got, ok := extractBearer(h)
	if !ok || got != "abc" {
		t.Fatalf("got (%q,%v), want (\"abc\",true)", got, ok)
	}
}

func TestEnforceForMethodReadOnlyScope(t *testing.T) {
	t.Parallel()
	p := &AuthenticatedPrincipal{Subject: "u", Scopes: map[string]struct{}{"api:iceberg-read": {}}}
	if err := p.EnforceForMethod(http.MethodGet); err != nil {
		t.Fatalf("GET should pass with read scope, got %v", err)
	}
	if err := p.EnforceForMethod(http.MethodPost); err == nil {
		t.Fatal("POST should fail with read-only scope")
	}
}

func TestEnforceForMethodWriteScopeAllowsAll(t *testing.T) {
	t.Parallel()
	p := &AuthenticatedPrincipal{Subject: "u", Scopes: map[string]struct{}{"api:iceberg-write": {}}}
	for _, m := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
		if err := p.EnforceForMethod(m); err != nil {
			t.Fatalf("%s should pass with write scope, got %v", m, err)
		}
	}
}

func TestEnforceForMethodNoScopeRejects(t *testing.T) {
	t.Parallel()
	p := &AuthenticatedPrincipal{Subject: "u", Scopes: map[string]struct{}{}}
	if err := p.EnforceForMethod(http.MethodGet); err == nil {
		t.Fatal("GET should fail with no scope")
	}
	if err := p.EnforceForMethod(http.MethodPost); err == nil {
		t.Fatal("POST should fail with no scope")
	}
}

type fakeTokenStore struct {
	rec *StoredAPIToken
	err error
}

func (f *fakeTokenStore) ValidateAPIToken(_ context.Context, _ string) (*StoredAPIToken, error) {
	return f.rec, f.err
}

func TestAuthenticateAcceptsOftyToken(t *testing.T) {
	t.Parallel()
	cfg := &Config{Secret: []byte("k"), DefaultTenant: "default"}
	store := &fakeTokenStore{rec: &StoredAPIToken{
		ID:     uuid.New(),
		UserID: uuid.New(),
		Scopes: []string{"api:iceberg-read"},
	}}
	h := http.Header{}
	h.Set("Authorization", "Bearer ofty_abc123")
	p, err := Authenticate(context.Background(), h, cfg, store)
	if err != nil {
		t.Fatalf("authenticate: %v", err)
	}
	if !p.AllowsRead() {
		t.Fatal("expected AllowsRead true")
	}
	if p.AllowsWrite() {
		t.Fatal("expected AllowsWrite false")
	}
}

func TestAuthenticateAcceptsIcebergJWT(t *testing.T) {
	t.Parallel()
	cfg := &Config{Secret: []byte("dev-secret"), JWTAudience: "iceberg-catalog", JWTIssuer: "foundry-iceberg", DefaultTokenTTLSecs: 60}
	tok, err := IssueInternalJWT(cfg, "user-1", cfg.JWTIssuer, cfg.JWTAudience, []string{"api:iceberg-read"}, cfg.DefaultTokenTTLSecs)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	h := http.Header{}
	h.Set("Authorization", "Bearer "+tok)
	p, err := Authenticate(context.Background(), h, cfg, nil)
	if err != nil {
		t.Fatalf("authenticate: %v", err)
	}
	if p.Subject != "user-1" {
		t.Fatalf("subject mismatch: %s", p.Subject)
	}
}

func TestAuthenticateRejectsAudienceMismatch(t *testing.T) {
	t.Parallel()
	cfg := &Config{Secret: []byte("dev-secret"), JWTAudience: "iceberg-catalog", JWTIssuer: "foundry-iceberg", DefaultTokenTTLSecs: 60}
	tok, _ := IssueInternalJWT(cfg, "user-1", cfg.JWTIssuer, "other-audience", []string{"api:iceberg-read"}, cfg.DefaultTokenTTLSecs)
	h := http.Header{}
	h.Set("Authorization", "Bearer "+tok)
	if _, err := Authenticate(context.Background(), h, cfg, nil); err == nil {
		t.Fatal("expected audience mismatch to fail")
	}
}

func TestMiddlewareInjectsPrincipal(t *testing.T) {
	t.Parallel()
	cfg := &Config{Secret: []byte("k"), DefaultTokenTTLSecs: 60}
	store := &fakeTokenStore{rec: &StoredAPIToken{UserID: uuid.New(), Scopes: []string{"api:iceberg-read"}}}
	called := false
	h := Middleware(cfg, store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := PrincipalFromContext(r.Context())
		if !ok {
			t.Fatal("principal not injected")
		}
		if p.Kind != authz.PrincipalUser {
			t.Fatalf("kind: %s", p.Kind)
		}
		called = true
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer ofty_abc")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if !called {
		t.Fatalf("downstream handler not called; status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestMiddlewareRejectsMissingHeader(t *testing.T) {
	t.Parallel()
	cfg := &Config{Secret: []byte("k")}
	h := Middleware(cfg, nil)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Fatal("downstream should not run")
		_ = w
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", rec.Code)
	}
}
