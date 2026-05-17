//go:build smoke

// Package smoke holds end-to-end smoke tests that exercise the
// service binaries produced by `make build-services`.
//
// Run with:
//
//	make build-services
//	go test -tags=smoke ./tests/smoke/...
//
// TestHealthz iterates services/*/cmd/<svc>/main.go, boots each
// binary in serial, polls GET /healthz on the service's default
// PORT, and verifies the canonical {"status":"ok"} payload.
//
// Stub-only services (report, knowledge-index, retrieval-context,
// network-boundary, global-branch, cipher) are t.Skip()-ed pending
// the QW that teaches them to emit {"stub": true} on /healthz — see
// the TODO inside the subtest.
package smoke

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

const (
	bootTimeout      = 5 * time.Second
	pollInterval     = 100 * time.Millisecond
	gracefulShutdown = 1 * time.Second
)

// stubOnlyServices are the gateway-backing stubs that exist only to
// turn 502s into structured 501s. The QW that owns this file requires
// them to extend /healthz with {"stub": true}; until that lands we
// keep the subtest skipped so the smoke suite stays meaningful.
var stubOnlyServices = map[string]struct{}{
	"report-service":            {},
	"knowledge-index-service":   {},
	"retrieval-context-service": {},
	"network-boundary-service":  {},
	"global-branch-service":     {},
	"cipher-service":            {},
}

// portOverrides covers services whose HTTP /healthz listener is *not*
// bound to the value parsed from parseUint16("PORT", N). Today this is
// just sql-bi-gateway-service, where the side router lives on
// HEALTHZ_PORT (the Flight SQL gRPC primary owns PORT).
var portOverrides = map[string]uint16{
	"sql-bi-gateway-service": 50134,
}

var (
	rePortDefault      = regexp.MustCompile(`parseUint16\([^,]*os\.Getenv\("PORT"\)[^,]*,\s*(\d+)\s*\)`)
	reDefaultPortConst = regexp.MustCompile(`DefaultPort\s+uint16\s*=\s*(\d+)`)
)

var errStopWalk = errors.New("stop walk")

func TestHealthz(t *testing.T) {
	repoRoot, err := findRepoRoot()
	if err != nil {
		t.Fatalf("locate repo root: %v", err)
	}

	mains, err := filepath.Glob(filepath.Join(repoRoot, "services", "*", "cmd", "*", "main.go"))
	if err != nil {
		t.Fatalf("glob service mains: %v", err)
	}
	if len(mains) == 0 {
		t.Fatalf("no services/*/cmd/*/main.go found under %s", repoRoot)
	}

	for _, mp := range mains {
		cmdDir := filepath.Dir(mp)
		binName := filepath.Base(cmdDir)
		svcDir := filepath.Dir(filepath.Dir(cmdDir))
		svcName := filepath.Base(svcDir)

		// `make build-services` only emits bin/<svc> from cmd/<svc>;
		// auxiliary cmds (e.g. workflow-automation-service/cmd/
		// approvals-timeout-sweep) aren't part of the canonical binary
		// set, so skip them here.
		if binName != svcName {
			continue
		}

		t.Run(svcName, func(t *testing.T) {
			if _, ok := stubOnlyServices[svcName]; ok {
				t.Skip(`TODO(smoke-healthz): stub-only service must emit {"stub": true} on /healthz before this subtest can run; tracked alongside tests/smoke/healthz_test.go`)
			}

			port, ok := portOverrides[svcName]
			if !ok {
				p, found := findDefaultPort(svcDir)
				if !found {
					t.Skipf("default PORT not extractable via parseUint16 in %s", svcDir)
				}
				port = p
			}

			binPath := filepath.Join(repoRoot, "bin", binName)
			if _, err := os.Stat(binPath); err != nil {
				t.Fatalf("%s missing — run `make build-services` first (%v)", binPath, err)
			}

			runHealthzProbe(t, repoRoot, binPath, svcName, port)
		})
	}
}

func runHealthzProbe(t *testing.T, repoRoot, binPath, svcName string, port uint16) {
	t.Helper()

	cmd := exec.Command(binPath)
	cmd.Dir = repoRoot
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatalf("start %s: %v", svcName, err)
	}

	t.Cleanup(func() {
		if cmd.Process == nil {
			return
		}
		_ = cmd.Process.Signal(syscall.SIGTERM)
		done := make(chan struct{})
		go func() {
			_ = cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(gracefulShutdown):
			_ = cmd.Process.Kill()
			<-done
		}
	})

	url := fmt.Sprintf("http://127.0.0.1:%d/healthz", port)
	client := &http.Client{Timeout: time.Second}
	deadline := time.Now().Add(bootTimeout)

	var (
		body    []byte
		gotOK   bool
		lastErr error
	)
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err != nil {
			lastErr = err
			time.Sleep(pollInterval)
			continue
		}
		body, _ = io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			gotOK = true
			break
		}
		lastErr = fmt.Errorf("status=%d body=%s", resp.StatusCode, truncate(body, 200))
		time.Sleep(pollInterval)
	}
	if !gotOK {
		t.Fatalf("healthz did not return 200 within %s on %s: %v", bootTimeout, url, lastErr)
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode healthz body %q: %v", string(body), err)
	}
	if got := payload["status"]; got != "ok" {
		t.Fatalf("expected status=\"ok\", got %v (body=%s)", got, string(body))
	}
}

// findDefaultPort scans the service tree under svcDir/internal for
// `parseUint16(os.Getenv("PORT"), N)`. Falls back to a `DefaultPort
// uint16 = N` const (used by connector-management-service, which uses
// a 3-arg parseUint16 signature).
func findDefaultPort(svcDir string) (uint16, bool) {
	var (
		port          uint16
		found         bool
		fallback      uint16
		fallbackFound bool
	)

	walkRoot := filepath.Join(svcDir, "internal")
	if _, err := os.Stat(walkRoot); err != nil {
		return 0, false
	}

	walkErr := filepath.WalkDir(walkRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}
		if m := rePortDefault.FindSubmatch(data); m != nil {
			if n, perr := strconv.ParseUint(string(m[1]), 10, 16); perr == nil {
				port = uint16(n)
				found = true
				return errStopWalk
			}
		}
		if !fallbackFound {
			if m := reDefaultPortConst.FindSubmatch(data); m != nil {
				if n, perr := strconv.ParseUint(string(m[1]), 10, 16); perr == nil {
					fallback = uint16(n)
					fallbackFound = true
				}
			}
		}
		return nil
	})
	if walkErr != nil && !errors.Is(walkErr, errStopWalk) {
		return 0, false
	}

	switch {
	case found:
		return port, true
	case fallbackFound:
		return fallback, true
	default:
		return 0, false
	}
}

func findRepoRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	d := wd
	for {
		if _, err := os.Stat(filepath.Join(d, "go.mod")); err == nil {
			return d, nil
		}
		parent := filepath.Dir(d)
		if parent == d {
			return "", fmt.Errorf("go.mod not found above %s", wd)
		}
		d = parent
	}
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}
