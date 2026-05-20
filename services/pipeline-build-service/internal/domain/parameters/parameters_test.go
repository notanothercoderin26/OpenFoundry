package parameters

import (
	"encoding/json"
	"errors"
	"sort"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/models"
)

func raw(value any) json.RawMessage {
	out, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return out
}

func TestResolveAppliesDefaults(t *testing.T) {
	values, err := Resolve([]models.PipelineParameter{
		{Name: "region", Type: models.PipelineParameterTypeString, DefaultValue: raw("us-west")},
		{Name: "limit", Type: models.PipelineParameterTypeInteger, DefaultValue: raw(100)},
		{Name: "ratio", Type: models.PipelineParameterTypeFloat, DefaultValue: raw(1.5)},
		{Name: "enabled", Type: models.PipelineParameterTypeBoolean, DefaultValue: raw(true)},
	})
	require.NoError(t, err)
	require.Equal(t, "us-west", values["region"])
	require.Equal(t, int64(100), values["limit"])
	require.Equal(t, 1.5, values["ratio"])
	require.Equal(t, true, values["enabled"])
}

func TestResolveRequiredWithoutDefaultFails(t *testing.T) {
	_, err := Resolve([]models.PipelineParameter{
		{Name: "secret", Type: models.PipelineParameterTypeString, Required: true},
	})
	require.Error(t, err)
}

func TestApplyReplacesStringInsideConfig(t *testing.T) {
	nodes := []models.PipelineNode{
		{
			ID:     "filter",
			Config: raw(map[string]any{"sql": "SELECT * FROM t WHERE region = '${params.region}'"}),
		},
	}
	out, err := Apply(nodes, Values{"region": "eu-central"})
	require.NoError(t, err)
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(out[0].Config, &cfg))
	require.Equal(t, "SELECT * FROM t WHERE region = 'eu-central'", cfg["sql"])
}

func TestApplyPreservesTypedValueWhenStringIsExactReference(t *testing.T) {
	nodes := []models.PipelineNode{
		{
			ID: "limit",
			Config: raw(map[string]any{
				"row_limit": "${params.limit}",
				"enabled":   "${params.enabled}",
				"ratio":     "${params.ratio}",
			}),
		},
	}
	out, err := Apply(nodes, Values{
		"limit":   int64(50),
		"enabled": true,
		"ratio":   1.5,
	})
	require.NoError(t, err)
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(out[0].Config, &cfg))
	require.Equal(t, float64(50), cfg["row_limit"], "JSON round-trip turns int64 into float64")
	require.Equal(t, true, cfg["enabled"])
	require.Equal(t, 1.5, cfg["ratio"])
}

func TestApplyHandlesMixedContent(t *testing.T) {
	nodes := []models.PipelineNode{
		{
			ID:     "msg",
			Config: raw(map[string]any{"banner": "${params.env}/${params.region}"}),
		},
	}
	out, err := Apply(nodes, Values{"env": "prod", "region": "us-west"})
	require.NoError(t, err)
	var cfg map[string]any
	require.NoError(t, json.Unmarshal(out[0].Config, &cfg))
	require.Equal(t, "prod/us-west", cfg["banner"])
}

func TestApplyRecursesIntoNestedObjectsAndArrays(t *testing.T) {
	nodes := []models.PipelineNode{
		{
			ID: "deep",
			Config: raw(map[string]any{
				"filters": []any{
					map[string]any{"field": "region", "value": "${params.region}"},
				},
			}),
		},
	}
	out, err := Apply(nodes, Values{"region": "ap-south-1"})
	require.NoError(t, err)
	var cfg struct {
		Filters []struct {
			Field string `json:"field"`
			Value string `json:"value"`
		} `json:"filters"`
	}
	require.NoError(t, json.Unmarshal(out[0].Config, &cfg))
	require.Equal(t, "ap-south-1", cfg.Filters[0].Value)
}

func TestApplyUnknownReferenceFails(t *testing.T) {
	nodes := []models.PipelineNode{
		{ID: "n", Config: raw(map[string]any{"sql": "SELECT ${params.missing}"})},
	}
	_, err := Apply(nodes, Values{})
	require.ErrorIs(t, err, ErrUnknownParameter)
}

func TestApplyIsPureDoesNotMutateInput(t *testing.T) {
	nodes := []models.PipelineNode{
		{ID: "n", Config: raw(map[string]any{"sql": "SELECT '${params.region}'"})},
	}
	original := append([]byte(nil), nodes[0].Config...)
	_, err := Apply(nodes, Values{"region": "us"})
	require.NoError(t, err)
	require.Equal(t, original, []byte(nodes[0].Config))
}

func TestReferencesCollectsDistinctNames(t *testing.T) {
	nodes := []models.PipelineNode{
		{ID: "a", Config: raw(map[string]any{"sql": "SELECT '${params.region}' AND '${params.env}'"})},
		{ID: "b", Config: raw(map[string]any{"sql": "WHERE x = '${params.region}'"})},
	}
	got := References(nodes)
	sort.Strings(got)
	require.Equal(t, []string{"env", "region"}, got)
}

func TestOverrideMergesOverridesOnTop(t *testing.T) {
	base := Values{"region": "us-west", "limit": int64(10)}
	override := Values{"region": "eu-central"}
	merged := Override(base, override)
	require.Equal(t, "eu-central", merged["region"])
	require.Equal(t, int64(10), merged["limit"])
	// Original maps untouched.
	require.Equal(t, "us-west", base["region"])
}

func TestUnknownParameterErrorMessageIncludesName(t *testing.T) {
	nodes := []models.PipelineNode{{ID: "n", Config: raw(map[string]any{"sql": "SELECT ${params.missing}"})}}
	_, err := Apply(nodes, Values{})
	require.True(t, errors.Is(err, ErrUnknownParameter))
	require.Contains(t, err.Error(), "missing")
}
