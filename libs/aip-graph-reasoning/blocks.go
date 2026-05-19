// Package aipgraphreasoning declares the AIP Logic block kinds that
// expose Vertex's graph-reasoning primitives to Agents.
//
// AIP Logic stores agent logic definitions as a JSON document with a
// "blocks" array where each entry carries a `kind` string. There is
// no central registry of kinds in this repo — the agent runtime
// dispatches by kind string at execution time. This package
// publishes the kinds Vertex contributes plus the input/output
// schemas the agent runtime will validate against.
//
// Three kinds are exposed:
//
//   graph_neighbor_expansion — single-hop expand from a starting
//     object set with optional property filters. Wire equivalent of
//     POST /api/v1/ontology/traverse with a one-step DSL.
//
//   graph_path_finding — shortest/k-shortest paths between two object
//     refs. Wire equivalent of (future) /api/v1/ontology/find-paths.
//
//   graph_centrality — degree, betweenness, eigenvector centrality
//     over a caller-provided subgraph. Wire equivalent of (future)
//     /api/v1/ontology/centrality.
//
// Agent permissions flow naturally because every dispatch goes
// through the same authmw chain as the HTTP routes — the agent
// cannot bypass restricted views (VTX.23, VTX.24, VTX.25).
package aipgraphreasoning

// Block kinds that an AIP Logic definition can reference under
// "blocks[].kind" to invoke Vertex graph reasoning.
const (
	KindNeighborExpansion = "graph_neighbor_expansion"
	KindPathFinding       = "graph_path_finding"
	KindCentrality        = "graph_centrality"
)

// BlockSpec describes one graph-reasoning block: its kind, a short
// human-readable description, the JSON-schema-like input shape, and
// the JSON-schema-like output shape. Agent runtimes can consume this
// to render parameter prompts and validate inputs before dispatch.
type BlockSpec struct {
	Kind         string
	DisplayName  string
	Description  string
	InputSchema  string // JSON-encoded schema for the block input.
	OutputSchema string // JSON-encoded schema for the block output.
	// HTTPRoute is the ontology-query-service endpoint the runtime
	// will call. The runtime is expected to attach the caller's JWT
	// + tenant context; the endpoint enforces permissions and
	// marking visibility.
	HTTPRoute string
}

// All returns every graph-reasoning block registered by Vertex. The
// agent runtime imports this slice and merges it into its tool
// catalog at startup.
func All() []BlockSpec {
	return []BlockSpec{
		{
			Kind:        KindNeighborExpansion,
			DisplayName: "Expand graph neighbors",
			Description: "Return objects connected to a starting set via a typed link, " +
				"optionally filtered by target properties.",
			InputSchema: `{
				"starting_set": "[]ObjectRef",
				"relation_id": "uuid",
				"direction":   "outgoing|incoming",
				"filters":     "[]SearchAroundFilter",
				"branch_context": "string"
			}`,
			OutputSchema: `{
				"groups": "[]ResultGroup",
				"cost":   "Cost"
			}`,
			HTTPRoute: "POST /api/v1/ontology/traverse",
		},
		{
			Kind:        KindPathFinding,
			DisplayName: "Find graph paths",
			Description: "Shortest or k-shortest paths between two object refs " +
				"over the live ontology graph.",
			InputSchema: `{
				"start":    "ObjectRef",
				"end":      "ObjectRef",
				"k":        "int (1 = shortest only)",
				"max_hops": "int",
				"branch_context": "string"
			}`,
			OutputSchema: `{
				"paths": "[]Path"
			}`,
			HTTPRoute: "POST /api/v1/ontology/find-paths",
		},
		{
			Kind:        KindCentrality,
			DisplayName: "Compute graph centrality",
			Description: "Compute degree / betweenness / eigenvector centrality " +
				"over a caller-provided subgraph.",
			InputSchema: `{
				"object_refs": "[]ObjectRef",
				"measures":    "[]string (degree|betweenness|eigenvector)",
				"branch_context": "string"
			}`,
			OutputSchema: `{
				"scores": "[]CentralityScore"
			}`,
			HTTPRoute: "POST /api/v1/ontology/centrality",
		},
	}
}

// IsGraphReasoningKind reports whether `kind` is one of the kinds
// this package owns. The agent runtime can use this to decide
// whether to dispatch to ontology-query-service.
func IsGraphReasoningKind(kind string) bool {
	switch kind {
	case KindNeighborExpansion, KindPathFinding, KindCentrality:
		return true
	}
	return false
}
