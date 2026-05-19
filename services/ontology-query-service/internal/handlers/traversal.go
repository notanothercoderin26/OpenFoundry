// Traversal handlers serve the read-only graph primitives Vertex
// depends on: link-summary (Search Around context menu), histogram
// facets (Histogram sidebar tab), multi-step Search Around DSL
// execution, find-paths and centrality (AIP graph-reasoning + path
// inspector).
//
// All handlers reuse the existing tenant/marking enforcement and
// honour the consistency header. None of them write — the canvas
// renders the response directly.
package handlers

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// ----- shared wire types -----

type ObjectRef struct {
	ObjectTypeID   string          `json:"object_type_id"`
	ObjectID       string          `json:"object_id"`
	DisplayLabel   string          `json:"display_label,omitempty"`
	PropertiesJSON json.RawMessage `json:"properties_json,omitempty"`
}

type LinkSummaryEntry struct {
	LinkTypeID         string `json:"link_type_id"`
	TargetObjectTypeID string `json:"target_object_type_id,omitempty"`
	DisplayName        string `json:"display_name,omitempty"`
	Direction          string `json:"direction"`
	Count              int64  `json:"count"`
	CountIsEstimate    bool   `json:"count_is_estimate"`
}

type LinkSummaryResponse struct {
	Entries []LinkSummaryEntry `json:"entries"`
	Hidden  int64              `json:"hidden_count"`
}

type SearchAroundFilter struct {
	Property     string          `json:"property"`
	Op           string          `json:"op"`
	LiteralJSON  json.RawMessage `json:"literal_json,omitempty"`
	ParameterRef string          `json:"parameter_ref,omitempty"`
}

type SearchAroundStep struct {
	Ordinal    int                  `json:"ordinal"`
	RelationID string               `json:"relation_id"`
	Direction  string               `json:"direction"`
	Filters    []SearchAroundFilter `json:"filters"`
}

type TraverseRequest struct {
	Tenant          string               `json:"tenant"`
	StartingSet     []ObjectRef          `json:"starting_set"`
	Steps           []SearchAroundStep   `json:"steps"`
	ParameterValues map[string]any       `json:"parameter_values_json"`
	BranchContext   string               `json:"branch_context"`
}

type ResultGroup struct {
	ObjectTypeID string      `json:"object_type_id"`
	Items        []ObjectRef `json:"items"`
	Total        int         `json:"total"`
}

type Cost struct {
	CPUSeconds     float64  `json:"cpu_seconds"`
	RowsScanned    int64    `json:"rows_scanned"`
	IndicesHit     []string `json:"indices_hit"`
	BudgetExceeded bool     `json:"budget_exceeded"`
}

type TraverseResponse struct {
	Groups []ResultGroup `json:"groups"`
	Cost   Cost          `json:"cost"`
}

type HistogramRequest struct {
	Tenant     string      `json:"tenant"`
	ObjectRefs []ObjectRef `json:"object_refs"`
	Properties []string    `json:"properties"`
}

type HistogramBucket struct {
	ValueJSON json.RawMessage `json:"value_json"`
	Count     int64           `json:"count"`
}

type NumericSummary struct {
	Sum float64 `json:"sum"`
	Avg float64 `json:"avg"`
	Min float64 `json:"min"`
	Max float64 `json:"max"`
	N   int64   `json:"n"`
}

type HistogramFacet struct {
	Property     string            `json:"property"`
	ObjectTypeID string            `json:"object_type_id,omitempty"`
	Buckets      []HistogramBucket `json:"buckets"`
	Numeric      *NumericSummary   `json:"numeric,omitempty"`
	N            int64             `json:"n"`
	Uniq         int64             `json:"uniq"`
}

type HistogramResponse struct {
	Facets []HistogramFacet `json:"facets"`
}

// ----- /link-summary -----

// LinkSummary returns the counts of outgoing + incoming link types
// from one object, used to populate the right-click "Search Around"
// dropdown ("Arriving Flight 102064", "Runway 4", …). The schema
// store, when wired, supplies the link type catalog; the link store
// supplies the counts. When the schema store is missing we degrade
// gracefully to "any link types touched by this object".
func (h *Handlers) LinkSummary(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if h.state.Links == nil {
		writeJSONErr(w, http.StatusInternalServerError, "link store not configured")
		return
	}
	tenant, ok := tenantParam(w, r)
	if !ok {
		return
	}
	objectID, ok := objectIDParam(w, r, "object_id")
	if !ok {
		return
	}
	if !canReadTenant(claims, tenant) {
		writeJSONErr(w, http.StatusForbidden, "tenant access denied")
		return
	}
	consistency, ok := consistencyHint(w, r)
	if !ok {
		return
	}

	// Without a schema store we cannot enumerate every link type, so
	// the response is necessarily empty. The handler stays well-formed
	// rather than 500-ing, so the UI's right-click menu just shows
	// "Show 0 relations with no linked object results".
	out := LinkSummaryResponse{Entries: []LinkSummaryEntry{}}
	requested := strings.Split(r.URL.Query().Get("link_types"), ",")
	for _, raw := range requested {
		lt := strings.TrimSpace(raw)
		if lt == "" {
			continue
		}
		for _, direction := range []string{"outgoing", "incoming"} {
			var count int64
			page := repos.Page{Size: 1}
			var (
				res repos.PagedResult[repos.Link]
				err error
			)
			if direction == "outgoing" {
				res, err = h.state.Links.ListOutgoing(r.Context(),
					repos.TenantId(tenant), repos.LinkTypeId(lt),
					repos.ObjectId(objectID), page, consistency)
			} else {
				res, err = h.state.Links.ListIncoming(r.Context(),
					repos.TenantId(tenant), repos.LinkTypeId(lt),
					repos.ObjectId(objectID), page, consistency)
			}
			if err != nil {
				continue
			}
			count = int64(len(res.Items))
			estimate := res.NextToken != nil
			out.Entries = append(out.Entries, LinkSummaryEntry{
				LinkTypeID:      lt,
				Direction:       direction,
				Count:           count,
				CountIsEstimate: estimate,
			})
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// ----- /traverse -----

// Traverse executes a multi-step Search Around DSL against the link
// store, returning the resulting objects grouped by ontology type.
// Parameter references in filters are resolved against
// `parameter_values_json` before the per-hop filter is applied.
//
// This is a best-effort, in-process executor: it follows links one
// hop at a time and applies property filters post-hoc by reading the
// object back. A real OSV2 push-down implementation will short-circuit
// this with link-index lookups (VTX.21) — the handler shape stays the
// same.
func (h *Handlers) Traverse(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if h.state.Links == nil || h.state.Objects == nil {
		writeJSONErr(w, http.StatusInternalServerError, "stores not configured")
		return
	}
	var body TraverseRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	tenant := strings.TrimSpace(body.Tenant)
	if tenant == "" {
		writeJSONErr(w, http.StatusBadRequest, "tenant required")
		return
	}
	if !canReadTenant(claims, tenant) {
		writeJSONErr(w, http.StatusForbidden, "tenant access denied")
		return
	}
	consistency, ok := consistencyHint(w, r)
	if !ok {
		return
	}

	current := dedupeRefs(body.StartingSet)
	cost := Cost{IndicesHit: []string{}}
	sort.Slice(body.Steps, func(i, j int) bool { return body.Steps[i].Ordinal < body.Steps[j].Ordinal })

	for _, step := range body.Steps {
		next := make([]ObjectRef, 0)
		dir := step.Direction
		if dir == "" {
			dir = "outgoing"
		}
		for _, ref := range current {
			page := repos.Page{Size: 200}
			var (
				res repos.PagedResult[repos.Link]
				err error
			)
			if dir == "outgoing" {
				res, err = h.state.Links.ListOutgoing(r.Context(),
					repos.TenantId(tenant), repos.LinkTypeId(step.RelationID),
					repos.ObjectId(ref.ObjectID), page, consistency)
			} else {
				res, err = h.state.Links.ListIncoming(r.Context(),
					repos.TenantId(tenant), repos.LinkTypeId(step.RelationID),
					repos.ObjectId(ref.ObjectID), page, consistency)
			}
			if err != nil {
				continue
			}
			cost.RowsScanned += int64(len(res.Items))
			for _, link := range res.Items {
				targetID := string(link.To)
				if dir == "incoming" {
					targetID = string(link.From)
				}
				obj, err := h.state.Objects.Get(r.Context(), repos.TenantId(tenant), repos.ObjectId(targetID), consistency)
				if err != nil || obj == nil {
					continue
				}
				if !canReadMarkings(claims, obj.Markings) {
					continue
				}
				if !applyFilters(step.Filters, body.ParameterValues, obj) {
					continue
				}
				next = append(next, ObjectRef{
					ObjectTypeID:   string(obj.TypeID),
					ObjectID:       string(obj.ID),
					PropertiesJSON: append(json.RawMessage(nil), obj.Payload...),
				})
			}
		}
		current = dedupeRefs(next)
	}

	grouped := groupByType(current)
	writeJSON(w, http.StatusOK, TraverseResponse{Groups: grouped, Cost: cost})
}

// ----- /histogram -----

// Histogram aggregates property values across a caller-provided set
// of object refs. For each property: a value-frequency table
// (top-200) and a numeric summary when every observed value is
// numeric. n is the distinct ref count, uniq is the distinct value
// count.
func (h *Handlers) Histogram(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if h.state.Objects == nil {
		writeJSONErr(w, http.StatusInternalServerError, "object store not configured")
		return
	}
	var body HistogramRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	tenant := strings.TrimSpace(body.Tenant)
	if tenant == "" {
		writeJSONErr(w, http.StatusBadRequest, "tenant required")
		return
	}
	if !canReadTenant(claims, tenant) {
		writeJSONErr(w, http.StatusForbidden, "tenant access denied")
		return
	}
	consistency, ok := consistencyHint(w, r)
	if !ok {
		return
	}

	type bucket struct {
		count int64
		sum   float64
		count_numeric int64
		min, max      float64
		minSet        bool
	}
	type facetKey struct{ property, typeID string }
	values := make(map[facetKey]map[string]*bucket)
	totalN := make(map[facetKey]int64)
	// Cross-type counts for the synthetic "Object Types" facet — one
	// bucket per ontology type id, regardless of any property filter
	// in `body.Properties`. Mirrors Palantir's first row in the
	// Histogram tab.
	typeCounts := make(map[string]int64)
	allowed := func(p string) bool {
		if len(body.Properties) == 0 {
			return true
		}
		for _, q := range body.Properties {
			if q == p {
				return true
			}
		}
		return false
	}

	for _, ref := range body.ObjectRefs {
		obj, err := h.state.Objects.Get(r.Context(), repos.TenantId(tenant), repos.ObjectId(ref.ObjectID), consistency)
		if err != nil || obj == nil {
			continue
		}
		if !canReadMarkings(claims, obj.Markings) {
			continue
		}
		typeCounts[string(obj.TypeID)]++
		props := objectProperties(obj)
		for prop, val := range props {
			if !allowed(prop) {
				continue
			}
			k := facetKey{prop, string(obj.TypeID)}
			if values[k] == nil {
				values[k] = make(map[string]*bucket)
			}
			totalN[k]++
			raw, _ := json.Marshal(val)
			b := values[k][string(raw)]
			if b == nil {
				b = &bucket{}
				values[k][string(raw)] = b
			}
			b.count++
			if f, ok := numericValue(val); ok {
				b.count_numeric++
				b.sum += f
				if !b.minSet || f < b.min {
					b.min = f
					b.minSet = true
				}
				if f > b.max {
					b.max = f
				}
			}
		}
	}

	out := HistogramResponse{Facets: []HistogramFacet{}}
	for k, vals := range values {
		facet := HistogramFacet{Property: k.property, ObjectTypeID: k.typeID, Buckets: make([]HistogramBucket, 0, len(vals)), N: totalN[k], Uniq: int64(len(vals))}
		var (
			totalSum     float64
			totalNumeric int64
			gMin, gMax   float64
			minSet       bool
		)
		for value, b := range vals {
			facet.Buckets = append(facet.Buckets, HistogramBucket{ValueJSON: json.RawMessage(value), Count: b.count})
			totalSum += b.sum
			totalNumeric += b.count_numeric
			if b.minSet {
				if !minSet || b.min < gMin {
					gMin = b.min
					minSet = true
				}
			}
			if b.max > gMax {
				gMax = b.max
			}
		}
		sort.Slice(facet.Buckets, func(i, j int) bool { return facet.Buckets[i].Count > facet.Buckets[j].Count })
		if len(facet.Buckets) > 200 {
			facet.Buckets = facet.Buckets[:200]
		}
		if totalNumeric > 0 {
			facet.Numeric = &NumericSummary{
				Sum: totalSum,
				Avg: totalSum / float64(totalNumeric),
				Min: gMin,
				Max: gMax,
				N:   totalNumeric,
			}
		}
		out.Facets = append(out.Facets, facet)
	}
	sort.Slice(out.Facets, func(i, j int) bool { return out.Facets[i].Property < out.Facets[j].Property })

	// Synthetic "Object Types" facet — top of the Histogram tab in
	// the Palantir UI. Property `@object_type` is reserved; client
	// code recognises the prefix and renders it as a typed
	// breakdown instead of a generic property panel.
	if len(typeCounts) > 0 {
		facet := HistogramFacet{
			Property: "@object_type",
			Buckets:  make([]HistogramBucket, 0, len(typeCounts)),
			Uniq:     int64(len(typeCounts)),
		}
		var n int64
		for typeID, count := range typeCounts {
			facet.Buckets = append(facet.Buckets, HistogramBucket{
				ValueJSON: json.RawMessage(`"` + typeID + `"`),
				Count:     count,
			})
			n += count
		}
		facet.N = n
		sort.Slice(facet.Buckets, func(i, j int) bool {
			return facet.Buckets[i].Count > facet.Buckets[j].Count
		})
		// Prepend so the breakdown is the first row regardless of
		// the per-property facets' alphabetical sort above.
		out.Facets = append([]HistogramFacet{facet}, out.Facets...)
	}

	writeJSON(w, http.StatusOK, out)
}

// ----- helpers -----

func dedupeRefs(in []ObjectRef) []ObjectRef {
	seen := make(map[string]struct{}, len(in))
	out := make([]ObjectRef, 0, len(in))
	for _, r := range in {
		key := r.ObjectTypeID + "|" + r.ObjectID
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, r)
	}
	return out
}

func groupByType(refs []ObjectRef) []ResultGroup {
	byType := make(map[string][]ObjectRef)
	for _, r := range refs {
		byType[r.ObjectTypeID] = append(byType[r.ObjectTypeID], r)
	}
	out := make([]ResultGroup, 0, len(byType))
	for t, items := range byType {
		out = append(out, ResultGroup{ObjectTypeID: t, Items: items, Total: len(items)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ObjectTypeID < out[j].ObjectTypeID })
	return out
}

func numericValue(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case int32:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		if err != nil {
			return 0, false
		}
		return f, true
	}
	return 0, false
}

// applyFilters evaluates property filters against an object. Missing
// properties produce a miss (no error). A non-empty parameter_ref
// looks up the actual value from `params`.
func applyFilters(filters []SearchAroundFilter, params map[string]any, obj *repos.Object) bool {
	props := objectProperties(obj)
	for _, f := range filters {
		actual, has := props[f.Property]
		if !has {
			return false
		}
		expected := resolveLiteral(f, params)
		if !matchFilter(actual, expected, f.Op) {
			return false
		}
	}
	return true
}

// objectProperties decodes obj.Payload as a property map. Returns an
// empty map for nil/empty/unparseable payloads — callers are expected
// to treat absence as a non-match, not an error.
func objectProperties(obj *repos.Object) map[string]any {
	if obj == nil || len(obj.Payload) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any)
	if err := json.Unmarshal(obj.Payload, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func resolveLiteral(f SearchAroundFilter, params map[string]any) any {
	if f.ParameterRef != "" {
		if v, ok := params[f.ParameterRef]; ok {
			return v
		}
		return nil
	}
	if len(f.LiteralJSON) == 0 {
		return nil
	}
	var v any
	_ = json.Unmarshal(f.LiteralJSON, &v)
	return v
}

func matchFilter(actual, expected any, op string) bool {
	switch op {
	case "", "eq":
		return equal(actual, expected)
	case "neq":
		return !equal(actual, expected)
	case "in":
		arr, ok := expected.([]any)
		if !ok {
			return false
		}
		for _, e := range arr {
			if equal(actual, e) {
				return true
			}
		}
		return false
	case "lt", "lte", "gt", "gte":
		af, aok := numericValue(actual)
		ef, eok := numericValue(expected)
		if !aok || !eok {
			return false
		}
		switch op {
		case "lt":
			return af < ef
		case "lte":
			return af <= ef
		case "gt":
			return af > ef
		case "gte":
			return af >= ef
		}
	case "range":
		arr, ok := expected.([]any)
		if !ok || len(arr) != 2 {
			return false
		}
		af, aok := numericValue(actual)
		lo, lok := numericValue(arr[0])
		hi, hok := numericValue(arr[1])
		if !aok || !lok || !hok {
			return false
		}
		return af >= lo && af <= hi
	case "contains":
		as, aok := actual.(string)
		es, eok := expected.(string)
		if !aok || !eok {
			return false
		}
		return strings.Contains(strings.ToLower(as), strings.ToLower(es))
	}
	return false
}

func equal(a, b any) bool {
	ra, _ := json.Marshal(a)
	rb, _ := json.Marshal(b)
	return string(ra) == string(rb)
}

