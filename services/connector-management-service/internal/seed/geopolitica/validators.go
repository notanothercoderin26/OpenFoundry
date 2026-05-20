// Validator dispatch: bridges the seed package's Validator callback
// to the per-adapter `ValidateConfig` functions without making
// `seed/geopolitica` depend on every adapter package directly
// (avoiding an import cycle if an adapter ever wants to load seeds).
//
// The dispatch lives in this seed package — adapter packages remain
// agnostic about the seed catalog. cmd/main can choose to wire this
// or pass a no-op validator if the seed is being applied in a context
// where adapter contracts are validated separately (e.g. via
// `connection_create` HTTP handler).

package geopolitica

import (
	"encoding/json"
	"fmt"

	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/adapters/csv"
	"github.com/openfoundry/openfoundry-go/services/connector-management-service/internal/adapters/rest_api"
)

// DefaultValidator dispatches a seed entry's (connector_type, config)
// pair to the matching adapter's ValidateConfig. Returns an error
// when the connector type is not seed-registered — we keep the
// dispatch tight because the seed catalog is curated and a typo in
// `ConnectorType` is always a bug.
//
// Adapters not used by the seed catalog (postgres, kafka, jdbc, ...)
// intentionally don't appear here. Adding a new seed source whose
// connector_type is not yet covered is a code change in this file.
func DefaultValidator(connectorType string, config json.RawMessage) error {
	switch connectorType {
	case "rest_api":
		return rest_api.ValidateConfig(config)
	case "csv":
		return csv.ValidateConfig(config)
	default:
		return fmt.Errorf("geopolitica seed: no validator registered for connector_type %q", connectorType)
	}
}
