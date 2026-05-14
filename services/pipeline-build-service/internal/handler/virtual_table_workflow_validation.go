package handler

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

type virtualTableCapabilitiesConfig struct {
	Read                *bool   `json:"read,omitempty"`
	Write               *bool   `json:"write,omitempty"`
	ComputePushdown     *string `json:"compute_pushdown,omitempty"`
	SnapshotSupported   *bool   `json:"snapshot_supported,omitempty"`
	AppendOnlySupported *bool   `json:"append_only_supported,omitempty"`
	FoundryCompute      struct {
		PythonSingleNode          *bool `json:"python_single_node,omitempty"`
		PythonSpark               *bool `json:"python_spark,omitempty"`
		PipelineBuilderSingleNode *bool `json:"pipeline_builder_single_node,omitempty"`
		PipelineBuilderSpark      *bool `json:"pipeline_builder_spark,omitempty"`
	} `json:"foundry_compute,omitempty"`
}

type virtualTableWorkflowConfig struct {
	Kind              string
	SourceKind        string
	VirtualTableRID   string
	SourceRID         string
	Provider          string
	TableType         string
	HostApplication   string
	PipelineType      string
	Mode              string
	Database          string
	Schema            string
	Table             string
	Bucket            string
	Prefix            string
	Catalog           string
	Namespace         string
	Locator           json.RawMessage
	ExternalReference json.RawMessage
	Capabilities      virtualTableCapabilitiesConfig
}

func validateVirtualTableInputNode(node models.PipelineIRNode, report *pipelineStrictValidationReport) {
	cfg := virtualTableWorkflowConfigFromRaw(node.Config, false)
	if !isVirtualTableInputIRNode(node, cfg) {
		return
	}
	if strings.TrimSpace(cfg.VirtualTableRID) == "" {
		report.addError(node.ID, nil, "virtual_table_rid_required", "virtual table inputs require virtual_table_rid")
	}
	if boolPtrFalse(cfg.Capabilities.Read) {
		report.addError(node.ID, nil, "virtual_table_read_not_supported", "this virtual table is not readable by transforms")
	}
	validateVirtualTableHostAndPipeline(node.ID, cfg, report)
	validateVirtualTableComputeSupport(node.ID, cfg, "input", report)
}

func validateVirtualTableOutputNode(nodeID, transformType string, rawConfig json.RawMessage, report *pipelineStrictValidationReport) {
	cfg := virtualTableWorkflowConfigFromRaw(rawConfig, true)
	if !isVirtualTableOutput(transformType, cfg) {
		return
	}
	if strings.TrimSpace(cfg.SourceRID) == "" {
		report.addError(nodeID, nil, "virtual_table_output_source_required", "virtual table outputs require source_rid so storage remains external")
	}
	if !virtualTableConfigHasExternalLocation(cfg) {
		report.addError(nodeID, nil, "virtual_table_output_location_required", "virtual table outputs require an external table locator or external_reference")
	}
	if boolPtrFalse(cfg.Capabilities.Write) {
		report.addError(nodeID, nil, "virtual_table_output_write_not_supported", "this source/table type is read-only for virtual table outputs")
	}
	validateVirtualTableHostAndPipeline(nodeID, cfg, report)
	validateVirtualTableComputeSupport(nodeID, cfg, "output", report)
}

func validateVirtualTableWorkflowReferences(ir models.PipelineIR, report *pipelineStrictValidationReport) {
	if !pipelineHasVirtualTableWorkflow(ir) {
		return
	}
	for _, node := range ir.Nodes {
		if nodeUsesLegacyExternalSystems(node.Config) {
			report.addError(node.ID, nil, "virtual_table_use_external_systems_incompatible", "virtual table transforms cannot use use_external_systems; use source-based external_systems or split the workflow")
		}
	}
}

func pipelineHasVirtualTableWorkflow(ir models.PipelineIR) bool {
	for _, node := range ir.Nodes {
		cfg := virtualTableWorkflowConfigFromRaw(node.Config, normaliseTableTransform(node.TransformType) == "output")
		if isVirtualTableInputIRNode(node, cfg) || isVirtualTableOutput(node.TransformType, cfg) {
			return true
		}
	}
	return false
}

func isVirtualTableInputIRNode(node models.PipelineIRNode, cfg virtualTableWorkflowConfig) bool {
	if normaliseTableTransform(node.TransformType) != "input" {
		return false
	}
	lower := strings.ToLower(strings.TrimSpace(node.TransformType))
	return strings.Contains(lower, "virtual_table") ||
		strings.EqualFold(strings.TrimSpace(cfg.SourceKind), "virtual_table") ||
		strings.TrimSpace(cfg.VirtualTableRID) != ""
}

func isVirtualTableOutput(transformType string, cfg virtualTableWorkflowConfig) bool {
	lower := strings.ToLower(strings.TrimSpace(transformType))
	return strings.EqualFold(strings.TrimSpace(cfg.Kind), "virtual_table") ||
		strings.Contains(lower, "virtual_table")
}

func validateVirtualTableHostAndPipeline(nodeID string, cfg virtualTableWorkflowConfig, report *pipelineStrictValidationReport) {
	host := normalizeVirtualTableHost(cfg.HostApplication)
	switch host {
	case "", "pipeline_builder", "code_repository":
	default:
		report.addError(nodeID, nil, "virtual_table_host_application_not_supported", fmt.Sprintf("virtual tables are not supported in host application %q", cfg.HostApplication))
	}
	mode := normalizeVirtualTablePipelineMode(firstNonEmpty(cfg.PipelineType, cfg.Mode))
	switch mode {
	case "", "batch", "incremental", "snapshot", "append_only", "external", "direct":
	case "streaming":
		report.addError(nodeID, nil, "virtual_table_pipeline_type_not_supported", "virtual tables are not supported in streaming pipelines")
	case "faster":
		report.addError(nodeID, nil, "virtual_table_pipeline_type_not_supported", "virtual tables are not supported in Faster pipelines")
	default:
		report.addError(nodeID, nil, "virtual_table_pipeline_type_not_supported", fmt.Sprintf("virtual table workflow mode %q is not supported", firstNonEmpty(cfg.PipelineType, cfg.Mode)))
	}
}

func validateVirtualTableComputeSupport(nodeID string, cfg virtualTableWorkflowConfig, role string, report *pipelineStrictValidationReport) {
	host := normalizeVirtualTableHost(cfg.HostApplication)
	if host == "" {
		host = "pipeline_builder"
	}
	switch host {
	case "pipeline_builder":
		if boolPtrFalse(cfg.Capabilities.FoundryCompute.PipelineBuilderSpark) {
			report.addError(nodeID, nil, "virtual_table_pipeline_builder_not_supported", fmt.Sprintf("this virtual table cannot be used as a Pipeline Builder %s with Spark compute", role))
		}
	case "code_repository":
		if anyBoolPtr(cfg.Capabilities.FoundryCompute.PythonSingleNode, cfg.Capabilities.FoundryCompute.PythonSpark) &&
			!boolPtrTrue(cfg.Capabilities.FoundryCompute.PythonSingleNode) &&
			!boolPtrTrue(cfg.Capabilities.FoundryCompute.PythonSpark) {
			report.addError(nodeID, nil, "virtual_table_code_repository_not_supported", fmt.Sprintf("this virtual table cannot be used as a Code Repository %s", role))
		}
	}
}

func virtualTableWorkflowConfigFromRaw(raw json.RawMessage, preferOutput bool) virtualTableWorkflowConfig {
	direct := virtualTableWorkflowConfigFromObject(jsonObject(raw))
	if !preferOutput {
		return direct
	}
	if output := jsonObject(jsonObject(raw)["_output"]); len(output) > 0 {
		nested := virtualTableWorkflowConfigFromObject(output)
		return mergeVirtualTableWorkflowConfig(direct, nested)
	}
	return direct
}

func virtualTableWorkflowConfigFromObject(obj map[string]json.RawMessage) virtualTableWorkflowConfig {
	cfg := virtualTableWorkflowConfig{
		Kind:              jsonString(obj, "kind", "output_type"),
		SourceKind:        jsonString(obj, "source_kind", "source_type"),
		VirtualTableRID:   jsonString(obj, "virtual_table_rid", "virtual_table_id", "table_rid"),
		SourceRID:         jsonString(obj, "source_rid", "source_id"),
		Provider:          jsonString(obj, "provider", "source_provider"),
		TableType:         jsonString(obj, "table_type"),
		HostApplication:   jsonString(obj, "host_application", "host_app", "application", "host"),
		PipelineType:      jsonString(obj, "pipeline_type", "build_type", "pipeline_mode"),
		Mode:              jsonString(obj, "mode", "workflow_mode"),
		Database:          jsonString(obj, "database", "external_database"),
		Schema:            jsonString(obj, "schema", "external_schema"),
		Table:             jsonString(obj, "table", "external_table", "table_name"),
		Bucket:            jsonString(obj, "bucket"),
		Prefix:            jsonString(obj, "prefix"),
		Catalog:           jsonString(obj, "catalog"),
		Namespace:         jsonString(obj, "namespace"),
		Locator:           firstRaw(obj, "locator", "table_locator"),
		ExternalReference: firstRaw(obj, "external_reference", "external_table_reference"),
	}
	if raw := firstRaw(obj, "capabilities"); len(raw) > 0 {
		_ = json.Unmarshal(raw, &cfg.Capabilities)
	}
	return cfg
}

func mergeVirtualTableWorkflowConfig(base, override virtualTableWorkflowConfig) virtualTableWorkflowConfig {
	if strings.TrimSpace(override.Kind) != "" {
		base.Kind = override.Kind
	}
	if strings.TrimSpace(override.SourceKind) != "" {
		base.SourceKind = override.SourceKind
	}
	if strings.TrimSpace(override.VirtualTableRID) != "" {
		base.VirtualTableRID = override.VirtualTableRID
	}
	if strings.TrimSpace(override.SourceRID) != "" {
		base.SourceRID = override.SourceRID
	}
	if strings.TrimSpace(override.Provider) != "" {
		base.Provider = override.Provider
	}
	if strings.TrimSpace(override.TableType) != "" {
		base.TableType = override.TableType
	}
	if strings.TrimSpace(override.HostApplication) != "" {
		base.HostApplication = override.HostApplication
	}
	if strings.TrimSpace(override.PipelineType) != "" {
		base.PipelineType = override.PipelineType
	}
	if strings.TrimSpace(override.Mode) != "" {
		base.Mode = override.Mode
	}
	if strings.TrimSpace(override.Database) != "" {
		base.Database = override.Database
	}
	if strings.TrimSpace(override.Schema) != "" {
		base.Schema = override.Schema
	}
	if strings.TrimSpace(override.Table) != "" {
		base.Table = override.Table
	}
	if strings.TrimSpace(override.Bucket) != "" {
		base.Bucket = override.Bucket
	}
	if strings.TrimSpace(override.Prefix) != "" {
		base.Prefix = override.Prefix
	}
	if strings.TrimSpace(override.Catalog) != "" {
		base.Catalog = override.Catalog
	}
	if strings.TrimSpace(override.Namespace) != "" {
		base.Namespace = override.Namespace
	}
	if rawHasReference(override.Locator) {
		base.Locator = override.Locator
	}
	if rawHasReference(override.ExternalReference) {
		base.ExternalReference = override.ExternalReference
	}
	if override.Capabilities.Read != nil || override.Capabilities.Write != nil ||
		override.Capabilities.FoundryCompute.PipelineBuilderSpark != nil ||
		override.Capabilities.FoundryCompute.PythonSingleNode != nil ||
		override.Capabilities.FoundryCompute.PythonSpark != nil {
		base.Capabilities = override.Capabilities
	}
	return base
}

func virtualTableConfigHasExternalLocation(cfg virtualTableWorkflowConfig) bool {
	if strings.TrimSpace(cfg.Table) != "" ||
		strings.TrimSpace(cfg.Bucket) != "" ||
		strings.TrimSpace(cfg.Prefix) != "" ||
		strings.TrimSpace(cfg.Catalog) != "" ||
		strings.TrimSpace(cfg.Namespace) != "" {
		return true
	}
	return rawHasReference(cfg.Locator) || rawHasReference(cfg.ExternalReference)
}

func nodeUsesLegacyExternalSystems(raw json.RawMessage) bool {
	return strings.Contains(strings.ToLower(string(raw)), "use_external_systems")
}

func normalizeVirtualTableHost(value string) string {
	value = strings.ToLower(strings.TrimSpace(strings.ReplaceAll(value, "-", "_")))
	switch value {
	case "", "pipeline_builder", "builder":
		return value
	case "code_repo", "code_repositories", "code_repository", "code":
		return "code_repository"
	default:
		return value
	}
}

func normalizeVirtualTablePipelineMode(value string) string {
	value = strings.ToLower(strings.TrimSpace(strings.ReplaceAll(value, "-", "_")))
	switch value {
	case "batch", "snapshot", "incremental", "append_only", "external", "direct":
		return value
	case "stream", "streaming", "continuous":
		return "streaming"
	case "faster", "fast", "lightweight":
		return "faster"
	case "":
		return ""
	default:
		return value
	}
}

func jsonObject(raw json.RawMessage) map[string]json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil
	}
	return obj
}

func jsonString(obj map[string]json.RawMessage, keys ...string) string {
	for _, key := range keys {
		raw := obj[key]
		if len(raw) == 0 {
			continue
		}
		var value string
		if err := json.Unmarshal(raw, &value); err == nil && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstRaw(obj map[string]json.RawMessage, keys ...string) json.RawMessage {
	for _, key := range keys {
		if raw := obj[key]; len(raw) > 0 {
			return append(json.RawMessage(nil), raw...)
		}
	}
	return nil
}

func rawHasReference(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" || trimmed == "{}" || trimmed == "[]" {
		return false
	}
	var value string
	if err := json.Unmarshal(raw, &value); err == nil {
		return strings.TrimSpace(value) != ""
	}
	obj := jsonObject(raw)
	if len(obj) == 0 {
		return true
	}
	for key, value := range obj {
		if key == "kind" {
			continue
		}
		if rawHasReference(value) {
			return true
		}
	}
	return false
}

func boolPtrTrue(value *bool) bool {
	return value != nil && *value
}

func boolPtrFalse(value *bool) bool {
	return value != nil && !*value
}

func anyBoolPtr(values ...*bool) bool {
	for _, value := range values {
		if value != nil {
			return true
		}
	}
	return false
}
