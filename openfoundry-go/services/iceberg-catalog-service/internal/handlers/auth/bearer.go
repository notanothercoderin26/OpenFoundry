// Package auth implements the iceberg-flavoured bearer token surface
// (`ofty_*` long-lived tokens + iceberg JWTs) and the OAuth2 token
// endpoint per the Apache Iceberg REST Catalog spec § Authentication.
//
// Mirrors services/iceberg-catalog-service/src/handlers/auth/. The
// existing Foundry-wide JWT middleware (libs/auth-middleware) keeps
// gating the admin and append surfaces; only the Iceberg REST routes
// authenticate through this package.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/authz"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/domain/token"
)

// IcebergClaims is the JWT claim shape used by the iceberg surface.
// Kept separate from `auth_middleware::Claims` so the iceberg routes
// don't leak internal Foundry roles/permissions to external clients.
//
// `scp` carries scopes as a space-separated string (the OAuth2 norm);
// `iceberg_scopes` is the array form PyIceberg emits. Both are merged
// when extracting a principal.
type IcebergClaims struct {
	Sub           string   `json:"sub"`
	Iss           string   `json:"iss"`
	Aud           string   `json:"aud"`
	Exp           int64    `json:"exp"`
	Iat           int64    `json:"iat"`
	Scp           string   `json:"scp,omitempty"`
	IcebergScopes []string `json:"iceberg_scopes,omitempty"`
	Tenant        string   `json:"tenant,omitempty"`
}

// GetExpirationTime adapts the claim shape to jwt-go validation.
func (c IcebergClaims) GetExpirationTime() (*jwt.NumericDate, error) {
	return jwt.NewNumericDate(time.Unix(c.Exp, 0)), nil
}
func (c IcebergClaims) GetIssuedAt() (*jwt.NumericDate, error) {
	return jwt.NewNumericDate(time.Unix(c.Iat, 0)), nil
}
func (c IcebergClaims) GetNotBefore() (*jwt.NumericDate, error) { return nil, nil }
func (c IcebergClaims) GetIssuer() (string, error)              { return c.Iss, nil }
func (c IcebergClaims) GetSubject() (string, error)             { return c.Sub, nil }
func (c IcebergClaims) GetAudience() (jwt.ClaimStrings, error) {
	if c.Aud == "" {
		return nil, nil
	}
	return jwt.ClaimStrings{c.Aud}, nil
}

// AuthenticatedPrincipal is the post-extraction subject + scope set
// every iceberg handler depends on. Mirrors the Rust struct.
type AuthenticatedPrincipal struct {
	Subject string
	Scopes  map[string]struct{}
	Kind    authz.PrincipalKind
	Tenant  string
}

// AllowsRead mirrors the Rust helper: read access is granted by either
// `api:iceberg-read` or `api:iceberg-write` (write implies read).
func (p *AuthenticatedPrincipal) AllowsRead() bool {
	_, r := p.Scopes["api:iceberg-read"]
	_, w := p.Scopes["api:iceberg-write"]
	return r || w
}

// AllowsWrite reports whether the principal carries the write scope.
func (p *AuthenticatedPrincipal) AllowsWrite() bool {
	_, w := p.Scopes["api:iceberg-write"]
	return w
}

// EnforceForMethod returns nil iff the HTTP method is permitted by the
// principal's scope set. Mutating verbs require the write scope; safe
// verbs require the read scope.
func (p *AuthenticatedPrincipal) EnforceForMethod(method string) error {
	needsWrite := method == http.MethodPost ||
		method == http.MethodDelete ||
		method == http.MethodPut ||
		method == http.MethodPatch
	if needsWrite && !p.AllowsWrite() {
		return ErrForbidden{Message: "scope `api:iceberg-write` is required"}
	}
	if !needsWrite && !p.AllowsRead() {
		return ErrForbidden{Message: "scope `api:iceberg-read` is required"}
	}
	return nil
}

// AsAuthzPrincipal converts the bearer-extracted principal into the
// shape the ABAC engine inspects.
func (p *AuthenticatedPrincipal) AsAuthzPrincipal() *authz.Principal {
	scopes := make(map[string]struct{}, len(p.Scopes))
	for s := range p.Scopes {
		scopes[s] = struct{}{}
	}
	return &authz.Principal{
		Subject: p.Subject,
		Scopes:  scopes,
		Kind:    p.Kind,
		Tenant:  p.Tenant,
	}
}

// ErrUnauthenticated is returned when a request carries no bearer
// header or the token is invalid / expired.
type ErrUnauthenticated struct{ Detail string }

func (e ErrUnauthenticated) Error() string {
	if e.Detail == "" {
		return "authentication required"
	}
	return "authentication required: " + e.Detail
}

// ErrForbidden is returned when the principal lacks a required scope.
type ErrForbidden struct{ Message string }

func (e ErrForbidden) Error() string { return e.Message }

// TokenStore is the slice of repo behaviour the bearer extractor needs
// for `ofty_*` token validation. Defining the interface here lets unit
// tests substitute a fake without pulling pgx into the test process.
type TokenStore interface {
	ValidateAPIToken(ctx context.Context, raw string) (*StoredAPIToken, error)
}

// StoredAPIToken is the projection ValidateAPIToken returns. The
// fields mirror the persisted row's user-facing surface.
type StoredAPIToken struct {
	ID     uuid.UUID
	UserID uuid.UUID
	Scopes []string
	Tenant string
}

// Config bundles the JWT validation knobs the bearer extractor reads.
// Kept separate from authmw.JWTConfig so the iceberg surface signs
// with its own secret cache (a different default and env var lookup).
type Config struct {
	Secret              []byte
	JWTAudience         string
	JWTIssuer           string
	DefaultTokenTTLSecs int64
	DefaultTenant       string
}

// LoadSecret resolves the iceberg JWT secret with the same fallback
// chain as Rust: OPENFOUNDRY_JWT_SECRET → JWT_SECRET → dev default.
func LoadSecret() []byte {
	for _, key := range []string{"OPENFOUNDRY_JWT_SECRET", "JWT_SECRET"} {
		if v := os.Getenv(key); v != "" {
			return []byte(v)
		}
	}
	return []byte("iceberg-catalog-dev-secret")
}

type ctxKey struct{}

// ContextWithPrincipal injects the bearer-extracted principal into
// the request context so downstream handlers retrieve it.
func ContextWithPrincipal(ctx context.Context, p *AuthenticatedPrincipal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}

// PrincipalFromContext retrieves the principal injected by the bearer
// middleware. Returns (nil, false) if the request is unauthenticated.
func PrincipalFromContext(ctx context.Context) (*AuthenticatedPrincipal, bool) {
	v, ok := ctx.Value(ctxKey{}).(*AuthenticatedPrincipal)
	return v, ok && v != nil
}

// Authenticate parses the `Authorization` header against the store
// and JWT config, returning the principal — or a typed error mapping
// to 401 / 403. Mirrors the Rust `authenticate` async fn.
func Authenticate(ctx context.Context, header http.Header, cfg *Config, store TokenStore) (*AuthenticatedPrincipal, error) {
	raw, ok := extractBearer(header)
	if !ok {
		return nil, ErrUnauthenticated{}
	}
	if token.HasOftyPrefix(raw) {
		if store == nil {
			return nil, ErrUnauthenticated{Detail: "ofty token store unavailable"}
		}
		record, err := store.ValidateAPIToken(ctx, raw)
		if err != nil || record == nil {
			return nil, ErrUnauthenticated{Detail: "ofty token rejected"}
		}
		scopes := make(map[string]struct{}, len(record.Scopes))
		for _, s := range record.Scopes {
			scopes[s] = struct{}{}
		}
		return &AuthenticatedPrincipal{
			Subject: record.UserID.String(),
			Scopes:  scopes,
			Kind:    authz.PrincipalKindFromScopes(scopes),
			Tenant:  defaultStr(record.Tenant, cfg.DefaultTenant),
		}, nil
	}

	claims, err := decodeIcebergJWT(raw, cfg)
	if err != nil {
		return nil, ErrUnauthenticated{Detail: err.Error()}
	}
	scopes := make(map[string]struct{})
	for _, s := range strings.Fields(claims.Scp) {
		scopes[s] = struct{}{}
	}
	for _, s := range claims.IcebergScopes {
		scopes[s] = struct{}{}
	}
	return &AuthenticatedPrincipal{
		Subject: claims.Sub,
		Scopes:  scopes,
		Kind:    authz.PrincipalKindFromScopes(scopes),
		Tenant:  defaultStr(claims.Tenant, cfg.DefaultTenant),
	}, nil
}

// Middleware authenticates requests on the iceberg REST surface.
// It also enforces the verb-level read/write scope distinction the
// Rust `enforce_for_method` does at extractor time.
func Middleware(cfg *Config, store TokenStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, err := Authenticate(r.Context(), r.Header, cfg, store)
			if err != nil {
				WriteAuthError(w, err)
				return
			}
			if err := p.EnforceForMethod(r.Method); err != nil {
				WriteAuthError(w, err)
				return
			}
			next.ServeHTTP(w, r.WithContext(ContextWithPrincipal(r.Context(), p)))
		})
	}
}

// IssueInternalJWT signs an iceberg-flavoured JWT with the shared
// HS256 secret. Used by the OAuth2 endpoint and integration tests.
//
// Mirrors `issue_internal_jwt` in Rust: HS256, claim shape preserved,
// `scp` joined with spaces, `iceberg_scopes` carrying the array.
func IssueInternalJWT(cfg *Config, subject, issuer, audience string, scopes []string, ttlSecs int64) (string, error) {
	now := time.Now().Unix()
	claims := IcebergClaims{
		Sub:           subject,
		Iss:           issuer,
		Aud:           audience,
		Iat:           now,
		Exp:           now + ttlSecs,
		Scp:           strings.Join(scopes, " "),
		IcebergScopes: append([]string(nil), scopes...),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(cfg.Secret)
	if err != nil {
		return "", fmt.Errorf("jwt encode: %w", err)
	}
	return signed, nil
}

func decodeIcebergJWT(raw string, cfg *Config) (*IcebergClaims, error) {
	parser := jwt.NewParser(jwt.WithValidMethods([]string{"HS256"}))
	out := &IcebergClaims{}
	parsed, err := parser.ParseWithClaims(raw, out, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return cfg.Secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !parsed.Valid {
		return nil, errors.New("token not valid")
	}
	if cfg.JWTAudience != "" && out.Aud != cfg.JWTAudience {
		return nil, fmt.Errorf("audience mismatch: %q != %q", out.Aud, cfg.JWTAudience)
	}
	return out, nil
}

func extractBearer(h http.Header) (string, bool) {
	raw := h.Get("Authorization")
	if raw == "" {
		return "", false
	}
	if v, ok := strings.CutPrefix(raw, "Bearer "); ok {
		return v, true
	}
	if v, ok := strings.CutPrefix(raw, "bearer "); ok {
		return v, true
	}
	return "", false
}

// WriteAuthError serialises a typed bearer error as the JSON envelope
// the catalog uses everywhere else (`{"error":{...}}`).
func WriteAuthError(w http.ResponseWriter, err error) {
	status := http.StatusUnauthorized
	msg := "authentication required"
	var fb ErrForbidden
	if errors.As(err, &fb) {
		status = http.StatusForbidden
		msg = fb.Message
	} else if e := (ErrUnauthenticated{}); errors.As(err, &e) {
		msg = e.Error()
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	body := map[string]any{"error": map[string]any{
		"message": msg,
		"type":    typeFromStatus(status),
		"code":    status,
	}}
	_ = json.NewEncoder(w).Encode(body)
}

func typeFromStatus(status int) string {
	switch status {
	case http.StatusUnauthorized:
		return "AuthenticationException"
	case http.StatusForbidden:
		return "ForbiddenException"
	default:
		return "BadRequestException"
	}
}

func defaultStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
