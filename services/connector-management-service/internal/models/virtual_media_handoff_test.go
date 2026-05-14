package models

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestBuildVirtualMediaHandoffsForSource_SupportedConnector(t *testing.T) {
	sourceID := uuid.New()
	rid := SourceRIDForConnection(sourceID)
	handoffs := BuildVirtualMediaHandoffsForSource(sourceID, rid, "s3")

	if len(handoffs) != 3 {
		t.Fatalf("expected 3 handoffs, got %d", len(handoffs))
	}

	wantModes := map[VirtualMediaHandoffMode]bool{
		VirtualMediaHandoffModeMediaSetSync:      true,
		VirtualMediaHandoffModeExternalTransform: true,
		VirtualMediaHandoffModeRestAPI:           true,
	}
	for _, h := range handoffs {
		if h.Status != "blocked" {
			t.Fatalf("expected status=blocked for %s, got %s", h.ID, h.Status)
		}
		if h.SourceRID != rid {
			t.Fatalf("expected SourceRID=%s, got %s", rid, h.SourceRID)
		}
		if !strings.Contains(h.RegistrationSketch, rid) && h.HandoffMode != VirtualMediaHandoffModeExternalTransform {
			// External transform sketch uses generated binding identifier rather than the raw RID.
			t.Fatalf("expected registration sketch for %s to reference the source RID, got: %s", h.ID, h.RegistrationSketch)
		}
		if h.ConnectorType != "s3" {
			t.Fatalf("expected connector_type=s3, got %s", h.ConnectorType)
		}
		delete(wantModes, h.HandoffMode)
	}
	if len(wantModes) != 0 {
		t.Fatalf("missing handoff modes: %v", wantModes)
	}
}

func TestBuildVirtualMediaHandoffsForSource_UnsupportedConnector(t *testing.T) {
	sourceID := uuid.New()
	handoffs := BuildVirtualMediaHandoffsForSource(sourceID, "", "postgresql")
	if len(handoffs) != 0 {
		t.Fatalf("expected no handoffs for unsupported connector, got %d", len(handoffs))
	}
}

func TestVirtualMediaHandoffsAreBlocked(t *testing.T) {
	if VirtualMediaHandoffsAreBlocked(nil) {
		t.Fatalf("empty list must not report as blocked")
	}
	if VirtualMediaHandoffsAreBlocked([]VirtualMediaHandoff{}) {
		t.Fatalf("empty list must not report as blocked")
	}
	handoffs := BuildVirtualMediaHandoffsForSource(uuid.New(), "", "onelake")
	if !VirtualMediaHandoffsAreBlocked(handoffs) {
		t.Fatalf("expected all blocked")
	}

	// Flip one to available and verify the aggregate flips too.
	handoffs[0].Status = "available"
	if VirtualMediaHandoffsAreBlocked(handoffs) {
		t.Fatalf("mixed status must not report as fully blocked")
	}
}

func TestVirtualMediaHandoffBlockersAndCoverage(t *testing.T) {
	handoffs := BuildVirtualMediaHandoffsForSource(uuid.New(), "", "abfs")
	blockers := VirtualMediaHandoffBlockers(handoffs)
	for _, required := range virtualMediaHandoffBaseBlockers {
		found := false
		for _, b := range blockers {
			if b == required {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing blocker %q in %v", required, blockers)
		}
	}
	// Per-mode blockers must also surface.
	for _, modeSpecific := range []string{
		"media_set_sync_virtual_runtime_contract",
		"external_transform_virtual_item_sdk",
		"external_caller_authentication",
	} {
		found := false
		for _, b := range blockers {
			if b == modeSpecific {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing mode-specific blocker %q in %v", modeSpecific, blockers)
		}
	}

	coverage := VirtualMediaHandoffCoverage(handoffs)
	if len(coverage) != 3 {
		t.Fatalf("expected 3 coverage entries, got %v", coverage)
	}
	wantCoverage := map[string]bool{
		"media_set_sync_virtual": true,
		"external_transform":     true,
		"rest_api":               true,
	}
	for _, c := range coverage {
		delete(wantCoverage, c)
	}
	if len(wantCoverage) != 0 {
		t.Fatalf("missing coverage entries: %v", wantCoverage)
	}
}

func TestBuildVirtualMediaHandoffDescriptor_BlockedReason(t *testing.T) {
	sourceID := uuid.New()
	descriptor := BuildVirtualMediaHandoffDescriptor(sourceID, "", "s3")
	if descriptor.Status != "blocked" {
		t.Fatalf("expected blocked, got %s", descriptor.Status)
	}
	if descriptor.BlockedReason == "" {
		t.Fatalf("blocked descriptor must explain why")
	}
	if !strings.Contains(descriptor.BlockedReason, "MS.18") {
		t.Fatalf("blocked reason should reference the Media Sets checklist, got %q", descriptor.BlockedReason)
	}
	if descriptor.Delegation.Schema == "" {
		t.Fatalf("descriptor must embed the SDC.41 delegation block")
	}

	unsupported := BuildVirtualMediaHandoffDescriptor(uuid.New(), "", "postgresql")
	if unsupported.Status != "not_supported" {
		t.Fatalf("expected not_supported for postgresql, got %s", unsupported.Status)
	}
	if len(unsupported.Handoffs) != 0 {
		t.Fatalf("unsupported descriptor must not carry handoffs")
	}
}
