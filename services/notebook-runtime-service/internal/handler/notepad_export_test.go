package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/domain/notepad"
	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

// fakePDFBody is a 1-byte placeholder used by the stub Gotenberg
// server. The handler only forwards bytes through, so the body shape
// doesn't matter — only that the right Content-Type and Length are
// preserved end-to-end.
const fakePDFBody = "%PDF-stub\n"

func createTestDocument(t *testing.T, state *State, owner uuid.UUID, title, htmlBody string) models.NotepadDocument {
	t.Helper()
	r := mountNotepadRouter(state)
	body, _ := json.Marshal(map[string]any{
		"title":       title,
		"description": "Export probe",
		"content":     "# " + title + "\n\nlegacy body",
		"content_doc": json.RawMessage(`{"type":"doc","content":[]}`),
	})
	_ = htmlBody // unused; the html body is provided per-request in the tests
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents", bytes.NewReader(body)), owner)
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("create doc status=%d body=%s", w.Code, w.Body.String())
	}
	var doc models.NotepadDocument
	if err := json.Unmarshal(w.Body.Bytes(), &doc); err != nil {
		t.Fatalf("create doc json: %v", err)
	}
	return doc
}

func TestExportHTMLDefaultPreservesEnvelope(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state := newNotepadTestState()
	r := mountNotepadRouter(state)
	doc := createTestDocument(t, state, owner, "Export HTML", "")

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/export", nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("html export status=%d body=%s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("expected JSON envelope, got Content-Type=%q", ct)
	}
	var payload models.NotepadExportPayload
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("html export json: %v", err)
	}
	if payload.MimeType != "text/html" || !strings.Contains(payload.HTML, "<h1>Heading</h1>") && !strings.Contains(payload.HTML, "Export HTML") {
		t.Fatalf("html export drift: %+v", payload)
	}
}

func TestExportHTMLWithTipTapBody(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state := newNotepadTestState()
	r := mountNotepadRouter(state)
	doc := createTestDocument(t, state, owner, "Rich Doc", "")

	body, _ := json.Marshal(models.NotepadExportRequest{
		Format:          models.NotepadExportFormatHTML,
		HTMLBody:        `<h2>Hello</h2><p><strong>bold</strong> body</p>`,
		NotepadDocument: doc,
	})
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/export?format=html", bytes.NewReader(body)), owner)
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("html-body export status=%d body=%s", w.Code, w.Body.String())
	}
	var payload models.NotepadExportPayload
	_ = json.Unmarshal(w.Body.Bytes(), &payload)
	if !strings.Contains(payload.HTML, "<h2>Hello</h2>") {
		t.Fatalf("expected sanitised h2 in HTML, got: %s", payload.HTML)
	}
	if !strings.Contains(payload.HTML, "<strong>bold</strong>") {
		t.Fatalf("expected strong mark preserved by sanitiser, got: %s", payload.HTML)
	}
}

func TestExportPDFWithoutGotenbergReturns503(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state := newNotepadTestState()
	r := mountNotepadRouter(state)
	doc := createTestDocument(t, state, owner, "Needs PDF", "")

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/export?format=pdf", nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when Gotenberg disabled, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "GOTENBERG_URL") {
		t.Fatalf("expected hint about GOTENBERG_URL in 503 body, got: %s", w.Body.String())
	}
}

func TestExportPDFViaGotenbergStub(t *testing.T) {
	t.Parallel()
	owner := uuid.New()

	gotenberg := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/forms/chromium/convert/html" {
			http.Error(w, "wrong path "+r.URL.Path, http.StatusNotFound)
			return
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		files, ok := r.MultipartForm.File["files"]
		if !ok || len(files) == 0 {
			http.Error(w, "missing files[] part", http.StatusBadRequest)
			return
		}
		if files[0].Filename != "index.html" {
			http.Error(w, "expected index.html, got "+files[0].Filename, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/pdf")
		_, _ = io.WriteString(w, fakePDFBody)
	}))
	defer gotenberg.Close()

	state := newNotepadTestState()
	state.Gotenberg = notepad.NewGotenbergClient(gotenberg.URL, gotenberg.Client())
	r := mountNotepadRouter(state)
	doc := createTestDocument(t, state, owner, "Reports Q1", "")

	body, _ := json.Marshal(models.NotepadExportRequest{
		Format:          models.NotepadExportFormatPDF,
		HTMLBody:        `<h1>Reports Q1</h1><p>Body content.</p>`,
		NotepadDocument: doc,
	})
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/export?format=pdf", bytes.NewReader(body)), owner)
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("pdf export status=%d body=%s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/pdf" {
		t.Fatalf("expected Content-Type application/pdf, got %q", ct)
	}
	if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, "reports-q1.pdf") {
		t.Fatalf("expected slugified filename in Content-Disposition, got %q", cd)
	}
	if w.Body.String() != fakePDFBody {
		t.Fatalf("pdf body mismatch: %q", w.Body.String())
	}
}

func TestExportDOCXProducesValidZip(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state := newNotepadTestState()
	r := mountNotepadRouter(state)
	doc := createTestDocument(t, state, owner, "Quarterly Update", "")

	body, _ := json.Marshal(models.NotepadExportRequest{
		Format:          models.NotepadExportFormatDOCX,
		HTMLBody:        `<h1>Quarterly Update</h1><p>This is <strong>bold</strong> text.</p><ul><li>item one</li><li>item two</li></ul>`,
		NotepadDocument: doc,
	})
	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/export?format=docx", bytes.NewReader(body)), owner)
	req.ContentLength = int64(len(body))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("docx export status=%d body=%s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" {
		t.Fatalf("expected docx content-type, got %q", ct)
	}
	if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, "quarterly-update.docx") {
		t.Fatalf("expected slugified filename in Content-Disposition, got %q", cd)
	}

	// The body must be a valid zip with document.xml containing the
	// expected structural fingerprints (Heading1 style + list numId).
	zr, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if err != nil {
		t.Fatalf("docx zip parse: %v", err)
	}
	var docXML string
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			rc, _ := f.Open()
			b, _ := io.ReadAll(rc)
			rc.Close()
			docXML = string(b)
			break
		}
	}
	if docXML == "" {
		t.Fatal("docx zip missing word/document.xml")
	}
	for _, fp := range []string{
		`<w:pStyle w:val="Title"/>`,
		`<w:pStyle w:val="Heading1"/>`,
		`<w:numId w:val="1"/>`,
		`<w:b/>`,
		`bold`,
		`item one`,
	} {
		if !strings.Contains(docXML, fp) {
			t.Fatalf("docx document.xml missing %q\n--- xml ---\n%s", fp, docXML)
		}
	}
}

func TestExportUnknownFormatReturns400(t *testing.T) {
	t.Parallel()
	owner := uuid.New()
	state := newNotepadTestState()
	r := mountNotepadRouter(state)
	doc := createTestDocument(t, state, owner, "Bad Format", "")

	w := httptest.NewRecorder()
	req := withClaims(httptest.NewRequest(http.MethodPost, "/api/v1/notepad/documents/"+doc.ID.String()+"/export?format=xlsx", nil), owner)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown format, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "unsupported export format") {
		t.Fatalf("expected error hint, got body=%s", w.Body.String())
	}
}
