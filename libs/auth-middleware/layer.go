package authmw

// layer.go exposes the auth wiring under two named aliases that callers
// expect to find — AuthLayer + AuthUser + AuthUser{From,Must}Context —
// so handlers don't have to mentally remap the API surface.
//
// AuthLayer(cfg) is identical to Middleware(cfg). Both return 401 on
// missing/invalid tokens with the response body strings "missing
// bearer token" / "authentication required"; tests below assert on
// those strings.

import (
	"context"
	"net/http"
)

// AuthUser is the typed wrapper around an authenticated *Claims.
// Use AuthUserFromContext or AuthUserFromRequest to extract it
// after the auth middleware has run; on missing claims both helpers
// return ok=false.
type AuthUser struct {
	Claims *Claims
}

// AuthLayer is the named alias for Middleware so call sites
// translating from Rust find the expected symbol. Behaviourally
// identical: extracts Authorization: Bearer <jwt>, validates it
// against cfg, stashes *Claims into the request context, returns
// 401 on missing/invalid/expired token.
//
// The Rust signature takes `axum::extract::State<JwtConfig>`; in Go
// we close over cfg directly — no service wiring difference.
func AuthLayer(cfg *JWTConfig) func(http.Handler) http.Handler {
	return Middleware(cfg)
}

// AuthUserFromContext is the Go analogue of
// `FromRequestParts for AuthUser`. Returns the AuthUser stashed by
// AuthLayer / Middleware. ok=false when the request was not
// authenticated.
func AuthUserFromContext(ctx context.Context) (AuthUser, bool) {
	c, ok := FromContext(ctx)
	if !ok {
		return AuthUser{}, false
	}
	return AuthUser{Claims: c}, true
}

// AuthUserFromRequest is the http.Request flavour. Reaches into
// r.Context() so call sites that already have the request don't
// have to thread the context through.
func AuthUserFromRequest(r *http.Request) (AuthUser, bool) {
	return AuthUserFromContext(r.Context())
}

// MustAuthUser panics when no AuthUser is in context. Use only on
// routes guarded by AuthLayer / Middleware (or Required). Mirrors
// MustFromContext for callers that prefer the typed wrapper.
func MustAuthUser(ctx context.Context) AuthUser {
	user, ok := AuthUserFromContext(ctx)
	if !ok {
		panic("authmw: AuthUser missing from context — did you forget to mount AuthLayer?")
	}
	return user
}
