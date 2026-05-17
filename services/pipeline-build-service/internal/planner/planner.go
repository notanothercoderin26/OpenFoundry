// Package planner composes a [pipelineplan.Plan] from the JSON
// payload of a single DAG node in pipeline-build-service. ADR-0045
// Phase C.4.b — closes the gap left by Phase C.4.a, which moved the
// dispatcher to a Job + Plan contract but stubbed the composer with
// ErrPlanCompositionNotImplemented.
//
// Inputs: the raw `node.Config` JSON the authoring service stores in
// `pipeline_authoring.published_dag`, plus pipelineID + runID for
// scoping. The composer parses the JSON into a structured
// representation (filter / project / rename / cast / aggregate /
// limit / union / stack) and emits a typed plan of the shape:
//
//	read_table(source)              ← one source op (or N source ops for union)
//	   ↓
//	[transform ops in stack order]  ← zero or more operator ops
//	   ↓
//	write_table(target)             ← exactly one terminal op
//
// Legacy SQL-shaped configs (the `sql` / `statement` fields the
// pre-C.4 distributed runtime accepted) return ErrFreeFormSQLNotPortable.
// Re-authoring those nodes into structured operator configs is the
// Phase 0 inventory gate documented at
// `docs/migration/pipeline-runner-spark-to-go-inventory.md`.
package planner

import (
	"encoding/json"
	"errors"
	"fmt"

	pipelineplan "github.com/openfoundry/openfoundry-go/libs/pipeline-plan"
)

// NodeConfig is the structured shape every DAG node must use to be
// composable into a Plan. JSON-unmarshalled from the node config blob.
type NodeConfig struct {
	// Source — the upstream Iceberg table this node reads from. For
	// single-input nodes, exactly Source is required. For union
	// nodes, Sources is used and Source must be empty.
	Source  *IcebergRef  `json:"source,omitempty"`
	Sources []IcebergRef `json:"sources,omitempty"`

	// Target — the Iceberg table this node writes to. Required.
	Target     IcebergRef             `json:"target"`
	TargetMode pipelineplan.WriteMode `json:"target_mode,omitempty"`

	// Single-op fields. Exactly one of these is populated for
	// single-op nodes. Multiple → ErrMixedOperatorConfig.
	Filter    *pipelineplan.Filter    `json:"filter,omitempty"`
	Project   *pipelineplan.Project   `json:"project,omitempty"`
	Rename    *pipelineplan.Rename    `json:"rename,omitempty"`
	Cast      *pipelineplan.Cast      `json:"cast,omitempty"`
	Aggregate *pipelineplan.Aggregate `json:"aggregate,omitempty"`
	Limit     *pipelineplan.Limit     `json:"limit,omitempty"`
	Union     *UnionConfig            `json:"union,omitempty"`

	// Stack — multi-op chain. Mutually exclusive with the single-op
	// fields above.
	Stack []StackStep `json:"stack,omitempty"`

	// Legacy fields — if any is non-empty the composer returns
	// ErrFreeFormSQLNotPortable.
	SQL       string `json:"sql,omitempty"`
	Statement string `json:"statement,omitempty"`
}

// IcebergRef identifies one Iceberg table.
type IcebergRef struct {
	Catalog   string `json:"catalog"`
	Namespace string `json:"namespace"`
	Table     string `json:"table"`
}

// IsZero reports whether the ref carries no information.
func (r IcebergRef) IsZero() bool {
	return r.Catalog == "" && r.Namespace == "" && r.Table == ""
}

// UnionConfig is a marker — the actual upstream tables come from
// NodeConfig.Sources. Kept as a struct so the field can stay nil when
// unused (so json `omitempty` works) and gains options later without
// breaking the wire shape.
type UnionConfig struct{}

// StackStep is one operator in a multi-op stack. Exactly one
// operator field is populated per step.
type StackStep struct {
	Filter    *pipelineplan.Filter    `json:"filter,omitempty"`
	Project   *pipelineplan.Project   `json:"project,omitempty"`
	Rename    *pipelineplan.Rename    `json:"rename,omitempty"`
	Cast      *pipelineplan.Cast      `json:"cast,omitempty"`
	Aggregate *pipelineplan.Aggregate `json:"aggregate,omitempty"`
	Limit     *pipelineplan.Limit     `json:"limit,omitempty"`
}

// ErrFreeFormSQLNotPortable is returned when a node config carries
// `sql` or `statement` strings. The pre-C.4 distributed runtime
// accepted free-form SQL; the operator vocabulary does not. Re-author
// the node as a structured operator config — see the Phase 0
// inventory doc named in the error message.
var ErrFreeFormSQLNotPortable = errors.New("DAG node config carries free-form SQL/Statement which is not portable to the operator vocabulary (re-author as a structured operator config — see docs/migration/pipeline-runner-spark-to-go-inventory.md)")

// ErrNoOperatorConfig is returned when a node config supplies neither
// a single-op field nor a stack — meaning the dispatcher cannot tell
// what transformation to apply. A node that wants to copy source to
// target unmodified should set an empty Project (with all columns) or
// no operator at all (the composer emits read → write directly).
var ErrNoOperatorConfig = errors.New("DAG node config carries no operator configuration; populate exactly one of filter/project/rename/cast/aggregate/limit/union or use the `stack` field")

// ErrMixedOperatorConfig is returned when more than one single-op
// field is populated or when a single-op field and `stack` are both
// populated.
var ErrMixedOperatorConfig = errors.New("DAG node config carries multiple top-level operator fields — use the `stack` field to chain operators")

// ComposeFromNodeConfig is the public entry point. payload is the
// raw JSON of the DAG node's `config` blob. pipelineID and runID are
// stamped on the returned Plan for log scoping and run correlation.
func ComposeFromNodeConfig(payload []byte, pipelineID, runID string) (pipelineplan.Plan, error) {
	if len(payload) == 0 {
		return pipelineplan.Plan{}, errors.New("planner: empty node config payload")
	}
	var cfg NodeConfig
	if err := json.Unmarshal(payload, &cfg); err != nil {
		return pipelineplan.Plan{}, fmt.Errorf("planner: parse node config: %w", err)
	}
	return ComposePlan(cfg, pipelineID, runID)
}

// ComposePlan is the same as [ComposeFromNodeConfig] but takes the
// already-parsed config. Useful when the caller has the structured
// form already in hand (e.g. tests).
func ComposePlan(cfg NodeConfig, pipelineID, runID string) (pipelineplan.Plan, error) {
	if cfg.SQL != "" || cfg.Statement != "" {
		return pipelineplan.Plan{}, ErrFreeFormSQLNotPortable
	}
	if cfg.Target.IsZero() {
		return pipelineplan.Plan{}, errors.New("planner: target Iceberg ref is required")
	}
	mode := cfg.TargetMode
	if mode == "" {
		mode = pipelineplan.WriteModeCreateOrReplace
	}
	if !pipelineplan.IsWriteMode(mode) {
		return pipelineplan.Plan{}, fmt.Errorf("planner: unknown target_mode %q", mode)
	}

	plan := pipelineplan.Plan{PipelineID: pipelineID, RunID: runID}

	if cfg.Union != nil {
		return composeUnion(cfg, mode, plan)
	}
	return composeSingleSource(cfg, mode, plan)
}

func composeUnion(cfg NodeConfig, mode pipelineplan.WriteMode, plan pipelineplan.Plan) (pipelineplan.Plan, error) {
	if cfg.Source != nil && !cfg.Source.IsZero() {
		return pipelineplan.Plan{}, errors.New("planner: union node must not set `source`; use `sources`")
	}
	if len(cfg.Sources) < 2 {
		return pipelineplan.Plan{}, fmt.Errorf("planner: union requires at least two sources, got %d", len(cfg.Sources))
	}
	if hasSingleOp(cfg) || len(cfg.Stack) > 0 {
		return pipelineplan.Plan{}, errors.New("planner: union node cannot also declare transform operators in v1; chain them in a downstream node")
	}

	sourceIDs := make([]string, 0, len(cfg.Sources))
	for i, src := range cfg.Sources {
		if src.IsZero() {
			return pipelineplan.Plan{}, fmt.Errorf("planner: union sources[%d] is empty", i)
		}
		id := fmt.Sprintf("src_%d", i)
		plan.Ops = append(plan.Ops, pipelineplan.Op{
			ID:   id,
			Kind: pipelineplan.KindReadTable,
			ReadTable: &pipelineplan.ReadTable{
				Catalog: src.Catalog, Namespace: src.Namespace, Table: src.Table,
			},
		})
		sourceIDs = append(sourceIDs, id)
	}
	plan.Ops = append(plan.Ops, pipelineplan.Op{
		ID: "u", Kind: pipelineplan.KindUnion, Inputs: sourceIDs,
		Union: &pipelineplan.Union{},
	})
	plan.Ops = append(plan.Ops, sinkOp("u", cfg.Target, mode))

	if errs := plan.Validate(); errs != nil {
		return pipelineplan.Plan{}, fmt.Errorf("planner: composed union plan invalid: %w", errs)
	}
	return plan, nil
}

func composeSingleSource(cfg NodeConfig, mode pipelineplan.WriteMode, plan pipelineplan.Plan) (pipelineplan.Plan, error) {
	if len(cfg.Sources) > 0 {
		return pipelineplan.Plan{}, errors.New("planner: non-union node must not set `sources`; use `source`")
	}
	if cfg.Source == nil || cfg.Source.IsZero() {
		return pipelineplan.Plan{}, errors.New("planner: source Iceberg ref is required for non-union nodes")
	}

	plan.Ops = append(plan.Ops, pipelineplan.Op{
		ID: "src", Kind: pipelineplan.KindReadTable,
		ReadTable: &pipelineplan.ReadTable{
			Catalog: cfg.Source.Catalog, Namespace: cfg.Source.Namespace, Table: cfg.Source.Table,
		},
	})

	transformOps, err := composeTransformOps(cfg, "src")
	if err != nil {
		return pipelineplan.Plan{}, err
	}
	plan.Ops = append(plan.Ops, transformOps...)

	lastID := "src"
	if len(transformOps) > 0 {
		lastID = transformOps[len(transformOps)-1].ID
	}
	plan.Ops = append(plan.Ops, sinkOp(lastID, cfg.Target, mode))

	if errs := plan.Validate(); errs != nil {
		return pipelineplan.Plan{}, fmt.Errorf("planner: composed plan invalid: %w", errs)
	}
	return plan, nil
}

func composeTransformOps(cfg NodeConfig, srcID string) ([]pipelineplan.Op, error) {
	singleCount, singleKind := countSingleOps(cfg)
	hasStack := len(cfg.Stack) > 0
	if singleCount > 0 && hasStack {
		return nil, ErrMixedOperatorConfig
	}
	if singleCount > 1 {
		return nil, ErrMixedOperatorConfig
	}
	if singleCount == 0 && !hasStack {
		// Pure passthrough — read → write. Valid (whole-table copy).
		return nil, nil
	}

	if singleCount == 1 {
		op := pipelineplan.Op{
			ID: "t1", Kind: singleKind, Inputs: []string{srcID},
			Filter: cfg.Filter, Project: cfg.Project, Rename: cfg.Rename,
			Cast: cfg.Cast, Aggregate: cfg.Aggregate, Limit: cfg.Limit,
		}
		return []pipelineplan.Op{op}, nil
	}

	ops := make([]pipelineplan.Op, 0, len(cfg.Stack))
	prev := srcID
	for i, step := range cfg.Stack {
		sCount, sKind := countStackStepOps(step)
		if sCount != 1 {
			return nil, fmt.Errorf("planner: stack step %d must have exactly one operator field set, got %d", i, sCount)
		}
		id := fmt.Sprintf("s%d", i+1)
		ops = append(ops, pipelineplan.Op{
			ID: id, Kind: sKind, Inputs: []string{prev},
			Filter: step.Filter, Project: step.Project, Rename: step.Rename,
			Cast: step.Cast, Aggregate: step.Aggregate, Limit: step.Limit,
		})
		prev = id
	}
	return ops, nil
}

func hasSingleOp(cfg NodeConfig) bool {
	c, _ := countSingleOps(cfg)
	return c > 0
}

func countSingleOps(cfg NodeConfig) (int, pipelineplan.Kind) {
	var count int
	var kind pipelineplan.Kind
	if cfg.Filter != nil {
		count++
		kind = pipelineplan.KindFilter
	}
	if cfg.Project != nil {
		count++
		kind = pipelineplan.KindProject
	}
	if cfg.Rename != nil {
		count++
		kind = pipelineplan.KindRename
	}
	if cfg.Cast != nil {
		count++
		kind = pipelineplan.KindCast
	}
	if cfg.Aggregate != nil {
		count++
		kind = pipelineplan.KindAggregate
	}
	if cfg.Limit != nil {
		count++
		kind = pipelineplan.KindLimit
	}
	return count, kind
}

func countStackStepOps(step StackStep) (int, pipelineplan.Kind) {
	var count int
	var kind pipelineplan.Kind
	if step.Filter != nil {
		count++
		kind = pipelineplan.KindFilter
	}
	if step.Project != nil {
		count++
		kind = pipelineplan.KindProject
	}
	if step.Rename != nil {
		count++
		kind = pipelineplan.KindRename
	}
	if step.Cast != nil {
		count++
		kind = pipelineplan.KindCast
	}
	if step.Aggregate != nil {
		count++
		kind = pipelineplan.KindAggregate
	}
	if step.Limit != nil {
		count++
		kind = pipelineplan.KindLimit
	}
	return count, kind
}

func sinkOp(upstreamID string, target IcebergRef, mode pipelineplan.WriteMode) pipelineplan.Op {
	return pipelineplan.Op{
		ID: "sink", Kind: pipelineplan.KindWriteTable, Inputs: []string{upstreamID},
		WriteTable: &pipelineplan.WriteTable{
			Catalog: target.Catalog, Namespace: target.Namespace, Table: target.Table,
			Mode: mode,
		},
	}
}
