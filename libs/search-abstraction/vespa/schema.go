package vespa

import (
	"archive/zip"
	"bytes"
	"fmt"
	"sort"
	"strings"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
)

// Schema generation for Vespa application packages.
//
// Vespa deploys schemas via the Config Server's
// `POST /application/v2/tenant/{t}/prepareandactivate` which expects a
// zipped application package containing:
//
//   - services.xml — the cluster topology + the list of document types
//     in the content cluster.
//   - schemas/<doc_type>.sd — per-document-type schema definition.
//
// Vespa replaces the whole package on every deploy; there is no
// "add a single schema" operation. The MappingRegistrar implementation
// holds the cumulative set of registered TypeMappings in memory and
// rebuilds the package on every register/drop call. See
// PoC/blockers/B03-ontology-indexer.md §G5 for the wipe-on-empty-cache
// caveat and the Seed() mitigation.

// builtinFields are the four fields every document carries regardless
// of the ontology schema. They mirror what vespa.Backend.Index writes
// (id, tenant, type_id, version). Naming pinned here so the schema
// generator and the runtime never drift.
var builtinFields = []searchabstraction.MappingField{
	{Name: "id", Type: searchabstraction.FieldString, Filterable: true},
	{Name: "tenant", Type: searchabstraction.FieldString, Filterable: true},
	{Name: "type_id", Type: searchabstraction.FieldString, Filterable: true},
	{Name: "version", Type: searchabstraction.FieldLong, Sortable: true},
}

// BuildSchemaSD returns the textual contents of `schemas/<doc_type>.sd`
// for a single TypeMapping. doc_type is searchabstraction.SanitizeDocType
// of the mapping's TypeID so the schema name matches the document-type
// name used by Index/Search.
func BuildSchemaSD(m searchabstraction.TypeMapping) string {
	docType := searchabstraction.SanitizeDocType(string(m.TypeID))
	var sb strings.Builder
	fmt.Fprintf(&sb, "schema %s {\n", docType)
	fmt.Fprintf(&sb, "    document %s {\n", docType)
	for _, f := range builtinFields {
		writeField(&sb, f)
	}
	// Caller-supplied fields. Skip any that collide with builtins or
	// have an unknown type — the Vespa cluster will reject the latter,
	// and we want the package deploy to succeed.
	seen := map[string]struct{}{}
	for _, f := range builtinFields {
		seen[f.Name] = struct{}{}
	}
	bm25Targets := make([]string, 0)
	for _, f := range m.Fields {
		if f.Type == searchabstraction.FieldUnknown {
			continue
		}
		if _, ok := seen[f.Name]; ok {
			continue
		}
		seen[f.Name] = struct{}{}
		writeField(&sb, f)
		if f.Searchable && (f.Type == searchabstraction.FieldString || f.Type == searchabstraction.FieldText) && !f.IsArray {
			bm25Targets = append(bm25Targets, f.Name)
		}
	}
	sb.WriteString("    }\n")
	// `fieldset default` is what `userQuery()` matches against. Pin to
	// the searchable string/text fields so the existing search YQL
	// keeps working out of the box.
	if len(bm25Targets) > 0 {
		fmt.Fprintf(&sb, "    fieldset default {\n        fields: %s\n    }\n", strings.Join(bm25Targets, ", "))
	}
	sb.WriteString("    rank-profile default inherits default {\n")
	sb.WriteString("        first-phase {\n")
	if len(bm25Targets) > 0 {
		expr := make([]string, 0, len(bm25Targets))
		for _, f := range bm25Targets {
			expr = append(expr, fmt.Sprintf("bm25(%s)", f))
		}
		fmt.Fprintf(&sb, "            expression: %s\n", strings.Join(expr, " + "))
	} else {
		sb.WriteString("            expression: nativeRank\n")
	}
	sb.WriteString("        }\n")
	sb.WriteString("    }\n")
	sb.WriteString("}\n")
	return sb.String()
}

func writeField(sb *strings.Builder, f searchabstraction.MappingField) {
	vespaType := vespaTypeOf(f)
	if vespaType == "" {
		return
	}
	fmt.Fprintf(sb, "        field %s type %s {\n", f.Name, vespaType)
	fmt.Fprintf(sb, "            indexing: %s\n", indexingOf(f))
	// Enable BM25 on string/text searchable single-valued fields.
	if f.Searchable && (f.Type == searchabstraction.FieldString || f.Type == searchabstraction.FieldText) && !f.IsArray {
		sb.WriteString("            index: enable-bm25\n")
	}
	sb.WriteString("        }\n")
}

func vespaTypeOf(f searchabstraction.MappingField) string {
	var base string
	switch f.Type {
	case searchabstraction.FieldString, searchabstraction.FieldText:
		base = "string"
	case searchabstraction.FieldInteger:
		base = "int"
	case searchabstraction.FieldLong, searchabstraction.FieldDate:
		// Dates land as epoch-millis longs — matches the producer's
		// time.UnixMilli convention used by object-database-service.
		base = "long"
	case searchabstraction.FieldDouble:
		base = "double"
	case searchabstraction.FieldBoolean:
		base = "bool"
	case searchabstraction.FieldGeo:
		// Vespa's geo positions are a built-in type; pinning to the
		// 2-D point shape. Geo-shape would require a different schema
		// (predicate fields) — keep it minimal here.
		base = "position"
	default:
		return ""
	}
	if f.IsArray {
		return "array<" + base + ">"
	}
	return base
}

func indexingOf(f searchabstraction.MappingField) string {
	// Vespa's indexing pipeline tokens:
	//   index     — full-text inverted index (only meaningful for string/text)
	//   attribute — column store (filterable, sortable, aggregatable)
	//   summary   — returned in the result snippet
	parts := []string{}
	wantIndex := (f.Type == searchabstraction.FieldString || f.Type == searchabstraction.FieldText) && f.Searchable
	wantAttribute := f.Sortable || f.Filterable ||
		(!wantIndex && f.Type != searchabstraction.FieldText)
	if wantIndex {
		parts = append(parts, "index")
	}
	if wantAttribute {
		parts = append(parts, "attribute")
	}
	parts = append(parts, "summary")
	return strings.Join(parts, " | ")
}

// BuildServicesXML returns the services.xml content for an application
// package that contains exactly the supplied mappings. Order does not
// matter — the function sorts by doc_type so the output is stable.
func BuildServicesXML(mappings []searchabstraction.TypeMapping) string {
	docTypes := make([]string, 0, len(mappings))
	for _, m := range mappings {
		docTypes = append(docTypes, searchabstraction.SanitizeDocType(string(m.TypeID)))
	}
	sort.Strings(docTypes)

	var sb strings.Builder
	sb.WriteString("<?xml version=\"1.0\" encoding=\"utf-8\" ?>\n")
	sb.WriteString("<services version=\"1.0\">\n")
	sb.WriteString("    <container id=\"default\" version=\"1.0\">\n")
	sb.WriteString("        <search/>\n")
	sb.WriteString("        <document-api/>\n")
	sb.WriteString("        <nodes>\n")
	sb.WriteString("            <node hostalias=\"node1\"/>\n")
	sb.WriteString("        </nodes>\n")
	sb.WriteString("    </container>\n")
	sb.WriteString("    <content id=\"of\" version=\"1.0\">\n")
	sb.WriteString("        <redundancy>1</redundancy>\n")
	sb.WriteString("        <documents>\n")
	for _, dt := range docTypes {
		fmt.Fprintf(&sb, "            <document type=\"%s\" mode=\"index\"/>\n", dt)
	}
	sb.WriteString("        </documents>\n")
	sb.WriteString("        <nodes>\n")
	sb.WriteString("            <node hostalias=\"node1\" distribution-key=\"0\"/>\n")
	sb.WriteString("        </nodes>\n")
	sb.WriteString("    </content>\n")
	sb.WriteString("</services>\n")
	return sb.String()
}

// BuildHostsXML pins the cluster to a single node-alias used by
// services.xml. Single-node is the only topology this PoC supports;
// production deployments override the application package out of
// band.
func BuildHostsXML() string {
	return `<?xml version="1.0" encoding="utf-8" ?>
<hosts>
    <host name="localhost">
        <alias>node1</alias>
    </host>
</hosts>
`
}

// BuildApplicationPackage zips services.xml + hosts.xml + every
// schemas/<doc_type>.sd into the canonical Vespa application package.
// Returned bytes are ready to POST to the Config Server.
func BuildApplicationPackage(mappings []searchabstraction.TypeMapping) ([]byte, error) {
	// Deduplicate by sanitised doc_type — the in-memory cache already
	// keys by api_name but a caller could pass the same mapping twice.
	byDocType := map[string]searchabstraction.TypeMapping{}
	for _, m := range mappings {
		dt := searchabstraction.SanitizeDocType(string(m.TypeID))
		if dt == "" {
			continue
		}
		byDocType[dt] = m
	}
	docTypes := make([]string, 0, len(byDocType))
	for dt := range byDocType {
		docTypes = append(docTypes, dt)
	}
	sort.Strings(docTypes)
	stable := make([]searchabstraction.TypeMapping, 0, len(docTypes))
	for _, dt := range docTypes {
		stable = append(stable, byDocType[dt])
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	if err := writeZipEntry(zw, "services.xml", BuildServicesXML(stable)); err != nil {
		return nil, err
	}
	if err := writeZipEntry(zw, "hosts.xml", BuildHostsXML()); err != nil {
		return nil, err
	}
	for _, m := range stable {
		name := "schemas/" + searchabstraction.SanitizeDocType(string(m.TypeID)) + ".sd"
		if err := writeZipEntry(zw, name, BuildSchemaSD(m)); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeZipEntry(zw *zip.Writer, name, body string) error {
	w, err := zw.Create(name)
	if err != nil {
		return fmt.Errorf("zip create %s: %w", name, err)
	}
	if _, err := w.Write([]byte(body)); err != nil {
		return fmt.Errorf("zip write %s: %w", name, err)
	}
	return nil
}
