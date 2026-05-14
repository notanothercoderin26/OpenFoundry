package models

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestBuildListenerInboundCapabilities_CoversAllFourFacets(t *testing.T) {
	caps := BuildListenerInboundCapabilities()
	if len(caps) != 4 {
		t.Fatalf("expected 4 capabilities, got %d", len(caps))
	}
	wantFacets := map[ListenerInboundFacet]bool{
		ListenerInboundFacetSchemaMapping:     true,
		ListenerInboundFacetAuthStrategy:      true,
		ListenerInboundFacetReplayIdempotency: true,
		ListenerInboundFacetDeadLetter:        true,
	}
	for _, c := range caps {
		delete(wantFacets, c.Facet)
		if c.Status != "blocked" && c.Status != "partial" && c.Status != "available" {
			t.Fatalf("unexpected status %q for %s", c.Status, c.ID)
		}
		for _, blocker := range ListenerInboundBaseBlockers() {
			found := false
			for _, b := range c.Blockers {
				if b == blocker {
					found = true
					break
				}
			}
			if !found {
				t.Fatalf("capability %s missing base blocker %q", c.ID, blocker)
			}
		}
		if c.ConfigurationSketch == "" {
			t.Fatalf("capability %s must include a configuration sketch", c.ID)
		}
	}
	if len(wantFacets) != 0 {
		t.Fatalf("missing facets: %v", wantFacets)
	}
}

func TestListenerInboundPartialStatus(t *testing.T) {
	caps := BuildListenerInboundCapabilities()
	statuses := map[ListenerInboundFacet]string{}
	for _, c := range caps {
		statuses[c.Facet] = c.Status
	}
	if statuses[ListenerInboundFacetAuthStrategy] != "partial" {
		t.Fatalf("auth strategy should be partial because HMAC/shared-secret already work, got %s", statuses[ListenerInboundFacetAuthStrategy])
	}
	if statuses[ListenerInboundFacetReplayIdempotency] != "partial" {
		t.Fatalf("replay/idempotency should be partial because key extraction exists, got %s", statuses[ListenerInboundFacetReplayIdempotency])
	}
	if statuses[ListenerInboundFacetSchemaMapping] != "blocked" {
		t.Fatalf("schema mapping should be blocked, got %s", statuses[ListenerInboundFacetSchemaMapping])
	}
	if statuses[ListenerInboundFacetDeadLetter] != "blocked" {
		t.Fatalf("dead letter should be blocked, got %s", statuses[ListenerInboundFacetDeadLetter])
	}
}

func TestAggregateListenerInboundStatus(t *testing.T) {
	caps := BuildListenerInboundCapabilities()
	if got := AggregateListenerInboundStatus(caps); got != "blocked" {
		t.Fatalf("expected blocked aggregate (some facets blocked), got %s", got)
	}

	all := caps
	for i := range all {
		all[i].Status = "available"
	}
	if got := AggregateListenerInboundStatus(all); got != "available" {
		t.Fatalf("expected available when every facet is available, got %s", got)
	}

	for i := range all {
		all[i].Status = "partial"
	}
	if got := AggregateListenerInboundStatus(all); got != "partial" {
		t.Fatalf("expected partial when every facet is partial, got %s", got)
	}

	if got := AggregateListenerInboundStatus(nil); got != "blocked" {
		t.Fatalf("empty list must aggregate to blocked, got %s", got)
	}
}

func TestListenerInboundBlockersAndCoverage(t *testing.T) {
	caps := BuildListenerInboundCapabilities()
	blockers := ListenerInboundBlockers(caps)
	for _, base := range ListenerInboundBaseBlockers() {
		found := false
		for _, b := range blockers {
			if b == base {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing base blocker %q in %v", base, blockers)
		}
	}
	// Per-facet blockers must appear too.
	for _, marker := range []string{
		"schema_mapping_pipeline",
		"oauth2_listener_token_exchange",
		"listener_dedupe_window",
		"dead_letter_sink_definition",
	} {
		found := false
		for _, b := range blockers {
			if b == marker {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing facet-specific blocker %q in %v", marker, blockers)
		}
	}

	coverage := ListenerInboundCoverage(caps)
	if len(coverage) != 4 {
		t.Fatalf("expected 4 coverage entries, got %v", coverage)
	}
}

func TestBuildListenerInboundDescriptor(t *testing.T) {
	sourceID := uuid.New()
	sourceRID := SourceRIDForConnection(sourceID)
	descriptor := BuildListenerInboundDescriptor(sourceID, sourceRID, "rest_api_source")

	if descriptor.Status != "blocked" {
		t.Fatalf("aggregate status should be blocked, got %s", descriptor.Status)
	}
	if descriptor.BlockedReason == "" {
		t.Fatalf("blocked reason should not be empty")
	}
	if !strings.Contains(descriptor.BlockedReason, "schema mapping") {
		t.Fatalf("blocked reason should reference schema mapping, got %q", descriptor.BlockedReason)
	}
	if descriptor.Recommendation.Kind != "listener" {
		t.Fatalf("recommendation kind should be listener, got %s", descriptor.Recommendation.Kind)
	}
	if descriptor.MaxPayloadBytes != DefaultInboundListenerMaxPayloadBytes {
		t.Fatalf("max payload bytes should mirror the default, got %d", descriptor.MaxPayloadBytes)
	}
	if len(descriptor.SupportedAuthModes) == 0 {
		t.Fatalf("supported auth modes must not be empty")
	}
	if len(descriptor.AvailableSurfaces) == 0 {
		t.Fatalf("available surfaces must enumerate at least one route")
	}
	wantSurface := "POST /api/v1/listeners/{id}/events"
	found := false
	for _, surface := range descriptor.AvailableSurfaces {
		if surface == wantSurface {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected available surfaces to contain %q, got %v", wantSurface, descriptor.AvailableSurfaces)
	}
	if descriptor.SourceRID != sourceRID {
		t.Fatalf("source RID should round-trip: got %s, want %s", descriptor.SourceRID, sourceRID)
	}
}
