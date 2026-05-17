package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
	"github.com/openfoundry/openfoundry-go/services/ontology-query-service/internal/handlers"
)

type fakeSchemaStore struct {
	latest *repos.Schema
	err    error
}

func (f *fakeSchemaStore) GetLatest(context.Context, repos.TypeId, repos.ReadConsistency) (*repos.Schema, error) {
	return f.latest, f.err
}
func (f *fakeSchemaStore) GetVersion(context.Context, repos.TypeId, uint32, repos.ReadConsistency) (*repos.Schema, error) {
	return nil, repos.Backend("not implemented")
}
func (f *fakeSchemaStore) Put(context.Context, repos.Schema) error {
	return repos.Backend("not implemented")
}

func adminClaims() *authmw.Claims {
	return &authmw.Claims{Sub: uuid.New(), Roles: []string{"admin"}}
}

func userClaims(scope *authmw.SessionScope) *authmw.Claims {
	return &authmw.Claims{Sub: uuid.New(), Roles: []string{"user"}, SessionScope: scope}
}

func orgScopedClaims(orgID uuid.UUID) *authmw.Claims {
	id := orgID
	return &authmw.Claims{
		Sub:   uuid.New(),
		Roles: []string{"user"},
		OrgID: &id,
		// Holds PUBLIC so this helper isolates the *tenant-scope*
		// check; tests that want a marking denial use userClaims(nil).
		SessionScope: &authmw.SessionScope{AllowedMarkings: []string{"PUBLIC"}},
	}
}

// TestGetObjectTable exercises the GetObject branches not covered by
// handlers_test.go: nil store, empty/invalid params, consistency header,
// tenant scoping, marking enforcement, and the SchemaStore-wired
// property-mask path.
func TestGetObjectTable(t *testing.T) {
	t.Parallel()

	tenant := uuid.NewString()
	objectID := uuid.NewString()

	classifiedObj := &repos.Object{
		Tenant:   repos.TenantId(tenant),
		ID:       repos.ObjectId(objectID),
		TypeID:   repos.TypeId("aircraft"),
		Payload:  json.RawMessage(`{"callsign":"OF-1","secret":"X"}`),
		Markings: []repos.MarkingId{"SECRET"},
	}
	publicObj := &repos.Object{
		Tenant:   repos.TenantId(tenant),
		ID:       repos.ObjectId(objectID),
		TypeID:   repos.TypeId("aircraft"),
		Payload:  json.RawMessage(`{"callsign":"OF-1","secret":"X"}`),
		Markings: []repos.MarkingId{"PUBLIC"},
	}

	cases := []struct {
		name        string
		state       handlers.AppState
		tenantParam string
		objectParam string
		consistency string
		claims      *authmw.Claims
		wantStatus  int
		wantBody    string // substring assertion; empty = skip
		wantMissing string // payload key that must NOT appear; empty = skip
	}{
		{
			name:        "nil_object_store_500",
			state:       handlers.AppState{},
			tenantParam: tenant,
			objectParam: objectID,
			claims:      adminClaims(),
			wantStatus:  http.StatusInternalServerError,
			wantBody:    "object store not configured",
		},
		{
			name:        "empty_tenant_400",
			state:       handlers.AppState{Objects: &fakeObjectStore{}},
			tenantParam: "",
			objectParam: objectID,
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "tenant",
		},
		{
			name:        "empty_object_id_400",
			state:       handlers.AppState{Objects: &fakeObjectStore{}},
			tenantParam: tenant,
			objectParam: "",
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "object_id",
		},
		{
			name:        "invalid_consistency_header_400",
			state:       handlers.AppState{Objects: &fakeObjectStore{}},
			tenantParam: tenant,
			objectParam: objectID,
			consistency: "lukewarm",
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "X-Consistency",
		},
		{
			name:        "eventual_consistency_header_accepted",
			state:       handlers.AppState{Objects: &fakeObjectStore{getObj: publicObj}},
			tenantParam: tenant,
			objectParam: objectID,
			consistency: "eventual",
			claims:      adminClaims(),
			wantStatus:  http.StatusOK,
			wantBody:    "OF-1",
		},
		{
			name: "tenant_scope_denied_for_org_user",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getObj: publicObj},
			},
			tenantParam: tenant,
			objectParam: objectID,
			// Different org → must be rejected.
			claims:     orgScopedClaims(uuid.New()),
			wantStatus: http.StatusForbidden,
			wantBody:   "tenant access denied",
		},
		{
			name: "tenant_scope_allowed_when_org_matches",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getObj: publicObj},
			},
			tenantParam: tenant,
			objectParam: objectID,
			claims:      orgScopedClaims(uuid.MustParse(tenant)),
			wantStatus:  http.StatusOK,
			wantBody:    "OF-1",
		},
		{
			name: "marking_access_denied_for_unscoped_user",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getObj: classifiedObj},
			},
			tenantParam: tenant,
			objectParam: objectID,
			claims:      userClaims(nil),
			wantStatus:  http.StatusForbidden,
			wantBody:    "marking access denied",
		},
		{
			name: "marking_allowed_when_user_holds_all",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getObj: classifiedObj},
			},
			tenantParam: tenant,
			objectParam: objectID,
			claims: userClaims(&authmw.SessionScope{
				AllowedMarkings: []string{"SECRET"},
			}),
			wantStatus: http.StatusOK,
			wantBody:   "OF-1",
		},
		{
			name: "schema_wired_property_mask_redacts_secret",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getObj: publicObj},
				Schemas: &fakeSchemaStore{latest: &repos.Schema{
					TypeID:  repos.TypeId("aircraft"),
					Version: 1,
					JsonSchema: json.RawMessage(`{
						"properties": {
							"callsign": {},
							"secret":   {"required_markings": ["SECRET"]}
						}
					}`),
				}},
			},
			tenantParam: tenant,
			objectParam: objectID,
			claims: userClaims(&authmw.SessionScope{
				AllowedMarkings: []string{"PUBLIC"},
			}),
			wantStatus:  http.StatusOK,
			wantBody:    "_masked_properties",
			wantMissing: "secret",
		},
		{
			name: "schema_lookup_error_does_not_break_get",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getObj: publicObj},
				Schemas: &fakeSchemaStore{err: repos.Backend("schema down")},
			},
			tenantParam: tenant,
			objectParam: objectID,
			claims:      adminClaims(),
			wantStatus:  http.StatusOK,
			wantBody:    "OF-1",
		},
		{
			name: "repo_invalid_argument_maps_to_400",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getErr: repos.Invalid("bad tenant uuid")},
			},
			tenantParam: tenant,
			objectParam: objectID,
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "bad tenant uuid",
		},
		{
			name: "repo_not_found_maps_to_404",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getErr: repos.NotFound("absent")},
			},
			tenantParam: tenant,
			objectParam: objectID,
			claims:      adminClaims(),
			wantStatus:  http.StatusNotFound,
			wantBody:    "absent",
		},
		{
			name: "repo_tenant_scope_maps_to_400",
			state: handlers.AppState{
				Objects: &fakeObjectStore{getErr: repos.TenantScope("cross-tenant")},
			},
			tenantParam: tenant,
			objectParam: objectID,
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "cross-tenant",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h := handlers.New(tc.state)
			params := map[string]string{}
			if tc.tenantParam != "" {
				params["tenant"] = tc.tenantParam
			}
			if tc.objectParam != "" {
				params["object_id"] = tc.objectParam
			}
			req := authedReq("GET", "/objects/x/y", params, tc.claims)
			if tc.consistency != "" {
				req.Header.Set("X-Consistency", tc.consistency)
			}
			rec := httptest.NewRecorder()
			h.GetObject(rec, req)

			assert.Equal(t, tc.wantStatus, rec.Code, "status")
			if tc.wantBody != "" {
				assert.Contains(t, rec.Body.String(), tc.wantBody)
			}
			if tc.wantMissing != "" {
				var body map[string]any
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
				payload, ok := body["payload"].(map[string]any)
				require.True(t, ok, "payload should be an object")
				_, present := payload[tc.wantMissing]
				assert.False(t, present, "payload[%q] should be masked", tc.wantMissing)
			}
		})
	}
}

// TestListObjectsByTypeTable exercises ListObjectsByType branches missed
// by handlers_test.go: nil store, missing type_id, bad consistency, bad
// page size, tenant scope, repo error mapping, and marking-aware filtering.
func TestListObjectsByTypeTable(t *testing.T) {
	t.Parallel()

	tenant := uuid.NewString()

	makeObj := func(markings []repos.MarkingId) repos.Object {
		return repos.Object{
			Tenant:   repos.TenantId(tenant),
			ID:       repos.ObjectId(uuid.NewString()),
			TypeID:   repos.TypeId("aircraft"),
			Payload:  json.RawMessage(`{"k":"v"}`),
			Markings: markings,
		}
	}

	cases := []struct {
		name        string
		state       handlers.AppState
		tenantParam string
		typeParam   string
		consistency string
		query       string // e.g. "?size=10&token=abc"
		claims      *authmw.Claims
		wantStatus  int
		wantBody    string
		wantItems   int // expected len(items); -1 = skip
	}{
		{
			name:        "nil_object_store_500",
			state:       handlers.AppState{},
			tenantParam: tenant,
			typeParam:   "aircraft",
			claims:      adminClaims(),
			wantStatus:  http.StatusInternalServerError,
			wantBody:    "object store not configured",
			wantItems:   -1,
		},
		{
			name:        "empty_type_id_400",
			state:       handlers.AppState{Objects: &fakeObjectStore{}},
			tenantParam: tenant,
			typeParam:   "",
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "type_id",
			wantItems:   -1,
		},
		{
			name:        "invalid_consistency_400",
			state:       handlers.AppState{Objects: &fakeObjectStore{}},
			tenantParam: tenant,
			typeParam:   "aircraft",
			consistency: "yolo",
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "X-Consistency",
			wantItems:   -1,
		},
		{
			name:        "bad_page_size_400",
			state:       handlers.AppState{Objects: &fakeObjectStore{}},
			tenantParam: tenant,
			typeParam:   "aircraft",
			query:       "?size=NaN",
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "size must be an unsigned integer",
			wantItems:   -1,
		},
		{
			name: "tenant_scope_denied",
			state: handlers.AppState{
				Objects: &fakeObjectStore{},
			},
			tenantParam: tenant,
			typeParam:   "aircraft",
			claims:      orgScopedClaims(uuid.New()),
			wantStatus:  http.StatusForbidden,
			wantBody:    "tenant access denied",
			wantItems:   -1,
		},
		{
			name: "repo_not_found_maps_to_404",
			state: handlers.AppState{
				Objects: &fakeObjectStore{listErr: repos.NotFound("type unknown")},
			},
			tenantParam: tenant,
			typeParam:   "aircraft",
			claims:      adminClaims(),
			wantStatus:  http.StatusNotFound,
			wantBody:    "type unknown",
			wantItems:   -1,
		},
		{
			name: "repo_invalid_argument_maps_to_400",
			state: handlers.AppState{
				Objects: &fakeObjectStore{listErr: repos.Invalid("bad page token")},
			},
			tenantParam: tenant,
			typeParam:   "aircraft",
			query:       "?token=corrupt",
			claims:      adminClaims(),
			wantStatus:  http.StatusBadRequest,
			wantBody:    "bad page token",
			wantItems:   -1,
		},
		{
			name: "marking_filter_drops_classified_items",
			state: handlers.AppState{
				Objects: &fakeObjectStore{listRes: repos.PagedResult[repos.Object]{
					Items: []repos.Object{
						makeObj([]repos.MarkingId{"PUBLIC"}),
						makeObj([]repos.MarkingId{"SECRET"}),
						makeObj(nil), // unmarked → always allowed
					},
				}},
			},
			tenantParam: tenant,
			typeParam:   "aircraft",
			claims: userClaims(&authmw.SessionScope{
				AllowedMarkings: []string{"PUBLIC"},
			}),
			wantStatus: http.StatusOK,
			wantItems:  2,
		},
		{
			name: "page_size_and_token_pass_through",
			state: handlers.AppState{
				Objects: &fakeObjectStore{listRes: repos.PagedResult[repos.Object]{
					Items:     []repos.Object{makeObj(nil)},
					NextToken: ptr("next"),
				}},
			},
			tenantParam: tenant,
			typeParam:   "aircraft",
			query:       "?size=5&token=abc",
			claims:      adminClaims(),
			wantStatus:  http.StatusOK,
			wantBody:    `"next_token":"next"`,
			wantItems:   1,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			h := handlers.New(tc.state)
			params := map[string]string{"tenant": tc.tenantParam}
			if tc.typeParam != "" {
				params["type_id"] = tc.typeParam
			}
			req := authedReq("GET", "/objects/"+tc.tenantParam+"/by-type/"+tc.typeParam+tc.query, params, tc.claims)
			if tc.consistency != "" {
				req.Header.Set("X-Consistency", tc.consistency)
			}
			rec := httptest.NewRecorder()
			h.ListObjectsByType(rec, req)

			assert.Equal(t, tc.wantStatus, rec.Code, "status")
			if tc.wantBody != "" {
				assert.Contains(t, rec.Body.String(), tc.wantBody)
			}
			if tc.wantItems >= 0 {
				var body map[string]any
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
				assert.Len(t, body["items"], tc.wantItems)
			}
		})
	}
}

// TestListObjectsByTypeRejectsInvalidTenant covers the bad-UUID branch
// of ListObjectsByType which the table cases above leave to a separate
// case (so we can use a literal non-UUID without breaking URL parsing).
func TestListObjectsByTypeRejectsInvalidTenant(t *testing.T) {
	t.Parallel()
	h := handlers.New(handlers.AppState{Objects: &fakeObjectStore{}})
	req := authedReq("GET", "/objects/not-a-uuid/by-type/aircraft", map[string]string{
		"tenant":  "not-a-uuid",
		"type_id": "aircraft",
	}, adminClaims())
	rec := httptest.NewRecorder()
	h.ListObjectsByType(rec, req)
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "tenant is not a valid UUID")
}

func ptr[T any](v T) *T { return &v }
