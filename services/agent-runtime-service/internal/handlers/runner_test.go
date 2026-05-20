package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	aimodels "github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/models"
)

// simulatedTool returns a ToolDefinition that the kernel's
// executeSimulatedTool path will accept — the simplest mode that
// requires no network and no fixture server.
func simulatedTool(name string) aimodels.ToolDefinition {
	return aimodels.ToolDefinition{
		ID:            uuid.New(),
		Name:          name,
		Description:   "Simulated " + name,
		Category:      "analysis",
		ExecutionMode: "simulated",
		Status:        "active",
	}
}

func TestPlanAndExecute_BuildsPlanWithTraces(t *testing.T) {
	agent := models.AgentDefinition{
		ID:     uuid.New(),
		Slug:   "geopolitical-analyst",
		Name:   "Geopolitical Analyst",
		Status: "active",
	}
	tools := []aimodels.ToolDefinition{
		simulatedTool("find_sanctioned_entities"),
		simulatedTool("assess_country_risk"),
	}
	input := runnerInput{
		UserMessage: "Are there sanctioned entities operating in Country X?",
		Objective:   "Surface OFAC + EU + OpenSanctions hits for Country X.",
	}

	traces, result := planAndExecute(context.Background(), http.DefaultClient, agent, tools, input, http.Header{})

	require.NotEmpty(t, traces, "executor must emit at least the analyze + synthesize steps")
	// Plan layout: analyze-request → tool-{name} × N → synthesize-answer.
	// With 2 tools we expect at least 4 traces.
	assert.GreaterOrEqual(t, len(traces), 3)
	assert.Equal(t, "Geopolitical Analyst", agent.Name) // sanity
	assert.Equal(t, input.UserMessage, result.UserMessage)
	assert.Equal(t, input.Objective, result.Objective)
	assert.Equal(t, len(traces), result.TraceCount)
	assert.GreaterOrEqual(t, result.ToolCalls, 1, "at least one trace should carry a tool_name")
	assert.NotEmpty(t, result.FinalObservation, "last trace observation should land on result")
}

func TestPlanAndExecute_EmptyObjectiveFallsBackToUserMessage(t *testing.T) {
	agent := models.AgentDefinition{ID: uuid.New(), Slug: "x", Name: "X", Status: "active"}
	input := runnerInput{UserMessage: "Hi"}

	_, result := planAndExecute(context.Background(), http.DefaultClient, agent, nil, input, nil)
	assert.Equal(t, "Hi", result.Objective)
}

func TestPlanAndExecute_NoToolsStillSynthesises(t *testing.T) {
	agent := models.AgentDefinition{ID: uuid.New(), Slug: "x", Name: "X", Status: "active"}
	input := runnerInput{UserMessage: "Hi", Objective: "Say hi"}

	traces, result := planAndExecute(context.Background(), http.DefaultClient, agent, nil, input, nil)
	require.NotEmpty(t, traces)
	assert.Equal(t, 0, result.ToolCalls)
	// The final step should be the synthesise-answer step.
	assert.Equal(t, "synthesize-answer", traces[len(traces)-1].StepID)
}

func TestDecodeAgentTools_AcceptsArray(t *testing.T) {
	raw := json.RawMessage(`[
		{"id":"00000000-0000-0000-0000-000000000001","name":"a","description":"","category":"analysis","execution_mode":"simulated","status":"active"},
		{"id":"00000000-0000-0000-0000-000000000002","name":"b","description":"","category":"analysis","execution_mode":"simulated","status":"active"}
	]`)
	tools := decodeAgentTools(raw)
	require.Len(t, tools, 2)
	assert.Equal(t, "a", tools[0].Name)
}

func TestDecodeAgentTools_BadShapeReturnsEmpty(t *testing.T) {
	for _, raw := range []json.RawMessage{
		nil,
		json.RawMessage(``),
		json.RawMessage(`null`),
		json.RawMessage(`""`),
		json.RawMessage(`"not-an-array"`),
		json.RawMessage(`{"not":"array"}`),
	} {
		assert.Empty(t, decodeAgentTools(raw), "raw=%s", string(raw))
	}
}

func TestTraceKindFor_RoutesAllThreeBuckets(t *testing.T) {
	tool := "find_sanctioned_entities"
	cases := []struct {
		name  string
		trace aimodels.AgentExecutionTrace
		want  string
	}{
		{"tool", aimodels.AgentExecutionTrace{StepID: "tool-x", ToolName: &tool}, "tool"},
		{"retrieval", aimodels.AgentExecutionTrace{StepID: "retrieve-context"}, "retrieval"},
		{"synthesis", aimodels.AgentExecutionTrace{StepID: "synthesize-answer"}, "synthesis"},
		{"analyze", aimodels.AgentExecutionTrace{StepID: "analyze-request"}, "synthesis"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, traceKindFor(c.trace))
		})
	}
}

func TestSnapshotForwardedHeaders_OnlyPropagatesAllowed(t *testing.T) {
	in := http.Header{}
	in.Set("Authorization", "Bearer t")
	in.Set("X-OpenFoundry-Tenant", "acme")
	in.Set("X-OpenFoundry-Branch", "geopolitica-poc")
	in.Set("Cookie", "secret=1") // must NOT be forwarded
	in.Set("X-Something-Else", "leaks?")

	out := snapshotForwardedHeaders(in)
	assert.Equal(t, "Bearer t", out.Get("Authorization"))
	assert.Equal(t, "acme", out.Get("X-OpenFoundry-Tenant"))
	assert.Equal(t, "geopolitica-poc", out.Get("X-OpenFoundry-Branch"))
	assert.Empty(t, out.Get("Cookie"))
	assert.Empty(t, out.Get("X-Something-Else"))
}

func TestRunnerInput_DecodesFromAgentRunInput(t *testing.T) {
	// Sanity that the canonical wire shape clients send round-trips.
	raw := json.RawMessage(`{
		"user_message": "List sanctioned actors in Sahel.",
		"objective":    "Top-5 entities with current OFAC or EU sanction.",
		"context":      {"branch":"geopolitica-poc"}
	}`)
	var in runnerInput
	require.NoError(t, json.Unmarshal(raw, &in))
	assert.Equal(t, "List sanctioned actors in Sahel.", in.UserMessage)
	assert.Equal(t, "Top-5 entities with current OFAC or EU sanction.", in.Objective)
	assert.True(t, strings.Contains(string(in.Context), "geopolitica-poc"))
}
