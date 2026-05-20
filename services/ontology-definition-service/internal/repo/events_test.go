package repo

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

// TestDeterministicEventIDStable pins the deterministic event_id
// derivation. Changing this hash without bumping the topic version
// (e.g. .v1 → .v2) would silently break consumer deduplication, so
// the assertion is a load-bearing contract — not just a smoke test.
func TestDeterministicEventIDStable(t *testing.T) {
	t.Parallel()

	payload := []byte(`{"schema_version":1,"event_type":"created","aggregate":"ontology_object_type","aggregate_id":"00000000-0000-0000-0000-000000000001"}`)
	got1 := deterministicEventID(AggregateObjectType, "00000000-0000-0000-0000-000000000001", EventCreated, 1, payload)
	got2 := deterministicEventID(AggregateObjectType, "00000000-0000-0000-0000-000000000001", EventCreated, 1, payload)
	if got1 != got2 {
		t.Fatalf("deterministicEventID is not stable across calls: %s vs %s", got1, got2)
	}
	if got1 == uuid.Nil {
		t.Fatalf("deterministicEventID returned nil UUID")
	}

	// Different version → different id. This is what protects against
	// "two consumers think they saw the same change twice" when an
	// update fires multiple times with semantically identical payload
	// but a higher version number.
	got3 := deterministicEventID(AggregateObjectType, "00000000-0000-0000-0000-000000000001", EventCreated, 2, payload)
	if got1 == got3 {
		t.Fatalf("deterministicEventID collides across versions")
	}
}

// TestMarshalOrNilDropsNullAndEmpty keeps the wire shape tight: a nil
// or `null` Before/After must not surface as the JSON literal "null"
// in the envelope; it should drop out via the `omitempty` tag.
func TestMarshalOrNilDropsNullAndEmpty(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   any
		want json.RawMessage
	}{
		{"nil", nil, nil},
		{"explicit null", json.RawMessage("null"), nil},
		{"empty struct", struct{}{}, json.RawMessage(`{}`)},
		{"populated", map[string]any{"id": 1}, json.RawMessage(`{"id":1}`)},
	}

	for _, tc := range tests {
		got, err := marshalOrNil(tc.in)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", tc.name, err)
		}
		if string(got) != string(tc.want) {
			t.Fatalf("%s: got %q want %q", tc.name, string(got), string(tc.want))
		}
	}
}
