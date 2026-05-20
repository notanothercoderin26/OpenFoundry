package models

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// PipelineParameterType enumerates the value types a parameter can take.
// Mirrors Foundry's parameter type set.
type PipelineParameterType string

const (
	PipelineParameterTypeString  PipelineParameterType = "string"
	PipelineParameterTypeInteger PipelineParameterType = "integer"
	PipelineParameterTypeFloat   PipelineParameterType = "float"
	PipelineParameterTypeBoolean PipelineParameterType = "boolean"
)

func (t PipelineParameterType) Valid() bool {
	switch t {
	case PipelineParameterTypeString, PipelineParameterTypeInteger, PipelineParameterTypeFloat, PipelineParameterTypeBoolean:
		return true
	}
	return false
}

// PipelineParameter is the wire shape of a single reusable parameter on the
// pipeline. The name must match `^[A-Za-z_][A-Za-z0-9_]*$` so it can appear
// inside `${params.NAME}` references without collision with shell syntax.
type PipelineParameter struct {
	Name         string                `json:"name"`
	Type         PipelineParameterType `json:"type"`
	DefaultValue json.RawMessage       `json:"default_value,omitempty"`
	Description  string                `json:"description,omitempty"`
	Required     bool                  `json:"required,omitempty"`
}

// ValidatePipelineParameters checks for duplicate names, well-formed names,
// and a known type per entry. Used by the authoring handlers before
// persisting.
func ValidatePipelineParameters(params []PipelineParameter) error {
	seen := make(map[string]struct{}, len(params))
	for index, param := range params {
		name := strings.TrimSpace(param.Name)
		if name == "" {
			return fmt.Errorf("parameter %d: name is required", index)
		}
		if !isParameterNameValid(name) {
			return fmt.Errorf("parameter %q: name must match [A-Za-z_][A-Za-z0-9_]*", name)
		}
		if _, dup := seen[name]; dup {
			return fmt.Errorf("parameter %q: duplicate name", name)
		}
		seen[name] = struct{}{}
		if !param.Type.Valid() {
			return fmt.Errorf("parameter %q: unknown type %q", name, param.Type)
		}
	}
	return nil
}

// ParsePipelineParameters decodes a JSON array of parameters. An empty or
// null payload returns nil, nil.
func ParsePipelineParameters(raw json.RawMessage) ([]PipelineParameter, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var out []PipelineParameter
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode parameters: %w", err)
	}
	if err := ValidatePipelineParameters(out); err != nil {
		return nil, err
	}
	return out, nil
}

// ErrParameterNameInvalid is returned when a referenced parameter name does
// not match the validation rules.
var ErrParameterNameInvalid = errors.New("parameter name invalid")

func isParameterNameValid(name string) bool {
	if name == "" {
		return false
	}
	for index, r := range name {
		if index == 0 {
			if !isAlpha(r) && r != '_' {
				return false
			}
			continue
		}
		if !isAlpha(r) && !isDigit(r) && r != '_' {
			return false
		}
	}
	return true
}

func isAlpha(r rune) bool { return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') }
func isDigit(r rune) bool { return r >= '0' && r <= '9' }
