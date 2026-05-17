package openlineage

import (
	"testing"
)

func TestDecodeEvent_minimum(t *testing.T) {
	raw := []byte(`{
        "eventType": "COMPLETE",
        "eventTime": "2026-05-17T12:00:00Z",
        "run":  {"runId": "11111111-1111-1111-1111-111111111111"},
        "job":  {"namespace": "etl", "name": "build_b"},
        "inputs":  [{"namespace": "kafka", "name": "a"}],
        "outputs": [{"namespace": "warehouse", "name": "b"}]
    }`)

	ev, err := DecodeEvent(raw)
	if err != nil {
		t.Fatalf("DecodeEvent: %v", err)
	}
	if ev.State() != StateComplete {
		t.Fatalf("State()=%v, want COMPLETE", ev.State())
	}
	if got := ev.Inputs[0].RID(); got != "kafka/a" {
		t.Fatalf("input RID=%q, want kafka/a", got)
	}
	if got := ev.Outputs[0].RID(); got != "warehouse/b" {
		t.Fatalf("output RID=%q, want warehouse/b", got)
	}
	if ev.ParsedEventTime().IsZero() {
		t.Fatalf("ParsedEventTime returned zero on valid RFC3339")
	}
}

func TestDecodeEvent_rejectsMissingRunId(t *testing.T) {
	raw := []byte(`{"eventType":"START","run":{"runId":""},"job":{"namespace":"x","name":"y"}}`)
	if _, err := DecodeEvent(raw); err == nil {
		t.Fatalf("expected error for missing runId")
	}
}

func TestDecodeEvent_rejectsMissingJob(t *testing.T) {
	raw := []byte(`{"eventType":"START","run":{"runId":"r1"},"job":{"namespace":"","name":""}}`)
	if _, err := DecodeEvent(raw); err == nil {
		t.Fatalf("expected error for empty job ns/name")
	}
}

func TestDecodeEvent_unknownEventTypeFallsThroughToOther(t *testing.T) {
	raw := []byte(`{"eventType":"weird","run":{"runId":"r"},"job":{"namespace":"n","name":"j"}}`)
	ev, err := DecodeEvent(raw)
	if err != nil {
		t.Fatalf("DecodeEvent: %v", err)
	}
	if ev.State() != StateOther {
		t.Fatalf("State()=%v, want OTHER", ev.State())
	}
}

func TestStateAliases(t *testing.T) {
	cases := map[string]RunState{
		"START":     StateRunning,
		"RUNNING":   StateRunning,
		"COMPLETE":  StateComplete,
		"SUCCEEDED": StateComplete,
		"FAIL":      StateFailed,
		"FAILED":    StateFailed,
		"ABORT":     StateAborted,
		"ABORTED":   StateAborted,
	}
	for in, want := range cases {
		ev := &RunEvent{EventType: in}
		if got := ev.State(); got != want {
			t.Fatalf("State(%q)=%v, want %v", in, got, want)
		}
	}
}
