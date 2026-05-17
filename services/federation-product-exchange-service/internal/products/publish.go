package products

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

// PublishVersion (POST /api/v1/marketplace/products/{rid}/versions)
// snapshots every resource referenced by the product, packs the
// snapshots into a tar.gz bundle (manifest.json + per-type folders),
// signs the manifest with HMAC-SHA256, uploads the bundle to object
// storage at /marketplace/{product_rid}/{version}.tar.gz and persists
// a ProductVersion row.
//
// Validation:
//   - product must exist and be in DRAFT or PUBLISHED status.
//   - version must be exact semver (MAJOR.MINOR.PATCH); ranges are
//     explicitly rejected.
//   - (product_rid, version) must be unique.
func (h *Handlers) PublishVersion(w http.ResponseWriter, r *http.Request) {
	productRID := chiURLParam(r, "rid")
	if productRID == "" {
		writeError(w, http.StatusBadRequest, "product rid is required")
		return
	}
	var req models.PublishProductVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Version = strings.TrimSpace(req.Version)
	if req.Version == "" {
		writeError(w, http.StatusBadRequest, "version is required")
		return
	}
	if !validSemver.MatchString(req.Version) {
		writeError(w, http.StatusBadRequest, "version must be exact semver (MAJOR.MINOR.PATCH); ranges are not supported")
		return
	}
	if existing, err := h.Repo.GetVersion(r.Context(), productRID, req.Version); err == nil && existing != nil {
		writeError(w, http.StatusConflict, fmt.Sprintf("version %q already exists for product %q", req.Version, productRID))
		return
	} else if err != nil && !errors.Is(err, ErrProductVersionNotFound) {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	product, err := h.Repo.GetProduct(r.Context(), productRID)
	if err != nil {
		mapProductError(w, err)
		return
	}
	if product.Status == models.ProductStatusArchived {
		writeError(w, http.StatusConflict, "cannot publish a version of an archived product")
		return
	}
	if len(product.Resources) == 0 {
		writeError(w, http.StatusBadRequest, "product has no resources to package")
		return
	}

	bearer := bearerToken(r)
	client := h.clientFor(bearer)
	if client == nil {
		writeError(w, http.StatusInternalServerError, "resource client not configured")
		return
	}

	snapshots, err := snapshotResources(r.Context(), client, product.Resources)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	bundleBytes, manifest, manifestJSON, signature, err := BuildBundle(*product, req.Version, snapshots, h.SignKey, h.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "build bundle failed: "+err.Error())
		return
	}

	bundlePath := fmt.Sprintf("%s/%s/%s.tar.gz", strings.Trim(h.StorageBase, "/"), product.RID, req.Version)
	if err := h.Storage.Put(r.Context(), bundlePath, bundleBytes); err != nil {
		writeError(w, http.StatusInternalServerError, "upload bundle failed: "+err.Error())
		return
	}

	_ = manifest // kept for future per-resource auditing; manifestJSON is the persisted blob

	version := models.ProductVersion{
		RID:        "ri.marketplace.product-version." + uuid.NewString(),
		ProductRID: product.RID,
		Version:    req.Version,
		Manifest:   json.RawMessage(manifestJSON),
		BundlePath: bundlePath,
		Signature:  signature,
		PublishedAt: h.Now(),
	}
	created, err := h.Repo.CreateVersion(r.Context(), version)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := h.Repo.UpdateProductPublishedSnapshot(r.Context(), product.RID, req.Version, bundlePath, signature); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// snapshotResources walks every Product.Resources entry and fetches the
// JSON definition from the owner service. The order of the returned
// slice matches the input order so the manifest stays deterministic.
func snapshotResources(ctx context.Context, client ResourceClient, refs []models.ProductResource) ([]ResourceSnapshot, error) {
	out := make([]ResourceSnapshot, 0, len(refs))
	for _, ref := range refs {
		payload, err := client.Fetch(ctx, ref.Type, ref.Ref)
		if err != nil {
			return nil, fmt.Errorf("snapshot %s/%s: %w", ref.Type, ref.Ref, err)
		}
		out = append(out, ResourceSnapshot{Type: ref.Type, Ref: ref.Ref, Payload: payload})
	}
	return out, nil
}

// clientFor returns a ResourceClient bound to bearer when the
// configured client supports auth forwarding; otherwise it returns the
// configured client unchanged (used by tests with in-memory stubs).
func (h *Handlers) clientFor(bearer string) ResourceClient {
	if h.Clients == nil {
		return nil
	}
	if bearer == "" {
		return h.Clients
	}
	if f, ok := h.Clients.(AuthForwarder); ok {
		return f.WithAuthToken(bearer)
	}
	return h.Clients
}

// bearerToken extracts the bearer token from the Authorization header.
// Returns "" when the header is missing or malformed.
func bearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if strings.HasPrefix(auth, prefix) {
		return strings.TrimSpace(auth[len(prefix):])
	}
	return ""
}
