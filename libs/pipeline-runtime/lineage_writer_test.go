package pipelineruntime

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	pp "github.com/openfoundry/openfoundry-go/libs/pipeline-plan"
)

type recordingWriter struct {
	mu     sync.Mutex
	calls  int
	rows   []Row
	failOn int // err on the Nth call (1-indexed); 0 = never fail
}

func (w *recordingWriter) Write(_ context.Context, _, _, _ string, _ pp.WriteMode, rows []Row) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.calls++
	w.rows = append(w.rows, rows...)
	if w.failOn > 0 && w.calls == w.failOn {
		return errors.New("simulated write failure")
	}
	return nil
}

func TestLineageWriter_EmitsCompleteEventOnSuccess(t *testing.T) {
	t.Parallel()
	var seenEvent map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&seenEvent))
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	inner := &recordingWriter{}
	lw := &LineageWriter{
		Inner:             inner,
		LineageServiceURL: srv.URL,
		JobNamespace:      "pipelines",
		JobName:           "OpenSkyRaw_to_OpenSkyHourly",
		Inputs: []DatasetRef{
			{Namespace: "main.events", Name: "OpenSkyRaw"},
		},
		NowFn:   func() time.Time { return time.Date(2026, 5, 20, 12, 0, 0, 0, time.UTC) },
		RunIDFn: func() string { return "00000000-0000-4000-8000-000000000001" },
	}
	err := lw.Write(context.Background(), "main", "events", "OpenSkyHourly", pp.WriteMode("replace"), []Row{
		{"id": "row-1"},
	})
	require.NoError(t, err)
	assert.Equal(t, 1, inner.calls)
	assert.Equal(t, "COMPLETE", seenEvent["eventType"])
	assert.Equal(t, "2026-05-20T12:00:00Z", seenEvent["eventTime"])
	assert.Equal(t, "00000000-0000-4000-8000-000000000001", seenEvent["run"].(map[string]any)["runId"])
	assert.Equal(t, "pipelines", seenEvent["job"].(map[string]any)["namespace"])
	assert.Equal(t, "OpenSkyRaw_to_OpenSkyHourly", seenEvent["job"].(map[string]any)["name"])
	outputs := seenEvent["outputs"].([]any)
	require.Len(t, outputs, 1)
	out := outputs[0].(map[string]any)
	assert.Equal(t, "main.events", out["namespace"])
	assert.Equal(t, "OpenSkyHourly", out["name"])
	inputs := seenEvent["inputs"].([]any)
	require.Len(t, inputs, 1)
	in := inputs[0].(map[string]any)
	assert.Equal(t, "OpenSkyRaw", in["name"])
}

func TestLineageWriter_EmitsFailEventWhenInnerErrors(t *testing.T) {
	t.Parallel()
	var seenEvent map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&seenEvent))
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()
	inner := &recordingWriter{failOn: 1}
	lw := &LineageWriter{Inner: inner, LineageServiceURL: srv.URL}
	err := lw.Write(context.Background(), "main", "events", "OpenSkyHourly", pp.WriteMode("append"), []Row{{}})
	require.Error(t, err)
	assert.Equal(t, "FAIL", seenEvent["eventType"])
	runFacets := seenEvent["run"].(map[string]any)["facets"].(map[string]any)
	assert.Contains(t, runFacets["message"], "simulated")
}

func TestLineageWriter_DoesNotEmitWhenServiceURLEmpty(t *testing.T) {
	t.Parallel()
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()
	inner := &recordingWriter{}
	lw := &LineageWriter{Inner: inner} // LineageServiceURL empty
	require.NoError(t, lw.Write(context.Background(), "main", "events", "t", pp.WriteMode("append"), []Row{{}}))
	assert.Equal(t, int32(0), atomic.LoadInt32(&calls), "no POST when service URL is empty")
}

func TestLineageWriter_EmitErrorIsBestEffort(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	var emitErr error
	inner := &recordingWriter{}
	lw := &LineageWriter{
		Inner:             inner,
		LineageServiceURL: srv.URL,
		OnEmitError:       func(err error) { emitErr = err },
	}
	require.NoError(t, lw.Write(context.Background(), "main", "events", "t", pp.WriteMode("append"), []Row{{}}))
	require.Error(t, emitErr, "OnEmitError must be invoked when the lineage POST fails")
	assert.Equal(t, 1, inner.calls, "the Write itself still succeeded")
}

func TestLineageWriter_WithInputsReturnsCopy(t *testing.T) {
	t.Parallel()
	base := &LineageWriter{Inner: &recordingWriter{}}
	withA := base.WithInputs([]DatasetRef{{Namespace: "main.events", Name: "A"}})
	withB := base.WithInputs([]DatasetRef{{Namespace: "main.events", Name: "B"}})
	assert.NotSame(t, withA, withB)
	assert.Empty(t, base.Inputs, "WithInputs must not mutate the receiver")
	assert.Equal(t, "A", withA.Inputs[0].Name)
	assert.Equal(t, "B", withB.Inputs[0].Name)
}
