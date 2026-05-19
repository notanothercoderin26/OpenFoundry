package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/handlers"
	"github.com/openfoundry/openfoundry-go/services/vertex-service/internal/models"
)

func TestGraphTemplateCRUDRoundTrip(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	owner := uuid.New()

	// ---- Create ----
	createBody := models.CreateGraphTemplateRequest{
		Title:       "Late shipments by customer",
		Description: "Walks from a shipment object to its customer, ranks by LTV.",
		ObjectParameters: []models.GraphTemplateObjectParameter{
			{
				ID:           "shipment",
				Name:         "Starting shipment",
				Description:  "The shipment whose customer impact we want to investigate",
				ObjectTypeID: "ri.ontology.main.object-type.shipment",
				Required:     true,
				SingleObject: false,
			},
		},
		NonObjectParameters: []models.GraphTemplateNonObjectParameter{
			{
				ID:        "ltv_threshold",
				Name:      "LTV threshold",
				ValueType: "integer",
				Required:  false,
			},
		},
		SearchArounds: []models.GraphTemplateSearchAround{
			{
				ID:                "sa1",
				ObjectParameterID: "shipment",
				Kind:              "relation",
				Config:            json.RawMessage(`{"link":"shipment.customer_id"}`),
			},
		},
		LayerConfig: []models.GraphTemplateLayerConfig{
			{LayerID: "shipment-layer", Include: true, KeepStyling: true},
		},
		GraphConfig: models.GraphTemplateGraphConfig{
			DisplayName: "Late shipments",
			Layout:      "hierarchical",
		},
		Defaults: models.GraphTemplateDefaults{
			PinnedItems: []string{"shipment"},
		},
	}
	req := withClaims(httptest.NewRequest(http.MethodPost, "/graph-templates", mustEncode(t, createBody)), owner)
	rec := httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var created models.GraphTemplate
	decodeJSON(t, rec.Body.Bytes(), &created)
	require.NotEqual(t, uuid.Nil, created.ID)
	require.True(t, strings.HasPrefix(created.RID, "ri.vertex.main.graph-template."))
	require.Equal(t, owner, created.OwnerID)
	require.Len(t, created.ObjectParameters, 1)

	// ---- List ----
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graph-templates", nil), owner)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var listResp models.ListGraphTemplatesResult
	decodeJSON(t, rec.Body.Bytes(), &listResp)
	require.Equal(t, 1, listResp.Total)
	require.Len(t, listResp.Items, 1)

	// ---- List for a different owner is empty ----
	other := uuid.New()
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graph-templates", nil), other)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	decodeJSON(t, rec.Body.Bytes(), &listResp)
	require.Equal(t, 0, listResp.Total)

	// ---- Get ----
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graph-templates/"+created.ID.String(), nil), owner)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// ---- Patch (title only) ----
	newTitle := "Late shipments — top customers"
	patchBody := models.UpdateGraphTemplateRequest{Title: &newTitle}
	req = withClaims(httptest.NewRequest(http.MethodPatch, "/graph-templates/"+created.ID.String(), mustEncode(t, patchBody)), owner)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var patched models.GraphTemplate
	decodeJSON(t, rec.Body.Bytes(), &patched)
	require.Equal(t, newTitle, patched.Title)

	// ---- Patch from non-owner is rejected ----
	req = withClaims(httptest.NewRequest(http.MethodPatch, "/graph-templates/"+created.ID.String(), mustEncode(t, patchBody)), other)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)

	// ---- Instantiate ----
	instBody := models.InstantiateGraphTemplateRequest{
		ObjectParameterValues: map[string][]string{
			"shipment": {"ri.ontology.main.shipment.123"},
		},
		NonObjectParameterValues: map[string]json.RawMessage{
			"ltv_threshold": json.RawMessage(`100000`),
		},
	}
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graph-templates/"+created.ID.String()+"/instantiate", mustEncode(t, instBody)), other)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusCreated, rec.Code)
	var instResp models.InstantiateGraphTemplateResponse
	decodeJSON(t, rec.Body.Bytes(), &instResp)
	require.NotNil(t, instResp.Graph)
	require.Contains(t, instResp.Graph.Title, "From template")
	require.Equal(t, []string{"ri.ontology.main.shipment.123"}, instResp.Graph.SeedObjectRefs)

	// ---- Instantiate without required parameter fails ----
	req = withClaims(httptest.NewRequest(http.MethodPost, "/graph-templates/"+created.ID.String()+"/instantiate", mustEncode(t, models.InstantiateGraphTemplateRequest{})), other)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "missing required object parameter")

	// ---- Delete ----
	req = withClaims(httptest.NewRequest(http.MethodDelete, "/graph-templates/"+created.ID.String(), nil), owner)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusNoContent, rec.Code)

	// ---- Get after delete -> 404 ----
	req = withClaims(httptest.NewRequest(http.MethodGet, "/graph-templates/"+created.ID.String(), nil), owner)
	rec = httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestGraphTemplateValidationRejectsDuplicateParameter(t *testing.T) {
	t.Parallel()
	h := &handlers.Handlers{Repo: newFakeStore()}
	owner := uuid.New()
	body := models.CreateGraphTemplateRequest{
		Title: "Bad template",
		ObjectParameters: []models.GraphTemplateObjectParameter{
			{ID: "p1", Name: "Shipment", ObjectTypeID: "t1"},
			{ID: "p1", Name: "Duplicate"},
		},
	}
	req := withClaims(httptest.NewRequest(http.MethodPost, "/graph-templates", mustEncode(t, body)), owner)
	rec := httptest.NewRecorder()
	newRouter(h).ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "duplicate object parameter id")
}
