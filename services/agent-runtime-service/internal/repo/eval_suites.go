package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

const evalSuiteColumns = `id, name, description, project_id, folder_id, owner_id,
                         target_functions, test_case_columns, test_cases, evaluators, run_history,
                         results_dataset_rid, permissions, source_surface, source_resource_id,
                         archived_at, created_at, updated_at`

var defaultEvalArray = json.RawMessage(`[]`)

type evalTargetFunction struct {
	ID      string
	Kind    string
	Version string
	Inputs  map[string]string
	Outputs map[string]string
}

type evalColumnDefinition struct {
	APIName string
	Type    string
	Role    string
}

func evalStringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case fmt.Stringer:
		return strings.TrimSpace(typed.String())
	default:
		return ""
	}
}

func scanEvaluationSuite(s scanner) (models.EvaluationSuite, error) {
	var suite models.EvaluationSuite
	err := s.Scan(
		&suite.ID, &suite.Name, &suite.Description, &suite.ProjectID, &suite.FolderID, &suite.OwnerID,
		&suite.TargetFunctions, &suite.TestCaseColumns, &suite.TestCases, &suite.Evaluators, &suite.RunHistory,
		&suite.ResultsDatasetRID, &suite.Permissions, &suite.SourceSurface, &suite.SourceResourceID,
		&suite.ArchivedAt, &suite.CreatedAt, &suite.UpdatedAt,
	)
	return suite, err
}

func cloneRawMessage(raw json.RawMessage) json.RawMessage {
	return append(json.RawMessage(nil), raw...)
}

func normalizeJSONArray(raw json.RawMessage, fallback json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return cloneRawMessage(fallback), nil
	}
	var value []any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	if value == nil {
		return nil, errors.New("json body must be an array")
	}
	normalized, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(normalized), nil
}

func normalizeJSONArrayObjects(raw json.RawMessage, fallback json.RawMessage, label string) ([]map[string]any, json.RawMessage, error) {
	normalized, err := normalizeJSONArray(raw, fallback)
	if err != nil {
		return nil, nil, err
	}
	var values []any
	if err := json.Unmarshal(normalized, &values); err != nil {
		return nil, nil, err
	}
	out := make([]map[string]any, 0, len(values))
	for idx, item := range values {
		value, ok := item.(map[string]any)
		if !ok {
			return nil, nil, fmt.Errorf("%s[%d] must be a JSON object", label, idx)
		}
		out = append(out, value)
	}
	return out, normalized, nil
}

func normalizeEvalSourceSurface(surface *string) string {
	if surface == nil {
		return "aip_evals_app"
	}
	switch *surface {
	case "logic_preview", "evals_sidebar", "aip_evals_app", "code_function_published", "api":
		return *surface
	default:
		return "aip_evals_app"
	}
}

func normalizeEvalTargetKind(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "logic", "aip_logic":
		return "logic"
	case "agent", "agent_like", "aip_agent", "chatbot", "chatbot_function":
		return "agent_like"
	case "code", "code_function", "function", "function_package", "python", "typescript":
		return "code_function"
	default:
		return ""
	}
}

func evalTargetVersion(target map[string]any, kind string) string {
	version := strings.ToLower(strings.TrimSpace(stringField(target, "version", "version_selector", "versionSelector", "target_version", "targetVersion")))
	if version != "" {
		return version
	}
	if kind == "agent_like" {
		return "current"
	}
	return "published"
}

func evalVersionSelectorAvailable(target map[string]any, kind, version string) bool {
	switch kind {
	case "logic":
		switch version {
		case "published", "last_saved", "last_saved_or_preview", "draft":
			return true
		case "specific":
			return stringField(target, "version_id", "versionId", "published_version_id", "publishedVersionId") != ""
		}
	case "agent_like":
		switch version {
		case "current", "published", "latest":
			return true
		case "specific":
			return stringField(target, "version_id", "versionId", "published_version_id", "publishedVersionId") != ""
		}
	case "code_function":
		switch version {
		case "published", "latest":
			return true
		case "specific":
			return stringField(target, "version_id", "versionId", "published_version_id", "publishedVersionId") != ""
		}
	}
	return false
}

func evalTargetIdentifier(target map[string]any, kind string) string {
	switch kind {
	case "logic":
		return stringField(target, "id", "function_rid", "functionRid", "logic_file_id", "logicFileId")
	case "agent_like":
		return stringField(target, "id", "agent_id", "agentId", "agent_rid", "agentRid", "function_rid", "functionRid")
	case "code_function":
		return stringField(target, "id", "function_rid", "functionRid", "package_id", "packageId")
	default:
		return stringField(target, "id")
	}
}

func evalSignatureObject(target map[string]any) (map[string]any, bool) {
	signature, ok := target["signature"].(map[string]any)
	if ok {
		return signature, true
	}
	inputs, hasInputs := target["inputs"]
	outputs, hasOutputs := target["outputs"]
	if !hasInputs && !hasOutputs {
		return nil, false
	}
	return map[string]any{"inputs": inputs, "outputs": outputs}, true
}

func evalNormalizeType(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func evalSignatureFields(signature map[string]any, key string, targetID string) (map[string]string, error) {
	rawItems, ok := signature[key].([]any)
	if !ok {
		return nil, fmt.Errorf("target function %q signature.%s must be an array", targetID, key)
	}
	fields := make(map[string]string, len(rawItems))
	for idx, item := range rawItems {
		field, ok := item.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("target function %q signature.%s[%d] must be a JSON object", targetID, key, idx)
		}
		name := stringField(field, "apiName", "api_name", "name", "id")
		valueType := stringField(field, "type", "outputType", "output_type", "kind")
		if name == "" || strings.TrimSpace(valueType) == "" {
			return nil, fmt.Errorf("target function %q signature.%s[%d] must include apiName/name and type/outputType", targetID, key, idx)
		}
		fields[name] = evalNormalizeType(valueType)
	}
	return fields, nil
}

func normalizeEvalTargetFunctions(raw json.RawMessage) (json.RawMessage, []evalTargetFunction, error) {
	items, normalized, err := normalizeJSONArrayObjects(raw, defaultEvalArray, "target_functions")
	if err != nil {
		return nil, nil, fmt.Errorf("target_functions must be a JSON array: %w", err)
	}
	targets := make([]evalTargetFunction, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for idx, target := range items {
		kind := normalizeEvalTargetKind(stringField(target, "kind", "type", "function_kind", "functionKind"))
		if kind == "" {
			return nil, nil, fmt.Errorf("target_functions[%d] kind must be logic, agent_like, or code_function", idx)
		}
		id := evalTargetIdentifier(target, kind)
		if id == "" {
			return nil, nil, fmt.Errorf("target_functions[%d] must include an id/function RID for %s", idx, kind)
		}
		if _, ok := seen[id]; ok {
			return nil, nil, fmt.Errorf("target function %q is duplicated", id)
		}
		seen[id] = struct{}{}
		version := evalTargetVersion(target, kind)
		if !evalVersionSelectorAvailable(target, kind, version) {
			return nil, nil, fmt.Errorf("target function %q has unavailable version selector %q", id, version)
		}
		signature, ok := evalSignatureObject(target)
		if !ok {
			return nil, nil, fmt.Errorf("target function %q must include input/output signature", id)
		}
		inputs, err := evalSignatureFields(signature, "inputs", id)
		if err != nil {
			return nil, nil, err
		}
		outputs, err := evalSignatureFields(signature, "outputs", id)
		if err != nil {
			return nil, nil, err
		}
		targets = append(targets, evalTargetFunction{ID: id, Kind: kind, Version: version, Inputs: inputs, Outputs: outputs})
	}
	return normalized, targets, nil
}

func normalizeEvalColumnRole(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "input", "function_input":
		return "input"
	case "expected", "expected_output", "expected_value":
		return "expected_output"
	case "intermediate", "intermediate_parameter", "block_output", "evaluator_input":
		return "intermediate_parameter"
	case "metadata", "meta":
		return "metadata"
	default:
		return ""
	}
}

func evalTypesCompatible(expected, actual string) bool {
	expected = evalNormalizeType(expected)
	actual = evalNormalizeType(actual)
	if expected == "" || actual == "" {
		return false
	}
	if expected == actual || actual == "any" || actual == "json" || expected == "json" {
		return true
	}
	numeric := map[string]struct{}{"integer": {}, "long": {}, "short": {}, "float": {}, "double": {}, "numeric": {}}
	_, expectedNumeric := numeric[expected]
	_, actualNumeric := numeric[actual]
	if expectedNumeric && actualNumeric {
		return true
	}
	if (expected == "list" || expected == "array") && (actual == "list" || actual == "array") {
		return true
	}
	if (expected == "object_list" || expected == "object_set") && (actual == "object_list" || actual == "object_set" || actual == "list" || actual == "array") {
		return true
	}
	return false
}

func normalizeEvalColumns(raw json.RawMessage, targets []evalTargetFunction) (json.RawMessage, map[string]evalColumnDefinition, error) {
	items, normalized, err := normalizeJSONArrayObjects(raw, defaultEvalArray, "test_case_columns")
	if err != nil {
		return nil, nil, fmt.Errorf("test_case_columns must be a JSON array: %w", err)
	}
	columns := make(map[string]evalColumnDefinition, len(items))
	for idx, column := range items {
		name := stringField(column, "apiName", "api_name", "name", "id")
		if name == "" {
			return nil, nil, fmt.Errorf("test_case_columns[%d] must include apiName/name", idx)
		}
		if _, ok := columns[name]; ok {
			return nil, nil, fmt.Errorf("test_case_columns[%d] duplicates apiName/name %q", idx, name)
		}
		valueType := evalNormalizeType(stringField(column, "type", "valueType", "value_type", "outputType", "output_type"))
		if valueType == "" {
			return nil, nil, fmt.Errorf("test_case_columns[%d] must include a type", idx)
		}
		role := normalizeEvalColumnRole(stringField(column, "role", "kind"))
		if role == "" {
			return nil, nil, fmt.Errorf("test_case_columns[%d] role must be input, expected_output, intermediate_parameter, or metadata", idx)
		}
		columns[name] = evalColumnDefinition{APIName: name, Type: valueType, Role: role}
	}
	inputColumnsByTarget := make(map[string][]string)
	intermediateColumnsByTarget := make(map[string][]string)
	for _, target := range targets {
		for inputName, inputType := range target.Inputs {
			column, ok := columns[inputName]
			if !ok {
				return nil, nil, fmt.Errorf("target %q input %q is missing a test-case input column", target.ID, inputName)
			}
			if column.Role != "input" {
				return nil, nil, fmt.Errorf("test-case column %q must have input role for target %q", inputName, target.ID)
			}
			if !evalTypesCompatible(inputType, column.Type) {
				return nil, nil, fmt.Errorf("test-case column %q type %q is not compatible with target %q input type %q", inputName, column.Type, target.ID, inputType)
			}
			inputColumnsByTarget[inputName] = append(inputColumnsByTarget[inputName], target.ID)
		}
		for outputName, outputType := range target.Outputs {
			column, ok := columns[outputName]
			if !ok || column.Role != "intermediate_parameter" {
				continue
			}
			if !evalTypesCompatible(outputType, column.Type) {
				return nil, nil, fmt.Errorf("intermediate parameter column %q type %q is not compatible with target %q output type %q", outputName, column.Type, target.ID, outputType)
			}
			intermediateColumnsByTarget[outputName] = append(intermediateColumnsByTarget[outputName], target.ID)
		}
	}
	for _, column := range columns {
		if column.Role == "input" {
			if _, ok := inputColumnsByTarget[column.APIName]; !ok && len(targets) > 0 {
				return nil, nil, fmt.Errorf("input column %q does not map to any target function input", column.APIName)
			}
		}
		if column.Role == "intermediate_parameter" {
			if _, ok := intermediateColumnsByTarget[column.APIName]; !ok && len(targets) > 0 {
				return nil, nil, fmt.Errorf("intermediate parameter column %q does not map to any target function output", column.APIName)
			}
		}
	}
	return normalized, columns, nil
}

func evaluatorMappingObject(evaluator map[string]any) (map[string]any, bool) {
	for _, key := range []string{"mappings", "mapping", "parameterMappings", "parameter_mappings"} {
		value, ok := evaluator[key].(map[string]any)
		if ok {
			return value, true
		}
	}
	return nil, false
}

func evaluatorTargetMappingsObject(evaluator map[string]any) (map[string]any, bool) {
	for _, key := range []string{"target_mappings", "targetMappings", "mappings_by_target", "mappingsByTarget"} {
		value, ok := evaluator[key].(map[string]any)
		if ok {
			return value, true
		}
	}
	return nil, false
}

func stringMappingValue(mapping map[string]any, keys ...string) string {
	for _, key := range keys {
		switch value := mapping[key].(type) {
		case string:
			if strings.TrimSpace(value) != "" {
				return value
			}
		case map[string]any:
			name := stringField(value, "apiName", "api_name", "name", "column", "field")
			if name != "" {
				return name
			}
		}
	}
	return ""
}

func targetByID(targets []evalTargetFunction) map[string]evalTargetFunction {
	out := make(map[string]evalTargetFunction, len(targets))
	for _, target := range targets {
		out[target.ID] = target
	}
	return out
}

func validateEvaluatorMapping(evaluatorID string, target evalTargetFunction, columns map[string]evalColumnDefinition, mapping map[string]any, allowOntologyEditActual bool) error {
	actual := stringMappingValue(mapping, "actual", "actualValue", "actual_value", "functionOutput", "function_output", "output", "outputApiName", "output_api_name")
	actualType := ""
	if actual != "" {
		var ok bool
		actualType, ok = target.Outputs[actual]
		if !ok {
			return fmt.Errorf("evaluator %q maps actual value %q that is not an output of target %q", evaluatorID, actual, target.ID)
		}
		if actualType == "ontology_edit_bundle" && !allowOntologyEditActual {
			return fmt.Errorf("evaluator %q maps Ontology edit output %q; use a custom evaluator function or map an intermediate parameter instead", evaluatorID, actual)
		}
	}
	expected := stringMappingValue(mapping, "expected", "expectedValue", "expected_value", "expectedColumn", "expected_column", "column", "columnApiName", "column_api_name")
	if expected != "" {
		column, ok := columns[expected]
		if !ok {
			return fmt.Errorf("evaluator %q maps expected value %q that is not a test-case column", evaluatorID, expected)
		}
		if column.Role != "expected_output" {
			return fmt.Errorf("evaluator %q maps expected value %q to a non-expected-output column", evaluatorID, expected)
		}
		if actualType != "" && !evalTypesCompatible(actualType, column.Type) {
			return fmt.Errorf("evaluator %q expected column %q type %q is not compatible with target %q output type %q", evaluatorID, expected, column.Type, target.ID, actualType)
		}
	}
	return nil
}

var builtinEvaluatorAliases = map[string]string{
	"exact_match":          "exact_match",
	"exact_string_match":   "exact_match",
	"regex":                "regex",
	"regex_match":          "regex",
	"distance":             "distance",
	"levenshtein_distance": "distance",
	"length":               "length",
	"string_length":        "length",
	"keyword":              "keyword",
	"keyword_checker":      "keyword",
	"object":               "object_match",
	"object_match":         "object_match",
	"exact_object_match":   "object_match",
	"object_set":           "object_set_match",
	"object_set_match":     "object_set_match",
	"object_set_contains":  "object_set_match",
	"integer_range":        "integer_range",
	"numeric_range":        "numeric_range",
	"floating_point_range": "floating_point_range",
	"float_range":          "floating_point_range",
	"temporal_range":       "temporal_range",
}

func normalizeBuiltinEvaluatorName(raw string) string {
	return builtinEvaluatorAliases[strings.ToLower(strings.TrimSpace(raw))]
}

func evaluatorObject(evaluator map[string]any, keys ...string) (map[string]any, bool, error) {
	for _, key := range keys {
		value, exists := evaluator[key]
		if !exists || value == nil {
			continue
		}
		object, ok := value.(map[string]any)
		if !ok {
			return nil, false, fmt.Errorf("%s must be a JSON object", key)
		}
		return object, true, nil
	}
	return nil, false, nil
}

func evalNumberValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func evalStringArrayOrCSV(value any) bool {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed) != ""
	case []any:
		if len(typed) == 0 {
			return false
		}
		for _, item := range typed {
			if text, ok := item.(string); !ok || strings.TrimSpace(text) == "" {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func validateEvalNumberConfig(evaluatorID, field string, value any, integerOnly bool) error {
	number, ok := evalNumberValue(value)
	if !ok {
		return fmt.Errorf("evaluator %q config.%s must be numeric", evaluatorID, field)
	}
	if integerOnly && number != float64(int64(number)) {
		return fmt.Errorf("evaluator %q config.%s must be an integer", evaluatorID, field)
	}
	return nil
}

func validateEvalTemporalConfig(evaluatorID, field string, value any) error {
	text, ok := value.(string)
	if !ok || strings.TrimSpace(text) == "" {
		return fmt.Errorf("evaluator %q config.%s must be a date or timestamp string", evaluatorID, field)
	}
	if _, err := time.Parse(time.RFC3339, text); err == nil {
		return nil
	}
	if _, err := time.Parse("2006-01-02", text); err == nil {
		return nil
	}
	return fmt.Errorf("evaluator %q config.%s must be a valid date or timestamp", evaluatorID, field)
}

func validateEvalObjective(evaluatorID string, evaluator map[string]any) error {
	objective, ok, err := evaluatorObject(evaluator, "objective", "metricObjective", "metric_objective")
	if err != nil || !ok {
		return err
	}
	if target, exists := objective["target"]; exists {
		if _, ok := target.(bool); !ok {
			if _, ok := evalNumberValue(target); !ok {
				return fmt.Errorf("evaluator %q objective.target must be boolean or numeric", evaluatorID)
			}
		}
	}
	if threshold, exists := objective["threshold"]; exists {
		if _, ok := evalNumberValue(threshold); !ok {
			return fmt.Errorf("evaluator %q objective.threshold must be numeric", evaluatorID)
		}
	}
	for _, key := range []string{"min", "max"} {
		if value, exists := objective[key]; exists {
			if _, ok := evalNumberValue(value); !ok {
				return fmt.Errorf("evaluator %q objective.%s must be numeric", evaluatorID, key)
			}
		}
	}
	direction := strings.ToLower(strings.TrimSpace(stringField(objective, "direction", "optimizationDirection", "optimization_direction")))
	if direction == "" {
		if _, hasThreshold := objective["threshold"]; hasThreshold {
			return fmt.Errorf("evaluator %q numeric objective direction must be maximize or minimize", evaluatorID)
		}
		return nil
	}
	if direction != "maximize" && direction != "minimize" {
		return fmt.Errorf("evaluator %q numeric objective direction must be maximize or minimize", evaluatorID)
	}
	return nil
}

func validateBuiltInEvaluatorConfig(evaluatorID, name string, evaluator map[string]any) error {
	config, ok, err := evaluatorObject(evaluator, "config", "configuration", "parameters")
	if err != nil || !ok {
		return err
	}
	switch name {
	case "regex":
		if value, exists := config["pattern"]; exists {
			if text, ok := value.(string); !ok || strings.TrimSpace(text) == "" {
				return fmt.Errorf("evaluator %q regex config.pattern must be a non-empty string", evaluatorID)
			}
		}
	case "keyword":
		if value, exists := config["keywords"]; exists && !evalStringArrayOrCSV(value) {
			return fmt.Errorf("evaluator %q keyword config.keywords must be a non-empty string or string array", evaluatorID)
		}
	case "integer_range", "numeric_range", "floating_point_range":
		integerOnly := name == "integer_range"
		for _, field := range []string{"min", "max"} {
			if value, exists := config[field]; exists {
				if err := validateEvalNumberConfig(evaluatorID, field, value, integerOnly); err != nil {
					return err
				}
			}
		}
	case "temporal_range":
		for _, field := range []string{"min", "max"} {
			if value, exists := config[field]; exists {
				if err := validateEvalTemporalConfig(evaluatorID, field, value); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func validateBuiltInEvaluator(evaluatorID string, evaluator map[string]any) error {
	kind := strings.ToLower(strings.TrimSpace(stringField(evaluator, "kind", "type")))
	name := normalizeBuiltinEvaluatorName(stringField(evaluator, "evaluator", "name", "function", "evaluator_name", "evaluatorName"))
	if kind == "" && name == "" {
		return nil
	}
	if kind != "" && kind != "built_in" && kind != "builtin" {
		return nil
	}
	if name == "" {
		return fmt.Errorf("evaluator %q must use a supported built-in evaluator", evaluatorID)
	}
	if err := validateBuiltInEvaluatorConfig(evaluatorID, name, evaluator); err != nil {
		return err
	}
	return validateEvalObjective(evaluatorID, evaluator)
}

func isCustomEvaluatorKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "custom_function", "custom", "function", "function_evaluator", "marketplace_function", "marketplace_deployed", "marketplace":
		return true
	default:
		return false
	}
}

func isMarketplaceEvaluatorKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "marketplace_function", "marketplace_deployed", "marketplace":
		return true
	default:
		return false
	}
}

func customEvaluatorFunctionKind(evaluator map[string]any) string {
	raw := strings.ToLower(strings.TrimSpace(stringField(evaluator, "function_kind", "functionKind", "language", "runtime")))
	switch raw {
	case "ts", "typescript":
		return "typescript"
	case "py", "python":
		return "python"
	case "logic", "aip_logic":
		return "logic"
	default:
		return raw
	}
}

func evalReturnSignatureOutputs(evaluator map[string]any) ([]any, bool, error) {
	signature, ok, err := evaluatorObject(evaluator, "return_signature", "returnSignature", "output_signature", "outputSignature")
	if err != nil || !ok {
		return nil, false, err
	}
	rawOutputs, ok := signature["outputs"].([]any)
	if !ok {
		return nil, true, errors.New("return_signature.outputs must be an array")
	}
	return rawOutputs, true, nil
}

func evalReturnNestedFields(field map[string]any) ([]any, bool, error) {
	for _, key := range []string{"fields", "struct_fields", "structFields", "properties", "outputs"} {
		value, exists := field[key]
		if !exists || value == nil {
			continue
		}
		fields, ok := value.([]any)
		if !ok {
			return nil, false, fmt.Errorf("%s must be an array", key)
		}
		return fields, true, nil
	}
	return nil, false, nil
}

func evalCustomReturnMetricAndDebugCounts(items []any, evaluatorID, path string) (int, int, error) {
	metricCount := 0
	debugCount := 0
	for idx, item := range items {
		field, ok := item.(map[string]any)
		if !ok {
			return 0, 0, fmt.Errorf("custom evaluator %q return %s[%d] must be a JSON object", evaluatorID, path, idx)
		}
		name := stringField(field, "apiName", "api_name", "name", "id")
		valueType := evalNormalizeType(stringField(field, "type", "outputType", "output_type", "kind"))
		if name == "" || valueType == "" {
			return 0, 0, fmt.Errorf("custom evaluator %q return %s[%d] must include apiName/name and type/outputType", evaluatorID, path, idx)
		}
		fields, hasFields, err := evalReturnNestedFields(field)
		if err != nil {
			return 0, 0, fmt.Errorf("custom evaluator %q return %s[%d].%w", evaluatorID, path, idx, err)
		}
		if hasFields || valueType == "struct" {
			if len(fields) == 0 {
				return 0, 0, fmt.Errorf("custom evaluator %q struct return %q must include fields", evaluatorID, name)
			}
			nestedMetrics, nestedDebug, err := evalCustomReturnMetricAndDebugCounts(fields, evaluatorID, path+"."+name)
			if err != nil {
				return 0, 0, err
			}
			metricCount += nestedMetrics
			debugCount += nestedDebug
			continue
		}
		switch valueType {
		case "boolean", "bool", "integer", "long", "short", "float", "double", "numeric", "number":
			metricCount++
		case "string", "str", "text":
			debugCount++
		}
	}
	return metricCount, debugCount, nil
}

func validateCustomMetricObjectives(evaluatorID string, evaluator map[string]any) error {
	objectives, ok, err := evaluatorObject(evaluator, "metric_objectives", "metricObjectives")
	if err != nil || !ok {
		return err
	}
	for metricName, rawObjective := range objectives {
		objective, ok := rawObjective.(map[string]any)
		if !ok {
			return fmt.Errorf("custom evaluator %q metric_objectives.%s must be a JSON object", evaluatorID, metricName)
		}
		if err := validateEvalObjective(evaluatorID+"."+metricName, map[string]any{"objective": objective}); err != nil {
			return err
		}
	}
	return nil
}

func validateCustomEvaluator(evaluatorID string, evaluator map[string]any) error {
	kind := stringField(evaluator, "kind", "type")
	if !isCustomEvaluatorKind(kind) {
		return nil
	}
	if isMarketplaceEvaluatorKind(kind) {
		if stringField(evaluator, "marketplace_product_slug", "marketplaceProductSlug", "marketplace_listing_id", "marketplaceListingId") == "" {
			return fmt.Errorf("marketplace evaluator %q must include Marketplace product packaging metadata", evaluatorID)
		}
		status := strings.ToLower(strings.TrimSpace(stringField(evaluator, "marketplace_install_status", "marketplaceInstallStatus", "install_status", "installStatus")))
		if status != "" && status != "installed" {
			return fmt.Errorf("marketplace evaluator %q must be installed before it can run", evaluatorID)
		}
	}
	functionRID := stringField(evaluator, "function_rid", "functionRid", "function", "evaluator")
	if functionRID == "" {
		return fmt.Errorf("custom evaluator %q must reference a published TypeScript, Python, or Logic function", evaluatorID)
	}
	functionKind := customEvaluatorFunctionKind(evaluator)
	switch functionKind {
	case "typescript", "python", "logic":
	default:
		return fmt.Errorf("custom evaluator %q function_kind must be typescript, python, or logic", evaluatorID)
	}
	version := strings.ToLower(strings.TrimSpace(stringField(evaluator, "version", "version_selector", "versionSelector")))
	if version == "" {
		version = "published"
	}
	if version != "published" {
		return fmt.Errorf("custom evaluator %q must use a published function version", evaluatorID)
	}
	outputs, ok, err := evalReturnSignatureOutputs(evaluator)
	if err != nil {
		return fmt.Errorf("custom evaluator %q %w", evaluatorID, err)
	}
	if !ok {
		return fmt.Errorf("custom evaluator %q must include return_signature outputs", evaluatorID)
	}
	metricCount, _, err := evalCustomReturnMetricAndDebugCounts(outputs, evaluatorID, "outputs")
	if err != nil {
		return err
	}
	if metricCount == 0 {
		return fmt.Errorf("custom evaluator %q must return at least one Boolean or numeric metric", evaluatorID)
	}
	if err := validateCustomMetricObjectives(evaluatorID, evaluator); err != nil {
		return err
	}
	return validateEvalObjective(evaluatorID, evaluator)
}

func normalizeEvalEvaluators(raw json.RawMessage, targets []evalTargetFunction, columns map[string]evalColumnDefinition) (json.RawMessage, error) {
	items, normalized, err := normalizeJSONArrayObjects(raw, defaultEvalArray, "evaluators")
	if err != nil {
		return nil, fmt.Errorf("evaluators must be a JSON array: %w", err)
	}
	if len(items) == 0 {
		return normalized, nil
	}
	if len(targets) == 0 {
		return nil, errors.New("evaluators require at least one target function")
	}
	targetsByID := targetByID(targets)
	for idx, evaluator := range items {
		evaluatorID := stringField(evaluator, "id", "name", "evaluator")
		if evaluatorID == "" {
			evaluatorID = fmt.Sprintf("evaluators[%d]", idx)
		}
		if err := validateBuiltInEvaluator(evaluatorID, evaluator); err != nil {
			return nil, err
		}
		if err := validateCustomEvaluator(evaluatorID, evaluator); err != nil {
			return nil, err
		}
		allowsOntologyEdits := isCustomEvaluatorKind(stringField(evaluator, "kind", "type"))
		targetID := stringField(evaluator, "target_id", "targetId")
		targetMappings, hasTargetMappings := evaluatorTargetMappingsObject(evaluator)
		if len(targets) > 1 && targetID == "" && !hasTargetMappings {
			return nil, fmt.Errorf("evaluator %q must include target-specific mappings when a suite has multiple target functions", evaluatorID)
		}
		if targetID != "" {
			target, ok := targetsByID[targetID]
			if !ok {
				return nil, fmt.Errorf("evaluator %q references unknown target %q", evaluatorID, targetID)
			}
			if mapping, ok := evaluatorMappingObject(evaluator); ok {
				if err := validateEvaluatorMapping(evaluatorID, target, columns, mapping, allowsOntologyEdits); err != nil {
					return nil, err
				}
			}
		}
		if hasTargetMappings {
			if len(targetMappings) == 0 {
				return nil, fmt.Errorf("evaluator %q target_mappings must not be empty", evaluatorID)
			}
			for _, target := range targets {
				value, ok := targetMappings[target.ID]
				if !ok && len(targets) > 1 {
					return nil, fmt.Errorf("evaluator %q is missing mapping for target %q", evaluatorID, target.ID)
				}
				if !ok {
					continue
				}
				mapping, ok := value.(map[string]any)
				if !ok {
					return nil, fmt.Errorf("evaluator %q mapping for target %q must be a JSON object", evaluatorID, target.ID)
				}
				if nested, ok := evaluatorMappingObject(mapping); ok {
					mapping = nested
				}
				if err := validateEvaluatorMapping(evaluatorID, target, columns, mapping, allowsOntologyEdits); err != nil {
					return nil, err
				}
			}
			for mappedTargetID := range targetMappings {
				if _, ok := targetsByID[mappedTargetID]; !ok {
					return nil, fmt.Errorf("evaluator %q references unknown target %q", evaluatorID, mappedTargetID)
				}
			}
		}
		if !hasTargetMappings && targetID == "" && len(targets) == 1 {
			if mapping, ok := evaluatorMappingObject(evaluator); ok {
				if err := validateEvaluatorMapping(evaluatorID, targets[0], columns, mapping, allowsOntologyEdits); err != nil {
					return nil, err
				}
			}
		}
	}
	return normalized, nil
}

func evalTestCaseValues(testCase map[string]any) (map[string]any, bool) {
	for _, key := range []string{"values", "parameters", "column_values", "columnValues"} {
		value, ok := testCase[key].(map[string]any)
		if ok {
			return value, true
		}
	}
	return nil, false
}

func evalTestCaseMetadata(testCase map[string]any) (map[string]any, bool) {
	for _, key := range []string{"metadata", "meta"} {
		value, ok := testCase[key].(map[string]any)
		if ok {
			return value, true
		}
	}
	return nil, false
}

func validateEvalValueType(value any, valueType string) bool {
	if value == nil {
		return false
	}
	switch evalNormalizeType(valueType) {
	case "string", "date", "timestamp", "media_reference", "model":
		_, ok := value.(string)
		return ok
	case "boolean", "bool":
		_, ok := value.(bool)
		return ok
	case "integer", "long", "short":
		number, ok := value.(float64)
		return ok && number == float64(int64(number))
	case "float", "double", "numeric":
		_, ok := value.(float64)
		return ok
	case "list", "array", "object_list", "object_set":
		_, ok := value.([]any)
		return ok
	case "object", "json", "ontology_edit_bundle", "any":
		return true
	default:
		return true
	}
}

func normalizeEvalTestCases(raw json.RawMessage, columns map[string]evalColumnDefinition) (json.RawMessage, error) {
	items, normalized, err := normalizeJSONArrayObjects(raw, defaultEvalArray, "test_cases")
	if err != nil {
		return nil, fmt.Errorf("test_cases must be a JSON array: %w", err)
	}
	seen := make(map[string]struct{}, len(items))
	for idx, testCase := range items {
		id := stringField(testCase, "id")
		if id == "" {
			return nil, fmt.Errorf("test_cases[%d] must include id", idx)
		}
		if _, ok := seen[id]; ok {
			return nil, fmt.Errorf("test case %q is duplicated", id)
		}
		seen[id] = struct{}{}
		name := stringField(testCase, "name")
		if name == "" {
			return nil, fmt.Errorf("test_cases[%d] must include name", idx)
		}
		source := stringField(testCase, "source", "source_surface", "sourceSurface")
		if source != "" {
			switch source {
			case "manual", "logic_preview", "generated", "object_set":
			default:
				return nil, fmt.Errorf("test case %q source must be manual, logic_preview, generated, or object_set", id)
			}
		}
		if hint := stringField(testCase, "generated_name_hint", "generatedNameHint", "name_hint", "nameHint"); hint != "" && strings.TrimSpace(hint) == "" {
			return nil, fmt.Errorf("test case %q generated name hint must not be blank", id)
		}
		values, ok := evalTestCaseValues(testCase)
		if !ok {
			return nil, fmt.Errorf("test case %q must include values", id)
		}
		if metadata, ok := evalTestCaseMetadata(testCase); ok {
			for key := range metadata {
				if strings.TrimSpace(key) == "" {
					return nil, fmt.Errorf("test case %q metadata keys must not be blank", id)
				}
			}
			if source == "object_set" {
				for _, key := range []string{"object_set_id", "object_id", "object_set_backing_id"} {
					if evalStringValue(metadata[key]) == "" {
						return nil, fmt.Errorf("object-set-backed test case %q metadata must include %s", id, key)
					}
				}
			}
		} else if source == "object_set" {
			return nil, fmt.Errorf("object-set-backed test case %q must include metadata", id)
		}
		for key, value := range values {
			column, ok := columns[key]
			if !ok {
				return nil, fmt.Errorf("test case %q includes value for unknown column %q", id, key)
			}
			if !validateEvalValueType(value, column.Type) {
				return nil, fmt.Errorf("test case %q value for column %q is not compatible with type %q", id, key, column.Type)
			}
		}
		for _, column := range columns {
			if column.Role == "metadata" || column.Role == "intermediate_parameter" {
				continue
			}
			if _, ok := values[column.APIName]; !ok {
				return nil, fmt.Errorf("test case %q is missing value for %s column %q", id, column.Role, column.APIName)
			}
		}
	}
	return normalized, nil
}

func normalizeEvalSuiteParts(targetRaw, columnsRaw, testCasesRaw, evaluatorsRaw, runHistoryRaw json.RawMessage) (json.RawMessage, json.RawMessage, json.RawMessage, json.RawMessage, json.RawMessage, error) {
	targets, targetDefs, err := normalizeEvalTargetFunctions(targetRaw)
	if err != nil {
		return nil, nil, nil, nil, nil, err
	}
	columns, columnDefs, err := normalizeEvalColumns(columnsRaw, targetDefs)
	if err != nil {
		return nil, nil, nil, nil, nil, err
	}
	testCases, err := normalizeEvalTestCases(testCasesRaw, columnDefs)
	if err != nil {
		return nil, nil, nil, nil, nil, err
	}
	evaluators, err := normalizeEvalEvaluators(evaluatorsRaw, targetDefs, columnDefs)
	if err != nil {
		return nil, nil, nil, nil, nil, err
	}
	runHistory, err := normalizeJSONArray(runHistoryRaw, defaultEvalArray)
	if err != nil {
		return nil, nil, nil, nil, nil, fmt.Errorf("run_history must be a JSON array: %w", err)
	}
	return targets, columns, testCases, evaluators, runHistory, nil
}

func (r *Repo) CreateEvaluationSuite(ctx context.Context, ownerID uuid.UUID, body models.CreateEvaluationSuiteRequest) (models.EvaluationSuite, error) {
	targets, columns, testCases, evaluators, runHistory, err := normalizeEvalSuiteParts(body.TargetFunctions, body.TestCaseColumns, body.TestCases, body.Evaluators, body.RunHistory)
	if err != nil {
		return models.EvaluationSuite{}, err
	}
	return scanEvaluationSuite(r.Pool.QueryRow(ctx,
		`INSERT INTO eval_suites
		        (id, name, description, project_id, folder_id, owner_id,
		         target_functions, test_case_columns, test_cases, evaluators, run_history,
		         results_dataset_rid, permissions, source_surface, source_resource_id)
		 VALUES ($1, $2, $3, $4, $5, $6,
		         $7, $8, $9, $10, $11,
		         $12, $13, $14, $15)
		 RETURNING `+evalSuiteColumns,
		uuid.New(), body.Name, body.Description, body.ProjectID, body.FolderID, ownerID,
		targets, columns, testCases, evaluators, runHistory,
		body.ResultsDatasetRID, defaultLogicPermissions(ownerID, body.Permissions),
		normalizeEvalSourceSurface(body.SourceSurface), body.SourceResourceID))
}

func (r *Repo) GetEvaluationSuite(ctx context.Context, id, actorID uuid.UUID, includeArchived bool, admin bool) (*models.EvaluationSuite, error) {
	suite, err := scanEvaluationSuite(r.Pool.QueryRow(ctx,
		`SELECT `+evalSuiteColumns+` FROM eval_suites
		  WHERE id = $1
		    AND ($2::bool OR archived_at IS NULL)
		    AND ($4::bool OR owner_id = $3 OR permissions->'owners' ? $3::text OR permissions->'editors' ? $3::text OR permissions->'viewers' ? $3::text)`,
		id, includeArchived, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &suite, nil
}

func (r *Repo) ListEvaluationSuites(ctx context.Context, projectID, folderID *uuid.UUID, actorID uuid.UUID, includeArchived bool, admin bool) ([]models.EvaluationSuite, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT `+evalSuiteColumns+` FROM eval_suites
		  WHERE ($1::uuid IS NULL OR project_id = $1)
		    AND ($2::uuid IS NULL OR folder_id = $2)
		    AND ($3::bool OR archived_at IS NULL)
		    AND ($5::bool OR owner_id = $4 OR permissions->'owners' ? $4::text OR permissions->'editors' ? $4::text OR permissions->'viewers' ? $4::text)
		  ORDER BY updated_at DESC, created_at DESC`,
		nullableUUID(projectID), nullableUUID(folderID), includeArchived, actorID, admin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.EvaluationSuite, 0)
	for rows.Next() {
		suite, err := scanEvaluationSuite(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, suite)
	}
	return out, rows.Err()
}

func (r *Repo) UpdateEvaluationSuite(ctx context.Context, id, actorID uuid.UUID, body models.UpdateEvaluationSuiteRequest, admin bool) (*models.EvaluationSuite, error) {
	var currentTargets, currentColumns, currentTestCases, currentEvaluators, currentRunHistory json.RawMessage
	err := r.Pool.QueryRow(ctx,
		`SELECT target_functions, test_case_columns, test_cases, evaluators, run_history
		   FROM eval_suites
		  WHERE id = $1 AND archived_at IS NULL
		    AND ($3::bool OR owner_id = $2 OR permissions->'owners' ? $2::text OR permissions->'editors' ? $2::text)`,
		id, actorID, admin).Scan(&currentTargets, &currentColumns, &currentTestCases, &currentEvaluators, &currentRunHistory)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	nextTargets := currentTargets
	if body.TargetFunctions != nil {
		nextTargets = *body.TargetFunctions
	}
	nextColumns := currentColumns
	if body.TestCaseColumns != nil {
		nextColumns = *body.TestCaseColumns
	}
	nextTestCases := currentTestCases
	if body.TestCases != nil {
		nextTestCases = *body.TestCases
	}
	nextEvaluators := currentEvaluators
	if body.Evaluators != nil {
		nextEvaluators = *body.Evaluators
	}
	nextRunHistory := currentRunHistory
	if body.RunHistory != nil {
		nextRunHistory = *body.RunHistory
	}
	targets := currentTargets
	columns := currentColumns
	testCases := currentTestCases
	evaluators := currentEvaluators
	runHistory := currentRunHistory
	if body.TargetFunctions != nil || body.TestCaseColumns != nil || body.TestCases != nil || body.Evaluators != nil {
		targets, columns, testCases, evaluators, runHistory, err = normalizeEvalSuiteParts(nextTargets, nextColumns, nextTestCases, nextEvaluators, nextRunHistory)
		if err != nil {
			return nil, err
		}
	} else if body.RunHistory != nil {
		runHistory, err = normalizeJSONArray(nextRunHistory, defaultEvalArray)
		if err != nil {
			return nil, fmt.Errorf("run_history must be a JSON array: %w", err)
		}
	}
	suite, err := scanEvaluationSuite(r.Pool.QueryRow(ctx,
		`UPDATE eval_suites
		    SET name = COALESCE($2, name),
		        description = COALESCE($3, description),
		        target_functions = $4,
		        test_case_columns = $5,
		        test_cases = $6,
		        evaluators = $7,
		        run_history = $8,
		        results_dataset_rid = COALESCE($9, results_dataset_rid),
		        permissions = COALESCE($10, permissions),
		        updated_at = now()
		  WHERE id = $1 AND archived_at IS NULL
		    AND ($12::bool OR owner_id = $11 OR permissions->'owners' ? $11::text OR permissions->'editors' ? $11::text)
		  RETURNING `+evalSuiteColumns,
		id, body.Name, body.Description, targets, columns, testCases, evaluators, runHistory,
		body.ResultsDatasetRID, body.Permissions, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &suite, nil
}

func (r *Repo) MoveEvaluationSuite(ctx context.Context, id, actorID uuid.UUID, body models.MoveEvaluationSuiteRequest, admin bool) (*models.EvaluationSuite, error) {
	suite, err := scanEvaluationSuite(r.Pool.QueryRow(ctx,
		`UPDATE eval_suites
		    SET project_id = $2, folder_id = $3, updated_at = now()
		  WHERE id = $1 AND archived_at IS NULL
		    AND ($5::bool OR owner_id = $4 OR permissions->'owners' ? $4::text OR permissions->'editors' ? $4::text)
		  RETURNING `+evalSuiteColumns,
		id, body.ProjectID, body.FolderID, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &suite, nil
}

func (r *Repo) DuplicateEvaluationSuite(ctx context.Context, id, actorID uuid.UUID, body models.DuplicateEvaluationSuiteRequest, admin bool) (*models.EvaluationSuite, error) {
	suite, err := scanEvaluationSuite(r.Pool.QueryRow(ctx,
		`INSERT INTO eval_suites
		        (id, name, description, project_id, folder_id, owner_id,
		         target_functions, test_case_columns, test_cases, evaluators, run_history,
		         results_dataset_rid, permissions, source_surface, source_resource_id)
		 SELECT $1,
		        COALESCE($2, name || ' (copy)'),
		        COALESCE($3, description),
		        COALESCE($4, project_id),
		        COALESCE($5, folder_id),
		        $6,
		        target_functions,
		        test_case_columns,
		        test_cases,
		        evaluators,
		        run_history,
		        results_dataset_rid,
		        permissions,
		        'aip_evals_app',
		        source_resource_id
		   FROM eval_suites
		  WHERE id = $7 AND archived_at IS NULL
		    AND ($9::bool OR owner_id = $8 OR permissions->'owners' ? $8::text OR permissions->'editors' ? $8::text)
		 RETURNING `+evalSuiteColumns,
		uuid.New(), body.Name, body.Description, nullableUUID(body.ProjectID), nullableUUID(body.FolderID),
		actorID, id, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &suite, nil
}

func (r *Repo) ArchiveEvaluationSuite(ctx context.Context, id, actorID uuid.UUID, admin bool) (*models.EvaluationSuite, error) {
	suite, err := scanEvaluationSuite(r.Pool.QueryRow(ctx,
		`UPDATE eval_suites
		    SET archived_at = COALESCE(archived_at, now()), updated_at = now()
		  WHERE id = $1
		    AND ($3::bool OR owner_id = $2 OR permissions->'owners' ? $2::text OR permissions->'editors' ? $2::text)
		  RETURNING `+evalSuiteColumns,
		id, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &suite, nil
}

func (r *Repo) RestoreEvaluationSuite(ctx context.Context, id, actorID uuid.UUID, admin bool) (*models.EvaluationSuite, error) {
	suite, err := scanEvaluationSuite(r.Pool.QueryRow(ctx,
		`UPDATE eval_suites
		    SET archived_at = NULL, updated_at = now()
		  WHERE id = $1 AND archived_at IS NOT NULL
		    AND ($3::bool OR owner_id = $2 OR permissions->'owners' ? $2::text OR permissions->'editors' ? $2::text)
		  RETURNING `+evalSuiteColumns,
		id, actorID, admin))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &suite, nil
}
