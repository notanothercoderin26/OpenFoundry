package planner_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	pipelineplan "github.com/openfoundry/openfoundry-go/libs/pipeline-plan"
	"github.com/openfoundry/openfoundry-go/services/pipeline-build-service/internal/planner"
)

func ref(table string) planner.IcebergRef {
	return planner.IcebergRef{Catalog: "lakekeeper", Namespace: "default", Table: table}
}

func validBase() planner.NodeConfig {
	return planner.NodeConfig{
		Source: ptr(ref("online_retail_raw")),
		Target: ref("transactions_clean"),
	}
}

func ptr[T any](v T) *T { return &v }

func TestComposePlan_passthroughReadWrite(t *testing.T) {
	t.Parallel()
	plan, err := planner.ComposePlan(validBase(), "p1", "r1")
	require.NoError(t, err)
	require.Equal(t, "p1", plan.PipelineID)
	require.Equal(t, "r1", plan.RunID)
	require.Len(t, plan.Ops, 2)
	require.Equal(t, pipelineplan.KindReadTable, plan.Ops[0].Kind)
	require.Equal(t, pipelineplan.KindWriteTable, plan.Ops[1].Kind)
	require.Equal(t, "transactions_clean", plan.Ops[1].WriteTable.Table)
	require.Equal(t, pipelineplan.WriteModeCreateOrReplace, plan.Ops[1].WriteTable.Mode, "default mode is create_or_replace")
	require.Nil(t, plan.Validate())
}

func TestComposePlan_filter(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.Filter = &pipelineplan.Filter{Expr: "quantity > 0"}
	plan, err := planner.ComposePlan(cfg, "p", "r")
	require.NoError(t, err)
	require.Len(t, plan.Ops, 3)
	require.Equal(t, pipelineplan.KindFilter, plan.Ops[1].Kind)
	require.Equal(t, "quantity > 0", plan.Ops[1].Filter.Expr)
	require.Equal(t, []string{"src"}, plan.Ops[1].Inputs)
}

func TestComposePlan_aggregate(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.Aggregate = &pipelineplan.Aggregate{
		GroupBy: []string{"customer_id"},
		Aggregations: []pipelineplan.AggregationFunc{
			{Function: "sum", SourceColumn: "revenue", TargetColumn: "total"},
		},
	}
	plan, err := planner.ComposePlan(cfg, "p", "r")
	require.NoError(t, err)
	require.Equal(t, pipelineplan.KindAggregate, plan.Ops[1].Kind)
	require.Equal(t, []string{"customer_id"}, plan.Ops[1].Aggregate.GroupBy)
}

func TestComposePlan_stack_chainsOperators(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.Stack = []planner.StackStep{
		{Filter: &pipelineplan.Filter{Expr: "quantity > 0"}},
		{Rename: &pipelineplan.Rename{Mapping: []pipelineplan.ColumnPair{{From: "invoice", To: "invoice_no"}}}},
		{Project: &pipelineplan.Project{Columns: []pipelineplan.ProjectColumn{{Name: "invoice_no"}, {Name: "quantity"}}}},
	}
	plan, err := planner.ComposePlan(cfg, "p", "r")
	require.NoError(t, err)
	require.Len(t, plan.Ops, 5)
	require.Equal(t, pipelineplan.KindReadTable, plan.Ops[0].Kind)
	require.Equal(t, pipelineplan.KindFilter, plan.Ops[1].Kind)
	require.Equal(t, []string{"src"}, plan.Ops[1].Inputs)
	require.Equal(t, pipelineplan.KindRename, plan.Ops[2].Kind)
	require.Equal(t, []string{plan.Ops[1].ID}, plan.Ops[2].Inputs)
	require.Equal(t, pipelineplan.KindProject, plan.Ops[3].Kind)
	require.Equal(t, []string{plan.Ops[2].ID}, plan.Ops[3].Inputs)
	require.Equal(t, pipelineplan.KindWriteTable, plan.Ops[4].Kind)
	require.Equal(t, []string{plan.Ops[3].ID}, plan.Ops[4].Inputs)
}

func TestComposePlan_unionTwoSources(t *testing.T) {
	t.Parallel()
	cfg := planner.NodeConfig{
		Sources: []planner.IcebergRef{ref("a"), ref("b")},
		Target:  ref("t_ab"),
		Union:   &planner.UnionConfig{},
	}
	plan, err := planner.ComposePlan(cfg, "p", "r")
	require.NoError(t, err)
	require.Len(t, plan.Ops, 4)
	require.Equal(t, pipelineplan.KindUnion, plan.Ops[2].Kind)
	require.Equal(t, []string{"src_0", "src_1"}, plan.Ops[2].Inputs)
}

func TestComposePlan_freeFormSQLRejected(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.SQL = "SELECT * FROM t"
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.ErrorIs(t, err, planner.ErrFreeFormSQLNotPortable)
}

func TestComposePlan_statementSQLRejected(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.Statement = "CREATE TEMPORARY VIEW v AS SELECT 1"
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.ErrorIs(t, err, planner.ErrFreeFormSQLNotPortable)
}

func TestComposePlan_mixedSingleOpsRejected(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.Filter = &pipelineplan.Filter{Expr: "x > 0"}
	cfg.Project = &pipelineplan.Project{Columns: []pipelineplan.ProjectColumn{{Name: "x"}}}
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.ErrorIs(t, err, planner.ErrMixedOperatorConfig)
}

func TestComposePlan_stackPlusSingleOpRejected(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.Filter = &pipelineplan.Filter{Expr: "x > 0"}
	cfg.Stack = []planner.StackStep{{Limit: &pipelineplan.Limit{N: 10}}}
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.ErrorIs(t, err, planner.ErrMixedOperatorConfig)
}

func TestComposePlan_missingTarget(t *testing.T) {
	t.Parallel()
	cfg := planner.NodeConfig{Source: ptr(ref("a"))}
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.Error(t, err)
	require.Contains(t, err.Error(), "target")
}

func TestComposePlan_unknownTargetMode(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.TargetMode = "merge"
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.Error(t, err)
	require.Contains(t, err.Error(), `unknown target_mode "merge"`)
}

func TestComposePlan_unionWithFewerThanTwoSources(t *testing.T) {
	t.Parallel()
	cfg := planner.NodeConfig{
		Sources: []planner.IcebergRef{ref("only")},
		Target:  ref("t"),
		Union:   &planner.UnionConfig{},
	}
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.Error(t, err)
	require.Contains(t, err.Error(), "at least two sources")
}

func TestComposePlan_unionWithSourceSet(t *testing.T) {
	t.Parallel()
	cfg := planner.NodeConfig{
		Source:  ptr(ref("solo")),
		Sources: []planner.IcebergRef{ref("a"), ref("b")},
		Target:  ref("t"),
		Union:   &planner.UnionConfig{},
	}
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.Error(t, err)
	require.Contains(t, err.Error(), "must not set `source`")
}

func TestComposePlan_singleSourceWithSourcesList(t *testing.T) {
	t.Parallel()
	cfg := planner.NodeConfig{
		Sources: []planner.IcebergRef{ref("a")},
		Target:  ref("t"),
	}
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.Error(t, err)
	require.Contains(t, err.Error(), "must not set `sources`")
}

func TestComposePlan_appendMode(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.TargetMode = pipelineplan.WriteModeAppend
	plan, err := planner.ComposePlan(cfg, "p", "r")
	require.NoError(t, err)
	require.Equal(t, pipelineplan.WriteModeAppend, plan.Ops[1].WriteTable.Mode)
}

func TestComposeFromNodeConfig_jsonRoundTrip(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.Aggregate = &pipelineplan.Aggregate{
		GroupBy: []string{"customer_id"},
		Aggregations: []pipelineplan.AggregationFunc{
			{Function: "count", TargetColumn: "n"},
		},
	}
	payload, err := json.Marshal(cfg)
	require.NoError(t, err)

	plan, err := planner.ComposeFromNodeConfig(payload, "online-retail-cust", "run-001")
	require.NoError(t, err)
	require.Equal(t, "online-retail-cust", plan.PipelineID)
	require.Equal(t, "run-001", plan.RunID)
	require.Equal(t, pipelineplan.KindAggregate, plan.Ops[1].Kind)
	require.Equal(t, "count", plan.Ops[1].Aggregate.Aggregations[0].Function)
}

func TestComposeFromNodeConfig_emptyPayload(t *testing.T) {
	t.Parallel()
	_, err := planner.ComposeFromNodeConfig(nil, "p", "r")
	require.Error(t, err)
	require.Contains(t, err.Error(), "empty node config")
}

func TestComposeFromNodeConfig_invalidJSON(t *testing.T) {
	t.Parallel()
	_, err := planner.ComposeFromNodeConfig([]byte("{not json"), "p", "r")
	require.Error(t, err)
	require.Contains(t, err.Error(), "parse node config")
}

func TestComposeFromNodeConfig_legacySQLShape(t *testing.T) {
	t.Parallel()
	// Mimics a pre-C.4 distributed node config that the SparkApplication
	// dispatcher would have accepted.
	payload := []byte(`{"sql":"SELECT * FROM trails","engine":"spark"}`)
	_, err := planner.ComposeFromNodeConfig(payload, "p", "r")
	require.ErrorIs(t, err, planner.ErrFreeFormSQLNotPortable)
}

func TestComposePlan_stackStepWithMultipleOps(t *testing.T) {
	t.Parallel()
	cfg := validBase()
	cfg.Stack = []planner.StackStep{
		{
			Filter:  &pipelineplan.Filter{Expr: "x > 0"},
			Project: &pipelineplan.Project{Columns: []pipelineplan.ProjectColumn{{Name: "x"}}},
		},
	}
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.Error(t, err)
	require.Contains(t, err.Error(), "stack step 0")
}

func TestComposePlan_composedPlanValidatesAgainstUpstreamSchema(t *testing.T) {
	t.Parallel()
	// Sanity-check: every composer output must pass pipelineplan.Validate().
	// This guards against the composer drifting from the schema.
	cfgs := []planner.NodeConfig{
		validBase(),
		mustWithFilter(validBase(), "qty > 0"),
		mustWithAggregate(validBase()),
		mustWithStack(validBase()),
	}
	for i, cfg := range cfgs {
		plan, err := planner.ComposePlan(cfg, "p", "r")
		require.NoError(t, err, "config %d", i)
		errs := plan.Validate()
		require.Nil(t, errs, "config %d plan failed Validate: %v", i, errs)
	}
}

func mustWithFilter(c planner.NodeConfig, expr string) planner.NodeConfig {
	c.Filter = &pipelineplan.Filter{Expr: expr}
	return c
}
func mustWithAggregate(c planner.NodeConfig) planner.NodeConfig {
	c.Aggregate = &pipelineplan.Aggregate{
		Aggregations: []pipelineplan.AggregationFunc{
			{Function: "count", TargetColumn: "n"},
		},
	}
	return c
}
func mustWithStack(c planner.NodeConfig) planner.NodeConfig {
	c.Stack = []planner.StackStep{
		{Filter: &pipelineplan.Filter{Expr: "x > 0"}},
		{Limit: &pipelineplan.Limit{N: 100}},
	}
	return c
}

// Stick a non-trivial use of `errors.Is` so the package contract is
// honoured: callers checking for legacy-SQL must use `errors.Is`.
func TestErrFreeFormSQLNotPortable_isExportedSentinel(t *testing.T) {
	t.Parallel()
	cfg := planner.NodeConfig{Source: ptr(ref("a")), Target: ref("b"), SQL: "x"}
	_, err := planner.ComposePlan(cfg, "p", "r")
	require.True(t, errors.Is(err, planner.ErrFreeFormSQLNotPortable))
	require.True(t, strings.Contains(err.Error(), "free-form SQL"))
}
