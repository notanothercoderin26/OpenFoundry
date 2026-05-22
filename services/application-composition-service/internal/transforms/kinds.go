package transforms

// Kind is a Workshop variable / value kind used by the transformation
// catalog and the validation layer. The values mirror the kinds used by
// `WorkshopVariable.Kind` (and the frontend `WorkshopVariableKind`),
// normalized to a single spelling. The legacy alias `numeric` is mapped
// to `number` so the catalog has a single canonical numeric kind.
type Kind string

const (
	KindString    Kind = "string"
	KindNumber    Kind = "number"
	KindBoolean   Kind = "boolean"
	KindDate      Kind = "date"
	KindTimestamp Kind = "timestamp"
	KindGeoPoint  Kind = "geopoint"
	KindGeoShape  Kind = "geoshape"
	KindArray     Kind = "array"
	KindStruct    Kind = "struct"
	KindObjectSet Kind = "object_set"
	KindObjectRef Kind = "object_ref"
	// KindAny is a wildcard accepted by polymorphic operations.
	KindAny Kind = "any"
	// KindUnknown is used when a referenced variable's kind cannot be
	// determined (e.g. function output without declared type). The
	// validator treats it as compatible with any slot to avoid false
	// negatives in early-development modules.
	KindUnknown Kind = "unknown"
)

// NormalizeVariableKind maps the various spellings of a WorkshopVariable
// kind onto the canonical Kind used by the transformation catalog. The
// second return value is false when the variable kind has no transform
// representation (e.g. `object_set_filter`, `scenario`); the validator
// then treats the variable as KindUnknown.
func NormalizeVariableKind(variableKind string) (Kind, bool) {
	switch variableKind {
	case "string", "url_parameter", "runtime_parameter":
		return KindString, true
	case "number", "numeric", "integer", "float", "double":
		return KindNumber, true
	case "boolean", "bool":
		return KindBoolean, true
	case "date":
		return KindDate, true
	case "timestamp":
		return KindTimestamp, true
	case "geopoint":
		return KindGeoPoint, true
	case "geoshape":
		return KindGeoShape, true
	case "array":
		return KindArray, true
	case "struct":
		return KindStruct, true
	case "object_set":
		return KindObjectSet, true
	case "object_set_active_object", "object_ref":
		return KindObjectRef, true
	case "object_set_selection":
		return KindArray, true
	case "transformation", "function_output", "aggregation":
		// Output kind is declared on the variable itself via metadata.
		// The validator resolves these via the per-variable kind map,
		// not via this helper.
		return KindUnknown, false
	default:
		return KindUnknown, false
	}
}

// Compatible reports whether a value of `have` may be used in a slot
// that accepts `want`. KindAny and KindUnknown are wildcards in both
// directions. KindArray slots are compatible regardless of element kind
// — element-kind checks belong in the runtime layer.
func Compatible(have, want Kind) bool {
	if want == KindAny || have == KindAny {
		return true
	}
	if have == KindUnknown {
		return true
	}
	return have == want
}
