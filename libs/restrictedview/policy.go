// Package restrictedview evaluates Foundry-style restricted view
// policies at read time.
package restrictedview

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
)

const HistoricalIdentitySnapshotCaveat = "Restricted view transaction history records policy and output changes, but cannot fully reconstruct historical user attributes, group membership, marking membership, or scoped-session state unless OpenFoundry enables an explicit identity snapshot extension."
const MarkingTypeclassMandatory = "marking_type.mandatory"

const (
	HeaderRestrictedViewID                  = "x-openfoundry-restricted-view-id"
	HeaderRestrictedViewPolicy              = "x-openfoundry-restricted-view-policy"
	HeaderRestrictedViewHiddenColumns       = "x-openfoundry-restricted-view-hidden-columns"
	HeaderRestrictedViewMarkingColumns      = "x-openfoundry-restricted-view-marking-columns"
	HeaderRestrictedViewAllowedOrgIDs       = "x-openfoundry-restricted-view-allowed-org-ids"
	HeaderRestrictedViewAllowedMarkings     = "x-openfoundry-restricted-view-allowed-markings"
	HeaderRestrictedViewConsumerModeEnabled = "x-openfoundry-restricted-view-consumer-mode-enabled"
	HeaderRestrictedViewAllowGuestAccess    = "x-openfoundry-restricted-view-allow-guest-access"
)

// Policy is the runtime shape downstream readers need from a restricted
// view resource. Policy and Conditions may both carry the canonical
// granular_policy JSON; Conditions is kept for compatibility with the
// existing restricted_views table.
type Policy struct {
	ID                  string
	Policy              json.RawMessage
	Conditions          json.RawMessage
	RowFilter           *string
	HiddenColumns       []string
	MarkingColumns      []string
	AllowedOrgIDs       []uuid.UUID
	AllowedMarkings     []string
	ConsumerModeEnabled bool
	AllowGuestAccess    bool
}

// Decision explains why the current subject can or cannot see a row.
type Decision struct {
	Allowed                          bool     `json:"allowed"`
	MatchedRules                     []string `json:"matched_rules"`
	DenyReasons                      []string `json:"deny_reasons"`
	HiddenColumns                    []string `json:"hidden_columns"`
	MatchedRestrictedViewIDs         []string `json:"matched_restricted_view_ids"`
	RequiresRuntimeEvaluation        bool     `json:"requires_runtime_evaluation"`
	HistoricalIdentitySnapshotCaveat string   `json:"historical_identity_snapshot_caveat"`
}

type granularPolicy struct {
	Kind    string      `json:"kind"`
	Version int         `json:"version"`
	Root    policyGroup `json:"root"`
}

type policyGroup struct {
	ID       string             `json:"id"`
	Type     string             `json:"type"`
	Operator string             `json:"operator"`
	Children []policyExpression `json:"children"`
}

type policyExpression struct {
	ID       string             `json:"id"`
	Type     string             `json:"type"`
	Operator string             `json:"operator"`
	Left     policyOperand      `json:"left"`
	Right    policyOperand      `json:"right"`
	Children []policyExpression `json:"children"`
}

type policyOperand struct {
	Kind      string `json:"kind"`
	Key       string `json:"key,omitempty"`
	Column    string `json:"column,omitempty"`
	ValueType string `json:"value_type,omitempty"`
	Value     any    `json:"value,omitempty"`
	Values    []any  `json:"values,omitempty"`
}

// SchemaField is the minimal dataset schema projection needed to
// validate marking-backed restricted views.
type SchemaField struct {
	Name           string
	Type           string
	ArraySubType   *SchemaField
	CustomMetadata json.RawMessage
	TypeClasses    []string
}

// SchemaFromJSON accepts the common OpenFoundry / Foundry wire shapes:
// `{fields:[...]}`, `{fieldSchemaList:[...]}`, and
// `{schema:{fieldSchemaList:[...]}}`.
func SchemaFromJSON(raw json.RawMessage) ([]SchemaField, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, fmt.Errorf("backing_dataset_schema must be a JSON object")
	}
	for _, key := range []string{"fields", "fieldSchemaList"} {
		if fields, ok, err := schemaFieldsFromRaw(root[key]); ok || err != nil {
			return fields, err
		}
	}
	if schemaRaw := root["schema"]; len(schemaRaw) > 0 {
		var nested map[string]json.RawMessage
		if err := json.Unmarshal(schemaRaw, &nested); err != nil {
			return nil, fmt.Errorf("backing_dataset_schema.schema must be an object")
		}
		for _, key := range []string{"fields", "fieldSchemaList"} {
			if fields, ok, err := schemaFieldsFromRaw(nested[key]); ok || err != nil {
				return fields, err
			}
		}
	}
	return nil, fmt.Errorf("backing_dataset_schema must include fields or fieldSchemaList")
}

func schemaFieldsFromRaw(raw json.RawMessage) ([]SchemaField, bool, error) {
	if len(raw) == 0 {
		return nil, false, nil
	}
	var fields []schemaFieldJSON
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, true, fmt.Errorf("schema fields must be an array")
	}
	out := make([]SchemaField, 0, len(fields))
	for _, field := range fields {
		out = append(out, schemaFieldFromJSON(field))
	}
	return out, true, nil
}

type schemaFieldJSON struct {
	Name           string           `json:"name"`
	Type           string           `json:"type"`
	ArraySubType   *schemaFieldJSON `json:"arraySubType"`
	ArraySubtype   *schemaFieldJSON `json:"arraySubtype"`
	CustomMetadata json.RawMessage  `json:"customMetadata"`
	TypeClasses    []any            `json:"typeClasses"`
	TypeClassesAlt []any            `json:"type_classes"`
	Typeclasses    []any            `json:"typeclasses"`
}

func schemaFieldFromJSON(field schemaFieldJSON) SchemaField {
	var sub *SchemaField
	if field.ArraySubType != nil {
		converted := schemaFieldFromJSON(*field.ArraySubType)
		sub = &converted
	} else if field.ArraySubtype != nil {
		converted := schemaFieldFromJSON(*field.ArraySubtype)
		sub = &converted
	}
	return SchemaField{
		Name:           strings.TrimSpace(field.Name),
		Type:           strings.ToUpper(strings.TrimSpace(field.Type)),
		ArraySubType:   sub,
		CustomMetadata: field.CustomMetadata,
		TypeClasses: append(
			append(typeClassesFromAny(field.TypeClasses), typeClassesFromAny(field.TypeClassesAlt)...),
			typeClassesFromAny(field.Typeclasses)...,
		),
	}
}

// MarkingColumnsFromSchema returns every field annotated with the
// Foundry marking column hint.
func MarkingColumnsFromSchema(fields []SchemaField) []string {
	out := []string{}
	for _, field := range fields {
		if fieldHasTypeclass(field, MarkingTypeclassMandatory) {
			out = append(out, field.Name)
		}
	}
	return dedupStrings(out)
}

// ValidateMarkingBackedSchema ensures configured marking columns are
// present and have STRING ARRAY shape. If no columns are configured,
// annotated marking_type.mandatory fields are used.
func ValidateMarkingBackedSchema(fields []SchemaField, markingColumns []string) []string {
	columns := dedupStrings(markingColumns)
	if len(columns) == 0 {
		columns = MarkingColumnsFromSchema(fields)
	}
	if len(columns) == 0 {
		return nil
	}
	byName := map[string]SchemaField{}
	for _, field := range fields {
		byName[field.Name] = field
	}
	errs := []string{}
	for _, column := range columns {
		field, ok := byName[column]
		if !ok {
			errs = append(errs, fmt.Sprintf("marking column %q does not exist in the backing dataset schema", column))
			continue
		}
		if strings.ToUpper(field.Type) != "ARRAY" || field.ArraySubType == nil || strings.ToUpper(field.ArraySubType.Type) != "STRING" {
			errs = append(errs, fmt.Sprintf("marking column %q must be ARRAY<STRING>", column))
		}
	}
	return errs
}

// PolicyFromHeaders reads a restricted view runtime policy from gateway
// headers. The getter is intentionally tiny so callers can pass
// http.Header.Get without coupling this package to net/http.
func PolicyFromHeaders(get func(string) string) (Policy, bool) {
	p := Policy{
		ID:                  strings.TrimSpace(get(HeaderRestrictedViewID)),
		Policy:              json.RawMessage(strings.TrimSpace(get(HeaderRestrictedViewPolicy))),
		HiddenColumns:       splitCSV(get(HeaderRestrictedViewHiddenColumns)),
		MarkingColumns:      splitCSV(get(HeaderRestrictedViewMarkingColumns)),
		AllowedMarkings:     splitCSV(get(HeaderRestrictedViewAllowedMarkings)),
		ConsumerModeEnabled: parseBool(get(HeaderRestrictedViewConsumerModeEnabled)),
		AllowGuestAccess:    parseBool(get(HeaderRestrictedViewAllowGuestAccess)),
	}
	for _, raw := range splitCSV(get(HeaderRestrictedViewAllowedOrgIDs)) {
		if id, err := uuid.Parse(raw); err == nil {
			p.AllowedOrgIDs = append(p.AllowedOrgIDs, id)
		}
	}
	return p, p.ID != "" || len(p.Policy) > 0 || len(p.HiddenColumns) > 0 ||
		len(p.MarkingColumns) > 0 ||
		len(p.AllowedOrgIDs) > 0 || len(p.AllowedMarkings) > 0 ||
		p.ConsumerModeEnabled || p.AllowGuestAccess
}

// PolicyFromClaims reads an embedded restricted view policy from JWT
// attributes. This is used by non-HTTP readers such as Flight SQL.
func PolicyFromClaims(claims *authmw.Claims) (Policy, bool) {
	if claims == nil {
		return Policy{}, false
	}
	var attrs map[string]any
	if len(claims.Attributes) == 0 || json.Unmarshal(claims.Attributes, &attrs) != nil {
		return Policy{}, false
	}
	var p Policy
	if v, ok := stringAttr(attrs, "restricted_view_id"); ok {
		p.ID = v
	}
	if raw, ok := rawJSONAttr(attrs, "restricted_view_policy"); ok {
		p.Policy = raw
	} else if raw, ok := rawJSONAttr(attrs, "restricted_view"); ok {
		p.Policy = raw
	}
	p.HiddenColumns = stringSliceAttr(attrs, "restricted_view_hidden_columns")
	p.MarkingColumns = stringSliceAttr(attrs, "restricted_view_marking_columns")
	p.AllowedMarkings = stringSliceAttr(attrs, "restricted_view_allowed_markings")
	p.AllowedOrgIDs = uuidSliceAttr(attrs, "restricted_view_allowed_org_ids")
	p.ConsumerModeEnabled = boolAttr(attrs, "restricted_view_consumer_mode_enabled")
	p.AllowGuestAccess = boolAttr(attrs, "restricted_view_allow_guest_access")
	return p, p.ID != "" || len(p.Policy) > 0 || len(p.HiddenColumns) > 0 ||
		len(p.MarkingColumns) > 0 ||
		len(p.AllowedOrgIDs) > 0 || len(p.AllowedMarkings) > 0 ||
		p.ConsumerModeEnabled || p.AllowGuestAccess
}

// EvaluateRow evaluates all runtime gates and granular policy rules for
// a single row. Row maps should include physical columns plus any
// metadata a reader knows, such as organization_id, marking, or markings.
func EvaluateRow(claims *authmw.Claims, p Policy, row map[string]any) Decision {
	decision := Decision{
		Allowed:                          true,
		HiddenColumns:                    dedupStrings(p.HiddenColumns),
		HistoricalIdentitySnapshotCaveat: HistoricalIdentitySnapshotCaveat,
	}
	if p.ID != "" {
		decision.MatchedRestrictedViewIDs = []string{p.ID}
	}
	if claims == nil {
		decision.Allowed = false
		decision.DenyReasons = append(decision.DenyReasons, "restricted view evaluation requires an authenticated subject")
		return decision
	}
	applyRuntimeGates(claims, p, row, &decision)
	if !decision.Allowed {
		return decision
	}

	gp, ok := decodeGranularPolicy(p)
	if !ok || len(gp.Root.Children) == 0 {
		return decision
	}
	matches, matched, err := evalGroup(gp.Root, claims, row)
	decision.RequiresRuntimeEvaluation = true
	if err != nil {
		decision.Allowed = false
		decision.DenyReasons = append(decision.DenyReasons, err.Error())
		return decision
	}
	decision.MatchedRules = dedupStrings(matched)
	if !matches {
		decision.Allowed = false
		decision.DenyReasons = append(decision.DenyReasons, "restricted view granular policy did not match this row")
	}
	return decision
}

// ApplyRows filters and redacts map rows through the restricted view
// policy, returning an aggregate decision that preserves deny reasons.
func ApplyRows(claims *authmw.Claims, p Policy, rows []map[string]any) ([]map[string]any, Decision) {
	out := make([]map[string]any, 0, len(rows))
	aggregate := Decision{
		Allowed:                          true,
		HiddenColumns:                    dedupStrings(p.HiddenColumns),
		HistoricalIdentitySnapshotCaveat: HistoricalIdentitySnapshotCaveat,
	}
	if p.ID != "" {
		aggregate.MatchedRestrictedViewIDs = []string{p.ID}
	}
	for _, row := range rows {
		d := EvaluateRow(claims, p, row)
		aggregate.RequiresRuntimeEvaluation = aggregate.RequiresRuntimeEvaluation || d.RequiresRuntimeEvaluation
		aggregate.MatchedRules = append(aggregate.MatchedRules, d.MatchedRules...)
		if d.Allowed {
			out = append(out, RedactRow(row, p.HiddenColumns))
			continue
		}
		aggregate.DenyReasons = append(aggregate.DenyReasons, d.DenyReasons...)
	}
	aggregate.MatchedRules = dedupStrings(aggregate.MatchedRules)
	aggregate.DenyReasons = dedupStrings(aggregate.DenyReasons)
	return out, aggregate
}

// ApplyTableRows filters a tabular preview result where each row is a
// JSON value slice aligned with columns.
func ApplyTableRows(claims *authmw.Claims, p Policy, columns []string, rows [][]json.RawMessage) ([][]json.RawMessage, Decision) {
	out := make([][]json.RawMessage, 0, len(rows))
	hidden := stringSet(p.HiddenColumns)
	aggregate := Decision{
		Allowed:                          true,
		HiddenColumns:                    dedupStrings(p.HiddenColumns),
		HistoricalIdentitySnapshotCaveat: HistoricalIdentitySnapshotCaveat,
	}
	if p.ID != "" {
		aggregate.MatchedRestrictedViewIDs = []string{p.ID}
	}
	for _, row := range rows {
		rowMap := make(map[string]any, len(columns))
		for i, col := range columns {
			if i >= len(row) {
				continue
			}
			var value any
			if len(row[i]) > 0 {
				_ = json.Unmarshal(row[i], &value)
			}
			rowMap[col] = value
		}
		d := EvaluateRow(claims, p, rowMap)
		aggregate.RequiresRuntimeEvaluation = aggregate.RequiresRuntimeEvaluation || d.RequiresRuntimeEvaluation
		aggregate.MatchedRules = append(aggregate.MatchedRules, d.MatchedRules...)
		if !d.Allowed {
			aggregate.DenyReasons = append(aggregate.DenyReasons, d.DenyReasons...)
			continue
		}
		next := make([]json.RawMessage, len(row))
		copy(next, row)
		for i, col := range columns {
			if i < len(next) && hidden[strings.ToLower(col)] {
				next[i] = json.RawMessage("null")
			}
		}
		out = append(out, next)
	}
	aggregate.MatchedRules = dedupStrings(aggregate.MatchedRules)
	aggregate.DenyReasons = dedupStrings(aggregate.DenyReasons)
	return out, aggregate
}

// RedactRow returns a shallow copy with hidden columns removed.
func RedactRow(row map[string]any, hiddenColumns []string) map[string]any {
	next := make(map[string]any, len(row))
	hidden := stringSet(hiddenColumns)
	for k, v := range row {
		if hidden[strings.ToLower(k)] {
			next[k] = nil
			continue
		}
		next[k] = v
	}
	return next
}

// RewriteSQL wraps a SELECT with a restricted view predicate when the
// caller's claims carry a compilable granular policy.
func RewriteSQL(sql string, claims *authmw.Claims) (string, Decision, bool) {
	p, ok := PolicyFromClaims(claims)
	if !ok {
		return sql, Decision{Allowed: true, HistoricalIdentitySnapshotCaveat: HistoricalIdentitySnapshotCaveat}, false
	}
	predicate, ok := SQLPredicate(claims, p, "")
	if !ok || predicate == "" {
		allowed := len(p.MarkingColumns) == 0
		denyReasons := []string{}
		if !allowed {
			denyReasons = append(denyReasons, "restricted view marking columns require a compilable SQL predicate")
		}
		return sql, Decision{
			Allowed:                          allowed,
			DenyReasons:                      denyReasons,
			RequiresRuntimeEvaluation:        true,
			HiddenColumns:                    dedupStrings(p.HiddenColumns),
			MatchedRestrictedViewIDs:         maybeID(p.ID),
			HistoricalIdentitySnapshotCaveat: HistoricalIdentitySnapshotCaveat,
		}, false
	}
	trimmed := strings.TrimSpace(sql)
	if !isSingleSelect(trimmed) {
		return sql, Decision{
			Allowed:                          false,
			DenyReasons:                      []string{"restricted view SQL rewriting only supports single SELECT statements"},
			RequiresRuntimeEvaluation:        true,
			HiddenColumns:                    dedupStrings(p.HiddenColumns),
			MatchedRestrictedViewIDs:         maybeID(p.ID),
			HistoricalIdentitySnapshotCaveat: HistoricalIdentitySnapshotCaveat,
		}, false
	}
	return "SELECT * FROM (" + trimmed + ") AS openfoundry_restricted_view WHERE " + predicate, Decision{
		Allowed:                          true,
		RequiresRuntimeEvaluation:        true,
		HiddenColumns:                    dedupStrings(p.HiddenColumns),
		MatchedRestrictedViewIDs:         maybeID(p.ID),
		HistoricalIdentitySnapshotCaveat: HistoricalIdentitySnapshotCaveat,
	}, true
}

// SQLPredicate compiles the canonical granular policy into a SQL WHERE
// predicate for simple column-vs-user/constant comparisons. It returns
// ok=false for expressions that need row-materialized evaluation.
func SQLPredicate(claims *authmw.Claims, p Policy, alias string) (predicate string, ok bool) {
	parts := []string{}
	if gp, ok := decodeGranularPolicy(p); ok && len(gp.Root.Children) > 0 {
		part, ok := sqlGroup(gp.Root, claims, alias)
		if !ok {
			return "", false
		}
		if part != "" {
			parts = append(parts, "("+part+")")
		}
	}
	markingPart, ok := sqlMarkingColumnsPredicate(claims, p, alias)
	if !ok {
		return "", false
	}
	if markingPart != "" {
		parts = append(parts, "("+markingPart+")")
	}
	if len(parts) == 0 {
		return "", false
	}
	return strings.Join(parts, " AND "), true
}

func applyRuntimeGates(claims *authmw.Claims, p Policy, row map[string]any, d *Decision) {
	if p.ID != "" && !claims.HasRole("admin") {
		scoped := claims.RestrictedViewIDs()
		if len(scoped) > 0 && !uuidSetContains(scoped, p.ID) {
			d.Allowed = false
			d.DenyReasons = append(d.DenyReasons, "scoped session is not authorized for this restricted view")
		}
	}
	if claims.IsGuestSession() && !p.AllowGuestAccess {
		d.Allowed = false
		d.DenyReasons = append(d.DenyReasons, "guest session is not allowed to read this restricted view")
	}
	if claims.ConsumerModeEnabled() && !p.ConsumerModeEnabled {
		d.Allowed = false
		d.DenyReasons = append(d.DenyReasons, "consumer-mode scoped session is not allowed for this restricted view")
	}
	if len(p.AllowedOrgIDs) > 0 && !claims.HasRole("admin") {
		rowOrg := firstUUID(row, "organization_id", "org_id")
		switch {
		case rowOrg != nil:
			if !uuidSliceContains(p.AllowedOrgIDs, *rowOrg) || !claims.AllowsOrgID(rowOrg) {
				d.Allowed = false
				d.DenyReasons = append(d.DenyReasons, "organization boundary denied this restricted view row")
			}
		case !orgsIntersect(claims.AllowedOrgIDs(), p.AllowedOrgIDs):
			d.Allowed = false
			d.DenyReasons = append(d.DenyReasons, "subject organization scope does not intersect restricted view organizations")
		}
	}
	requiredMarkings, invalidMarkings := rowMarkings(p, row)
	for _, invalid := range invalidMarkings {
		d.Allowed = false
		d.DenyReasons = append(d.DenyReasons, fmt.Sprintf("row marking column contains invalid marking or organization ID %q", invalid))
	}
	if len(requiredMarkings) == 0 {
		requiredMarkings = p.AllowedMarkings
	}
	allowedMarkingSet := stringSet(p.AllowedMarkings)
	enforceAllowedMarkingSet := len(p.MarkingColumns) == 0
	for _, marking := range requiredMarkings {
		if enforceAllowedMarkingSet && len(allowedMarkingSet) > 0 && !allowedMarkingSet[strings.ToLower(marking)] && !satisfiesOrgRequirement(claims, marking) {
			d.Allowed = false
			d.DenyReasons = append(d.DenyReasons, fmt.Sprintf("row marking %q is outside the restricted view marking allowlist", marking))
			continue
		}
		if !satisfiesRowRequirement(claims, marking) {
			d.Allowed = false
			d.DenyReasons = append(d.DenyReasons, fmt.Sprintf("subject lacks row-level marking or organization membership %q", marking))
		}
	}
}

func decodeGranularPolicy(p Policy) (granularPolicy, bool) {
	for _, raw := range []json.RawMessage{p.Policy, p.Conditions} {
		if len(raw) == 0 {
			continue
		}
		var gp granularPolicy
		if err := json.Unmarshal(raw, &gp); err != nil {
			continue
		}
		if gp.Kind == "granular_policy" && gp.Root.Type == "group" {
			return gp, true
		}
	}
	return granularPolicy{}, false
}

func evalGroup(group policyGroup, claims *authmw.Claims, row map[string]any) (bool, []string, error) {
	operator := strings.ToLower(group.Operator)
	if operator == "" {
		operator = "and"
	}
	matched := []string{}
	if operator == "or" {
		for _, child := range group.Children {
			ok, childMatched, err := evalExpression(child, claims, row)
			if err != nil {
				return false, nil, err
			}
			if ok {
				matched = append(matched, childMatched...)
			}
		}
		return len(matched) > 0, matched, nil
	}
	for _, child := range group.Children {
		ok, childMatched, err := evalExpression(child, claims, row)
		if err != nil {
			return false, nil, err
		}
		if !ok {
			return false, matched, nil
		}
		matched = append(matched, childMatched...)
	}
	return true, matched, nil
}

func evalExpression(expr policyExpression, claims *authmw.Claims, row map[string]any) (bool, []string, error) {
	if expr.Type == "group" {
		operator := strings.ToLower(expr.Operator)
		if operator == "" {
			operator = "and"
		}
		matched := []string{}
		if operator == "or" {
			for _, child := range expr.Children {
				ok, childMatched, err := evalExpression(child, claims, row)
				if err != nil {
					return false, nil, err
				}
				if ok {
					matched = append(matched, childMatched...)
				}
			}
			return len(matched) > 0, matched, nil
		}
		for _, child := range expr.Children {
			ok, childMatched, err := evalExpression(child, claims, row)
			if err != nil {
				return false, nil, err
			}
			if !ok {
				return false, matched, nil
			}
			matched = append(matched, childMatched...)
		}
		return true, matched, nil
	}
	left := operandValue(expr.Left, claims, row)
	right := operandValue(expr.Right, claims, row)
	if compareValues(left, right, expr.Operator) {
		return true, []string{firstNonEmpty(expr.ID, "comparison")}, nil
	}
	return false, nil, nil
}

func operandValue(op policyOperand, claims *authmw.Claims, row map[string]any) any {
	switch op.Kind {
	case "column":
		return row[op.Column]
	case "user_attribute":
		if claims == nil || op.Key == "" {
			return nil
		}
		v, _ := claims.Attribute(op.Key)
		return v
	case "user_group_ids":
		return userGroupIDs(claims)
	case "user_marking_ids", "user_markings":
		if claims == nil {
			return nil
		}
		return claims.AllowedMarkings()
	case "user_marking_or_organization_ids", "user_requirement_ids":
		return claimsRequirementIDs(claims)
	case "user_organization_id":
		if claims != nil && claims.OrgID != nil {
			return claims.OrgID.String()
		}
		return nil
	case "user_organization_ids":
		if claims == nil {
			return nil
		}
		ids := claims.AllowedOrgIDs()
		out := make([]string, 0, len(ids))
		for _, id := range ids {
			out = append(out, id.String())
		}
		return out
	case "user_id":
		if claims != nil {
			return claims.Sub.String()
		}
		return nil
	case "constant":
		return op.Value
	case "constant_array":
		return op.Values
	default:
		return nil
	}
}

func compareValues(left, right any, operator string) bool {
	switch strings.ToLower(operator) {
	case "equals", "=", "==":
		return valuesEqual(left, right)
	case "not_equals", "!=", "<>":
		return !valuesEqual(left, right)
	case "greater_than", ">":
		return compareOrdered(left, right) > 0
	case "greater_than_or_equal", ">=":
		return compareOrdered(left, right) >= 0
	case "less_than", "<":
		return compareOrdered(left, right) < 0
	case "less_than_or_equal", "<=":
		return compareOrdered(left, right) <= 0
	case "in":
		return valueIn(left, right)
	case "contains":
		return containsValue(left, right)
	case "intersects":
		return intersects(left, right)
	default:
		return false
	}
}

func valuesEqual(left, right any) bool {
	if lf, lok := numeric(left); lok {
		if rf, rok := numeric(right); rok {
			return math.Abs(lf-rf) < 0.000000001
		}
	}
	if lb, lok := boolValue(left); lok {
		if rb, rok := boolValue(right); rok {
			return lb == rb
		}
	}
	ls, lok := scalarString(left)
	rs, rok := scalarString(right)
	return lok && rok && strings.EqualFold(ls, rs)
}

func compareOrdered(left, right any) int {
	if lf, lok := numeric(left); lok {
		if rf, rok := numeric(right); rok {
			switch {
			case lf > rf:
				return 1
			case lf < rf:
				return -1
			default:
				return 0
			}
		}
	}
	ls, lok := scalarString(left)
	rs, rok := scalarString(right)
	if !lok || !rok {
		return -1
	}
	return strings.Compare(ls, rs)
}

func valueIn(left, right any) bool {
	for _, candidate := range asSlice(right) {
		if valuesEqual(left, candidate) {
			return true
		}
	}
	return false
}

func containsValue(left, right any) bool {
	if s, ok := scalarString(left); ok {
		if needle, ok := scalarString(right); ok {
			return strings.Contains(s, needle)
		}
	}
	rightValues := asSlice(right)
	if len(rightValues) > 0 {
		for _, needle := range rightValues {
			found := false
			for _, candidate := range asSlice(left) {
				if valuesEqual(candidate, needle) {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		return true
	}
	for _, candidate := range asSlice(left) {
		if valuesEqual(candidate, right) {
			return true
		}
	}
	return false
}

func intersects(left, right any) bool {
	for _, l := range asSlice(left) {
		for _, r := range asSlice(right) {
			if valuesEqual(l, r) {
				return true
			}
		}
	}
	return false
}

func asSlice(v any) []any {
	switch x := v.(type) {
	case nil:
		return nil
	case []any:
		return x
	case []string:
		out := make([]any, len(x))
		for i := range x {
			out[i] = x[i]
		}
		return out
	case []uuid.UUID:
		out := make([]any, len(x))
		for i := range x {
			out[i] = x[i].String()
		}
		return out
	case []int:
		out := make([]any, len(x))
		for i := range x {
			out[i] = x[i]
		}
		return out
	case []float64:
		out := make([]any, len(x))
		for i := range x {
			out[i] = x[i]
		}
		return out
	default:
		return []any{x}
	}
}

func numeric(v any) (float64, bool) {
	switch x := v.(type) {
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(x, 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func boolValue(v any) (bool, bool) {
	switch x := v.(type) {
	case bool:
		return x, true
	case string:
		b, err := strconv.ParseBool(x)
		return b, err == nil
	default:
		return false, false
	}
}

func scalarString(v any) (string, bool) {
	switch x := v.(type) {
	case string:
		return x, true
	case uuid.UUID:
		return x.String(), true
	case json.Number:
		return x.String(), true
	case int:
		return strconv.Itoa(x), true
	case int64:
		return strconv.FormatInt(x, 10), true
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64), true
	case bool:
		return strconv.FormatBool(x), true
	default:
		return "", false
	}
}

func userGroupIDs(claims *authmw.Claims) []string {
	if claims == nil {
		return nil
	}
	out := []string{}
	for _, key := range []string{"group_ids", "groups", "group_memberships"} {
		if v, ok := claims.Attribute(key); ok {
			out = append(out, stringifySlice(v)...)
		}
	}
	return dedupStrings(out)
}

func rowMarkings(p Policy, row map[string]any) ([]string, []string) {
	out := []string{}
	invalid := []string{}
	keys := append([]string(nil), p.MarkingColumns...)
	strictIDs := len(keys) > 0
	if len(keys) == 0 {
		keys = []string{"marking", "markings", "marking_id", "marking_ids", "required_markings", "data_markings"}
	}
	for _, key := range keys {
		if v, ok := row[key]; ok {
			for _, value := range stringifySlice(v) {
				if strictIDs && !isValidRequirementID(value) {
					invalid = append(invalid, value)
					continue
				}
				out = append(out, value)
			}
		}
	}
	return dedupStrings(out), dedupStrings(invalid)
}

func firstUUID(row map[string]any, keys ...string) *uuid.UUID {
	for _, key := range keys {
		raw, ok := row[key]
		if !ok {
			continue
		}
		for _, s := range stringifySlice(raw) {
			if id, err := uuid.Parse(s); err == nil {
				return &id
			}
		}
	}
	return nil
}

func satisfiesRowRequirement(claims *authmw.Claims, requirement string) bool {
	return claims.AllowsMarking(requirement) || satisfiesOrgRequirement(claims, requirement)
}

func claimsRequirementIDs(claims *authmw.Claims) []string {
	if claims == nil {
		return nil
	}
	out := append([]string(nil), claims.AllowedMarkings()...)
	for _, id := range claims.AllowedOrgIDs() {
		out = append(out, id.String())
	}
	return dedupStrings(out)
}

func satisfiesOrgRequirement(claims *authmw.Claims, requirement string) bool {
	id, err := uuid.Parse(strings.TrimSpace(requirement))
	if err != nil {
		return false
	}
	return claims.AllowsOrgID(&id)
}

func isValidRequirementID(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	if _, err := uuid.Parse(value); err == nil {
		return true
	}
	return isLegacyMarkingName(value)
}

func isLegacyMarkingName(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "public", "confidential", "pii":
		return true
	default:
		return false
	}
}

func stringifySlice(v any) []string {
	switch x := v.(type) {
	case nil:
		return nil
	case string:
		return []string{x}
	case []string:
		return append([]string(nil), x...)
	case []uuid.UUID:
		out := make([]string, len(x))
		for i := range x {
			out[i] = x[i].String()
		}
		return out
	case []any:
		out := make([]string, 0, len(x))
		for _, item := range x {
			if s, ok := scalarString(item); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		if s, ok := scalarString(v); ok {
			return []string{s}
		}
		return nil
	}
}

func sqlGroup(group policyGroup, claims *authmw.Claims, alias string) (string, bool) {
	op := strings.ToUpper(group.Operator)
	if op != "OR" {
		op = "AND"
	}
	parts := []string{}
	for _, child := range group.Children {
		part, ok := sqlExpression(child, claims, alias)
		if !ok {
			return "", false
		}
		if part != "" {
			parts = append(parts, "("+part+")")
		}
	}
	return strings.Join(parts, " "+op+" "), len(parts) > 0
}

func sqlExpression(expr policyExpression, claims *authmw.Claims, alias string) (string, bool) {
	if expr.Type == "group" {
		op := strings.ToUpper(expr.Operator)
		if op != "OR" {
			op = "AND"
		}
		parts := []string{}
		for _, child := range expr.Children {
			part, ok := sqlExpression(child, claims, alias)
			if !ok {
				return "", false
			}
			if part != "" {
				parts = append(parts, "("+part+")")
			}
		}
		return strings.Join(parts, " "+op+" "), len(parts) > 0
	}
	return sqlComparison(expr, claims, alias)
}

func sqlComparison(expr policyExpression, claims *authmw.Claims, alias string) (string, bool) {
	leftCol, leftIsCol := sqlColumn(expr.Left, alias)
	rightCol, rightIsCol := sqlColumn(expr.Right, alias)
	if leftIsCol && rightIsCol {
		return "", false
	}
	if !leftIsCol && !rightIsCol {
		return "", false
	}
	col := leftCol
	valueOperand := expr.Right
	reverse := false
	if !leftIsCol {
		col = rightCol
		valueOperand = expr.Left
		reverse = true
	}
	value := operandValue(valueOperand, claims, nil)
	operator := strings.ToLower(expr.Operator)
	if reverse {
		operator = reverseOperator(operator)
	}
	switch operator {
	case "equals":
		lit, ok := sqlLiteral(value)
		return col + " = " + lit, ok
	case "not_equals":
		lit, ok := sqlLiteral(value)
		return col + " <> " + lit, ok
	case "greater_than":
		lit, ok := sqlLiteral(value)
		return col + " > " + lit, ok
	case "greater_than_or_equal":
		lit, ok := sqlLiteral(value)
		return col + " >= " + lit, ok
	case "less_than":
		lit, ok := sqlLiteral(value)
		return col + " < " + lit, ok
	case "less_than_or_equal":
		lit, ok := sqlLiteral(value)
		return col + " <= " + lit, ok
	case "in":
		list, ok := sqlLiteralList(value)
		return col + " IN (" + list + ")", ok
	case "contains":
		list, ok := sqlLiteralList(value)
		return col + " @> ARRAY[" + list + "]", ok
	case "contained_by", "is_contained_by", "subset":
		list, ok := sqlLiteralList(value)
		return col + " <@ ARRAY[" + list + "]", ok
	case "intersects":
		list, ok := sqlLiteralList(value)
		return col + " && ARRAY[" + list + "]", ok
	default:
		return "", false
	}
}

func sqlMarkingColumnsPredicate(claims *authmw.Claims, p Policy, alias string) (string, bool) {
	if len(p.MarkingColumns) == 0 {
		return "", true
	}
	if claims != nil && claims.HasRole("admin") {
		return "TRUE", true
	}
	values := claimsRequirementIDs(claims)
	list, listOK := sqlLiteralList(values)
	parts := make([]string, 0, len(p.MarkingColumns))
	for _, column := range p.MarkingColumns {
		col, ok := sqlColumn(policyOperand{Kind: "column", Column: column}, alias)
		if !ok {
			return "", false
		}
		if len(values) == 0 {
			parts = append(parts, col+" IS NULL OR cardinality("+col+") = 0")
			continue
		}
		if !listOK {
			return "", false
		}
		parts = append(parts, col+" IS NULL OR "+col+" <@ ARRAY["+list+"]")
	}
	if len(parts) == 0 {
		return "", true
	}
	return strings.Join(wrapSQLParts(parts), " AND "), true
}

var safeSQLIdent = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func sqlColumn(op policyOperand, alias string) (string, bool) {
	if op.Kind != "column" || !safeSQLIdent.MatchString(op.Column) {
		return "", false
	}
	col := `"` + op.Column + `"`
	if alias != "" && safeSQLIdent.MatchString(alias) {
		col = `"` + alias + `".` + col
	}
	return col, true
}

func sqlLiteral(v any) (string, bool) {
	switch x := v.(type) {
	case nil:
		return "NULL", true
	case string:
		return "'" + strings.ReplaceAll(x, "'", "''") + "'", true
	case bool:
		if x {
			return "TRUE", true
		}
		return "FALSE", true
	case int, int64, float32, float64, json.Number:
		if f, ok := numeric(x); ok && !math.IsNaN(f) && !math.IsInf(f, 0) {
			return strconv.FormatFloat(f, 'f', -1, 64), true
		}
	}
	return "", false
}

func sqlLiteralList(v any) (string, bool) {
	values := asSlice(v)
	if len(values) == 0 {
		return "", false
	}
	parts := make([]string, 0, len(values))
	for _, value := range values {
		lit, ok := sqlLiteral(value)
		if !ok {
			return "", false
		}
		parts = append(parts, lit)
	}
	return strings.Join(parts, ", "), true
}

func wrapSQLParts(parts []string) []string {
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part != "" {
			out = append(out, "("+part+")")
		}
	}
	return out
}

func reverseOperator(op string) string {
	switch op {
	case "greater_than":
		return "less_than"
	case "greater_than_or_equal":
		return "less_than_or_equal"
	case "less_than":
		return "greater_than"
	case "less_than_or_equal":
		return "greater_than_or_equal"
	case "contains":
		return "contained_by"
	default:
		return op
	}
}

func isSingleSelect(sql string) bool {
	lower := strings.ToLower(sql)
	return strings.HasPrefix(lower, "select ") && !strings.Contains(strings.TrimSuffix(sql, ";"), ";")
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func parseBool(raw string) bool {
	return strings.EqualFold(raw, "true") || raw == "1" || strings.EqualFold(raw, "yes")
}

func stringSet(values []string) map[string]bool {
	out := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out[strings.ToLower(value)] = true
		}
	}
	return out
}

func typeClassesFromAny(values []any) []string {
	out := []string{}
	for _, value := range values {
		switch x := value.(type) {
		case string:
			out = append(out, x)
		case map[string]any:
			for _, key := range []string{"name", "kind"} {
				if s, ok := x[key].(string); ok && s != "" {
					out = append(out, s)
				}
			}
		}
	}
	return out
}

func fieldHasTypeclass(field SchemaField, want string) bool {
	for _, value := range field.TypeClasses {
		if strings.EqualFold(strings.TrimSpace(value), want) {
			return true
		}
	}
	if len(field.CustomMetadata) == 0 {
		return false
	}
	var meta map[string]any
	if err := json.Unmarshal(field.CustomMetadata, &meta); err != nil {
		return false
	}
	for _, key := range []string{"typeClasses", "type_classes", "typeclasses"} {
		raw, ok := meta[key]
		if !ok {
			continue
		}
		for _, value := range stringifySlice(raw) {
			if strings.EqualFold(strings.TrimSpace(value), want) {
				return true
			}
		}
		if array, ok := raw.([]any); ok {
			for _, entry := range array {
				if obj, ok := entry.(map[string]any); ok {
					for _, key := range []string{"name", "kind"} {
						if s, ok := obj[key].(string); ok && strings.EqualFold(strings.TrimSpace(s), want) {
							return true
						}
					}
				}
			}
		}
	}
	return false
}

func dedupStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func maybeID(id string) []string {
	if strings.TrimSpace(id) == "" {
		return nil
	}
	return []string{id}
}

func uuidSetContains(ids []uuid.UUID, target string) bool {
	parsed, err := uuid.Parse(target)
	if err != nil {
		return false
	}
	return uuidSliceContains(ids, parsed)
}

func uuidSliceContains(ids []uuid.UUID, target uuid.UUID) bool {
	for _, id := range ids {
		if id == target {
			return true
		}
	}
	return false
}

func orgsIntersect(left, right []uuid.UUID) bool {
	for _, l := range left {
		for _, r := range right {
			if l == r {
				return true
			}
		}
	}
	return false
}

func stringAttr(attrs map[string]any, key string) (string, bool) {
	v, ok := attrs[key]
	if !ok {
		return "", false
	}
	s, ok := scalarString(v)
	return strings.TrimSpace(s), ok && strings.TrimSpace(s) != ""
}

func rawJSONAttr(attrs map[string]any, key string) (json.RawMessage, bool) {
	v, ok := attrs[key]
	if !ok {
		return nil, false
	}
	switch x := v.(type) {
	case string:
		raw := strings.TrimSpace(x)
		if raw == "" {
			return nil, false
		}
		return json.RawMessage(raw), true
	default:
		raw, err := json.Marshal(v)
		if err != nil {
			return nil, false
		}
		return raw, true
	}
}

func stringSliceAttr(attrs map[string]any, key string) []string {
	v, ok := attrs[key]
	if !ok {
		return nil
	}
	return dedupStrings(stringifySlice(v))
}

func uuidSliceAttr(attrs map[string]any, key string) []uuid.UUID {
	out := []uuid.UUID{}
	for _, raw := range stringSliceAttr(attrs, key) {
		if id, err := uuid.Parse(raw); err == nil {
			out = append(out, id)
		}
	}
	return out
}

func boolAttr(attrs map[string]any, key string) bool {
	v, ok := attrs[key]
	if !ok {
		return false
	}
	if b, ok := boolValue(v); ok {
		return b
	}
	return false
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
