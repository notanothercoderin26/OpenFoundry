// Bridge handlers that adapt the gateway-fronted ontology paths
// (`/api/v1/ontology/types/{type_id}/objects[/...]`) onto the canonical
// ObjectStore shapes the service already implements. The gateway routes
// these prefixes here without rewriting the URL, so they need a dedicated
// adapter — apps/web's lib/api/ontology.ts is the canonical wire shape.
//
// Wire mapping
//   - frontend tenant ← `default` (single-tenant PoC; org_id from header
//     `x-of-tenant` overrides when present, so the gateway can inject it).
//   - object_type_id  ← storage.TypeId
//   - properties      ← payload (json-opaque)
//   - created_at      ← created_at_ms (RFC3339)
//   - updated_at      ← updated_at_ms
//   - created_by      ← `system` (PoC; real impl pulls from owner)
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/object-database-service/internal/storage"
)

const defaultTenant = "default"

// ontologyObject is the wire shape the SPA's ObjectInstance type expects.
type ontologyObject struct {
	ID             string         `json:"id"`
	ObjectTypeID   string         `json:"object_type_id"`
	Properties     map[string]any `json:"properties"`
	CreatedBy      string         `json:"created_by"`
	OrganizationID *string        `json:"organization_id,omitempty"`
	Marking        *string        `json:"marking,omitempty"`
	CreatedAt      string         `json:"created_at"`
	UpdatedAt      string         `json:"updated_at"`
}

func tenantFromRequest(r *http.Request) storage.TenantId {
	if t := strings.TrimSpace(r.Header.Get("x-of-tenant")); t != "" {
		return storage.TenantId(t)
	}
	return storage.TenantId(defaultTenant)
}

func toOntologyObject(obj *storage.Object) ontologyObject {
	props := map[string]any{}
	if len(obj.Payload) > 0 {
		_ = json.Unmarshal(obj.Payload, &props)
	}
	createdAt := time.UnixMilli(obj.UpdatedAtMs).UTC().Format(time.RFC3339Nano)
	if obj.CreatedAtMs != nil {
		createdAt = time.UnixMilli(*obj.CreatedAtMs).UTC().Format(time.RFC3339Nano)
	}
	out := ontologyObject{
		ID:             string(obj.ID),
		ObjectTypeID:   string(obj.TypeID),
		Properties:     props,
		CreatedBy:      "system",
		OrganizationID: obj.OrganizationID,
		CreatedAt:      createdAt,
		UpdatedAt:      time.UnixMilli(obj.UpdatedAtMs).UTC().Format(time.RFC3339Nano),
	}
	if len(obj.Markings) > 0 {
		m := string(obj.Markings[0])
		out.Marking = &m
	}
	return out
}

// ListObjectsByOntologyType serves GET /api/v1/ontology/types/{type_id}/objects.
// Pagination on the SPA side is page+per_page; we map per_page → storage.Page.Size
// and re-emit total. Strict pagination via opaque tokens isn't exposed here
// (the Workshop dashboard widgets ask for the first page).
func (h *Handlers) ListObjectsByOntologyType(w http.ResponseWriter, r *http.Request) {
	tenant := tenantFromRequest(r)
	typeID := storage.TypeId(chi.URLParam(r, "type_id"))

	q := r.URL.Query()
	perPage := uint32(25)
	if v := q.Get("per_page"); v != "" {
		if n, err := strconv.ParseUint(v, 10, 32); err == nil && n > 0 {
			if n > 5000 {
				n = 5000
			}
			perPage = uint32(n)
		}
	}
	page := 1
	if v := q.Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}

	res, err := h.Objects.ListByType(r.Context(), tenant, typeID, storage.Page{Size: perPage}, parseConsistency(q.Get("consistency")))
	if err != nil {
		writeError(w, err)
		return
	}
	items := make([]ontologyObject, 0, len(res.Items))
	for i := range res.Items {
		items = append(items, toOntologyObject(&res.Items[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data":     items,
		"total":    len(items),
		"page":     page,
		"per_page": perPage,
	})
}

// GetObjectByOntologyType serves GET /api/v1/ontology/types/{type_id}/objects/{object_id}.
func (h *Handlers) GetObjectByOntologyType(w http.ResponseWriter, r *http.Request) {
	tenant := tenantFromRequest(r)
	objID := storage.ObjectId(chi.URLParam(r, "object_id"))
	obj, err := h.Objects.Get(r.Context(), tenant, objID, parseConsistency(r.URL.Query().Get("consistency")))
	if err != nil {
		writeError(w, err)
		return
	}
	if obj == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toOntologyObject(obj))
}

// CreateObjectByOntologyType serves POST /api/v1/ontology/types/{type_id}/objects.
// Body shape: `{ properties: {...} }`. Used by the SPA to seed manual rows; the
// real bulk path is the indexer (see docs/poc-online-retail/RUNTIME-INDEXER.md).
func (h *Handlers) CreateObjectByOntologyType(w http.ResponseWriter, r *http.Request) {
	tenant := tenantFromRequest(r)
	typeID := storage.TypeId(chi.URLParam(r, "type_id"))

	var body struct {
		Properties map[string]any `json:"properties"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	payload, err := json.Marshal(body.Properties)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	now := time.Now().UnixMilli()
	id := storage.ObjectId(uuid.NewString())
	obj := storage.Object{
		Tenant:      tenant,
		ID:          id,
		TypeID:      typeID,
		Version:     1,
		Payload:     payload,
		CreatedAtMs: &now,
		UpdatedAtMs: now,
	}
	if _, err := h.Objects.Put(r.Context(), obj, nil); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, toOntologyObject(&obj))
}
