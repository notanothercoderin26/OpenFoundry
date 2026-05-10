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
// Pagination on the SPA side is page+per_page; we map per_page → storage.Page.Size.
//
// `total` is the underlying cardinality, computed via a separate unbounded list
// against the same tenant+type. This is O(N) — fine for PoC scale (10⁴) and
// the in-memory store. For Cassandra at 10⁶+ rows, swap to a denormalised
// counter (see NEXT-STEPS.md §4.1).
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
	consistency := parseConsistency(q.Get("consistency"))

	res, err := h.Objects.ListByType(r.Context(), tenant, typeID, storage.Page{Size: perPage}, consistency)
	if err != nil {
		writeError(w, err)
		return
	}
	items := make([]ontologyObject, 0, len(res.Items))
	for i := range res.Items {
		items = append(items, toOntologyObject(&res.Items[i]))
	}

	total := len(items)
	if perPage < 5000 || res.NextToken != nil {
		// Page is potentially a slice of a larger set; ask for the full list
		// to materialise the real total. Skip when caller already pulled the
		// whole set in one shot (per_page>=5000 and no continuation).
		full, err := h.Objects.ListByType(r.Context(), tenant, typeID, storage.Page{Size: 1_000_000}, consistency)
		if err == nil {
			total = len(full.Items)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":     items,
		"total":    total,
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

// UpdateObjectByOntologyType serves PATCH /api/v1/ontology/types/{type_id}/objects/{object_id}.
// Body shape: `{ properties: {...}, replace?: bool }`. The default behavior
// merges the provided properties into the existing payload, matching the SPA's
// inline-action update flow.
func (h *Handlers) UpdateObjectByOntologyType(w http.ResponseWriter, r *http.Request) {
	tenant := tenantFromRequest(r)
	typeID := storage.TypeId(chi.URLParam(r, "type_id"))
	objID := storage.ObjectId(chi.URLParam(r, "object_id"))

	var body struct {
		Properties map[string]any `json:"properties"`
		Replace    bool           `json:"replace"`
		Marking    *string        `json:"marking,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	existing, err := h.Objects.Get(r.Context(), tenant, objID, parseConsistency(r.URL.Query().Get("consistency")))
	if err != nil {
		writeError(w, err)
		return
	}
	if existing == nil || existing.TypeID != typeID {
		http.NotFound(w, r)
		return
	}

	props := map[string]any{}
	if !body.Replace && len(existing.Payload) > 0 {
		_ = json.Unmarshal(existing.Payload, &props)
	}
	for k, v := range body.Properties {
		props[k] = v
	}
	payload, err := json.Marshal(props)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	next := *existing
	next.Payload = payload
	next.UpdatedAtMs = time.Now().UnixMilli()
	if body.Marking != nil && strings.TrimSpace(*body.Marking) != "" {
		next.Markings = []storage.MarkingId{storage.MarkingId(strings.TrimSpace(*body.Marking))}
	}
	expected := existing.Version
	outcome, err := h.Objects.Put(r.Context(), next, &expected)
	if err != nil {
		writeError(w, err)
		return
	}
	if outcome.Kind == storage.PutVersionConflict {
		writeOutcomeResponse(w, outcome)
		return
	}
	if outcome.NewVersion > 0 {
		next.Version = outcome.NewVersion
	}
	writeJSON(w, http.StatusOK, toOntologyObject(&next))
}

// DeleteObjectByOntologyType serves DELETE /api/v1/ontology/types/{type_id}/objects/{object_id}.
// Matches the SPA's `deleteObject(typeId, objectId)` contract.
func (h *Handlers) DeleteObjectByOntologyType(w http.ResponseWriter, r *http.Request) {
	tenant := tenantFromRequest(r)
	objID := storage.ObjectId(chi.URLParam(r, "object_id"))
	deleted, err := h.Objects.Delete(r.Context(), tenant, objID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !deleted {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// queryFilter mirrors the WorkshopVariable.static_filter shape from
// apps/web/src/routes/apps/WorkshopEditorPage.tsx — same operators, same
// JSON keys, so the SPA can forward filters verbatim.
type queryFilter struct {
	PropertyName string `json:"property_name"`
	Operator     string `json:"operator,omitempty"` // equals | contains  (default: equals)
	Value        any    `json:"value"`
}

type queryRequest struct {
	// Filters is the WorkshopVariable.static_filter[s] shape — the richer
	// form with `operator` per filter (equals|contains).
	Filters []queryFilter `json:"filters"`
	// Equals is the existing SPA shape used by lib/api/ontology.ts:queryObjects
	// — a flat map { property: expected }. Treated as "equals" filters.
	Equals  map[string]any `json:"equals"`
	Page    int            `json:"page"`
	PerPage uint32         `json:"per_page"`
	// Limit mirrors the SPA's `queryObjects` body: cap on items when no
	// per_page is set. We unify with per_page below.
	Limit int `json:"limit"`
}

func matchesFilter(props map[string]any, f queryFilter) bool {
	actual, ok := props[f.PropertyName]
	if !ok {
		// "not present" matches "" target so the SPA's `equals ""` checks work.
		actualStr := ""
		expectedStr := strings.ToLower(strings.TrimSpace(toStringValue(f.Value)))
		return strings.EqualFold(actualStr, expectedStr)
	}
	actualStr := strings.ToLower(strings.TrimSpace(toStringValue(actual)))
	expectedStr := strings.ToLower(strings.TrimSpace(toStringValue(f.Value)))
	switch strings.ToLower(strings.TrimSpace(f.Operator)) {
	case "contains":
		return strings.Contains(actualStr, expectedStr)
	default: // "equals" + unknown
		return actualStr == expectedStr
	}
}

func toStringValue(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case json.Number:
		return t.String()
	case float64:
		// avoid scientific notation for integral floats
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	default:
		// fall back to JSON encoding — covers nested objects and arrays
		b, _ := json.Marshal(v)
		return string(b)
	}
}

// QueryObjectsByOntologyType serves POST /api/v1/ontology/types/{type_id}/objects/query.
// Server-side filter pushdown for the SPA's WorkshopVariable.static_filter / static_filters.
// Today the InMemory store can't filter natively (no native CQL); we materialise
// the full per-tenant+type list and filter in Go. For Cassandra this should be
// replaced with a secondary-index lookup (`SELECT … WHERE type_id=? AND property_name=value`)
// once the schema supports it.
func (h *Handlers) QueryObjectsByOntologyType(w http.ResponseWriter, r *http.Request) {
	tenant := tenantFromRequest(r)
	typeID := storage.TypeId(chi.URLParam(r, "type_id"))

	var body queryRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// Merge the two filter shapes: `equals` map gets normalised into the
	// richer Filters list as plain equals.
	for k, v := range body.Equals {
		body.Filters = append(body.Filters, queryFilter{PropertyName: k, Operator: "equals", Value: v})
	}
	perPage := body.PerPage
	if perPage == 0 && body.Limit > 0 {
		perPage = uint32(body.Limit)
	}
	if perPage == 0 {
		perPage = 25
	}
	if perPage > 5000 {
		perPage = 5000
	}
	page := body.Page
	if page < 1 {
		page = 1
	}

	full, err := h.Objects.ListByType(r.Context(), tenant, typeID, storage.Page{Size: 1_000_000}, parseConsistency(r.URL.Query().Get("consistency")))
	if err != nil {
		writeError(w, err)
		return
	}

	matched := make([]ontologyObject, 0)
	for i := range full.Items {
		obj := &full.Items[i]
		props := map[string]any{}
		if len(obj.Payload) > 0 {
			_ = json.Unmarshal(obj.Payload, &props)
		}
		ok := true
		for _, f := range body.Filters {
			if !matchesFilter(props, f) {
				ok = false
				break
			}
		}
		if ok {
			matched = append(matched, toOntologyObject(obj))
		}
	}

	total := len(matched)
	start := (page - 1) * int(perPage)
	end := start + int(perPage)
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pageItems := matched[start:end]

	writeJSON(w, http.StatusOK, map[string]any{
		"data":     pageItems,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
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
