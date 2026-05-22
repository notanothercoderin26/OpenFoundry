package agents

import (
	"testing"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
)

func newTool(name, execMode string, tags ...string) models.ToolDefinition {
	return models.ToolDefinition{
		ID:            uuid.New(),
		Name:          name,
		ExecutionMode: execMode,
		Status:        models.DefaultToolStatus,
		Tags:          tags,
	}
}

func toolNames(tools []models.ToolDefinition) []string {
	out := make([]string, 0, len(tools))
	for _, t := range tools {
		out = append(out, t.Name)
	}
	return out
}

func contains(names []string, want string) bool {
	for _, n := range names {
		if n == want {
			return true
		}
	}
	return false
}

func TestValidateAgentMode(t *testing.T) {
	cases := []struct {
		in      string
		want    AgentMode
		wantErr bool
	}{
		{"", ModeUnspecified, false},
		{"DATA_INTEGRATION", ModeDataIntegration, false},
		{"PLATFORM_QA", ModePlatformQA, false},
		{"data_integration", ModeUnspecified, true}, // case-sensitive
		{"BOGUS", ModeUnspecified, true},
	}
	for _, c := range cases {
		got, err := ValidateAgentMode(c.in)
		if (err != nil) != c.wantErr {
			t.Fatalf("ValidateAgentMode(%q) err=%v wantErr=%v", c.in, err, c.wantErr)
		}
		if got != c.want {
			t.Fatalf("ValidateAgentMode(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestAllModesCoverage(t *testing.T) {
	// Every AllModes() entry must have a default tool-kinds list,
	// otherwise the UI selector exposes a mode the registry can't
	// filter.
	for _, m := range AllModes() {
		kinds := DefaultToolKinds(m)
		if len(kinds) == 0 {
			t.Errorf("DefaultToolKinds(%q) is empty", m)
		}
	}
}

func TestFilterByMode_DefaultAllowlist(t *testing.T) {
	tools := []models.ToolDefinition{
		newTool("sql-explorer", "native_sql"),
		newTool("ontology-edit", "native_ontology"),
		newTool("pipeline-build", "native_pipeline"),
		newTool("doc-search", "knowledge_search"),
		newTool("egress-config", "openfoundry_api"),
	}
	reg := NewModeToolRegistry(tools)

	// DATA_INTEGRATION allows native_pipeline, native_sql, but not
	// native_ontology under the defaults.
	got := toolNames(reg.FilterByMode(ModeDataIntegration, nil))
	if !contains(got, "pipeline-build") || !contains(got, "sql-explorer") {
		t.Fatalf("DATA_INTEGRATION missing native_pipeline/native_sql: %v", got)
	}
	if contains(got, "ontology-edit") {
		t.Fatalf("DATA_INTEGRATION leaked native_ontology: %v", got)
	}

	// ONTOLOGY_EDITING allows native_ontology but not native_pipeline.
	got = toolNames(reg.FilterByMode(ModeOntologyEditing, nil))
	if !contains(got, "ontology-edit") {
		t.Fatalf("ONTOLOGY_EDITING missing native_ontology: %v", got)
	}
	if contains(got, "pipeline-build") {
		t.Fatalf("ONTOLOGY_EDITING leaked native_pipeline: %v", got)
	}

	// knowledge_search is informational — every mode keeps it.
	for _, m := range AllModes() {
		got := toolNames(reg.FilterByMode(m, nil))
		if !contains(got, "doc-search") {
			t.Errorf("mode %q dropped knowledge_search: %v", m, got)
		}
	}
}

func TestFilterByMode_ExplicitAllowlistOverridesDefault(t *testing.T) {
	tools := []models.ToolDefinition{
		newTool("ontology-edit", "native_ontology"),
		newTool("pipeline-build", "native_pipeline"),
	}
	reg := NewModeToolRegistry(tools)

	// Caller passes its own allowlist: only native_ontology — even
	// though DATA_INTEGRATION's default would allow native_pipeline.
	got := toolNames(reg.FilterByMode(ModeDataIntegration, []string{"native_ontology"}))
	if !contains(got, "ontology-edit") {
		t.Fatalf("explicit allowlist dropped allowed tool: %v", got)
	}
	if contains(got, "pipeline-build") {
		t.Fatalf("explicit allowlist did not override default: %v", got)
	}
}

func TestFilterByMode_TagOptInAndOnly(t *testing.T) {
	tools := []models.ToolDefinition{
		// native_ontology is not in DATA_INTEGRATION's default
		// allowlist, but this tool opts in via the mode tag.
		newTool("special-onto", "native_ontology", "mode:DATA_INTEGRATION"),
		// Pipeline-build with mode:only restricts visibility to
		// PLATFORM_QA only, regardless of execution-mode defaults.
		newTool("pipeline-build", "native_pipeline", "mode:PLATFORM_QA", "mode:only"),
	}
	reg := NewModeToolRegistry(tools)

	got := toolNames(reg.FilterByMode(ModeDataIntegration, nil))
	if !contains(got, "special-onto") {
		t.Fatalf("mode:DATA_INTEGRATION tag did not grant access: %v", got)
	}
	if contains(got, "pipeline-build") {
		t.Fatalf("mode:only restricted tool leaked into DATA_INTEGRATION: %v", got)
	}

	// pipeline-build should ONLY be visible in PLATFORM_QA.
	got = toolNames(reg.FilterByMode(ModePlatformQA, nil))
	if !contains(got, "pipeline-build") {
		t.Fatalf("mode:only tool not visible in its declared mode: %v", got)
	}
}

func TestFilterByMode_UnspecifiedReturnsAllActive(t *testing.T) {
	tools := []models.ToolDefinition{
		newTool("a", "native_sql"),
		newTool("b", "native_ontology"),
		{Name: "inactive", ExecutionMode: "simulated", Status: "disabled"},
	}
	reg := NewModeToolRegistry(tools)
	got := toolNames(reg.FilterByMode(ModeUnspecified, nil))
	if len(got) != 2 || !contains(got, "a") || !contains(got, "b") {
		t.Fatalf("ModeUnspecified returned wrong set: %v", got)
	}
	if contains(got, "inactive") {
		t.Fatalf("inactive tool leaked: %v", got)
	}
}

func TestIsToolAllowed(t *testing.T) {
	tool := newTool("x", "native_pipeline")
	reg := NewModeToolRegistry([]models.ToolDefinition{tool})

	if !reg.IsToolAllowed(&tool, ModeDataIntegration, nil) {
		t.Fatal("native_pipeline should be allowed under DATA_INTEGRATION")
	}
	if reg.IsToolAllowed(&tool, ModeOntologyEditing, nil) {
		t.Fatal("native_pipeline should NOT be allowed under ONTOLOGY_EDITING")
	}
	if reg.IsToolAllowed(nil, ModeDataIntegration, nil) {
		t.Fatal("nil tool must never be allowed")
	}

	disabled := tool
	disabled.Status = "disabled"
	if reg.IsToolAllowed(&disabled, ModeDataIntegration, nil) {
		t.Fatal("disabled tool must never be allowed")
	}
}

func TestDefaultToolKindsIsCopied(t *testing.T) {
	// Mutating the returned slice must not change the package-level
	// table.
	first := DefaultToolKinds(ModeDataIntegration)
	if len(first) == 0 {
		t.Fatal("expected non-empty default")
	}
	first[0] = "MUTATED"
	second := DefaultToolKinds(ModeDataIntegration)
	if second[0] == "MUTATED" {
		t.Fatal("DefaultToolKinds returned a shared slice; callers can poison the defaults")
	}
}
