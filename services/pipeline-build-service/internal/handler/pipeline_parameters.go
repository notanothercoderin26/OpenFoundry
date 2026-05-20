package handler

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/domain/parameters"
	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// substitutePipelineParameters resolves ${params.X} references inside the
// supplied node configs using the pipeline's stored parameter definitions
// (best effort — when the pipeline row cannot be loaded the nodes are
// returned unchanged so the editor's draft preview path still works).
func substitutePipelineParameters(ctx context.Context, pipelineID uuid.UUID, nodes []models.PipelineNode) ([]models.PipelineNode, error) {
	params, ok := loadPipelineParameters(ctx, pipelineID)
	if !ok || len(params) == 0 {
		return nodes, nil
	}
	values, err := parameters.Resolve(params)
	if err != nil {
		return nil, err
	}
	return parameters.Apply(nodes, values)
}

func loadPipelineParameters(ctx context.Context, pipelineID uuid.UUID) ([]models.PipelineParameter, bool) {
	if pipelineID == uuid.Nil {
		return nil, false
	}
	repo, ok := currentPipelineAuthoringRepository()
	if !ok {
		return nil, false
	}
	pipeline, err := repo.GetPipeline(ctx, pipelineID)
	if err != nil || pipeline == nil {
		return nil, false
	}
	params, err := models.ParsePipelineParameters(pipeline.Parameters)
	if err != nil {
		return nil, false
	}
	return params, true
}

// substitutePipelineParametersOnModel applies ${params.X} substitution using
// the parameters stored directly on the supplied Pipeline model. Optional
// overrides are merged on top of the defaults so callers can pass per-run
// parameter values without losing the pipeline-level defaults for params
// that the request did not override.
func substitutePipelineParametersOnModel(pipeline *models.Pipeline, nodes []models.PipelineNode, overrides map[string]json.RawMessage) ([]models.PipelineNode, error) {
	if pipeline == nil {
		return nodes, nil
	}
	params, err := models.ParsePipelineParameters(pipeline.Parameters)
	if err != nil {
		return nil, err
	}
	if len(params) == 0 && len(overrides) == 0 {
		return nodes, nil
	}
	values, err := parameters.Resolve(params)
	if err != nil {
		return nil, err
	}
	if len(overrides) > 0 {
		decoded, err := decodeParameterOverrides(params, overrides)
		if err != nil {
			return nil, err
		}
		values = parameters.Override(values, decoded)
	}
	return parameters.Apply(nodes, values)
}

func decodeParameterOverrides(definitions []models.PipelineParameter, overrides map[string]json.RawMessage) (parameters.Values, error) {
	defs := make(map[string]models.PipelineParameterType, len(definitions))
	for _, def := range definitions {
		defs[def.Name] = def.Type
	}
	out := make(parameters.Values, len(overrides))
	for name, raw := range overrides {
		paramType, ok := defs[name]
		if !ok {
			return nil, fmt.Errorf("parameter override %q does not exist on this pipeline", name)
		}
		var decoded any
		switch paramType {
		case models.PipelineParameterTypeString:
			var v string
			if err := json.Unmarshal(raw, &v); err != nil {
				return nil, fmt.Errorf("parameter override %q: expected string", name)
			}
			decoded = v
		case models.PipelineParameterTypeInteger:
			var v int64
			if err := json.Unmarshal(raw, &v); err != nil {
				return nil, fmt.Errorf("parameter override %q: expected integer", name)
			}
			decoded = v
		case models.PipelineParameterTypeFloat:
			var v float64
			if err := json.Unmarshal(raw, &v); err != nil {
				return nil, fmt.Errorf("parameter override %q: expected number", name)
			}
			decoded = v
		case models.PipelineParameterTypeBoolean:
			var v bool
			if err := json.Unmarshal(raw, &v); err != nil {
				return nil, fmt.Errorf("parameter override %q: expected boolean", name)
			}
			decoded = v
		default:
			return nil, fmt.Errorf("parameter override %q: unknown type %q", name, paramType)
		}
		out[name] = decoded
	}
	return out, nil
}
