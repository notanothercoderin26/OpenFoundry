package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/restrictedview"
	"github.com/openfoundry/openfoundry-go/services/object-database-service/internal/storage"
)

type ObjectTypePolicyResolver interface {
	RestrictedViewPolicy(ctx context.Context, bearer string, objectTypeID string) (restrictedview.Policy, bool, error)
}

type HTTPObjectTypePolicyResolver struct {
	baseURL string
	client  *http.Client
}

func NewHTTPObjectTypePolicyResolver(baseURL string, timeout time.Duration) *HTTPObjectTypePolicyResolver {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &HTTPObjectTypePolicyResolver{
		baseURL: baseURL,
		client:  &http.Client{Timeout: timeout},
	}
}

func (r *HTTPObjectTypePolicyResolver) RestrictedViewPolicy(ctx context.Context, bearer string, objectTypeID string) (restrictedview.Policy, bool, error) {
	if r == nil || r.baseURL == "" || strings.TrimSpace(objectTypeID) == "" {
		return restrictedview.Policy{}, false, nil
	}
	endpoint := r.baseURL + "/api/v1/ontology/types/" + url.PathEscape(objectTypeID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return restrictedview.Policy{}, false, err
	}
	if strings.TrimSpace(bearer) != "" {
		req.Header.Set("Authorization", bearer)
	}
	res, err := r.client.Do(req)
	if err != nil {
		return restrictedview.Policy{}, false, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return restrictedview.Policy{}, false, nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return restrictedview.Policy{}, false, fmt.Errorf("object type policy lookup failed: %s %s", res.Status, strings.TrimSpace(string(body)))
	}
	var payload objectTypePolicyPayload
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return restrictedview.Policy{}, false, err
	}
	return restrictedViewPolicyFromObjectTypePayload(payload)
}

type objectTypePolicyPayload struct {
	ID                                string          `json:"id"`
	BackingDatasourceType             string          `json:"backing_datasource_type"`
	BackingRestrictedViewID           string          `json:"backing_restricted_view_id"`
	RestrictedViewID                  string          `json:"restricted_view_id"`
	RestrictedViewPolicy              json.RawMessage `json:"restricted_view_policy"`
	RestrictedViewHiddenColumns       []string        `json:"restricted_view_hidden_columns"`
	RestrictedViewMarkingColumns      []string        `json:"restricted_view_marking_columns"`
	RestrictedViewAllowedMarkings     []string        `json:"restricted_view_allowed_markings"`
	RestrictedViewConsumerModeEnabled bool            `json:"restricted_view_consumer_mode_enabled"`
	RestrictedViewAllowGuestAccess    bool            `json:"restricted_view_allow_guest_access"`
}

func restrictedViewPolicyFromObjectTypePayload(payload objectTypePolicyPayload) (restrictedview.Policy, bool, error) {
	rvID := firstNonEmpty(payload.RestrictedViewID, payload.BackingRestrictedViewID)
	datasourceType := strings.ToLower(strings.TrimSpace(payload.BackingDatasourceType))
	if datasourceType != "restricted_view" && rvID == "" {
		return restrictedview.Policy{}, false, nil
	}
	if rvID == "" {
		return restrictedview.Policy{}, false, fmt.Errorf("restricted-view-backed object type is missing restricted_view_id")
	}
	policy, allowedMarkings := normalizeObjectTypeRestrictedViewPolicy(payload.RestrictedViewPolicy)
	return restrictedview.Policy{
		ID:                  rvID,
		Policy:              policy,
		HiddenColumns:       payload.RestrictedViewHiddenColumns,
		MarkingColumns:      payload.RestrictedViewMarkingColumns,
		AllowedMarkings:     firstNonEmptySlice(payload.RestrictedViewAllowedMarkings, allowedMarkings),
		ConsumerModeEnabled: payload.RestrictedViewConsumerModeEnabled,
		AllowGuestAccess:    payload.RestrictedViewAllowGuestAccess,
	}, true, nil
}

func restrictedObjectPolicyForType(h *Handlers, r *http.Request, typeID storage.TypeId, body *queryRequest) (restrictedview.Policy, bool, error) {
	if policy, ok := restrictedObjectPolicyFromRequest(r, body); ok {
		return policy, true, nil
	}
	if h == nil || h.ObjectTypes == nil {
		return restrictedview.Policy{}, false, nil
	}
	policy, ok, err := h.ObjectTypes.RestrictedViewPolicy(r.Context(), r.Header.Get("Authorization"), string(typeID))
	if err != nil {
		return restrictedview.Policy{}, false, &storage.RepoError{Kind: storage.ErrTenantScope, Msg: "restricted-view-backed object type policy could not be resolved: " + err.Error()}
	}
	if !ok {
		return restrictedview.Policy{}, false, nil
	}
	claims, _ := authmw.FromContext(r.Context())
	if !claimsCanReadRestrictedViewBackedObjectType(claims) {
		return restrictedview.Policy{}, false, &storage.RepoError{Kind: storage.ErrTenantScope, Msg: "restricted-view-backed object type requires restricted_view:read and object_type_datasource:read"}
	}
	return policy, true, nil
}

func claimsCanReadRestrictedViewBackedObjectType(claims *authmw.Claims) bool {
	if claims == nil {
		return false
	}
	return claims.HasPermissionKey("restricted_view:read") &&
		(claims.HasPermissionKey("object_type_datasource:read") ||
			claims.HasPermissionKey("object_type_datasource:manage") ||
			claims.HasPermissionKey("ontology:manage"))
}

func normalizeObjectTypeRestrictedViewPolicy(raw json.RawMessage) (json.RawMessage, []string) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "{}" || trimmed == "null" {
		return nil, nil
	}
	var probe struct {
		Kind string `json:"kind"`
	}
	if json.Unmarshal(raw, &probe) == nil && probe.Kind == "granular_policy" {
		return raw, nil
	}
	var legacy struct {
		Mode             string                 `json:"mode"`
		AllowedGroups    []string               `json:"allowed_groups"`
		RequiredMarkings []string               `json:"required_markings"`
		Rules            []legacyRestrictedRule `json:"rules"`
		RowRules         []legacyRestrictedRule `json:"row_rules"`
	}
	if json.Unmarshal(raw, &legacy) != nil {
		return raw, nil
	}
	children := []map[string]any{}
	if len(legacy.AllowedGroups) > 0 {
		children = append(children, map[string]any{
			"id":       "allowed-groups",
			"type":     "comparison",
			"left":     map[string]any{"kind": "user_group_ids"},
			"operator": "intersects",
			"right":    map[string]any{"kind": "constant_array", "value_type": "string_array", "values": stringValues(legacy.AllowedGroups)},
		})
	}
	for idx, rule := range append(legacy.RowRules, legacy.Rules...) {
		if strings.TrimSpace(rule.Property) == "" {
			continue
		}
		children = append(children, map[string]any{
			"id":       firstNonEmpty(rule.ID, fmt.Sprintf("rule-%d", idx+1)),
			"type":     "comparison",
			"left":     map[string]any{"kind": "column", "column": strings.TrimSpace(rule.Property)},
			"operator": normalizeLegacyOperator(rule.Operator),
			"right":    constantOperand(rule.Value, rule.Values),
		})
	}
	if len(children) == 0 {
		if strings.EqualFold(strings.TrimSpace(legacy.Mode), "deny_all") {
			children = append(children, map[string]any{
				"id":       "deny-all",
				"type":     "comparison",
				"left":     map[string]any{"kind": "constant", "value_type": "boolean", "value": false},
				"operator": "equals",
				"right":    map[string]any{"kind": "constant", "value_type": "boolean", "value": true},
			})
		} else {
			return nil, legacy.RequiredMarkings
		}
	}
	operator := "and"
	if strings.EqualFold(strings.TrimSpace(legacy.Mode), "any_rule") || strings.EqualFold(strings.TrimSpace(legacy.Mode), "rules") {
		operator = "or"
	}
	compiled, err := json.Marshal(map[string]any{
		"kind":    "granular_policy",
		"version": 1,
		"root": map[string]any{
			"id":       "root",
			"type":     "group",
			"operator": operator,
			"children": children,
		},
	})
	if err != nil {
		return raw, legacy.RequiredMarkings
	}
	return compiled, legacy.RequiredMarkings
}

type legacyRestrictedRule struct {
	ID       string `json:"id"`
	Property string `json:"property"`
	Operator string `json:"operator"`
	Value    any    `json:"value"`
	Values   []any  `json:"values"`
}

func normalizeLegacyOperator(operator string) string {
	switch strings.ToLower(strings.TrimSpace(operator)) {
	case "not_equals", "neq", "!=":
		return "not_equals"
	case "greater_than", "gt", ">":
		return "greater_than"
	case "greater_than_or_equal", "gte", ">=":
		return "greater_than_or_equal"
	case "less_than", "lt", "<":
		return "less_than"
	case "less_than_or_equal", "lte", "<=":
		return "less_than_or_equal"
	case "in", "not_in":
		return "in"
	case "contains":
		return "contains"
	case "intersects":
		return "intersects"
	default:
		return "equals"
	}
}

func constantOperand(value any, values []any) map[string]any {
	if len(values) > 0 {
		return map[string]any{"kind": "constant_array", "value_type": inferArrayValueType(values), "values": values}
	}
	return map[string]any{"kind": "constant", "value_type": inferValueType(value), "value": value}
}

func inferValueType(value any) string {
	switch value.(type) {
	case bool:
		return "boolean"
	case float64, float32, int, int64, int32, uint, uint64, uint32, json.Number:
		return "number"
	default:
		return "string"
	}
}

func inferArrayValueType(values []any) string {
	if len(values) == 0 {
		return "string_array"
	}
	return inferValueType(values[0]) + "_array"
}

func stringValues(values []string) []any {
	out := make([]any, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func firstNonEmptySlice(values ...[]string) []string {
	for _, value := range values {
		if len(value) > 0 {
			return value
		}
	}
	return nil
}
