// Package token holds the pure types + helpers for the iceberg
// long-lived API token surface. Storage lives in internal/repo so the
// domain stays SQL-free and unit-testable.
//
// Mirrors services/iceberg-catalog-service/src/domain/token.rs.
package token

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// APIToken mirrors the `iceberg_api_tokens` row, minus the never-shown
// `token_hash`. The struct is the response shape both `issue` and the
// token CRUD endpoints surface.
type APIToken struct {
	ID         uuid.UUID  `json:"id"`
	UserID     uuid.UUID  `json:"user_id"`
	Name       string     `json:"name"`
	TokenHint  string     `json:"token_hint"`
	Scopes     []string   `json:"scopes"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
}

// IssuedToken pairs the persisted record with the one-and-only-time
// raw secret returned to the caller.
type IssuedToken struct {
	Record   APIToken
	RawToken string
}

// Hash hex-encodes the SHA-256 of the raw token. The catalog stores
// only this digest so a database leak doesn't expose live secrets.
//
// Matches the Rust `domain::token::hash_token` byte-for-byte (lower-case
// hex, no separators).
func Hash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// Mint generates the random `ofty_<64 hex>` payload, its hint and
// hash. The caller persists the row; this package only owns the
// secret-shaped logic.
func Mint() (raw, tokenHash, hint string, err error) {
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", "", "", fmt.Errorf("read random bytes: %w", err)
	}
	raw = "ofty_" + hex.EncodeToString(bytes[:])
	tokenHash = Hash(raw)
	hint = raw[len(raw)-4:]
	return raw, tokenHash, hint, nil
}

// HasOftyPrefix mirrors Rust's `token.strip_prefix("ofty_")` test in
// the bearer extractor.
func HasOftyPrefix(raw string) bool {
	return len(raw) > 5 && raw[:5] == "ofty_"
}
