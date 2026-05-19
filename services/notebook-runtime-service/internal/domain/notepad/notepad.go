// Package notepad ports services/notebook-runtime-service/src/domain/notepad.rs
// 1:1: HTML rendering for notepad documents (export endpoint), the
// stale-presence cleanup SQL, and the markdown→HTML mini-renderer.
//
// Slice E (rich-text export) extends this package with:
//
//   - `Sanitize` — bluemonday-backed HTML sanitisation for inbound
//     TipTap fragments (used by both PDF and DOCX paths).
//   - `WrapHTMLBody` — wraps a sanitised TipTap fragment in the same
//     styled <html><head><body> envelope as RenderDocumentHTML, so
//     Chromium / LibreOffice see a complete document.
//   - GotenbergClient + RenderDOCX — the two export targets.
package notepad

import (
	"encoding/json"
	"strings"

	"github.com/microcosm-cc/bluemonday"

	"github.com/openfoundry/openfoundry-go/services/notebook-runtime-service/internal/models"
)

// notepadSanitizer is constructed once; bluemonday policies are
// goroutine-safe so the singleton can be shared across requests.
var notepadSanitizer = newNotepadSanitizer()

func newNotepadSanitizer() *bluemonday.Policy {
	// Start from UGCPolicy (links, headings, lists, basic formatting)
	// then extend with the inline marks TipTap emits but UGCPolicy
	// omits or restricts (color, highlight, alignment, code-block,
	// tables, images, layout wrappers).
	p := bluemonday.UGCPolicy()
	p.AllowElements("u", "s", "del", "mark")
	// Layout primitives shipped in Slice B.
	p.AllowElements("table", "thead", "tbody", "tr", "td", "th", "colgroup", "col")
	p.AllowAttrs("colspan", "rowspan").OnElements("td", "th")
	p.AllowAttrs("class").OnElements(
		"p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
		"pre", "code", "span", "a", "table", "thead", "tbody", "tr", "td", "th",
		"div", "img",
	)
	p.AllowAttrs("data-page-break").OnElements("div")
	p.AllowAttrs("contenteditable").OnElements("div")
	// Live embed nodes (Slice C). Each embed is serialised as
	// <div class="of-embed" data-kind="..." data-ref="..."
	//      data-snapshot="<base64 json>"></div>. The data-snapshot
	// attribute is a base64-encoded JSON envelope so it survives
	// bluemonday without losing structured content.
	p.AllowAttrs("data-kind", "data-ref", "data-snapshot").OnElements("div")
	p.AllowAttrs("style").Matching(bluemonday.Paragraph).OnElements("p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "li", "td", "th", "div")
	p.AllowStandardURLs()
	p.AllowImages()
	// Inline base64 images (data:image/png;base64,…) — the editor
	// stores pasted / dropped images as data URIs until Slice B
	// follow-up wires uploads to media-sets-service.
	p.AllowURLSchemes("data", "http", "https", "mailto")
	return p
}

// Sanitize strips disallowed HTML elements / attributes from a TipTap
// fragment. The output is safe to inline into a wrapping HTML envelope
// or to forward to Gotenberg / LibreOffice.
func Sanitize(in string) string {
	if strings.TrimSpace(in) == "" {
		return ""
	}
	return notepadSanitizer.Sanitize(in)
}

// CleanupStalePresenceSQL returns the DELETE statement applied before
// every presence list/upsert. Mirrors the Rust constant verbatim so
// the same Postgres plan is used regardless of which language served
// the request.
func CleanupStalePresenceSQL() string {
	return "DELETE FROM notepad_presence WHERE last_seen_at < NOW() - INTERVAL '5 minutes'"
}

// RenderExportPayload builds the export envelope returned by the
// `/notepad/{id}/export` endpoint when the legacy (markdown) renderer
// is the source of truth.
func RenderExportPayload(doc *models.NotepadDocument) models.NotepadExportPayload {
	return RenderExportPayloadHTML(doc, "")
}

// RenderExportPayloadHTML is the Slice E entry point: when bodyHTML is
// non-empty (TipTap-rendered fragment), it is sanitised and wrapped in
// the styled envelope; otherwise the legacy markdown path is used so
// pre-rich-text documents still export.
func RenderExportPayloadHTML(doc *models.NotepadDocument, bodyHTML string) models.NotepadExportPayload {
	title := strings.TrimSpace(doc.Title)
	html := WrapHTMLBody(doc, bodyHTML)
	previewExcerpt := previewExcerpt(doc.Content)

	return models.NotepadExportPayload{
		FileName:       slugify(title) + ".html",
		MimeType:       "text/html",
		Title:          title,
		HTML:           html,
		PreviewExcerpt: previewExcerpt,
	}
}

// Slugify is a re-export so handlers can reuse the canonical filename
// rule without depending on the package-private helper.
func Slugify(value string) string { return slugify(value) }

// RenderDocumentHTML produces the standalone HTML page Foundry-style.
// The CSS payload is embedded so the export is portable.
//
// Render order: prefer the TipTap-rendered `htmlBody` (Slice A) when
// the request carries one; otherwise fall back to the legacy markdown
// mini-renderer over `doc.Content` so documents created before the
// rich-text migration still export.
func RenderDocumentHTML(doc *models.NotepadDocument) string {
	return WrapHTMLBody(doc, "")
}

// WrapHTMLBody emits the styled <html> envelope wrapping bodyHTML.
// bodyHTML is sanitised before insertion. When bodyHTML is empty, the
// legacy markdown content path is used.
func WrapHTMLBody(doc *models.NotepadDocument, bodyHTML string) string {
	title := escapeHTML(strings.TrimSpace(doc.Title))
	descriptionTrimmed := strings.TrimSpace(doc.Description)
	var descriptionHTML string
	if descriptionTrimmed != "" {
		descriptionHTML = `<p class="lede">` + escapeHTML(descriptionTrimmed) + `</p>`
	}

	var contentHTML string
	if strings.TrimSpace(bodyHTML) != "" {
		contentHTML = Sanitize(bodyHTML)
	} else {
		contentHTML = RenderMarkdown(doc.Content)
	}

	return `<!doctype html><html><head><meta charset="utf-8" />` +
		`<meta name="viewport" content="width=device-width, initial-scale=1" />` +
		`<title>` + title + `</title>` +
		`<style>` + baseStyles() + `</style></head>` +
		`<body><article class="document"><header>` +
		`<div class="eyebrow">Notepad</div><h1>` + title + `</h1>` +
		descriptionHTML +
		`</header><section class="content">` + contentHTML + `</section>` +
		renderWidgets(doc.Widgets) +
		`<footer>Generated by OpenFoundry Notepad</footer></article></body></html>`
}

// RenderMarkdown is the same minimal markdown subset the Rust impl
// understands: H1/H2/H3, bullet lists (`- `), and paragraph fallthrough.
// Anything else falls through as a paragraph.
func RenderMarkdown(md string) string {
	var b strings.Builder
	inList := false
	for _, raw := range strings.Split(md, "\n") {
		line := strings.TrimRight(raw, " \t")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			if inList {
				b.WriteString("</ul>")
				inList = false
			}
			continue
		}
		switch {
		case strings.HasPrefix(trimmed, "### "):
			if inList {
				b.WriteString("</ul>")
				inList = false
			}
			b.WriteString("<h3>" + escapeHTML(trimmed[4:]) + "</h3>")
		case strings.HasPrefix(trimmed, "## "):
			if inList {
				b.WriteString("</ul>")
				inList = false
			}
			b.WriteString("<h2>" + escapeHTML(trimmed[3:]) + "</h2>")
		case strings.HasPrefix(trimmed, "# "):
			if inList {
				b.WriteString("</ul>")
				inList = false
			}
			b.WriteString("<h1>" + escapeHTML(trimmed[2:]) + "</h1>")
		case strings.HasPrefix(trimmed, "- "):
			if !inList {
				b.WriteString("<ul>")
				inList = true
			}
			b.WriteString("<li>" + escapeHTML(trimmed[2:]) + "</li>")
		default:
			if inList {
				b.WriteString("</ul>")
				inList = false
			}
			b.WriteString("<p>" + escapeHTML(trimmed) + "</p>")
		}
	}
	if inList {
		b.WriteString("</ul>")
	}
	return b.String()
}

func renderWidgets(widgets json.RawMessage) string {
	if len(widgets) == 0 {
		return ""
	}
	var entries []map[string]any
	if err := json.Unmarshal(widgets, &entries); err != nil || len(entries) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<section class="widgets"><div class="section-label">Embedded widgets</div>`)
	b.WriteString(`<div class="widget-grid">`)
	for _, w := range entries {
		title := stringField(w, "title", "Embedded widget")
		kind := stringField(w, "kind", "widget")
		summary := stringField(w, "summary", "Live content rendered in the OpenFoundry workspace.")
		b.WriteString(`<div class="widget-card"><div class="widget-kind">`)
		b.WriteString(escapeHTML(kind))
		b.WriteString(`</div><h3>`)
		b.WriteString(escapeHTML(title))
		b.WriteString(`</h3><p>`)
		b.WriteString(escapeHTML(summary))
		b.WriteString(`</p></div>`)
	}
	b.WriteString(`</div></section>`)
	return b.String()
}

func stringField(m map[string]any, key, fallback string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return fallback
}

// previewExcerpt grabs the first non-empty line, trimmed, capped at
// 180 chars — same heuristic as the Rust impl.
func previewExcerpt(content string) string {
	for _, line := range strings.Split(content, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		runes := []rune(t)
		if len(runes) > 180 {
			return string(runes[:180])
		}
		return t
	}
	return "Document export"
}

func slugify(value string) string {
	var b strings.Builder
	for _, c := range value {
		switch {
		case c >= 'a' && c <= 'z':
			b.WriteRune(c)
		case c >= 'A' && c <= 'Z':
			b.WriteRune(c + ('a' - 'A'))
		case c >= '0' && c <= '9':
			b.WriteRune(c)
		default:
			b.WriteRune('-')
		}
	}
	return strings.Trim(b.String(), "-")
}

func escapeHTML(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}

func baseStyles() string {
	return `body{margin:0;background:#f8fafc;color:#0f172a;font:16px/1.65 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;} .document{max-width:900px;margin:0 auto;padding:56px 28px 96px;} .eyebrow{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#0f766e;font-weight:700;} h1,h2,h3{line-height:1.15;color:#020617;} h1{font-size:44px;margin:12px 0 16px;} h2{font-size:28px;margin:32px 0 12px;} h3{font-size:20px;margin:24px 0 8px;} p,li{color:#334155;} .lede{font-size:18px;color:#475569;margin-bottom:24px;} ul{padding-left:22px;} .widgets{margin-top:40px;} .section-label{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#475569;font-weight:700;margin-bottom:12px;} .widget-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;} .widget-card{border:1px solid #cbd5e1;border-radius:18px;padding:18px;background:white;box-shadow:0 10px 30px rgba(15,23,42,.06);} .widget-kind{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#0284c7;font-weight:700;margin-bottom:8px;} footer{margin-top:48px;padding-top:20px;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;} table{width:100%;border-collapse:collapse;margin:16px 0;} table th,table td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;vertical-align:top;} table th{background:#f1f5f9;font-weight:600;} img{max-width:100%;height:auto;border-radius:4px;margin:12px 0;} .of-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:16px;margin:16px 0;} .of-column{padding:8px 0;} .of-page-break{display:block;height:0;border:0;margin:0;page-break-after:always;break-after:page;} @media print{.of-page-break{page-break-after:always;break-after:page;}} .of-embed{margin:16px 0;padding:14px 16px;border:1px solid #cbd5e1;border-radius:6px;background:white;} .of-embed .of-embed-kind{font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:#475569;} .of-embed .of-embed-title{margin:6px 0 0;font-size:18px;font-weight:600;color:#020617;} .of-embed .of-embed-subtitle{margin:4px 0 0;color:#64748b;font-size:13px;} .of-embed .of-embed-summary{margin:8px 0 0;font-size:14px;color:#334155;} .of-embed .of-embed-fields{margin-top:12px;width:100%;border-collapse:collapse;font-size:13px;} .of-embed .of-embed-fields th{text-align:left;padding:4px 8px 4px 0;color:#64748b;font-weight:500;width:30%;border:0;background:transparent;} .of-embed .of-embed-fields td{padding:4px 0;color:#020617;border:0;} .of-embed-empty{color:#64748b;font-style:italic;}`
}
