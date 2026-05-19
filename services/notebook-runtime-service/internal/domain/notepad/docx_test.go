package notepad

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"
)

func readDocumentXML(t *testing.T, b []byte) string {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		t.Fatalf("docx zip parse: %v", err)
	}
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			rc, _ := f.Open()
			body, _ := io.ReadAll(rc)
			rc.Close()
			return string(body)
		}
	}
	t.Fatalf("docx missing word/document.xml")
	return ""
}

func TestRenderDOCXIncludesTable(t *testing.T) {
	t.Parallel()
	body := `<h1>Quarterly</h1>
<table>
  <thead><tr><th>Region</th><th>Revenue</th></tr></thead>
  <tbody>
    <tr><td>EMEA</td><td>1.2M</td></tr>
    <tr><td>APAC</td><td>900k</td></tr>
  </tbody>
</table>`
	out, err := RenderDOCX("Quarterly Update", "", body)
	if err != nil {
		t.Fatalf("RenderDOCX: %v", err)
	}
	doc := readDocumentXML(t, out)
	for _, fp := range []string{
		`<w:tbl>`,
		`<w:tblGrid>`,
		`<w:gridCol/>`,
		`Region`,
		`Revenue`,
		`EMEA`,
		`APAC`,
	} {
		if !strings.Contains(doc, fp) {
			t.Fatalf("expected %q in document.xml; got:\n%s", fp, doc)
		}
	}
	// Header cells should be bolded.
	headerRun := strings.Index(doc, "Region")
	if headerRun < 0 {
		t.Fatalf("region cell missing")
	}
	if !strings.Contains(doc[:headerRun], "<w:b/>") {
		t.Fatalf("expected header cell to be bold; got:\n%s", doc)
	}
}

func TestRenderDOCXPageBreakDiv(t *testing.T) {
	t.Parallel()
	body := `<p>Before</p><div class="of-page-break" data-page-break="true"></div><p>After</p>`
	out, err := RenderDOCX("Pages", "", body)
	if err != nil {
		t.Fatalf("RenderDOCX: %v", err)
	}
	doc := readDocumentXML(t, out)
	if !strings.Contains(doc, `<w:br w:type="page"/>`) {
		t.Fatalf("expected page-break w:br; got:\n%s", doc)
	}
	beforeIdx := strings.Index(doc, "Before")
	breakIdx := strings.Index(doc, `<w:br w:type="page"/>`)
	afterIdx := strings.Index(doc, "After")
	if !(beforeIdx < breakIdx && breakIdx < afterIdx) {
		t.Fatalf("page break must sit between paragraphs; before=%d break=%d after=%d", beforeIdx, breakIdx, afterIdx)
	}
}

func TestRenderDOCXImageFallsBackToAlt(t *testing.T) {
	t.Parallel()
	body := `<p>Pre</p><img src="data:image/png;base64,iVBORw0K" alt="Sales chart Q1"/><p>Post</p>`
	out, err := RenderDOCX("Picture probe", "", body)
	if err != nil {
		t.Fatalf("RenderDOCX: %v", err)
	}
	doc := readDocumentXML(t, out)
	if !strings.Contains(doc, "Sales chart Q1") {
		t.Fatalf("expected image alt text in DOCX; got:\n%s", doc)
	}
}

func TestSanitizeAllowsTableMarkup(t *testing.T) {
	t.Parallel()
	input := `<table><tr><td><strong>bold cell</strong></td></tr></table>`
	out := Sanitize(input)
	if !strings.Contains(out, "<table>") || !strings.Contains(out, "<strong>bold cell</strong>") {
		t.Fatalf("sanitizer stripped table markup: %q", out)
	}
}

func TestSanitizeAllowsDataImages(t *testing.T) {
	t.Parallel()
	input := `<p><img src="data:image/png;base64,AAAA" alt="probe"/></p>`
	out := Sanitize(input)
	if !strings.Contains(out, `src="data:image/png;base64,AAAA"`) {
		t.Fatalf("sanitizer stripped data URI: %q", out)
	}
}

func TestSanitizeKeepsPageBreakDiv(t *testing.T) {
	t.Parallel()
	input := `<div class="of-page-break" data-page-break="true"></div>`
	out := Sanitize(input)
	if !strings.Contains(out, `class="of-page-break"`) {
		t.Fatalf("sanitizer dropped page-break class: %q", out)
	}
}
