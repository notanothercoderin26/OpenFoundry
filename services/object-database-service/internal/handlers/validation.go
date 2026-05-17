package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/openfoundry/openfoundry-go/libs/ontology-kernel/domain"
)

// PropertySchemaResolver is the contract for fetching a type's
// effective property schema at write time. The production
// implementation will hit ontology-definition-service over HTTP.
//
// Resolve returns the type's effective property definitions (direct +
// shared + interface, merged), or (nil, nil) when the resolver is
// not configured for this type — handlers then fall back to the
// lightweight built-in shape gate.
//
// TODO(of-1.2): wire a real client against ontology-definition-service
// once that service exposes a `GET /api/v1/ontology/types/{id}/effective-properties`
// endpoint. The current `/properties` route returns only the type's
// direct properties, not the merged effective set.
type PropertySchemaResolver interface {
	Resolve(ctx context.Context, objectTypeID string) ([]domain.EffectivePropertyDefinition, error)
}

// validateProperties enforces:
//
//  1. `props` is a JSON object (rejected when null / array / scalar).
//  2. When a resolver is wired, the full
//     [domain.ValidateObjectProperties] gate (unknown keys, required,
//     defaults, per-type shape).
//  3. When no resolver is wired, a minimal per-value shape check via
//     [domain.ValidatePropertyValue] — covers `string` / `integer` /
//     etc. without needing a schema. This catches the most common
//     wire-shape regressions (`"true"` for a bool, `42` for a string)
//     while staying decoupled from ontology-definition-service.
//
// Returns the normalised JSON payload that should be persisted.
func validateProperties(ctx context.Context, resolver PropertySchemaResolver, objectTypeID string, props map[string]any) (json.RawMessage, error) {
	if props == nil {
		props = map[string]any{}
	}
	payload, err := json.Marshal(props)
	if err != nil {
		return nil, fmt.Errorf("encode properties: %w", err)
	}
	if resolver != nil {
		defs, err := resolver.Resolve(ctx, objectTypeID)
		if err != nil {
			return nil, err
		}
		if len(defs) > 0 {
			normalised, err := domain.ValidateObjectProperties(defs, payload)
			if err != nil {
				return nil, err
			}
			return normalised, nil
		}
	}

	// Best-effort per-value JSON-shape gate. We don't know the
	// declared property_type without the schema, so we infer from the
	// value: bool / number / string / array / object. Reject anything
	// that round-trips to a JSON `null` for keys that are obviously
	// scalars (empty string is allowed — Foundry treats it as "blank").
	for name, raw := range props {
		if strings.TrimSpace(name) == "" {
			return nil, fmt.Errorf("property name must be non-empty")
		}
		encoded, err := json.Marshal(raw)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		inferred := inferPropertyType(raw)
		if inferred == "" {
			continue
		}
		if err := domain.ValidatePropertyValue(inferred, encoded); err != nil {
			return nil, fmt.Errorf("%s: %s", name, err.Error())
		}
	}
	return payload, nil
}

// inferPropertyType maps a Go-decoded JSON value to one of the
// canonical property_type tokens that [domain.ValidatePropertyValue]
// understands. Unknown shapes return "" so the caller skips the gate.
func inferPropertyType(v any) string {
	switch val := v.(type) {
	case nil:
		return ""
	case bool:
		return "boolean"
	case json.Number:
		if _, err := val.Int64(); err == nil {
			return "integer"
		}
		return "double"
	case float64:
		if val == float64(int64(val)) {
			return "integer"
		}
		return "double"
	case int, int32, int64, uint, uint32, uint64:
		return "integer"
	case string:
		return "string"
	case []any:
		return "array"
	case map[string]any:
		return ""
	default:
		return ""
	}
}
