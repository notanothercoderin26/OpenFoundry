// Package handlers wires the HTTP endpoints for ontology-definition-service.
package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// Store is the minimal surface the HTTP handlers need from the repo
// layer. Defined here (consumer-side) so tests can swap in an in-memory
// fake without spinning up Postgres. The concrete *repo.Repo satisfies
// this interface implicitly.
type Store interface {
	ListObjectTypes(ctx context.Context) ([]models.ObjectType, error)
	GetObjectType(ctx context.Context, id uuid.UUID) (*models.ObjectType, error)
	CreateObjectType(ctx context.Context, body *models.CreateObjectTypeRequest, ownerID uuid.UUID) (*models.ObjectType, error)
	UpdateObjectType(ctx context.Context, id uuid.UUID, body *models.UpdateObjectTypeRequest, actorID uuid.UUID) (*models.ObjectType, error)
	UpdateAppCapabilities(ctx context.Context, id uuid.UUID, payload json.RawMessage, actorID uuid.UUID) (*models.ObjectType, error)
	DeleteObjectType(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error)

	ListProperties(ctx context.Context, typeID uuid.UUID) ([]models.Property, error)
	GetProperty(ctx context.Context, id uuid.UUID) (*models.Property, error)
	CreateProperty(ctx context.Context, typeID uuid.UUID, body *models.CreatePropertyRequest, actorID uuid.UUID) (*models.Property, error)
	UpdateProperty(ctx context.Context, id uuid.UUID, body *models.UpdatePropertyRequest, actorID uuid.UUID) (*models.Property, error)
	DeleteProperty(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error)

	ListLinkTypes(ctx context.Context, objectTypeID *uuid.UUID) ([]models.LinkType, error)
	GetLinkType(ctx context.Context, id uuid.UUID) (*models.LinkType, error)
	CreateLinkType(ctx context.Context, body *models.CreateLinkTypeRequest, ownerID uuid.UUID) (*models.LinkType, error)
	UpdateLinkType(ctx context.Context, id uuid.UUID, body *models.UpdateLinkTypeRequest, actorID uuid.UUID) (*models.LinkType, error)
	UpdateLinkTypeAppCapabilities(ctx context.Context, id uuid.UUID, payload json.RawMessage, actorID uuid.UUID) (*models.LinkType, error)
	DeleteLinkType(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error)

	ListObjectTypeGroups(ctx context.Context, search string, limit, offset int64) ([]models.ObjectTypeGroup, int64, error)
	GetObjectTypeGroup(ctx context.Context, id uuid.UUID) (*models.ObjectTypeGroup, error)
	CreateObjectTypeGroup(ctx context.Context, body *models.CreateObjectTypeGroupRequest, ownerID uuid.UUID) (*models.ObjectTypeGroup, error)
	UpdateObjectTypeGroup(ctx context.Context, id uuid.UUID, body *models.UpdateObjectTypeGroupRequest, actorID uuid.UUID) (*models.ObjectTypeGroup, error)
	DeleteObjectTypeGroup(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error)
	AddObjectTypeToGroup(ctx context.Context, groupID, objectTypeID, actorID uuid.UUID) (*models.ObjectTypeGroup, error)
	RemoveObjectTypeFromGroup(ctx context.Context, groupID, objectTypeID, actorID uuid.UUID) (*models.ObjectTypeGroup, error)

	ListInterfaces(ctx context.Context, page, perPage int, search string) ([]models.OntologyInterface, int, error)
	GetInterface(ctx context.Context, id uuid.UUID) (*models.OntologyInterface, error)
	CreateInterface(ctx context.Context, body *models.CreateOntologyInterfaceRequest, ownerID uuid.UUID) (*models.OntologyInterface, error)
	UpdateInterface(ctx context.Context, id uuid.UUID, body *models.UpdateOntologyInterfaceRequest, actorID uuid.UUID) (*models.OntologyInterface, error)
	DeleteInterface(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error)

	ListSharedPropertyTypes(ctx context.Context, page, perPage int, search string) ([]models.SharedPropertyType, int, error)
	GetSharedPropertyType(ctx context.Context, id uuid.UUID) (*models.SharedPropertyType, error)
	CreateSharedPropertyType(ctx context.Context, body *models.CreateSharedPropertyTypeRequest, ownerID uuid.UUID) (*models.SharedPropertyType, error)
	UpdateSharedPropertyType(ctx context.Context, id uuid.UUID, body *models.UpdateSharedPropertyTypeRequest, actorID uuid.UUID) (*models.SharedPropertyType, error)
	DeleteSharedPropertyType(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error)

	// SaveBatch applies the working-state of the Review-edits modal
	// atomically. See repo.SaveBatch for the semantics.
	SaveBatch(ctx context.Context, req *models.BatchSaveRequest, actorID uuid.UUID) (*models.BatchSaveResponse, error)
}

type Handlers struct{ Repo Store }

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (h *Handlers) ListObjectTypes(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	items, err := h.Repo.ListObjectTypes(r.Context())
	if err != nil {
		slog.Error("list object types", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list object types")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ObjectType]{Items: items})
}

func (h *Handlers) GetObjectType(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	v, err := h.Repo.GetObjectType(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "object type not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handlers) CreateObjectType(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateObjectTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Name == "" || body.DisplayName == "" {
		writeJSONErr(w, http.StatusBadRequest, "name and display_name required")
		return
	}
	if status, msg := validateRestrictedViewDatasourceCreate(&body, caller); status != 0 {
		writeJSONErr(w, status, msg)
		return
	}
	v, err := h.Repo.CreateObjectType(r.Context(), &body, caller.Sub)
	if err != nil {
		slog.Error("create object type", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handlers) UpdateObjectType(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body models.UpdateObjectTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	current, err := h.Repo.GetObjectType(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if current == nil {
		writeJSONErr(w, http.StatusNotFound, "object type not found")
		return
	}
	if status, msg := validateRestrictedViewDatasourceUpdate(&body, current, caller); status != 0 {
		writeJSONErr(w, status, msg)
		return
	}
	v, err := h.Repo.UpdateObjectType(r.Context(), id, &body, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "object type not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// UpdateObjectTypeAppCapabilities writes the per-app capabilities
// JSON blob without touching the rest of the row. The payload is a
// free-form JSON object keyed by app name (e.g. `vertex_event`); see
// migration 0004 for the shape.
func (h *Handlers) UpdateObjectTypeAppCapabilities(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body models.UpdateAppCapabilitiesRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if len(body.AppCapabilities) == 0 {
		body.AppCapabilities = json.RawMessage(`{}`)
	}
	// Quick well-formedness check: the payload must be a JSON object.
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(body.AppCapabilities, &probe); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "app_capabilities must be a JSON object")
		return
	}
	v, err := h.Repo.UpdateAppCapabilities(r.Context(), id, body.AppCapabilities, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "object type not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func validateRestrictedViewDatasourceCreate(body *models.CreateObjectTypeRequest, claims *authmw.Claims) (int, string) {
	datasourceType := normalizedDatasourceType(body.BackingDatasourceType, body.BackingRestrictedViewID, body.RestrictedViewID)
	if datasourceType == "" {
		datasourceType = "dataset"
	}
	if datasourceType != "dataset" && datasourceType != "restricted_view" {
		return http.StatusBadRequest, "backing_datasource_type must be dataset or restricted_view"
	}
	if status, msg := validateRestrictedViewStorageMode(body.RestrictedViewStorageMode); status != 0 {
		return status, msg
	}
	policyEdit := len(body.RestrictedViewPolicy) > 0
	if status, msg := validateRestrictedViewPolicyJSON(body.RestrictedViewPolicy); status != 0 {
		return status, msg
	}
	if datasourceType != "restricted_view" && policyEdit {
		return http.StatusBadRequest, "restricted_view_policy requires backing_datasource_type restricted_view"
	}
	if datasourceType != "restricted_view" {
		return 0, ""
	}
	if datasourceType == "restricted_view" && firstTrimmedString(body.RestrictedViewID, body.BackingRestrictedViewID) == "" {
		return http.StatusBadRequest, "restricted_view_id is required when backing_datasource_type is restricted_view"
	}
	return requireRestrictedViewDatasourcePermissions(claims, datasourceType == "restricted_view", policyEdit)
}

func validateRestrictedViewDatasourceUpdate(body *models.UpdateObjectTypeRequest, current *models.ObjectType, claims *authmw.Claims) (int, string) {
	datasourceType := current.BackingDatasourceType
	if body.BackingDatasourceType != nil {
		datasourceType = normalizedDatasourceType(body.BackingDatasourceType, body.BackingRestrictedViewID, body.RestrictedViewID)
	}
	if datasourceType == "" {
		datasourceType = "dataset"
	}
	if datasourceType != "dataset" && datasourceType != "restricted_view" {
		return http.StatusBadRequest, "backing_datasource_type must be dataset or restricted_view"
	}
	if status, msg := validateRestrictedViewStorageMode(body.RestrictedViewStorageMode); status != 0 {
		return status, msg
	}
	policyEdit := len(body.RestrictedViewPolicy) > 0
	if status, msg := validateRestrictedViewPolicyJSON(body.RestrictedViewPolicy); status != 0 {
		return status, msg
	}
	touched := body.BackingDatasourceType != nil ||
		body.BackingRestrictedViewID != nil ||
		body.RestrictedViewID != nil ||
		body.RestrictedViewPolicyVersion != nil ||
		body.RestrictedViewRegisteredPolicyVersion != nil ||
		body.RestrictedViewIndexedPolicyVersion != nil ||
		body.RestrictedViewStorageMode != nil ||
		body.RestrictedViewPolicyUpdatedAt != nil ||
		body.RestrictedViewRegisteredAt != nil ||
		body.RestrictedViewIndexedAt != nil ||
		policyEdit
	if !touched {
		return 0, ""
	}
	if datasourceType != "restricted_view" && policyEdit {
		return http.StatusBadRequest, "restricted_view_policy requires backing_datasource_type restricted_view"
	}
	if datasourceType == "restricted_view" && firstTrimmedString(body.RestrictedViewID, body.BackingRestrictedViewID, current.BackingRestrictedViewID) == "" {
		return http.StatusBadRequest, "restricted_view_id is required when backing_datasource_type is restricted_view"
	}
	return requireRestrictedViewDatasourcePermissions(claims, datasourceType == "restricted_view", policyEdit)
}

func normalizedDatasourceType(value *string, restrictedViewIDs ...*string) string {
	raw := ""
	if value != nil {
		raw = *value
	}
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "restricted_view", "restricted-view", "rv":
		return "restricted_view"
	case "dataset", "":
		if strings.TrimSpace(raw) == "" {
			for _, id := range restrictedViewIDs {
				if id != nil && strings.TrimSpace(*id) != "" {
					return "restricted_view"
				}
			}
		}
		return "dataset"
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

func validateRestrictedViewStorageMode(value *string) (int, string) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return 0, ""
	}
	switch strings.ToLower(strings.TrimSpace(*value)) {
	case "remote", "foundry_object_storage", "local_storage", "local_index", "none":
		return 0, ""
	default:
		return http.StatusBadRequest, "restricted_view_storage_mode must be remote, foundry_object_storage, local_storage, local_index, or none"
	}
}

func validateRestrictedViewPolicyJSON(raw json.RawMessage) (int, string) {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "null" {
		return 0, ""
	}
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return http.StatusBadRequest, "restricted_view_policy must be a JSON object"
	}
	return 0, ""
}

func requireRestrictedViewDatasourcePermissions(claims *authmw.Claims, needsRestrictedViewRead bool, policyEdit bool) (int, string) {
	if claims == nil {
		return http.StatusUnauthorized, "authentication required"
	}
	required := []string{"ontology:manage", "object_type_datasource:manage", "dataset:read"}
	if needsRestrictedViewRead {
		required = append(required, "restricted_view:read", "restricted_view_policy:read")
	}
	for _, permission := range required {
		if hasAnyPermission(claims, permission, legacyPermissionAlias(permission)) {
			continue
		}
		return http.StatusForbidden, "missing permission: " + permission
	}
	if policyEdit && !hasAnyPermission(claims, "restricted_view_policy:edit", "restricted_view:edit", "restricted_view:manage") {
		return http.StatusForbidden, "missing permission: restricted_view_policy:edit"
	}
	return 0, ""
}

func legacyPermissionAlias(permission string) string {
	if permission == "dataset:read" {
		return "datasets:read"
	}
	return permission
}

func hasAnyPermission(claims *authmw.Claims, permissions ...string) bool {
	for _, permission := range permissions {
		if strings.TrimSpace(permission) != "" && claims.HasPermissionKey(permission) {
			return true
		}
	}
	return false
}

func firstTrimmedString(values ...*string) string {
	for _, value := range values {
		if value == nil {
			continue
		}
		if trimmed := strings.TrimSpace(*value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func (h *Handlers) DeleteObjectType(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	deleted, err := h.Repo.DeleteObjectType(r.Context(), id, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "object type not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
