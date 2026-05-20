package handler

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"strings"

	pipelineexpression "github.com/openfoundry/openfoundry-go/libs/pipeline-expression"
	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/domain/executor"
	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

// runMLPredict resolves a registered ML model and emits one prediction per
// input row. When the model exposes an inference_url the runtime would POST
// the mapped features to that endpoint and parse the response; this MVP
// keeps that path stubbed and falls back to a deterministic mock prediction
// per row so authors can wire pipelines end-to-end before the serving stack
// is ready. The mock derives values from sha256(model.slug + row hash) so
// the same row produces the same prediction on every preview / run.
func (rt *lightweightTableRuntime) runMLPredict(ctx context.Context, node executor.NodeContext, cfg tableRuntimeConfig) ([]pipelineexpression.Row, error) {
	if strings.TrimSpace(cfg.ModelID) == "" {
		return nil, fmt.Errorf("ml_predict requires model_id")
	}
	repo, ok := currentMLModelRepository()
	if !ok {
		return nil, fmt.Errorf("ml_model_repository_not_configured")
	}
	model, err := repo.GetMLModel(ctx, cfg.ModelID)
	if err != nil {
		return nil, fmt.Errorf("ml_predict: %w", err)
	}
	if len(model.OutputSchema) == 0 {
		return nil, fmt.Errorf("ml_predict: model %q has no declared output schema", model.Slug)
	}
	inputRows, err := rt.firstDependencyRows(node)
	if err != nil {
		return nil, err
	}
	mapping := normalizeMLInputMapping(cfg.InputMapping, model.InputSchema)
	outputColumns := normalizeMLOutputColumns(cfg.OutputColumns, model.OutputSchema)
	out := make([]pipelineexpression.Row, 0, len(inputRows))
	for _, row := range inputRows {
		clone := make(pipelineexpression.Row, len(row)+len(outputColumns)+1)
		for k, v := range row {
			clone[k] = v
		}
		features := extractMLFeatures(row, mapping)
		seed := mlPredictionSeed(model.Slug, model.Version, features)
		for _, field := range model.OutputSchema {
			columnName := outputColumns[field.Name]
			if columnName == "" {
				columnName = field.Name
			}
			clone[columnName] = mockMLPrediction(field, seed)
		}
		// Surface the runtime mode so consumers know predictions are mocked.
		clone["_ml_inference_mode"] = jsonEncodeOrNull(modeForModel(model))
		out = append(out, clone)
	}
	return out, nil
}

func normalizeMLInputMapping(provided map[string]string, schema []models.MLModelField) map[string]string {
	out := make(map[string]string, len(schema))
	for _, field := range schema {
		if mapped, ok := provided[field.Name]; ok && mapped != "" {
			out[field.Name] = mapped
		} else {
			out[field.Name] = field.Name
		}
	}
	return out
}

func normalizeMLOutputColumns(provided map[string]string, schema []models.MLModelField) map[string]string {
	out := make(map[string]string, len(schema))
	for _, field := range schema {
		if mapped, ok := provided[field.Name]; ok && strings.TrimSpace(mapped) != "" {
			out[field.Name] = mapped
		} else {
			out[field.Name] = field.Name
		}
	}
	return out
}

func extractMLFeatures(row pipelineexpression.Row, mapping map[string]string) map[string]json.RawMessage {
	features := make(map[string]json.RawMessage, len(mapping))
	for featureName, sourceColumn := range mapping {
		raw, ok := row[sourceColumn]
		if !ok {
			features[featureName] = json.RawMessage("null")
			continue
		}
		encoded, err := json.Marshal(raw)
		if err != nil {
			features[featureName] = json.RawMessage("null")
			continue
		}
		features[featureName] = encoded
	}
	return features
}

func mlPredictionSeed(slug, version string, features map[string]json.RawMessage) uint64 {
	h := sha256.New()
	h.Write([]byte(slug))
	h.Write([]byte{0})
	h.Write([]byte(version))
	keys := sortedKeys(features)
	for _, key := range keys {
		h.Write([]byte{0})
		h.Write([]byte(key))
		h.Write([]byte{0})
		h.Write(features[key])
	}
	sum := h.Sum(nil)
	return binary.BigEndian.Uint64(sum[:8])
}

func sortedKeys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	// Inline insertion sort to avoid importing sort everywhere — keys are
	// always small.
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j-1] > out[j]; j-- {
			out[j-1], out[j] = out[j], out[j-1]
		}
	}
	return out
}

func mockMLPrediction(field models.MLModelField, seed uint64) json.RawMessage {
	switch strings.ToLower(field.Type) {
	case "boolean", "bool":
		if seed%2 == 0 {
			return json.RawMessage("true")
		}
		return json.RawMessage("false")
	case "integer", "int", "int32", "int64", "long":
		return jsonEncodeOrNull(int64(seed % 1000))
	case "float", "double", "number":
		// Project to [0, 1) with three decimals of resolution.
		return jsonEncodeOrNull(float64(seed%1000) / 1000.0)
	case "string", "text":
		labels := []string{"low", "medium", "high"}
		return jsonEncodeOrNull(labels[seed%uint64(len(labels))])
	default:
		return jsonEncodeOrNull(fmt.Sprintf("mock-%d", seed%1000))
	}
}

func modeForModel(model *models.MLModel) string {
	if strings.TrimSpace(model.InferenceURL) == "" {
		return "mock"
	}
	return "stub_remote_unimplemented"
}

func jsonEncodeOrNull(value any) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil {
		return json.RawMessage("null")
	}
	return encoded
}
