package transforms

import (
	"encoding/json"
	"fmt"
	"strings"
)

// WorkshopTransformation is the declarative pipeline that backs a
// Workshop variable of kind "transformation". The steps are evaluated
// in declaration order; each step may reference variables, literals,
// or the output of any *earlier* step in the same transformation.
//
// `OutputKind` is populated by `ValidateTransformation` from the
// inferred kind of the final step so consumers (other transformations,
// widgets, the variable dependency graph) can resolve the variable's
// type without re-running the validator.
type WorkshopTransformation struct {
	Steps      []TransformStep `json:"steps"`
	OutputKind string          `json:"output_kind,omitempty"`
}

// TransformStep is one node in the transformation pipeline.
type TransformStep struct {
	ID     string         `json:"id"`
	Op     string         `json:"op"`
	Label  string         `json:"label,omitempty"`
	Inputs map[string]any `json:"inputs,omitempty"`
}

// StepInput is the JSON shape of a single value supplied to a slot.
// For variadic slots the JSON value is an array of StepInput entries.
type StepInput struct {
	Kind      string          `json:"kind"`
	Value     json.RawMessage `json:"value,omitempty"`
	ValueKind string          `json:"value_kind,omitempty"`
	Ref       string          `json:"ref,omitempty"`
}

// VariableKindResolver looks up the Kind of a referenced variable. It
// returns (KindUnknown, false) when the variable is not registered in
// the module — the validator surfaces this as an `unknown_variable_ref`
// error.
type VariableKindResolver func(variableID string) (Kind, bool)

// ValidationError is the structured error returned by the validator.
// The path is dotted (e.g. `transformation.steps[2].inputs.value`) and
// the code is a stable machine-readable identifier so frontend tooling
// can highlight the offending node.
type ValidationError struct {
	Code    string `json:"code"`
	Path    string `json:"path,omitempty"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	if e == nil {
		return ""
	}
	if e.Path == "" {
		return e.Message
	}
	return e.Path + ": " + e.Message
}

func newErr(code, path, msg string) *ValidationError {
	return &ValidationError{Code: code, Path: path, Message: msg}
}

// ValidateTransformation walks the steps of a transformation and
// returns the inferred output Kind of the final step. The first
// validation issue aborts evaluation with a *ValidationError.
//
// `basePath` is the prefix used in error paths so callers can embed the
// transformation inside a larger document (e.g. `settings.workshop_variables[3].transformation`).
func ValidateTransformation(t *WorkshopTransformation, resolver VariableKindResolver, basePath string) (Kind, error) {
	if t == nil {
		return KindUnknown, newErr("missing_transformation", basePath, "transformation is required")
	}
	if len(t.Steps) == 0 {
		return KindUnknown, newErr("empty_transformation", basePath+".steps", "at least one step is required")
	}
	stepKinds := make(map[string]Kind, len(t.Steps))
	var lastKind Kind = KindUnknown
	for i, step := range t.Steps {
		stepPath := fmt.Sprintf("%s.steps[%d]", basePath, i)
		if strings.TrimSpace(step.ID) == "" {
			return KindUnknown, newErr("missing_step_id", stepPath+".id", "step id is required")
		}
		if _, dup := stepKinds[step.ID]; dup {
			return KindUnknown, newErr("duplicate_step_id", stepPath+".id",
				fmt.Sprintf("duplicate step id %q", step.ID))
		}
		spec, ok := Lookup(step.Op)
		if !ok {
			return KindUnknown, newErr("unknown_op", stepPath+".op",
				fmt.Sprintf("unsupported transformation op %q", step.Op))
		}
		out, err := validateStep(spec, step, stepPath, stepKinds, resolver)
		if err != nil {
			return KindUnknown, err
		}
		stepKinds[step.ID] = out
		lastKind = out
	}
	return lastKind, nil
}

func validateStep(spec OpSpec, step TransformStep, stepPath string, prev map[string]Kind, resolver VariableKindResolver) (Kind, error) {
	declared := make(map[string]Slot, len(spec.Slots))
	for _, s := range spec.Slots {
		declared[s.Name] = s
	}

	for name := range step.Inputs {
		if _, ok := declared[name]; !ok {
			return KindUnknown, newErr("unknown_input",
				fmt.Sprintf("%s.inputs.%s", stepPath, name),
				fmt.Sprintf("op %q does not accept input %q", spec.Op, name))
		}
	}

	resolvedSlot := make(map[string]Kind)
	resolvedLiteral := make(map[string]string)

	for _, slot := range spec.Slots {
		slotPath := fmt.Sprintf("%s.inputs.%s", stepPath, slot.Name)
		rawVal, present := step.Inputs[slot.Name]
		if !present {
			if slot.Required {
				return KindUnknown, newErr("missing_input", slotPath, "input is required")
			}
			continue
		}
		entries, err := parseSlotEntries(rawVal, slot, slotPath)
		if err != nil {
			return KindUnknown, err
		}
		for idx, entry := range entries {
			entryPath := slotPath
			if slot.Variadic {
				entryPath = fmt.Sprintf("%s[%d]", slotPath, idx)
			}
			if slot.Literal && entry.Kind != "literal" {
				return KindUnknown, newErr("non_literal_input",
					entryPath+".kind",
					fmt.Sprintf("slot %q must be supplied as a literal", slot.Name))
			}
			kind, err := resolveInputKind(entry, prev, resolver, entryPath)
			if err != nil {
				return KindUnknown, err
			}
			if len(slot.Accepts) > 0 && !acceptsKind(slot.Accepts, kind) {
				return KindUnknown, newErr("kind_mismatch", entryPath,
					fmt.Sprintf("slot %q expects %v, got %s", slot.Name, slot.Accepts, kind))
			}
			if entry.Kind == "literal" && len(slot.LiteralChoices) > 0 {
				if err := checkLiteralChoice(entry.Value, slot.LiteralChoices, entryPath); err != nil {
					return KindUnknown, err
				}
				if _, exists := resolvedLiteral[slot.Name]; !exists {
					var s string
					_ = json.Unmarshal(entry.Value, &s)
					resolvedLiteral[slot.Name] = s
				}
			}
			if _, exists := resolvedSlot[slot.Name]; !exists {
				resolvedSlot[slot.Name] = kind
			}
		}
	}

	out := spec.Output
	switch {
	case out.Fixed != "":
		return out.Fixed, nil
	case out.FromSlot != "":
		if k, ok := resolvedSlot[out.FromSlot]; ok && k != KindUnknown {
			return k, nil
		}
		return KindUnknown, nil
	case out.FromLiteralKind != "":
		if k, ok := resolvedLiteral[out.FromLiteralKind]; ok {
			return Kind(k), nil
		}
		return KindUnknown, nil
	case out.ArrayElement != "":
		return KindAny, nil
	default:
		return KindUnknown, nil
	}
}

func acceptsKind(accepts []Kind, got Kind) bool {
	for _, a := range accepts {
		if Compatible(got, a) {
			return true
		}
	}
	return false
}

func parseSlotEntries(raw any, slot Slot, path string) ([]StepInput, error) {
	bytes, err := json.Marshal(raw)
	if err != nil {
		return nil, newErr("invalid_input", path, "input must be JSON-encodable")
	}
	if slot.Variadic {
		var entries []StepInput
		if err := json.Unmarshal(bytes, &entries); err != nil {
			return nil, newErr("invalid_input", path,
				fmt.Sprintf("variadic slot %q must be an array of inputs", slot.Name))
		}
		if slot.Required && len(entries) == 0 {
			return nil, newErr("missing_input", path,
				"variadic slot must have at least one entry")
		}
		return entries, nil
	}
	var entry StepInput
	if err := json.Unmarshal(bytes, &entry); err != nil {
		return nil, newErr("invalid_input", path, "input must be an object")
	}
	return []StepInput{entry}, nil
}

func resolveInputKind(entry StepInput, prev map[string]Kind, resolver VariableKindResolver, path string) (Kind, error) {
	switch entry.Kind {
	case "literal":
		if entry.ValueKind != "" {
			return Kind(entry.ValueKind), nil
		}
		return inferLiteralKind(entry.Value), nil
	case "variable":
		if strings.TrimSpace(entry.Ref) == "" {
			return KindUnknown, newErr("missing_ref", path+".ref", "variable ref is required")
		}
		if resolver == nil {
			return KindUnknown, nil
		}
		k, ok := resolver(entry.Ref)
		if !ok {
			return KindUnknown, newErr("unknown_variable_ref", path+".ref",
				fmt.Sprintf("variable %q does not exist", entry.Ref))
		}
		return k, nil
	case "step":
		if strings.TrimSpace(entry.Ref) == "" {
			return KindUnknown, newErr("missing_ref", path+".ref", "step ref is required")
		}
		k, ok := prev[entry.Ref]
		if !ok {
			return KindUnknown, newErr("unknown_step_ref", path+".ref",
				fmt.Sprintf("step %q is not defined earlier in the transformation", entry.Ref))
		}
		return k, nil
	case "":
		return KindUnknown, newErr("missing_input_kind", path+".kind",
			"input kind is required (literal|variable|step)")
	default:
		return KindUnknown, newErr("unsupported_input_kind", path+".kind",
			fmt.Sprintf("input kind %q is not supported (use literal|variable|step)", entry.Kind))
	}
}

func inferLiteralKind(raw json.RawMessage) Kind {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return KindUnknown
	}
	switch s[0] {
	case '"':
		return KindString
	case 't', 'f':
		return KindBoolean
	case '[':
		return KindArray
	case '{':
		return KindStruct
	case '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
		return KindNumber
	}
	return KindUnknown
}

func checkLiteralChoice(raw json.RawMessage, choices []string, path string) error {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return newErr("invalid_literal", path+".value",
			"literal value must be a string for this slot")
	}
	for _, c := range choices {
		if c == s {
			return nil
		}
	}
	return newErr("invalid_literal_choice", path+".value",
		fmt.Sprintf("value %q must be one of %v", s, choices))
}
