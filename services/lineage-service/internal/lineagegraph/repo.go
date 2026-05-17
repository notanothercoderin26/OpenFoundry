// Package lineagegraph owns the OpenLineage-shaped graph store
// (lineage_runs, lineage_datasets, lineage_edges).
//
// It is intentionally decoupled from the older internal/lineage package
// — that one models the full Foundry overlay (column lineage, markings,
// impact, workflow sync). This one is the minimal OpenLineage object
// model: runs in/out of datasets.
package lineagegraph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/lineage-service/internal/openlineage"
)

// MaxBFSDepth caps depth on the upstream/downstream endpoints. The
// recursive CTE keeps a visited array per row so the upper bound also
// caps the worst-case memory footprint of the query.
const MaxBFSDepth = 5

// Run is the persisted lineage_runs row.
type Run struct {
	RunID        string          `json:"run_id"`
	JobNamespace string          `json:"job_namespace"`
	JobName      string          `json:"job_name"`
	StartedAt    *time.Time      `json:"started_at"`
	EndedAt      *time.Time      `json:"ended_at"`
	State        string          `json:"state"`
	Facets       json.RawMessage `json:"facets"`
}

// Dataset is the persisted lineage_datasets row.
type Dataset struct {
	RID       string          `json:"rid"`
	Namespace string          `json:"namespace"`
	Name      string          `json:"name"`
	Facets    json.RawMessage `json:"facets"`
}

// GraphNode is the wire-format node used by the upstream/downstream
// responses. Cytoscape consumes {id, name, type}; we add `rid` as the
// stable identifier and keep `name` as the human label.
type GraphNode struct {
	RID  string `json:"rid"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// GraphEdge is the wire-format edge used by the upstream/downstream
// responses. `run_id` is preserved so the UI can link an edge back to
// the run that produced it.
type GraphEdge struct {
	Src   string `json:"src"`
	Dst   string `json:"dst"`
	RunID string `json:"run_id"`
}

// GraphResponse is the {nodes, edges} envelope.
type GraphResponse struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

// Repo is the pgx-backed repository for the OL graph tables.
type Repo struct {
	pool *pgxpool.Pool
}

// New returns a Repo backed by the given pool.
func New(pool *pgxpool.Pool) *Repo { return &Repo{pool: pool} }

// Ingest persists one decoded OpenLineage RunEvent. It:
//
//  1. Upserts the lineage_runs row, updating started_at / ended_at /
//     state from the eventType.
//  2. Upserts every input/output dataset.
//  3. Inserts one lineage_edges row for each (input, output) pair,
//     with edge_type=INPUT — the (run_id, src, dst, edge_type) primary
//     key idempotently dedupes redeliveries.
//
// The whole thing runs in a single transaction so a producer that
// retries on transient failure never leaves a half-applied event.
func (r *Repo) Ingest(ctx context.Context, ev *openlineage.RunEvent) error {
	if ev == nil {
		return openlineage.ErrInvalidEvent
	}
	if err := ev.Validate(); err != nil {
		return err
	}
	state := ev.State()
	eventTime := ev.ParsedEventTime()
	if eventTime.IsZero() {
		eventTime = time.Now().UTC()
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := upsertRun(ctx, tx, ev, state, eventTime); err != nil {
		return err
	}
	for _, ds := range ev.Inputs {
		if err := upsertDataset(ctx, tx, ds); err != nil {
			return err
		}
	}
	for _, ds := range ev.Outputs {
		if err := upsertDataset(ctx, tx, ds); err != nil {
			return err
		}
	}
	for _, in := range ev.Inputs {
		for _, out := range ev.Outputs {
			if err := upsertEdge(ctx, tx, ev.Run.RunID, in.RID(), out.RID(), openlineage.EdgeTypeInput); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}

func upsertRun(ctx context.Context, tx pgx.Tx, ev *openlineage.RunEvent, state openlineage.RunState, eventTime time.Time) error {
	facets := ev.Run.Facets
	if len(facets) == 0 {
		facets = json.RawMessage(`{}`)
	}

	// We set started_at on the first event we see, and ended_at on
	// COMPLETE/FAILED/ABORTED. The COALESCE clauses are what make
	// re-delivery safe — a duplicate START never wipes an existing
	// ended_at.
	var startedAt, endedAt any
	if state == openlineage.StateRunning {
		startedAt = eventTime
	}
	if state == openlineage.StateComplete || state == openlineage.StateFailed || state == openlineage.StateAborted {
		endedAt = eventTime
	}

	_, err := tx.Exec(ctx, `
        INSERT INTO lineage_runs (run_id, job_namespace, job_name, started_at, ended_at, state, facets, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (run_id) DO UPDATE SET
            job_namespace = EXCLUDED.job_namespace,
            job_name      = EXCLUDED.job_name,
            started_at    = COALESCE(lineage_runs.started_at, EXCLUDED.started_at),
            ended_at      = COALESCE(EXCLUDED.ended_at, lineage_runs.ended_at),
            state         = CASE
                                WHEN EXCLUDED.state = 'RUNNING' AND lineage_runs.state <> 'RUNNING' THEN lineage_runs.state
                                ELSE EXCLUDED.state
                            END,
            facets        = EXCLUDED.facets,
            updated_at    = NOW()
    `, ev.Run.RunID, ev.Job.Namespace, ev.Job.Name, startedAt, endedAt, string(state), facets)
	if err != nil {
		return fmt.Errorf("upsert run %s: %w", ev.Run.RunID, err)
	}
	return nil
}

func upsertDataset(ctx context.Context, tx pgx.Tx, ds openlineage.DatasetRef) error {
	facets := ds.Facets
	if len(facets) == 0 {
		facets = json.RawMessage(`{}`)
	}
	_, err := tx.Exec(ctx, `
        INSERT INTO lineage_datasets (rid, namespace, name, facets, updated_at)
             VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (rid) DO UPDATE SET
            namespace = EXCLUDED.namespace,
            name      = EXCLUDED.name,
            facets    = EXCLUDED.facets,
            updated_at = NOW()
    `, ds.RID(), ds.Namespace, ds.Name, facets)
	if err != nil {
		return fmt.Errorf("upsert dataset %s: %w", ds.RID(), err)
	}
	return nil
}

func upsertEdge(ctx context.Context, tx pgx.Tx, runID, src, dst string, edgeType openlineage.EdgeType) error {
	_, err := tx.Exec(ctx, `
        INSERT INTO lineage_edges (run_id, src_dataset_rid, dst_dataset_rid, edge_type)
             VALUES ($1, $2, $3, $4)
        ON CONFLICT (run_id, src_dataset_rid, dst_dataset_rid, edge_type) DO NOTHING
    `, runID, src, dst, string(edgeType))
	if err != nil {
		return fmt.Errorf("upsert edge %s -> %s (%s): %w", src, dst, runID, err)
	}
	return nil
}

// ClampDepth returns the requested depth bounded by [1, MaxBFSDepth].
func ClampDepth(depth int) int {
	if depth <= 0 {
		return 1
	}
	if depth > MaxBFSDepth {
		return MaxBFSDepth
	}
	return depth
}

// Upstream returns ancestors of `rid` within `depth` hops. Cycle
// protection is handled in-recursion by tracking the visited path —
// `A → B → A` only walks each edge once even when the seed is on the
// cycle.
func (r *Repo) Upstream(ctx context.Context, rid string, depth int) (*GraphResponse, error) {
	return r.bfs(ctx, rid, depth, directionUpstream)
}

// Downstream returns descendants of `rid` within `depth` hops. Same
// cycle protection as Upstream.
func (r *Repo) Downstream(ctx context.Context, rid string, depth int) (*GraphResponse, error) {
	return r.bfs(ctx, rid, depth, directionDownstream)
}

type direction int

const (
	directionUpstream direction = iota
	directionDownstream
)

// bfs collects the reachable node set with a recursive CTE, then
// pulls the dataset metadata + the edges spanning that set. We do not
// fuse the two queries into one because pg doesn't allow recursive
// CTEs to fan out into multiple result shapes cleanly.
func (r *Repo) bfs(ctx context.Context, rid string, depth int, dir direction) (*GraphResponse, error) {
	depth = ClampDepth(depth)

	// The seed always lands in the response, even when the rid has no
	// edges yet.
	var bfsSQL string
	switch dir {
	case directionUpstream:
		bfsSQL = `
            WITH RECURSIVE walk(rid, depth, path) AS (
                SELECT $1::text, 0, ARRAY[$1::text]
                UNION ALL
                SELECT e.src_dataset_rid, w.depth + 1, w.path || e.src_dataset_rid
                  FROM lineage_edges e
                  JOIN walk w ON e.dst_dataset_rid = w.rid
                 WHERE w.depth < $2
                   AND NOT (e.src_dataset_rid = ANY(w.path))
            )
            SELECT DISTINCT rid FROM walk
        `
	case directionDownstream:
		bfsSQL = `
            WITH RECURSIVE walk(rid, depth, path) AS (
                SELECT $1::text, 0, ARRAY[$1::text]
                UNION ALL
                SELECT e.dst_dataset_rid, w.depth + 1, w.path || e.dst_dataset_rid
                  FROM lineage_edges e
                  JOIN walk w ON e.src_dataset_rid = w.rid
                 WHERE w.depth < $2
                   AND NOT (e.dst_dataset_rid = ANY(w.path))
            )
            SELECT DISTINCT rid FROM walk
        `
	default:
		return nil, errors.New("lineagegraph: unknown direction")
	}

	rows, err := r.pool.Query(ctx, bfsSQL, rid, depth)
	if err != nil {
		return nil, fmt.Errorf("bfs: %w", err)
	}
	var rids []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			rows.Close()
			return nil, err
		}
		rids = append(rids, v)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	nodes, err := r.loadDatasets(ctx, rids)
	if err != nil {
		return nil, err
	}
	edges, err := r.loadEdgesBetween(ctx, rids)
	if err != nil {
		return nil, err
	}
	return &GraphResponse{Nodes: nodes, Edges: edges}, nil
}

func (r *Repo) loadDatasets(ctx context.Context, rids []string) ([]GraphNode, error) {
	if len(rids) == 0 {
		return []GraphNode{}, nil
	}
	rows, err := r.pool.Query(ctx, `
        SELECT rid, namespace, name FROM lineage_datasets WHERE rid = ANY($1)
    `, rids)
	if err != nil {
		return nil, fmt.Errorf("load datasets: %w", err)
	}
	defer rows.Close()
	seen := map[string]GraphNode{}
	for rows.Next() {
		var rid, ns, name string
		if err := rows.Scan(&rid, &ns, &name); err != nil {
			return nil, err
		}
		seen[rid] = GraphNode{RID: rid, Name: name, Type: "dataset"}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Synthesise nodes for RIDs that have edges but no lineage_datasets
	// row yet. This matches the Foundry behaviour where a placeholder
	// is rendered until the producer flushes a catalog row.
	out := make([]GraphNode, 0, len(rids))
	for _, rid := range rids {
		if n, ok := seen[rid]; ok {
			out = append(out, n)
			continue
		}
		out = append(out, GraphNode{RID: rid, Name: rid, Type: "dataset"})
	}
	return out, nil
}

func (r *Repo) loadEdgesBetween(ctx context.Context, rids []string) ([]GraphEdge, error) {
	if len(rids) == 0 {
		return []GraphEdge{}, nil
	}
	rows, err := r.pool.Query(ctx, `
        SELECT run_id, src_dataset_rid, dst_dataset_rid
          FROM lineage_edges
         WHERE src_dataset_rid = ANY($1)
           AND dst_dataset_rid = ANY($1)
    `, rids)
	if err != nil {
		return nil, fmt.Errorf("load edges: %w", err)
	}
	defer rows.Close()
	out := []GraphEdge{}
	for rows.Next() {
		var runID, src, dst string
		if err := rows.Scan(&runID, &src, &dst); err != nil {
			return nil, err
		}
		out = append(out, GraphEdge{Src: src, Dst: dst, RunID: runID})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// JobRuns returns the last `limit` runs for the given job. Ordering
// uses started_at with a created_at fallback so runs that never emitted
// a START still surface.
func (r *Repo) JobRuns(ctx context.Context, namespace, name string, limit int) ([]Run, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
        SELECT run_id, job_namespace, job_name, started_at, ended_at, state, facets
          FROM lineage_runs
         WHERE job_namespace = $1 AND job_name = $2
         ORDER BY COALESCE(started_at, created_at) DESC
         LIMIT $3
    `, namespace, name, limit)
	if err != nil {
		return nil, fmt.Errorf("job runs: %w", err)
	}
	defer rows.Close()
	out := []Run{}
	for rows.Next() {
		var run Run
		var facets []byte
		if err := rows.Scan(&run.RunID, &run.JobNamespace, &run.JobName, &run.StartedAt, &run.EndedAt, &run.State, &facets); err != nil {
			return nil, err
		}
		run.Facets = facets
		out = append(out, run)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
