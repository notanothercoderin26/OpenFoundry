package handler

import (
	"encoding/json"
	"net/http"

	runtimepolicy "github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/domain/runtime"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

// SetRuntimeConfigRequest is the wire shape for
// PUT /api/v1/compute-modules/{id}/runtime. The body is the
// caller-supplied runtime config; the server runs the runtime policy
// (which redacts secret-like values and records findings) before
// persisting.
type SetRuntimeConfigRequest = models.RuntimeConfig

// SetRuntimeConfig handles
// PUT /api/v1/compute-modules/{id}/runtime.
//
// Workflow:
//
//  1. Decode the caller payload.
//  2. Run structural validation (400 on invalid shape).
//  3. Run the runtime policy. Secret-like env values are redacted in
//     place and findings are stamped onto cfg.Findings.
//  4. Persist the (possibly mutated) config on the module.
//
// The response body is the updated module, which carries the
// post-redaction runtime_config so the caller can see exactly what
// was stored and which findings were emitted.
func (s *State) SetRuntimeConfig(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}

	var cfg models.RuntimeConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if cfg.Role == "" {
		cfg.Role = models.ContainerRoleEntrypoint
	}
	if err := cfg.ValidateStructure(); err != nil {
		writeValidationError(w, err)
		return
	}

	runtimepolicy.Apply(&cfg)

	updated, err := s.Repo.SetRuntimeConfig(r.Context(), id, cfg, caller)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// GetRuntimeConfig handles GET /api/v1/compute-modules/{id}/runtime.
// Returns 404 with a clear empty-state message when no runtime config
// has been published yet.
func (s *State) GetRuntimeConfig(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	m, err := s.Repo.Get(r.Context(), id)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	if m.RuntimeConfig == nil {
		writeError(w, http.StatusNotFound, "runtime config not set")
		return
	}
	writeJSON(w, http.StatusOK, m.RuntimeConfig)
}

// ClearRuntimeConfig handles DELETE /api/v1/compute-modules/{id}/runtime.
func (s *State) ClearRuntimeConfig(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	updated, err := s.Repo.ClearRuntimeConfig(r.Context(), id, caller)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ValidateRuntimeConfigResponse is the body returned by the dry-run
// endpoint. The handler never mutates server state — callers can
// iterate on a draft and see exactly what redactions/findings the
// runtime policy would apply.
type ValidateRuntimeConfigResponse struct {
	Config   models.RuntimeConfig          `json:"config"`
	Findings []models.CompatibilityFinding `json:"findings"`
	Redacted []string                      `json:"redacted_env,omitempty"`
}

// ValidateRuntimeConfig handles
// POST /api/v1/compute-modules/runtime/validate.
//
// Useful for CI / IDE-side build-plan validation (CM.26): submit a
// draft runtime config, receive the redacted version plus the
// policy findings without touching any module record.
func (s *State) ValidateRuntimeConfig(w http.ResponseWriter, r *http.Request) {
	if _, ok := callerID(r); !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var cfg models.RuntimeConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if cfg.Role == "" {
		cfg.Role = models.ContainerRoleEntrypoint
	}
	if err := cfg.ValidateStructure(); err != nil {
		writeValidationError(w, err)
		return
	}
	findings := runtimepolicy.Apply(&cfg)
	redacted := make([]string, 0)
	for _, ev := range cfg.Env {
		if ev.Redacted {
			redacted = append(redacted, ev.Name)
		}
	}
	writeJSON(w, http.StatusOK, ValidateRuntimeConfigResponse{
		Config:   cfg,
		Findings: findings,
		Redacted: redacted,
	})
}
