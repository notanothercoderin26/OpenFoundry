package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/domain/containerimage"
	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

// SetContainerImageRequest is the wire shape for
// PUT /api/v1/compute-modules/{id}/container-image. The body is the
// caller-supplied image; the server runs the compatibility policy and
// fills in `findings` before persisting.
type SetContainerImageRequest = models.ContainerImage

// ContainerImageRejectionBody is the 422 response surfaced when the
// compatibility policy rejects an image.
type ContainerImageRejectionBody struct {
	Error    string                          `json:"error"`
	Image    *models.ContainerImage          `json:"image,omitempty"`
	Findings []models.CompatibilityFinding   `json:"findings"`
}

// SetContainerImage handles
// PUT /api/v1/compute-modules/{id}/container-image.
//
// Workflow:
//
//  1. Decode the caller payload.
//  2. Run structural validation (400 on missing/oversized fields).
//  3. Run the compatibility policy (containerimage.Apply). If any
//     finding has severity "error", reject the request with 422 and
//     return the full finding list so the caller can remediate.
//  4. Persist the image (with non-error findings) on the module.
func (s *State) SetContainerImage(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}

	var img models.ContainerImage
	if err := json.NewDecoder(r.Body).Decode(&img); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := img.ValidateStructure(); err != nil {
		writeValidationError(w, err)
		return
	}

	if _, err := containerimage.Apply(&img); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, containerimage.ErrFindingsRejected) {
			status = http.StatusUnprocessableEntity
		}
		writeJSON(w, status, ContainerImageRejectionBody{
			Error:    err.Error(),
			Image:    &img,
			Findings: img.Findings,
		})
		return
	}

	updated, err := s.Repo.SetContainerImage(r.Context(), id, img, caller)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// GetContainerImage handles
// GET /api/v1/compute-modules/{id}/container-image.
//
// Returns 404 when no image has been published yet (distinct from the
// 404 for a missing module so the UI can show a clear empty state).
func (s *State) GetContainerImage(w http.ResponseWriter, r *http.Request) {
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	m, err := s.Repo.Get(r.Context(), id)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	if m.ContainerImage == nil {
		writeError(w, http.StatusNotFound, "container image not configured")
		return
	}
	writeJSON(w, http.StatusOK, m.ContainerImage)
}

// ClearContainerImage handles
// DELETE /api/v1/compute-modules/{id}/container-image.
func (s *State) ClearContainerImage(w http.ResponseWriter, r *http.Request) {
	caller, ok := callerID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, ok := pathUUID(w, r)
	if !ok {
		return
	}
	updated, err := s.Repo.ClearContainerImage(r.Context(), id, caller)
	if err != nil {
		writeRepoError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// ValidateContainerImageResponse is the body returned by the dry-run
// validation endpoint. The handler never mutates server state, so the
// caller can iterate on an image draft before committing.
type ValidateContainerImageResponse struct {
	Findings []models.CompatibilityFinding `json:"findings"`
	Cleared  bool                          `json:"cleared"`
}

// ValidateContainerImage handles
// POST /api/v1/compute-modules/container-image/validate.
//
// This is a module-agnostic dry-run: callers POST an image draft and
// receive the policy findings without touching any module record. Use
// it in CI / IDE-side build-plan validation (CM.26).
func (s *State) ValidateContainerImage(w http.ResponseWriter, r *http.Request) {
	if _, ok := callerID(r); !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var img models.ContainerImage
	if err := json.NewDecoder(r.Body).Decode(&img); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := img.ValidateStructure(); err != nil {
		writeValidationError(w, err)
		return
	}
	findings := containerimage.Evaluate(img)
	cleared := true
	for _, f := range findings {
		if f.Severity == models.FindingSeverityError {
			cleared = false
			break
		}
	}
	writeJSON(w, http.StatusOK, ValidateContainerImageResponse{
		Findings: findings,
		Cleared:  cleared,
	})
}
