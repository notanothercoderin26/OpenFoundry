package odbc

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/adapters"
	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/models"
)

func TestValidateConfigAcceptsInlineTableCatalog(t *testing.T) {
	raw := json.RawMessage(`{
		"dsn": "WarehouseDSN",
		"tables": [{"table": "analytics.orders", "sample_rows": [{"order_id": "ord-1"}]}]
	}`)
	require.NoError(t, ValidateConfig(raw))
}

func TestValidateConfigRejectsBareConfig(t *testing.T) {
	require.Error(t, ValidateConfig(json.RawMessage(`{"dsn":"WarehouseDSN"}`)))
}

func TestValidateConfigRequiresDSNForResourceTemplate(t *testing.T) {
	raw := json.RawMessage(`{
		"base_url": "https://odbc-bridge.example.com/",
		"resource_path_template": "/v1/dsn/{dsn}/tables/{selector}"
	}`)
	err := ValidateConfig(raw)
	require.Error(t, err)
	require.Contains(t, err.Error(), "dsn")
}

func TestDiscoverSourcesReturnsInlineTables(t *testing.T) {
	c := &models.Connection{Config: json.RawMessage(`{
		"dsn": "WarehouseDSN",
		"tables": [{"table": "analytics.orders"}, {"table": "analytics.customers"}]
	}`)}
	sources, err := New().DiscoverSources(context.Background(), c, "")
	require.NoError(t, err)
	require.Len(t, sources, 2)
	require.Equal(t, "analytics.orders", sources[0].Selector)
	require.Equal(t, "odbc_table", sources[0].SourceKind)
}

func TestQueryVirtualTableServesInlineSampleRows(t *testing.T) {
	c := &models.Connection{Config: json.RawMessage(`{
		"dsn": "WarehouseDSN",
		"tables": [{
			"table": "analytics.orders",
			"sample_rows": [{"order_id": "ord-1"}, {"order_id": "ord-2"}]
		}]
	}`)}
	limit := 1
	res, err := New().QueryVirtualTable(context.Background(), c, &adapters.Query{Selector: "analytics.orders", Limit: &limit}, "")
	require.NoError(t, err)
	require.Equal(t, 1, res.RowCount)
	require.JSONEq(t, `{"order_id":"ord-1"}`, string(res.Rows[0]))
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
