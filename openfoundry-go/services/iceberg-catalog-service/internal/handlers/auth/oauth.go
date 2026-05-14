package auth

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/audit"
)

// OAuthClientValidator integrates with oauth-integration-service. The
// production impl POSTs to `/v1/oauth-clients/validate`; tests pass a
// fake implementation. Returning `nil` means the credentials passed.
type OAuthClientValidator interface {
	ValidateClientCredentials(ctx context.Context, clientID, clientSecret, scope string) error
}

// HTTPClientValidator is the production validator: it forwards the
// `client_credentials` payload to oauth-integration-service exactly as
// the Rust handler does.
type HTTPClientValidator struct {
	BaseURL string
	HTTP    *http.Client
}

// ValidateClientCredentials posts to `<base>/v1/oauth-clients/validate`.
// 2xx → allow, anything else → 403; transport failures → 503.
func (h *HTTPClientValidator) ValidateClientCredentials(ctx context.Context, clientID, clientSecret, scope string) error {
	if h.HTTP == nil {
		h.HTTP = http.DefaultClient
	}
	url := strings.TrimRight(h.BaseURL, "/") + "/v1/oauth-clients/validate"
	body, err := json.Marshal(map[string]any{
		"client_id":     clientID,
		"client_secret": clientSecret,
		"scope":         scope,
	})
	if err != nil {
		return fmt.Errorf("marshal validate body: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build validate request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("oauth validation request failed: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode/100 != 2 {
		return ErrForbidden{Message: fmt.Sprintf("oauth client credentials rejected (status %d)", resp.StatusCode)}
	}
	return nil
}

// OAuthTokenForm mirrors the form-encoded body PyIceberg sends to the
// `/oauth/tokens` endpoint per Iceberg REST Catalog § Authentication.
type OAuthTokenForm struct {
	GrantType    string
	ClientID     string
	ClientSecret string
	Scope        string
	RefreshToken string
}

// OAuthTokenResponse mirrors the Rust serialisation byte-for-byte so
// PyIceberg's typed JSON parsing keeps working.
type OAuthTokenResponse struct {
	AccessToken     string `json:"access_token"`
	TokenType       string `json:"token_type"`
	ExpiresIn       int64  `json:"expires_in"`
	IssuedTokenType string `json:"issued_token_type"`
	Scope           string `json:"scope"`
	RefreshToken    string `json:"refresh_token,omitempty"`
}

// IssueTokenHandler returns the http.Handler that implements the
// `client_credentials` and `refresh_token` grants.
func IssueTokenHandler(cfg *Config, validator OAuthClientValidator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		form, err := parseOAuthForm(r)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, err.Error())
			return
		}
		switch form.GrantType {
		case "client_credentials":
			clientCredentialsGrant(w, r, cfg, validator, form)
		case "refresh_token":
			refreshTokenGrant(w, r, cfg, form)
		default:
			writeJSONErr(w, http.StatusBadRequest, fmt.Sprintf("unsupported grant_type `%s`", form.GrantType))
		}
	}
}

func clientCredentialsGrant(w http.ResponseWriter, r *http.Request, cfg *Config, validator OAuthClientValidator, form *OAuthTokenForm) {
	clientID, clientSecret, err := resolveClientCredentials(r.Header, form)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if validator != nil {
		if err := validator.ValidateClientCredentials(r.Context(), clientID, clientSecret, form.Scope); err != nil {
			var fb ErrForbidden
			if errors.As(err, &fb) {
				writeJSONErr(w, http.StatusForbidden, fb.Message)
				return
			}
			writeJSONErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	scope := form.Scope
	if scope == "" {
		scope = "api:iceberg-read api:iceberg-write"
	}
	scopeList := strings.Fields(scope)
	access, err := IssueInternalJWT(cfg, clientID, cfg.JWTIssuer, cfg.JWTAudience, scopeList, cfg.DefaultTokenTTLSecs)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	refresh, err := IssueInternalJWT(cfg, clientID, cfg.JWTIssuer, cfg.JWTAudience, scopeList, cfg.DefaultTokenTTLSecs*24)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	audit.OAuthTokenIssued(nil, "client_credentials", scope)

	writeJSON(w, http.StatusOK, OAuthTokenResponse{
		AccessToken:     access,
		TokenType:       "bearer",
		ExpiresIn:       cfg.DefaultTokenTTLSecs,
		IssuedTokenType: "urn:ietf:params:oauth:token-type:access_token",
		Scope:           scope,
		RefreshToken:    refresh,
	})
}

func refreshTokenGrant(w http.ResponseWriter, _ *http.Request, cfg *Config, form *OAuthTokenForm) {
	if form.RefreshToken == "" {
		writeJSONErr(w, http.StatusBadRequest, "refresh_token is required")
		return
	}
	claims, err := decodeRefresh(form.RefreshToken, cfg)
	if err != nil {
		WriteAuthError(w, ErrUnauthenticated{Detail: err.Error()})
		return
	}
	scopeList := strings.Fields(claims.Scp)
	access, err := IssueInternalJWT(cfg, claims.Sub, cfg.JWTIssuer, cfg.JWTAudience, scopeList, cfg.DefaultTokenTTLSecs)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	audit.OAuthTokenIssued(nil, "refresh_token", claims.Scp)

	writeJSON(w, http.StatusOK, OAuthTokenResponse{
		AccessToken:     access,
		TokenType:       "bearer",
		ExpiresIn:       cfg.DefaultTokenTTLSecs,
		IssuedTokenType: "urn:ietf:params:oauth:token-type:access_token",
		Scope:           claims.Scp,
	})
}

// decodeRefresh validates the refresh JWT against the iceberg secret.
// Audience validation is skipped (refresh tokens accept the same
// audience as access tokens) — matches the Rust `decode_refresh`.
func decodeRefresh(raw string, cfg *Config) (*IcebergClaims, error) {
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
	if out.Exp > 0 && out.Exp < time.Now().Unix() {
		return nil, errors.New("token expired")
	}
	return out, nil
}

// parseOAuthForm decodes both `application/x-www-form-urlencoded` and
// JSON bodies — the Iceberg spec accepts either, and PyIceberg uses
// the form-encoded variant on the hot path.
func parseOAuthForm(r *http.Request) (*OAuthTokenForm, error) {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "application/json") {
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, fmt.Errorf("read body: %w", err)
		}
		var view map[string]string
		if err := json.Unmarshal(raw, &view); err != nil {
			return nil, fmt.Errorf("decode body: %w", err)
		}
		return &OAuthTokenForm{
			GrantType:    view["grant_type"],
			ClientID:     view["client_id"],
			ClientSecret: view["client_secret"],
			Scope:        view["scope"],
			RefreshToken: view["refresh_token"],
		}, nil
	}
	if err := r.ParseForm(); err != nil {
		return nil, fmt.Errorf("parse form: %w", err)
	}
	return &OAuthTokenForm{
		GrantType:    r.PostForm.Get("grant_type"),
		ClientID:     r.PostForm.Get("client_id"),
		ClientSecret: r.PostForm.Get("client_secret"),
		Scope:        r.PostForm.Get("scope"),
		RefreshToken: r.PostForm.Get("refresh_token"),
	}, nil
}

// resolveClientCredentials prefers the form-encoded fields, falls
// back to RFC 6749 § 2.3.1 HTTP Basic auth — same precedence as Rust.
func resolveClientCredentials(headers http.Header, form *OAuthTokenForm) (string, string, error) {
	if form.ClientID != "" && form.ClientSecret != "" {
		return form.ClientID, form.ClientSecret, nil
	}
	raw := headers.Get("Authorization")
	if v, ok := strings.CutPrefix(raw, "Basic "); ok {
		decoded, err := base64.StdEncoding.DecodeString(v)
		if err == nil {
			parts := strings.SplitN(string(decoded), ":", 2)
			if len(parts) == 2 {
				return parts[0], parts[1], nil
			}
		}
	}
	return "", "", errors.New("client_id and client_secret required (form or HTTP Basic)")
}
