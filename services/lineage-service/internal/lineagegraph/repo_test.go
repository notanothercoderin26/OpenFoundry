package lineagegraph

import "testing"

func TestClampDepth(t *testing.T) {
	cases := []struct {
		in, want int
	}{
		{-1, 1},
		{0, 1},
		{1, 1},
		{3, 3},
		{MaxBFSDepth, MaxBFSDepth},
		{MaxBFSDepth + 1, MaxBFSDepth},
		{1000, MaxBFSDepth},
	}
	for _, tc := range cases {
		if got := ClampDepth(tc.in); got != tc.want {
			t.Fatalf("ClampDepth(%d)=%d, want %d", tc.in, got, tc.want)
		}
	}
}
