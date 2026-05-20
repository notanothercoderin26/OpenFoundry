package handler

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	pipelineexpression "github.com/openfoundry/openfoundry-go/libs/pipeline-expression"
	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/domain/executor"
	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

type fakeMLModelRepo struct {
	models map[string]models.MLModel
}

func (f *fakeMLModelRepo) ListMLModels(context.Context) ([]models.MLModel, error) {
	out := make([]models.MLModel, 0, len(f.models))
	for _, m := range f.models {
		out = append(out, m)
	}
	return out, nil
}

func (f *fakeMLModelRepo) GetMLModel(_ context.Context, idOrSlug string) (*models.MLModel, error) {
	if m, ok := f.models[idOrSlug]; ok {
		return &m, nil
	}
	for _, m := range f.models {
		if m.Slug == idOrSlug {
			return &m, nil
		}
	}
	return nil, errors.New("ml model not found")
}

func (f *fakeMLModelRepo) CreateMLModel(context.Context, models.CreateMLModelRequest, *uuid.UUID) (*models.MLModel, error) {
	return nil, errors.New("not implemented")
}

func (f *fakeMLModelRepo) DeleteMLModel(context.Context, uuid.UUID) (bool, error) {
	return false, errors.New("not implemented")
}

func rawJSON(value any) json.RawMessage {
	out, _ := json.Marshal(value)
	return out
}

func TestRunMLPredictAppendsOutputsDeterministically(t *testing.T) {
	model := models.MLModel{
		ID:          uuid.New(),
		Slug:        "classifier-v1",
		DisplayName: "Trail classifier",
		Version:     "0.1.0",
		InputSchema: []models.MLModelField{
			{Name: "temperature_c", Type: "float"},
			{Name: "elevation_m", Type: "integer"},
		},
		OutputSchema: []models.MLModelField{
			{Name: "condition", Type: "string"},
			{Name: "confidence", Type: "float"},
		},
	}
	repo := &fakeMLModelRepo{models: map[string]models.MLModel{model.ID.String(): model}}
	restore := SetMLModelRepository(repo)
	t.Cleanup(restore)

	rt := &lightweightTableRuntime{tables: map[string][]pipelineexpression.Row{}}
	// Seed an upstream dependency with two rows.
	rt.tables["src"] = []pipelineexpression.Row{
		{"temperature_c": rawJSON(12.5), "elevation_m": rawJSON(1450)},
		{"temperature_c": rawJSON(-3.0), "elevation_m": rawJSON(2200)},
	}
	node := executor.NodeContext{Node: executor.Node{ID: "predict", DependsOn: []string{"src"}}}
	cfg := tableRuntimeConfig{
		ModelID: model.ID.String(),
		InputMapping: map[string]string{
			"temperature_c": "temperature_c",
			"elevation_m":   "elevation_m",
		},
	}

	first, err := rt.runMLPredict(context.Background(), node, cfg)
	require.NoError(t, err)
	require.Len(t, first, 2)
	require.Contains(t, first[0], "condition")
	require.Contains(t, first[0], "confidence")
	require.Contains(t, first[0], "_ml_inference_mode")
	require.Equal(t, json.RawMessage(`"mock"`), first[0]["_ml_inference_mode"])

	// Same inputs produce the same predictions on a second invocation.
	second, err := rt.runMLPredict(context.Background(), node, cfg)
	require.NoError(t, err)
	require.Equal(t, string(first[0]["condition"]), string(second[0]["condition"]))
	require.Equal(t, string(first[1]["confidence"]), string(second[1]["confidence"]))
}

func TestRunMLPredictHonoursOutputColumnRenames(t *testing.T) {
	model := models.MLModel{
		ID:           uuid.New(),
		Slug:         "scorer",
		DisplayName:  "Scorer",
		Version:      "1.0.0",
		OutputSchema: []models.MLModelField{{Name: "score", Type: "float"}},
	}
	repo := &fakeMLModelRepo{models: map[string]models.MLModel{model.ID.String(): model}}
	restore := SetMLModelRepository(repo)
	t.Cleanup(restore)

	rt := &lightweightTableRuntime{tables: map[string][]pipelineexpression.Row{}}
	rt.tables["src"] = []pipelineexpression.Row{{}}
	node := executor.NodeContext{Node: executor.Node{ID: "predict", DependsOn: []string{"src"}}}
	cfg := tableRuntimeConfig{
		ModelID:       model.ID.String(),
		OutputColumns: map[string]string{"score": "predicted_score"},
	}
	rows, err := rt.runMLPredict(context.Background(), node, cfg)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Contains(t, rows[0], "predicted_score")
	require.NotContains(t, rows[0], "score")
}

func TestRunMLPredictRejectsMissingModelID(t *testing.T) {
	rt := &lightweightTableRuntime{tables: map[string][]pipelineexpression.Row{}}
	rt.tables["src"] = []pipelineexpression.Row{{}}
	node := executor.NodeContext{Node: executor.Node{ID: "predict", DependsOn: []string{"src"}}}
	_, err := rt.runMLPredict(context.Background(), node, tableRuntimeConfig{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "model_id")
}

func TestRunMLPredictRejectsUnknownModel(t *testing.T) {
	repo := &fakeMLModelRepo{models: map[string]models.MLModel{}}
	restore := SetMLModelRepository(repo)
	t.Cleanup(restore)

	rt := &lightweightTableRuntime{tables: map[string][]pipelineexpression.Row{}}
	rt.tables["src"] = []pipelineexpression.Row{{}}
	node := executor.NodeContext{Node: executor.Node{ID: "predict", DependsOn: []string{"src"}}}
	_, err := rt.runMLPredict(context.Background(), node, tableRuntimeConfig{ModelID: "does-not-exist"})
	require.Error(t, err)
}
