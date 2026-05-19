// DOCX writer for the TipTap HTML subset. Produces a valid Office Open
// XML (.docx) zip from a fragment that uses our editor's tag dialect:
// h1/h2/h3, p, ul/ol/li, blockquote, br, strong/b, em/i, u, s, code, a.
//
// The output is not pixel-perfect with the browser preview — it's
// optimised for round-trip into Word / LibreOffice with the structural
// semantics preserved (headings stay headings, lists stay lists, bold
// stays bold). Tables and images are not yet supported and are
// flattened to their text content.
package notepad

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"
	"time"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// RenderDOCX converts a TipTap-flavoured HTML body into a DOCX byte
// slice. `title` becomes the first paragraph (Title style) so the
// document opens with a heading even when the editor body starts with
// a plain paragraph.
func RenderDOCX(title, descriptionHTML, bodyHTML string) ([]byte, error) {
	blocks := make([]docxBlock, 0, 32)
	if t := strings.TrimSpace(title); t != "" {
		blocks = append(blocks, docxBlock{
			Paragraph: &docxParagraph{Style: "Title", Runs: []docxRun{{Text: t}}},
		})
	}
	if desc := strings.TrimSpace(descriptionHTML); desc != "" {
		blocks = append(blocks, parseFragmentBlocks(desc, docxStyle{})...)
	}
	blocks = append(blocks, parseFragmentBlocks(bodyHTML, docxStyle{})...)

	if len(blocks) == 0 {
		blocks = append(blocks, docxBlock{Paragraph: &docxParagraph{Runs: []docxRun{{Text: ""}}}})
	}

	doc := buildDocumentXML(blocks)

	buf := &bytes.Buffer{}
	w := zip.NewWriter(buf)
	if err := writeZipFile(w, "[Content_Types].xml", contentTypesXML); err != nil {
		return nil, err
	}
	if err := writeZipFile(w, "_rels/.rels", relsRootXML); err != nil {
		return nil, err
	}
	if err := writeZipFile(w, "word/_rels/document.xml.rels", docRelsXML); err != nil {
		return nil, err
	}
	if err := writeZipFile(w, "word/styles.xml", stylesXML); err != nil {
		return nil, err
	}
	if err := writeZipFile(w, "word/numbering.xml", numberingXML); err != nil {
		return nil, err
	}
	if err := writeZipFile(w, "word/document.xml", doc); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("close docx zip: %w", err)
	}
	return buf.Bytes(), nil
}

// ── HTML → block tree ────────────────────────────────────────────────
//
// docxBlock is a discriminated union: exactly one of {Paragraph,
// Table, PageBreak} is non-nil. Renderers walk this list to emit the
// correct OOXML element per kind.

type docxBlock struct {
	Paragraph *docxParagraph
	Table     *docxTable
	PageBreak bool
}

type docxTable struct {
	Rows [][]docxTableCell
}

type docxTableCell struct {
	Header bool
	Blocks []docxBlock
}

type docxRun struct {
	Text       string
	Bold       bool
	Italic     bool
	Underline  bool
	Strike     bool
	Code       bool
	HyperlinkID string
}

type docxParagraph struct {
	Style      string
	NumID      int // 0 = no list, 1 = bullet, 2 = ordered
	Indent     int // list nesting level (0-based)
	Runs       []docxRun
	Hyperlinks []docxHyperlink
}

type docxHyperlink struct {
	ID   string
	Href string
}

// docxStyle is the cascading "current" inline mark set while walking
// the DOM. It is value-copied so children can extend it without
// mutating the parent.
type docxStyle struct {
	Bold      bool
	Italic    bool
	Underline bool
	Strike    bool
	Code      bool
}

func parseFragmentBlocks(fragment string, base docxStyle) []docxBlock {
	if strings.TrimSpace(fragment) == "" {
		return nil
	}
	// Parse as a fragment of <body> so that bare children are accepted.
	nodes, err := html.ParseFragment(strings.NewReader(fragment), &html.Node{
		Type:     html.ElementNode,
		Data:     "body",
		DataAtom: atom.Body,
	})
	if err != nil {
		return []docxBlock{
			{Paragraph: &docxParagraph{Runs: []docxRun{{Text: stripTags(fragment)}}}},
		}
	}
	out := []docxBlock{}
	for _, n := range nodes {
		out = append(out, blockify(n, base, 0, 0)...)
	}
	return out
}

func blockify(n *html.Node, parent docxStyle, listKind int, indent int) []docxBlock {
	switch n.Type {
	case html.TextNode:
		text := strings.TrimSpace(n.Data)
		if text == "" {
			return nil
		}
		return []docxBlock{{Paragraph: &docxParagraph{Runs: []docxRun{{Text: n.Data, Bold: parent.Bold, Italic: parent.Italic, Underline: parent.Underline, Strike: parent.Strike, Code: parent.Code}}}}}
	case html.ElementNode:
		switch n.DataAtom {
		case atom.H1:
			return []docxBlock{{Paragraph: &docxParagraph{Style: "Heading1", Runs: collectRuns(n, parent)}}}
		case atom.H2:
			return []docxBlock{{Paragraph: &docxParagraph{Style: "Heading2", Runs: collectRuns(n, parent)}}}
		case atom.H3:
			return []docxBlock{{Paragraph: &docxParagraph{Style: "Heading3", Runs: collectRuns(n, parent)}}}
		case atom.H4, atom.H5, atom.H6:
			return []docxBlock{{Paragraph: &docxParagraph{Style: "Heading3", Runs: collectRuns(n, parent)}}}
		case atom.P:
			runs, links := collectRunsWithLinks(n, parent)
			return []docxBlock{{Paragraph: &docxParagraph{Runs: runs, Hyperlinks: links}}}
		case atom.Blockquote:
			return []docxBlock{{Paragraph: &docxParagraph{Style: "Quote", Runs: collectRuns(n, parent)}}}
		case atom.Ul:
			out := []docxBlock{}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				out = append(out, blockify(c, parent, 1, indent)...)
			}
			return out
		case atom.Ol:
			out := []docxBlock{}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				out = append(out, blockify(c, parent, 2, indent)...)
			}
			return out
		case atom.Li:
			runs, links := collectRunsWithLinks(n, parent)
			return []docxBlock{{Paragraph: &docxParagraph{NumID: listKind, Indent: indent, Runs: runs, Hyperlinks: links}}}
		case atom.Br:
			return []docxBlock{{Paragraph: &docxParagraph{Runs: []docxRun{{Text: ""}}}}}
		case atom.Pre:
			return []docxBlock{{Paragraph: &docxParagraph{Style: "CodeBlock", Runs: collectRuns(n, docxStyle{Code: true})}}}
		case atom.Table:
			tbl := flattenTable(n, parent)
			if tbl == nil {
				return nil
			}
			return []docxBlock{{Table: tbl}}
		case atom.Img:
			// Inline images are not yet embedded in the DOCX zip
			// (Slice B follow-up). Render the alt text or `[Image]`
			// as a placeholder paragraph so the export keeps a
			// reading flow.
			alt := attrValue(n, "alt")
			if strings.TrimSpace(alt) == "" {
				alt = "[Image]"
			}
			return []docxBlock{{Paragraph: &docxParagraph{Style: "Quote", Runs: []docxRun{{Text: alt, Italic: true}}}}}
		case atom.Div:
			if isPageBreakDiv(n) {
				return []docxBlock{{PageBreak: true}}
			}
			// Unknown div: flatten children.
			out := []docxBlock{}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				out = append(out, blockify(c, parent, listKind, indent)...)
			}
			return out
		case atom.Hr:
			if hasClass(n, "of-page-break") {
				return []docxBlock{{PageBreak: true}}
			}
			return nil
		default:
			out := []docxBlock{}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				out = append(out, blockify(c, parent, listKind, indent)...)
			}
			return out
		}
	default:
		out := []docxBlock{}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			out = append(out, blockify(c, parent, listKind, indent)...)
		}
		return out
	}
}

// flattenTable walks an HTML <table> into a row-major matrix of
// cells. Rowspan / colspan are dropped (cells render as 1×1) — full
// span support is a follow-up.
func flattenTable(table *html.Node, parent docxStyle) *docxTable {
	out := &docxTable{}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type != html.ElementNode {
			return
		}
		switch n.DataAtom {
		case atom.Tr:
			row := []docxTableCell{}
			for c := n.FirstChild; c != nil; c = c.NextSibling {
				if c.Type != html.ElementNode {
					continue
				}
				if c.DataAtom == atom.Td || c.DataAtom == atom.Th {
					cell := docxTableCell{
						Header: c.DataAtom == atom.Th,
						Blocks: cellBlocks(c, parent),
					}
					row = append(row, cell)
				}
			}
			if len(row) > 0 {
				out.Rows = append(out.Rows, row)
			}
			return
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(table)
	if len(out.Rows) == 0 {
		return nil
	}
	return out
}

func cellBlocks(cell *html.Node, parent docxStyle) []docxBlock {
	out := []docxBlock{}
	for c := cell.FirstChild; c != nil; c = c.NextSibling {
		out = append(out, blockify(c, parent, 0, 0)...)
	}
	// Every Word table cell needs at least one paragraph or Word
	// refuses to render the row.
	if len(out) == 0 {
		out = []docxBlock{{Paragraph: &docxParagraph{Runs: []docxRun{{Text: ""}}}}}
	}
	return out
}

func isPageBreakDiv(n *html.Node) bool {
	if hasClass(n, "of-page-break") {
		return true
	}
	for _, attr := range n.Attr {
		if attr.Key == "data-page-break" && (attr.Val == "true" || attr.Val == "") {
			return true
		}
	}
	return false
}

func hasClass(n *html.Node, target string) bool {
	for _, attr := range n.Attr {
		if attr.Key != "class" {
			continue
		}
		for _, c := range strings.Fields(attr.Val) {
			if c == target {
				return true
			}
		}
	}
	return false
}

func collectRuns(n *html.Node, parent docxStyle) []docxRun {
	runs, _ := collectRunsWithLinks(n, parent)
	return runs
}

func collectRunsWithLinks(n *html.Node, parent docxStyle) ([]docxRun, []docxHyperlink) {
	runs := []docxRun{}
	links := []docxHyperlink{}
	var walk func(*html.Node, docxStyle, string)
	walk = func(node *html.Node, style docxStyle, linkID string) {
		switch node.Type {
		case html.TextNode:
			if node.Data == "" {
				return
			}
			runs = append(runs, docxRun{
				Text: node.Data, Bold: style.Bold, Italic: style.Italic,
				Underline: style.Underline, Strike: style.Strike, Code: style.Code,
				HyperlinkID: linkID,
			})
		case html.ElementNode:
			next := style
			switch node.DataAtom {
			case atom.B, atom.Strong:
				next.Bold = true
			case atom.I, atom.Em:
				next.Italic = true
			case atom.U:
				next.Underline = true
			case atom.S, atom.Strike, atom.Del:
				next.Strike = true
			case atom.Code:
				next.Code = true
			case atom.Br:
				runs = append(runs, docxRun{Text: "\n"})
				return
			case atom.A:
				href := attrValue(node, "href")
				if href != "" {
					id := fmt.Sprintf("rIdLink%d", len(links)+1)
					links = append(links, docxHyperlink{ID: id, Href: href})
					next.Underline = true
					for c := node.FirstChild; c != nil; c = c.NextSibling {
						walk(c, next, id)
					}
					return
				}
			}
			for c := node.FirstChild; c != nil; c = c.NextSibling {
				walk(c, next, linkID)
			}
		default:
			for c := node.FirstChild; c != nil; c = c.NextSibling {
				walk(c, style, linkID)
			}
		}
	}
	walk(n, parent, "")
	return runs, links
}

func attrValue(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

func stripTags(in string) string {
	var sb strings.Builder
	inTag := false
	for _, r := range in {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// ── document.xml rendering ───────────────────────────────────────────

func buildDocumentXML(blocks []docxBlock) string {
	sb := &strings.Builder{}
	sb.WriteString(xmlHeader)
	sb.WriteString(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>`)
	for _, block := range blocks {
		writeBlock(sb, block)
	}
	// Trailing section so Word/LibreOffice render page margins.
	sb.WriteString(`<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`)
	sb.WriteString(`</w:body></w:document>`)
	return sb.String()
}

func writeBlock(sb *strings.Builder, block docxBlock) {
	switch {
	case block.Paragraph != nil:
		writeParagraph(sb, *block.Paragraph)
	case block.Table != nil:
		writeTable(sb, block.Table)
	case block.PageBreak:
		// A page break in Word is a paragraph containing a run
		// containing `<w:br w:type="page"/>`. Tools render this
		// identically to Ctrl+Enter in Word.
		sb.WriteString(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`)
	}
}

func writeParagraph(sb *strings.Builder, p docxParagraph) {
	sb.WriteString(`<w:p>`)
	if p.Style != "" || p.NumID > 0 {
		sb.WriteString(`<w:pPr>`)
		if p.Style != "" {
			fmt.Fprintf(sb, `<w:pStyle w:val="%s"/>`, p.Style)
		}
		if p.NumID > 0 {
			fmt.Fprintf(sb, `<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>`, p.Indent, p.NumID)
		}
		sb.WriteString(`</w:pPr>`)
	}
	for _, run := range p.Runs {
		writeRun(sb, run)
	}
	sb.WriteString(`</w:p>`)
}

// writeTable serialises a docxTable to OOXML. Borders are inlined via
// tblPr so the output renders the same whether or not the host
// styles.xml defines a TableGrid style.
func writeTable(sb *strings.Builder, table *docxTable) {
	if table == nil || len(table.Rows) == 0 {
		return
	}
	sb.WriteString(`<w:tbl>`)
	sb.WriteString(`<w:tblPr><w:tblW w:w="5000" w:type="pct"/>`)
	sb.WriteString(`<w:tblBorders>`)
	for _, side := range []string{"top", "left", "bottom", "right", "insideH", "insideV"} {
		fmt.Fprintf(sb, `<w:%s w:val="single" w:sz="4" w:space="0" w:color="auto"/>`, side)
	}
	sb.WriteString(`</w:tblBorders></w:tblPr>`)
	// Even column widths.
	cols := 0
	for _, row := range table.Rows {
		if len(row) > cols {
			cols = len(row)
		}
	}
	if cols > 0 {
		sb.WriteString(`<w:tblGrid>`)
		for i := 0; i < cols; i++ {
			sb.WriteString(`<w:gridCol/>`)
		}
		sb.WriteString(`</w:tblGrid>`)
	}
	for _, row := range table.Rows {
		sb.WriteString(`<w:tr>`)
		for _, cell := range row {
			sb.WriteString(`<w:tc>`)
			sb.WriteString(`<w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>`)
			if len(cell.Blocks) == 0 {
				sb.WriteString(`<w:p/>`)
			}
			for _, b := range cell.Blocks {
				// Style header cells with bold runs if not already.
				if cell.Header && b.Paragraph != nil {
					for i := range b.Paragraph.Runs {
						b.Paragraph.Runs[i].Bold = true
					}
				}
				writeBlock(sb, b)
			}
			sb.WriteString(`</w:tc>`)
		}
		sb.WriteString(`</w:tr>`)
	}
	sb.WriteString(`</w:tbl>`)
}

func writeRun(sb *strings.Builder, run docxRun) {
	if run.HyperlinkID != "" {
		fmt.Fprintf(sb, `<w:hyperlink r:id="%s">`, run.HyperlinkID)
		defer sb.WriteString(`</w:hyperlink>`)
	}
	sb.WriteString(`<w:r>`)
	if run.Bold || run.Italic || run.Underline || run.Strike || run.Code {
		sb.WriteString(`<w:rPr>`)
		if run.Bold {
			sb.WriteString(`<w:b/>`)
		}
		if run.Italic {
			sb.WriteString(`<w:i/>`)
		}
		if run.Underline {
			sb.WriteString(`<w:u w:val="single"/>`)
		}
		if run.Strike {
			sb.WriteString(`<w:strike/>`)
		}
		if run.Code {
			sb.WriteString(`<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>`)
		}
		sb.WriteString(`</w:rPr>`)
	}
	// Split on '\n' to insert <w:br/> for newlines so multi-line text
	// from list items / pre blocks does not collapse on rendering.
	lines := strings.Split(run.Text, "\n")
	for i, line := range lines {
		if i > 0 {
			sb.WriteString(`<w:br/>`)
		}
		if line != "" {
			sb.WriteString(`<w:t xml:space="preserve">`)
			sb.WriteString(escapeXML(line))
			sb.WriteString(`</w:t>`)
		}
	}
	sb.WriteString(`</w:r>`)
}

func escapeXML(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	)
	return r.Replace(s)
}

// ── ZIP helper ───────────────────────────────────────────────────────

func writeZipFile(w *zip.Writer, name, body string) error {
	header := &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: time.Time{}}
	f, err := w.CreateHeader(header)
	if err != nil {
		return fmt.Errorf("create %s: %w", name, err)
	}
	if _, err := f.Write([]byte(body)); err != nil {
		return fmt.Errorf("write %s: %w", name, err)
	}
	return nil
}

// ── Static OOXML scaffolding ─────────────────────────────────────────

const xmlHeader = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + "\n"

const contentTypesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`

const relsRootXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const docRelsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

const stylesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120"/></w:pPr>
    <w:rPr><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="200"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="44"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="Heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="180" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720"/></w:pPr>
    <w:rPr><w:i/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock">
    <w:name w:val="Code Block"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr>
  </w:style>
</w:styles>`

const numberingXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`
