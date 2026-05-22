package agents

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
)

// TestExecutePlanWithMode_RejectsToolOutsideMode covers the
// defense-in-depth gate added in task 1.4: a tool name the LLM emits
// that is not in the active mode's allowlist must be rejected before
// dispatch with a structured "rejected" trace.
func TestExecutePlanWithMode_RejectsToolOutsideMode(t *testing.T) {
	t.Parallel()

	// native_ontology is NOT in DATA_INTEGRATION's default allowlist.
	ontoTool := tool("ontology.edit", "native_ontology", nil)
	pipeTool := tool("pipeline.build", "native_pipeline", nil)
	tools := []models.ToolDefinition{ontoTool, pipeTool}

	plan := []models.AgentPlanStep{
		{ID: "s1", Title: "edit", ToolName: toolNamePtr("ontology.edit")},
		{ID: "s2", Title: "build", ToolName: toolNamePtr("pipeline.build")},
	}

	traces := ExecutePlanWithMode(
		context.Background(), nil, plan, tools,
		ModeDataIntegration, nil,
		"msg", "obj", nil, nil, nil,
	)

	require.Len(t, traces, 2)

	// Step 1: ontology tool rejected.
	assert.Contains(t, traces[0].Observation, "rejected")
	assert.Contains(t, traces[0].Observation, "DATA_INTEGRATION")
	var rejPayload map[string]any
	require.NoError(t, json.Unmarshal(traces[0].Output, &rejPayload))
	assert.Equal(t, "rejected", rejPayload["status"])
	assert.Equal(t, "ontology.edit", rejPayload["tool"])

	// Step 2: pipeline tool runs (allowed under DATA_INTEGRATION).
	assert.NotContains(t, traces[1].Observation, "rejected")
	var okPayload map[string]any
	require.NoError(t, json.Unmarshal(traces[1].Output, &okPayload))
	assert.NotEqual(t, "rejected", okPayload["status"])
}

// TestExecutePlanWithMode_UnspecifiedRunsEverything ensures the
// backward-compatible legacy ExecutePlan wrapper (which calls
// ExecutePlanWithMode with ModeUnspecified) does not introduce mode
// gating for existing callers.
func TestExecutePlanWithMode_UnspecifiedRunsEverything(t *testing.T) {
	t.Parallel()

	ontoTool := tool("ontology.edit", "native_ontology", nil)
	plan := []models.AgentPlanStep{
		{ID: "s1", Title: "edit", ToolName: toolNamePtr("ontology.edit")},
	}

	traces := ExecutePlanWithMode(
		context.Background(), nil, plan,
		[]models.ToolDefinition{ontoTool},
		ModeUnspecified, nil,
		"msg", "obj", nil, nil, nil,
	)

	require.Len(t, traces, 1)
	assert.NotContains(t, traces[0].Observation, "rejected")

	// Legacy ExecutePlan must behave identically.
	legacy := ExecutePlan(
		context.Background(), nil, plan,
		[]models.ToolDefinition{ontoTool},
		"msg", "obj", nil, nil, nil,
	)
	require.Len(t, legacy, 1)
	assert.NotContains(t, legacy[0].Observation, "rejected")
}

// TestExecutePlanWithMode_OverrideAllowlist verifies that the per-thread
// enabledToolKinds slice replaces the per-mode default when non-empty,
// even if that means narrowing what would otherwise be allowed.
func TestExecutePlanWithMode_OverrideAllowlist(t *testing.T) {
	t.Parallel()

	pipeTool := tool("pipeline.build", "native_pipeline", nil)
	tools := []models.ToolDefinition{pipeTool}
	plan := []models.AgentPlanStep{
		{ID: "s1", Title: "build", ToolName: toolNamePtr("pipeline.build")},
	}

	// DATA_INTEGRATION's default allows native_pipeline, but we narrow
	// the per-thread allowlist to native_sql only.
	traces := ExecutePlanWithMode(
		context.Background(), nil, plan, tools,
		ModeDataIntegration, []string{"native_sql"},
		"msg", "obj", nil, nil, nil,
	)

	require.Len(t, traces, 1)
	assert.Contains(t, traces[0].Observation, "rejected")
	var payload map[string]any
	require.NoError(t, json.Unmarshal(traces[0].Output, &payload))
	assert.Equal(t, "rejected", payload["status"])
}

// TestExecutePlanWithMode_MissingToolStillDispatches ensures the
// "tool not found" path (handled by ExecuteTool) is reached when the
// LLM hallucinates a name not in the catalog at all — the mode gate
// only fires when the tool exists.
func TestExecutePlanWithMode_MissingToolStillDispatches(t *testing.T) {
	t.Parallel()

	plan := []models.AgentPlanStep{
		{ID: "s1", Title: "?", ToolName: toolNamePtr("does-not-exist")},
	}

	traces := ExecutePlanWithMode(
		context.Background(), nil, plan, nil,
		ModeDataIntegration, nil,
		"msg", "obj", nil, nil, nil,
	)

	require.Len(t, traces, 1)
	var payload map[string]any
	require.NoError(t, json.Unmarshal(traces[0].Output, &payload))
	// ExecuteTool's "tool definition not found" envelope.
	assert.Equal(t, "failed", payload["status"])
}
