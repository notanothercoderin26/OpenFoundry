// Package azure_blob is the Go port of
// `services/connector-management-service/src/connectors/azure_blob.rs` —
// the Azure Blob / ADLS Gen2 / OneLake "open table" source.
//
// Foundry-aligned thin wrapper. The adapter itself does not read object
// payloads — that is delegated to the connector agent or to clients
// consuming the Iceberg REST catalog (see internal/handlers/iceberg_catalog.go).
//
// Discovery turns inline `iceberg_tables[]` / `delta_tables[]` declared in
// `connection.config` into [adapters.Source] entries with the upstream
// `abfss://…/metadata.json` pointer attached. The catalog then forwards
// that pointer verbatim to clients via `LoadTable`, fulfilling the
// zero-copy promise.
//
// Credential vending (account SAS / service SAS) lives in
// internal/handlers/credentials_vending.go on the platform side, not here.
//
// Required config keys:
//   - `account_name` (string)  — storage account
//   - one of `account_key` (base64), `sas_token` or `oauth_token`
//
// Optional:
//   - `container_name` — narrows service-SAS scope
//   - `iceberg_tables[]`, `delta_tables[]` — see internal/adapters/opentable.
package azure_blob

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/adapters"
	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/adapters/opentable"
	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/models"
)

// ConnectorType is the `connections.connector_type` value the registry
// binds this adapter under. Mirrors the Rust module's implicit name.
const ConnectorType = "azure_blob"

const storePrefix = "azure"

// Adapter is the azure_blob [adapters.ConnectorAdapter] implementation. It
// is stateless and safe for concurrent use.
type Adapter struct{}

// New returns a ready-to-use [Adapter].
func New() *Adapter { return &Adapter{} }

// Factory returns an [adapters.Factory] that yields the singleton Adapter.
// Inline-catalog adapters carry no per-connection state, so a single
// instance is shared across requests.
func Factory() adapters.Factory { return adapters.SingletonFactory(New()) }

type azureConfig struct {
	AccountName   string          `json:"account_name"`
	AccountKey    json.RawMessage `json:"account_key"`
	SASToken      json.RawMessage `json:"sas_token"`
	OAuthToken    json.RawMessage `json:"oauth_token"`
	ContainerName string          `json:"container_name"`
}

// ValidateConfig mirrors Rust's `validate_config`: a non-empty account_name
// plus at least one credential variant is required.
func ValidateConfig(raw json.RawMessage) error {
	if len(raw) == 0 {
		return errors.New("azure_blob source requires 'account_name'")
	}
	var cfg azureConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return fmt.Errorf("azure_blob: invalid config: %w", err)
	}
	if strings.TrimSpace(cfg.AccountName) == "" {
		return errors.New("azure_blob source requires 'account_name'")
	}
	if len(cfg.AccountKey) == 0 && len(cfg.SASToken) == 0 && len(cfg.OAuthToken) == 0 {
		return errors.New("azure_blob source requires one of 'account_key', 'sas_token' or 'oauth_token'")
	}
	return nil
}

// DiscoverSources turns the inline iceberg_tables[] / delta_tables[] entries
// into [adapters.Source] descriptors. Mirrors Rust's `discover_sources`,
// including its "must declare at least one table" failure mode.
func (a *Adapter) DiscoverSources(_ context.Context, c *models.Connection, _ string) ([]adapters.Source, error) {
	if c == nil {
		return nil, errors.New("azure_blob: connection is nil")
	}
	if err := ValidateConfig(c.Config); err != nil {
		return nil, err
	}
	sources, err := opentable.Discover(c.Config, storePrefix)
	if err != nil {
		return nil, fmt.Errorf("azure_blob: %w", err)
	}
	if len(sources) == 0 {
		return nil, errors.New("azure_blob source did not expose any virtual tables; declare 'iceberg_tables[]' or 'delta_tables[]'")
	}
	return sources, nil
}

// QueryVirtualTable is unsupported for inline-catalog sources — clients
// resolve the upstream metadata pointer through the Iceberg REST `LoadTable`
// path instead. Mirrors Rust by returning the unsupported-capability
// envelope.
func (a *Adapter) QueryVirtualTable(_ context.Context, _ *models.Connection, _ *adapters.Query, _ string) (*adapters.Result, error) {
	return nil, fmt.Errorf("%w: azure_blob virtual-table preview", adapters.ErrNotImplemented)
}

// StreamArrow is unsupported for the same reason as QueryVirtualTable.
func (a *Adapter) StreamArrow(_ context.Context, _ *models.Connection, _ *adapters.Query, _ string) (adapters.ArrowStream, error) {
	return nil, fmt.Errorf("%w: azure_blob arrow streaming", adapters.ErrNotImplemented)
}

// BuildIngestSpec is unsupported — azure_blob is a zero-copy source, so
// ingestion-replication-service is not in the path.
func (a *Adapter) BuildIngestSpec(_ context.Context, _ *models.Connection, _ *adapters.Source) (*adapters.IngestSpec, error) {
	return nil, fmt.Errorf("%w: azure_blob ingest spec", adapters.ErrNotImplemented)
}
