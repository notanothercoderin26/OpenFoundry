package pythonsidecar

import (
	"context"
	"log/slog"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestSidecarBinaryUnsetIsSkipped(t *testing.T) {
	t.Setenv("PYTHON_SIDECAR_BINARY", "")
	if os.Getenv("PYTHON_SIDECAR_BINARY") != "" {
		t.Fatal("PYTHON_SIDECAR_BINARY should be unset in this test")
	}
	_, err := New(Config{BinaryPath: ""}, nil)
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "binarypath") || !strings.Contains(strings.ToLower(err.Error()), "required") {
		t.Fatalf("expected missing binary path validation, got %v", err)
	}
}

// TestSuperviseGoroutineExitsWhenParentCtxCancelled pins the goroutine
// leak fix: cancelling the parent context that Start received must
// terminate the supervisor goroutine, even when neither Stop nor Close
// is called. Pre-fix, superviseLoop was rooted at context.Background()
// so cancellation never propagated and every Manager instance leaked
// one goroutine for the lifetime of the process.
func TestSuperviseGoroutineExitsWhenParentCtxCancelled(t *testing.T) {
	m := &Manager{
		cfg: Config{HealthInterval: time.Hour},
		log: slog.Default(),
	}

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	before := runtime.NumGoroutine()
	m.wg.Add(1)
	go m.superviseLoop(ctx)

	if !waitGoroutineCount(func(n int) bool { return n > before }, 200*time.Millisecond) {
		t.Fatalf("supervisor goroutine never started: before=%d current=%d", before, runtime.NumGoroutine())
	}

	cancel()

	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(100 * time.Millisecond):
		t.Fatalf("supervisor goroutine did not exit within 100ms of parent ctx cancel")
	}

	if !waitGoroutineCount(func(n int) bool { return n <= before }, 100*time.Millisecond) {
		t.Fatalf("goroutine count did not return to baseline: before=%d after=%d", before, runtime.NumGoroutine())
	}
}

func waitGoroutineCount(pred func(int) bool, within time.Duration) bool {
	deadline := time.Now().Add(within)
	for {
		if pred(runtime.NumGoroutine()) {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(5 * time.Millisecond)
	}
}
