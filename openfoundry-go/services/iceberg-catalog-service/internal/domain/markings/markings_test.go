package markings

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

func TestTableMarkingsSerialiseWithThreeBuckets(t *testing.T) {
	t.Parallel()
	proj := []MarkingProjection{{MarkingID: uuid.Nil, Name: "public", Description: "Public"}}
	payload := TableMarkings{Effective: proj, Explicit: proj, InheritedFromNamespace: nil}
	out, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var view map[string]any
	if err := json.Unmarshal(out, &view); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, k := range []string{"effective", "explicit", "inherited_from_namespace"} {
		if _, ok := view[k]; !ok {
			t.Fatalf("missing key %q in %s", k, string(out))
		}
	}
}

func TestNamesPreservesOrder(t *testing.T) {
	t.Parallel()
	items := []MarkingProjection{
		{Name: "public"},
		{Name: "confidential"},
	}
	got := Names(items)
	if len(got) != 2 || got[0] != "public" || got[1] != "confidential" {
		t.Fatalf("unexpected order: %v", got)
	}
}
