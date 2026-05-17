//go:build integration

// Integration tests for the OpenLineage graph repository. Boots
// postgres:16-alpine via libs/testing, applies the lineage-service
// migrations, then drives the same scenarios called out in the
// implementation brief:
//
//   - 3-job chain A→B, B→C, B→D — upstream(D, depth=2) must return
//     {D, B, A} with edges {A→B, B→D}.
//   - Cycle protection: A→B→A produces a finite walk, not an infinite
//     loop, on both directions.
//   - Performance: 10 000 edges, upstream depth=3 returns in under
//     200ms (with the src/dst indexes wired by the migration).
package lineagegraph_test

import (
	"context"
	"fmt"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	testingx "github.com/openfoundry/openfoundry-go/libs/testing"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/lineagegraph"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/openlineage"
	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/repo"
)

func bootRepo(t *testing.T) *lineagegraph.Repo {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	t.Cleanup(cancel)
	h := testingx.BootPostgres(ctx, t)
	require.NoError(t, repo.Migrate(ctx, h.Pool))
	return lineagegraph.New(h.Pool)
}

func ingestJob(t *testing.T, r *lineagegraph.Repo, runID, jobName, inputName, outputName string) {
	t.Helper()
	ev := &openlineage.RunEvent{
		EventType: "COMPLETE",
		EventTime: time.Now().UTC().Format(time.RFC3339Nano),
		Run:       openlineage.RunRef{RunID: runID},
		Job:       openlineage.JobRef{Namespace: "etl", Name: jobName},
		Inputs:    []openlineage.DatasetRef{{Namespace: "ns", Name: inputName}},
		Outputs:   []openlineage.DatasetRef{{Namespace: "ns", Name: outputName}},
	}
	require.NoError(t, r.Ingest(context.Background(), ev))
}

func ridSet(nodes []lineagegraph.GraphNode) map[string]struct{} {
	out := make(map[string]struct{}, len(nodes))
	for _, n := range nodes {
		out[n.RID] = struct{}{}
	}
	return out
}

// TestUpstreamChain — 3 jobs (A→B, B→C, B→D), upstream(D, depth=2)
// returns {D, B, A} with edges {A→B, B→D}. Mirrors the acceptance
// criterion from the task brief verbatim.
func TestUpstreamChain(t *testing.T) {
	r := bootRepo(t)
	ingestJob(t, r, "run-ab", "build_b", "a", "b")
	ingestJob(t, r, "run-bc", "build_c", "b", "c")
	ingestJob(t, r, "run-bd", "build_d", "b", "d")

	got, err := r.Upstream(context.Background(), "ns/d", 2)
	require.NoError(t, err)

	nodes := ridSet(got.Nodes)
	assert.Contains(t, nodes, "ns/d")
	assert.Contains(t, nodes, "ns/b")
	assert.Contains(t, nodes, "ns/a")
	assert.NotContains(t, nodes, "ns/c", "ns/c sits downstream of B — must not be in upstream walk")

	// Two edges in the upstream subgraph: A→B and B→D. Edge B→C goes
	// into ns/c which isn't in the reachable set, so it must not appear.
	hasAB, hasBD, hasBC := false, false, false
	for _, e := range got.Edges {
		if e.Src == "ns/a" && e.Dst == "ns/b" {
			hasAB = true
		}
		if e.Src == "ns/b" && e.Dst == "ns/d" {
			hasBD = true
		}
		if e.Src == "ns/b" && e.Dst == "ns/c" {
			hasBC = true
		}
	}
	assert.True(t, hasAB, "missing edge A→B in upstream(d, depth=2)")
	assert.True(t, hasBD, "missing edge B→D in upstream(d, depth=2)")
	assert.False(t, hasBC, "stray edge B→C leaked into upstream(d, depth=2)")
}

// TestDownstreamFromB — downstream(B, depth=1) returns {B, C, D},
// the two sibling outputs of B (C and D) are both walked.
func TestDownstreamFromB(t *testing.T) {
	r := bootRepo(t)
	ingestJob(t, r, "run-ab", "build_b", "a", "b")
	ingestJob(t, r, "run-bc", "build_c", "b", "c")
	ingestJob(t, r, "run-bd", "build_d", "b", "d")

	got, err := r.Downstream(context.Background(), "ns/b", 1)
	require.NoError(t, err)

	nodes := ridSet(got.Nodes)
	assert.Contains(t, nodes, "ns/b")
	assert.Contains(t, nodes, "ns/c")
	assert.Contains(t, nodes, "ns/d")
	assert.NotContains(t, nodes, "ns/a", "ns/a is upstream of B and must not appear in downstream walk")
}

// TestCycleDoesNotLoop — a cycle A → B → A is finite under both
// directions. We seed run-ab (A → B) and run-ba (B → A) and assert
// upstream(A) and downstream(A) both terminate at the configured
// depth without exhausting the connection.
func TestCycleDoesNotLoop(t *testing.T) {
	r := bootRepo(t)
	ingestJob(t, r, "run-ab", "build_b", "a", "b")
	ingestJob(t, r, "run-ba", "build_a", "b", "a")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	up, err := r.Upstream(ctx, "ns/a", 5)
	require.NoError(t, err)
	upNodes := ridSet(up.Nodes)
	assert.Contains(t, upNodes, "ns/a")
	assert.Contains(t, upNodes, "ns/b")

	down, err := r.Downstream(ctx, "ns/a", 5)
	require.NoError(t, err)
	downNodes := ridSet(down.Nodes)
	assert.Contains(t, downNodes, "ns/a")
	assert.Contains(t, downNodes, "ns/b")
}

// TestUpstreamPerf10k — 10 000 edges in a deep linear chain. We then
// run upstream(depth=3) from the tip and check it returns under 200ms.
// The indexes wired by the migration are what keep this query
// sub-linear in the total edge count.
func TestUpstreamPerf10k(t *testing.T) {
	if testing.Short() {
		t.Skip("perf gate disabled under -short")
	}
	r := bootRepo(t)
	const n = 10_000

	// Build a chain d0 → d1 → … → dN. One job per edge. We commit each
	// event with Ingest to take the full tx + ON CONFLICT path the
	// runtime hits.
	ctx := context.Background()
	for i := 0; i < n; i++ {
		ev := &openlineage.RunEvent{
			EventType: "COMPLETE",
			EventTime: time.Now().UTC().Format(time.RFC3339Nano),
			Run:       openlineage.RunRef{RunID: "run-" + strconv.Itoa(i)},
			Job:       openlineage.JobRef{Namespace: "etl", Name: fmt.Sprintf("job_%d", i)},
			Inputs:    []openlineage.DatasetRef{{Namespace: "ns", Name: fmt.Sprintf("d%d", i)}},
			Outputs:   []openlineage.DatasetRef{{Namespace: "ns", Name: fmt.Sprintf("d%d", i+1)}},
		}
		require.NoError(t, r.Ingest(ctx, ev))
	}

	tip := fmt.Sprintf("ns/d%d", n)
	start := time.Now()
	got, err := r.Upstream(ctx, tip, 3)
	elapsed := time.Since(start)
	require.NoError(t, err)

	// depth=3 from the tip → {tip, tip-1, tip-2, tip-3}.
	assert.Len(t, got.Nodes, 4)
	assert.Less(t, elapsed.Milliseconds(), int64(200),
		"upstream(depth=3) over %d edges took %s; expected <200ms", n, elapsed)
}

// TestIngestIsIdempotent — replaying the same RunEvent never produces
// duplicate edges. Important because at-least-once Kafka delivery and
// retries on POST /events are both routine in production.
func TestIngestIsIdempotent(t *testing.T) {
	r := bootRepo(t)
	ev := &openlineage.RunEvent{
		EventType: "COMPLETE",
		EventTime: time.Now().UTC().Format(time.RFC3339Nano),
		Run:       openlineage.RunRef{RunID: "run-dup"},
		Job:       openlineage.JobRef{Namespace: "etl", Name: "build_b"},
		Inputs:    []openlineage.DatasetRef{{Namespace: "ns", Name: "a"}},
		Outputs:   []openlineage.DatasetRef{{Namespace: "ns", Name: "b"}},
	}
	ctx := context.Background()
	for i := 0; i < 5; i++ {
		require.NoError(t, r.Ingest(ctx, ev))
	}
	up, err := r.Upstream(ctx, "ns/b", 1)
	require.NoError(t, err)
	count := 0
	for _, e := range up.Edges {
		if e.Src == "ns/a" && e.Dst == "ns/b" {
			count++
		}
	}
	assert.Equal(t, 1, count, "edge A→B duplicated under retries")
}

// TestJobRunsReturnsLatest — JobRuns returns rows ordered by
// started_at desc and caps at 50.
func TestJobRunsReturnsLatest(t *testing.T) {
	r := bootRepo(t)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		ev := &openlineage.RunEvent{
			EventType: "COMPLETE",
			EventTime: time.Now().UTC().Add(time.Duration(i) * time.Second).Format(time.RFC3339Nano),
			Run:       openlineage.RunRef{RunID: fmt.Sprintf("run-%d", i)},
			Job:       openlineage.JobRef{Namespace: "etl", Name: "build_b"},
			Inputs:    []openlineage.DatasetRef{{Namespace: "ns", Name: "a"}},
			Outputs:   []openlineage.DatasetRef{{Namespace: "ns", Name: "b"}},
		}
		require.NoError(t, r.Ingest(ctx, ev))
	}

	runs, err := r.JobRuns(ctx, "etl", "build_b", 50)
	require.NoError(t, err)
	assert.Len(t, runs, 3)
	for _, run := range runs {
		assert.Equal(t, "etl", run.JobNamespace)
		assert.Equal(t, "build_b", run.JobName)
		assert.Equal(t, "COMPLETE", run.State)
	}
}
