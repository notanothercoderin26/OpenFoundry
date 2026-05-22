package agents

import (
	"fmt"
	"strings"

	"github.com/openfoundry/openfoundry-go/libs/ai-kernel-go/models"
)

// AgentMode is the string form of the proto AgentMode enum (see
// proto/ai/v1/agent_modes.proto). String-typed on purpose so it round-
// trips JSON without an int<->name mapping and matches the CHECK
// constraint persisted in threads.mode.
type AgentMode string

const (
	ModeUnspecified      AgentMode = ""
	ModeDataIntegration  AgentMode = "DATA_INTEGRATION"
	ModeDataConnection   AgentMode = "DATA_CONNECTION"
	ModeOntologyEditing  AgentMode = "ONTOLOGY_EDITING"
	ModeFunctionsEditing AgentMode = "FUNCTIONS_EDITING"
	ModeExploration      AgentMode = "EXPLORATION"
	ModeGovernance       AgentMode = "GOVERNANCE"
	ModeMachineLearning  AgentMode = "MACHINE_LEARNING"
	ModeOSDKReact        AgentMode = "OSDK_REACT"
	ModePlatformQA       AgentMode = "PLATFORM_QA"
)

// AllModes returns every valid AgentMode in stable display order.
// Used by /threads/{id}/mode validation and by the UI selector.
func AllModes() []AgentMode {
	return []AgentMode{
		ModeDataIntegration,
		ModeDataConnection,
		ModeOntologyEditing,
		ModeFunctionsEditing,
		ModeExploration,
		ModeGovernance,
		ModeMachineLearning,
		ModeOSDKReact,
		ModePlatformQA,
	}
}

// ValidateAgentMode parses a case-sensitive mode name into an AgentMode.
// Empty input returns ModeUnspecified with no error so callers can
// distinguish "no mode set" from "invalid mode".
func ValidateAgentMode(s string) (AgentMode, error) {
	if s == "" {
		return ModeUnspecified, nil
	}
	for _, m := range AllModes() {
		if string(m) == s {
			return m, nil
		}
	}
	return ModeUnspecified, fmt.Errorf("agents: unknown AgentMode %q", s)
}

// modeApplicabilityTagPrefix is the per-tool opt-in marker. A tool whose
// Tags slice contains "mode:DATA_INTEGRATION" is allowed in
// DATA_INTEGRATION mode even if its ExecutionMode is not in the default
// allowlist (and likewise restricted from other modes if the tool also
// carries a "mode:only" tag — see toolModeTags).
const modeApplicabilityTagPrefix = "mode:"

// modeOnlyTag is set on tools that should *only* be visible in the
// modes they explicitly opt into. Without this tag, mode tags act as
// additive opt-ins and the default allowlist still applies.
const modeOnlyTag = "mode:only"

// defaultToolKindsByMode is the AI-FDE-aligned default allowlist of
// execution_mode values for each AgentMode. Threads override this by
// populating threads.active_mode_tools; an empty override falls back
// here.
//
// Notes:
//   - knowledge_search is allowed in every mode — it's informational.
//   - simulated is allowed in every mode — it's the no-op baseline.
//   - EXPLORATION explicitly excludes mutating native_* tools.
//   - PLATFORM_QA only allows read-only baselines.
var defaultToolKindsByMode = map[AgentMode][]string{
	ModeDataIntegration: {
		"simulated", "knowledge_search",
		"native_pipeline", "native_dataset", "native_sql",
		"native_code_repo", "openfoundry_api",
	},
	ModeDataConnection: {
		"simulated", "knowledge_search",
		"openfoundry_api", "http_json",
	},
	ModeOntologyEditing: {
		"simulated", "knowledge_search",
		"native_ontology", "openfoundry_api",
	},
	ModeFunctionsEditing: {
		"simulated", "knowledge_search",
		"native_code_repo", "openfoundry_api",
	},
	ModeExploration: {
		"simulated", "knowledge_search",
		"native_sql", "native_dataset", "openfoundry_api",
	},
	ModeGovernance: {
		"simulated", "knowledge_search",
		"openfoundry_api",
	},
	ModeMachineLearning: {
		"simulated", "knowledge_search",
		"native_dataset", "native_pipeline", "native_code_repo",
		"openfoundry_api",
	},
	ModeOSDKReact: {
		"simulated", "knowledge_search",
		"native_code_repo", "openfoundry_api",
	},
	ModePlatformQA: {
		"simulated", "knowledge_search",
	},
}

// DefaultToolKinds returns the default execution_mode allowlist for the
// given AgentMode. Returns nil for ModeUnspecified and for unknown
// modes — callers should treat nil as "no filter, expose everything".
func DefaultToolKinds(mode AgentMode) []string {
	if mode == ModeUnspecified {
		return nil
	}
	kinds, ok := defaultToolKindsByMode[mode]
	if !ok {
		return nil
	}
	// Return a copy so callers can't mutate the default table.
	out := make([]string, len(kinds))
	copy(out, kinds)
	return out
}

// ModeToolRegistry filters a flat catalog of tools by the active mode
// of a thread. Construct one per session (or per request); it holds no
// state beyond the input catalog.
type ModeToolRegistry struct {
	// AllTools is the unfiltered catalog the agent was registered with
	// (typically threads.tool_manifest's tools[] flattened into
	// ToolDefinition rows).
	AllTools []models.ToolDefinition
}

// NewModeToolRegistry constructs a registry over the given catalog.
// The slice is retained by reference; callers should not mutate it
// after passing it in.
func NewModeToolRegistry(tools []models.ToolDefinition) *ModeToolRegistry {
	return &ModeToolRegistry{AllTools: tools}
}

// FilterByMode returns the subset of AllTools allowed under mode.
//
// Resolution order:
//  1. If mode is ModeUnspecified, every active tool is returned
//     unchanged.
//  2. The effective allowlist is enabledToolKinds when non-empty, else
//     DefaultToolKinds(mode).
//  3. A tool passes when its ExecutionMode is in the allowlist, OR
//     when its Tags include "mode:<NAME>" matching the active mode.
//  4. A tool tagged "mode:only" is *excluded* from every mode it does
//     not explicitly opt into, regardless of the allowlist.
//  5. Tools with Status != "active" are always filtered out.
func (r *ModeToolRegistry) FilterByMode(mode AgentMode, enabledToolKinds []string) []models.ToolDefinition {
	if r == nil || len(r.AllTools) == 0 {
		return nil
	}

	if mode == ModeUnspecified {
		return activeTools(r.AllTools)
	}

	allowlist := enabledToolKinds
	if len(allowlist) == 0 {
		allowlist = DefaultToolKinds(mode)
	}
	allowed := map[string]struct{}{}
	for _, k := range allowlist {
		allowed[k] = struct{}{}
	}

	out := make([]models.ToolDefinition, 0, len(r.AllTools))
	for _, t := range r.AllTools {
		if !isActive(t) {
			continue
		}
		if !r.toolAllowed(&t, mode, allowed) {
			continue
		}
		out = append(out, t)
	}
	return out
}

// IsToolAllowed reports whether the given tool would survive the mode
// filter. Used by ExecutePlan to reject tool calls the planner emits
// outside of the active mode's surface (defense-in-depth — the planner
// is given the filtered catalog, but a buggy LLM may hallucinate tool
// names).
func (r *ModeToolRegistry) IsToolAllowed(tool *models.ToolDefinition, mode AgentMode, enabledToolKinds []string) bool {
	if tool == nil {
		return false
	}
	if !isActive(*tool) {
		return false
	}
	if mode == ModeUnspecified {
		return true
	}
	allowlist := enabledToolKinds
	if len(allowlist) == 0 {
		allowlist = DefaultToolKinds(mode)
	}
	allowed := map[string]struct{}{}
	for _, k := range allowlist {
		allowed[k] = struct{}{}
	}
	return r.toolAllowed(tool, mode, allowed)
}

func (r *ModeToolRegistry) toolAllowed(tool *models.ToolDefinition, mode AgentMode, allowed map[string]struct{}) bool {
	tagModes, only := toolModeTags(tool.Tags)

	// "mode:only" means the tool is *only* visible in its declared
	// modes; the execution-mode allowlist no longer grants access.
	if only {
		for _, m := range tagModes {
			if m == mode {
				return true
			}
		}
		return false
	}

	// Explicit per-tool opt-in trumps the allowlist.
	for _, m := range tagModes {
		if m == mode {
			return true
		}
	}

	_, ok := allowed[tool.ExecutionMode]
	return ok
}

// toolModeTags extracts the per-tool mode opt-ins from a Tags slice.
// Tags look like "mode:DATA_INTEGRATION"; unknown mode names are
// ignored so a typo doesn't silently change behaviour. The second
// return value is true when the special "mode:only" tag is present.
func toolModeTags(tags []string) ([]AgentMode, bool) {
	var modes []AgentMode
	var only bool
	for _, t := range tags {
		if t == modeOnlyTag {
			only = true
			continue
		}
		if !strings.HasPrefix(t, modeApplicabilityTagPrefix) {
			continue
		}
		name := strings.TrimPrefix(t, modeApplicabilityTagPrefix)
		m, err := ValidateAgentMode(name)
		if err != nil || m == ModeUnspecified {
			continue
		}
		modes = append(modes, m)
	}
	return modes, only
}

func isActive(t models.ToolDefinition) bool {
	// Status defaults to "active" at the catalog layer; tools without
	// an explicit status are treated as active for back-compat with
	// pre-status rows.
	return t.Status == "" || t.Status == models.DefaultToolStatus
}

func activeTools(tools []models.ToolDefinition) []models.ToolDefinition {
	out := make([]models.ToolDefinition, 0, len(tools))
	for _, t := range tools {
		if isActive(t) {
			out = append(out, t)
		}
	}
	return out
}
