package lineage

import (
	"strings"
	"testing"
)

func TestSanitizeDescriptionTrimsAndAcceptsEmpty(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"  Hello world  ", "Hello world", false},
		{"", "", false},
		{"   ", "", false},
		{strings.Repeat("a", MaxNodeDescriptionLen), strings.Repeat("a", MaxNodeDescriptionLen), false},
		{strings.Repeat("a", MaxNodeDescriptionLen+1), "", true},
	}
	for _, tc := range cases {
		got, err := SanitizeDescription(tc.in)
		if (err != nil) != tc.wantErr {
			t.Fatalf("SanitizeDescription(%q) err=%v wantErr=%v", tc.in, err, tc.wantErr)
		}
		if !tc.wantErr && got != tc.want {
			t.Fatalf("SanitizeDescription(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSanitizeDescriptionPreservesInternalWhitespace(t *testing.T) {
	got, err := SanitizeDescription("  line one\n\nline two  ")
	if err != nil {
		t.Fatalf("SanitizeDescription: %v", err)
	}
	if got != "line one\n\nline two" {
		t.Fatalf("internal whitespace not preserved: %q", got)
	}
}
