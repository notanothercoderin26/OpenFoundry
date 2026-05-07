package pythonsidecar

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

// TestSidecarEndToEnd starts a real openfoundry-pyruntime, drives the
// three RPCs, and shuts down. Skipped when the binary path is not set.
//
// Set PYTHON_SIDECAR_BINARY to the absolute path of openfoundry-pyruntime
// (e.g. the script installed in your dev venv) to enable.
func TestSidecarEndToEnd(t *testing.T) {
	bin := os.Getenv("PYTHON_SIDECAR_BINARY")
	if bin == "" {
		t.Skip("PYTHON_SIDECAR_BINARY not set — install openfoundry-pyruntime in a venv and re-run")
	}

	mgr, err := New(Config{
		BinaryPath:      bin,
		StartupTimeout:  5 * time.Second,
		HardCallTimeout: 10 * time.Second,
	}, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := mgr.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	t.Cleanup(func() { _ = mgr.Stop(context.Background()) })

	t.Run("inline", func(t *testing.T) {
		out, err := mgr.ExecuteInline(ctx, `import sys`+"\n"+`print("hi")`+"\n"+`print("err", file=sys.stderr)`+"\n"+`result = {"k": 1}`, []byte("{}"), 0)
		if err != nil {
			t.Fatalf("ExecuteInline: %v", err)
		}
		if out.Stdout != "hi\n" {
			t.Fatalf("stdout = %q, want %q", out.Stdout, "hi\n")
		}
		if out.Stderr != "err\n" {
			t.Fatalf("stderr = %q, want %q", out.Stderr, "err\n")
		}
		var payload map[string]any
		if err := json.Unmarshal(out.ResultJSON, &payload); err != nil {
			t.Fatalf("ResultJSON not JSON: %v", err)
		}
		result, ok := payload["result"].(map[string]any)
		if !ok || result["k"] != float64(1) {
			t.Fatalf("unexpected result payload: %v", payload)
		}
	})

	t.Run("inline error", func(t *testing.T) {
		_, err := mgr.ExecuteInline(ctx, `raise RuntimeError("inline boom")`, []byte("{}"), 0)
		if err == nil || !strings.Contains(err.Error(), "inline boom") {
			t.Fatalf("expected inline error to contain inline boom, got %v", err)
		}
	})

	t.Run("pipeline", func(t *testing.T) {
		src := "rows_affected = 3\nresult_rows = [{\"a\": 1}, {\"a\": 2}, {\"a\": 3}]\nprint(\"rows\")"
		out, err := mgr.ExecutePipeline(ctx, src, []byte("{}"), []byte("[]"), nil, "", 0)
		if err != nil {
			t.Fatalf("ExecutePipeline: %v", err)
		}
		if out.Stdout != "rows\n" {
			t.Fatalf("pipeline stdout = %q, want %q", out.Stdout, "rows\n")
		}
		if !out.RowsAffectedSet || out.RowsAffected != 3 {
			t.Fatalf("rows_affected = %d (set=%v), want 3", out.RowsAffected, out.RowsAffectedSet)
		}
		var rows []map[string]any
		if err := json.Unmarshal(out.ResultRowsJSON, &rows); err != nil {
			t.Fatalf("result rows not JSON: %v", err)
		}
		if len(rows) != 3 {
			t.Fatalf("rows len = %d, want 3", len(rows))
		}
	})

	t.Run("pipeline error", func(t *testing.T) {
		_, err := mgr.ExecutePipeline(ctx, `raise RuntimeError("pipeline boom")`, []byte("{}"), []byte("[]"), nil, "", 0)
		if err == nil || !strings.Contains(err.Error(), "pipeline boom") {
			t.Fatalf("expected pipeline error to contain pipeline boom, got %v", err)
		}
	})

	t.Run("notebook session persists", func(t *testing.T) {
		sid := uuid.New()
		nbid := uuid.New()
		first, err := mgr.ExecuteNotebookCell(ctx, sid, nbid, "x = 21\nprint(x)", "", 0)
		if err != nil {
			t.Fatalf("first cell: %v", err)
		}
		if first.Stdout != "21\n" {
			t.Fatalf("first stdout = %q", first.Stdout)
		}
		second, err := mgr.ExecuteNotebookCell(ctx, sid, nbid, "print(x*2)", "", 0)
		if err != nil {
			t.Fatalf("second cell: %v", err)
		}
		if second.Stdout != "42\n" {
			t.Fatalf("second stdout = %q (session not persisted?)", second.Stdout)
		}
		if err := mgr.DropSession(ctx, sid); err != nil {
			t.Fatalf("DropSession: %v", err)
		}
	})

	t.Run("notebook error", func(t *testing.T) {
		_, err := mgr.ExecuteNotebookCell(ctx, uuid.New(), uuid.New(), `raise RuntimeError("notebook boom")`, "", 0)
		if err == nil || !strings.Contains(err.Error(), "notebook boom") {
			t.Fatalf("expected notebook error to contain notebook boom, got %v", err)
		}
	})
}
