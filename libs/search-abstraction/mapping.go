package searchabstraction

import (
	"context"
	"errors"

	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// ErrMappingDeployUnconfigured is returned by RegisterTypeMapping /
// DropTypeMapping when the backend implements the interface but is
// not currently configured to perform a real deploy (e.g. Vespa
// without VESPA_CONFIG_ENDPOINT). Consumers — primarily the
// ontology-indexer's schemasync handler — should treat this as
// "skipped, do not retry, do not error" so the Kafka offset is
// committed and the loop keeps draining.
var ErrMappingDeployUnconfigured = errors.New("search backend: mapping deploy not configured")

// MappingFieldType is the search-backend-agnostic primitive type for
// one indexed field. Backends translate this to their native types
// (Vespa `field … type …`, OpenSearch index mappings, etc.).
type MappingFieldType string

const (
	FieldString  MappingFieldType = "string"
	FieldText    MappingFieldType = "text" // full-text-tokenised string
	FieldInteger MappingFieldType = "integer"
	FieldLong    MappingFieldType = "long"
	FieldDouble  MappingFieldType = "double"
	FieldBoolean MappingFieldType = "boolean"
	FieldDate    MappingFieldType = "date"
	FieldGeo     MappingFieldType = "geo"
	FieldUnknown MappingFieldType = "unknown"
)

// MappingField describes one property of an object type. The
// boolean flags carry the searchable / sortable / filterable hints
// the ontology UI surfaces — backends decide how to honour them
// (Vespa `indexing: index | attribute` flags, OpenSearch
// `doc_values` / `keyword` subfields, etc.).
type MappingField struct {
	Name       string           `json:"name"`
	Type       MappingFieldType `json:"type"`
	IsArray    bool             `json:"is_array,omitempty"`
	Searchable bool             `json:"searchable,omitempty"`
	Sortable   bool             `json:"sortable,omitempty"`
	Filterable bool             `json:"filterable,omitempty"`
}

// TypeMapping is the per-(tenant?, type) mapping the indexer
// derives from `ontology.object_type.changed.v1` envelopes and
// pushes through MappingRegistrar.
//
// Tenant is optional. Vespa schemas are application-wide and ignore
// it; OpenSearch backends MAY choose to namespace indices by tenant.
type TypeMapping struct {
	Tenant     repos.TenantId `json:"tenant,omitempty"`
	TypeID     repos.TypeId   `json:"type_id"`
	APIName    string         `json:"api_name,omitempty"`
	PrimaryKey string         `json:"primary_key,omitempty"`
	Fields     []MappingField `json:"fields"`
}

// MappingRegistrar is the optional interface a SearchBackend can
// implement to accept per-type schema deployment. The indexer's
// `schemasync` consumer feature-detects this on the configured
// backend and skips registration (with a debug log) when absent —
// the streaming projection loop keeps working with the generic
// JSONB document shape.
type MappingRegistrar interface {
	// RegisterTypeMapping creates or updates the mapping for the
	// given (tenant, type) pair. Implementations are expected to be
	// idempotent — the indexer replays the latest envelope after
	// restart.
	RegisterTypeMapping(ctx context.Context, m TypeMapping) error
	// DropTypeMapping removes the mapping for the given type. The
	// indexer calls this on `event_type=deleted` envelopes. A miss
	// is not an error.
	DropTypeMapping(ctx context.Context, tenant repos.TenantId, typeID repos.TypeId) error
}
