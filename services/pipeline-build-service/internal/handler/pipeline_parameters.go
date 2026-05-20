package handler

import (
	"context"

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
// the parameters stored directly on the supplied Pipeline model. Used by
// the run-trigger path where we have already loaded the pipeline.
func substitutePipelineParametersOnModel(pipeline *models.Pipeline, nodes []models.PipelineNode) ([]models.PipelineNode, error) {
	if pipeline == nil {
		return nodes, nil
	}
	params, err := models.ParsePipelineParameters(pipeline.Parameters)
	if err != nil {
		return nil, err
	}
	if len(params) == 0 {
		return nodes, nil
	}
	values, err := parameters.Resolve(params)
	if err != nil {
		return nil, err
	}
	return parameters.Apply(nodes, values)
}
