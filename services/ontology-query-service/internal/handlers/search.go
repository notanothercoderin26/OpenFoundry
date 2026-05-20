// Search handler — POST /api/v1/ontology/search.
//
// Closes B03 G1 (the missing Vespa-backed read path) and the
// pushdown half of B03 G2 (Workshop filters routed server-side
// instead of the legacy client-side `applyObjectSetFilters` over a
// paginated list). The wire shape mirrors `searchOntology()` in
// apps/web/src/lib/api/ontology.ts and adds an explicit `filters`
// array so Workshop can compile `WorkshopVariableFilter[]` straight
// to a backend query.
//
// Marking enforcement runs on every hit before it leaves the
// handler: equality filters are pushed to the backend, the snippet
// payload is inspected for a `markings` array, and any hit whose
// marking set is not fully covered by the caller's clearances is
// dropped — matching the canReadMarkings contract already used by
// GetObject/ListObjectsByType in this service.
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

const (
	defaultSearchLimit = 25
	maxSearchLimit     = 100
	// overFetchMultiplier compensates for hits dropped by marking
	// redaction or richer post-filters (`gte`, `contains`, `in`, …).
	overFetchMultiplier = 4
	// maxOverFetch caps the backend page size so a wildcard `q=*`
	// query cannot drain Vespa. Picked to leave headroom on top of
	// 100 × 4 while staying well under the Vespa default `hits` cap.
	maxOverFetch = 800
)

// searchRequest mirrors `searchOntology()` in apps/web/src/lib/api/ontology.ts.
//
// `filters` is the B03 G2 extension: each entry is a
// Workshop-compatible filter (equals/in/gte/lte/gt/lt/contains/
// is_empty/is_not_empty). Equality filters are pushed to the
// backend; everything else is applied in-process against the
// hit snippet so we can still ship the feature before per-type
// Vespa schemas register richer operators.
type searchRequest struct {
	Query                  string         `json:"query"`
	Kind                   string         `json:"kind,omitempty"`
	ObjectTypeID           string         `json:"object_type_id,omitempty"`
	Limit                  int            `json:"limit,omitempty"`
	Semantic               bool           `json:"semantic,omitempty"`
	HybridStrategy         string         `json:"hybrid_strategy,omitempty"`
	EmbeddingProvider      string         `json:"embedding_provider,omitempty"`
	SemanticCandidateLimit int            `json:"semantic_candidate_limit,omitempty"`
	Filters                []searchFilter `json:"filters,omitempty"`
}

// searchFilter is the canonical Workshop filter shape (see
// `WorkshopVariableFilter` in
// apps/web/src/lib/components/apps/widgets/workshopVariables.ts).
type searchFilter struct {
	PropertyName string `json:"property_name"`
	Operator     string `json:"operator,omitempty"`
	Value        any    `json:"value,omitempty"`
	Min          any    `json:"min,omitempty"`
	Max          any    `json:"max,omitempty"`
}

type searchResultPayload struct {
	Kind         string         `json:"kind"`
	ID           string         `json:"id"`
	ObjectTypeID *string        `json:"object_type_id"`
	Title        string         `json:"title"`
	Subtitle     *string        `json:"subtitle"`
	Snippet      string         `json:"snippet"`
	Score        float64        `json:"score"`
	Route        string         `json:"route"`
	Metadata     map[string]any `json:"metadata"`
}

type searchResponse struct {
	Query string                `json:"query"`
	Total int                   `json:"total"`
	Data  []searchResultPayload `json:"data"`
}

// Search serves POST /api/v1/ontology/search.
func (h *Handlers) Search(w http.ResponseWriter, r *http.Request) {
	claims, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if h.state.Search == nil {
		writeJSONErr(w, http.StatusServiceUnavailable, "search backend not configured")
		return
	}

	var req searchRequest
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	if err := dec.Decode(&req); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	tenant, ok := resolveSearchTenant(claims)
	if !ok {
		writeJSONErr(w, http.StatusBadRequest, "tenant could not be resolved from claims")
		return
	}

	limit := clampSearchLimit(req.Limit)
	fetchSize := limit * overFetchMultiplier
	if fetchSize > maxOverFetch {
		fetchSize = maxOverFetch
	}

	equals, postFilters, err := compileFilters(req.Filters)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid filter: "+err.Error())
		return
	}

	sq := repos.SearchQuery{
		Tenant:  repos.TenantId(tenant),
		Filters: equals,
		Page:    repos.Page{Size: uint32(fetchSize)},
	}
	q := strings.TrimSpace(req.Query)
	if q != "" {
		sq.Q = &q
	}
	if typeID := strings.TrimSpace(req.ObjectTypeID); typeID != "" {
		t := repos.TypeId(typeID)
		sq.TypeID = &t
	}

	hits, err := runSearch(r, h.state.Search, sq, req)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, "search backend error: "+err.Error())
		return
	}

	data := make([]searchResultPayload, 0, limit)
	for i := range hits {
		hit := hits[i]
		decoded := map[string]any{}
		if len(hit.Snippet) > 0 {
			_ = json.Unmarshal(hit.Snippet, &decoded)
		}
		if !applyPostFilters(decoded, postFilters) {
			continue
		}
		if !canReadHitMarkings(claims, decoded) {
			continue
		}
		hitKind := resolveHitKind(hit)
		if req.Kind != "" && !strings.EqualFold(req.Kind, hitKind) {
			continue
		}
		typeIDStr := string(hit.TypeID)
		var typeIDPtr *string
		if typeIDStr != "" {
			typeIDPtr = &typeIDStr
		}
		title := stringField(decoded, "title", "display_name", "name", "label")
		if title == "" {
			title = string(hit.ID)
		}
		subtitle := stringPtrField(decoded, "subtitle", "description")
		data = append(data, searchResultPayload{
			Kind:         hitKind,
			ID:           string(hit.ID),
			ObjectTypeID: typeIDPtr,
			Title:        title,
			Subtitle:     subtitle,
			Snippet:      buildSnippet(decoded, q),
			Score:        float64(hit.Score),
			Route:        objectRoute(typeIDStr, string(hit.ID)),
			Metadata:     decoded,
		})
		if len(data) >= limit {
			break
		}
	}

	sort.SliceStable(data, func(i, j int) bool { return data[i].Score > data[j].Score })

	writeJSON(w, http.StatusOK, searchResponse{Query: q, Total: len(data), Data: data})
}

// runSearch picks the richest backend surface the configured
// search store implements. When the caller asks for semantic /
// hybrid behaviour and the backend supports it, we route through
// the hybrid query; otherwise we fall back to lexical search.
func runSearch(r *http.Request, backend repos.SearchBackend, sq repos.SearchQuery, req searchRequest) ([]repos.SearchHit, error) {
	if req.Semantic || strings.EqualFold(strings.TrimSpace(req.HybridStrategy), "weighted") || strings.EqualFold(strings.TrimSpace(req.HybridStrategy), "rrf") {
		if hb, ok := backend.(repos.HybridSearchBackend); ok && sq.TypeID != nil {
			hq := repos.HybridQuery{
				Tenant:  sq.Tenant,
				TypeID:  *sq.TypeID,
				Text:    strings.TrimSpace(req.Query),
				Filters: sq.Filters,
				K:       sq.Page.Size,
			}
			hits, err := hb.SearchHybrid(r.Context(), hq, repos.Strong())
			if err == nil {
				return hits, nil
			}
			// Fall through to lexical search on hybrid errors so the
			// frontend never sees a hard failure when the deployment
			// has Vespa but no per-type vector field yet.
		}
	}
	page, err := backend.Search(r.Context(), sq, repos.Strong())
	if err != nil {
		return nil, err
	}
	return page.Items, nil
}

// resolveSearchTenant maps the caller's JWT claims to a
// `TenantId`. The org_id claim is the canonical tenant; admin
// callers without an org get a sentinel "all" tenant so they can
// query the in-memory + cross-tenant indices used in tests.
func resolveSearchTenant(claims *authmw.Claims) (string, bool) {
	if claims != nil && claims.OrgID != nil {
		return claims.OrgID.String(), true
	}
	if claims != nil && (claims.HasRole("admin") || claims.HasPermissionKey("rows:all") || claims.HasPermissionKey("ontology:read_all")) {
		return "all", true
	}
	return "", false
}

func clampSearchLimit(limit int) int {
	if limit <= 0 {
		return defaultSearchLimit
	}
	if limit > maxSearchLimit {
		return maxSearchLimit
	}
	return limit
}

// compileFilters splits a Workshop filter list into the two slices
// the handler needs: equality filters that go straight to the
// backend's `Filters map[string]string` slot, and richer operators
// that are applied post-fetch against the hit snippet.
func compileFilters(filters []searchFilter) (map[string]string, []compiledFilter, error) {
	equals := map[string]string{}
	post := make([]compiledFilter, 0, len(filters))
	for _, f := range filters {
		name := strings.TrimSpace(f.PropertyName)
		if name == "" {
			continue
		}
		op := strings.ToLower(strings.TrimSpace(f.Operator))
		if op == "" {
			op = "equals"
		}
		switch op {
		case "equals", "eq", "=":
			if f.Value == nil {
				post = append(post, compiledFilter{Property: name, Operator: "is_empty"})
				continue
			}
			s, err := scalarString(f.Value)
			if err != nil {
				return nil, nil, fmt.Errorf("equals on %q: %w", name, err)
			}
			if _, exists := equals[name]; exists {
				// Two equals on the same property is unsatisfiable
				// for the backend's AND-by-default semantics; let
				// post-filter catch the contradiction so the caller
				// gets zero results instead of a 500.
				post = append(post, compiledFilter{Property: name, Operator: "equals", Value: f.Value})
				continue
			}
			equals[name] = s
		case "between":
			if f.Min != nil {
				post = append(post, compiledFilter{Property: name, Operator: "gte", Value: f.Min})
			}
			if f.Max != nil {
				post = append(post, compiledFilter{Property: name, Operator: "lte", Value: f.Max})
			}
		default:
			post = append(post, compiledFilter{Property: name, Operator: op, Value: f.Value})
		}
	}
	return equals, post, nil
}

type compiledFilter struct {
	Property string
	Operator string
	Value    any
}

func applyPostFilters(decoded map[string]any, filters []compiledFilter) bool {
	for _, f := range filters {
		if !matchPostFilter(decoded, f) {
			return false
		}
	}
	return true
}

func matchPostFilter(decoded map[string]any, f compiledFilter) bool {
	actual, present := decoded[f.Property]
	switch f.Operator {
	case "is_empty":
		return !present || isEmptyAny(actual)
	case "is_not_empty":
		return present && !isEmptyAny(actual)
	case "equals", "eq", "=":
		return present && compareAny(actual, f.Value) == 0
	case "not_equals", "neq", "!=":
		return !present || compareAny(actual, f.Value) != 0
	case "gte", ">=":
		return present && compareAny(actual, f.Value) >= 0
	case "lte", "<=":
		return present && compareAny(actual, f.Value) <= 0
	case "gt", ">":
		return present && compareAny(actual, f.Value) > 0
	case "lt", "<":
		return present && compareAny(actual, f.Value) < 0
	case "contains":
		return present && strings.Contains(strings.ToLower(scalarToString(actual)), strings.ToLower(scalarToString(f.Value)))
	case "in":
		if !present {
			return false
		}
		needle := scalarToString(actual)
		for _, candidate := range anyToStringSlice(f.Value) {
			if needle == candidate {
				return true
			}
		}
		return false
	}
	return true
}

// canReadHitMarkings enforces marking-set coverage against the
// caller's clearances. The marking set may travel in three places:
//   - `markings` array on the snippet payload (current shape)
//   - `marking` scalar (single-marking objects)
//   - top-level `_markings` slot (reserved for indexer projections
//     that wrap the original payload)
//
// When no marking metadata is present the hit is allowed — matching
// the GetObject/ListObjectsByType behaviour so existing tests and
// older indexer versions stay green.
func canReadHitMarkings(claims *authmw.Claims, decoded map[string]any) bool {
	required := extractMarkings(decoded)
	if len(required) == 0 {
		return true
	}
	if claims == nil {
		return false
	}
	if !claims.HasActiveMarkingScope() &&
		(claims.HasRole("admin") || claims.HasPermissionKey("rows:all") || claims.HasPermissionKey("ontology:read_all")) {
		return true
	}
	return claims.AllowsAllMarkings(required)
}

func extractMarkings(decoded map[string]any) []string {
	for _, key := range []string{"markings", "_markings"} {
		if raw, ok := decoded[key]; ok {
			if list := anyToStringSlice(raw); len(list) > 0 {
				return list
			}
		}
	}
	if raw, ok := decoded["marking"]; ok {
		if s := scalarToString(raw); s != "" {
			return []string{s}
		}
	}
	return nil
}

func resolveHitKind(hit repos.SearchHit) string {
	if strings.HasPrefix(string(hit.TypeID), "link:") {
		return "link"
	}
	return "object"
}

func objectRoute(typeID, id string) string {
	if typeID == "" {
		return ""
	}
	if strings.HasPrefix(typeID, "link:") {
		return "/ontology/links/" + strings.TrimPrefix(typeID, "link:") + "/instances/" + id
	}
	return "/ontology/types/" + typeID + "/objects/" + id
}

func stringField(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			if s := scalarToString(v); s != "" {
				return s
			}
		}
	}
	return ""
}

func stringPtrField(m map[string]any, keys ...string) *string {
	if s := stringField(m, keys...); s != "" {
		return &s
	}
	return nil
}

func buildSnippet(m map[string]any, query string) string {
	if title := stringField(m, "title", "display_name", "name", "label"); title != "" {
		if desc := stringField(m, "description", "subtitle", "summary"); desc != "" {
			return title + " — " + desc
		}
		return title
	}
	if desc := stringField(m, "description", "subtitle", "summary"); desc != "" {
		return desc
	}
	if query != "" {
		return query
	}
	return ""
}

// ─── value coercion helpers ─────────────────────────────────────────────
//
// The JSON decoder runs with UseNumber so request operands keep
// their original precision. The helpers below convert any operand
// or document value to a comparable form (string, float64, or
// boolean) without resorting to reflection.

func scalarString(v any) (string, error) {
	switch x := v.(type) {
	case nil:
		return "", nil
	case string:
		return x, nil
	case bool:
		return strconv.FormatBool(x), nil
	case json.Number:
		return x.String(), nil
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64), nil
	case int:
		return strconv.Itoa(x), nil
	case int64:
		return strconv.FormatInt(x, 10), nil
	}
	return "", fmt.Errorf("unsupported scalar type %T", v)
}

func scalarToString(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case bool:
		return strconv.FormatBool(x)
	case json.Number:
		return x.String()
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func anyToStringSlice(v any) []string {
	switch x := v.(type) {
	case nil:
		return nil
	case []string:
		return x
	case []any:
		out := make([]string, 0, len(x))
		for _, item := range x {
			if s := scalarToString(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		return []string{x}
	}
	return nil
}

func numberValue(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case json.Number:
		n, err := x.Float64()
		if err != nil {
			return 0, false
		}
		return n, true
	case string:
		if n, err := strconv.ParseFloat(x, 64); err == nil {
			return n, true
		}
		if t, err := parseRFC3339Like(x); err == nil {
			return float64(t.Unix()), true
		}
	}
	return 0, false
}

func parseRFC3339Like(s string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("not a date-like string: %q", s)
}

func compareAny(a, b any) int {
	if na, okA := numberValue(a); okA {
		if nb, okB := numberValue(b); okB {
			switch {
			case na < nb:
				return -1
			case na > nb:
				return 1
			default:
				return 0
			}
		}
	}
	sa := scalarToString(a)
	sb := scalarToString(b)
	switch {
	case sa < sb:
		return -1
	case sa > sb:
		return 1
	default:
		return 0
	}
}

func isEmptyAny(v any) bool {
	if v == nil {
		return true
	}
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x) == ""
	case []any:
		return len(x) == 0
	case map[string]any:
		return len(x) == 0
	}
	return false
}
