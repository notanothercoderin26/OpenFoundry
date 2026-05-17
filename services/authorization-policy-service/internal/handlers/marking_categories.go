// marking_categories.go: SG.11 HTTP surface for marking category
// metadata, visibility, category permissions, and audit history.

package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/authorization-policy-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/authorization-policy-service/internal/repo"
)

func (h *Handlers) ListMarkingCategories(w http.ResponseWriter, r *http.Request) {
	claims, ok := requirePermission(w, r, "markings", "read")
	if !ok {
		return
	}
	includeHidden := strings.EqualFold(r.URL.Query().Get("include_hidden"), "true")
	canSeeAllHidden := claims.HasPermission("markings", "write") || claims.HasPermission("markings", "audit")
	items, err := h.Repo.ListMarkingCategories(r.Context(), tenantFromClaims(claims), claims.Sub, includeHidden, canSeeAllHidden)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.MarkingCategoryResponse]{Items: items})
}

func (h *Handlers) GetMarkingCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := requirePermission(w, r, "markings", "read")
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	includeHidden := strings.EqualFold(r.URL.Query().Get("include_hidden"), "true")
	canSeeAllHidden := claims.HasPermission("markings", "write") || claims.HasPermission("markings", "audit")
	item, err := h.Repo.GetMarkingCategory(r.Context(), tenantFromClaims(claims), claims.Sub, id, includeHidden, canSeeAllHidden)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if item == nil {
		writeJSONErr(w, http.StatusNotFound, "marking category not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *Handlers) CreateMarkingCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := requirePermission(w, r, "markings", "write")
	if !ok {
		return
	}
	var body models.CreateMarkingCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	body.Slug = strings.TrimSpace(body.Slug)
	body.DisplayName = strings.TrimSpace(body.DisplayName)
	body.Visibility = strings.ToLower(strings.TrimSpace(body.Visibility))
	if body.Visibility == "" {
		body.Visibility = models.MarkingCategoryVisibilityVisible
	}
	if body.Slug == "" || body.DisplayName == "" {
		writeJSONErr(w, http.StatusBadRequest, "slug and display_name are required")
		return
	}
	if !isAllowedMarkingCategoryVisibility(body.Visibility) {
		writeJSONErr(w, http.StatusBadRequest, "visibility must be visible or hidden")
		return
	}
	if !validOptionalJSONObject(body.Metadata) {
		writeJSONErr(w, http.StatusBadRequest, "metadata must be a JSON object")
		return
	}
	if !validMarkingCategoryPrincipals(body.Administrators) || !validMarkingCategoryPrincipals(body.Viewers) {
		writeJSONErr(w, http.StatusBadRequest, "administrators and viewers must use principal_kind user or group and a non-empty principal_id")
		return
	}
	normalizeMarkingCategoryPrincipals(body.Administrators)
	normalizeMarkingCategoryPrincipals(body.Viewers)
	item, err := h.Repo.CreateMarkingCategory(r.Context(), tenantFromClaims(claims), claims.Sub, &body)
	if err != nil {
		writeRBACMutationErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (h *Handlers) UpdateMarkingCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := requirePermission(w, r, "markings", "write")
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	var body models.UpdateMarkingCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.DisplayName != nil {
		trimmed := strings.TrimSpace(*body.DisplayName)
		if trimmed == "" {
			writeJSONErr(w, http.StatusBadRequest, "display_name cannot be empty")
			return
		}
		body.DisplayName = &trimmed
	}
	if body.Visibility != nil {
		normalized := strings.ToLower(strings.TrimSpace(*body.Visibility))
		if !isAllowedMarkingCategoryVisibility(normalized) {
			writeJSONErr(w, http.StatusBadRequest, "visibility must be visible or hidden")
			return
		}
		body.Visibility = &normalized
	}
	if !validOptionalJSONObject(body.Metadata) {
		writeJSONErr(w, http.StatusBadRequest, "metadata must be a JSON object")
		return
	}
	item, err := h.Repo.UpdateMarkingCategory(r.Context(), tenantFromClaims(claims), claims.Sub, id, &body)
	if err != nil {
		writeRBACMutationErr(w, err)
		return
	}
	if item == nil {
		writeJSONErr(w, http.StatusNotFound, "marking category not found")
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *Handlers) DeleteMarkingCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := requirePermission(w, r, "markings", "write")
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	found, err := h.Repo.BlockDeleteMarkingCategory(r.Context(), tenantFromClaims(claims), claims.Sub, id)
	if err != nil && !errors.Is(err, repo.ErrMarkingCategoryDeletionUnsupported) {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !found {
		writeJSONErr(w, http.StatusNotFound, "marking category not found")
		return
	}
	writeJSONErr(w, http.StatusMethodNotAllowed, repo.ErrMarkingCategoryDeletionUnsupported.Error())
}

func (h *Handlers) UpsertMarkingCategoryPermission(w http.ResponseWriter, r *http.Request) {
	claims, ok := requirePermission(w, r, "markings", "write")
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	var body models.UpsertMarkingCategoryPermissionRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	body.PrincipalKind = strings.ToLower(strings.TrimSpace(body.PrincipalKind))
	body.Permission = strings.ToLower(strings.TrimSpace(body.Permission))
	if !isAllowedMarkingCategoryPrincipalKind(body.PrincipalKind) || body.PrincipalID == uuid.Nil || !isAllowedMarkingCategoryPermission(body.Permission) {
		writeJSONErr(w, http.StatusBadRequest, "principal_kind, principal_id, and permission are required")
		return
	}
	perm, err := h.Repo.UpsertMarkingCategoryPermission(r.Context(), tenantFromClaims(claims), claims.Sub, id, &body)
	if err != nil {
		writeRBACMutationErr(w, err)
		return
	}
	if perm == nil {
		writeJSONErr(w, http.StatusNotFound, "marking category not found")
		return
	}
	writeJSON(w, http.StatusCreated, perm)
}

func (h *Handlers) DeleteMarkingCategoryPermission(w http.ResponseWriter, r *http.Request) {
	claims, ok := requirePermission(w, r, "markings", "write")
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	principalKind := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "principal_kind")))
	if !isAllowedMarkingCategoryPrincipalKind(principalKind) {
		writeJSONErr(w, http.StatusBadRequest, "principal_kind must be user or group")
		return
	}
	principalID, err := uuid.Parse(chi.URLParam(r, "principal_id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "principal_id must be a uuid")
		return
	}
	permission := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "permission")))
	if !isAllowedMarkingCategoryPermission(permission) {
		writeJSONErr(w, http.StatusBadRequest, "permission must be administrator or viewer")
		return
	}
	deleted, err := h.Repo.DeleteMarkingCategoryPermission(r.Context(), tenantFromClaims(claims), claims.Sub, id, principalKind, principalID, permission)
	if err != nil {
		writeRBACMutationErr(w, err)
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "marking category permission not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) ListMarkingCategoryAuditEvents(w http.ResponseWriter, r *http.Request) {
	claims, ok := requirePermission(w, r, "markings", "audit")
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id")
	if !ok {
		return
	}
	items, err := h.Repo.ListMarkingCategoryAuditEvents(r.Context(), tenantFromClaims(claims), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		writeJSONErr(w, http.StatusNotFound, "marking category not found")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.MarkingCategoryAuditEvent]{Items: items})
}

func isAllowedMarkingCategoryVisibility(v string) bool {
	switch v {
	case models.MarkingCategoryVisibilityVisible, models.MarkingCategoryVisibilityHidden:
		return true
	default:
		return false
	}
}

func isAllowedMarkingCategoryPrincipalKind(kind string) bool {
	switch kind {
	case models.MarkingCategoryPrincipalUser, models.MarkingCategoryPrincipalGroup:
		return true
	default:
		return false
	}
}

func isAllowedMarkingCategoryPermission(permission string) bool {
	switch permission {
	case models.MarkingCategoryPermissionAdministrator, models.MarkingCategoryPermissionViewer:
		return true
	default:
		return false
	}
}

func validMarkingCategoryPrincipals(items []models.MarkingCategoryPrincipal) bool {
	for _, item := range items {
		kind := strings.ToLower(strings.TrimSpace(item.PrincipalKind))
		if !isAllowedMarkingCategoryPrincipalKind(kind) || item.PrincipalID == uuid.Nil {
			return false
		}
	}
	return true
}

func normalizeMarkingCategoryPrincipals(items []models.MarkingCategoryPrincipal) {
	for idx := range items {
		items[idx].PrincipalKind = strings.ToLower(strings.TrimSpace(items[idx].PrincipalKind))
	}
}

func validOptionalJSONObject(raw json.RawMessage) bool {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "" {
		return true
	}
	var value map[string]any
	return json.Unmarshal(raw, &value) == nil && value != nil
}
