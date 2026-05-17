package products

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/federation-product-exchange-service/internal/models"
)

// Handlers serves the /api/v1/marketplace/products surface. It owns the
// repository, the bundle storage, and the resource client factory used
// by Publish/Install. signKey is the symmetric HMAC secret loaded from
// MARKETPLACE_SIGN_KEY.
type Handlers struct {
	Repo      Repository
	Storage   BundleStorage
	Clients   ResourceClient
	SignKey   []byte
	Now       func() time.Time
	StorageBase string // logical prefix exposed through manifest_url (e.g. "marketplace")
}

// NewHandlers wires a Handlers value. base controls the storage path
// prefix used inside Put/Get keys. Pass "marketplace" to match the
// task spec (/marketplace/{product_rid}/{version}.tar.gz).
func NewHandlers(repo Repository, storage BundleStorage, clients ResourceClient, signKey []byte, storageBase string) *Handlers {
	if storageBase == "" {
		storageBase = "marketplace"
	}
	return &Handlers{
		Repo:        repo,
		Storage:     storage,
		Clients:     clients,
		SignKey:     signKey,
		Now:         func() time.Time { return time.Now().UTC() },
		StorageBase: storageBase,
	}
}

type errorResponse struct {
	Error string `json:"error"`
}

// CreateProduct (POST /api/v1/marketplace/products) inserts a DRAFT
// product with an inline resources array. It is the first step of the
// publish workflow; the resources can be edited (out of scope for v1)
// up until PublishVersion is called.
func (h *Handlers) CreateProduct(w http.ResponseWriter, r *http.Request) {
	var req models.CreateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "product name is required")
		return
	}
	if req.Resources == nil {
		req.Resources = []models.ProductResource{}
	}
	for _, res := range req.Resources {
		if !res.Type.Valid() {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid resource type %q", res.Type))
			return
		}
		if strings.TrimSpace(res.Ref) == "" {
			writeError(w, http.StatusBadRequest, "resource ref is required")
			return
		}
	}
	product := models.Product{
		RID:         "ri.marketplace.product." + uuid.NewString(),
		Name:        strings.TrimSpace(req.Name),
		Description: req.Description,
		Author:      req.Author,
		Status:      models.ProductStatusDraft,
		Resources:   req.Resources,
	}
	created, err := h.Repo.CreateProduct(r.Context(), product)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create product failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// GetProduct (GET /api/v1/marketplace/products/{rid}) returns one
// product row.
func (h *Handlers) GetProduct(w http.ResponseWriter, r *http.Request) {
	rid := chiURLParam(r, "rid")
	if rid == "" {
		writeError(w, http.StatusBadRequest, "product rid is required")
		return
	}
	product, err := h.Repo.GetProduct(r.Context(), rid)
	if err != nil {
		mapProductError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, product)
}

// ListProducts (GET /api/v1/marketplace/products) pages the catalog.
// Accepts ?limit=N&offset=M&status=PUBLISHED|DRAFT|ARCHIVED.
func (h *Handlers) ListProducts(w http.ResponseWriter, r *http.Request) {
	limit, offset, err := parsePagination(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && status != string(models.ProductStatusDraft) && status != string(models.ProductStatusPublished) && status != string(models.ProductStatusArchived) {
		writeError(w, http.StatusBadRequest, "invalid status filter")
		return
	}
	items, total, err := h.Repo.ListProducts(r.Context(), limit, offset, status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list products failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, productListResponse{Items: items, Total: total, Limit: limit, Offset: offset})
}

// productListResponse mirrors the PaginatedListResponse envelope from
// the listings surface but kept local so the products domain does not
// pull in the legacy model.
type productListResponse struct {
	Items  []models.Product `json:"items"`
	Total  int              `json:"total"`
	Limit  int              `json:"limit"`
	Offset int              `json:"offset"`
}

// installationListResponse is the pagination envelope for installations.
type installationListResponse struct {
	Items  []models.Installation `json:"items"`
	Total  int                   `json:"total"`
	Limit  int                   `json:"limit"`
	Offset int                   `json:"offset"`
}

// ── helpers ─────────────────────────────────────────────────────────────

// validSemver matches the simple subset of semver this service accepts:
// MAJOR.MINOR.PATCH with optional pre-release / build suffixes. Ranges
// (^, ~, >=) are explicitly NOT supported in v1.
var validSemver = regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z\-.]+)?(?:\+[0-9A-Za-z\-.]+)?$`)

func parsePagination(r *http.Request) (int, int, error) {
	limit := 50
	offset := 0
	var err error
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			return 0, 0, errors.New("limit must be between 1 and 100")
		}
	}
	if raw := r.URL.Query().Get("offset"); raw != "" {
		offset, err = strconv.Atoi(raw)
		if err != nil || offset < 0 {
			return 0, 0, errors.New("offset must be greater than or equal to 0")
		}
	}
	return limit, offset, nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}

func mapProductError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrProductNotFound):
		writeError(w, http.StatusNotFound, "product not found")
	case errors.Is(err, ErrProductVersionNotFound):
		writeError(w, http.StatusNotFound, "product version not found")
	case errors.Is(err, ErrInstallationNotFound):
		writeError(w, http.StatusNotFound, "installation not found")
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

// chiURLParam looks up a route parameter via the standard chi context
// helper. It is wrapped here so the handlers file does not depend on
// chi at every callsite.
func chiURLParam(r *http.Request, name string) string {
	return chi.URLParam(r, name)
}
