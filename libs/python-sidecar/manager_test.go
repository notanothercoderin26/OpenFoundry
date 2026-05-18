package pythonsidecar

import (
	"context"
	"io"
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

// TestSupervisorExitsWhenParentCtxCancelled guards against the historical
// goroutine leak: superviseLoop used to be parented on context.Background,
// so cancelling the ctx the caller had handed to Start did nothing.
// We now derive the supervisor ctx from the Start ctx, so cancelling the
// parent must unwind the supervisor without the caller having to call
// Stop/Close. The test bypasses spawnAndConnect by driving superviseLoop
// directly with a long HealthInterval, so the loop is parked on
// `<-ctx.Done()` and exits on the very next select tick.
func TestSupervisorExitsWhenParentCtxCancelled(t *testing.T) {
	mgr := &Manager{
		cfg: Config{
			HealthInterval:              1 * time.Hour,
			HealthFailuresBeforeRestart: 999,
			MaxRestartBackoff:           time.Second,
		},
		log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	parentCtx, cancelParent := context.WithCancel(context.Background())
	t.Cleanup(cancelParent)
	superviseCtx, cancelSupervise := context.WithCancel(parentCtx)
	mgr.supervise = cancelSupervise

	baseline := runtime.NumGoroutine()
	mgr.wg.Add(1)
	go mgr.superviseLoop(superviseCtx)

	if !waitForGoroutineCount(func(n int) bool { return n > baseline }, 200*time.Millisecond) {
		t.Fatalf("supervisor goroutine never started: baseline=%d, current=%d", baseline, runtime.NumGoroutine())
	}

	cancelParent()

	if !waitForGoroutineCount(func(n int) bool { return n <= baseline }, 100*time.Millisecond) {
		t.Fatalf("supervisor goroutine leaked 100ms after parent ctx cancel: baseline=%d, current=%d", baseline, runtime.NumGoroutine())
	}

	done := make(chan struct{})
	go func() { mgr.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("supervisor WaitGroup did not drain 100ms after parent ctx cancel")
	}
}

func waitForGoroutineCount(predicate func(int) bool, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if predicate(runtime.NumGoroutine()) {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return predicate(runtime.NumGoroutine())
}
