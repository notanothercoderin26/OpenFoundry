package transforms

// Slot describes one named input of an operation.
type Slot struct {
	Name     string
	Accepts  []Kind // nil/empty means "any kind"
	Required bool
	Variadic bool // when true, the JSON value is an array of StepInput entries
	// Literal forces the input to be supplied as a literal value (no
	// variable / step refs allowed). Used by ops like `cast` whose
	// `target_kind` selector is structural.
	Literal bool
	// LiteralChoices, when non-nil, constrains the literal value to one
	// of the listed strings. Only meaningful when Literal is true and
	// the value is parsed as a string.
	LiteralChoices []string
}

// OutputRule decides the output kind of an operation.
type OutputRule struct {
	// Fixed is the output kind when the op is monomorphic.
	Fixed Kind
	// FromSlot, when set, copies the resolved kind of the named input
	// slot to the output (handles polymorphic ops like max/min/if_else).
	FromSlot string
	// FromLiteralKind, when set, names the input slot whose literal
	// value (parsed as a kind string) becomes the output (handles `cast`).
	FromLiteralKind string
	// ArrayElement, when set, names the slot holding an array; the
	// output is treated as KindAny (element kind unknown at validation
	// time). Used by `array_get_element_at`.
	ArrayElement string
}

// OpSpec is the data-only description of a transformation operation. It
// is intentionally execution-free — the catalog lives in this package
// so the schema layer and the frontend can both consume it. The
// frontend mirrors this shape in `apps/web/.../workshopTransformations.ts`.
type OpSpec struct {
	Op       string
	Category string
	Slots    []Slot
	Output   OutputRule
}

const (
	CatGeneral     = "general"
	CatObjectSet   = "object_set"
	CatMath        = "math"
	CatDateTime    = "date_time"
	CatComparisons = "comparisons"
	CatStrings     = "strings"
	CatGeospatial  = "geospatial"
	CatArrayOps    = "array_ops"
	CatArrayChecks = "array_checks"
	CatStruct      = "struct"
)

var (
	numericLike = []Kind{KindNumber}
	stringOnly  = []Kind{KindString}
	booleanOnly = []Kind{KindBoolean}
	dateOnly    = []Kind{KindDate}
	timestampOK = []Kind{KindTimestamp}
	geopointOK  = []Kind{KindGeoPoint}
	arrayOnly   = []Kind{KindArray}
	structOnly  = []Kind{KindStruct}
	objectSet   = []Kind{KindObjectSet}
	objectRef   = []Kind{KindObjectRef}
	orderable   = []Kind{KindNumber, KindDate, KindTimestamp}
)

// catalog is the immutable registry of supported operations. Lookups go
// through `Lookup` so callers cannot accidentally mutate the map.
var catalog = func() map[string]OpSpec {
	specs := []OpSpec{
		// ── General ─────────────────────────────────────────────
		{
			Op: "string_concat", Category: CatGeneral,
			Slots: []Slot{
				{Name: "parts", Variadic: true, Required: true},
				{Name: "separator", Accepts: stringOnly},
			},
			Output: OutputRule{Fixed: KindString},
		},
		{
			Op: "if_else", Category: CatGeneral,
			Slots: []Slot{
				{Name: "condition", Accepts: booleanOnly, Required: true},
				{Name: "then", Required: true},
				{Name: "else", Required: true},
			},
			Output: OutputRule{FromSlot: "then"},
		},
		{
			Op: "cast", Category: CatGeneral,
			Slots: []Slot{
				{Name: "value", Required: true},
				{Name: "target_kind", Required: true, Literal: true,
					LiteralChoices: []string{
						"string", "number", "boolean",
						"date", "timestamp", "geopoint", "geoshape",
					}},
				{Name: "parser_format", Accepts: stringOnly, Literal: true},
				{Name: "timezone", Accepts: stringOnly},
			},
			Output: OutputRule{FromLiteralKind: "target_kind"},
		},

		// ── Object set ──────────────────────────────────────────
		{
			Op: "is_empty", Category: CatObjectSet,
			Slots:  []Slot{{Name: "object_set", Accepts: objectSet, Required: true}},
			Output: OutputRule{Fixed: KindBoolean},
		},
		{
			Op: "is_not_empty", Category: CatObjectSet,
			Slots:  []Slot{{Name: "object_set", Accepts: objectSet, Required: true}},
			Output: OutputRule{Fixed: KindBoolean},
		},
		{
			Op: "object_property", Category: CatObjectSet,
			Slots: []Slot{
				{Name: "object", Accepts: objectRef, Required: true},
				{Name: "property_name", Accepts: stringOnly, Required: true, Literal: true},
			},
			Output: OutputRule{Fixed: KindAny},
		},
		{
			Op: "object_set_aggregation", Category: CatObjectSet,
			Slots: []Slot{
				{Name: "object_set", Accepts: objectSet, Required: true},
				{Name: "property_name", Accepts: stringOnly, Required: true, Literal: true},
				{Name: "aggregation", Accepts: stringOnly, Required: true, Literal: true,
					LiteralChoices: []string{"min", "max", "sum", "average", "cardinality"}},
			},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "object_rid", Category: CatObjectSet,
			Slots:  []Slot{{Name: "object", Accepts: objectRef, Required: true}},
			Output: OutputRule{Fixed: KindString},
		},

		// ── Math ────────────────────────────────────────────────
		{
			Op: "add", Category: CatMath,
			Slots:  []Slot{{Name: "operands", Variadic: true, Required: true, Accepts: numericLike}},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "subtract", Category: CatMath,
			Slots:  []Slot{{Name: "operands", Variadic: true, Required: true, Accepts: numericLike}},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "multiply", Category: CatMath,
			Slots:  []Slot{{Name: "operands", Variadic: true, Required: true, Accepts: numericLike}},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "divide", Category: CatMath,
			Slots:  []Slot{{Name: "operands", Variadic: true, Required: true, Accepts: numericLike}},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "abs", Category: CatMath,
			Slots:  []Slot{{Name: "value", Accepts: numericLike, Required: true}},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "negate", Category: CatMath,
			Slots:  []Slot{{Name: "value", Accepts: numericLike, Required: true}},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "ceil", Category: CatMath,
			Slots: []Slot{
				{Name: "value", Accepts: numericLike, Required: true},
				{Name: "precision", Accepts: numericLike},
			},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "floor", Category: CatMath,
			Slots: []Slot{
				{Name: "value", Accepts: numericLike, Required: true},
				{Name: "precision", Accepts: numericLike},
			},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "round", Category: CatMath,
			Slots: []Slot{
				{Name: "value", Accepts: numericLike, Required: true},
				{Name: "precision", Accepts: numericLike},
			},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "max", Category: CatMath,
			Slots:  []Slot{{Name: "values", Variadic: true, Required: true, Accepts: orderable}},
			Output: OutputRule{FromSlot: "values"},
		},
		{
			Op: "min", Category: CatMath,
			Slots:  []Slot{{Name: "values", Variadic: true, Required: true, Accepts: orderable}},
			Output: OutputRule{FromSlot: "values"},
		},

		// ── Date/time ───────────────────────────────────────────
		{
			Op: "relative_date", Category: CatDateTime,
			Slots: []Slot{
				{Name: "date", Accepts: dateOnly, Required: true},
				{Name: "amount", Accepts: numericLike, Required: true},
				{Name: "unit", Accepts: stringOnly, Required: true, Literal: true,
					LiteralChoices: []string{"days", "weeks", "months", "years"}},
			},
			Output: OutputRule{Fixed: KindDate},
		},
		{
			Op: "relative_time", Category: CatDateTime,
			Slots: []Slot{
				{Name: "timestamp", Accepts: timestampOK, Required: true},
				{Name: "amount", Accepts: numericLike, Required: true},
				{Name: "unit", Accepts: stringOnly, Required: true, Literal: true,
					LiteralChoices: []string{"seconds", "minutes", "hours", "days", "weeks", "months", "years"}},
			},
			Output: OutputRule{Fixed: KindTimestamp},
		},
		{
			Op: "between_dates", Category: CatDateTime,
			Slots: []Slot{
				{Name: "start", Accepts: dateOnly, Required: true},
				{Name: "end", Accepts: dateOnly, Required: true},
				{Name: "unit", Accepts: stringOnly, Required: true, Literal: true,
					LiteralChoices: []string{"days", "weeks", "months", "years"}},
			},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "between_times", Category: CatDateTime,
			Slots: []Slot{
				{Name: "start", Accepts: timestampOK, Required: true},
				{Name: "end", Accepts: timestampOK, Required: true},
				{Name: "unit", Accepts: stringOnly, Required: true, Literal: true,
					LiteralChoices: []string{"seconds", "minutes", "hours", "days", "weeks", "months", "years"}},
			},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "current_date", Category: CatDateTime,
			Slots:  []Slot{},
			Output: OutputRule{Fixed: KindDate},
		},

		// ── Geospatial ──────────────────────────────────────────
		{
			Op: "geohash_from_geopoint", Category: CatGeospatial,
			Slots: []Slot{
				{Name: "point", Accepts: geopointOK, Required: true},
				{Name: "precision", Accepts: numericLike},
			},
			Output: OutputRule{Fixed: KindString},
		},
		{
			Op: "latitude_from_geopoint", Category: CatGeospatial,
			Slots:  []Slot{{Name: "point", Accepts: geopointOK, Required: true}},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "longitude_from_geopoint", Category: CatGeospatial,
			Slots:  []Slot{{Name: "point", Accepts: geopointOK, Required: true}},
			Output: OutputRule{Fixed: KindNumber},
		},
		{
			Op: "mgrs_from_geopoint", Category: CatGeospatial,
			Slots: []Slot{
				{Name: "point", Accepts: geopointOK, Required: true},
				{Name: "precision", Accepts: numericLike},
			},
			Output: OutputRule{Fixed: KindString},
		},

		// ── Strings ─────────────────────────────────────────────
		{Op: "string_is", Category: CatStrings, Slots: stringCmpSlots(), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "string_is_not", Category: CatStrings, Slots: stringCmpSlots(), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "string_contains", Category: CatStrings, Slots: stringCmpSlots(), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "string_does_not_contain", Category: CatStrings, Slots: stringCmpSlots(), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "string_starts_with", Category: CatStrings, Slots: stringCmpSlots(), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "string_ends_with", Category: CatStrings, Slots: stringCmpSlots(), Output: OutputRule{Fixed: KindBoolean}},

		// ── Comparisons: numeric ────────────────────────────────
		{Op: "numeric_equal_to", Category: CatComparisons, Slots: orderedPair(numericLike), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "numeric_not_equal_to", Category: CatComparisons, Slots: orderedPair(numericLike), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "numeric_less_than", Category: CatComparisons, Slots: orderedPair(numericLike), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "numeric_less_than_or_equal_to", Category: CatComparisons, Slots: orderedPair(numericLike), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "numeric_greater_than", Category: CatComparisons, Slots: orderedPair(numericLike), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "numeric_greater_than_or_equal_to", Category: CatComparisons, Slots: orderedPair(numericLike), Output: OutputRule{Fixed: KindBoolean}},

		// ── Comparisons: date ───────────────────────────────────
		{Op: "date_is_on_or_after", Category: CatComparisons, Slots: orderedPair(dateOnly), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "date_is_after", Category: CatComparisons, Slots: orderedPair(dateOnly), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "date_is_on_or_before", Category: CatComparisons, Slots: orderedPair(dateOnly), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "date_is_before", Category: CatComparisons, Slots: orderedPair(dateOnly), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "date_is_equal", Category: CatComparisons, Slots: orderedPair(dateOnly), Output: OutputRule{Fixed: KindBoolean}},

		// ── Comparisons: time ───────────────────────────────────
		{Op: "time_is_on_or_after", Category: CatComparisons, Slots: orderedPair(timestampOK), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "time_is_after", Category: CatComparisons, Slots: orderedPair(timestampOK), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "time_is_on_or_before", Category: CatComparisons, Slots: orderedPair(timestampOK), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "time_is_before", Category: CatComparisons, Slots: orderedPair(timestampOK), Output: OutputRule{Fixed: KindBoolean}},
		{Op: "time_is_equal", Category: CatComparisons, Slots: orderedPair(timestampOK), Output: OutputRule{Fixed: KindBoolean}},

		// ── Comparisons: boolean ────────────────────────────────
		{Op: "boolean_is_true", Category: CatComparisons,
			Slots:  []Slot{{Name: "value", Accepts: booleanOnly, Required: true}},
			Output: OutputRule{Fixed: KindBoolean}},
		{Op: "boolean_is_false", Category: CatComparisons,
			Slots:  []Slot{{Name: "value", Accepts: booleanOnly, Required: true}},
			Output: OutputRule{Fixed: KindBoolean}},
		{Op: "is_null", Category: CatComparisons,
			Slots:  []Slot{{Name: "value", Required: true}},
			Output: OutputRule{Fixed: KindBoolean}},
		{Op: "is_not_null", Category: CatComparisons,
			Slots:  []Slot{{Name: "value", Required: true}},
			Output: OutputRule{Fixed: KindBoolean}},

		// ── Array ops ───────────────────────────────────────────
		{Op: "array_compose", Category: CatArrayOps,
			Slots:  []Slot{{Name: "arrays", Variadic: true, Required: true, Accepts: arrayOnly}},
			Output: OutputRule{Fixed: KindArray}},
		{Op: "array_intersection", Category: CatArrayOps,
			Slots:  []Slot{{Name: "arrays", Variadic: true, Required: true, Accepts: arrayOnly}},
			Output: OutputRule{Fixed: KindArray}},
		{Op: "array_update_element_at", Category: CatArrayOps,
			Slots: []Slot{
				{Name: "array", Accepts: arrayOnly, Required: true},
				{Name: "index", Accepts: numericLike, Required: true},
				{Name: "value", Required: true},
			},
			Output: OutputRule{Fixed: KindArray}},
		{Op: "array_get_element_at", Category: CatArrayOps,
			Slots: []Slot{
				{Name: "array", Accepts: arrayOnly, Required: true},
				{Name: "index", Accepts: numericLike, Required: true},
			},
			Output: OutputRule{ArrayElement: "array"}},
		{Op: "array_length", Category: CatArrayOps,
			Slots:  []Slot{{Name: "array", Accepts: arrayOnly, Required: true}},
			Output: OutputRule{Fixed: KindNumber}},

		// ── Array checks ────────────────────────────────────────
		{Op: "array_contains", Category: CatArrayChecks,
			Slots: []Slot{
				{Name: "array", Accepts: arrayOnly, Required: true},
				{Name: "value", Required: true},
			},
			Output: OutputRule{Fixed: KindBoolean}},
		{Op: "array_does_not_contain", Category: CatArrayChecks,
			Slots: []Slot{
				{Name: "array", Accepts: arrayOnly, Required: true},
				{Name: "value", Required: true},
			},
			Output: OutputRule{Fixed: KindBoolean}},
		{Op: "array_is_subset_of", Category: CatArrayChecks,
			Slots: []Slot{
				{Name: "subset", Accepts: arrayOnly, Required: true},
				{Name: "superset", Accepts: arrayOnly, Required: true},
			},
			Output: OutputRule{Fixed: KindBoolean}},
		{Op: "array_is_null", Category: CatArrayChecks,
			Slots:  []Slot{{Name: "array", Accepts: arrayOnly, Required: true}},
			Output: OutputRule{Fixed: KindBoolean}},
		{Op: "array_is_not_null", Category: CatArrayChecks,
			Slots:  []Slot{{Name: "array", Accepts: arrayOnly, Required: true}},
			Output: OutputRule{Fixed: KindBoolean}},

		// ── Struct ──────────────────────────────────────────────
		{Op: "extract_struct_field", Category: CatStruct,
			Slots: []Slot{
				{Name: "struct", Accepts: structOnly, Required: true},
				{Name: "field_id", Accepts: stringOnly, Required: true, Literal: true},
			},
			Output: OutputRule{Fixed: KindAny}},
	}
	m := make(map[string]OpSpec, len(specs))
	for _, s := range specs {
		m[s.Op] = s
	}
	return m
}()

func stringCmpSlots() []Slot {
	return []Slot{
		{Name: "left", Accepts: stringOnly, Required: true},
		{Name: "right", Accepts: stringOnly, Required: true},
	}
}

func orderedPair(kinds []Kind) []Slot {
	return []Slot{
		{Name: "left", Accepts: kinds, Required: true},
		{Name: "right", Accepts: kinds, Required: true},
	}
}

// Lookup returns the OpSpec for the given operation name. The second
// return value is false when the op is not in the catalog.
func Lookup(op string) (OpSpec, bool) {
	spec, ok := catalog[op]
	return spec, ok
}

// Ops returns the list of registered operation names (unordered). It is
// intended for diagnostics and frontend mirroring.
func Ops() []string {
	out := make([]string, 0, len(catalog))
	for op := range catalog {
		out = append(out, op)
	}
	return out
}
