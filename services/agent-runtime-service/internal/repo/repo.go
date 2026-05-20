package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

type Repo struct {
	Pool *pgxpool.Pool
}

const agentColumns = `id, slug, name, description, system_prompt,
                      provider_id, tools, status, created_at, updated_at`

func scanAgent(s scanner) (models.AgentDefinition, error) {
	var a models.AgentDefinition
	err := s.Scan(&a.ID, &a.Slug, &a.Name, &a.Description, &a.SystemPrompt,
		&a.ProviderID, &a.Tools, &a.Status, &a.CreatedAt, &a.UpdatedAt)
	return a, err
}

type scanner interface{ Scan(...any) error }

func (r *Repo) ListAgents(ctx context.Context) ([]models.AgentDefinition, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT `+agentColumns+` FROM agent_definitions ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.AgentDefinition, 0)
	for rows.Next() {
		a, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *Repo) CreateAgent(ctx context.Context, body models.CreateAgentRequest) (models.AgentDefinition, error) {
	tools := json.RawMessage(`[]`)
	if body.Tools != nil {
		tools = *body.Tools
	}
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO agent_definitions
                (id, slug, name, description, system_prompt, provider_id, tools, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
            RETURNING `+agentColumns,
		uuid.New(), body.Slug, body.Name, body.Description, body.SystemPrompt,
		body.ProviderID, tools)
	return scanAgent(row)
}

func (r *Repo) GetAgent(ctx context.Context, id uuid.UUID) (*models.AgentDefinition, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT `+agentColumns+` FROM agent_definitions WHERE id = $1`, id)
	a, err := scanAgent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *Repo) UpdateAgent(ctx context.Context, id uuid.UUID, body models.UpdateAgentRequest) (*models.AgentDefinition, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE agent_definitions
            SET name = COALESCE($2, name),
                description = COALESCE($3, description),
                system_prompt = COALESCE($4, system_prompt),
                tools = COALESCE($5, tools),
                status = COALESCE($6, status),
                updated_at = NOW()
          WHERE id = $1
          RETURNING `+agentColumns,
		id, body.Name, body.Description, body.SystemPrompt, body.Tools, body.Status)
	a, err := scanAgent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

const runColumns = `id, agent_id, conversation_id, status, input, final_output, created_at, updated_at`

func scanRun(s scanner) (models.AgentRun, error) {
	var r models.AgentRun
	err := s.Scan(&r.ID, &r.AgentID, &r.ConversationID, &r.Status,
		&r.Input, &r.FinalOutput, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

func (r *Repo) ListRuns(ctx context.Context, agentID uuid.UUID) ([]models.AgentRun, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT `+runColumns+` FROM agent_runs WHERE agent_id = $1 ORDER BY created_at DESC`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.AgentRun, 0)
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, run)
	}
	return out, rows.Err()
}

func (r *Repo) StartRun(ctx context.Context, agentID uuid.UUID, body models.StartRunRequest) (models.AgentRun, error) {
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO agent_runs (id, agent_id, conversation_id, status, input)
           VALUES ($1, $2, $3, 'running', $4) RETURNING `+runColumns,
		uuid.New(), agentID, body.ConversationID, body.Input)
	return scanRun(row)
}

const stepColumns = `id, run_id, step_index, kind, payload, created_at`

func scanStep(s scanner) (models.AgentRunStep, error) {
	var st models.AgentRunStep
	err := s.Scan(&st.ID, &st.RunID, &st.StepIndex, &st.Kind, &st.Payload, &st.CreatedAt)
	return st, err
}

func (r *Repo) RecordStep(ctx context.Context, runID uuid.UUID, body models.RecordStepRequest) (models.AgentRunStep, error) {
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO agent_run_steps (id, run_id, step_index, kind, payload)
           VALUES ($1, $2, $3, $4, $5) RETURNING `+stepColumns,
		uuid.New(), runID, body.StepIndex, body.Kind, body.Payload)
	return scanStep(row)
}

// CompleteRun marks an agent_run row as finished. status is one of
// "completed" / "failed" / "cancelled"; finalOutput carries the
// wire-stable envelope returned to clients.
func (r *Repo) CompleteRun(ctx context.Context, runID uuid.UUID, status string, finalOutput []byte) error {
	_, err := r.Pool.Exec(ctx,
		`UPDATE agent_runs SET status = $2, final_output = $3, updated_at = NOW() WHERE id = $1`,
		runID, status, finalOutput)
	return err
}

func (r *Repo) RecordHumanApproval(ctx context.Context, runID uuid.UUID, payload []byte) (models.AgentRunStep, error) {
	row := r.Pool.QueryRow(ctx,
		`INSERT INTO agent_run_steps (id, run_id, step_index, kind, payload)
           VALUES (
             $1,
             $2,
             COALESCE((SELECT MAX(step_index) + 1 FROM agent_run_steps WHERE run_id = $2), 0),
             'human_approval',
             $3
           )
           RETURNING `+stepColumns,
		uuid.New(), runID, payload)
	return scanStep(row)
}

const logicFileColumns = `id, name, description, project_id, folder_id, owner_id,
                         current_draft_version_id, published_version_id,
                         execution_mode, run_history_max_rows, run_history_dataset_rid,
                         permissions, archived_at, created_at, updated_at`
const logicVersionColumns = `id, logic_file_id, version_number, author_id, status, definition, change_summary, published_at, created_at`
const logicFunctionColumns = `id, logic_file_id, published_version_id, function_rid, name, signature, definition, published_by, published_at, updated_at`
const logicRunColumns = `id, logic_file_id, published_version_id, function_rid, actor_id, execution_mode, permission_subject_kind, permission_subject_id, invocation_surface, status, inputs, outputs, error_message, logs, duration_ms, retention_expires_at, run_history_dataset_rid, run_history_dataset_row, trace_refs, branch_name, model_provider_id, service_context, created_at, completed_at`

var defaultLogicDefinition = json.RawMessage(`{"inputs":[],"blocks":[],"outputs":[]}`)
var defaultLogicChangeSummary = json.RawMessage(`{"inputs":[],"blocks":[],"outputs":[],"prompt_changes":[],"model_changes":[]}`)
var defaultLogicSignature = json.RawMessage(`{"inputs":[],"outputs":[]}`)

var ErrLogicFunctionAPINotSupported = errors.New("logic function API invocation is not supported for ontology edit outputs")

const logicUserScopedRetention = 24 * time.Hour
const logicProjectScopedRunHistoryMaxRows int32 = 10000

func scanLogicFile(s scanner) (models.LogicFile, error) {
	var lf models.LogicFile
	err := s.Scan(&lf.ID, &lf.Name, &lf.Description, &lf.ProjectID, &lf.FolderID,
		&lf.OwnerID, &lf.CurrentDraftVersionID, &lf.PublishedVersionID,
		&lf.ExecutionMode, &lf.RunHistoryMaxRows, &lf.RunHistoryDatasetRID,
		&lf.Permissions, &lf.ArchivedAt, &lf.CreatedAt, &lf.UpdatedAt)
	return lf, err
}

func scanLogicVersion(s scanner) (models.LogicVersion, error) {
	var v models.LogicVersion
	err := s.Scan(&v.ID, &v.LogicFileID, &v.VersionNumber, &v.AuthorID, &v.Status,
		&v.Definition, &v.ChangeSummary, &v.PublishedAt, &v.CreatedAt)
	return v, err
}

func scanLogicFunction(s scanner) (models.LogicFunction, error) {
	var fn models.LogicFunction
	err := s.Scan(&fn.ID, &fn.LogicFileID, &fn.PublishedVersionID, &fn.FunctionRID,
		&fn.Name, &fn.Signature, &fn.Definition, &fn.PublishedBy, &fn.PublishedAt, &fn.UpdatedAt)
	return fn, err
}

func scanLogicRun(s scanner) (models.LogicRun, error) {
	var run models.LogicRun
	err := s.Scan(&run.ID, &run.LogicFileID, &run.PublishedVersionID, &run.FunctionRID,
		&run.ActorID, &run.ExecutionMode, &run.PermissionSubjectKind, &run.PermissionSubjectID,
		&run.InvocationSurface, &run.Status, &run.Inputs, &run.Outputs, &run.ErrorMessage,
		&run.Logs, &run.DurationMS, &run.RetentionExpiresAt, &run.RunHistoryDatasetRID,
		&run.RunHistoryDatasetRow, &run.TraceRefs, &run.BranchName, &run.ModelProviderID,
		&run.ServiceContext, &run.CreatedAt, &run.CompletedAt)
	return run, err
}

func nullableUUID(id *uuid.UUID) any {
	if id == nil {
		return nil
	}
	return *id
}

func defaultLogicPermissions(ownerID uuid.UUID, raw *json.RawMessage) json.RawMessage {
	if raw != nil && len(*raw) > 0 {
		return *raw
	}
	b, _ := json.Marshal(map[string][]string{
		"owners":   {ownerID.String()},
		"managers": {},
		"editors":  {},
		"viewers":  {},
		"invokers": {ownerID.String()},
	})
	return b
}

func normalizeJSONObject(raw json.RawMessage, fallback json.RawMessage) (json.RawMessage, error) {
	if strings.TrimSpace(string(raw)) == "" {
		if fallback == nil {
			return nil, errors.New("json body must not be empty")
		}
		return append(json.RawMessage(nil), fallback...), nil
	}
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if value == nil {
		return nil, errors.New("json body must be an object")
	}
	normalized, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(normalized), nil
}

type logicComponentSnapshot struct {
	ID     string
	Name   string
	Kind   string
	Raw    json.RawMessage
	Prompt json.RawMessage
	Model  json.RawMessage
}

func stringField(m map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := m[key].(string); ok && strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func canonicalJSON(value any) json.RawMessage {
	body, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage(`null`)
	}
	return body
}

func canonicalSubset(m map[string]any, keys ...string) json.RawMessage {
	subset := make(map[string]any)
	for _, key := range keys {
		if value, ok := m[key]; ok {
			subset[key] = value
		}
	}
	if len(subset) == 0 {
		return nil
	}
	return canonicalJSON(subset)
}

func extractLogicComponents(definition json.RawMessage, key string) []logicComponentSnapshot {
	var root map[string]any
	if err := json.Unmarshal(definition, &root); err != nil {
		return nil
	}
	rawItems, ok := root[key].([]any)
	if !ok {
		return nil
	}
	out := make([]logicComponentSnapshot, 0, len(rawItems))
	for i, rawItem := range rawItems {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		id := stringField(item, "id", "apiName", "api_name", "name")
		if id == "" {
			id = fmt.Sprintf("%s[%d]", key, i)
		}
		out = append(out, logicComponentSnapshot{
			ID:   id,
			Name: stringField(item, "name", "displayName", "display_name", "apiName", "api_name"),
			Kind: stringField(item, "type", "kind", "blockType", "block_type", "outputType", "output_type"),
			Raw:  canonicalJSON(item),
			Prompt: canonicalSubset(item,
				"systemPrompt", "system_prompt",
				"taskPrompt", "task_prompt",
				"prompt", "promptTemplate", "prompt_template",
				"promptVariableRefs", "prompt_variable_refs",
				"structuredOutput", "structured_output",
			),
			Model: canonicalSubset(item,
				"modelBinding", "model_binding",
				"model", "providerId", "provider_id",
				"modelVariableApiName", "model_variable_api_name",
			),
		})
	}
	return out
}

func indexLogicComponents(items []logicComponentSnapshot) map[string]logicComponentSnapshot {
	out := make(map[string]logicComponentSnapshot, len(items))
	for _, item := range items {
		out[item.ID] = item
	}
	return out
}

func logicComponentChange(item logicComponentSnapshot, changeType string) models.LogicComponentChange {
	return models.LogicComponentChange{
		ID:         item.ID,
		Name:       item.Name,
		Kind:       item.Kind,
		ChangeType: changeType,
	}
}

func diffLogicComponents(base, head []logicComponentSnapshot) []models.LogicComponentChange {
	baseByID := indexLogicComponents(base)
	headByID := indexLogicComponents(head)
	changes := make([]models.LogicComponentChange, 0)
	for id, headItem := range headByID {
		baseItem, ok := baseByID[id]
		if !ok {
			changes = append(changes, logicComponentChange(headItem, "added"))
			continue
		}
		if string(baseItem.Raw) != string(headItem.Raw) {
			changes = append(changes, logicComponentChange(headItem, "edited"))
		}
	}
	for id, baseItem := range baseByID {
		if _, ok := headByID[id]; !ok {
			changes = append(changes, logicComponentChange(baseItem, "removed"))
		}
	}
	sort.Slice(changes, func(i, j int) bool {
		if changes[i].ChangeType == changes[j].ChangeType {
			return changes[i].ID < changes[j].ID
		}
		return changes[i].ChangeType < changes[j].ChangeType
	})
	return changes
}

func diffLogicValueChanges(base, head []logicComponentSnapshot, field string) []models.LogicValueChange {
	baseByID := indexLogicComponents(base)
	headByID := indexLogicComponents(head)
	changes := make([]models.LogicValueChange, 0)
	for id, headItem := range headByID {
		baseItem, ok := baseByID[id]
		if !ok {
			continue
		}
		var oldValue, newValue json.RawMessage
		if field == "prompt" {
			oldValue, newValue = baseItem.Prompt, headItem.Prompt
		} else {
			oldValue, newValue = baseItem.Model, headItem.Model
		}
		if string(oldValue) == string(newValue) {
			continue
		}
		changes = append(changes, models.LogicValueChange{
			BlockID:    id,
			BlockName:  headItem.Name,
			ChangeType: "edited",
			OldValue:   oldValue,
			NewValue:   newValue,
		})
	}
	sort.Slice(changes, func(i, j int) bool { return changes[i].BlockID < changes[j].BlockID })
	return changes
}

func BuildLogicVersionChangeSummary(baseDefinition, headDefinition json.RawMessage) models.LogicVersionChangeSummary {
	baseInputs := extractLogicComponents(baseDefinition, "inputs")
	headInputs := extractLogicComponents(headDefinition, "inputs")
	baseBlocks := extractLogicComponents(baseDefinition, "blocks")
	headBlocks := extractLogicComponents(headDefinition, "blocks")
	baseOutputs := extractLogicComponents(baseDefinition, "outputs")
	headOutputs := extractLogicComponents(headDefinition, "outputs")
	return models.LogicVersionChangeSummary{
		Inputs:        diffLogicComponents(baseInputs, headInputs),
		Blocks:        diffLogicComponents(baseBlocks, headBlocks),
		Outputs:       diffLogicComponents(baseOutputs, headOutputs),
		PromptChanges: diffLogicValueChanges(baseBlocks, headBlocks, "prompt"),
		ModelChanges:  diffLogicValueChanges(baseBlocks, headBlocks, "model"),
	}
}

func logicChangeSummaryJSON(summary models.LogicVersionChangeSummary) json.RawMessage {
	body, err := json.Marshal(summary)
	if err != nil {
		return defaultLogicChangeSummary
	}
	return body
}

func deriveLogicSignature(definition json.RawMessage) json.RawMessage {
	var root map[string]any
	if err := json.Unmarshal(definition, &root); err != nil {
		return defaultLogicSignature
	}
	inputs, ok := root["inputs"]
	if !ok {
		inputs = []any{}
	}
	outputs, ok := root["outputs"]
	if !ok {
		outputs = []any{}
	}
	body, err := json.Marshal(map[string]any{
		"inputs":  inputs,
		"outputs": outputs,
	})
	if err != nil {
		return defaultLogicSignature
	}
	return body
}

func logicArrayField(raw json.RawMessage, key string) []map[string]any {
	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil
	}
	items, ok := root[key].([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		value, ok := item.(map[string]any)
		if ok {
			out = append(out, value)
		}
	}
	return out
}

func boolField(m map[string]any, key string) bool {
	value, ok := m[key].(bool)
	return ok && value
}

func outputTypeField(m map[string]any) string {
	return strings.ToLower(strings.TrimSpace(stringField(m, "outputType", "output_type", "type", "kind", "source")))
}

func isOntologyEditOutput(m map[string]any) bool {
	return outputTypeField(m) == "ontology_edit_bundle" || strings.ToLower(strings.TrimSpace(stringField(m, "source"))) == "ontology_edit_bundle"
}

func logicDefinitionReturnsOntologyEdits(definition json.RawMessage) bool {
	outputs := logicArrayField(definition, "outputs")
	if len(outputs) == 0 {
		return false
	}
	hasFinalOutput := false
	hasAnyOntologyEdit := false
	hasFinalOntologyEdit := false
	for _, output := range outputs {
		isEdit := isOntologyEditOutput(output)
		if isEdit {
			hasAnyOntologyEdit = true
		}
		if boolField(output, "final") {
			hasFinalOutput = true
			if isEdit {
				hasFinalOntologyEdit = true
			}
		}
	}
	if hasFinalOutput {
		return hasFinalOntologyEdit
	}
	return hasAnyOntologyEdit
}

func sampleLogicValue(inputType string, input map[string]any) any {
	if value, ok := input["defaultValue"]; ok && value != nil {
		return value
	}
	if value, ok := input["default_value"]; ok && value != nil {
		return value
	}
	switch strings.ToLower(strings.TrimSpace(inputType)) {
	case "boolean":
		return true
	case "date":
		return "2026-05-13"
	case "timestamp":
		return "2026-05-13T12:00:00Z"
	case "short", "integer", "long":
		return 1
	case "float", "double":
		return 1.5
	case "array", "list":
		return []any{"sample"}
	case "object_list", "object_set":
		objectType := stringField(input, "objectTypeId", "object_type_id")
		if objectType == "" {
			objectType = "Object"
		}
		return []any{map[string]any{"objectType": objectType, "primaryKey": "sample"}}
	case "object":
		objectType := stringField(input, "objectTypeId", "object_type_id")
		if objectType == "" {
			objectType = "Object"
		}
		return map[string]any{"objectType": objectType, "primaryKey": "sample"}
	case "media_reference":
		return "ri.media-set.main.media.sample"
	case "model":
		return "gpt-4.1-mini"
	case "json", "struct":
		return map[string]any{"sample": true}
	default:
		return "sample text"
	}
}

func sampleLogicInvocationInputs(signature, definition json.RawMessage) map[string]any {
	inputs := logicArrayField(signature, "inputs")
	if len(inputs) == 0 {
		inputs = logicArrayField(definition, "inputs")
	}
	out := make(map[string]any, len(inputs))
	for i, input := range inputs {
		name := stringField(input, "apiName", "api_name", "name", "id")
		if name == "" {
			name = fmt.Sprintf("input%d", i+1)
		}
		out[name] = sampleLogicValue(stringField(input, "type", "valueType", "value_type"), input)
	}
	return out
}

func outputPreviewValue(outputType string) any {
	switch strings.ToLower(strings.TrimSpace(outputType)) {
	case "boolean":
		return true
	case "short", "integer", "long":
		return 1
	case "float", "double":
		return 0.75
	case "array", "list", "object_list", "object_set":
		return []any{map[string]any{"status": "ok"}}
	case "object", "json", "struct":
		return map[string]any{"status": "ok"}
	case "date":
		return "2026-05-13"
	case "timestamp":
		return "2026-05-13T12:00:00Z"
	case "media_reference":
		return "ri.media-set.main.media.sample"
	default:
		return "Published Logic function executed."
	}
}

func logicInvocationOutputs(definition json.RawMessage) json.RawMessage {
	outputs := logicArrayField(definition, "outputs")
	finalOutputs := make([]map[string]any, 0, len(outputs))
	for _, output := range outputs {
		if boolField(output, "final") {
			finalOutputs = append(finalOutputs, output)
		}
	}
	if len(finalOutputs) == 0 {
		finalOutputs = outputs
	}
	values := make(map[string]any)
	for i, output := range finalOutputs {
		name := stringField(output, "apiName", "api_name", "name", "id")
		if name == "" {
			name = fmt.Sprintf("output%d", i+1)
		}
		values[name] = outputPreviewValue(outputTypeField(output))
	}
	if len(values) == 0 {
		values["result"] = "Published Logic function executed."
	}
	body, err := json.Marshal(values)
	if err != nil {
		return json.RawMessage(`{"result":"Published Logic function executed."}`)
	}
	return body
}

func normalizeLogicExecutionMode(mode string) string {
	if strings.TrimSpace(mode) == "project_scoped" {
		return "project_scoped"
	}
	return "user_scoped"
}

func logicProjectScopedRunHistoryDatasetRID(projectID uuid.UUID) string {
	return "ri.foundry.dataset.logic-run-history." + projectID.String()
}

func logicProjectScopedDatasetRIDOverride(override *string, projectID uuid.UUID) string {
	if override != nil {
		if trimmed := strings.TrimSpace(*override); trimmed != "" {
			return trimmed
		}
	}
	return logicProjectScopedRunHistoryDatasetRID(projectID)
}

func logicProjectScopedMaxRows(configured int32) int32 {
	if configured <= 0 {
		return logicProjectScopedRunHistoryMaxRows
	}
	if configured > 1000000 {
		return 1000000
	}
	return configured
}

func logicExecutionContext(mode string, actorID, projectID uuid.UUID, now time.Time) models.LogicExecutionContext {
	return logicExecutionContextWithSettings(mode, actorID, projectID, now, 0, nil)
}

func logicExecutionContextWithSettings(mode string, actorID, projectID uuid.UUID, now time.Time, configuredMaxRows int32, datasetRIDOverride *string) models.LogicExecutionContext {
	executionMode := normalizeLogicExecutionMode(mode)
	context := models.LogicExecutionContext{
		ExecutionMode:          executionMode,
		PermissionSubjectKind:  "user",
		PermissionSubjectID:    actorID,
		InitiatingUserID:       actorID,
		LogsVisibleTo:          "initiating_user",
		RetentionHours:         int32(logicUserScopedRetention / time.Hour),
		RetentionExpiresAt:     now.Add(logicUserScopedRetention),
		ProjectScopedAvailable: executionMode == "project_scoped",
		ProjectID:              projectID,
	}
	if executionMode == "project_scoped" {
		datasetRID := logicProjectScopedDatasetRIDOverride(datasetRIDOverride, projectID)
		context.PermissionSubjectKind = "project"
		context.PermissionSubjectID = projectID
		context.LogsVisibleTo = "project_viewers"
		context.RetentionHours = 0
		context.RetentionExpiresAt = now.AddDate(100, 0, 0)
		context.RunHistoryDatasetRID = &datasetRID
		context.RunHistoryMaxRows = logicProjectScopedMaxRows(configuredMaxRows)
	}
	return context
}

func logicRootObject(definition json.RawMessage) map[string]any {
	var root map[string]any
	if err := json.Unmarshal(definition, &root); err != nil || root == nil {
		return map[string]any{}
	}
	return root
}

func logicNestedObject(root map[string]any, keys ...string) map[string]any {
	for _, key := range keys {
		if value, ok := root[key].(map[string]any); ok {
			return value
		}
	}
	return map[string]any{}
}

func stringArrayValue(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if value, ok := item.(string); ok && strings.TrimSpace(value) != "" {
				out = append(out, strings.TrimSpace(value))
			}
		}
		return out
	case string:
		if strings.TrimSpace(typed) == "" {
			return nil
		}
		return []string{strings.TrimSpace(typed)}
	default:
		return nil
	}
}

func stringArrayFieldAny(m map[string]any, keys ...string) []string {
	for _, key := range keys {
		if values := stringArrayValue(m[key]); len(values) > 0 {
			return values
		}
	}
	return nil
}

func stringSet(values []string) map[string]bool {
	out := make(map[string]bool, len(values))
	for _, value := range values {
		if normalized := strings.TrimSpace(value); normalized != "" {
			out[normalized] = true
		}
	}
	return out
}

func stringSetContains(set map[string]bool, value string) bool {
	return set[strings.TrimSpace(value)]
}

func securityResourceKey(kind, id string) string {
	return strings.TrimSpace(kind) + ":" + strings.TrimSpace(id)
}

func securityAllowsResource(set map[string]bool, kind, id string) bool {
	return stringSetContains(set, id) || stringSetContains(set, securityResourceKey(kind, id))
}

func securityStringMapArray(m map[string]any, keys ...string) map[string][]string {
	for _, key := range keys {
		raw, ok := m[key].(map[string]any)
		if !ok {
			continue
		}
		out := make(map[string][]string, len(raw))
		for entryKey, entryValue := range raw {
			out[entryKey] = stringArrayValue(entryValue)
		}
		return out
	}
	return nil
}

func logicBlockToolAccess(block map[string]any) []map[string]any {
	raw, ok := block["toolAccess"].([]any)
	if !ok {
		raw, _ = block["tool_access"].([]any)
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if tool, ok := item.(map[string]any); ok {
			out = append(out, tool)
		}
	}
	return out
}

func addSecurityIssue(issues *[]models.LogicSecurityIssue, field, message string) {
	*issues = append(*issues, models.LogicSecurityIssue{
		Severity: "error",
		Field:    field,
		Message:  message,
	})
}

func sortedUniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		normalized := strings.TrimSpace(value)
		if normalized == "" || seen[normalized] {
			continue
		}
		seen[normalized] = true
		out = append(out, normalized)
	}
	sort.Strings(out)
	return out
}

func addSecurityResource(resources *[]models.LogicSecurityResourceExposure, resource models.LogicSecurityResourceExposure) {
	if strings.TrimSpace(resource.ID) == "" {
		return
	}
	if resource.Properties == nil {
		resource.Properties = []string{}
	}
	resource.Properties = sortedUniqueStrings(resource.Properties)
	resourceKey := securityResourceKey(resource.Kind, resource.ID)
	for i := range *resources {
		existing := &(*resources)[i]
		if securityResourceKey(existing.Kind, existing.ID) != resourceKey {
			continue
		}
		existing.Source = strings.Join(sortedUniqueStrings(append(strings.Split(existing.Source, ", "), resource.Source)), ", ")
		existing.Properties = sortedUniqueStrings(append(existing.Properties, resource.Properties...))
		existing.LLMAccessible = existing.LLMAccessible || resource.LLMAccessible
		existing.ExplicitlyConfigured = existing.ExplicitlyConfigured && resource.ExplicitlyConfigured
		existing.Permissioned = existing.Permissioned && resource.Permissioned
		existing.ImportedIntoProject = existing.ImportedIntoProject && resource.ImportedIntoProject
		existing.MarkingAccess = existing.MarkingAccess && resource.MarkingAccess
		return
	}
	*resources = append(*resources, resource)
}

func logicSecurityBoundary(definition json.RawMessage, context models.LogicExecutionContext) models.LogicSecurityBoundary {
	root := logicRootObject(definition)
	security := logicNestedObject(root, "security", "security_policy")
	allowedObjectTypes := stringSet(stringArrayFieldAny(security, "allowedObjectTypes", "allowed_object_types"))
	allowedActionTypes := stringSet(stringArrayFieldAny(security, "allowedActionTypes", "allowed_action_type_ids", "allowed_action_types"))
	allowedFunctionRIDs := stringSet(stringArrayFieldAny(security, "allowedFunctionRids", "allowed_function_rids"))
	allowedMediaSetRIDs := stringSet(stringArrayFieldAny(security, "allowedMediaSetRids", "allowed_media_set_rids"))
	allowedDatasetRIDs := stringSet(stringArrayFieldAny(security, "allowedResultDatasetRids", "allowed_result_dataset_rids"))
	importedResources := stringSet(stringArrayFieldAny(security, "projectImportedResourceIds", "project_imported_resource_ids", "project_imports"))
	markingResources := stringSet(stringArrayFieldAny(security, "markingAccessibleResourceIds", "marking_accessible_resource_ids", "marking_access"))
	policyReadableProperties := securityStringMapArray(security, "readablePropertiesByObjectType", "readable_properties_by_object_type")

	resources := []models.LogicSecurityResourceExposure{}
	issues := []models.LogicSecurityIssue{}

	for i, input := range logicArrayField(definition, "inputs") {
		inputType := strings.ToLower(strings.TrimSpace(stringField(input, "type", "valueType", "value_type")))
		field := fmt.Sprintf("inputs[%d]", i)
		switch inputType {
		case "object", "object_list", "object_set":
			objectType := stringField(input, "objectTypeId", "object_type_id", "objectSetObjectTypeId", "object_set_object_type_id")
			if objectType == "" {
				addSecurityIssue(&issues, field+".objectTypeId", "Ontology object inputs require an explicit object type.")
				continue
			}
			permissioned := len(allowedObjectTypes) == 0 || stringSetContains(allowedObjectTypes, objectType)
			addSecurityResource(&resources, models.LogicSecurityResourceExposure{
				Kind:                 "object_type",
				ID:                   objectType,
				Source:               field,
				LLMAccessible:        true,
				ExplicitlyConfigured: true,
				Permissioned:         permissioned,
				ImportedIntoProject:  context.ExecutionMode != "project_scoped" || securityAllowsResource(importedResources, "object_type", objectType),
				MarkingAccess:        context.ExecutionMode != "project_scoped" || securityAllowsResource(markingResources, "object_type", objectType),
			})
			if !permissioned {
				addSecurityIssue(&issues, field+".objectTypeId", "Ontology object input "+objectType+" is not allowed by the Logic security policy.")
			}
		case "media_reference":
			mediaSetRID := stringField(input, "mediaSetRid", "media_set_rid")
			if mediaSetRID == "" {
				addSecurityIssue(&issues, field+".mediaSetRid", "Media reference inputs require an explicit media set RID.")
				continue
			}
			permissioned := len(allowedMediaSetRIDs) == 0 || stringSetContains(allowedMediaSetRIDs, mediaSetRID)
			addSecurityResource(&resources, models.LogicSecurityResourceExposure{
				Kind:                 "media_set",
				ID:                   mediaSetRID,
				Source:               field,
				LLMAccessible:        true,
				ExplicitlyConfigured: true,
				Permissioned:         permissioned,
				ImportedIntoProject:  context.ExecutionMode != "project_scoped" || securityAllowsResource(importedResources, "media_set", mediaSetRID),
				MarkingAccess:        context.ExecutionMode != "project_scoped" || securityAllowsResource(markingResources, "media_set", mediaSetRID),
			})
			if !permissioned {
				addSecurityIssue(&issues, field+".mediaSetRid", "Media set "+mediaSetRID+" is not allowed by the Logic security policy.")
			}
		}
	}

	for blockIndex, block := range logicArrayField(definition, "blocks") {
		for toolIndex, tool := range logicBlockToolAccess(block) {
			field := fmt.Sprintf("blocks[%d].toolAccess[%d]", blockIndex, toolIndex)
			switch strings.ToLower(strings.TrimSpace(stringField(tool, "kind", "type"))) {
			case "query_objects":
				objectType := stringField(tool, "objectTypeId", "object_type_id")
				configuredObjectTypes := stringSet(stringArrayFieldAny(tool, "readableObjectTypeIds", "readable_object_type_ids"))
				explicitlyConfigured := stringSetContains(configuredObjectTypes, objectType)
				permissioned := (len(allowedObjectTypes) == 0 || stringSetContains(allowedObjectTypes, objectType)) && objectType != ""
				selectedProperties := stringArrayFieldAny(tool, "selectedProperties", "selected_properties")
				readableProperties := securityStringMapArray(tool, "readablePropertiesByObjectType", "readable_properties_by_object_type")
				if len(readableProperties[objectType]) == 0 && len(policyReadableProperties[objectType]) > 0 {
					readableProperties = policyReadableProperties
				}
				readablePropertySet := stringSet(readableProperties[objectType])
				policyPropertySet := stringSet(policyReadableProperties[objectType])
				for _, property := range selectedProperties {
					if !stringSetContains(readablePropertySet, property) {
						explicitlyConfigured = false
						addSecurityIssue(&issues, field+".selectedProperties."+property, "Property "+property+" is not explicitly configured as readable on "+objectType+".")
					}
					if len(policyPropertySet) > 0 && !stringSetContains(policyPropertySet, property) {
						permissioned = false
						addSecurityIssue(&issues, field+".selectedProperties."+property, "Property "+property+" is not permissioned for LLM access on "+objectType+".")
					}
				}
				addSecurityResource(&resources, models.LogicSecurityResourceExposure{
					Kind:                 "object_type",
					ID:                   objectType,
					Source:               field,
					Properties:           selectedProperties,
					LLMAccessible:        true,
					ExplicitlyConfigured: explicitlyConfigured,
					Permissioned:         permissioned,
					ImportedIntoProject:  context.ExecutionMode != "project_scoped" || securityAllowsResource(importedResources, "object_type", objectType),
					MarkingAccess:        context.ExecutionMode != "project_scoped" || securityAllowsResource(markingResources, "object_type", objectType),
				})
				if objectType == "" || !explicitlyConfigured {
					addSecurityIssue(&issues, field+".objectTypeId", "Query objects tools must select an explicitly readable object type.")
				}
				if !permissioned {
					addSecurityIssue(&issues, field+".objectTypeId", "Object type "+objectType+" is not permissioned for this Logic function.")
				}
			case "apply_action":
				actionTypeID := stringField(tool, "actionTypeId", "action_type_id")
				configuredActions := stringSet(stringArrayFieldAny(tool, "allowedActionTypeIds", "allowed_action_type_ids"))
				explicitlyConfigured := stringSetContains(configuredActions, actionTypeID)
				permissioned := len(allowedActionTypes) == 0 || stringSetContains(allowedActionTypes, actionTypeID)
				addSecurityResource(&resources, models.LogicSecurityResourceExposure{
					Kind:                 "action_type",
					ID:                   actionTypeID,
					Source:               field,
					LLMAccessible:        true,
					ExplicitlyConfigured: explicitlyConfigured,
					Permissioned:         permissioned,
					ImportedIntoProject:  context.ExecutionMode != "project_scoped" || securityAllowsResource(importedResources, "action_type", actionTypeID),
					MarkingAccess:        context.ExecutionMode != "project_scoped" || securityAllowsResource(markingResources, "action_type", actionTypeID),
				})
				if actionTypeID == "" || !explicitlyConfigured {
					addSecurityIssue(&issues, field+".actionTypeId", "Apply action tools must select an explicitly allowed action type.")
				}
				if !permissioned {
					addSecurityIssue(&issues, field+".actionTypeId", "Action type "+actionTypeID+" is not permissioned for this Logic function.")
				}
			case "execute_function":
				functionRID := stringField(tool, "functionRid", "function_rid")
				configuredFunctions := stringSet(stringArrayFieldAny(tool, "allowedFunctionRids", "allowed_function_rids"))
				explicitlyConfigured := stringSetContains(configuredFunctions, functionRID)
				permissioned := len(allowedFunctionRIDs) == 0 || stringSetContains(allowedFunctionRIDs, functionRID)
				addSecurityResource(&resources, models.LogicSecurityResourceExposure{
					Kind:                 "function",
					ID:                   functionRID,
					Source:               field,
					LLMAccessible:        true,
					ExplicitlyConfigured: explicitlyConfigured,
					Permissioned:         permissioned,
					ImportedIntoProject:  context.ExecutionMode != "project_scoped" || securityAllowsResource(importedResources, "function", functionRID),
					MarkingAccess:        context.ExecutionMode != "project_scoped" || securityAllowsResource(markingResources, "function", functionRID),
				})
				if functionRID == "" || !explicitlyConfigured {
					addSecurityIssue(&issues, field+".functionRid", "Execute function tools must select an explicitly allowed function.")
				}
				if !permissioned {
					addSecurityIssue(&issues, field+".functionRid", "Function "+functionRID+" is not permissioned for this Logic function.")
				}
			}
		}
	}

	if context.RunHistoryDatasetRID != nil {
		datasetRID := *context.RunHistoryDatasetRID
		permissioned := len(allowedDatasetRIDs) == 0 || stringSetContains(allowedDatasetRIDs, datasetRID)
		addSecurityResource(&resources, models.LogicSecurityResourceExposure{
			Kind:                 "result_dataset",
			ID:                   datasetRID,
			Source:               "run_history_dataset",
			LLMAccessible:        false,
			ExplicitlyConfigured: true,
			Permissioned:         permissioned,
			ImportedIntoProject:  true,
			MarkingAccess:        true,
		})
		if !permissioned {
			addSecurityIssue(&issues, "runHistoryDatasetRid", "Run history dataset "+datasetRID+" is not permissioned for project-scoped Logic execution.")
		}
	}

	for _, resource := range resources {
		if context.ExecutionMode == "project_scoped" && resource.Kind != "result_dataset" {
			if !resource.ImportedIntoProject {
				addSecurityIssue(&issues, resource.Source+".imported", resource.Kind+" "+resource.ID+" must be imported into the Logic project.")
			}
			if !resource.MarkingAccess {
				addSecurityIssue(&issues, resource.Source+".markings", resource.Kind+" "+resource.ID+" requires marking access for project-scoped execution.")
			}
		}
	}

	llmIDs := make([]string, 0, len(resources))
	for _, resource := range resources {
		if resource.LLMAccessible {
			llmIDs = append(llmIDs, securityResourceKey(resource.Kind, resource.ID))
		}
	}
	sort.Strings(llmIDs)
	return models.LogicSecurityBoundary{
		Ready:                    len(issues) == 0,
		ExecutionMode:            context.ExecutionMode,
		PermissionSubjectKind:    context.PermissionSubjectKind,
		PermissionSubjectID:      context.PermissionSubjectID,
		LLMAccessibleResourceIDs: llmIDs,
		Resources:                resources,
		Issues:                   issues,
	}
}

func logicDefinitionBranchName(definition json.RawMessage) string {
	var root map[string]any
	if err := json.Unmarshal(definition, &root); err != nil {
		return "main"
	}
	if branch := stringField(root, "branchName", "branch_name", "branch"); branch != "" {
		return branch
	}
	return "main"
}

func valueString(m map[string]any, key string) string {
	value, ok := m[key]
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64, bool:
		return fmt.Sprint(typed)
	default:
		return ""
	}
}

func logicInvocationModel(definition, inputs json.RawMessage) string {
	var inputValues map[string]any
	_ = json.Unmarshal(inputs, &inputValues)
	for _, block := range logicArrayField(definition, "blocks") {
		binding, ok := block["modelBinding"].(map[string]any)
		if !ok {
			binding, _ = block["model_binding"].(map[string]any)
		}
		if providerID := stringField(binding, "providerId", "provider_id", "model", "modelId", "model_id"); providerID != "" {
			return providerID
		}
		if variable := stringField(binding, "modelVariableApiName", "model_variable_api_name"); variable != "" {
			if value := valueString(inputValues, variable); value != "" {
				return value
			}
			return "model_variable:" + variable
		}
		if providerID := stringField(block, "providerId", "provider_id", "model", "modelId", "model_id"); providerID != "" {
			return providerID
		}
	}
	return ""
}

func logicRunTraceRefs(fn models.LogicFunction, context models.LogicExecutionContext, runID uuid.UUID) json.RawMessage {
	body, err := json.Marshal([]map[string]any{
		{
			"id":         "debugger:" + runID.String(),
			"kind":       "debugger",
			"href":       "/logic/files/" + fn.LogicFileID.String() + "/runs/" + runID.String() + "/debugger",
			"visibility": context.LogsVisibleTo,
		},
		{
			"id":         "lineage:" + runID.String(),
			"kind":       "lineage",
			"href":       "/workflow-lineage?logic_run_id=" + runID.String(),
			"visibility": context.LogsVisibleTo,
		},
	})
	if err != nil {
		return json.RawMessage(`[]`)
	}
	return body
}

func logicRunServiceContext(context models.LogicExecutionContext, surface string) json.RawMessage {
	body, err := json.Marshal(map[string]any{
		"invocation_surface":       surface,
		"execution_mode":           context.ExecutionMode,
		"permission_subject_kind":  context.PermissionSubjectKind,
		"permission_subject_id":    context.PermissionSubjectID.String(),
		"initiating_user_id":       context.InitiatingUserID.String(),
		"project_id":               context.ProjectID.String(),
		"logs_visible_to":          context.LogsVisibleTo,
		"run_history_dataset_rid":  context.RunHistoryDatasetRID,
		"run_history_max_rows":     context.RunHistoryMaxRows,
		"project_scoped_available": context.ProjectScopedAvailable,
	})
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return body
}

func logicRunHistoryDatasetRow(runID uuid.UUID, fn models.LogicFunction, context models.LogicExecutionContext, surface, status string, inputs, outputs json.RawMessage, errorMessage *string, durationMS int32, modelProviderID, branchName string, traceRefs, serviceContext json.RawMessage, startedAt, completedAt time.Time) json.RawMessage {
	if context.RunHistoryDatasetRID == nil {
		return json.RawMessage(`{}`)
	}
	row := map[string]any{
		"run_id":                   runID.String(),
		"logic_file_id":            fn.LogicFileID.String(),
		"function_rid":             fn.FunctionRID,
		"project_id":               context.ProjectID.String(),
		"run_history_dataset_rid":  *context.RunHistoryDatasetRID,
		"status":                   status,
		"inputs":                   inputs,
		"outputs":                  outputs,
		"error_message":            errorMessage,
		"duration_ms":              durationMS,
		"model":                    modelProviderID,
		"branch_name":              branchName,
		"published_version_id":     fn.PublishedVersionID.String(),
		"published_version_number": fn.PublishedVersionNumber,
		"actor_id":                 context.InitiatingUserID.String(),
		"permission_subject_kind":  context.PermissionSubjectKind,
		"permission_subject_id":    context.PermissionSubjectID.String(),
		"service_context":          serviceContext,
		"trace_refs":               traceRefs,
		"visible_to":               context.LogsVisibleTo,
		"started_at":               startedAt.Format(time.RFC3339Nano),
		"completed_at":             completedAt.Format(time.RFC3339Nano),
	}
	body, err := json.Marshal(row)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return body
}

func logicRunVisibleToActor(run models.LogicRun, actorID uuid.UUID, _ bool) bool {
	if run.ExecutionMode == "user_scoped" {
		return run.ActorID == actorID
	}
	return true
}

func logicMetricsWindow(value string, now time.Time) (string, time.Time) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "24h", "1d":
		return "24h", now.Add(-24 * time.Hour)
	case "7d":
		return "7d", now.AddDate(0, 0, -7)
	case "90d":
		return "90d", now.AddDate(0, 0, -90)
	default:
		return "30d", now.AddDate(0, 0, -30)
	}
}

func logicFailureCategory(run models.LogicRun) string {
	text := strings.ToLower(string(run.Logs))
	if run.ErrorMessage != nil {
		text += " " + strings.ToLower(*run.ErrorMessage)
	}
	switch {
	case strings.Contains(text, "permission") || strings.Contains(text, "unauthorized") || strings.Contains(text, "forbidden"):
		return "permission_error"
	case strings.Contains(text, "validation") || strings.Contains(text, "invalid input") || strings.Contains(text, "schema"):
		return "validation_error"
	case strings.Contains(text, "ontology") || strings.Contains(text, "edit bundle") || strings.Contains(text, "writeback"):
		return "ontology_edit_error"
	case strings.Contains(text, "timeout") || strings.Contains(text, "deadline"):
		return "timeout"
	case strings.Contains(text, "rate limit") || strings.Contains(text, "quota"):
		return "rate_limit"
	case strings.Contains(text, "model") || strings.Contains(text, "llm"):
		return "model_error"
	default:
		return "runtime_error"
	}
}

func logicP95DurationMS(runs []models.LogicRun) *int32 {
	if len(runs) == 0 {
		return nil
	}
	values := make([]int32, 0, len(runs))
	for _, run := range runs {
		values = append(values, run.DurationMS)
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	index := (95*len(values)+99)/100 - 1
	if index < 0 {
		index = 0
	}
	value := values[index]
	return &value
}

func buildLogicMetrics(fileID uuid.UUID, runs []models.LogicRun, window string, start, end time.Time) models.LogicMetricsResponse {
	metrics := models.LogicMetricsResponse{
		LogicFileID:              fileID,
		Window:                   window,
		WindowStart:              start,
		WindowEnd:                end,
		FailureCategories:        []models.LogicFailureCategory{},
		RecentRuns:               []models.LogicRun{},
		ViewerPermissionRequired: true,
	}
	categoryCounts := make(map[string]int32)
	for _, run := range runs {
		switch run.Status {
		case "succeeded":
			metrics.SuccessCount += 1
		case "failed":
			metrics.FailureCount += 1
			categoryCounts[logicFailureCategory(run)] += 1
		}
		if len(metrics.RecentRuns) < 10 {
			metrics.RecentRuns = append(metrics.RecentRuns, run)
		}
	}
	for category, count := range categoryCounts {
		metrics.FailureCategories = append(metrics.FailureCategories, models.LogicFailureCategory{
			Category: category,
			Count:    count,
		})
	}
	sort.Slice(metrics.FailureCategories, func(i, j int) bool {
		if metrics.FailureCategories[i].Count == metrics.FailureCategories[j].Count {
			return metrics.FailureCategories[i].Category < metrics.FailureCategories[j].Category
		}
		return metrics.FailureCategories[i].Count > metrics.FailureCategories[j].Count
	})
	metrics.P95DurationMS = logicP95DurationMS(runs)
	return metrics
}

func logicRunLogs(fn models.LogicFunction, context models.LogicExecutionContext, surface string) json.RawMessage {
	body, err := json.Marshal([]map[string]any{
		{
			"event":                   "permission_context_selected",
			"execution_mode":          context.ExecutionMode,
			"permission_subject_kind": context.PermissionSubjectKind,
			"permission_subject_id":   context.PermissionSubjectID.String(),
			"logs_visible_to":         context.LogsVisibleTo,
			"retention_expires_at":    context.RetentionExpiresAt.Format(time.RFC3339),
			"run_history_dataset_rid": context.RunHistoryDatasetRID,
			"run_history_max_rows":    context.RunHistoryMaxRows,
		},
		{
			"event":                "published_logic_invoked",
			"function_rid":         fn.FunctionRID,
			"published_version_id": fn.PublishedVersionID.String(),
			"invocation_surface":   surface,
		},
	})
	if err != nil {
		return json.RawMessage(`[]`)
	}
	return body
}

func insertLogicRun(ctx context.Context, tx pgx.Tx, fn models.LogicFunction, execContext models.LogicExecutionContext, surface, status string, inputs, outputs json.RawMessage, errorMessage *string, logs json.RawMessage, durationMS int32, now time.Time) (models.LogicRun, error) {
	runID := uuid.New()
	completedAt := now
	traceRefs := logicRunTraceRefs(fn, execContext, runID)
	serviceContext := logicRunServiceContext(execContext, surface)
	branchName := logicDefinitionBranchName(fn.Definition)
	modelProviderID := logicInvocationModel(fn.Definition, inputs)
	var runHistoryDatasetRow json.RawMessage = json.RawMessage(`{}`)
	if execContext.RunHistoryDatasetRID != nil {
		runHistoryDatasetRow = logicRunHistoryDatasetRow(runID, fn, execContext, surface, status, inputs, outputs, errorMessage, durationMS, modelProviderID, branchName, traceRefs, serviceContext, now, completedAt)
	}
	return scanLogicRun(tx.QueryRow(ctx,
		`INSERT INTO logic_runs
		        (id, logic_file_id, published_version_id, function_rid, actor_id,
		         execution_mode, permission_subject_kind, permission_subject_id,
		         invocation_surface, status, inputs, outputs, error_message, logs,
		         duration_ms, retention_expires_at, run_history_dataset_rid,
		         run_history_dataset_row, trace_refs, branch_name, model_provider_id,
		         service_context, created_at, completed_at)
		 VALUES ($1, $2, $3, $4, $5,
		         $6, $7, $8,
		         $9, $10, $11, $12, $13, $14,
		         $15, $16, $17,
		         $18, $19, $20, $21,
		         $22, $23, $23)
		 RETURNING `+logicRunColumns,
		runID, fn.LogicFileID, fn.PublishedVersionID, fn.FunctionRID, execContext.InitiatingUserID,
		execContext.ExecutionMode, execContext.PermissionSubjectKind, execContext.PermissionSubjectID,
		surface, status, inputs, outputs, errorMessage, logs,
		durationMS, execContext.RetentionExpiresAt, execContext.RunHistoryDatasetRID,
		runHistoryDatasetRow, traceRefs, branchName, modelProviderID,
		serviceContext, now))
}

func pruneLogicRunHistoryDataset(ctx context.Context, tx pgx.Tx, datasetRID string, maxRows int32) error {
	if strings.TrimSpace(datasetRID) == "" || maxRows <= 0 {
		return nil
	}
	_, err := tx.Exec(ctx,
		`DELETE FROM logic_runs
		  WHERE id IN (
		    SELECT id
		      FROM logic_runs
		     WHERE run_history_dataset_rid = $1
		     ORDER BY created_at DESC, id DESC
		     OFFSET $2
		  )`,
		datasetRID, maxRows)
	return err
}

func prettyJSON(value any) string {
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(body)
}

func compactJSON(value any) string {
	body, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(body)
}

func shellSingleQuote(value string) string {
	return strings.ReplaceAll(value, `'`, `'"'"'`)
}

func logicUsageInputMappings(inputs map[string]any) map[string]string {
	mappings := make(map[string]string, len(inputs))
	for input := range inputs {
		mappings[input] = input
	}
	return mappings
}

func logicUsageActionPropertyType(input map[string]any) string {
	switch strings.ToLower(strings.TrimSpace(stringField(input, "type", "valueType", "value_type"))) {
	case "boolean":
		return "boolean"
	case "date":
		return "date"
	case "timestamp":
		return "timestamp"
	case "short", "integer", "long":
		return "integer"
	case "float", "double":
		return "float"
	case "object":
		return "object_reference"
	case "object_list", "object_set":
		return "object_reference_list"
	case "array", "list", "struct":
		return "json"
	default:
		return "string"
	}
}

func logicUsageInputDefinitions(fn models.LogicFunction) []map[string]any {
	inputs := logicArrayField(fn.Signature, "inputs")
	if len(inputs) == 0 {
		inputs = logicArrayField(fn.Definition, "inputs")
	}
	return inputs
}

func logicUsageActionInputSchema(fn models.LogicFunction) []map[string]any {
	inputDefinitions := logicUsageInputDefinitions(fn)
	fields := make([]map[string]any, 0, len(inputDefinitions))
	for i, input := range inputDefinitions {
		name := stringField(input, "apiName", "api_name", "name", "id")
		if name == "" {
			name = fmt.Sprintf("input%d", i+1)
		}
		displayName := stringField(input, "name", "displayName", "display_name")
		if displayName == "" {
			displayName = name
		}
		field := map[string]any{
			"name":          name,
			"display_name":  displayName,
			"property_type": logicUsageActionPropertyType(input),
			"required":      boolField(input, "required"),
		}
		if description := stringField(input, "description"); description != "" {
			field["description"] = description
		}
		fields = append(fields, field)
	}
	return fields
}

func logicUsageObjectTypeID(fn models.LogicFunction) string {
	for _, input := range logicUsageInputDefinitions(fn) {
		inputType := strings.ToLower(strings.TrimSpace(stringField(input, "type", "valueType", "value_type")))
		if inputType != "object" && inputType != "object_list" && inputType != "object_set" {
			continue
		}
		if objectType := stringField(input, "objectTypeId", "object_type_id", "objectSetObjectTypeId", "object_set_object_type_id"); objectType != "" {
			return objectType
		}
	}
	return ""
}

func logicUsageOntologyEditOutputName(fn models.LogicFunction) string {
	for _, output := range logicArrayField(fn.Definition, "outputs") {
		outputType := strings.ToLower(strings.TrimSpace(stringField(output, "outputType", "output_type", "source")))
		if outputType == "ontology_edit_bundle" {
			if name := stringField(output, "apiName", "api_name", "name", "id"); name != "" {
				return name
			}
		}
	}
	return ""
}

func logicUsageActionTypeDraft(fn models.LogicFunction, inputs map[string]any, returnsOntologyEdits bool, baseURL string) map[string]any {
	name := strings.Trim(strings.ToLower(strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return '_'
	}, strings.TrimPrefix(fn.FunctionRID, "logic."))), "_")
	if name == "" {
		name = "logic_function"
	}
	name += "_action"
	outputName := logicUsageOntologyEditOutputName(fn)
	inputSchema := logicUsageActionInputSchema(fn)
	parameterNames := make([]string, 0, len(inputSchema))
	for _, field := range inputSchema {
		if raw, ok := field["name"].(string); ok {
			parameterNames = append(parameterNames, raw)
		}
	}
	operation := map[string]any{
		"kind":                     "invoke_function",
		"function_kind":            "logic",
		"function_rid":             fn.FunctionRID,
		"published_version_number": fn.PublishedVersionNumber,
		"url":                      baseURL + "/api/v1/agent-runtime/logic/functions/" + url.PathEscape(fn.FunctionRID) + "/invoke",
		"method":                   "POST",
		"parameter_mapping":        logicUsageInputMappings(inputs),
		"body_mapping": map[string]any{
			"inputs_from":        "parameters",
			"invocation_surface": "action_execution",
		},
		"ontology_edit_application": "none",
		"branch_aware_preview": map[string]any{
			"enabled":          true,
			"branch_parameter": "execution_context.branch_name",
		},
	}
	if returnsOntologyEdits {
		operation["output_api_name"] = outputName
		operation["ontology_edit_application"] = "action_execution_or_approved_automation_only"
	}
	return map[string]any{
		"name":                  name,
		"display_name":          "Run " + fn.FunctionRID,
		"description":           "Invokes published Logic " + fn.FunctionRID + " v" + fmt.Sprint(fn.PublishedVersionNumber) + " from an action type.",
		"object_type_id":        logicUsageObjectTypeID(fn),
		"operation_kind":        "invoke_function",
		"input_schema":          inputSchema,
		"form_schema":           map[string]any{"sections": []map[string]any{{"id": "logic-inputs", "title": "Logic inputs", "parameter_names": parameterNames}}},
		"config":                map[string]any{"operation": operation, "guardrails": map[string]any{"real_edits_require_action_execution_or_approved_automation": true}},
		"confirmation_required": returnsOntologyEdits,
		"permission_key":        "logic.actions.execute",
		"authorization_policy":  map[string]any{"required_permission_keys": []string{"ontology.actions.execute", "logic.functions.invoke"}},
	}
}

func functionOnObjectsSnippet(fn models.LogicFunction, inputs map[string]any) string {
	inputDefinitions := logicUsageInputDefinitions(fn)
	for _, input := range inputDefinitions {
		inputType := strings.ToLower(strings.TrimSpace(stringField(input, "type", "valueType", "value_type")))
		if inputType != "object" && inputType != "object_list" && inputType != "object_set" {
			continue
		}
		inputName := stringField(input, "apiName", "api_name", "name", "id")
		if inputName == "" {
			continue
		}
		objectType := stringField(input, "objectTypeId", "object_type_id")
		if objectType == "" {
			objectType = "Object"
		}
		return "await Functions.callOnObject('" + objectType + "', inputs." + inputName + ", '" + fn.FunctionRID + "', " + prettyJSON(inputs) + ");"
	}
	return "await Functions.call('" + fn.FunctionRID + "', " + prettyJSON(inputs) + ");"
}

func publishedLogicRequirement(fn models.LogicFunction) []string {
	return []string{
		"published_version_id=" + fn.PublishedVersionID.String(),
		"function_rid=" + fn.FunctionRID,
	}
}

func buildUnpublishedLogicUsageSurfaces() []models.LogicUsageSurface {
	surfaces := []struct {
		id          string
		label       string
		description string
		href        string
	}{
		{"workshop", "Workshop", "Bind the published Logic function to Workshop variables and widgets.", "/workshop"},
		{"action_workflow", "Action-backed workflows", "Invoke the function from action-backed workflow steps.", "/action-types"},
		{"logic_function", "Other Logic functions", "Expose the function as an existing Logic tool in another Logic function.", "/logic"},
		{"function_on_objects", "Function-on-objects", "Call the function in object-scoped workflows when an object input is selected.", "/ontology-manager/functions"},
		{"automate", "Automate", "Create an automation that invokes the published function.", "/automate"},
		{"api_curl", "API / curl", "Invoke the function from API clients when the published return type is supported.", "/api/docs/logic"},
	}
	out := make([]models.LogicUsageSurface, 0, len(surfaces))
	for _, surface := range surfaces {
		out = append(out, models.LogicUsageSurface{
			ID:           surface.id,
			Surface:      surface.id,
			Label:        surface.label,
			Description:  surface.description,
			Href:         surface.href,
			Status:       "requires_publish",
			Requirements: []string{"publish a Logic version"},
		})
	}
	return out
}

func buildLogicUsageSurfaces(fn models.LogicFunction, returnsOntologyEdits bool, baseURL string) []models.LogicUsageSurface {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	inputs := sampleLogicInvocationInputs(fn.Signature, fn.Definition)
	requirements := publishedLogicRequirement(fn)
	apiURL := baseURL + "/api/v1/agent-runtime/logic/functions/" + url.PathEscape(fn.FunctionRID) + "/invoke"
	body := prettyJSON(map[string]any{"inputs": inputs})
	blockedReason := "Command-line and API invocation are unavailable for Logic functions that return Ontology edits."
	actionTypeDraft := logicUsageActionTypeDraft(fn, inputs, returnsOntologyEdits, baseURL)
	actionTypeDraftBody := compactJSON(actionTypeDraft)
	actionTypeHref := "/action-types?source=logic&functionRid=" + url.QueryEscape(fn.FunctionRID) +
		"&version=" + url.QueryEscape(fmt.Sprint(fn.PublishedVersionNumber)) +
		"&draft=" + url.QueryEscape(actionTypeDraftBody)

	surfaces := []models.LogicUsageSurface{
		{
			ID:           "workshop",
			Surface:      "workshop",
			Label:        "Workshop",
			Description:  "Bind the published Logic function to Workshop variables, widgets, and form-backed app flows.",
			Href:         "/workshop",
			Status:       "available",
			Requirements: requirements,
			Snippet: &models.LogicUsageSnippet{
				Language: "json",
				Label:    "Workshop function variable",
				Body: prettyJSON(map[string]any{
					"variable_type":       "function_output",
					"function_package_id": fn.FunctionRID,
					"parameters":          inputs,
					"result_path":         "finalAnswer",
				}),
			},
		},
		{
			ID:           "action_workflow",
			Surface:      "action_workflow",
			Label:        "Action-backed workflows",
			Description:  "Use the callable Logic function as a workflow step after an action collects or mutates inputs.",
			Href:         actionTypeHref,
			Status:       "available",
			Requirements: requirements,
			Snippet: &models.LogicUsageSnippet{
				Language: "json",
				Label:    "Function-backed action type",
				Body:     prettyJSON(actionTypeDraft),
			},
		},
		{
			ID:           "logic_function",
			Surface:      "logic_function",
			Label:        "Other Logic functions",
			Description:  "Expose this publication through an Execute function tool in another Logic function.",
			Href:         "/logic",
			Status:       "available",
			Requirements: requirements,
			Snippet: &models.LogicUsageSnippet{
				Language: "json",
				Label:    "Execute function tool",
				Body: prettyJSON(map[string]any{
					"kind":               "execute_function",
					"functionKind":       "existing_logic",
					"functionRid":        fn.FunctionRID,
					"parameterMappings":  logicUsageInputMappings(inputs),
					"expectedOutputType": "json",
				}),
			},
		},
		{
			ID:           "function_on_objects",
			Surface:      "function_on_objects",
			Label:        "Function-on-objects",
			Description:  "Use object-scoped calls when one of the function inputs is an Ontology object.",
			Href:         "/ontology-manager/functions",
			Status:       "available",
			Requirements: requirements,
			Snippet: &models.LogicUsageSnippet{
				Language: "typescript",
				Label:    "Object-scoped invocation",
				Body:     functionOnObjectsSnippet(fn, inputs),
			},
		},
		{
			ID:           "automate",
			Surface:      "automate",
			Label:        "Automate",
			Description:  "Create an automation that invokes the published function from a schedule or object event.",
			Href:         "/automate",
			Status:       "available",
			Requirements: requirements,
			Snippet: &models.LogicUsageSnippet{
				Language: "json",
				Label:    "Automation step",
				Body: prettyJSON(map[string]any{
					"trigger": "schedule_or_object_change",
					"step": map[string]any{
						"type":         "invoke_logic_function",
						"function_rid": fn.FunctionRID,
						"inputs":       inputs,
					},
				}),
			},
		},
		{
			ID:           "api_curl",
			Surface:      "api_curl",
			Label:        "API / curl",
			Description:  "Invoke the published function from API clients when the function does not return Ontology edits.",
			Href:         apiURL,
			Status:       "available",
			Requirements: requirements,
			Snippet: &models.LogicUsageSnippet{
				Language: "bash",
				Label:    "curl",
				Body: "curl -X POST '" + apiURL + "' \\\n" +
					"  -H 'authorization: Bearer $OPENFOUNDRY_TOKEN' \\\n" +
					"  -H 'content-type: application/json' \\\n" +
					"  -d '" + shellSingleQuote(body) + "'",
			},
		},
	}
	if returnsOntologyEdits {
		for i := range surfaces {
			if surfaces[i].ID == "api_curl" {
				surfaces[i].Status = "blocked"
				surfaces[i].BlockedReason = &blockedReason
				surfaces[i].Snippet = nil
				break
			}
		}
	}
	return surfaces
}

func (r *Repo) CreateLogicFile(ctx context.Context, ownerID uuid.UUID, body models.CreateLogicFileRequest) (models.LogicFile, error) {
	executionMode := "user_scoped"
	if body.ExecutionMode != nil {
		executionMode = *body.ExecutionMode
	}
	runHistoryMaxRows := logicProjectScopedRunHistoryMaxRows
	if body.RunHistoryMaxRows != nil {
		runHistoryMaxRows = logicProjectScopedMaxRows(*body.RunHistoryMaxRows)
	}
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return models.LogicFile{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	fileID := uuid.New()
	draftVersionID := uuid.New()
	lf, err := scanLogicFile(tx.QueryRow(ctx,
		`INSERT INTO logic_files
		        (id, name, description, project_id, folder_id, owner_id,
		         current_draft_version_id, execution_mode, run_history_max_rows,
		         run_history_dataset_rid, permissions)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING `+logicFileColumns,
		fileID, body.Name, body.Description, body.ProjectID, body.FolderID,
		ownerID, draftVersionID, executionMode, runHistoryMaxRows,
		body.RunHistoryDatasetRID, defaultLogicPermissions(ownerID, body.Permissions)))
	if err != nil {
		return models.LogicFile{}, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO logic_versions
		        (id, logic_file_id, version_number, author_id, status, definition, change_summary)
		 VALUES ($1, $2, 1, $3, 'draft', $4, $5)`,
		draftVersionID, fileID, ownerID, defaultLogicDefinition, defaultLogicChangeSummary); err != nil {
		return models.LogicFile{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return models.LogicFile{}, err
	}
	return lf, nil
}

func (r *Repo) GetLogicFile(ctx context.Context, id uuid.UUID, actorID uuid.UUID, includeArchived bool, admin bool) (*models.LogicFile, error) {
	query := `SELECT ` + logicFileColumns + ` FROM logic_files
	          WHERE id = $1
	            AND ($2::bool OR archived_at IS NULL)
	            AND ($4::bool OR owner_id = $3 OR permissions->'owners' ? $3::text OR permissions->'managers' ? $3::text OR permissions->'editors' ? $3::text OR permissions->'viewers' ? $3::text)`
	lf, err := scanLogicFile(r.Pool.QueryRow(ctx, query, id, includeArchived, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &lf, nil
}

func (r *Repo) ListLogicFiles(ctx context.Context, projectID, folderID *uuid.UUID, actorID uuid.UUID, includeArchived bool, admin bool) ([]models.LogicFile, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT `+logicFileColumns+` FROM logic_files
		  WHERE ($1::uuid IS NULL OR project_id = $1)
		    AND ($2::uuid IS NULL OR folder_id = $2)
		    AND ($3::bool OR archived_at IS NULL)
		    AND ($5::bool OR owner_id = $4 OR permissions->'owners' ? $4::text OR permissions->'managers' ? $4::text OR permissions->'editors' ? $4::text OR permissions->'viewers' ? $4::text)
		  ORDER BY updated_at DESC, created_at DESC`,
		nullableUUID(projectID), nullableUUID(folderID), includeArchived, actorID, admin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.LogicFile, 0)
	for rows.Next() {
		lf, err := scanLogicFile(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, lf)
	}
	return out, rows.Err()
}

func (r *Repo) UpdateLogicFileMetadata(ctx context.Context, id, actorID uuid.UUID, body models.UpdateLogicFileMetadataRequest, admin bool) (*models.LogicFile, error) {
	permissionPredicate := `($9::bool OR owner_id = $8 OR permissions->'owners' ? $8::text OR permissions->'managers' ? $8::text OR permissions->'editors' ? $8::text)`
	if body.Permissions != nil {
		permissionPredicate = `($9::bool OR owner_id = $8 OR permissions->'owners' ? $8::text OR permissions->'managers' ? $8::text)`
	}
	var maxRows *int32
	if body.RunHistoryMaxRows != nil {
		clamped := logicProjectScopedMaxRows(*body.RunHistoryMaxRows)
		maxRows = &clamped
	}
	row := r.Pool.QueryRow(ctx,
		`UPDATE logic_files
		    SET name = COALESCE($2, name),
		        description = COALESCE($3, description),
		        execution_mode = COALESCE($4, execution_mode),
		        run_history_max_rows = COALESCE($5, run_history_max_rows),
		        run_history_dataset_rid = COALESCE($6, run_history_dataset_rid),
		        permissions = COALESCE($7, permissions),
		        updated_at = now()
		  WHERE id = $1 AND archived_at IS NULL
		    AND `+permissionPredicate+`
		  RETURNING `+logicFileColumns,
		id, body.Name, body.Description, body.ExecutionMode, maxRows, body.RunHistoryDatasetRID, body.Permissions, actorID, admin)
	lf, err := scanLogicFile(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &lf, nil
}

func (r *Repo) MoveLogicFile(ctx context.Context, id, actorID uuid.UUID, body models.MoveLogicFileRequest, admin bool) (*models.LogicFile, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE logic_files
		    SET project_id = $2, folder_id = $3, updated_at = now()
		  WHERE id = $1 AND archived_at IS NULL
		    AND ($5::bool OR owner_id = $4 OR permissions->'owners' ? $4::text OR permissions->'managers' ? $4::text)
		  RETURNING `+logicFileColumns,
		id, body.ProjectID, body.FolderID, actorID, admin)
	lf, err := scanLogicFile(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &lf, nil
}

func (r *Repo) DuplicateLogicFile(ctx context.Context, id, actorID uuid.UUID, body models.DuplicateLogicFileRequest, admin bool) (*models.LogicFile, error) {
	newID := uuid.New()
	draftVersionID := uuid.New()
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	lf, err := scanLogicFile(tx.QueryRow(ctx,
		`INSERT INTO logic_files
		        (id, name, description, project_id, folder_id, owner_id,
		         current_draft_version_id, execution_mode, run_history_max_rows,
		         run_history_dataset_rid, permissions)
		 SELECT $1,
		        COALESCE($2, name || ' (copy)'),
		        COALESCE($3, description),
		        COALESCE($4, project_id),
		        COALESCE($5, folder_id),
		        $6,
		        $7,
		        execution_mode,
		        run_history_max_rows,
		        run_history_dataset_rid,
		        permissions
		   FROM logic_files
		  WHERE id = $8 AND archived_at IS NULL
		    AND ($10::bool OR owner_id = $9 OR permissions->'owners' ? $9::text OR permissions->'managers' ? $9::text OR permissions->'editors' ? $9::text)
		 RETURNING `+logicFileColumns,
		newID, body.Name, body.Description, nullableUUID(body.ProjectID), nullableUUID(body.FolderID), actorID, draftVersionID, id, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var sourceDefinition json.RawMessage
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(v.definition, $2::jsonb)
		   FROM logic_files lf
		   LEFT JOIN logic_versions v ON v.id = lf.current_draft_version_id
		  WHERE lf.id = $1`,
		id, defaultLogicDefinition).Scan(&sourceDefinition); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO logic_versions
		        (id, logic_file_id, version_number, author_id, status, definition, change_summary)
		 VALUES ($1, $2, 1, $3, 'draft', $4, $5)`,
		draftVersionID, newID, actorID, sourceDefinition, defaultLogicChangeSummary); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &lf, nil
}

func (r *Repo) ArchiveLogicFile(ctx context.Context, id, actorID uuid.UUID, admin bool) (*models.LogicFile, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE logic_files
		    SET archived_at = COALESCE(archived_at, now()), updated_at = now()
		  WHERE id = $1
		    AND ($3::bool OR owner_id = $2 OR permissions->'owners' ? $2::text OR permissions->'managers' ? $2::text)
		  RETURNING `+logicFileColumns,
		id, actorID, admin)
	lf, err := scanLogicFile(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &lf, nil
}

func (r *Repo) RestoreLogicFile(ctx context.Context, id, actorID uuid.UUID, admin bool) (*models.LogicFile, error) {
	row := r.Pool.QueryRow(ctx,
		`UPDATE logic_files
		    SET archived_at = NULL, updated_at = now()
		  WHERE id = $1 AND archived_at IS NOT NULL
		    AND ($3::bool OR owner_id = $2 OR permissions->'owners' ? $2::text OR permissions->'managers' ? $2::text)
		  RETURNING `+logicFileColumns,
		id, actorID, admin)
	lf, err := scanLogicFile(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &lf, nil
}

func (r *Repo) SaveLogicDraftVersion(ctx context.Context, fileID, actorID uuid.UUID, body models.SaveLogicDraftVersionRequest, admin bool) (*models.LogicVersion, error) {
	definition, err := normalizeJSONObject(body.Definition, nil)
	if err != nil {
		return nil, fmt.Errorf("definition must be a JSON object: %w", err)
	}
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentDraftVersionID uuid.UUID
	if err := tx.QueryRow(ctx,
		`SELECT current_draft_version_id
		   FROM logic_files
		  WHERE id = $1 AND archived_at IS NULL
		    AND ($3::bool OR owner_id = $2 OR permissions->'owners' ? $2::text OR permissions->'managers' ? $2::text OR permissions->'editors' ? $2::text)`,
		fileID, actorID, admin).Scan(&currentDraftVersionID); errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}

	baseDefinition := defaultLogicDefinition
	if err := tx.QueryRow(ctx,
		`SELECT definition FROM logic_versions WHERE id = $1 AND logic_file_id = $2`,
		currentDraftVersionID, fileID).Scan(&baseDefinition); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	summary := logicChangeSummaryJSON(BuildLogicVersionChangeSummary(baseDefinition, definition))
	versionID := uuid.New()
	version, err := scanLogicVersion(tx.QueryRow(ctx,
		`INSERT INTO logic_versions
		        (id, logic_file_id, version_number, author_id, status, definition, change_summary)
		 VALUES (
		        $1,
		        $2,
		        (SELECT COALESCE(MAX(version_number), 0) + 1 FROM logic_versions WHERE logic_file_id = $2),
		        $3,
		        'draft',
		        $4,
		        $5
		 )
		 RETURNING `+logicVersionColumns,
		versionID, fileID, actorID, definition, summary))
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE logic_files
		    SET current_draft_version_id = $2,
		        updated_at = now()
		  WHERE id = $1`,
		fileID, versionID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &version, nil
}

func (r *Repo) ListLogicVersions(ctx context.Context, fileID, actorID uuid.UUID, admin bool) ([]models.LogicVersion, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT v.`+strings.ReplaceAll(logicVersionColumns, ", ", ", v.")+`
		   FROM logic_versions v
		   JOIN logic_files lf ON lf.id = v.logic_file_id
		  WHERE v.logic_file_id = $1
		    AND lf.archived_at IS NULL
		    AND ($3::bool OR lf.owner_id = $2 OR lf.permissions->'owners' ? $2::text OR lf.permissions->'managers' ? $2::text OR lf.permissions->'editors' ? $2::text OR lf.permissions->'viewers' ? $2::text)
		  ORDER BY v.version_number DESC`,
		fileID, actorID, admin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.LogicVersion, 0)
	for rows.Next() {
		version, err := scanLogicVersion(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, version)
	}
	return out, rows.Err()
}

func (r *Repo) GetLogicVersion(ctx context.Context, fileID, versionID, actorID uuid.UUID, admin bool) (*models.LogicVersion, error) {
	version, err := scanLogicVersion(r.Pool.QueryRow(ctx,
		`SELECT v.`+strings.ReplaceAll(logicVersionColumns, ", ", ", v.")+`
		   FROM logic_versions v
		   JOIN logic_files lf ON lf.id = v.logic_file_id
		  WHERE v.logic_file_id = $1
		    AND v.id = $2
		    AND lf.archived_at IS NULL
		    AND ($4::bool OR lf.owner_id = $3 OR lf.permissions->'owners' ? $3::text OR lf.permissions->'managers' ? $3::text OR lf.permissions->'editors' ? $3::text OR lf.permissions->'viewers' ? $3::text)`,
		fileID, versionID, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &version, nil
}

func (r *Repo) CompareLogicVersions(ctx context.Context, fileID, baseVersionID, headVersionID, actorID uuid.UUID, admin bool) (*models.LogicVersionComparison, error) {
	base, err := r.GetLogicVersion(ctx, fileID, baseVersionID, actorID, admin)
	if err != nil || base == nil {
		return nil, err
	}
	head, err := r.GetLogicVersion(ctx, fileID, headVersionID, actorID, admin)
	if err != nil || head == nil {
		return nil, err
	}
	return &models.LogicVersionComparison{
		BaseVersionID:     base.ID,
		HeadVersionID:     head.ID,
		BaseVersionNumber: base.VersionNumber,
		HeadVersionNumber: head.VersionNumber,
		Summary:           BuildLogicVersionChangeSummary(base.Definition, head.Definition),
	}, nil
}

func (r *Repo) PublishLogicVersion(ctx context.Context, fileID, versionID, actorID uuid.UUID, body models.PublishLogicVersionRequest, admin bool) (*models.PublishLogicVersionResponse, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var version models.LogicVersion
	var fileName string
	err = tx.QueryRow(ctx,
		`SELECT v.id, v.logic_file_id, v.version_number, v.author_id, v.status,
		        v.definition, v.change_summary, v.published_at, v.created_at,
		        lf.name
		   FROM logic_versions v
		   JOIN logic_files lf ON lf.id = v.logic_file_id
		  WHERE v.logic_file_id = $1
		    AND v.id = $2
		    AND lf.archived_at IS NULL
		    AND ($4::bool OR lf.owner_id = $3 OR lf.permissions->'owners' ? $3::text OR lf.permissions->'managers' ? $3::text OR lf.permissions->'editors' ? $3::text)`,
		fileID, versionID, actorID, admin).Scan(
		&version.ID, &version.LogicFileID, &version.VersionNumber, &version.AuthorID, &version.Status,
		&version.Definition, &version.ChangeSummary, &version.PublishedAt, &version.CreatedAt,
		&fileName,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx,
		`UPDATE logic_versions
		    SET status = 'superseded'
		  WHERE logic_file_id = $1
		    AND status = 'published'
		    AND id <> $2`,
		fileID, versionID); err != nil {
		return nil, err
	}
	version, err = scanLogicVersion(tx.QueryRow(ctx,
		`UPDATE logic_versions
		    SET status = 'published',
		        published_at = now()
		  WHERE id = $1
		  RETURNING `+logicVersionColumns,
		versionID))
	if err != nil {
		return nil, err
	}

	functionRID := "logic." + fileID.String()
	if body.FunctionRID != nil && strings.TrimSpace(*body.FunctionRID) != "" {
		functionRID = strings.TrimSpace(*body.FunctionRID)
	}
	functionName := fileName
	if body.Name != nil && strings.TrimSpace(*body.Name) != "" {
		functionName = strings.TrimSpace(*body.Name)
	}
	signature := deriveLogicSignature(version.Definition)
	if body.Signature != nil {
		signature, err = normalizeJSONObject(*body.Signature, defaultLogicSignature)
		if err != nil {
			return nil, fmt.Errorf("signature must be a JSON object: %w", err)
		}
	}

	fn, err := scanLogicFunction(tx.QueryRow(ctx,
		`INSERT INTO logic_functions
		        (id, logic_file_id, published_version_id, function_rid, name, signature, definition, published_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (logic_file_id) DO UPDATE
		    SET published_version_id = EXCLUDED.published_version_id,
		        function_rid = EXCLUDED.function_rid,
		        name = EXCLUDED.name,
		        signature = EXCLUDED.signature,
		        definition = EXCLUDED.definition,
		        published_by = EXCLUDED.published_by,
		        published_at = now(),
		        updated_at = now()
		 RETURNING `+logicFunctionColumns,
		uuid.New(), fileID, version.ID, functionRID, functionName, signature, version.Definition, actorID))
	if err != nil {
		return nil, err
	}

	lf, err := scanLogicFile(tx.QueryRow(ctx,
		`UPDATE logic_files
		    SET published_version_id = $2,
		        updated_at = now()
		  WHERE id = $1
		  RETURNING `+logicFileColumns,
		fileID, version.ID))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &models.PublishLogicVersionResponse{
		LogicFile: lf,
		Version:   version,
		Function:  fn,
	}, nil
}

func (r *Repo) getPublishedLogicFunctionForFile(ctx context.Context, fileID, actorID uuid.UUID, admin bool) (*models.LogicFunction, error) {
	fn, err := scanLogicFunction(r.Pool.QueryRow(ctx,
		`SELECT f.`+strings.ReplaceAll(logicFunctionColumns, ", ", ", f.")+`
		   FROM logic_functions f
		   JOIN logic_files lf ON lf.id = f.logic_file_id
		  WHERE f.logic_file_id = $1
		    AND lf.archived_at IS NULL
		    AND lf.published_version_id = f.published_version_id
		    AND ($3::bool OR lf.owner_id = $2 OR lf.permissions->'owners' ? $2::text OR lf.permissions->'managers' ? $2::text OR lf.permissions->'editors' ? $2::text OR lf.permissions->'viewers' ? $2::text)`,
		fileID, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &fn, nil
}

func (r *Repo) getPublishedLogicFunctionByRID(ctx context.Context, functionRID string, actorID uuid.UUID, admin bool) (*models.LogicFunction, error) {
	fn, err := scanLogicFunction(r.Pool.QueryRow(ctx,
		`SELECT f.`+strings.ReplaceAll(logicFunctionColumns, ", ", ", f.")+`
		   FROM logic_functions f
		   JOIN logic_files lf ON lf.id = f.logic_file_id
		  WHERE f.function_rid = $1
		    AND lf.archived_at IS NULL
		    AND lf.published_version_id = f.published_version_id
		    AND ($3::bool OR lf.owner_id = $2 OR lf.permissions->'owners' ? $2::text OR lf.permissions->'managers' ? $2::text OR lf.permissions->'editors' ? $2::text OR lf.permissions->'invokers' ? $2::text)`,
		functionRID, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &fn, nil
}

type logicFunctionExecutionTarget struct {
	Function             models.LogicFunction
	ExecutionMode        string
	ProjectID            uuid.UUID
	RunHistoryMaxRows    int32
	RunHistoryDatasetRID *string
}

func (r *Repo) getPublishedLogicFunctionExecutionTarget(ctx context.Context, functionRID string, actorID uuid.UUID, admin bool) (*logicFunctionExecutionTarget, error) {
	var target logicFunctionExecutionTarget
	err := r.Pool.QueryRow(ctx,
		`SELECT f.id, f.logic_file_id, f.published_version_id, f.function_rid,
		        f.name, f.signature, f.definition, f.published_by, f.published_at, f.updated_at,
		        lf.execution_mode, lf.project_id, lf.run_history_max_rows, lf.run_history_dataset_rid, v.version_number
		   FROM logic_functions f
		   JOIN logic_files lf ON lf.id = f.logic_file_id
		   JOIN logic_versions v ON v.id = f.published_version_id
		  WHERE f.function_rid = $1
		    AND lf.archived_at IS NULL
		    AND lf.published_version_id = f.published_version_id
		    AND ($3::bool OR lf.owner_id = $2 OR lf.permissions->'owners' ? $2::text OR lf.permissions->'managers' ? $2::text OR lf.permissions->'editors' ? $2::text OR lf.permissions->'invokers' ? $2::text)`,
		functionRID, actorID, admin).Scan(
		&target.Function.ID, &target.Function.LogicFileID, &target.Function.PublishedVersionID, &target.Function.FunctionRID,
		&target.Function.Name, &target.Function.Signature, &target.Function.Definition, &target.Function.PublishedBy, &target.Function.PublishedAt, &target.Function.UpdatedAt,
		&target.ExecutionMode, &target.ProjectID, &target.RunHistoryMaxRows, &target.RunHistoryDatasetRID, &target.Function.PublishedVersionNumber,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &target, nil
}

func (r *Repo) GetLogicUsage(ctx context.Context, fileID, actorID uuid.UUID, baseURL string, admin bool) (*models.LogicUsageResponse, error) {
	lf, err := r.GetLogicFile(ctx, fileID, actorID, false, admin)
	if err != nil || lf == nil {
		return nil, err
	}
	usage := &models.LogicUsageResponse{
		LogicFileID: fileID,
		Published:   false,
		Surfaces:    buildUnpublishedLogicUsageSurfaces(),
	}
	if lf.PublishedVersionID == nil {
		return usage, nil
	}
	fn, err := r.getPublishedLogicFunctionForFile(ctx, fileID, actorID, admin)
	if err != nil || fn == nil {
		return usage, err
	}
	returnsOntologyEdits := logicDefinitionReturnsOntologyEdits(fn.Definition)
	usage.Published = true
	usage.Function = fn
	usage.ReturnsOntologyEdits = returnsOntologyEdits
	usage.Surfaces = buildLogicUsageSurfaces(*fn, returnsOntologyEdits, baseURL)
	return usage, nil
}

func invocationSurface(surface *string) string {
	if surface == nil || strings.TrimSpace(*surface) == "" {
		return "api"
	}
	return strings.TrimSpace(*surface)
}

func invocationInputs(body models.InvokeLogicFunctionRequest) (json.RawMessage, error) {
	inputs := body.Inputs
	if strings.TrimSpace(string(inputs)) == "" {
		inputs = body.Parameters
	}
	return normalizeJSONObject(inputs, json.RawMessage(`{}`))
}

func (r *Repo) InvokeLogicFunction(ctx context.Context, functionRID string, actorID uuid.UUID, body models.InvokeLogicFunctionRequest, admin bool) (*models.InvokeLogicFunctionResponse, error) {
	functionRID = strings.TrimSpace(functionRID)
	if functionRID == "" {
		return nil, nil
	}
	target, err := r.getPublishedLogicFunctionExecutionTarget(ctx, functionRID, actorID, admin)
	if err != nil || target == nil {
		return nil, err
	}
	fn := target.Function
	if logicDefinitionReturnsOntologyEdits(fn.Definition) {
		return nil, ErrLogicFunctionAPINotSupported
	}
	inputs, err := invocationInputs(body)
	if err != nil {
		return nil, fmt.Errorf("inputs must be a JSON object: %w", err)
	}
	now := time.Now().UTC()
	execContext := logicExecutionContextWithSettings(target.ExecutionMode, actorID, target.ProjectID, now, target.RunHistoryMaxRows, target.RunHistoryDatasetRID)
	securityBoundary := logicSecurityBoundary(fn.Definition, execContext)
	if !securityBoundary.Ready {
		if len(securityBoundary.Issues) > 0 {
			return nil, fmt.Errorf("logic security boundary denied: %s", securityBoundary.Issues[0].Message)
		}
		return nil, errors.New("logic security boundary denied")
	}
	surface := invocationSurface(body.InvocationSurface)
	outputs := logicInvocationOutputs(fn.Definition)
	durationMS := int32(90 + len(logicArrayField(fn.Definition, "blocks"))*45 + len(inputs)/16)
	logs := logicRunLogs(fn, execContext, surface)

	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `DELETE FROM logic_runs WHERE retention_expires_at <= now()`); err != nil {
		return nil, err
	}
	run, err := insertLogicRun(ctx, tx, fn, execContext, surface, "succeeded", inputs, outputs, nil, logs, durationMS, now)
	if err != nil {
		return nil, err
	}
	if execContext.RunHistoryDatasetRID != nil {
		if err := pruneLogicRunHistoryDataset(ctx, tx, *execContext.RunHistoryDatasetRID, execContext.RunHistoryMaxRows); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &models.InvokeLogicFunctionResponse{
		Function:          fn,
		ExecutionContext:  execContext,
		Run:               run,
		InvocationSurface: surface,
		Status:            "succeeded",
		Inputs:            inputs,
		Outputs:           outputs,
		SecurityBoundary:  securityBoundary,
	}, nil
}

func (r *Repo) ListLogicRuns(ctx context.Context, fileID, actorID uuid.UUID, admin bool) ([]models.LogicRun, error) {
	if _, err := r.Pool.Exec(ctx, `DELETE FROM logic_runs WHERE retention_expires_at <= now()`); err != nil {
		return nil, err
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT r.`+strings.ReplaceAll(logicRunColumns, ", ", ", r.")+`
		   FROM logic_runs r
		   JOIN logic_files lf ON lf.id = r.logic_file_id
		  WHERE r.logic_file_id = $1
		    AND lf.archived_at IS NULL
		    AND r.retention_expires_at > now()
		    AND (
		      (r.execution_mode = 'user_scoped' AND r.actor_id = $2)
		      OR
		      (r.execution_mode = 'project_scoped' AND ($3::bool OR lf.owner_id = $2 OR lf.permissions->'owners' ? $2::text OR lf.permissions->'managers' ? $2::text OR lf.permissions->'editors' ? $2::text OR lf.permissions->'viewers' ? $2::text))
		    )
		  ORDER BY r.created_at DESC
		  LIMIT 100`,
		fileID, actorID, admin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.LogicRun, 0)
	for rows.Next() {
		run, err := scanLogicRun(rows)
		if err != nil {
			return nil, err
		}
		if logicRunVisibleToActor(run, actorID, admin) {
			out = append(out, run)
		}
	}
	return out, rows.Err()
}

func (r *Repo) GetLogicMetrics(ctx context.Context, fileID, actorID uuid.UUID, window string, admin bool) (*models.LogicMetricsResponse, error) {
	lf, err := r.GetLogicFile(ctx, fileID, actorID, false, admin)
	if err != nil || lf == nil {
		return nil, err
	}
	now := time.Now().UTC()
	windowLabel, windowStart := logicMetricsWindow(window, now)
	if _, err := r.Pool.Exec(ctx, `DELETE FROM logic_runs WHERE retention_expires_at <= now()`); err != nil {
		return nil, err
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT r.`+strings.ReplaceAll(logicRunColumns, ", ", ", r.")+`
		   FROM logic_runs r
		   JOIN logic_files lf ON lf.id = r.logic_file_id
		  WHERE r.logic_file_id = $1
		    AND lf.archived_at IS NULL
		    AND r.created_at >= $4
		    AND r.created_at <= $5
		    AND r.retention_expires_at > now()
		    AND (
		      (r.execution_mode = 'user_scoped' AND r.actor_id = $2)
		      OR
		      (r.execution_mode = 'project_scoped' AND ($3::bool OR lf.owner_id = $2 OR lf.permissions->'owners' ? $2::text OR lf.permissions->'managers' ? $2::text OR lf.permissions->'editors' ? $2::text OR lf.permissions->'viewers' ? $2::text))
		    )
		  ORDER BY r.created_at DESC
		  LIMIT 500`,
		lf.ID, actorID, admin, windowStart, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := make([]models.LogicRun, 0)
	for rows.Next() {
		run, err := scanLogicRun(rows)
		if err != nil {
			return nil, err
		}
		if logicRunVisibleToActor(run, actorID, admin) {
			runs = append(runs, run)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	metrics := buildLogicMetrics(lf.ID, runs, windowLabel, windowStart, now)
	return &metrics, nil
}
