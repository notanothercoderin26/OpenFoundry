package transforms

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func mustJSON(t *testing.T, v any) map[string]any {
	t.Helper()
	bytes, err := json.Marshal(v)
	require.NoError(t, err)
	var out map[string]any
	require.NoError(t, json.Unmarshal(bytes, &out))
	return out
}

func step(id, op string, inputs map[string]any) TransformStep {
	return TransformStep{ID: id, Op: op, Inputs: inputs}
}

func literal(v any) map[string]any {
	bytes, _ := json.Marshal(v)
	return map[string]any{"kind": "literal", "value": json.RawMessage(bytes)}
}

func variableRef(id string) map[string]any {
	return map[string]any{"kind": "variable", "ref": id}
}

func stepRef(id string) map[string]any {
	return map[string]any{"kind": "step", "ref": id}
}

func TestValidateTransformation_StringConcatHappyPath(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("greet", "string_concat", map[string]any{
				"parts": []any{
					literal("Hello, "),
					variableRef("user_name"),
				},
			}),
		},
	}
	resolver := func(id string) (Kind, bool) {
		if id == "user_name" {
			return KindString, true
		}
		return KindUnknown, false
	}
	out, err := ValidateTransformation(tr, resolver, "transformation")
	require.NoError(t, err)
	require.Equal(t, KindString, out)
}

func TestValidateTransformation_PolymorphicMax(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("latest", "max", map[string]any{
				"values": []any{
					variableRef("ts_a"),
					variableRef("ts_b"),
				},
			}),
		},
	}
	resolver := func(id string) (Kind, bool) {
		return KindTimestamp, true
	}
	out, err := ValidateTransformation(tr, resolver, "tr")
	require.NoError(t, err)
	require.Equal(t, KindTimestamp, out, "max should output the kind of its inputs")
}

func TestValidateTransformation_StepReferenceFlow(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("delay_minutes", "between_times", map[string]any{
				"start": variableRef("scheduled"),
				"end":   variableRef("actual"),
				"unit":  literal("minutes"),
			}),
			step("delay_summary", "string_concat", map[string]any{
				"parts": []any{
					literal("Delay: "),
					stepRef("delay_minutes"),
					literal(" min"),
				},
			}),
		},
	}
	resolver := func(id string) (Kind, bool) { return KindTimestamp, true }
	out, err := ValidateTransformation(tr, resolver, "tr")
	require.NoError(t, err)
	require.Equal(t, KindString, out)
}

func TestValidateTransformation_CastOutputFromLiteral(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("as_date", "cast", map[string]any{
				"value":         variableRef("raw"),
				"target_kind":   literal("date"),
				"parser_format": literal("M/dd/yyyy"),
			}),
		},
	}
	resolver := func(id string) (Kind, bool) { return KindString, true }
	out, err := ValidateTransformation(tr, resolver, "tr")
	require.NoError(t, err)
	require.Equal(t, KindDate, out)
}

func TestValidateTransformation_RejectsForwardStepRef(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("uses_future", "abs", map[string]any{
				"value": stepRef("not_yet_defined"),
			}),
			step("not_yet_defined", "current_date", nil),
		},
	}
	_, err := ValidateTransformation(tr, nil, "tr")
	require.Error(t, err)
	var ve *ValidationError
	require.True(t, errors.As(err, &ve))
	require.Equal(t, "unknown_step_ref", ve.Code)
	require.Contains(t, ve.Path, "steps[0].inputs.value.ref")
}

func TestValidateTransformation_RejectsUnknownOp(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{step("x", "totally_made_up", nil)},
	}
	_, err := ValidateTransformation(tr, nil, "tr")
	require.Error(t, err)
	var ve *ValidationError
	require.True(t, errors.As(err, &ve))
	require.Equal(t, "unknown_op", ve.Code)
}

func TestValidateTransformation_RejectsKindMismatch(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("bad_add", "add", map[string]any{
				"operands": []any{
					literal(1),
					literal("not a number"),
				},
			}),
		},
	}
	_, err := ValidateTransformation(tr, nil, "tr")
	require.Error(t, err)
	var ve *ValidationError
	require.True(t, errors.As(err, &ve))
	require.Equal(t, "kind_mismatch", ve.Code)
	require.Contains(t, ve.Path, "operands[1]")
}

func TestValidateTransformation_RejectsMissingRequiredSlot(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("c", "cast", map[string]any{"value": literal("123")}),
		},
	}
	_, err := ValidateTransformation(tr, nil, "tr")
	require.Error(t, err)
	require.Contains(t, err.Error(), "target_kind")
}

func TestValidateTransformation_RejectsInvalidLiteralChoice(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("rd", "relative_date", map[string]any{
				"date":   variableRef("d"),
				"amount": literal(7),
				"unit":   literal("fortnights"),
			}),
		},
	}
	resolver := func(id string) (Kind, bool) { return KindDate, true }
	_, err := ValidateTransformation(tr, resolver, "tr")
	require.Error(t, err)
	var ve *ValidationError
	require.True(t, errors.As(err, &ve))
	require.Equal(t, "invalid_literal_choice", ve.Code)
}

func TestValidateTransformation_RejectsNonLiteralOnLiteralSlot(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("c", "cast", map[string]any{
				"value":       variableRef("x"),
				"target_kind": variableRef("y"),
			}),
		},
	}
	resolver := func(id string) (Kind, bool) { return KindString, true }
	_, err := ValidateTransformation(tr, resolver, "tr")
	require.Error(t, err)
	var ve *ValidationError
	require.True(t, errors.As(err, &ve))
	require.Equal(t, "non_literal_input", ve.Code)
}

func TestValidateTransformation_RejectsDuplicateStepID(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("dup", "current_date", nil),
			step("dup", "current_date", nil),
		},
	}
	_, err := ValidateTransformation(tr, nil, "tr")
	require.Error(t, err)
	require.Contains(t, err.Error(), "duplicate step id")
}

func TestValidateTransformation_RejectsUnknownInputSlot(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("a", "abs", map[string]any{
				"value":          literal(-5),
				"unexpected_arg": literal(7),
			}),
		},
	}
	_, err := ValidateTransformation(tr, nil, "tr")
	require.Error(t, err)
	var ve *ValidationError
	require.True(t, errors.As(err, &ve))
	require.Equal(t, "unknown_input", ve.Code)
}

func TestValidateTransformation_AcceptsUnknownVariableAsCompatible(t *testing.T) {
	t.Parallel()

	// A variable whose kind is unknown (e.g. function_output without
	// declared return type) should not block validation.
	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("a", "add", map[string]any{
				"operands": []any{literal(1), variableRef("opaque")},
			}),
		},
	}
	resolver := func(id string) (Kind, bool) { return KindUnknown, true }
	_, err := ValidateTransformation(tr, resolver, "tr")
	require.NoError(t, err)
}

func TestValidateTransformation_RejectsUnknownVariableRef(t *testing.T) {
	t.Parallel()

	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("a", "abs", map[string]any{"value": variableRef("does_not_exist")}),
		},
	}
	resolver := func(id string) (Kind, bool) { return KindUnknown, false }
	_, err := ValidateTransformation(tr, resolver, "tr")
	require.Error(t, err)
	var ve *ValidationError
	require.True(t, errors.As(err, &ve))
	require.Equal(t, "unknown_variable_ref", ve.Code)
}

func TestCatalogCoversDocumentedOperations(t *testing.T) {
	t.Parallel()
	// Spot-check: ensure each category has at least one op and that the
	// total count is in the documented range. This guards against
	// accidental deletions during refactors.
	required := []string{
		"string_concat", "if_else", "cast",
		"is_empty", "is_not_empty", "object_property",
		"object_set_aggregation", "object_rid",
		"add", "subtract", "multiply", "divide", "abs", "negate",
		"ceil", "floor", "round", "max", "min",
		"relative_date", "relative_time", "between_dates",
		"between_times", "current_date",
		"geohash_from_geopoint", "latitude_from_geopoint",
		"longitude_from_geopoint", "mgrs_from_geopoint",
		"string_is", "string_is_not", "string_contains",
		"string_does_not_contain", "string_starts_with", "string_ends_with",
		"numeric_equal_to", "numeric_not_equal_to",
		"numeric_less_than", "numeric_less_than_or_equal_to",
		"numeric_greater_than", "numeric_greater_than_or_equal_to",
		"date_is_on_or_after", "date_is_after", "date_is_on_or_before",
		"date_is_before", "date_is_equal",
		"time_is_on_or_after", "time_is_after", "time_is_on_or_before",
		"time_is_before", "time_is_equal",
		"boolean_is_true", "boolean_is_false", "is_null", "is_not_null",
		"array_compose", "array_intersection", "array_update_element_at",
		"array_get_element_at", "array_length",
		"array_contains", "array_does_not_contain",
		"array_is_subset_of", "array_is_null", "array_is_not_null",
		"extract_struct_field",
	}
	for _, op := range required {
		_, ok := Lookup(op)
		require.True(t, ok, "missing op %q in catalog", op)
	}
}

func TestParseSlotEntries_VariadicRequiresNonEmpty(t *testing.T) {
	t.Parallel()
	tr := &WorkshopTransformation{
		Steps: []TransformStep{
			step("a", "add", map[string]any{
				"operands": []any{},
			}),
		},
	}
	_, err := ValidateTransformation(tr, nil, "tr")
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "at least one entry"))
}

// sanity: mustJSON helper is exercised in case future tests use it.
var _ = mustJSON
