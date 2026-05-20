package handlers_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

func TestObjectTypeJSONShape(t *testing.T) {
	t.Parallel()
	icon := "person"
	color := "#abcdef"
	pk := "id"
	v := models.ObjectType{
		ID: uuid.New(), Name: "Customer", DisplayName: "Customer",
		Description: "Buyer of products.", PrimaryKeyProperty: &pk,
		Icon: &icon, Color: &color, OwnerID: uuid.New(),
		CreatedAt: time.Date(2026, 5, 6, 0, 0, 0, 0, time.UTC),
		UpdatedAt: time.Date(2026, 5, 6, 0, 0, 0, 0, time.UTC),
	}
	models.EnrichObjectTypeMetadata(&v, []models.Property{
		{ID: uuid.New(), ObjectTypeID: v.ID, Name: "label", DisplayName: "Label", PropertyType: "string"},
		{ID: uuid.New(), ObjectTypeID: v.ID, Name: "trailhead", DisplayName: "Trailhead", PropertyType: "geopoint"},
		{ID: uuid.New(), ObjectTypeID: v.ID, Name: "route", DisplayName: "Route", PropertyType: "geojson"},
	})
	out, err := json.Marshal(v)
	require.NoError(t, err)
	var view map[string]any
	require.NoError(t, json.Unmarshal(out, &view))
	for _, k := range []string{
		"id", "rid", "name", "api_name", "display_name", "plural_display_name",
		"description", "primary_key_property", "primary_key", "title_property",
		"icon", "color", "status", "visibility", "properties", "property_count",
		"searchable_property_names", "geopoint_property_names", "geoshape_property_names",
		"owner_id", "created_at", "updated_at",
	} {
		assert.Contains(t, view, k)
	}
	assert.Equal(t, "Customer", view["api_name"])
	assert.Equal(t, "active", view["status"])
	assert.Equal(t, "normal", view["visibility"])
	assert.Equal(t, "id", view["primary_key"])
	assert.Equal(t, "label", view["title_property"])
	assert.Equal(t, float64(3), view["property_count"])
	assert.Equal(t, []any{"label", "id"}, view["searchable_property_names"])
	assert.Equal(t, []any{"trailhead"}, view["geopoint_property_names"])
	assert.Equal(t, []any{"route"}, view["geoshape_property_names"])
}

func TestCreateObjectTypeRequiresAuth(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{}
	req := httptest.NewRequest("POST", "/object-types",
		strings.NewReader(`{"name":"x","display_name":"y"}`))
	rec := httptest.NewRecorder()
	h.CreateObjectType(rec, req)
	assert.Equal(t, 401, rec.Code)
}

func TestCreateObjectTypeRejectsEmptyFields(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{}
	c := &authmw.Claims{Sub: uuid.New()}
	req := httptest.NewRequest("POST", "/object-types",
		strings.NewReader(`{"name":"","display_name":""}`))
	req = req.WithContext(authmw.ContextWithClaims(context.Background(), c))
	rec := httptest.NewRecorder()
	h.CreateObjectType(rec, req)
	assert.Equal(t, 400, rec.Code)
}

func TestListObjectTypesRequiresAuth(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{}
	req := httptest.NewRequest("GET", "/object-types", nil)
	rec := httptest.NewRecorder()
	h.ListObjectTypes(rec, req)
	assert.Equal(t, 401, rec.Code)
}

func TestCreatePropertyRejectsUnknownBaseType(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{}
	c := &authmw.Claims{Sub: uuid.New()}
	r := chi.NewRouter()
	r.Post("/object-types/{id}/properties", h.CreateProperty)
	req := httptest.NewRequest("POST", "/object-types/"+uuid.New().String()+"/properties",
		strings.NewReader(`{"name":"mystery","property_type":"mystery_blob"}`))
	req = req.WithContext(authmw.ContextWithClaims(context.Background(), c))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, 400, rec.Code)
	assert.Contains(t, rec.Body.String(), "invalid property type")
}

func TestListObjectViewsRequiresAuth(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{}
	req := httptest.NewRequest("GET", "/object-views", nil)
	rec := httptest.NewRecorder()
	h.ListObjectViews(rec, req)
	assert.Equal(t, 401, rec.Code)
}

func TestCreateObjectViewRejectsEmptyName(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: &fakeStore{}}
	c := &authmw.Claims{Sub: uuid.New()}
	req := httptest.NewRequest("POST", "/object-views",
		strings.NewReader(`{"name":"","object_type_id":"`+uuid.New().String()+`"}`))
	req = req.WithContext(authmw.ContextWithClaims(context.Background(), c))
	rec := httptest.NewRecorder()
	h.CreateObjectView(rec, req)
	assert.Equal(t, 400, rec.Code)
	assert.Contains(t, rec.Body.String(), "name is required")
}

func TestCreateObjectViewRejectsInvalidFormFactor(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: &fakeStore{}}
	c := &authmw.Claims{Sub: uuid.New()}
	req := httptest.NewRequest("POST", "/object-views",
		strings.NewReader(`{"name":"summary","object_type_id":"`+uuid.New().String()+`","form_factor":"hologram"}`))
	req = req.WithContext(authmw.ContextWithClaims(context.Background(), c))
	rec := httptest.NewRecorder()
	h.CreateObjectView(rec, req)
	assert.Equal(t, 400, rec.Code)
	assert.Contains(t, rec.Body.String(), "invalid form_factor")
}

func TestCreateObjectViewRoundTrip(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: &fakeStore{}}
	c := &authmw.Claims{Sub: uuid.New()}
	otID := uuid.New()
	req := httptest.NewRequest("POST", "/object-views",
		strings.NewReader(`{"name":"summary","display_name":"Summary","object_type_id":"`+otID.String()+`","mode":"configured","form_factor":"panel","config":{"panel":{"density":"compact"}}}`))
	req = req.WithContext(authmw.ContextWithClaims(context.Background(), c))
	rec := httptest.NewRecorder()
	h.CreateObjectView(rec, req)
	require.Equal(t, 201, rec.Code)
	got := models.ObjectView{}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	assert.Equal(t, "summary", got.Name)
	assert.Equal(t, "Summary", got.DisplayName)
	assert.Equal(t, otID, got.ObjectTypeID)
	assert.Equal(t, "configured", got.Mode)
	assert.Equal(t, "panel", got.FormFactor)
	assert.JSONEq(t, `{"panel":{"density":"compact"}}`, string(got.Config))
}
