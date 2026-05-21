package logicexec

import (
	"encoding/json"
	"strings"
)

// Block kinds Foundry's AIP Logic exposes
// (palantir.com/docs/foundry/logic/blocks). The PoC only requires
// use_llm + apply_action; the rest exist so we can fail closed with a
// clear "block kind not supported" log entry instead of silently
// skipping a block the author placed.
const (
	BlockKindUseLLM          = "use_llm"
	BlockKindApplyAction     = "apply_action"
	BlockKindExecuteFunction = "execute_function"
	BlockKindConditional     = "conditional"
	BlockKindLoop            = "loop"
	BlockKindCreateVariable  = "create_variable"
)

// Tool kinds available inside a use_llm block. Same taxonomy as the
// frontend's LogicToolKind (apps/web/src/lib/logic/blocks.ts).
const (
	ToolKindQueryObjects    = "query_objects"
	ToolKindApplyAction     = "apply_action"
	ToolKindExecuteFunction = "execute_function"
	ToolKindCalculator      = "calculator"
)

// Definition is the typed view of fn.Definition the executor walks.
// Anything Foundry's authoring UI does not emit yet (or that we have
// not modelled) lives in Raw so we can round-trip without data loss.
type Definition struct {
	Inputs  []InputDecl     `json:"inputs"`
	Outputs []OutputDecl    `json:"outputs"`
	Blocks  []Block         `json:"blocks"`
	Raw     json.RawMessage `json:"-"`
}

type InputDecl struct {
	APIName      string          `json:"apiName"`
	Type         string          `json:"type"`
	Required     bool            `json:"required"`
	DefaultValue json.RawMessage `json:"defaultValue,omitempty"`
}

type OutputDecl struct {
	APIName    string `json:"apiName"`
	Type       string `json:"type"`
	OutputType string `json:"outputType"`
	Source     string `json:"source"`
	Final      bool   `json:"final"`
	BlockID    string `json:"blockId"`
}

// Block carries the union of fields the executor reads across kinds.
// Tool-specific config sits in Tools; non-LLM blocks read their own
// fields (action id, function rid, condition expression, loop body).
type Block struct {
	ID                    string                 `json:"id"`
	Name                  string                 `json:"name"`
	Kind                  string                 `json:"kind"`
	SystemPrompt          string                 `json:"systemPrompt"`
	TaskPrompt            string                 `json:"taskPrompt"`
	ModelBinding          ModelBinding           `json:"modelBinding"`
	StructuredOutput      StructuredOutputConfig `json:"structuredOutput"`
	Tools                 []ToolConfig           `json:"toolAccess"`
	ActionTypeID          string                 `json:"actionTypeId"`
	FunctionRID           string                 `json:"functionRid"`
	ParameterMappings     map[string]any         `json:"parameterMappings"`
	InvocationMode        string                 `json:"invocationMode"`
	ConditionExpression   string                 `json:"conditionExpression"`
	BranchTrue            []Block                `json:"branchTrue"`
	BranchFalse           []Block                `json:"branchFalse"`
	IterableInput         string                 `json:"iterableInput"`
	Body                  []Block                `json:"body"`
	VariableName          string                 `json:"variableName"`
	VariableType          string                 `json:"variableType"`
	VariableValue         json.RawMessage        `json:"variableValue"`
	PromptVariableRefs    []string               `json:"promptVariableRefs"`
	MaxIterations         int32                  `json:"maxIterations"`
}

type ModelBinding struct {
	Mode                 string `json:"mode"`
	ProviderID           string `json:"providerId"`
	ModelVariableAPIName string `json:"modelVariableApiName"`
}

type StructuredOutputConfig struct {
	Kind       string          `json:"kind"`
	SchemaJSON json.RawMessage `json:"schemaJson"`
}

type ToolConfig struct {
	Kind               string         `json:"kind"`
	ObjectTypeID       string         `json:"objectTypeId"`
	ActionTypeID       string         `json:"actionTypeId"`
	FunctionRID        string         `json:"functionRid"`
	Expression         string         `json:"expression"`
	SelectedProperties []string       `json:"selectedProperties"`
	ParameterMappings  map[string]any `json:"parameterMappings"`
	MaxObjects         int32          `json:"maxObjects"`
	InvocationMode     string         `json:"invocationMode"`
}

// parseDefinition decodes fn.Definition. We tolerate snake_case + the
// "type"/"kind" alias the TS schema sometimes emits — the frontend's
// versionStringField helper accepts the same alternates.
func parseDefinition(raw json.RawMessage) (*Definition, error) {
	if len(raw) == 0 {
		return &Definition{Raw: raw}, nil
	}
	var loose map[string]json.RawMessage
	if err := json.Unmarshal(raw, &loose); err != nil {
		return nil, err
	}
	d := &Definition{Raw: raw}
	if blob, ok := loose["inputs"]; ok {
		_ = json.Unmarshal(blob, &d.Inputs)
	}
	if blob, ok := loose["outputs"]; ok {
		_ = json.Unmarshal(blob, &d.Outputs)
	}
	if blob, ok := loose["blocks"]; ok {
		blocks, err := decodeBlocks(blob)
		if err != nil {
			return nil, err
		}
		d.Blocks = blocks
	}
	return d, nil
}

// decodeBlocks normalises field-name variants (block_type / blockType
// / type / kind) before unmarshalling so the executor never has to
// branch on alias keys.
func decodeBlocks(raw json.RawMessage) ([]Block, error) {
	var rawBlocks []map[string]any
	if err := json.Unmarshal(raw, &rawBlocks); err != nil {
		return nil, err
	}
	out := make([]Block, 0, len(rawBlocks))
	for _, m := range rawBlocks {
		normaliseBlockKind(m)
		blob, err := json.Marshal(m)
		if err != nil {
			return nil, err
		}
		var block Block
		if err := json.Unmarshal(blob, &block); err != nil {
			return nil, err
		}
		out = append(out, block)
	}
	return out, nil
}

func normaliseBlockKind(m map[string]any) {
	for _, key := range []string{"block_type", "blockType", "type"} {
		if v, ok := m[key].(string); ok && v != "" {
			if _, alreadyHasKind := m["kind"]; !alreadyHasKind {
				m["kind"] = v
			}
		}
	}
	if v, ok := m["kind"].(string); ok {
		m["kind"] = strings.ToLower(strings.TrimSpace(v))
	}
}

// finalOutputs returns the outputs that drive what the caller sees.
// If the author marked one or more outputs as `final`, those win;
// otherwise every declared output is final (matches the TS author
// validation in apps/web/src/lib/logic/blocks.ts).
func (d *Definition) finalOutputs() []OutputDecl {
	finals := make([]OutputDecl, 0, len(d.Outputs))
	for _, o := range d.Outputs {
		if o.Final {
			finals = append(finals, o)
		}
	}
	if len(finals) == 0 {
		return d.Outputs
	}
	return finals
}
