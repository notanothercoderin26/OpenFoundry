package handler

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/domain/parameters"
	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

func raw(value any) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}

func TestSubstitutePipelineParametersAppliesOverrides(t *testing.T) {
	pipeline := &models.Pipeline{
		Parameters: raw([]models.PipelineParameter{
			{Name: "region", Type: models.PipelineParameterTypeString, DefaultValue: raw("us-west")},
			{Name: "limit", Type: models.PipelineParameterTypeInteger, DefaultValue: raw(10)},
		}),
	}
	nodes := []models.PipelineNode{
		{ID: "n", Config: raw(map[string]any{"sql": "SELECT * WHERE region = '${params.region}' LIMIT ${params.limit}"})},
	}
	overrides := map[string]json.RawMessage{
		"region": raw("eu-central"),
	}
	out, err := substitutePipelineParametersOnModel(pipeline, nodes, overrides)
	require.NoError(t, err)
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(out[0].Config, &cfg))
	require.Equal(t, "SELECT * WHERE region = 'eu-central' LIMIT 10", cfg["sql"])
}

func TestSubstitutePipelineParametersRejectsUnknownOverride(t *testing.T) {
	pipeline := &models.Pipeline{
		Parameters: raw([]models.PipelineParameter{
			{Name: "region", Type: models.PipelineParameterTypeString, DefaultValue: raw("us-west")},
		}),
	}
	nodes := []models.PipelineNode{
		{ID: "n", Config: raw(map[string]any{"sql": "SELECT '${params.region}'"})},
	}
	_, err := substitutePipelineParametersOnModel(pipeline, nodes, map[string]json.RawMessage{
		"bogus": raw("value"),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), `"bogus"`)
}

func TestSubstitutePipelineParametersRejectsTypeMismatch(t *testing.T) {
	pipeline := &models.Pipeline{
		Parameters: raw([]models.PipelineParameter{
			{Name: "limit", Type: models.PipelineParameterTypeInteger, DefaultValue: raw(10)},
		}),
	}
	nodes := []models.PipelineNode{
		{ID: "n", Config: raw(map[string]any{"sql": "LIMIT ${params.limit}"})},
	}
	_, err := substitutePipelineParametersOnModel(pipeline, nodes, map[string]json.RawMessage{
		"limit": raw("not a number"),
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "expected integer")
}

func TestSubstitutePipelineParametersUnknownReferenceErrIncludesName(t *testing.T) {
	pipeline := &models.Pipeline{
		Parameters: raw([]models.PipelineParameter{
			{Name: "region", Type: models.PipelineParameterTypeString, DefaultValue: raw("us-west")},
		}),
	}
	nodes := []models.PipelineNode{
		{ID: "n", Config: raw(map[string]any{"sql": "SELECT ${params.foo}"})},
	}
	_, err := substitutePipelineParametersOnModel(pipeline, nodes, nil)
	require.Error(t, err)
	require.True(t, errors.Is(err, parameters.ErrUnknownParameter))
	require.Contains(t, err.Error(), "foo")
}
