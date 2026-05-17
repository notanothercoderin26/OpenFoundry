package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestBadFixtureIsFlagged(t *testing.T) {
	hits, err := scanFile(filepath.Join("testdata", "bad.go"))
	if err != nil {
		t.Fatalf("scanFile(bad.go): %v", err)
	}
	if len(hits) == 0 {
		t.Fatalf("expected hits in bad.go, got 0")
	}

	wantFuncs := []string{
		"badSelect",
		"badInsert",
		"badUpdateLowercase",
		"badNestedClosure",
		"badMerge",
		"sneakyCallsUnrelatedValidator",
	}
	if len(hits) != len(wantFuncs) {
		t.Fatalf("expected %d hits in bad.go, got %d: %+v", len(wantFuncs), len(hits), hits)
	}
	for _, h := range hits {
		if !strings.HasSuffix(h.File, "testdata/bad.go") {
			t.Errorf("hit file = %q, want suffix testdata/bad.go", h.File)
		}
		if h.Line <= 0 {
			t.Errorf("hit line = %d, want > 0", h.Line)
		}
	}
}

func TestGoodFixtureIsClean(t *testing.T) {
	hits, err := scanFile(filepath.Join("testdata", "good.go"))
	if err != nil {
		t.Fatalf("scanFile(good.go): %v", err)
	}
	if len(hits) != 0 {
		t.Fatalf("expected good.go to be clean, got %d hits: %+v", len(hits), hits)
	}
}

func TestSQLKeywordDetection(t *testing.T) {
	cases := []struct {
		s    string
		want bool
	}{
		{"SELECT * FROM %s", true},
		{"select * from %s", true},
		{"InSeRt InTo %s VALUES ($1)", true},
		{"UPDATE %s SET", true},
		{"DELETE FROM %s WHERE id = %d", true},
		{"MERGE INTO %s", true},
		{"TRUNCATE %s", true},
		{"DROP TABLE %s", true},
		{"ALTER TABLE %s", true},
		// non-SQL fmt usage
		{"hello %s", false},
		// SQL keyword but no format verb
		{"SELECT 1", false},
		// keyword as substring of another word — must not match
		{"DELETED_VIEW", false},
	}
	for _, tc := range cases {
		got := sqlKeywordRe.MatchString(tc.s) && formatVerbRe.MatchString(tc.s)
		if got != tc.want {
			t.Errorf("detect(%q) = %v, want %v", tc.s, got, tc.want)
		}
	}
}

func TestAllowlistSuppressesHit(t *testing.T) {
	hits, err := scanFile(filepath.Join("testdata", "bad.go"))
	if err != nil {
		t.Fatalf("scanFile: %v", err)
	}
	if len(hits) == 0 {
		t.Fatal("no hits to allowlist")
	}
	allow := map[string]struct{}{hitKey(hits[0]): {}}
	var remaining int
	for _, h := range hits {
		if _, ok := allow[hitKey(h)]; !ok {
			remaining++
		}
	}
	if remaining != len(hits)-1 {
		t.Fatalf("allowlist did not suppress exactly one hit: remaining=%d total=%d", remaining, len(hits))
	}
}
