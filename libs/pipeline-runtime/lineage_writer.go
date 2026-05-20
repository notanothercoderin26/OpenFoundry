// LineageWriter decorates another [Writer] and emits an OpenLineage
// `RunEvent` to lineage-service after every Write call. Producers
// (pipeline-runner, ad-hoc transform invocations) get end-to-end
// lineage without per-handler plumbing — they wrap their concrete
// Writer (Iceberg HTTP, memory, …) in `&LineageWriter{Inner: …}`.
//
// Best-effort: an emit failure is logged through `OnEmitError` and
// does not propagate to the caller (the underlying Write already
// succeeded; lineage gaps degrade observability but not correctness).
//
// Closes B06 §AC#2: every snapshot a transform produces appears in
// lineage-service with input/output edges.

package pipelineruntime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	pp "github.com/openfoundry/openfoundry-go/libs/pipeline-plan"
)

const lineageIngestPath = "/api/v1/lineage/events"

// LineageWriter wraps an inner Writer and emits one OpenLineage
// RunEvent per successful (or failed) write call.
type LineageWriter struct {
	Inner Writer
	// LineageServiceURL is the lineage-service base URL (no trailing
	// slash). Empty disables emission entirely so the unit-test fake
	// path keeps working without the network round-trip.
	LineageServiceURL string
	HTTP              *http.Client
	AuthHeader        string
	// JobNamespace + JobName identify the transform. Producers set
	// them from the pipeline-build job manifest. Defaults are below
	// so an unconfigured decorator still emits valid events.
	JobNamespace string
	JobName      string
	// Inputs are the datasets the writer reads before producing this
	// output. The decorator does not learn these from the Writer
	// surface — callers populate them once per Write call by
	// reconstructing the LineageWriter or, more practically, by using
	// [LineageWriter.WithInputs].
	Inputs []DatasetRef
	// OnEmitError is invoked when the lineage POST fails. Defaults to
	// a no-op; production wires a slog.Logger.
	OnEmitError func(err error)
	// NowFn is the clock used for RunEvent.EventTime. Defaults to
	// time.Now; tests inject a frozen clock.
	NowFn func() time.Time
	// RunIDFn returns the RunId to attach to each event. Defaults to
	// a deterministic-per-call UUIDv4 via google/uuid; tests inject a
	// stub for golden assertions.
	RunIDFn func() string
}

// DatasetRef mirrors the lineage-service openlineage.DatasetRef
// shape. Redeclared locally so the runtime does not pull the lineage
// service into its import graph.
type DatasetRef struct {
	Namespace string          `json:"namespace"`
	Name      string          `json:"name"`
	Facets    json.RawMessage `json:"facets,omitempty"`
}

// WithInputs returns a shallow copy of the decorator with Inputs
// replaced. Callers chain `(&LineageWriter{...}).WithInputs(inputs)`
// before each Write so the emitted event carries the right upstreams.
func (w *LineageWriter) WithInputs(inputs []DatasetRef) *LineageWriter {
	cp := *w
	cp.Inputs = append([]DatasetRef(nil), inputs...)
	return &cp
}

// Write implements [Writer]. Delegates to Inner, then emits a
// COMPLETE / FAIL event regardless of outcome. The Write error (if
// any) is returned verbatim to the caller.
func (w *LineageWriter) Write(ctx context.Context, catalog, namespace, table string, mode pp.WriteMode, rows []Row) error {
	if w.Inner == nil {
		return fmt.Errorf("LineageWriter: Inner is nil")
	}
	err := w.Inner.Write(ctx, catalog, namespace, table, mode, rows)
	w.emit(ctx, catalog, namespace, table, mode, len(rows), err)
	return err
}

func (w *LineageWriter) emit(ctx context.Context, catalog, namespace, table string, mode pp.WriteMode, rowCount int, writeErr error) {
	if strings.TrimSpace(w.LineageServiceURL) == "" {
		return
	}
	eventType := "COMPLETE"
	if writeErr != nil {
		eventType = "FAIL"
	}
	now := w.now()
	jobNamespace := w.JobNamespace
	if jobNamespace == "" {
		jobNamespace = "pipeline-runtime"
	}
	jobName := w.JobName
	if jobName == "" {
		jobName = catalog + "." + namespace + "." + table
	}
	outputFacets, _ := json.Marshal(map[string]any{
		"writeMode":    string(mode),
		"rowsAppended": rowCount,
	})
	event := map[string]any{
		"eventType": eventType,
		"eventTime": now.UTC().Format(time.RFC3339Nano),
		"producer":  "pipeline-runtime",
		"schemaURL": "https://openlineage.io/spec/2-0-0/OpenLineage.json#/$defs/RunEvent",
		"run":       map[string]any{"runId": w.runID()},
		"job":       map[string]any{"namespace": jobNamespace, "name": jobName},
		"inputs":    w.Inputs,
		"outputs": []map[string]any{
			{
				"namespace": catalog + "." + namespace,
				"name":      table,
				"facets":    json.RawMessage(outputFacets),
			},
		},
	}
	if writeErr != nil {
		errFacet, _ := json.Marshal(map[string]any{"message": writeErr.Error()})
		event["run"] = map[string]any{
			"runId":  w.runID(),
			"facets": json.RawMessage(errFacet),
		}
	}
	body, err := json.Marshal(event)
	if err != nil {
		w.onEmitError(fmt.Errorf("encode lineage event: %w", err))
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(w.LineageServiceURL, "/")+lineageIngestPath, bytes.NewReader(body))
	if err != nil {
		w.onEmitError(err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if w.AuthHeader != "" {
		req.Header.Set("Authorization", w.AuthHeader)
	}
	client := w.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		w.onEmitError(err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		rbody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<12))
		w.onEmitError(fmt.Errorf("lineage POST %d: %s", resp.StatusCode, strings.TrimSpace(string(rbody))))
	}
}

func (w *LineageWriter) now() time.Time {
	if w.NowFn != nil {
		return w.NowFn()
	}
	return time.Now()
}

func (w *LineageWriter) runID() string {
	if w.RunIDFn != nil {
		return w.RunIDFn()
	}
	return newRunID()
}

func (w *LineageWriter) onEmitError(err error) {
	if w.OnEmitError != nil {
		w.OnEmitError(err)
	}
}

// Compile-time satisfaction check.
var _ Writer = (*LineageWriter)(nil)

// newRunID is split out so tests can stub it via RunIDFn without
// importing google/uuid into the test compilation unit.
func newRunID() string {
	// We avoid pulling in google/uuid here to keep the dep graph thin —
	// crypto/rand suffices for an opaque, unique-per-call token.
	var buf [16]byte
	_, _ = randRead(buf[:])
	// RFC 4122 variant + version 4
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16])
}
