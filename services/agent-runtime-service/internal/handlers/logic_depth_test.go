package handlers

import (
	"testing"

	"github.com/openfoundry/openfoundry-go/services/agent-runtime-service/internal/react"
)

func TestParseLogicDepthHeader(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		raw      string
		want     int
		wantErr  bool
	}{
		{"empty header means top-level call", "", 0, false},
		{"valid positive depth", "2", 2, false},
		{"trimmed whitespace", "  3  ", 3, false},
		{"non-numeric rejected", "abc", 0, true},
		{"negative rejected", "-1", 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseLogicDepthHeader(tc.raw)
			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error for %q", tc.raw)
				}
				return
			}
			if err != nil {
				t.Errorf("%q: unexpected error %v", tc.raw, err)
			}
			if got != tc.want {
				t.Errorf("%q: got %d, want %d", tc.raw, got, tc.want)
			}
		})
	}
}

func TestLogicDepth_CapMatchesRouter(t *testing.T) {
	t.Parallel()
	// The handler rejects depth >= MaxLogicInvocationDepth and the
	// router rejects when depth >= MaxLogicInvocationDepth before
	// incrementing — keep the two ends in sync.
	if react.MaxLogicInvocationDepth < 2 {
		t.Errorf("MaxLogicInvocationDepth=%d too low to allow any nesting", react.MaxLogicInvocationDepth)
	}
}
