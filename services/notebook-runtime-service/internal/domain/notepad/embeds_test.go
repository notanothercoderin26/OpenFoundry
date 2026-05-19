package notepad

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

func TestMockResolverReturnsObjectCardForOntologyRef(t *testing.T) {
	t.Parallel()
	r := NewMockWidgetResolver()
	r.Now = func() time.Time { return time.Date(2026, 5, 19, 12, 0, 0, 0, time.UTC) }

	preview, err := r.Resolve(context.Background(), models.NotepadEmbedResolveRequest{
		Kind: models.NotepadEmbedObjectCard,
		Ref:  "rid.pipeline.sales-q1",
	})
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if preview.Kind != models.NotepadEmbedObjectCard {
		t.Fatalf("kind drift: %s", preview.Kind)
	}
	if !strings.Contains(preview.Title, "rid.pipeline.sales-q1") {
		t.Fatalf("expected ref echoed in title; got %q", preview.Title)
	}
	if fieldValue(preview.Fields, "Type") != "Pipeline" {
		t.Fatalf("expected type heuristic to detect Pipeline; got %q", fieldValue(preview.Fields, "Type"))
	}
}

func TestMockResolverRejectsEmptyRef(t *testing.T) {
	t.Parallel()
	r := NewMockWidgetResolver()
	_, err := r.Resolve(context.Background(), models.NotepadEmbedResolveRequest{Kind: models.NotepadEmbedObjectCard})
	if !errors.Is(err, ErrEmbedRefRequired) {
		t.Fatalf("expected ErrEmbedRefRequired, got %v", err)
	}
}

func TestMockResolverRejectsUnknownKind(t *testing.T) {
	t.Parallel()
	r := NewMockWidgetResolver()
	_, err := r.Resolve(context.Background(), models.NotepadEmbedResolveRequest{Kind: "barchart", Ref: "x"})
	if !errors.Is(err, ErrUnsupportedEmbedKind) {
		t.Fatalf("expected ErrUnsupportedEmbedKind, got %v", err)
	}
}

func TestMockResolverIsDeterministic(t *testing.T) {
	t.Parallel()
	r := NewMockWidgetResolver()
	r.Now = func() time.Time { return time.Date(2026, 5, 19, 12, 0, 0, 0, time.UTC) }

	first, err := r.Resolve(context.Background(), models.NotepadEmbedResolveRequest{Kind: models.NotepadEmbedContourChart, Ref: "board-42"})
	if err != nil {
		t.Fatalf("first resolve: %v", err)
	}
	second, err := r.Resolve(context.Background(), models.NotepadEmbedResolveRequest{Kind: models.NotepadEmbedContourChart, Ref: "board-42"})
	if err != nil {
		t.Fatalf("second resolve: %v", err)
	}
	if first.Title != second.Title || first.Subtitle != second.Subtitle || len(first.Fields) != len(second.Fields) {
		t.Fatalf("mock resolver not deterministic: first=%+v second=%+v", first, second)
	}
}

func TestEncodeDecodeEmbedSnapshotRoundTrip(t *testing.T) {
	t.Parallel()
	preview := models.NotepadEmbedPreview{
		Kind:    models.NotepadEmbedQuiverChart,
		Ref:     "chart-99",
		Title:   "Quiver · chart-99",
		Status:  "live",
		Fields:  []models.NotepadEmbedField{{Label: "Series", Value: "3"}},
		FetchedAt: time.Date(2026, 5, 19, 12, 0, 0, 0, time.UTC),
	}
	encoded, err := EncodeEmbedSnapshot(preview)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	decoded, ok := DecodeEmbedSnapshot(encoded)
	if !ok {
		t.Fatalf("decode said not ok")
	}
	if decoded.Title != preview.Title || decoded.Ref != preview.Ref || decoded.Kind != preview.Kind {
		t.Fatalf("round-trip drift: %+v", decoded)
	}
	if len(decoded.Fields) != 1 || decoded.Fields[0].Label != "Series" || decoded.Fields[0].Value != "3" {
		t.Fatalf("fields lost in round trip: %+v", decoded.Fields)
	}
}

func TestDecodeEmbedSnapshotEmptyReturnsFalse(t *testing.T) {
	t.Parallel()
	if _, ok := DecodeEmbedSnapshot(""); ok {
		t.Fatalf("expected ok=false for empty input")
	}
	if _, ok := DecodeEmbedSnapshot("not-base64!"); ok {
		t.Fatalf("expected ok=false for invalid base64")
	}
}

func TestSanitizeKeepsEmbedWrapper(t *testing.T) {
	t.Parallel()
	in := `<div class="of-embed of-embed-object_card" data-kind="object_card" data-ref="rid-1" data-snapshot="eyJraW5kIjoib2JqZWN0X2NhcmQifQ==">` +
		`<div class="of-embed-header"><div class="of-embed-kind">Object Card</div><h4 class="of-embed-title">Item</h4></div>` +
		`<table class="of-embed-fields"><tbody><tr><th>Id</th><td>rid-1</td></tr></tbody></table></div>`
	out := Sanitize(in)
	for _, fp := range []string{`class="of-embed`, `data-kind="object_card"`, `data-ref="rid-1"`, `data-snapshot=`, `<h4 class="of-embed-title">Item</h4>`, `<td>rid-1</td>`} {
		if !strings.Contains(out, fp) {
			t.Fatalf("sanitizer stripped %q; got: %s", fp, out)
		}
	}
}

func TestRenderDOCXIncludesEmbedFields(t *testing.T) {
	t.Parallel()
	// The frontend renderHTML emits this structure for an Object
	// Card embed. We verify the DOCX writer flattens the embed
	// table + headings naturally — no special-case path is needed.
	body := `<div class="of-embed" data-kind="object_card" data-ref="rid-1">` +
		`<div class="of-embed-header"><div class="of-embed-kind">Object Card</div><h4 class="of-embed-title">Pipeline · sales</h4><p class="of-embed-summary">Live ontology snapshot.</p></div>` +
		`<table class="of-embed-fields"><tbody>` +
		`<tr><th>Object Id</th><td>rid-1</td></tr>` +
		`<tr><th>Type</th><td>Pipeline</td></tr>` +
		`</tbody></table></div>`
	out, err := RenderDOCX("Embed export", "", body)
	if err != nil {
		t.Fatalf("RenderDOCX: %v", err)
	}
	doc := readDocumentXML(t, out)
	for _, fp := range []string{
		`<w:tbl>`,
		`Object Card`,
		`Pipeline · sales`,
		`Object Id`,
		`rid-1`,
		`Live ontology snapshot.`,
	} {
		if !strings.Contains(doc, fp) {
			t.Fatalf("expected %q in DOCX; got:\n%s", fp, doc)
		}
	}
}

func fieldValue(fields []models.NotepadEmbedField, label string) string {
	for _, f := range fields {
		if f.Label == label {
			return f.Value
		}
	}
	return ""
}
