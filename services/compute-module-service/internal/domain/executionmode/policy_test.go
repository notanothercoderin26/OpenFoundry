package executionmode

import (
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/compute-module-service/internal/models"
)

func TestForFunctionMode(t *testing.T) {
	a := For(models.ExecutionModeFunction)
	if !a.SupportsFunctionInvocation || !a.SupportsFunctionRegistration {
		t.Fatal("function mode should expose function affordances")
	}
	if a.SupportsPipelineInputConfig || a.SupportsPipelineRuns || a.SupportsStreamIO {
		t.Fatalf("function mode should not expose pipeline affordances: %+v", a)
	}
}

func TestForPipelineMode(t *testing.T) {
	a := For(models.ExecutionModePipeline)
	if !a.SupportsPipelineInputConfig || !a.SupportsPipelineRuns || !a.SupportsStreamIO {
		t.Fatal("pipeline mode should expose pipeline affordances")
	}
	if a.SupportsFunctionInvocation || a.SupportsFunctionRegistration {
		t.Fatalf("pipeline mode should not expose function affordances: %+v", a)
	}
}

func TestForUnknownModeReturnsZeroAffordances(t *testing.T) {
	a := For(models.ExecutionMode("container"))
	if (a != Affordances{}) {
		t.Fatalf("unknown mode should disable every affordance, got %+v", a)
	}
}

func TestEnsureFunctionMode(t *testing.T) {
	fn := &models.ComputeModule{ID: uuid.New(), ExecutionMode: models.ExecutionModeFunction}
	if err := EnsureFunctionMode(fn); err != nil {
		t.Fatalf("expected pass for function-mode module, got %v", err)
	}
	pipe := &models.ComputeModule{ID: uuid.New(), ExecutionMode: models.ExecutionModePipeline}
	if err := EnsureFunctionMode(pipe); !errors.Is(err, ErrFunctionOnly) {
		t.Fatalf("expected ErrFunctionOnly for pipeline-mode module, got %v", err)
	}
	if err := EnsureFunctionMode(nil); !errors.Is(err, ErrFunctionOnly) {
		t.Fatalf("nil should fail closed with ErrFunctionOnly, got %v", err)
	}
}

func TestEnsurePipelineMode(t *testing.T) {
	pipe := &models.ComputeModule{ID: uuid.New(), ExecutionMode: models.ExecutionModePipeline}
	if err := EnsurePipelineMode(pipe); err != nil {
		t.Fatalf("expected pass for pipeline-mode module, got %v", err)
	}
	fn := &models.ComputeModule{ID: uuid.New(), ExecutionMode: models.ExecutionModeFunction}
	if err := EnsurePipelineMode(fn); !errors.Is(err, ErrPipelineOnly) {
		t.Fatalf("expected ErrPipelineOnly for function-mode module, got %v", err)
	}
	if err := EnsurePipelineMode(nil); !errors.Is(err, ErrPipelineOnly) {
		t.Fatalf("nil should fail closed with ErrPipelineOnly, got %v", err)
	}
}

func TestSnapshotFor(t *testing.T) {
	m := &models.ComputeModule{ExecutionMode: models.ExecutionModeFunction}
	s := SnapshotFor(m)
	if s.Mode != models.ExecutionModeFunction || !s.Affordances.SupportsFunctionInvocation {
		t.Fatalf("snapshot did not capture function mode: %+v", s)
	}
}
