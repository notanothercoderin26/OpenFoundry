package power_bi

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/adapters"
	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/models"
)

func TestValidateConfigAcceptsInlineDatasetCatalog(t *testing.T) {
	raw := json.RawMessage(`{
		"workspace_id": "workspace-01",
		"datasets": [{"dataset": "ExecutiveMetrics", "preview_rows": [{"metric": "margin", "value": 0.31}]}]
	}`)
	require.NoError(t, ValidateConfig(raw))
}

func TestValidateConfigRejectsBareConfig(t *testing.T) {
	require.Error(t, ValidateConfig(json.RawMessage(`{"workspace_id":"workspace-01"}`)))
}

func TestValidateConfigRequiresWorkspaceIDForResourceTemplate(t *testing.T) {
	raw := json.RawMessage(`{
		"base_url": "https://api.powerbi.com/",
		"dataset_path_template": "/v1.0/myorg/groups/{workspace_id}/datasets/{selector}"
	}`)
	err := ValidateConfig(raw)
	require.Error(t, err)
	require.Contains(t, err.Error(), "workspace_id")
}

func TestDiscoverSourcesReturnsInlineDatasets(t *testing.T) {
	c := &models.Connection{Config: json.RawMessage(`{
		"workspace_id": "workspace-01",
		"datasets": [{"dataset": "ExecutiveMetrics"}]
	}`)}
	sources, err := New().DiscoverSources(context.Background(), c, "")
	require.NoError(t, err)
	require.Len(t, sources, 1)
	require.Equal(t, "ExecutiveMetrics", sources[0].Selector)
	require.Equal(t, "power_bi_dataset", sources[0].SourceKind)
}

func TestQueryVirtualTableServesInlineSampleRows(t *testing.T) {
	c := &models.Connection{Config: json.RawMessage(`{
		"workspace_id": "workspace-01",
		"datasets": [{
			"dataset": "ExecutiveMetrics",
			"preview_rows": [{"metric": "margin", "value": 0.31}]
		}]
	}`)}
	res, err := New().QueryVirtualTable(context.Background(), c, &adapters.Query{Selector: "ExecutiveMetrics"}, "")
	require.NoError(t, err)
	require.Equal(t, 1, res.RowCount)
	require.JSONEq(t, `{"metric":"margin","value":0.31}`, string(res.Rows[0]))
}

func TestStreamArrowReturnsNotImplemented(t *testing.T) {
	_, err := New().StreamArrow(context.Background(), &models.Connection{}, &adapters.Query{}, "")
	require.True(t, errors.Is(err, adapters.ErrNotImplemented))
}

func TestBuildIngestSpecReturnsNotImplemented(t *testing.T) {
	_, err := New().BuildIngestSpec(context.Background(), &models.Connection{}, &adapters.Source{})
	require.True(t, errors.Is(err, adapters.ErrNotImplemented))
}

func TestFactoryProducesFreshAdapter(t *testing.T) {
	a := Factory().New()
	require.NotNil(t, a)
	_, ok := a.(*Adapter)
	require.True(t, ok)
}
