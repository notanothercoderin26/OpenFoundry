// Package lineage hosts the lineage handler state.
//
// AppState carries only the fields actually consumed by the lineage
// code path: the pgx pool, the lineage runtime store, the JWT config,
// the HTTP client and a fistful of service URLs / S3 knobs. The
// runtime sink (Kafka → Iceberg) lives outside this package and owns
// its own state.
package lineage

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineagestore"
)

// AppState is the shared state consumed by the lineage handlers and
// the lineage domain code.
type AppState struct {
	DB                          *pgxpool.Pool
	Store                       lineagestore.Store
	HTTPClient                  *http.Client
	DatasetServiceURL           string
	WorkflowServiceURL          string
	DistributedPipelineWorkers  int
}
