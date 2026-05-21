package logicexec

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/react"
)

// DefaultMaxToolCalls bounds the ReAct loop inside one use_llm block.
// AIP Logic in Foundry has a similar safety net so a misbehaving LLM
// cannot burn the user's compute budget — we match that with an
// explicit guard rather than relying on the LLM stopping itself.
const DefaultMaxToolCalls = 8

// DefaultExecutionBudget bounds wall-clock per Logic invocation. The
// inbound /invoke handler has its own context deadline; this is the
// belt to the handler's braces.
const DefaultExecutionBudget = 90 * time.Second

// HTTPExecutor is the production Executor. It reuses
// internal/react.HTTPLLMClient and HTTPToolRouter so we never have a
// second implementation of "talk to llm-catalog / object-database /
// ontology-actions" to keep in sync.
type HTTPExecutor struct {
	LLM             react.LLMClient
	Tools           react.ToolRouter
	Now             func() time.Time
	MaxToolCalls    int
	ExecutionBudget time.Duration
}

// NewHTTPExecutor builds an executor with sane defaults. The caller
// is expected to set LLM and Tools (typically the same instances
// already wired for Threads — see cmd/agent-runtime-service/main.go).
func NewHTTPExecutor(llm react.LLMClient, tools react.ToolRouter) *HTTPExecutor {
	return &HTTPExecutor{
		LLM:             llm,
		Tools:           tools,
		MaxToolCalls:    DefaultMaxToolCalls,
		ExecutionBudget: DefaultExecutionBudget,
	}
}

// Execute walks the Logic function's blocks and returns the final
// outputs + a per-step log. Errors at the block level are converted
// into a "failed" Result with an ErrorMessage, not bubbled to the
// caller — the run row must always persist so the operator can see
// what went wrong.
func (e *HTTPExecutor) Execute(ctx context.Context, in Input) (*Result, error) {
	if e.LLM == nil {
		return nil, errors.New("logicexec.HTTPExecutor: LLM client is nil")
	}
	if e.Tools == nil {
		return nil, errors.New("logicexec.HTTPExecutor: tool router is nil")
	}
	now := e.Now
	if now == nil {
		now = time.Now
	}
	budget := e.ExecutionBudget
	if budget <= 0 {
		budget = DefaultExecutionBudget
	}
	maxToolCalls := e.MaxToolCalls
	if maxToolCalls <= 0 {
		maxToolCalls = DefaultMaxToolCalls
	}

	start := now()
	// Deadline is always derived from real wall-clock — a fake Now()
	// only drives log timestamps. Otherwise injecting a fixed time
	// in tests would push the deadline into the past and cancel the
	// run before the first LLM call.
	ctx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()

	definition, err := parseDefinition(in.Function.Definition)
	if err != nil {
		return failureResult(now(), start, fmt.Errorf("parse definition: %w", err)), nil
	}

	inputs := decodeInputs(in.Inputs)
	state := &execState{
		inputs:       inputs,
		variables:    map[string]any{},
		blockOutputs: map[string]any{},
		logs:         make([]LogEntry, 0, 8),
		now:          now,
		callerJWT:    in.CallerJWT,
		maxToolCalls: maxToolCalls,
		llm:          e.LLM,
		tools:        e.Tools,
	}

	for _, block := range definition.Blocks {
		if ctx.Err() != nil {
			return failureResult(now(), start, ctx.Err()), nil
		}
		state.appendLog(LogEntry{
			Timestamp: state.now().UTC().Format(time.RFC3339Nano),
			Block:     block.Name,
			BlockKind: block.Kind,
			Event:     "block_enter",
		})
		if err := state.runBlock(ctx, &block); err != nil {
			state.appendLog(LogEntry{
				Timestamp: state.now().UTC().Format(time.RFC3339Nano),
				Block:     block.Name,
				BlockKind: block.Kind,
				Event:     "block_error",
				Detail:    mustJSON(map[string]string{"error": err.Error()}),
			})
			return failureWithLogs(now(), start, state, err), nil
		}
		state.appendLog(LogEntry{
			Timestamp: state.now().UTC().Format(time.RFC3339Nano),
			Block:     block.Name,
			BlockKind: block.Kind,
			Event:     "block_exit",
		})
	}

	outputs := projectOutputs(definition.finalOutputs(), state)
	end := now()
	return &Result{
		Status:           "succeeded",
		Outputs:          mustJSON(outputs),
		Logs:             mustJSON(state.logs),
		DurationMS:       int32(end.Sub(start) / time.Millisecond),
		PromptTokens:     state.promptTokens,
		CompletionTokens: state.completionTokens,
	}, nil
}

// execState holds the per-invocation mutable state the block walker
// threads through: input parameters, declared variables, per-block
// output captures, the running step log, and the token usage rolled
// up across LLM calls.
type execState struct {
	inputs           map[string]any
	variables        map[string]any
	blockOutputs     map[string]any
	logs             []LogEntry
	now              func() time.Time
	callerJWT        string
	maxToolCalls     int
	llm              react.LLMClient
	tools            react.ToolRouter
	promptTokens     int32
	completionTokens int32
}

func (s *execState) symbolTable() map[string]any {
	out := make(map[string]any, len(s.inputs)+len(s.variables)+len(s.blockOutputs))
	for k, v := range s.inputs {
		out[k] = v
	}
	for k, v := range s.variables {
		out[k] = v
	}
	for k, v := range s.blockOutputs {
		out[k] = v
	}
	return out
}

func (s *execState) appendLog(entry LogEntry) {
	s.logs = append(s.logs, entry)
}

func (s *execState) runBlock(ctx context.Context, block *Block) error {
	switch block.Kind {
	case BlockKindUseLLM:
		return s.runLLMBlock(ctx, block)
	case BlockKindApplyAction:
		return s.runApplyActionBlock(ctx, block)
	case BlockKindExecuteFunction:
		return s.runExecuteFunctionBlock(ctx, block)
	case BlockKindCreateVariable:
		return s.runCreateVariableBlock(block)
	case BlockKindConditional:
		return s.runConditionalBlock(ctx, block)
	case BlockKindLoop:
		return s.runLoopBlock(ctx, block)
	default:
		return fmt.Errorf("unsupported block kind %q", block.Kind)
	}
}

// runLLMBlock executes a use_llm block. Tools declared in toolAccess
// become a manifest the LLM sees; tool calls dispatch through the
// shared HTTPToolRouter (ontology-query, ontology-actions, function
// runtime) propagating the invoker's JWT verbatim.
func (s *execState) runLLMBlock(ctx context.Context, block *Block) error {
	modelRID, err := resolveModelRID(block, s.symbolTable())
	if err != nil {
		return err
	}
	systemPrompt := renderTemplate(block.SystemPrompt, s.symbolTable())
	taskPrompt := renderTemplate(block.TaskPrompt, s.symbolTable())

	messages := make([]react.LLMMessage, 0, 4)
	if systemPrompt != "" {
		messages = append(messages, react.LLMMessage{Role: "system", Content: systemPrompt})
	}
	if taskPrompt != "" {
		messages = append(messages, react.LLMMessage{Role: "user", Content: taskPrompt})
	}
	if len(messages) == 0 {
		return fmt.Errorf("use_llm block %q has no prompt", block.Name)
	}

	tools, toolDefs := buildToolManifest(block.Tools)

	for step := 0; step < s.maxToolCalls; step++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		resp, err := s.llm.Invoke(ctx, s.callerJWT, react.LLMInvocation{
			ModelRID: modelRID,
			Messages: messages,
			Tools:    tools,
		})
		if err != nil {
			return fmt.Errorf("llm invoke: %w", err)
		}
		s.promptTokens += resp.PromptTokens
		s.completionTokens += resp.CompletionTokens
		if resp.ToolCall == nil {
			s.appendLog(LogEntry{
				Timestamp: s.now().UTC().Format(time.RFC3339Nano),
				Block:     block.Name,
				BlockKind: block.Kind,
				Event:     "llm_final",
				Detail:    mustJSON(map[string]any{"content": resp.Final}),
			})
			s.blockOutputs[block.ID] = resp.Final
			if block.Name != "" {
				s.blockOutputs[block.Name] = resp.Final
			}
			return nil
		}

		observation, observationErr := s.dispatchTool(ctx, block, resp.ToolCall, toolDefs)
		s.appendLog(LogEntry{
			Timestamp: s.now().UTC().Format(time.RFC3339Nano),
			Block:     block.Name,
			BlockKind: block.Kind,
			Event:     "tool_call",
			Tool:      resp.ToolCall.Name,
			Detail:    mustJSON(map[string]any{"arguments": json.RawMessage(resp.ToolCall.Arguments)}),
		})
		s.appendLog(LogEntry{
			Timestamp: s.now().UTC().Format(time.RFC3339Nano),
			Block:     block.Name,
			BlockKind: block.Kind,
			Event:     "tool_observation",
			Tool:      resp.ToolCall.Name,
			Detail:    mustJSON(map[string]any{"observation": json.RawMessage(observation)}),
		})

		messages = append(messages,
			react.LLMMessage{Role: "assistant", Content: string(mustJSON(resp.ToolCall))},
			react.LLMMessage{Role: "tool", Content: string(observation), ToolName: resp.ToolCall.Name},
		)
		if observationErr != nil {
			// Tool errors do not abort the loop — the LLM gets to see
			// the observation and can recover (matches the Foundry
			// behaviour where an action that errors surfaces as a
			// tool observation rather than crashing the run).
			continue
		}
	}
	return fmt.Errorf("use_llm block %q exhausted tool-call budget (%d)", block.Name, s.maxToolCalls)
}

// dispatchTool maps a Foundry LogicToolKind (the frontend names) to a
// react.ToolDefinition (Foundry runtime ToolKind), then delegates to
// the shared router. Calculator stays in-process because it is a pure
// expression eval with no need to leave the service.
func (s *execState) dispatchTool(ctx context.Context, block *Block, call *react.LLMToolCall, toolDefs map[string]ToolConfig) (json.RawMessage, error) {
	cfg, ok := toolDefs[call.Name]
	if !ok {
		return json.RawMessage(fmt.Sprintf(`{"error":"unknown tool %q"}`, call.Name)), fmt.Errorf("unknown tool %q", call.Name)
	}
	switch cfg.Kind {
	case ToolKindQueryObjects:
		def := models.ToolDefinition{
			Name: call.Name,
			Kind: models.ToolKindObjectQuery,
			Config: mustJSON(map[string]any{
				"type_id": cfg.ObjectTypeID,
			}),
		}
		return s.tools.Invoke(ctx, s.callerJWT, def, call.Arguments)
	case ToolKindApplyAction:
		def := models.ToolDefinition{
			Name: call.Name,
			Kind: models.ToolKindAction,
			Config: mustJSON(map[string]any{
				"action_id": cfg.ActionTypeID,
			}),
		}
		args := call.Arguments
		if len(cfg.ParameterMappings) > 0 {
			args = mustJSON(resolveParameterMappings(cfg.ParameterMappings, s.symbolTable()))
		}
		return s.tools.Invoke(ctx, s.callerJWT, def, args)
	case ToolKindExecuteFunction:
		def := models.ToolDefinition{
			Name: call.Name,
			Kind: models.ToolKindFunction,
			Config: mustJSON(map[string]any{
				"function_rid": cfg.FunctionRID,
			}),
		}
		args := call.Arguments
		if len(cfg.ParameterMappings) > 0 {
			args = mustJSON(resolveParameterMappings(cfg.ParameterMappings, s.symbolTable()))
		}
		return s.tools.Invoke(ctx, s.callerJWT, def, args)
	case ToolKindCalculator:
		var args map[string]any
		if len(call.Arguments) > 0 {
			_ = json.Unmarshal(call.Arguments, &args)
		}
		inputs := s.symbolTable()
		for k, v := range args {
			inputs[k] = v
		}
		value, err := evaluateCalculator(cfg.Expression, inputs)
		if err != nil {
			return mustJSON(map[string]string{"error": err.Error()}), err
		}
		return mustJSON(map[string]float64{"result": value}), nil
	default:
		_ = block
		return json.RawMessage(fmt.Sprintf(`{"error":"unsupported tool kind %q"}`, cfg.Kind)), fmt.Errorf("unsupported tool kind %q", cfg.Kind)
	}
}

// runApplyActionBlock invokes ontology-actions-service directly,
// without an LLM intermediary. Foundry's "Apply action block allows
// you to deterministically call actions without having to go via an
// LLM block" maps to this path.
func (s *execState) runApplyActionBlock(ctx context.Context, block *Block) error {
	if block.ActionTypeID == "" {
		return fmt.Errorf("apply_action block %q missing actionTypeId", block.Name)
	}
	args := resolveParameterMappings(block.ParameterMappings, s.symbolTable())
	def := models.ToolDefinition{
		Name: block.Name,
		Kind: models.ToolKindAction,
		Config: mustJSON(map[string]any{
			"action_id": block.ActionTypeID,
		}),
	}
	body, err := s.tools.Invoke(ctx, s.callerJWT, def, mustJSON(args))
	if err != nil {
		return fmt.Errorf("apply action %s: %w", block.ActionTypeID, err)
	}
	s.appendLog(LogEntry{
		Timestamp: s.now().UTC().Format(time.RFC3339Nano),
		Block:     block.Name,
		BlockKind: block.Kind,
		Event:     "action_applied",
		Tool:      block.ActionTypeID,
		Detail:    mustJSON(map[string]any{"response": json.RawMessage(body)}),
	})
	s.blockOutputs[block.ID] = json.RawMessage(body)
	if block.Name != "" {
		s.blockOutputs[block.Name] = json.RawMessage(body)
	}
	return nil
}

// runExecuteFunctionBlock invokes another Logic function by RID,
// effectively a Logic→Logic call. We do NOT recurse inside the
// executor — we delegate to the configured function runtime so the
// recursion guard lives in one place (the agent-runtime function
// invoke handler).
func (s *execState) runExecuteFunctionBlock(ctx context.Context, block *Block) error {
	if block.FunctionRID == "" {
		return fmt.Errorf("execute_function block %q missing functionRid", block.Name)
	}
	args := resolveParameterMappings(block.ParameterMappings, s.symbolTable())
	def := models.ToolDefinition{
		Name: block.Name,
		Kind: models.ToolKindFunction,
		Config: mustJSON(map[string]any{
			"function_rid": block.FunctionRID,
		}),
	}
	body, err := s.tools.Invoke(ctx, s.callerJWT, def, mustJSON(args))
	if err != nil {
		return fmt.Errorf("execute function %s: %w", block.FunctionRID, err)
	}
	s.appendLog(LogEntry{
		Timestamp: s.now().UTC().Format(time.RFC3339Nano),
		Block:     block.Name,
		BlockKind: block.Kind,
		Event:     "function_executed",
		Tool:      block.FunctionRID,
		Detail:    mustJSON(map[string]any{"response": json.RawMessage(body)}),
	})
	s.blockOutputs[block.ID] = json.RawMessage(body)
	if block.Name != "" {
		s.blockOutputs[block.Name] = json.RawMessage(body)
	}
	return nil
}

// runCreateVariableBlock binds a literal (or interpolated) value into
// the variables table so later blocks can reference it by name.
func (s *execState) runCreateVariableBlock(block *Block) error {
	if block.VariableName == "" {
		return fmt.Errorf("create_variable block %q missing variableName", block.Name)
	}
	var value any
	if len(block.VariableValue) > 0 {
		if err := json.Unmarshal(block.VariableValue, &value); err != nil {
			return fmt.Errorf("create_variable %s: invalid value: %w", block.VariableName, err)
		}
	}
	s.variables[block.VariableName] = value
	s.appendLog(LogEntry{
		Timestamp: s.now().UTC().Format(time.RFC3339Nano),
		Block:     block.Name,
		BlockKind: block.Kind,
		Event:     "variable_set",
		Detail:    mustJSON(map[string]any{"name": block.VariableName, "value": value}),
	})
	return nil
}

// runConditionalBlock evaluates a condition (calculator-style boolean
// expression) and runs the matching branch.
func (s *execState) runConditionalBlock(ctx context.Context, block *Block) error {
	if block.ConditionExpression == "" {
		return fmt.Errorf("conditional block %q missing conditionExpression", block.Name)
	}
	value, err := evaluateCalculator(block.ConditionExpression, s.symbolTable())
	if err != nil {
		return fmt.Errorf("conditional %s: %w", block.Name, err)
	}
	branch := block.BranchFalse
	if value != 0 {
		branch = block.BranchTrue
	}
	for i := range branch {
		if err := s.runBlock(ctx, &branch[i]); err != nil {
			return err
		}
	}
	return nil
}

// runLoopBlock iterates over an input collection and runs the body
// for each item. The current item is exposed as the variable "item".
// MaxIterations caps work so an unbounded input cannot DoS the run.
func (s *execState) runLoopBlock(ctx context.Context, block *Block) error {
	raw, ok := s.symbolTable()[block.IterableInput]
	if !ok {
		return fmt.Errorf("loop block %q references unknown iterable %q", block.Name, block.IterableInput)
	}
	items, ok := raw.([]any)
	if !ok {
		return fmt.Errorf("loop block %q: iterable %q is not an array", block.Name, block.IterableInput)
	}
	limit := int(block.MaxIterations)
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	for idx, item := range items {
		if idx >= limit {
			s.appendLog(LogEntry{
				Timestamp: s.now().UTC().Format(time.RFC3339Nano),
				Block:     block.Name,
				BlockKind: block.Kind,
				Event:     "loop_truncated",
				Detail:    mustJSON(map[string]any{"limit": limit}),
			})
			break
		}
		s.variables["item"] = item
		for i := range block.Body {
			if err := s.runBlock(ctx, &block.Body[i]); err != nil {
				return err
			}
		}
	}
	delete(s.variables, "item")
	return nil
}

func buildToolManifest(tools []ToolConfig) ([]react.LLMToolDecl, map[string]ToolConfig) {
	decls := make([]react.LLMToolDecl, 0, len(tools))
	byName := make(map[string]ToolConfig, len(tools))
	for i, tool := range tools {
		name := toolDisplayName(tool, i)
		byName[name] = tool
		decls = append(decls, react.LLMToolDecl{
			Name:        name,
			Description: toolDescription(tool),
			Parameters:  toolParameterSchema(tool),
		})
	}
	return decls, byName
}

func toolDisplayName(tool ToolConfig, idx int) string {
	switch tool.Kind {
	case ToolKindQueryObjects:
		if tool.ObjectTypeID != "" {
			return "query_" + sanitiseToolName(tool.ObjectTypeID)
		}
	case ToolKindApplyAction:
		if tool.ActionTypeID != "" {
			return "apply_" + sanitiseToolName(tool.ActionTypeID)
		}
	case ToolKindExecuteFunction:
		if tool.FunctionRID != "" {
			return "call_" + sanitiseToolName(tool.FunctionRID)
		}
	case ToolKindCalculator:
		return "calculator"
	}
	return fmt.Sprintf("tool_%d", idx)
}

func sanitiseToolName(raw string) string {
	out := strings.Builder{}
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			out.WriteRune(r)
		case r == '_' || r == '-':
			out.WriteRune('_')
		default:
			out.WriteRune('_')
		}
	}
	return out.String()
}

func toolDescription(tool ToolConfig) string {
	switch tool.Kind {
	case ToolKindQueryObjects:
		return fmt.Sprintf("Query objects of type %s", tool.ObjectTypeID)
	case ToolKindApplyAction:
		return fmt.Sprintf("Apply action %s", tool.ActionTypeID)
	case ToolKindExecuteFunction:
		return fmt.Sprintf("Call function %s", tool.FunctionRID)
	case ToolKindCalculator:
		return "Evaluate an arithmetic expression"
	}
	return ""
}

func toolParameterSchema(tool ToolConfig) json.RawMessage {
	switch tool.Kind {
	case ToolKindQueryObjects:
		return json.RawMessage(`{"type":"object","properties":{"filter":{"type":"object"},"limit":{"type":"integer"}}}`)
	case ToolKindApplyAction, ToolKindExecuteFunction:
		return json.RawMessage(`{"type":"object","additionalProperties":true}`)
	case ToolKindCalculator:
		return json.RawMessage(`{"type":"object","additionalProperties":{"type":"number"}}`)
	}
	return nil
}

// projectOutputs picks the right value for every declared final
// output by tracing back to the block that produced it.
func projectOutputs(decls []OutputDecl, state *execState) map[string]any {
	out := make(map[string]any, len(decls))
	for _, decl := range decls {
		name := decl.APIName
		if name == "" {
			name = decl.OutputType
		}
		if name == "" {
			name = "result"
		}
		var value any
		if decl.BlockID != "" {
			if v, ok := state.blockOutputs[decl.BlockID]; ok {
				value = v
			}
		}
		if value == nil {
			value = lastBlockOutput(state)
		}
		out[name] = value
	}
	if len(decls) == 0 {
		out["result"] = lastBlockOutput(state)
	}
	return out
}

func lastBlockOutput(state *execState) any {
	if len(state.logs) == 0 {
		return nil
	}
	for k, v := range state.blockOutputs {
		// Most recent insertion wins; map iteration is unordered, so
		// scan the log for the latest block_exit / llm_final to find
		// the canonical "last" value.
		_ = k
		_ = v
	}
	for i := len(state.logs) - 1; i >= 0; i-- {
		entry := state.logs[i]
		if entry.Event == "llm_final" || entry.Event == "action_applied" || entry.Event == "function_executed" {
			if value, ok := state.blockOutputs[entry.Block]; ok {
				return value
			}
		}
	}
	for _, v := range state.blockOutputs {
		return v
	}
	return nil
}

func resolveModelRID(block *Block, inputs map[string]any) (uuid.UUID, error) {
	candidate := block.ModelBinding.ProviderID
	if candidate == "" && block.ModelBinding.ModelVariableAPIName != "" {
		if v, ok := inputs[block.ModelBinding.ModelVariableAPIName]; ok {
			if s, ok := v.(string); ok {
				candidate = s
			}
		}
	}
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return uuid.Nil, fmt.Errorf("use_llm block missing model binding")
	}
	parsed, err := uuid.Parse(candidate)
	if err != nil {
		return uuid.Nil, fmt.Errorf("model binding %q is not a valid model RID", candidate)
	}
	return parsed, nil
}

func decodeInputs(raw json.RawMessage) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any)
	if err := json.Unmarshal(raw, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func failureResult(now, start time.Time, err error) *Result {
	msg := err.Error()
	return &Result{
		Status:       "failed",
		Outputs:      json.RawMessage(`{}`),
		Logs:         json.RawMessage(`[]`),
		DurationMS:   int32(now.Sub(start) / time.Millisecond),
		ErrorMessage: msg,
	}
}

func failureWithLogs(now, start time.Time, state *execState, err error) *Result {
	res := failureResult(now, start, err)
	res.Logs = mustJSON(state.logs)
	res.PromptTokens = state.promptTokens
	res.CompletionTokens = state.completionTokens
	return res
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	return b
}
