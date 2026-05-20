// Package parameters implements ${params.NAME} substitution in pipeline node
// configs. The pipeline-level parameter list lives on Pipeline.Parameters;
// before previewing or executing a node, the handler calls Apply to produce
// a substituted copy of the node slice so transforms see resolved values
// instead of placeholder strings.
package parameters

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// ErrUnknownParameter is returned by Apply when a node references a
// `${params.NAME}` whose NAME is not defined on the pipeline.
var ErrUnknownParameter = errors.New("unknown parameter referenced")

var paramRefRe = regexp.MustCompile(`\$\{params\.([A-Za-z_][A-Za-z0-9_]*)\}`)

// Values maps parameter name → resolved value. The value is whatever the
// parameter's default_value JSON decodes to (string, float64, bool, ...).
// When the parameter has no default and is not overridden, the entry is
// absent and Apply will surface ErrUnknownParameter.
type Values map[string]any

// Resolve produces a Values map from the pipeline's parameter definitions,
// using each parameter's default_value as the resolved value. Type coercion
// is applied so the resulting map carries Go-native bool / int64 / float64
// for non-string parameters.
func Resolve(params []models.PipelineParameter) (Values, error) {
	out := make(Values, len(params))
	for _, param := range params {
		if len(param.DefaultValue) == 0 || string(param.DefaultValue) == "null" {
			if param.Required {
				return nil, fmt.Errorf("parameter %q: required parameter has no default value", param.Name)
			}
			continue
		}
		value, err := decodeParameterValue(param)
		if err != nil {
			return nil, err
		}
		out[param.Name] = value
	}
	return out, nil
}

// Override returns a copy of base with the entries in overrides applied on
// top. Useful when a run trigger passes per-execution overrides.
func Override(base Values, overrides Values) Values {
	out := make(Values, len(base)+len(overrides))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range overrides {
		out[k] = v
	}
	return out
}

// Apply walks every node's config and replaces ${params.NAME} occurrences
// with the value from `values`. String values that are exactly equal to a
// single ${params.NAME} reference are replaced with the typed value so a
// boolean parameter remains a boolean in JSON, not the string "true".
// Mixed-content strings are formatted with %v.
//
// The returned slice is a deep copy — the input nodes are not mutated.
func Apply(nodes []models.PipelineNode, values Values) ([]models.PipelineNode, error) {
	if len(nodes) == 0 {
		return nodes, nil
	}
	out := make([]models.PipelineNode, len(nodes))
	for index, node := range nodes {
		clone := node
		clone.DependsOn = append([]string(nil), node.DependsOn...)
		clone.InputDatasetIDs = append([]uuid.UUID(nil), node.InputDatasetIDs...)
		next, err := substituteConfig(node.Config, values)
		if err != nil {
			return nil, fmt.Errorf("node %q: %w", node.ID, err)
		}
		clone.Config = next
		out[index] = clone
	}
	return out, nil
}

// substituteConfig substitutes ${params.X} references inside a JSON-encoded
// config blob. Returns the re-encoded RawMessage; if there are no parameter
// references it returns the original payload unchanged.
func substituteConfig(raw json.RawMessage, values Values) (json.RawMessage, error) {
	if len(raw) == 0 {
		return raw, nil
	}
	var decoded any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		// Treat malformed config as opaque — runners surface the parse error.
		return raw, nil
	}
	substituted, err := substituteValue(decoded, values)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(substituted)
	if err != nil {
		return nil, fmt.Errorf("re-encode config: %w", err)
	}
	return encoded, nil
}

// References extracts every distinct `${params.NAME}` reference from the
// node configs. Used by the validator to surface unresolved references
// without running substitution.
func References(nodes []models.PipelineNode) []string {
	seen := map[string]struct{}{}
	var collect func(value any)
	collect = func(value any) {
		switch v := value.(type) {
		case string:
			for _, match := range paramRefRe.FindAllStringSubmatch(v, -1) {
				seen[match[1]] = struct{}{}
			}
		case map[string]any:
			for _, sub := range v {
				collect(sub)
			}
		case []any:
			for _, sub := range v {
				collect(sub)
			}
		}
	}
	for _, node := range nodes {
		if len(node.Config) == 0 {
			continue
		}
		var decoded any
		if err := json.Unmarshal(node.Config, &decoded); err != nil {
			continue
		}
		collect(decoded)
	}
	out := make([]string, 0, len(seen))
	for name := range seen {
		out = append(out, name)
	}
	return out
}

func substituteValue(value any, values Values) (any, error) {
	switch v := value.(type) {
	case string:
		return substituteString(v, values)
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, child := range v {
			sub, err := substituteValue(child, values)
			if err != nil {
				return nil, err
			}
			out[key] = sub
		}
		return out, nil
	case []any:
		out := make([]any, len(v))
		for index, child := range v {
			sub, err := substituteValue(child, values)
			if err != nil {
				return nil, err
			}
			out[index] = sub
		}
		return out, nil
	case json.RawMessage:
		// JSON raw → decode + recurse so we don't leave nested placeholders.
		var decoded any
		if err := json.Unmarshal(v, &decoded); err != nil {
			return v, nil
		}
		return substituteValue(decoded, values)
	}
	return value, nil
}

func substituteString(raw string, values Values) (any, error) {
	matches := paramRefRe.FindAllStringSubmatchIndex(raw, -1)
	if len(matches) == 0 {
		return raw, nil
	}
	// Single-reference case: replace with the typed value to preserve bool /
	// number semantics in JSON.
	if len(matches) == 1 && matches[0][0] == 0 && matches[0][1] == len(raw) {
		name := raw[matches[0][2]:matches[0][3]]
		value, ok := values[name]
		if !ok {
			return nil, fmt.Errorf("%w: ${params.%s}", ErrUnknownParameter, name)
		}
		return value, nil
	}
	var (
		buf  []byte
		last int
	)
	for _, match := range matches {
		name := raw[match[2]:match[3]]
		value, ok := values[name]
		if !ok {
			return nil, fmt.Errorf("%w: ${params.%s}", ErrUnknownParameter, name)
		}
		buf = append(buf, raw[last:match[0]]...)
		buf = append(buf, []byte(fmt.Sprintf("%v", value))...)
		last = match[1]
	}
	buf = append(buf, raw[last:]...)
	return string(buf), nil
}

func decodeParameterValue(param models.PipelineParameter) (any, error) {
	switch param.Type {
	case models.PipelineParameterTypeString:
		var v string
		if err := json.Unmarshal(param.DefaultValue, &v); err != nil {
			return nil, fmt.Errorf("parameter %q: default must be a JSON string", param.Name)
		}
		return v, nil
	case models.PipelineParameterTypeInteger:
		var v int64
		if err := json.Unmarshal(param.DefaultValue, &v); err != nil {
			// Tolerate strings of digits to be lenient on UI input.
			var s string
			if jerr := json.Unmarshal(param.DefaultValue, &s); jerr == nil {
				if parsed, perr := strconv.ParseInt(s, 10, 64); perr == nil {
					return parsed, nil
				}
			}
			return nil, fmt.Errorf("parameter %q: default must be a JSON integer", param.Name)
		}
		return v, nil
	case models.PipelineParameterTypeFloat:
		var v float64
		if err := json.Unmarshal(param.DefaultValue, &v); err != nil {
			return nil, fmt.Errorf("parameter %q: default must be a JSON number", param.Name)
		}
		return v, nil
	case models.PipelineParameterTypeBoolean:
		var v bool
		if err := json.Unmarshal(param.DefaultValue, &v); err != nil {
			return nil, fmt.Errorf("parameter %q: default must be a JSON boolean", param.Name)
		}
		return v, nil
	}
	return nil, fmt.Errorf("parameter %q: unknown type %q", param.Name, param.Type)
}
