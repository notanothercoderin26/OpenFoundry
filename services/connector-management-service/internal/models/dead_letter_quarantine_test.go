package models

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestClassifyQuarantineFailure(t *testing.T) {
	cases := []struct {
		err  string
		want QuarantineFailureCategory
	}{
		{"", QuarantineFailureUnknown},
		{"schema validation failed: missing field 'amount'", QuarantineFailureSchemaValidation},
		{"invalid type for field 'created_at'", QuarantineFailureSchemaValidation},
		{"JSON parse error at offset 13", QuarantineFailureSerialization},
		{"malformed avro frame", QuarantineFailureSerialization},
		{"permission denied: marking does not match destination", QuarantineFailurePermissionCheck},
		{"403 Forbidden", QuarantineFailurePermissionCheck},
		{"destination write conflict on dataset", QuarantineFailureDestinationWrite},
		{"sink rejected duplicate key", QuarantineFailureDestinationWrite},
		{"some completely unrelated thing happened", QuarantineFailureUnknown},
	}
	for _, tc := range cases {
		t.Run(tc.err, func(t *testing.T) {
			if got := ClassifyQuarantineFailure(tc.err); got != tc.want {
				t.Fatalf("ClassifyQuarantineFailure(%q) = %s, want %s", tc.err, got, tc.want)
			}
		})
	}
}

func TestValidateDeadLetterSink(t *testing.T) {
	good := UpdateDeadLetterSinkRequest{
		Kind:          DeadLetterSinkKindDataset,
		TargetRID:     "ri.datasets.main.dlq",
		RetentionDays: 14,
		RedactionRules: []DeadLetterRedactionRule{
			{Field: "payload.email", Replacement: "[REDACTED]"},
		},
	}
	if errs := ValidateDeadLetterSink(good); len(errs) != 0 {
		t.Fatalf("expected no errors for valid sink, got %v", errs)
	}

	bad := UpdateDeadLetterSinkRequest{
		Kind:          "table",
		TargetRID:     "not-a-rid",
		RetentionDays: 999,
		RedactionRules: []DeadLetterRedactionRule{
			{Field: "", Replacement: "X"},
			{Field: "x", Replacement: "Y", HashSHA256: true},
		},
	}
	errs := ValidateDeadLetterSink(bad)
	if len(errs) < 4 {
		t.Fatalf("expected multiple validation errors, got %v", errs)
	}
}

func TestApplyDeadLetterRedaction(t *testing.T) {
	payload := map[string]any{
		"id":    "abc",
		"email": "user@example.com",
		"nested": map[string]any{
			"ssn": "111-22-3333",
		},
	}
	headers := map[string]any{
		"Authorization": "Bearer secret-token",
		"Accept":        "application/json",
	}
	rules := []DeadLetterRedactionRule{
		{Field: "email"},
		{Field: "nested.ssn", HashSHA256: true},
		{Field: "header.Authorization", Replacement: "[REDACTED]"},
	}
	redactedPayload, redactedHeaders := ApplyDeadLetterRedaction(payload, headers, rules)
	if redactedPayload["email"] != "[REDACTED]" {
		t.Fatalf("expected default redaction for email, got %v", redactedPayload["email"])
	}
	nested := redactedPayload["nested"].(map[string]any)
	if nested["ssn"] != "sha256:[hashed]" {
		t.Fatalf("expected hashed ssn, got %v", nested["ssn"])
	}
	// Original payload remains untouched.
	if payload["email"] != "user@example.com" {
		t.Fatalf("input payload must not be mutated")
	}
	if redactedHeaders["Authorization"] != "[REDACTED]" {
		t.Fatalf("expected auth header redacted")
	}
	if redactedHeaders["Accept"] != "application/json" {
		t.Fatalf("non-targeted headers must survive")
	}
}

func TestBuildQuarantineSummary(t *testing.T) {
	syncID := uuid.New()
	now := time.Now().UTC()
	records := []QuarantinedRecord{
		{
			ID: uuid.New(), SyncDefID: syncID,
			FailureCategory: QuarantineFailureSchemaValidation,
			RecordedAt:      now.Add(-2 * time.Hour),
			ExpiresAt:       now.Add(24 * time.Hour),
		},
		{
			ID: uuid.New(), SyncDefID: syncID,
			FailureCategory: QuarantineFailureSchemaValidation,
			RecordedAt:      now.Add(-1 * time.Hour),
			ExpiresAt:       now.Add(48 * time.Hour),
		},
		{
			ID: uuid.New(), SyncDefID: syncID,
			FailureCategory: QuarantineFailureDestinationWrite,
			RecordedAt:      now,
			ExpiresAt:       now.Add(72 * time.Hour),
		},
	}
	summary := BuildQuarantineSummary(syncID, records)
	if summary.Total != 3 {
		t.Fatalf("Total: got %d, want 3", summary.Total)
	}
	if summary.ByCategory[QuarantineFailureSchemaValidation] != 2 {
		t.Fatalf("schema_validation: got %d, want 2", summary.ByCategory[QuarantineFailureSchemaValidation])
	}
	if summary.ByCategory[QuarantineFailureDestinationWrite] != 1 {
		t.Fatalf("destination_write: got %d, want 1", summary.ByCategory[QuarantineFailureDestinationWrite])
	}
	if summary.Earliest == nil || !summary.Earliest.Equal(records[0].RecordedAt) {
		t.Fatalf("earliest should be oldest record, got %v", summary.Earliest)
	}
	if summary.Latest == nil || !summary.Latest.Equal(records[2].RecordedAt) {
		t.Fatalf("latest should be newest record, got %v", summary.Latest)
	}
	if summary.NextExpiry == nil || !summary.NextExpiry.Equal(records[0].ExpiresAt) {
		t.Fatalf("next_expiry should match shortest retention, got %v", summary.NextExpiry)
	}
}

func TestBuildQuarantineReplayPlan(t *testing.T) {
	syncID := uuid.New()
	now := time.Now().UTC()
	recordIDs := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	records := []QuarantinedRecord{
		{ID: recordIDs[0], SyncDefID: syncID, ExpiresAt: now.Add(24 * time.Hour)},
		{ID: recordIDs[1], SyncDefID: syncID, ExpiresAt: now.Add(-1 * time.Hour)}, // expired
		{ID: recordIDs[2], SyncDefID: syncID, ExpiresAt: now.Add(48 * time.Hour)},
	}
	plan := BuildQuarantineReplayPlan(syncID, records, []uuid.UUID{recordIDs[0], recordIDs[1], recordIDs[2]}, now)
	if plan.RecordsMatched != 2 {
		t.Fatalf("RecordsMatched: got %d, want 2", plan.RecordsMatched)
	}
	if plan.RecordsExpired != 1 || len(plan.ExpiredIDs) != 1 {
		t.Fatalf("RecordsExpired/ExpiredIDs unexpected: %+v", plan)
	}
	if !plan.RequiresFix {
		t.Fatalf("expired records should mark RequiresFix true")
	}
	found := false
	for _, reason := range plan.BlockingReasons {
		if reason == "quarantine_replay_expired_records" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected expired-records blocking reason, got %v", plan.BlockingReasons)
	}

	empty := BuildQuarantineReplayPlan(syncID, records, nil, now)
	if !empty.RequiresFix {
		t.Fatalf("empty replay request should require fix")
	}
	containsNoRecords := false
	for _, reason := range empty.BlockingReasons {
		if reason == "quarantine_replay_no_records" {
			containsNoRecords = true
		}
	}
	if !containsNoRecords {
		t.Fatalf("expected no_records blocker, got %v", empty.BlockingReasons)
	}
}

func TestQuarantineExpiryFor(t *testing.T) {
	recordedAt := time.Date(2026, 5, 14, 12, 0, 0, 0, time.UTC)
	sink := DeadLetterSink{RetentionDays: 7}
	exp := QuarantineExpiryFor(sink, recordedAt)
	if !exp.Equal(recordedAt.Add(7 * 24 * time.Hour)) {
		t.Fatalf("retention math wrong: got %v", exp)
	}

	zeroSink := DeadLetterSink{RetentionDays: 0}
	if !QuarantineExpiryFor(zeroSink, recordedAt).Equal(recordedAt.Add(14 * 24 * time.Hour)) {
		t.Fatalf("zero retention should fall back to 14 days")
	}
}
