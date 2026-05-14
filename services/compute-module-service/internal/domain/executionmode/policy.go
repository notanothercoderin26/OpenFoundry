// Package executionmode implements the mode-specific policy that
// gates Compute Module operations (checklist CM.2).
//
// Each module persists its execution mode at creation time (function
// or pipeline). Many downstream surfaces — the function gateway,
// pipeline runner, UI affordances — must ask "is this operation
// supported on this mode?" before they act. Centralising the answer
// here keeps every service consistent and prevents drift between the
// UI affordances and the server-side guard.
package executionmode

import (
	"errors"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

// Sentinel errors returned by EnsureFunctionMode / EnsurePipelineMode.
// HTTP handlers map both to 409 Conflict with a structured error body
// so the UI can switch tabs/affordances without parsing prose.
var (
	ErrFunctionOnly = errors.New("compute-module: operation requires function execution mode")
	ErrPipelineOnly = errors.New("compute-module: operation requires pipeline execution mode")
)

// Affordances enumerates the UI/API surfaces that are valid for a
// given execution mode. The frontend uses this to hide tabs/buttons;
// the backend uses it to short-circuit invalid configuration changes
// before they reach the repo.
//
// Keep the field set additive: new affordances may be appended, but
// existing fields must never change meaning so the wire shape stays
// stable for the capability catalog.
type Affordances struct {
	// Function-mode affordances.
	SupportsFunctionInvocation   bool `json:"supports_function_invocation"`
	SupportsFunctionRegistration bool `json:"supports_function_registration"`
	SupportsFunctionTesting      bool `json:"supports_function_testing"`
	SupportsOpenAPIImport        bool `json:"supports_openapi_import"`

	// Pipeline-mode affordances.
	SupportsPipelineInputConfig  bool `json:"supports_pipeline_input_config"`
	SupportsPipelineOutputConfig bool `json:"supports_pipeline_output_config"`
	SupportsPipelineRuns         bool `json:"supports_pipeline_runs"`
	SupportsStreamIO             bool `json:"supports_stream_io"`
	SupportsDatasetIO            bool `json:"supports_dataset_io"`
	SupportsMediaSetIO           bool `json:"supports_media_set_io"`
}

// For returns the affordance bundle for `mode`. An unknown mode
// returns the zero value — every affordance disabled.
func For(mode models.ExecutionMode) Affordances {
	switch mode {
	case models.ExecutionModeFunction:
		return Affordances{
			SupportsFunctionInvocation:   true,
			SupportsFunctionRegistration: true,
			SupportsFunctionTesting:      true,
			SupportsOpenAPIImport:        true,
		}
	case models.ExecutionModePipeline:
		return Affordances{
			SupportsPipelineInputConfig:  true,
			SupportsPipelineOutputConfig: true,
			SupportsPipelineRuns:         true,
			SupportsStreamIO:             true,
			SupportsDatasetIO:            true,
			SupportsMediaSetIO:           true,
		}
	}
	return Affordances{}
}

// EnsureFunctionMode returns ErrFunctionOnly when the module is not
// in function execution mode. Use this guard on any function-mode
// operation (function query, OpenAPI import, function test).
func EnsureFunctionMode(m *models.ComputeModule) error {
	if m == nil {
		return ErrFunctionOnly
	}
	if m.ExecutionMode != models.ExecutionModeFunction {
		return ErrFunctionOnly
	}
	return nil
}

// EnsurePipelineMode returns ErrPipelineOnly when the module is not
// in pipeline execution mode. Use this guard before persisting
// pipeline I/O config or triggering a pipeline run.
func EnsurePipelineMode(m *models.ComputeModule) error {
	if m == nil {
		return ErrPipelineOnly
	}
	if m.ExecutionMode != models.ExecutionModePipeline {
		return ErrPipelineOnly
	}
	return nil
}

// Snapshot bundles the mode + affordances for a single module. It is
// the wire shape returned by GET /compute-modules/{id}/execution-mode
// and is convenient for tests that want a single object to assert on.
type Snapshot struct {
	Mode        models.ExecutionMode `json:"mode"`
	Affordances Affordances          `json:"affordances"`
}

// SnapshotFor returns the Snapshot for `m`.
func SnapshotFor(m *models.ComputeModule) Snapshot {
	mode := models.ExecutionMode("")
	if m != nil {
		mode = m.ExecutionMode
	}
	return Snapshot{Mode: mode, Affordances: For(mode)}
}
