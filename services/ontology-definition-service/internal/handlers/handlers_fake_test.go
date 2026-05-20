package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// fakeStore is an in-memory implementation of handlers.Store. It is
// intentionally simple — just enough to exercise the handler bodies
// (auth, validation, success, not-found). It does not aim to mirror
// the Postgres semantics of the real repo.
type fakeStore struct {
	objectTypes      map[uuid.UUID]*models.ObjectType
	properties       map[uuid.UUID][]models.Property
	linkTypes        map[uuid.UUID]*models.LinkType
	groups           map[uuid.UUID]*models.ObjectTypeGroup
	interfaces       map[uuid.UUID]*models.OntologyInterface
	sharedProperties map[uuid.UUID]*models.SharedPropertyType
	listOTErr        error
	listLTErr        error
	listGrpErr       error
	listIfaceErr     error
	listSPErr        error
	listPropErr      error
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		objectTypes:      map[uuid.UUID]*models.ObjectType{},
		properties:       map[uuid.UUID][]models.Property{},
		linkTypes:        map[uuid.UUID]*models.LinkType{},
		groups:           map[uuid.UUID]*models.ObjectTypeGroup{},
		interfaces:       map[uuid.UUID]*models.OntologyInterface{},
		sharedProperties: map[uuid.UUID]*models.SharedPropertyType{},
	}
}

func (f *fakeStore) ListObjectTypes(_ context.Context) ([]models.ObjectType, error) {
	if f.listOTErr != nil {
		return nil, f.listOTErr
	}
	out := make([]models.ObjectType, 0, len(f.objectTypes))
	for _, v := range f.objectTypes {
		out = append(out, *v)
	}
	return out, nil
}

func (f *fakeStore) GetObjectType(_ context.Context, id uuid.UUID) (*models.ObjectType, error) {
	v, ok := f.objectTypes[id]
	if !ok {
		return nil, nil
	}
	return v, nil
}

func (f *fakeStore) CreateObjectType(_ context.Context, body *models.CreateObjectTypeRequest, ownerID uuid.UUID) (*models.ObjectType, error) {
	id := uuid.New()
	if body.ID != nil && *body.ID != uuid.Nil {
		id = *body.ID
	}
	v := &models.ObjectType{
		ID: id, Name: body.Name, DisplayName: body.DisplayName,
		Description: body.Description, OwnerID: ownerID,
		BackingDatasetID:                      body.BackingDatasetID,
		BackingDatasetRID:                     body.BackingDatasetRID,
		BackingDatasourceType:                 stringPtrValue(body.BackingDatasourceType),
		BackingRestrictedViewID:               firstStringPtr(body.BackingRestrictedViewID, body.RestrictedViewID),
		RestrictedViewPolicy:                  body.RestrictedViewPolicy,
		RestrictedViewPolicyVersion:           intPtrValue(body.RestrictedViewPolicyVersion),
		RestrictedViewRegisteredPolicyVersion: intPtrValue(body.RestrictedViewRegisteredPolicyVersion),
		RestrictedViewIndexedPolicyVersion:    intPtrValue(body.RestrictedViewIndexedPolicyVersion),
		RestrictedViewStorageMode:             stringPtrValue(body.RestrictedViewStorageMode),
		RestrictedViewPolicyUpdatedAt:         body.RestrictedViewPolicyUpdatedAt,
		RestrictedViewRegisteredAt:            body.RestrictedViewRegisteredAt,
		RestrictedViewIndexedAt:               body.RestrictedViewIndexedAt,
		CreatedAt:                             time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	models.EnrichObjectTypeMetadata(v, nil)
	f.objectTypes[id] = v
	return v, nil
}

func (f *fakeStore) UpdateObjectType(_ context.Context, id uuid.UUID, body *models.UpdateObjectTypeRequest, _ uuid.UUID) (*models.ObjectType, error) {
	v, ok := f.objectTypes[id]
	if !ok {
		return nil, nil
	}
	if body.DisplayName != nil {
		v.DisplayName = *body.DisplayName
	}
	if body.Description != nil {
		v.Description = *body.Description
	}
	if body.BackingDatasourceType != nil {
		v.BackingDatasourceType = *body.BackingDatasourceType
		if *body.BackingDatasourceType == "dataset" {
			v.BackingRestrictedViewID = nil
			v.RestrictedViewID = nil
		}
	}
	if body.BackingRestrictedViewID != nil || body.RestrictedViewID != nil {
		v.BackingRestrictedViewID = firstStringPtr(body.BackingRestrictedViewID, body.RestrictedViewID)
	}
	if len(body.RestrictedViewPolicy) > 0 {
		v.RestrictedViewPolicy = body.RestrictedViewPolicy
	}
	if body.RestrictedViewPolicyVersion != nil {
		v.RestrictedViewPolicyVersion = *body.RestrictedViewPolicyVersion
	}
	if body.RestrictedViewRegisteredPolicyVersion != nil {
		v.RestrictedViewRegisteredPolicyVersion = *body.RestrictedViewRegisteredPolicyVersion
	}
	if body.RestrictedViewIndexedPolicyVersion != nil {
		v.RestrictedViewIndexedPolicyVersion = *body.RestrictedViewIndexedPolicyVersion
	}
	if body.RestrictedViewStorageMode != nil {
		v.RestrictedViewStorageMode = *body.RestrictedViewStorageMode
	}
	models.EnrichObjectTypeMetadata(v, nil)
	return v, nil
}

func (f *fakeStore) DeleteObjectType(_ context.Context, id uuid.UUID, _ uuid.UUID) (bool, error) {
	if _, ok := f.objectTypes[id]; !ok {
		return false, nil
	}
	delete(f.objectTypes, id)
	return true, nil
}

func (f *fakeStore) UpdateAppCapabilities(_ context.Context, id uuid.UUID, payload json.RawMessage, _ uuid.UUID) (*models.ObjectType, error) {
	v, ok := f.objectTypes[id]
	if !ok {
		return nil, nil
	}
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	v.AppCapabilities = payload
	v.UpdatedAt = time.Now().UTC()
	return v, nil
}

func (f *fakeStore) ListProperties(_ context.Context, typeID uuid.UUID) ([]models.Property, error) {
	if f.listPropErr != nil {
		return nil, f.listPropErr
	}
	return append([]models.Property(nil), f.properties[typeID]...), nil
}

func (f *fakeStore) GetProperty(_ context.Context, id uuid.UUID) (*models.Property, error) {
	for _, props := range f.properties {
		for i := range props {
			if props[i].ID == id {
				p := props[i]
				return &p, nil
			}
		}
	}
	return nil, nil
}

func (f *fakeStore) UpdateProperty(_ context.Context, id uuid.UUID, body *models.UpdatePropertyRequest, _ uuid.UUID) (*models.Property, error) {
	for typeID, props := range f.properties {
		for i := range props {
			if props[i].ID == id {
				if body.DisplayName != nil {
					props[i].DisplayName = *body.DisplayName
				}
				if body.PropertyType != nil {
					props[i].PropertyType = *body.PropertyType
				}
				if body.Description != nil {
					props[i].Description = *body.Description
				}
				props[i].Version++
				p := props[i]
				f.properties[typeID] = props
				return &p, nil
			}
		}
	}
	return nil, nil
}

func (f *fakeStore) DeleteProperty(_ context.Context, id uuid.UUID, _ uuid.UUID) (bool, error) {
	for typeID, props := range f.properties {
		for i := range props {
			if props[i].ID == id {
				f.properties[typeID] = append(props[:i], props[i+1:]...)
				return true, nil
			}
		}
	}
	return false, nil
}

func (f *fakeStore) CreateProperty(_ context.Context, typeID uuid.UUID, body *models.CreatePropertyRequest, _ uuid.UUID) (*models.Property, error) {
	p := models.Property{
		ID: uuid.New(), ObjectTypeID: typeID, Name: body.Name,
		DisplayName: body.DisplayName, PropertyType: body.PropertyType,
		CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	if p.DisplayName == "" {
		p.DisplayName = p.Name
	}
	models.EnrichPropertyMetadata(&p)
	f.properties[typeID] = append(f.properties[typeID], p)
	return &p, nil
}

func (f *fakeStore) ListLinkTypes(_ context.Context, objectTypeID *uuid.UUID) ([]models.LinkType, error) {
	if f.listLTErr != nil {
		return nil, f.listLTErr
	}
	out := make([]models.LinkType, 0, len(f.linkTypes))
	for _, v := range f.linkTypes {
		if objectTypeID != nil && v.SourceTypeID != *objectTypeID && v.TargetTypeID != *objectTypeID {
			continue
		}
		out = append(out, *v)
	}
	return out, nil
}

func (f *fakeStore) GetLinkType(_ context.Context, id uuid.UUID) (*models.LinkType, error) {
	v, ok := f.linkTypes[id]
	if !ok {
		return nil, nil
	}
	return v, nil
}

func (f *fakeStore) CreateLinkType(_ context.Context, body *models.CreateLinkTypeRequest, ownerID uuid.UUID) (*models.LinkType, error) {
	id := uuid.New()
	v := &models.LinkType{
		ID: id, Name: body.Name, DisplayName: body.DisplayName,
		SourceTypeID: body.SourceTypeID, TargetTypeID: body.TargetTypeID,
		Cardinality: body.Cardinality, Visibility: body.Visibility,
		OwnerID: ownerID, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	if v.Cardinality == "" {
		v.Cardinality = "many_to_many"
	}
	if v.Visibility == "" {
		v.Visibility = "normal"
	}
	if v.DisplayName == "" {
		v.DisplayName = v.Name
	}
	f.linkTypes[id] = v
	return v, nil
}

func (f *fakeStore) UpdateLinkType(_ context.Context, id uuid.UUID, body *models.UpdateLinkTypeRequest, _ uuid.UUID) (*models.LinkType, error) {
	v, ok := f.linkTypes[id]
	if !ok {
		return nil, nil
	}
	if body.DisplayName != nil {
		v.DisplayName = *body.DisplayName
	}
	if body.Cardinality != nil && *body.Cardinality != "" {
		v.Cardinality = *body.Cardinality
	}
	if body.Visibility != nil && *body.Visibility != "" {
		v.Visibility = *body.Visibility
	}
	return v, nil
}

func (f *fakeStore) DeleteLinkType(_ context.Context, id uuid.UUID, _ uuid.UUID) (bool, error) {
	if _, ok := f.linkTypes[id]; !ok {
		return false, nil
	}
	delete(f.linkTypes, id)
	return true, nil
}

func (f *fakeStore) UpdateLinkTypeAppCapabilities(_ context.Context, id uuid.UUID, payload json.RawMessage, _ uuid.UUID) (*models.LinkType, error) {
	v, ok := f.linkTypes[id]
	if !ok {
		return nil, nil
	}
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	v.AppCapabilities = payload
	v.UpdatedAt = time.Now().UTC()
	return v, nil
}

func (f *fakeStore) ListObjectTypeGroups(_ context.Context, _ string, _, _ int64) ([]models.ObjectTypeGroup, int64, error) {
	if f.listGrpErr != nil {
		return nil, 0, f.listGrpErr
	}
	out := make([]models.ObjectTypeGroup, 0, len(f.groups))
	for _, v := range f.groups {
		out = append(out, *v)
	}
	return out, int64(len(out)), nil
}

func (f *fakeStore) GetObjectTypeGroup(_ context.Context, id uuid.UUID) (*models.ObjectTypeGroup, error) {
	v, ok := f.groups[id]
	if !ok {
		return nil, nil
	}
	return v, nil
}

func (f *fakeStore) CreateObjectTypeGroup(_ context.Context, body *models.CreateObjectTypeGroupRequest, ownerID uuid.UUID) (*models.ObjectTypeGroup, error) {
	id := uuid.New()
	if body.ID != nil && *body.ID != uuid.Nil {
		id = *body.ID
	}
	v := &models.ObjectTypeGroup{
		ID: id, Name: body.Name, DisplayName: body.DisplayName,
		Description: body.Description, Visibility: body.Visibility,
		Status: body.Status, OwnerID: ownerID,
		CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
		ObjectTypeIDs: append([]uuid.UUID(nil), body.ObjectTypeIDs...),
	}
	if v.Visibility == "" {
		v.Visibility = "normal"
	}
	if v.Status == "" {
		v.Status = "active"
	}
	v.ObjectTypeCount = len(v.ObjectTypeIDs)
	f.groups[id] = v
	return v, nil
}

func (f *fakeStore) UpdateObjectTypeGroup(_ context.Context, id uuid.UUID, body *models.UpdateObjectTypeGroupRequest, _ uuid.UUID) (*models.ObjectTypeGroup, error) {
	v, ok := f.groups[id]
	if !ok {
		return nil, nil
	}
	if body.DisplayName != nil {
		v.DisplayName = *body.DisplayName
	}
	if body.Status != nil && *body.Status != "" {
		v.Status = *body.Status
	}
	return v, nil
}

func (f *fakeStore) DeleteObjectTypeGroup(_ context.Context, id uuid.UUID, _ uuid.UUID) (bool, error) {
	if _, ok := f.groups[id]; !ok {
		return false, nil
	}
	delete(f.groups, id)
	return true, nil
}

func (f *fakeStore) AddObjectTypeToGroup(_ context.Context, groupID, objectTypeID, _ uuid.UUID) (*models.ObjectTypeGroup, error) {
	v, ok := f.groups[groupID]
	if !ok {
		return nil, nil
	}
	for _, existing := range v.ObjectTypeIDs {
		if existing == objectTypeID {
			return v, nil
		}
	}
	v.ObjectTypeIDs = append(v.ObjectTypeIDs, objectTypeID)
	v.ObjectTypeCount = len(v.ObjectTypeIDs)
	return v, nil
}

func (f *fakeStore) RemoveObjectTypeFromGroup(_ context.Context, groupID, objectTypeID, _ uuid.UUID) (*models.ObjectTypeGroup, error) {
	v, ok := f.groups[groupID]
	if !ok {
		return nil, nil
	}
	out := v.ObjectTypeIDs[:0]
	for _, existing := range v.ObjectTypeIDs {
		if existing != objectTypeID {
			out = append(out, existing)
		}
	}
	v.ObjectTypeIDs = out
	v.ObjectTypeCount = len(v.ObjectTypeIDs)
	return v, nil
}

func (f *fakeStore) GetInterface(_ context.Context, id uuid.UUID) (*models.OntologyInterface, error) {
	v, ok := f.interfaces[id]
	if !ok {
		return nil, nil
	}
	return v, nil
}

func (f *fakeStore) CreateInterface(_ context.Context, body *models.CreateOntologyInterfaceRequest, ownerID uuid.UUID) (*models.OntologyInterface, error) {
	id := uuid.New()
	v := &models.OntologyInterface{
		ID:          id,
		Name:        body.Name,
		DisplayName: body.DisplayName,
		Description: body.Description,
		OwnerID:     ownerID,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	if v.DisplayName == "" {
		v.DisplayName = v.Name
	}
	if f.interfaces == nil {
		f.interfaces = map[uuid.UUID]*models.OntologyInterface{}
	}
	f.interfaces[id] = v
	return v, nil
}

func (f *fakeStore) UpdateInterface(_ context.Context, id uuid.UUID, body *models.UpdateOntologyInterfaceRequest, _ uuid.UUID) (*models.OntologyInterface, error) {
	v, ok := f.interfaces[id]
	if !ok {
		return nil, nil
	}
	if body.DisplayName != nil {
		v.DisplayName = *body.DisplayName
	}
	if body.Description != nil {
		v.Description = *body.Description
	}
	v.UpdatedAt = time.Now().UTC()
	return v, nil
}

func (f *fakeStore) DeleteInterface(_ context.Context, id uuid.UUID, _ uuid.UUID) (bool, error) {
	if _, ok := f.interfaces[id]; !ok {
		return false, nil
	}
	delete(f.interfaces, id)
	return true, nil
}

func (f *fakeStore) GetSharedPropertyType(_ context.Context, id uuid.UUID) (*models.SharedPropertyType, error) {
	v, ok := f.sharedProperties[id]
	if !ok {
		return nil, nil
	}
	return v, nil
}

func (f *fakeStore) CreateSharedPropertyType(_ context.Context, body *models.CreateSharedPropertyTypeRequest, ownerID uuid.UUID) (*models.SharedPropertyType, error) {
	id := uuid.New()
	v := &models.SharedPropertyType{
		ID:               id,
		Name:             body.Name,
		DisplayName:      body.DisplayName,
		Description:      body.Description,
		PropertyType:     body.PropertyType,
		Required:         body.Required,
		UniqueConstraint: body.UniqueConstraint,
		TimeDependent:    body.TimeDependent,
		DefaultValue:     body.DefaultValue,
		ValidationRules:  body.ValidationRules,
		OwnerID:          ownerID,
		CreatedAt:        time.Now().UTC(),
		UpdatedAt:        time.Now().UTC(),
	}
	if v.DisplayName == "" {
		v.DisplayName = v.Name
	}
	if f.sharedProperties == nil {
		f.sharedProperties = map[uuid.UUID]*models.SharedPropertyType{}
	}
	f.sharedProperties[id] = v
	return v, nil
}

func (f *fakeStore) UpdateSharedPropertyType(_ context.Context, id uuid.UUID, body *models.UpdateSharedPropertyTypeRequest, _ uuid.UUID) (*models.SharedPropertyType, error) {
	v, ok := f.sharedProperties[id]
	if !ok {
		return nil, nil
	}
	if body.DisplayName != nil {
		v.DisplayName = *body.DisplayName
	}
	if body.Description != nil {
		v.Description = *body.Description
	}
	if body.Required != nil {
		v.Required = *body.Required
	}
	if body.UniqueConstraint != nil {
		v.UniqueConstraint = *body.UniqueConstraint
	}
	if body.TimeDependent != nil {
		v.TimeDependent = *body.TimeDependent
	}
	if body.DefaultValue != nil {
		v.DefaultValue = body.DefaultValue
	}
	if body.ValidationRules != nil {
		v.ValidationRules = body.ValidationRules
	}
	v.UpdatedAt = time.Now().UTC()
	return v, nil
}

func (f *fakeStore) DeleteSharedPropertyType(_ context.Context, id uuid.UUID, _ uuid.UUID) (bool, error) {
	if _, ok := f.sharedProperties[id]; !ok {
		return false, nil
	}
	delete(f.sharedProperties, id)
	return true, nil
}

func (f *fakeStore) ListInterfaces(_ context.Context, _, _ int, _ string) ([]models.OntologyInterface, int, error) {
	if f.listIfaceErr != nil {
		return nil, 0, f.listIfaceErr
	}
	out := make([]models.OntologyInterface, 0, len(f.interfaces))
	for _, v := range f.interfaces {
		out = append(out, *v)
	}
	return out, len(f.interfaces), nil
}

func (f *fakeStore) ListSharedPropertyTypes(_ context.Context, _, _ int, _ string) ([]models.SharedPropertyType, int, error) {
	if f.listSPErr != nil {
		return nil, 0, f.listSPErr
	}
	out := make([]models.SharedPropertyType, 0, len(f.sharedProperties))
	for _, v := range f.sharedProperties {
		out = append(out, *v)
	}
	return out, len(f.sharedProperties), nil
}

// Object Views — handler-level fake. Keeps a slice in memory so the
// test suite can assert against List + CRUD round-trips without
// dragging Postgres in.
func (f *fakeStore) ListObjectViews(_ context.Context, _ *uuid.UUID, _ string, _, _ int) ([]models.ObjectView, int, error) {
	return nil, 0, nil
}

func (f *fakeStore) GetObjectView(_ context.Context, _ uuid.UUID) (*models.ObjectView, error) {
	return nil, nil
}

func (f *fakeStore) CreateObjectView(_ context.Context, body *models.CreateObjectViewRequest, ownerID uuid.UUID) (*models.ObjectView, error) {
	if body == nil {
		return nil, nil
	}
	now := time.Now().UTC()
	return &models.ObjectView{
		ID:           uuid.New(),
		Name:         body.Name,
		DisplayName:  body.DisplayName,
		Description:  body.Description,
		ObjectTypeID: body.ObjectTypeID,
		Mode:         body.Mode,
		FormFactor:   body.FormFactor,
		Config:       body.Config,
		BranchLabel:  body.BranchLabel,
		OwnerID:      ownerID,
		CreatedAt:    now,
		UpdatedAt:    now,
		Version:      1,
	}, nil
}

func (f *fakeStore) UpdateObjectView(_ context.Context, _ uuid.UUID, _ *models.UpdateObjectViewRequest, _ uuid.UUID) (*models.ObjectView, error) {
	return nil, nil
}

func (f *fakeStore) DeleteObjectView(_ context.Context, _ uuid.UUID, _ uuid.UUID) (bool, error) {
	return true, nil
}

// SaveBatch is a thin stub good enough to verify the BatchSave handler
// wiring (auth, JSON decoding, route registration). Every edit gets an
// "ok" result with the edit's own ClientID echoed back; the full
// dispatch + atomic-rollback semantics are exercised by the repo-level
// integration tests against Postgres.
func (f *fakeStore) SaveBatch(_ context.Context, req *models.BatchSaveRequest, _ uuid.UUID) (*models.BatchSaveResponse, error) {
	resp := &models.BatchSaveResponse{
		BatchID: uuid.New(),
		Status:  models.BatchStatusOK,
		Results: []models.BatchEditResult{},
	}
	if req == nil {
		return resp, nil
	}
	for _, edit := range req.Edits {
		resp.Results = append(resp.Results, models.BatchEditResult{
			ClientID: edit.ClientID,
			Resource: edit.Resource,
			Op:       edit.Op,
			Status:   models.BatchStatusOK,
		})
	}
	return resp, nil
}

// ListAuditLog stub for handler-level tests. The real history view is
// driven against Postgres; in-memory fake just returns an empty slice
// so the handler's wiring (auth, query parsing, envelope) is verified.
func (f *fakeStore) ListAuditLog(_ context.Context, _ models.AuditLogFilter) ([]models.AuditLogEntry, error) {
	return []models.AuditLogEntry{}, nil
}

// authed produces a request that already has Claims attached, mimicking
// what authmw.Middleware would do on a real protected route.
func authed(method, target string, body string) *http.Request {
	return authedWithClaims(method, target, body, &authmw.Claims{Sub: uuid.New()})
}

func authedWithClaims(method, target string, body string, claims *authmw.Claims) *http.Request {
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, r)
	req = req.WithContext(authmw.ContextWithClaims(context.Background(), claims))
	return req
}

func authedWithPermissions(method, target string, body string, permissions ...string) *http.Request {
	return authedWithClaims(method, target, body, &authmw.Claims{Sub: uuid.New(), Permissions: permissions})
}

func firstStringPtr(values ...*string) *string {
	for _, value := range values {
		if value != nil && strings.TrimSpace(*value) != "" {
			return value
		}
	}
	return nil
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func intPtrValue(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func newRouter(h *handlers.Handlers) *chi.Mux {
	r := chi.NewRouter()
	r.Get("/object-types", h.ListObjectTypes)
	r.Post("/object-types", h.CreateObjectType)
	r.Get("/object-types/{id}", h.GetObjectType)
	r.Patch("/object-types/{id}", h.UpdateObjectType)
	r.Delete("/object-types/{id}", h.DeleteObjectType)
	r.Get("/object-types/{id}/properties", h.ListProperties)
	r.Post("/object-types/{id}/properties", h.CreateProperty)

	r.Get("/links", h.ListLinkTypes)
	r.Post("/links", h.CreateLinkType)
	r.Get("/links/{id}", h.GetLinkType)
	r.Patch("/links/{id}", h.UpdateLinkType)
	r.Delete("/links/{id}", h.DeleteLinkType)

	r.Get("/object-type-groups", h.ListObjectTypeGroups)
	r.Post("/object-type-groups", h.CreateObjectTypeGroup)
	r.Get("/object-type-groups/{id}", h.GetObjectTypeGroup)
	r.Patch("/object-type-groups/{id}", h.UpdateObjectTypeGroup)
	r.Delete("/object-type-groups/{id}", h.DeleteObjectTypeGroup)
	r.Post("/object-type-groups/{id}/object-types/{objectTypeId}", h.AddObjectTypeToGroup)
	r.Delete("/object-type-groups/{id}/object-types/{objectTypeId}", h.RemoveObjectTypeFromGroup)

	r.Get("/interfaces", h.ListInterfaces)
	r.Get("/shared-property-types", h.ListSharedPropertyTypes)

	r.Post("/batch-save", h.BatchSave)
	return r
}

// ── Object types ────────────────────────────────────────────────────────

func TestListObjectTypesHappyPath(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	_, _ = store.CreateObjectType(context.Background(),
		&models.CreateObjectTypeRequest{Name: "Asset", DisplayName: "Asset"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed("GET", "/object-types", ""))
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), "Asset")
}

func TestListObjectTypesRepoError(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	store.listOTErr = errors.New("boom")
	r := newRouter(&handlers.Handlers{Repo: store})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed("GET", "/object-types", ""))
	assert.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestGetObjectTypeRequiresAuth(t *testing.T) {
	t.Parallel()
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest("GET", "/object-types/"+uuid.New().String(), nil))
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestGetObjectTypeBadUUID(t *testing.T) {
	t.Parallel()
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed("GET", "/object-types/not-a-uuid", ""))
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestGetObjectTypeNotFound(t *testing.T) {
	t.Parallel()
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed("GET", "/object-types/"+uuid.New().String(), ""))
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGetObjectTypeHappyPath(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectType(context.Background(),
		&models.CreateObjectTypeRequest{Name: "Asset", DisplayName: "Asset"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed("GET", "/object-types/"+v.ID.String(), ""))
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestCreateObjectTypeInvalidJSON(t *testing.T) {
	t.Parallel()
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed("POST", "/object-types", "{not json"))
	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestCreateObjectTypeHappyPath(t *testing.T) {
	t.Parallel()
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed("POST", "/object-types",
		`{"name":"Asset","display_name":"Asset"}`))
	assert.Equal(t, http.StatusCreated, rec.Code)
}

func TestCreateRestrictedViewBackedObjectTypeRequiresDatasourcePermissions(t *testing.T) {
	t.Parallel()
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	body := `{"name":"Ticket","display_name":"Ticket","backing_datasource_type":"restricted_view","restricted_view_id":"rv.ticket_rows"}`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authed("POST", "/object-types", body))
	assert.Equal(t, http.StatusForbidden, rec.Code)
	assert.Contains(t, rec.Body.String(), "ontology:manage")
}

func TestCreateRestrictedViewBackedObjectTypeReturnsPropagationStatus(t *testing.T) {
	t.Parallel()
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})
	body := `{
		"name":"Ticket",
		"display_name":"Ticket",
		"backing_datasource_type":"restricted_view",
		"restricted_view_id":"rv.ticket_rows",
		"restricted_view_policy":{"kind":"granular_policy","version":1,"root":{"id":"root","type":"group","operator":"and","children":[]}},
		"restricted_view_policy_version":4,
		"restricted_view_registered_policy_version":2,
		"restricted_view_indexed_policy_version":1,
		"restricted_view_storage_mode":"foundry_object_storage"
	}`
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, authedWithPermissions("POST", "/object-types", body,
		"ontology:manage",
		"object_type_datasource:manage",
		"dataset:read",
		"restricted_view:read",
		"restricted_view_policy:read",
		"restricted_view_policy:edit",
	))
	assert.Equal(t, http.StatusCreated, rec.Code)

	var got models.ObjectType
	assert.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	assert.Equal(t, "restricted_view", got.BackingDatasourceType)
	if assert.NotNil(t, got.RestrictedViewID) {
		assert.Equal(t, "rv.ticket_rows", *got.RestrictedViewID)
	}
	if assert.NotNil(t, got.RestrictedViewPropagationStatus) {
		assert.True(t, got.RestrictedViewPropagationStatus.RequiresReregistration)
		assert.True(t, got.RestrictedViewPropagationStatus.RequiresReindex)
	}
}

func TestUpdateObjectTypeAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectType(context.Background(),
		&models.CreateObjectTypeRequest{Name: "Asset", DisplayName: "Asset"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("PATCH", "/object-types/"+v.ID.String(), strings.NewReader(`{}`)))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-types/bogus", `{}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid body", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-types/"+v.ID.String(), `{not json`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-types/"+uuid.New().String(), `{"description":"x"}`))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-types/"+v.ID.String(), `{"description":"updated"}`))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "updated")
	})
}

func TestDeleteObjectTypeAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectType(context.Background(),
		&models.CreateObjectTypeRequest{Name: "Asset", DisplayName: "Asset"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("DELETE", "/object-types/"+v.ID.String(), nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/object-types/bogus", ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/object-types/"+uuid.New().String(), ""))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/object-types/"+v.ID.String(), ""))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})
}

// ── Properties ──────────────────────────────────────────────────────────

func TestListPropertiesAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectType(context.Background(),
		&models.CreateObjectTypeRequest{Name: "Asset", DisplayName: "Asset"}, uuid.New())
	_, _ = store.CreateProperty(context.Background(), v.ID,
		&models.CreatePropertyRequest{Name: "label", PropertyType: "string"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", "/object-types/"+v.ID.String()+"/properties", nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/object-types/bogus/properties", ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/object-types/"+v.ID.String()+"/properties", ""))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "label")
	})
}

func TestCreatePropertyAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectType(context.Background(),
		&models.CreateObjectTypeRequest{Name: "Asset", DisplayName: "Asset"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("POST", "/object-types/"+v.ID.String()+"/properties",
			strings.NewReader(`{"name":"x","property_type":"string"}`)))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-types/bogus/properties",
			`{"name":"x","property_type":"string"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid body", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-types/"+v.ID.String()+"/properties",
			`{not json`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("missing fields", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-types/"+v.ID.String()+"/properties",
			`{"name":"","property_type":""}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-types/"+v.ID.String()+"/properties",
			`{"name":"label","property_type":"string"}`))
		assert.Equal(t, http.StatusCreated, rec.Code)
	})
}

// ── Link types ──────────────────────────────────────────────────────────

func TestListLinkTypesAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	src := uuid.New()
	tgt := uuid.New()
	_, _ = store.CreateLinkType(context.Background(),
		&models.CreateLinkTypeRequest{Name: "owns", SourceTypeID: src, TargetTypeID: tgt}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", "/links", nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad filter", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/links?object_type_id=bogus", ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("happy unfiltered", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/links", ""))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "owns")
	})
	t.Run("happy filtered", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/links?object_type_id="+src.String(), ""))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "owns")
	})
}

func TestGetLinkTypeAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateLinkType(context.Background(),
		&models.CreateLinkTypeRequest{Name: "owns", SourceTypeID: uuid.New(), TargetTypeID: uuid.New()}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", "/links/"+v.ID.String(), nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/links/bogus", ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/links/"+uuid.New().String(), ""))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/links/"+v.ID.String(), ""))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestCreateLinkTypeAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	r := newRouter(&handlers.Handlers{Repo: store})
	src := uuid.New().String()
	tgt := uuid.New().String()

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("POST", "/links",
			strings.NewReader(`{"name":"owns","source_type_id":"`+src+`","target_type_id":"`+tgt+`"}`)))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("invalid body", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/links", `{not json`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("missing required", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/links", `{"name":""}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid cardinality", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/links",
			`{"name":"x","source_type_id":"`+src+`","target_type_id":"`+tgt+`","cardinality":"wat"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid visibility", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/links",
			`{"name":"x","source_type_id":"`+src+`","target_type_id":"`+tgt+`","visibility":"wat"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/links",
			`{"name":"owns","source_type_id":"`+src+`","target_type_id":"`+tgt+`","cardinality":"one_to_many","visibility":"normal"}`))
		assert.Equal(t, http.StatusCreated, rec.Code)
	})
}

func TestUpdateLinkTypeAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateLinkType(context.Background(),
		&models.CreateLinkTypeRequest{Name: "owns", SourceTypeID: uuid.New(), TargetTypeID: uuid.New()}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("PATCH", "/links/"+v.ID.String(), strings.NewReader(`{}`)))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/links/bogus", `{}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid body", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/links/"+v.ID.String(), `{not json`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid cardinality", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/links/"+v.ID.String(), `{"cardinality":"wat"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid visibility", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/links/"+v.ID.String(), `{"visibility":"wat"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/links/"+uuid.New().String(), `{"display_name":"x"}`))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/links/"+v.ID.String(),
			`{"display_name":"renamed","cardinality":"one_to_one","visibility":"hidden"}`))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestDeleteLinkTypeAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateLinkType(context.Background(),
		&models.CreateLinkTypeRequest{Name: "owns", SourceTypeID: uuid.New(), TargetTypeID: uuid.New()}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("DELETE", "/links/"+v.ID.String(), nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/links/bogus", ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/links/"+uuid.New().String(), ""))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/links/"+v.ID.String(), ""))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})
}

// ── Object type groups ──────────────────────────────────────────────────

func TestListObjectTypeGroupsAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	_, _ = store.CreateObjectTypeGroup(context.Background(),
		&models.CreateObjectTypeGroupRequest{Name: "core"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", "/object-type-groups", nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("happy with paging", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/object-type-groups?page=2&per_page=500&search=foo", ""))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
	t.Run("happy clamped", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/object-type-groups?page=-1&per_page=-1", ""))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestGetObjectTypeGroupAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectTypeGroup(context.Background(),
		&models.CreateObjectTypeGroupRequest{Name: "core"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", "/object-type-groups/"+v.ID.String(), nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/object-type-groups/bogus", ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/object-type-groups/"+uuid.New().String(), ""))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/object-type-groups/"+v.ID.String(), ""))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestCreateObjectTypeGroupAll(t *testing.T) {
	t.Parallel()
	r := newRouter(&handlers.Handlers{Repo: newFakeStore()})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("POST", "/object-type-groups",
			strings.NewReader(`{"name":"core"}`)))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("invalid body", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-type-groups", `{not json`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("missing name", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-type-groups", `{"name":""}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid visibility", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-type-groups", `{"name":"core","visibility":"wat"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid status", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-type-groups", `{"name":"core","status":"wat"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST", "/object-type-groups",
			`{"name":"core","visibility":"normal","status":"active"}`))
		assert.Equal(t, http.StatusCreated, rec.Code)
	})
}

func TestUpdateObjectTypeGroupAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectTypeGroup(context.Background(),
		&models.CreateObjectTypeGroupRequest{Name: "core"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("PATCH", "/object-type-groups/"+v.ID.String(), strings.NewReader(`{}`)))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-type-groups/bogus", `{}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid body", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-type-groups/"+v.ID.String(), `{not json`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid visibility", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-type-groups/"+v.ID.String(), `{"visibility":"wat"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("invalid status", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-type-groups/"+v.ID.String(), `{"status":"wat"}`))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-type-groups/"+uuid.New().String(), `{"display_name":"x"}`))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("PATCH", "/object-type-groups/"+v.ID.String(),
			`{"display_name":"Core","status":"experimental","visibility":"hidden"}`))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestDeleteObjectTypeGroupAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectTypeGroup(context.Background(),
		&models.CreateObjectTypeGroupRequest{Name: "core"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("DELETE", "/object-type-groups/"+v.ID.String(), nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("bad uuid", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/object-type-groups/bogus", ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/object-type-groups/"+uuid.New().String(), ""))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE", "/object-type-groups/"+v.ID.String(), ""))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})
}

func TestAddRemoveObjectTypeToGroup(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	v, _ := store.CreateObjectTypeGroup(context.Background(),
		&models.CreateObjectTypeGroupRequest{Name: "core"}, uuid.New())
	ot, _ := store.CreateObjectType(context.Background(),
		&models.CreateObjectTypeRequest{Name: "Asset", DisplayName: "Asset"}, uuid.New())
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("add: auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("POST",
			"/object-type-groups/"+v.ID.String()+"/object-types/"+ot.ID.String(), nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("add: bad group id", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST",
			"/object-type-groups/bogus/object-types/"+ot.ID.String(), ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("add: bad object type id", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST",
			"/object-type-groups/"+v.ID.String()+"/object-types/bogus", ""))
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
	t.Run("add: group not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST",
			"/object-type-groups/"+uuid.New().String()+"/object-types/"+ot.ID.String(), ""))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("add: happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("POST",
			"/object-type-groups/"+v.ID.String()+"/object-types/"+ot.ID.String(), ""))
		assert.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("remove: auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("DELETE",
			"/object-type-groups/"+v.ID.String()+"/object-types/"+ot.ID.String(), nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("remove: group not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE",
			"/object-type-groups/"+uuid.New().String()+"/object-types/"+ot.ID.String(), ""))
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
	t.Run("remove: happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("DELETE",
			"/object-type-groups/"+v.ID.String()+"/object-types/"+ot.ID.String(), ""))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

// ── Interfaces + shared property types ──────────────────────────────────

func TestListInterfacesAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	iID := uuid.New()
	store.interfaces[iID] = &models.OntologyInterface{ID: iID, Name: "Identifiable", DisplayName: "Identifiable"}
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", "/interfaces", nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/interfaces?page=1&per_page=10&search=Id", ""))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "Identifiable")
	})
	t.Run("clamped per_page", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/interfaces?per_page=9999", ""))
		assert.Equal(t, http.StatusOK, rec.Code)
	})
	t.Run("repo error", func(t *testing.T) {
		store.listIfaceErr = errors.New("db down")
		defer func() { store.listIfaceErr = nil }()
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/interfaces", ""))
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

func TestListSharedPropertyTypesAll(t *testing.T) {
	t.Parallel()
	store := newFakeStore()
	sptID := uuid.New()
	store.sharedProperties[sptID] = &models.SharedPropertyType{
		ID: sptID, Name: "iso_currency", DisplayName: "ISO Currency", PropertyType: "string",
	}
	r := newRouter(&handlers.Handlers{Repo: store})

	t.Run("auth", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest("GET", "/shared-property-types", nil))
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
	t.Run("happy", func(t *testing.T) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/shared-property-types", ""))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "iso_currency")
	})
	t.Run("repo error", func(t *testing.T) {
		store.listSPErr = errors.New("db down")
		defer func() { store.listSPErr = nil }()
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, authed("GET", "/shared-property-types", ""))
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})
}

// Compile-time guard: fakeStore satisfies handlers.Store.
var _ handlers.Store = (*fakeStore)(nil)
