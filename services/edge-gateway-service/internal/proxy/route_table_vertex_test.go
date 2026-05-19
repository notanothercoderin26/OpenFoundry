package proxy_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/openfoundry/openfoundry-go/services/edge-gateway-service/internal/config"
	"github.com/openfoundry/openfoundry-go/services/edge-gateway-service/internal/proxy"
)

// TestSelectUpstreamVertex covers the Vertex routing rules: graph CRUD
// and saved Search Around resources go to vertex-service; traversal
// primitives stay on ontology-query-service.
func TestSelectUpstreamVertex(t *testing.T) {
	t.Parallel()
	u := config.UpstreamURLs{
		Vertex:        "vertex",
		OntologyQuery: "ontology-query",
	}

	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "graph CRUD", path: "/api/v1/vertex/graphs", want: u.Vertex},
		{name: "graph by id", path: "/api/v1/vertex/graphs/00000000-0000-0000-0000-000000000001", want: u.Vertex},
		{name: "graph fork", path: "/api/v1/vertex/graphs/00000000-0000-0000-0000-000000000001/fork", want: u.Vertex},
		{name: "graph versions", path: "/api/v1/vertex/graphs/00000000-0000-0000-0000-000000000001/versions", want: u.Vertex},
		{name: "annotations", path: "/api/v1/vertex/graphs/00000000-0000-0000-0000-000000000001/annotations", want: u.Vertex},
		{name: "scenarios", path: "/api/v1/vertex/graphs/00000000-0000-0000-0000-000000000001/scenarios", want: u.Vertex},
		{name: "search around resources", path: "/api/v1/vertex/search-arounds", want: u.Vertex},
		{name: "derived property bindings", path: "/api/v1/vertex/derived-property-bindings", want: u.Vertex},

		// Traversal stays on ontology-query.
		{name: "link-summary", path: "/api/v1/ontology/objects/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/link-summary", want: u.OntologyQuery},
		{name: "traverse", path: "/api/v1/ontology/traverse", want: u.OntologyQuery},
		{name: "histogram", path: "/api/v1/ontology/histogram", want: u.OntologyQuery},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.want, proxy.SelectUpstream(tt.path, u))
		})
	}
}
