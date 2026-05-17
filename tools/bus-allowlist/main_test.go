package main

import "testing"

func TestNormalize_BusPrefixes(t *testing.T) {
	cases := []struct {
		in        string
		want      string
		recognised bool
	}{
		{"audit.events.v1", "audit.events.v1", true},
		{"saga.step.requested.v1", "saga.step.requested.v1", true},
		{"of.audit.gateway", "of.audit.gateway", true},
		{"lineage.events", "lineage.events", true},
		{"lineage.events.v1", "lineage.events.v1", true},
		{"openfoundry.streams.%s", "openfoundry.streams.*", true},
		{"ontology-indexer.dlq.v1", "ontology-indexer.dlq.v1", true},
		{"foundry.global.branch.promote.requested.v1", "foundry.global.branch.promote.requested.v1", true},

		// Not bus-domain — should be ignored.
		{"openfoundry.workshop.widget_catalog.v1", "", false},
		{"openfoundry.example", "", false},
		{"dataset.read", "", false},
		{"audit.gateway.request.forwarded", "", false},
		{"foundry.example.com", "", false},
		{"http://example.com/of.audit", "", false},
		{"audit.3", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, ok := normalize(tc.in)
			if ok != tc.recognised {
				t.Fatalf("normalize(%q) ok = %v, want %v (value=%q)", tc.in, ok, tc.recognised, got)
			}
			if ok && got != tc.want {
				t.Fatalf("normalize(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestGlobMatch(t *testing.T) {
	cases := []struct {
		pattern, s string
		want       bool
	}{
		{"audit.events.v1", "audit.events.v1", true},
		{"audit.events.v1", "audit.events.v2", false},
		{"openfoundry.streams.*", "openfoundry.streams.abc-123", true},
		{"openfoundry.streams.*", "openfoundry.streams.", true},
		{"openfoundry.streams.*", "openfoundry.streamsx", false},
		{"saga.*.v1", "saga.completed.v1", true},
		{"saga.*.v1", "saga.step.completed.v1", true},
		{"saga.*.v1", "saga.completed.v2", false},
	}
	for _, tc := range cases {
		t.Run(tc.pattern+"|"+tc.s, func(t *testing.T) {
			if got := globMatch(tc.pattern, tc.s); got != tc.want {
				t.Fatalf("globMatch(%q,%q) = %v, want %v", tc.pattern, tc.s, got, tc.want)
			}
		})
	}
}

func TestCompare_DetectsUnlistedAndStale(t *testing.T) {
	allow := &allowlist{
		Version: 1,
		Services: map[string]serviceEntry{
			"a-svc": {Topics: []string{"audit.events.v1"}},
			"b-svc": {Topics: []string{"saga.step.requested.v1"}}, // stale
		},
	}
	usage := map[string]map[string][]location{
		"a-svc": {
			"audit.events.v1": {{file: "a.go", line: 1}},
			"saga.aborted.v1": {{file: "a.go", line: 2}}, // not allowlisted
		},
	}

	violations, stale := compare(allow, usage)

	if len(violations) != 1 || violations[0].topic != "saga.aborted.v1" || violations[0].service != "a-svc" {
		t.Fatalf("expected 1 violation for a-svc saga.aborted.v1, got %+v", violations)
	}
	if len(stale) != 1 || stale[0].service != "b-svc" || stale[0].topic != "saga.step.requested.v1" {
		t.Fatalf("expected stale b-svc saga.step.requested.v1, got %+v", stale)
	}
}
