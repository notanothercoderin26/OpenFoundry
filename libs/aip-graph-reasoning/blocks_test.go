package aipgraphreasoning_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	aip "github.com/openfoundry/openfoundry-go/libs/aip-graph-reasoning"
)

func TestAllReturnsThreeBlocks(t *testing.T) {
	t.Parallel()
	specs := aip.All()
	assert.Equal(t, 3, len(specs))
}

func TestKindsAreUnique(t *testing.T) {
	t.Parallel()
	seen := make(map[string]struct{})
	for _, s := range aip.All() {
		if _, dup := seen[s.Kind]; dup {
			t.Fatalf("duplicate block kind %q", s.Kind)
		}
		seen[s.Kind] = struct{}{}
	}
}

func TestIsGraphReasoningKind(t *testing.T) {
	t.Parallel()
	assert.True(t, aip.IsGraphReasoningKind(aip.KindNeighborExpansion))
	assert.True(t, aip.IsGraphReasoningKind(aip.KindPathFinding))
	assert.True(t, aip.IsGraphReasoningKind(aip.KindCentrality))
	assert.False(t, aip.IsGraphReasoningKind("use_llm"))
	assert.False(t, aip.IsGraphReasoningKind("loop"))
	assert.False(t, aip.IsGraphReasoningKind(""))
}

func TestEveryBlockHasRouteAndSchemas(t *testing.T) {
	t.Parallel()
	for _, s := range aip.All() {
		assert.NotEmpty(t, s.HTTPRoute, "kind=%s missing route", s.Kind)
		assert.NotEmpty(t, s.InputSchema, "kind=%s missing input schema", s.Kind)
		assert.NotEmpty(t, s.OutputSchema, "kind=%s missing output schema", s.Kind)
		assert.NotEmpty(t, s.DisplayName, "kind=%s missing display name", s.Kind)
	}
}
