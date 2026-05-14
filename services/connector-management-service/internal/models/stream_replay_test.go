package models

import (
	"strings"
	"testing"
	"time"
)

func ptrInt64(v int64) *int64 { return &v }

func TestBuildStreamReplayPlan_ReadyWhenNoDownstreams(t *testing.T) {
	plan := BuildStreamReplayPlan(StreamReplayPlanRequest{
		StreamID:   "stream-1",
		Reason:     "Drain after schema fix",
		FromOffset: ptrInt64(100),
		ToOffset:   ptrInt64(200),
		ComputedAt: time.Date(2026, 5, 14, 12, 0, 0, 0, time.UTC),
	})
	if plan.Status != "ready" {
		t.Fatalf("expected ready, got %s", plan.Status)
	}
	if plan.ConfirmationRequired {
		t.Fatalf("no downstreams should not require confirmation")
	}
	if plan.EstimatedRecords == nil || *plan.EstimatedRecords != 101 {
		t.Fatalf("estimated records should be 101 (inclusive), got %+v", plan.EstimatedRecords)
	}
}

func TestBuildStreamReplayPlan_BlockedWhenReasonMissing(t *testing.T) {
	plan := BuildStreamReplayPlan(StreamReplayPlanRequest{StreamID: "stream-1"})
	if plan.Status != "blocked" {
		t.Fatalf("expected blocked, got %s", plan.Status)
	}
	found := false
	for _, blocker := range plan.PreconditionsBlocking {
		if blocker == "replay_reason_required" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected replay_reason_required, got %v", plan.PreconditionsBlocking)
	}
}

func TestBuildStreamReplayPlan_OffsetValidation(t *testing.T) {
	earliest := int64(50)
	latest := int64(500)
	plan := BuildStreamReplayPlan(StreamReplayPlanRequest{
		StreamID:       "stream-1",
		Reason:         "fix",
		FromOffset:     ptrInt64(40),  // before earliest
		ToOffset:       ptrInt64(600), // after latest
		EarliestOffset: &earliest,
		LatestOffset:   &latest,
	})
	if plan.Status != "blocked" {
		t.Fatalf("expected blocked, got %s", plan.Status)
	}
	wantBlockers := map[string]bool{
		"replay_from_offset_before_earliest": true,
		"replay_to_offset_after_latest":      true,
	}
	for _, b := range plan.PreconditionsBlocking {
		delete(wantBlockers, b)
	}
	if len(wantBlockers) != 0 {
		t.Fatalf("missing offset blockers: %v", wantBlockers)
	}

	inverted := BuildStreamReplayPlan(StreamReplayPlanRequest{
		StreamID:   "stream-1",
		Reason:     "fix",
		FromOffset: ptrInt64(100),
		ToOffset:   ptrInt64(50),
	})
	hasInverted := false
	for _, b := range inverted.PreconditionsBlocking {
		if b == "replay_offsets_inverted" {
			hasInverted = true
		}
	}
	if !hasInverted {
		t.Fatalf("inverted offsets should be blocking, got %v", inverted.PreconditionsBlocking)
	}
}

func TestBuildStreamReplayPlan_ActiveExportRequiresAck(t *testing.T) {
	plan := BuildStreamReplayPlan(StreamReplayPlanRequest{
		StreamID: "stream-1",
		Reason:   "drain replay",
		Exports: []StreamReplayActiveExport{
			{ExportID: "exp-1", ExportName: "to-warehouse", Status: "running", ReplayBehavior: "export_replayed_records"},
		},
	})
	if plan.Status != "blocked" {
		t.Fatalf("active running export with no ack should block, got %s", plan.Status)
	}
	if !plan.ConfirmationRequired {
		t.Fatalf("expected confirmation required for active export")
	}
	if len(plan.AcknowledgementsMissing) != 1 || plan.AcknowledgementsMissing[0] != "ack_streaming_export_exp-1" {
		t.Fatalf("expected one missing ack, got %v", plan.AcknowledgementsMissing)
	}
	if len(plan.Impacts) != 1 || plan.Impacts[0].Severity != StreamReplayImpactSeverityBlock {
		t.Fatalf("expected one block impact, got %+v", plan.Impacts)
	}

	// Pass the ack and re-plan.
	planWithAck := BuildStreamReplayPlan(StreamReplayPlanRequest{
		StreamID: "stream-1",
		Reason:   "drain replay",
		Exports: []StreamReplayActiveExport{
			{ExportID: "exp-1", Status: "running"},
		},
		Acknowledgements: []string{"ack_streaming_export_exp-1"},
	})
	if planWithAck.Status != "ready" {
		t.Fatalf("expected ready after ack, got %s", planWithAck.Status)
	}
	if len(planWithAck.AcknowledgementsSatisfied) != 1 {
		t.Fatalf("expected satisfied ack, got %v", planWithAck.AcknowledgementsSatisfied)
	}
}

func TestBuildStreamReplayPlan_StoppedExportIsWarning(t *testing.T) {
	plan := BuildStreamReplayPlan(StreamReplayPlanRequest{
		StreamID: "stream-1",
		Reason:   "drain replay",
		Exports: []StreamReplayActiveExport{
			{ExportID: "exp-stopped", Status: "stopped", ReplayBehavior: "export_replayed_records"},
		},
	})
	if plan.Status != "requires_confirmation" {
		t.Fatalf("stopped export should require confirmation but not block, got %s", plan.Status)
	}
	if plan.Impacts[0].Severity != StreamReplayImpactSeverityWarn {
		t.Fatalf("stopped export should be warn, got %s", plan.Impacts[0].Severity)
	}
}

func TestBuildStreamReplayPlan_CDCViewWithoutOrderingBlocks(t *testing.T) {
	plan := BuildStreamReplayPlan(StreamReplayPlanRequest{
		StreamID: "stream-1",
		Reason:   "fix",
		CDCViews: []StreamReplayCDCView{
			{ViewID: "view-1", ViewName: "orders_current"},
		},
	})
	if plan.Status != "blocked" {
		t.Fatalf("CDC view without ordering must block, got %s", plan.Status)
	}
	if !strings.Contains(plan.Impacts[0].Implication, "ordering column") {
		t.Fatalf("expected ordering column language, got %q", plan.Impacts[0].Implication)
	}
}

func TestBuildStreamReplayPlan_DuplicateTolerantConsumerIsInfo(t *testing.T) {
	plan := BuildStreamReplayPlan(StreamReplayPlanRequest{
		StreamID: "stream-1",
		Reason:   "fix",
		Consumers: []StreamReplayConsumer{
			{ConsumerID: "c1", IdempotencyMode: "duplicate_tolerant"},
			{ConsumerID: "c2", IdempotencyMode: "unknown"},
		},
	})
	infoCount := 0
	warnCount := 0
	for _, impact := range plan.Impacts {
		switch impact.Severity {
		case StreamReplayImpactSeverityInfo:
			infoCount++
		case StreamReplayImpactSeverityWarn:
			warnCount++
		}
	}
	if infoCount != 1 || warnCount != 1 {
		t.Fatalf("expected 1 info + 1 warn consumer impact, got info=%d warn=%d", infoCount, warnCount)
	}
	if plan.Status != "requires_confirmation" {
		t.Fatalf("non-duplicate-tolerant consumer should require confirmation, got %s", plan.Status)
	}
}

func TestSortStreamReplayImpactsBySeverity(t *testing.T) {
	impacts := []StreamReplayDownstreamImpact{
		{Severity: StreamReplayImpactSeverityInfo},
		{Severity: StreamReplayImpactSeverityBlock},
		{Severity: StreamReplayImpactSeverityWarn},
	}
	sorted := SortStreamReplayImpactsBySeverity(impacts)
	if sorted[0].Severity != StreamReplayImpactSeverityBlock ||
		sorted[1].Severity != StreamReplayImpactSeverityWarn ||
		sorted[2].Severity != StreamReplayImpactSeverityInfo {
		t.Fatalf("unexpected order: %+v", sorted)
	}
}
