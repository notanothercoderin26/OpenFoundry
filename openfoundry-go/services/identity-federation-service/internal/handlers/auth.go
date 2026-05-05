// Package handlers wires HTTP endpoints for identity-federation-service slice 1.
package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/openfoundry/openfoundry-go/libs/core-models/ids"
	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/repo"
	"github.com/openfoundry/openfoundry-go/services/identity-federation-service/internal/service"
)

// Auth wires register / login / token endpoints.
type Auth struct {
	Repo   *repo.Repo
	Issuer *service.Issuer
}

// BootstrapStatus handles GET /api/v1/auth/bootstrap-status.
func (a *Auth) BootstrapStatus(w http.ResponseWriter, r *http.Request) {
	count, err := a.Repo.CountUsers(r.Context())
	if err != nil {
		slog.Error("count users failed", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to load bootstrap status")
		return
	}
	writeJSON(w, http.StatusOK, models.BootstrapStatusResponse{
		RequiresInitialAdmin: count == 0,
	})
}

// Register handles POST /api/v1/auth/register.
//
// Mirrors the Rust handler: argon2id password hash, advisory-lock-
// guarded transactional insert, first-user-becomes-admin election.
func (a *Auth) Register(w http.ResponseWriter, r *http.Request) {
	var body models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Email == "" || body.Password == "" || body.Name == "" {
		writeJSONErr(w, http.StatusBadRequest, "email, password and name are required")
		return
	}

	hash, err := service.HashPassword(body.Password)
	if err != nil {
		slog.Error("hash password failed", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	user, role, err := a.Repo.CreateUserAndAssignRole(r.Context(), ids.New(), body.Email, body.Name, hash)
	if err != nil {
		if errors.Is(err, repo.ErrUserExists) {
			writeJSONErr(w, http.StatusConflict, "email already registered")
			return
		}
		slog.Error("register failed", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "registration failed")
		return
	}
	slog.Info("user registered",
		slog.String("user_id", user.ID.String()),
		slog.String("email", user.Email),
		slog.String("role", role),
	)
	writeJSON(w, http.StatusCreated, models.RegisterResponse{
		ID: user.ID, Email: user.Email, Name: user.Name,
	})
}

// Login handles POST /api/v1/auth/login.
//
// Slice 1 scope: password verification + JWT issuance. MFA returns
// `{"status":"mfa_required"}` with the MFA flag set; actual TOTP /
// WebAuthn challenge issuance arrives in slices 3 + 4.
func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var body models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}

	user, err := a.Repo.FindUserByEmail(r.Context(), body.Email)
	if err != nil {
		slog.Error("lookup user failed", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "login failed")
		return
	}
	if user == nil {
		writeJSONErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if !user.IsActive {
		writeJSONErr(w, http.StatusForbidden, "account disabled")
		return
	}

	if err := service.VerifyPassword(body.Password, user.PasswordHash); err != nil {
		writeJSONErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// MFA hooks defer to slice 3 + slice 4.
	if user.MFAEnforced {
		// The Rust path issues an MFA challenge JWT and returns
		// `LoginResponse::MfaRequired`. Slice 1 returns the same
		// envelope shape minus the actual challenge token (clients
		// shouldn't see this path in slice 1 since the table column
		// is in the schema but defaults to false).
		writeJSON(w, http.StatusOK, models.LoginResponse{
			Status:  models.LoginStatusMFARequired,
			Methods: []string{},
		})
		return
	}

	access, refresh, err := a.Issuer.IssueTokens(r.Context(), user, []string{"password"})
	if err != nil {
		slog.Error("issue tokens failed", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "login failed")
		return
	}
	writeJSON(w, http.StatusOK, models.LoginResponse{
		Status:       models.LoginStatusAuthenticated,
		AccessToken:  access,
		RefreshToken: refresh,
		TokenType:    "Bearer",
		ExpiresIn:    int64(a.Issuer.AccessTTL.Seconds()),
	})
}

// Refresh handles POST /api/v1/auth/token/refresh.
func (a *Auth) Refresh(w http.ResponseWriter, r *http.Request) {
	var body models.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	access, refresh, err := a.Issuer.RefreshTokens(r.Context(), body.RefreshToken)
	if err != nil {
		// Both Invalid + Reused map to 401 — the client should drop
		// the family and reauthenticate. The slog log keeps them apart.
		slog.Warn("refresh failed", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	writeJSON(w, http.StatusOK, models.TokenResponse{
		AccessToken:  access,
		RefreshToken: refresh,
		TokenType:    "Bearer",
		ExpiresIn:    int64(a.Issuer.AccessTTL.Seconds()),
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
