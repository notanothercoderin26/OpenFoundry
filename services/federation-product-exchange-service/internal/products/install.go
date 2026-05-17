package products

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

// InstallProduct (POST /api/v1/marketplace/products/{rid}/install)
// downloads the published bundle, verifies the signature against the
// stored ProductVersion row, and re-creates every resource on the
// target services. Resource mappings (src_ref → dst_rid) are persisted
// on the Installation row.
//
// Idempotency: when an Installation already exists for the
// (product_rid, version, target_workspace_rid) triple and is in the
// INSTALLED status, the call is a no-op and returns the existing row
// with 200 OK. When the prior row is in FAILED/PENDING/INSTALLING
// status the call is rejected with 409 to avoid concurrent installs
// trampling each other.
func (h *Handlers) InstallProduct(w http.ResponseWriter, r *http.Request) {
	productRID := chiURLParam(r, "rid")
	if productRID == "" {
		writeError(w, http.StatusBadRequest, "product rid is required")
		return
	}
	var req models.InstallProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Version = strings.TrimSpace(req.Version)
	req.TargetWorkspaceRID = strings.TrimSpace(req.TargetWorkspaceRID)
	if req.Version == "" {
		writeError(w, http.StatusBadRequest, "version is required")
		return
	}
	if !validSemver.MatchString(req.Version) {
		writeError(w, http.StatusBadRequest, "version must be exact semver (MAJOR.MINOR.PATCH); ranges are not supported")
		return
	}
	if req.TargetWorkspaceRID == "" {
		writeError(w, http.StatusBadRequest, "target_workspace_rid is required")
		return
	}

	version, err := h.Repo.GetVersion(r.Context(), productRID, req.Version)
	if err != nil {
		mapProductError(w, err)
		return
	}
	if _, err := h.Repo.GetProduct(r.Context(), productRID); err != nil {
		mapProductError(w, err)
		return
	}

	bundle, err := h.Storage.Get(r.Context(), version.BundlePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "download bundle failed: "+err.Error())
		return
	}
	manifest, files, recomputedSig, err := ReadBundle(bundle, h.SignKey)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bundle is invalid: "+err.Error())
		return
	}
	if recomputedSig != version.Signature {
		// Signature mismatch — refuse to install.
		writeError(w, http.StatusBadRequest, "bundle signature does not match stored signature")
		return
	}

	// Acquire / reuse the installation row.
	pending := models.Installation{
		RID:                "ri.marketplace.product-installation." + uuid.NewString(),
		ProductRID:         productRID,
		Version:            req.Version,
		TargetWorkspaceRID: req.TargetWorkspaceRID,
		Status:             models.InstallationStatusInstalling,
		ResourceMappings:   []models.ResourceMapping{},
	}
	row, existed, err := h.Repo.UpsertInstallationStart(r.Context(), pending)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "upsert installation failed: "+err.Error())
		return
	}
	if existed {
		switch row.Status {
		case models.InstallationStatusInstalled:
			// Idempotent no-op.
			writeJSON(w, http.StatusOK, row)
			return
		case models.InstallationStatusFailed, models.InstallationStatusUninstalled:
			// Allow retry: drop the prior row by transitioning it
			// through CompleteInstallation with the new INSTALLING
			// status and an empty mappings/failure_reason.
			if _, err := h.Repo.CompleteInstallation(r.Context(), row.RID, models.InstallationStatusInstalling, nil, ""); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			pending = *row
			pending.Status = models.InstallationStatusInstalling
			row = &pending
		default:
			writeError(w, http.StatusConflict, fmt.Sprintf("installation already in progress (status=%s)", row.Status))
			return
		}
	}

	client := h.clientFor(bearerToken(r))
	if client == nil {
		_, _ = h.Repo.CompleteInstallation(r.Context(), row.RID, models.InstallationStatusFailed, nil, "resource client not configured")
		writeError(w, http.StatusInternalServerError, "resource client not configured")
		return
	}

	mappings := make([]models.ResourceMapping, 0, len(manifest.Resources))
	for _, entry := range manifest.Resources {
		body, ok := files[entry.Path]
		if !ok {
			reason := fmt.Sprintf("bundle missing payload for %s/%s", entry.Type, entry.Ref)
			_, _ = h.Repo.CompleteInstallation(r.Context(), row.RID, models.InstallationStatusFailed, mappings, reason)
			writeError(w, http.StatusBadRequest, reason)
			return
		}
		newRID, err := client.Create(r.Context(), entry.Type, req.TargetWorkspaceRID, body)
		if err != nil {
			reason := fmt.Sprintf("create %s/%s failed: %s", entry.Type, entry.Ref, err.Error())
			_, _ = h.Repo.CompleteInstallation(r.Context(), row.RID, models.InstallationStatusFailed, mappings, reason)
			writeError(w, http.StatusBadGateway, reason)
			return
		}
		mappings = append(mappings, models.ResourceMapping{Type: entry.Type, SrcRef: entry.Ref, DstRID: newRID})
	}

	completed, err := h.Repo.CompleteInstallation(r.Context(), row.RID, models.InstallationStatusInstalled, mappings, "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, completed)
}

// ListInstallations (GET /api/v1/marketplace/products/installations)
// pages installation rows, optionally filtered by target_workspace_rid
// or product_rid.
func (h *Handlers) ListInstallations(w http.ResponseWriter, r *http.Request) {
	limit, offset, err := parsePagination(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	target := strings.TrimSpace(r.URL.Query().Get("target_workspace_rid"))
	product := strings.TrimSpace(r.URL.Query().Get("product_rid"))
	items, total, err := h.Repo.ListInstallations(r.Context(), limit, offset, target, product)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, installationListResponse{Items: items, Total: total, Limit: limit, Offset: offset})
}

// Uninstall (POST /api/v1/marketplace/products/installations/{rid}/uninstall)
// flips an INSTALLED installation to UNINSTALLED. Resource cleanup on
// the target services is the workspace owner's responsibility — the
// resource_mappings array is retained so they can locate the new rids.
func (h *Handlers) Uninstall(w http.ResponseWriter, r *http.Request) {
	rid := chiURLParam(r, "rid")
	if rid == "" {
		writeError(w, http.StatusBadRequest, "installation rid is required")
		return
	}
	ins, err := h.Repo.GetInstallation(r.Context(), rid)
	if err != nil {
		mapProductError(w, err)
		return
	}
	if ins.Status != models.InstallationStatusInstalled {
		writeError(w, http.StatusConflict, fmt.Sprintf("installation is not in INSTALLED status (current=%s)", ins.Status))
		return
	}
	updated, err := h.Repo.CompleteInstallation(r.Context(), rid, models.InstallationStatusUninstalled, ins.ResourceMappings, "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

