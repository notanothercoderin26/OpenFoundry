package workspace

import (
	"testing"
	"time"
)

func TestResourceSearchEntryNormalizeCMP7(t *testing.T) {
	entry := ResourceSearchEntry{
		ResourceRID:      " ri.compass.main.folder.018f3f3f-2ccf-7b1a-9e1b-7246dfe8c111 ",
		ResourceType:     " folder ",
		OrganizationRIDs: []string{" org-a ", "", "org-a", "org-b"},
		MarkingRIDs:      []string{"mark-a", " mark-a "},
		Tags:             nil,
	}

	entry.Normalize()

	if entry.ResourceRID != "ri.compass.main.folder.018f3f3f-2ccf-7b1a-9e1b-7246dfe8c111" {
		t.Fatalf("unexpected resource rid: %q", entry.ResourceRID)
	}
	if entry.ResourceType != "folder" {
		t.Fatalf("unexpected resource type: %q", entry.ResourceType)
	}
	if entry.DisplayName != entry.ResourceRID {
		t.Fatalf("display name should fall back to RID, got %q", entry.DisplayName)
	}
	if entry.OpenURL != "/resources/"+entry.ResourceRID {
		t.Fatalf("open URL should fall back to RID route, got %q", entry.OpenURL)
	}
	if got := len(entry.OrganizationRIDs); got != 2 {
		t.Fatalf("expected 2 deduplicated organizations, got %d: %#v", got, entry.OrganizationRIDs)
	}
	if got := len(entry.MarkingRIDs); got != 1 {
		t.Fatalf("expected 1 deduplicated marking, got %d: %#v", got, entry.MarkingRIDs)
	}
	if entry.Tags == nil {
		t.Fatal("tags must normalize to an empty slice, not nil")
	}
	if entry.LastModifiedAt.IsZero() || time.Since(entry.LastModifiedAt) > time.Minute {
		t.Fatalf("last_modified_at should be initialized near now, got %s", entry.LastModifiedAt)
	}
}

func TestDecodeStringArrayJSONCMP7(t *testing.T) {
	got := decodeStringArrayJSON([]byte(`["tag-a"," tag-a ","","tag-b"]`))
	if len(got) != 2 || got[0] != "tag-a" || got[1] != "tag-b" {
		t.Fatalf("unexpected decoded tags: %#v", got)
	}

	if got := decodeStringArrayJSON([]byte(`{"not":"an array"}`)); len(got) != 0 {
		t.Fatalf("invalid JSON shape should decode as empty slice, got %#v", got)
	}
}
