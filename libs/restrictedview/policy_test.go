package restrictedview_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/libs/restrictedview"
)

func TestEvaluateRowCombinesPolicyAttributesGroupsMarkingsAndScope(t *testing.T) {
	t.Parallel()

	viewID := uuid.MustParse("11111111-1111-4111-8111-111111111111")
	orgID := uuid.MustParse("22222222-2222-4222-8222-222222222222")
	groupID := "33333333-3333-4333-8333-333333333333"
	claims := claimsWithAttributes(t, orgID, map[string]any{
		"region":    "emea",
		"group_ids": []string{groupID},
	})
	claims.SessionScope = &authmw.SessionScope{
		AllowedOrgIDs:     []uuid.UUID{orgID},
		AllowedMarkings:   []string{"finance"},
		RestrictedViewIDs: []uuid.UUID{viewID},
	}
	policy := restrictedview.Policy{
		ID:              viewID.String(),
		Policy:          granularPolicy(`"and"`),
		HiddenColumns:   []string{"ssn"},
		AllowedOrgIDs:   []uuid.UUID{orgID},
		AllowedMarkings: []string{"finance"},
	}
	row := map[string]any{
		"organization_id":   orgID.String(),
		"region":            "EMEA",
		"allowed_group_ids": []any{groupID},
		"required_markings": []any{"finance"},
		"ssn":               "111-22-3333",
	}

	decision := restrictedview.EvaluateRow(claims, policy, row)

	require.True(t, decision.Allowed, decision.DenyReasons)
	assert.Equal(t, []string{"rule-group", "rule-org", "rule-region"}, decision.MatchedRules)
	assert.Equal(t, []string{"ssn"}, decision.HiddenColumns)
	assert.Contains(t, decision.HistoricalIdentitySnapshotCaveat, "cannot fully reconstruct historical user attributes")

	filtered, aggregate := restrictedview.ApplyRows(claims, policy, []map[string]any{
		row,
		{"organization_id": orgID.String(), "region": "apac", "allowed_group_ids": []any{groupID}, "required_markings": []any{"finance"}},
	})
	require.Len(t, filtered, 1)
	assert.Nil(t, filtered[0]["ssn"])
	assert.True(t, aggregate.RequiresRuntimeEvaluation)
	assert.Contains(t, aggregate.DenyReasons[0], "granular policy did not match")
}

func TestEvaluateRowDeniesScopedSessionOutsideRestrictedView(t *testing.T) {
	t.Parallel()

	claims := claimsWithAttributes(t, uuid.New(), map[string]any{"region": "emea"})
	claims.SessionScope = &authmw.SessionScope{RestrictedViewIDs: []uuid.UUID{uuid.New()}}

	decision := restrictedview.EvaluateRow(claims, restrictedview.Policy{ID: uuid.NewString()}, map[string]any{})

	assert.False(t, decision.Allowed)
	assert.Contains(t, strings.Join(decision.DenyReasons, " "), "scoped session")
	assert.Contains(t, decision.HistoricalIdentitySnapshotCaveat, "identity snapshot extension")
}

func TestApplyTableRowsFiltersAndRedactsPreviewRows(t *testing.T) {
	t.Parallel()

	orgID := uuid.New()
	claims := claimsWithAttributes(t, orgID, map[string]any{"region": "emea"})
	columns := []string{"organization_id", "region", "amount"}
	rows := [][]json.RawMessage{
		{mustJSON(orgID.String()), mustJSON("emea"), mustJSON(10)},
		{mustJSON(orgID.String()), mustJSON("apac"), mustJSON(20)},
	}

	filtered, decision := restrictedview.ApplyTableRows(claims, restrictedview.Policy{
		Policy:        granularPolicyOrgRegion(),
		HiddenColumns: []string{"amount"},
	}, columns, rows)

	require.Len(t, filtered, 1)
	assert.JSONEq(t, `null`, string(filtered[0][2]))
	assert.True(t, decision.RequiresRuntimeEvaluation)
}

func TestSQLRewriteUsesClaimEmbeddedRestrictedViewPolicy(t *testing.T) {
	t.Parallel()

	orgID := uuid.MustParse("44444444-4444-4444-8444-444444444444")
	claims := claimsWithAttributes(t, orgID, map[string]any{
		"restricted_view_id":     "rv-sales",
		"restricted_view_policy": json.RawMessage(granularPolicyOrgRegion()),
		"region":                 "emea",
	})

	rewritten, decision, ok := restrictedview.RewriteSQL(`SELECT organization_id, region FROM sales`, claims)

	require.True(t, ok)
	assert.True(t, decision.Allowed)
	assert.Contains(t, rewritten, `FROM (SELECT organization_id, region FROM sales) AS openfoundry_restricted_view`)
	assert.Contains(t, rewritten, `"organization_id" = '44444444-4444-4444-8444-444444444444'`)
	assert.Contains(t, rewritten, `"region" = 'emea'`)
}

func TestSQLRewriteAddsMarkingBackedColumnPredicate(t *testing.T) {
	t.Parallel()

	orgID := uuid.MustParse("55555555-5555-4555-8555-555555555555")
	markingID := "66666666-6666-4666-8666-666666666666"
	claims := claimsWithAttributes(t, orgID, map[string]any{
		"restricted_view_id":              "rv-marked",
		"restricted_view_marking_columns": []string{"data_markings"},
	})
	claims.SessionScope = &authmw.SessionScope{
		AllowedOrgIDs:   []uuid.UUID{orgID},
		AllowedMarkings: []string{markingID},
	}

	rewritten, decision, ok := restrictedview.RewriteSQL(`SELECT id, data_markings FROM cases`, claims)

	require.True(t, ok)
	assert.True(t, decision.Allowed)
	assert.Contains(t, rewritten, `FROM (SELECT id, data_markings FROM cases) AS openfoundry_restricted_view`)
	assert.Contains(t, rewritten, `"data_markings" <@ ARRAY[`)
	assert.Contains(t, rewritten, `'66666666-6666-4666-8666-666666666666'`)
	assert.Contains(t, rewritten, `'55555555-5555-4555-8555-555555555555'`)
}

func TestMarkingBackedColumnsRequireAllRowIDs(t *testing.T) {
	t.Parallel()

	orgID := uuid.New()
	markingID := uuid.NewString()
	claims := claimsWithAttributes(t, orgID, map[string]any{})
	claims.SessionScope = &authmw.SessionScope{
		AllowedOrgIDs:   []uuid.UUID{orgID},
		AllowedMarkings: []string{markingID},
	}
	policy := restrictedview.Policy{MarkingColumns: []string{"data_markings"}}

	allowed := restrictedview.EvaluateRow(claims, policy, map[string]any{
		"data_markings": []any{markingID, orgID.String()},
	})
	require.True(t, allowed.Allowed, allowed.DenyReasons)

	denied := restrictedview.EvaluateRow(claims, policy, map[string]any{
		"data_markings": []any{markingID, uuid.NewString()},
	})
	assert.False(t, denied.Allowed)
	assert.Contains(t, strings.Join(denied.DenyReasons, " "), "row-level marking or organization membership")

	invalid := restrictedview.EvaluateRow(claims, policy, map[string]any{
		"data_markings": []any{"Case A"},
	})
	assert.False(t, invalid.Allowed)
	assert.Contains(t, strings.Join(invalid.DenyReasons, " "), "invalid marking or organization ID")
}

func TestValidateMarkingBackedSchemaUsesTypeclassHint(t *testing.T) {
	t.Parallel()

	fields, err := restrictedview.SchemaFromJSON(json.RawMessage(`{
		"fieldSchemaList": [
			{
				"name": "data_markings",
				"type": "ARRAY",
				"arraySubtype": {"type": "STRING"},
				"customMetadata": {"typeclasses": ["marking_type.mandatory"]}
			}
		]
	}`))
	require.NoError(t, err)
	assert.Equal(t, []string{"data_markings"}, restrictedview.MarkingColumnsFromSchema(fields))
	assert.Empty(t, restrictedview.ValidateMarkingBackedSchema(fields, nil))

	invalidFields, err := restrictedview.SchemaFromJSON(json.RawMessage(`{
		"fields": [
			{"name": "data_markings", "type": "STRING", "customMetadata": {"typeclasses": ["marking_type.mandatory"]}}
		]
	}`))
	require.NoError(t, err)
	assert.Contains(t, strings.Join(restrictedview.ValidateMarkingBackedSchema(invalidFields, nil), "; "), "ARRAY<STRING>")
}

func claimsWithAttributes(t *testing.T, orgID uuid.UUID, attrs map[string]any) *authmw.Claims {
	t.Helper()
	raw, err := json.Marshal(attrs)
	require.NoError(t, err)
	return &authmw.Claims{
		Sub:        uuid.New(),
		IAT:        time.Now().Add(-time.Minute).Unix(),
		EXP:        time.Now().Add(time.Hour).Unix(),
		JTI:        uuid.New(),
		OrgID:      &orgID,
		Attributes: raw,
	}
}

func granularPolicy(rootOperator string) json.RawMessage {
	return json.RawMessage(`{
		"kind": "granular_policy",
		"version": 1,
		"root": {
			"id": "root",
			"type": "group",
			"operator": ` + rootOperator + `,
			"children": [
				{
					"id": "rule-org",
					"type": "comparison",
					"left": { "kind": "column", "column": "organization_id" },
					"operator": "equals",
					"right": { "kind": "user_organization_id" }
				},
				{
					"id": "rule-region",
					"type": "comparison",
					"left": { "kind": "column", "column": "region" },
					"operator": "equals",
					"right": { "kind": "user_attribute", "key": "region" }
				},
				{
					"id": "rule-group",
					"type": "comparison",
					"left": { "kind": "user_group_ids" },
					"operator": "intersects",
					"right": { "kind": "column", "column": "allowed_group_ids" }
				}
			]
		}
	}`)
}

func granularPolicyOrgRegion() json.RawMessage {
	return json.RawMessage(`{
		"kind": "granular_policy",
		"version": 1,
		"root": {
			"id": "root",
			"type": "group",
			"operator": "and",
			"children": [
				{
					"id": "rule-org",
					"type": "comparison",
					"left": { "kind": "column", "column": "organization_id" },
					"operator": "equals",
					"right": { "kind": "user_organization_id" }
				},
				{
					"id": "rule-region",
					"type": "comparison",
					"left": { "kind": "column", "column": "region" },
					"operator": "equals",
					"right": { "kind": "user_attribute", "key": "region" }
				}
			]
		}
	}`)
}

func mustJSON(value any) json.RawMessage {
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return raw
}
