package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/audit"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/domain/token"
)

// IssueAPITokenStore is the slice of repo behaviour the api-token mint
// endpoint needs. Defining the shape here keeps the package free of
// pgx coupling so unit tests can pass a fake.
type IssueAPITokenStore interface {
	IssueAPIToken(ctx context.Context, userID uuid.UUID, name string, scopes []string, expiresAt *time.Time) (*token.APIToken, string, error)
}

// CreateAPITokenRequest is the body of POST /v1/iceberg-clients/api-tokens.
// Mirrors the Rust struct field-for-field.
type CreateAPITokenRequest struct {
	Name    string   `json:"name"`
	Scopes  []string `json:"scopes,omitempty"`
	TTLSecs *int64   `json:"ttl_secs,omitempty"`
}

// CreateAPITokenResponse is the surface that exposes the secret
// exactly once. Subsequent reads only show id + hint + scopes.
type CreateAPITokenResponse struct {
	ID        uuid.UUID  `json:"id"`
	Name      string     `json:"name"`
	TokenHint string     `json:"token_hint"`
	Scopes    []string   `json:"scopes"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	RawToken  string     `json:"raw_token"`
}

// CreateAPITokenHandler returns the handler bound to `store`. Callers
// must authenticate with a Foundry user JWT (the standard
// `auth-middleware` chain) — this endpoint does not accept iceberg
// bearer tokens because the principal must be a real user (UUID).
func CreateAPITokenHandler(store IssueAPITokenStore, defaultTTLSecs int64) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller, ok := authmw.FromContext(r.Context())
		if !ok {
			WriteAuthError(w, ErrUnauthenticated{})
			return
		}
		var body CreateAPITokenRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid body")
			return
		}
		if body.Name == "" {
			writeJSONErr(w, http.StatusBadRequest, "name required")
			return
		}
		if len(body.Scopes) == 0 {
			body.Scopes = []string{"api:iceberg-read", "api:iceberg-write"}
		}
		ttl := defaultTTLSecs
		if body.TTLSecs != nil {
			ttl = *body.TTLSecs
		}
		var expiresAt *time.Time
		if ttl > 0 {
			t := time.Now().UTC().Add(time.Duration(ttl) * time.Second)
			expiresAt = &t
		}

		record, raw, err := store.IssueAPIToken(r.Context(), caller.Sub, body.Name, body.Scopes, expiresAt)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit.APITokenCreated(caller.Sub, record.ID, record.Scopes)

		writeJSON(w, http.StatusOK, CreateAPITokenResponse{
			ID:        record.ID,
			Name:      record.Name,
			TokenHint: record.TokenHint,
			Scopes:    record.Scopes,
			ExpiresAt: record.ExpiresAt,
			CreatedAt: record.CreatedAt,
			RawToken:  raw,
		})
	}
}

// ErrSubjectNotUUID is returned when the standard JWT carries a
// non-UUID `sub` (which the iceberg surface refuses, mirroring Rust).
var ErrSubjectNotUUID = errors.New("subject is not a UUID")

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONErr(w http.ResponseWriter, status int, msg string) {
	body := map[string]any{"error": map[string]any{
		"message": msg,
		"type":    typeFromStatus(status),
		"code":    status,
	}}
	writeJSON(w, status, body)
}
