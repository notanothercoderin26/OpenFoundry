// Package markings holds the wire-shape types for iceberg markings.
//
// Mirrors services/iceberg-catalog-service/src/domain/markings.rs:
//
//   - `iceberg_namespace_markings` records explicit markings on a
//     namespace.
//   - `iceberg_table_markings` keeps a per-table split between
//     `inherited` (snapshotted from the namespace at table creation)
//     and `explicit` (operator-managed).
//   - `iceberg_marking_names` maps marking_id → human name.
//
// Effective markings = union(inherited, explicit), ordered by name.
package markings

import (
	"github.com/google/uuid"
)

// MarkingProjection is one entry from the marking-name catalog,
// returned alongside namespace + table markings responses.
type MarkingProjection struct {
	MarkingID   uuid.UUID `json:"marking_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
}

// NamespaceMarkings is the GET response for namespace-scoped markings.
// `effective` and `explicit` are identical today (namespaces don't
// inherit), but the dual surface mirrors the Rust shape so future
// sub-namespace inheritance lands without breaking clients.
type NamespaceMarkings struct {
	Effective []MarkingProjection `json:"effective"`
	Explicit  []MarkingProjection `json:"explicit"`
}

// TableMarkings is the GET response for table-scoped markings.
// `effective = explicit ∪ inherited_from_namespace`, ordered by name.
type TableMarkings struct {
	Effective              []MarkingProjection `json:"effective"`
	Explicit               []MarkingProjection `json:"explicit"`
	InheritedFromNamespace []MarkingProjection `json:"inherited_from_namespace"`
}

// Names returns the marking-name slice from a list of projections, in
// projection order.
func Names(items []MarkingProjection) []string {
	out := make([]string, 0, len(items))
	for _, p := range items {
		out = append(out, p.Name)
	}
	return out
}
