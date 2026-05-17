// Package handlers wires the HTTP endpoints for ontology-definition-service.
package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

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
	UpdateObjectType(ctx context.Context, id uuid.UUID, body *models.UpdateObjectTypeRequest) (*models.ObjectType, error)
	DeleteObjectType(ctx context.Context, id uuid.UUID) (bool, error)

	ListProperties(ctx context.Context, typeID uuid.UUID) ([]models.Property, error)
	CreateProperty(ctx context.Context, typeID uuid.UUID, body *models.CreatePropertyRequest) (*models.Property, error)

	ListLinkTypes(ctx context.Context, objectTypeID *uuid.UUID) ([]models.LinkType, error)
	GetLinkType(ctx context.Context, id uuid.UUID) (*models.LinkType, error)
	CreateLinkType(ctx context.Context, body *models.CreateLinkTypeRequest, ownerID uuid.UUID) (*models.LinkType, error)
	UpdateLinkType(ctx context.Context, id uuid.UUID, body *models.UpdateLinkTypeRequest) (*models.LinkType, error)
	DeleteLinkType(ctx context.Context, id uuid.UUID) (bool, error)

	ListObjectTypeGroups(ctx context.Context, search string, limit, offset int64) ([]models.ObjectTypeGroup, int64, error)
	GetObjectTypeGroup(ctx context.Context, id uuid.UUID) (*models.ObjectTypeGroup, error)
	CreateObjectTypeGroup(ctx context.Context, body *models.CreateObjectTypeGroupRequest, ownerID uuid.UUID) (*models.ObjectTypeGroup, error)
	UpdateObjectTypeGroup(ctx context.Context, id uuid.UUID, body *models.UpdateObjectTypeGroupRequest, actorID uuid.UUID) (*models.ObjectTypeGroup, error)
	DeleteObjectTypeGroup(ctx context.Context, id uuid.UUID) (bool, error)
	AddObjectTypeToGroup(ctx context.Context, groupID, objectTypeID uuid.UUID) (*models.ObjectTypeGroup, error)
	RemoveObjectTypeFromGroup(ctx context.Context, groupID, objectTypeID uuid.UUID) (*models.ObjectTypeGroup, error)

	ListInterfaces(ctx context.Context, page, perPage int, search string) ([]models.OntologyInterface, int, error)
	ListSharedPropertyTypes(ctx context.Context, page, perPage int, search string) ([]models.SharedPropertyType, int, error)
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
	v, err := h.Repo.CreateObjectType(r.Context(), &body, caller.Sub)
	if err != nil {
		slog.Error("create object type", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handlers) UpdateObjectType(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
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
	v, err := h.Repo.UpdateObjectType(r.Context(), id, &body)
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

func (h *Handlers) DeleteObjectType(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	deleted, err := h.Repo.DeleteObjectType(r.Context(), id)
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
