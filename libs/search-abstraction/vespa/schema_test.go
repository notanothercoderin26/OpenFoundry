package vespa

import (
	"archive/zip"
	"bytes"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
)

func TestBuildSchemaSDIncludesBuiltinsAndIndexHints(t *testing.T) {
	t.Parallel()
	out := BuildSchemaSD(searchabstraction.TypeMapping{
		TypeID: "Aircraft",
		Fields: []searchabstraction.MappingField{
			{Name: "tail_number", Type: searchabstraction.FieldString, Searchable: true, Filterable: true},
			{Name: "max_passengers", Type: searchabstraction.FieldInteger, Sortable: true, Filterable: true},
			{Name: "weight_kg", Type: searchabstraction.FieldDouble, Sortable: true},
			{Name: "first_flight_at", Type: searchabstraction.FieldDate, Sortable: true},
			{Name: "is_active", Type: searchabstraction.FieldBoolean, Filterable: true},
			{Name: "tags", Type: searchabstraction.FieldString, IsArray: true},
			{Name: "weird", Type: searchabstraction.FieldUnknown},
		},
	})
	assert.Contains(t, out, "schema aircraft {")
	assert.Contains(t, out, "document aircraft {")
	// Builtin fields land first.
	for _, builtin := range []string{"field id type string", "field tenant type string", "field type_id type string", "field version type long"} {
		assert.Contains(t, out, builtin)
	}
	// String + searchable → index | attribute | summary + bm25.
	assert.Contains(t, out, "field tail_number type string")
	assert.Contains(t, out, "indexing: index | attribute | summary")
	assert.Contains(t, out, "index: enable-bm25")
	// Integer maps to int.
	assert.Contains(t, out, "field max_passengers type int")
	// Double maps to double, dates to long, bool to bool.
	assert.Contains(t, out, "field weight_kg type double")
	assert.Contains(t, out, "field first_flight_at type long")
	assert.Contains(t, out, "field is_active type bool")
	// Arrays wrap.
	assert.Contains(t, out, "field tags type array<string>")
	// Unknown type is dropped entirely.
	assert.NotContains(t, out, "field weird")
	// fieldset + rank-profile pin BM25 to the searchable string field.
	assert.Contains(t, out, "fieldset default {")
	assert.Contains(t, out, "fields: tail_number")
	assert.Contains(t, out, "bm25(tail_number)")
}

func TestBuildSchemaSDWithoutSearchableFieldsFallsBackToNativeRank(t *testing.T) {
	t.Parallel()
	out := BuildSchemaSD(searchabstraction.TypeMapping{TypeID: "Airport", Fields: []searchabstraction.MappingField{
		{Name: "icao", Type: searchabstraction.FieldString, Filterable: true},
	}})
	assert.Contains(t, out, "expression: nativeRank")
	assert.NotContains(t, out, "fieldset default")
}

func TestBuildServicesXMLListsEveryDocumentTypeAlphabetically(t *testing.T) {
	t.Parallel()
	xml := BuildServicesXML([]searchabstraction.TypeMapping{
		{TypeID: "Aircraft"},
		{TypeID: "Airport"},
	})
	assert.Contains(t, xml, `<document type="aircraft" mode="index"/>`)
	assert.Contains(t, xml, `<document type="airport" mode="index"/>`)
	assert.Less(t, indexOf(xml, "aircraft"), indexOf(xml, "airport"))
	assert.Contains(t, xml, "<redundancy>1</redundancy>")
	assert.Contains(t, xml, "<search/>")
	assert.Contains(t, xml, "<document-api/>")
}

func TestBuildApplicationPackageZipsServicesAndSchemas(t *testing.T) {
	t.Parallel()
	pkg, err := BuildApplicationPackage([]searchabstraction.TypeMapping{
		{TypeID: "Aircraft", Fields: []searchabstraction.MappingField{
			{Name: "tail_number", Type: searchabstraction.FieldString, Searchable: true},
		}},
		{TypeID: "Airport", Fields: []searchabstraction.MappingField{
			{Name: "icao", Type: searchabstraction.FieldString, Filterable: true},
		}},
	})
	require.NoError(t, err)
	require.NotEmpty(t, pkg)

	zr, err := zip.NewReader(bytes.NewReader(pkg), int64(len(pkg)))
	require.NoError(t, err)
	names := map[string]string{}
	for _, f := range zr.File {
		rc, err := f.Open()
		require.NoError(t, err)
		b, err := io.ReadAll(rc)
		require.NoError(t, err)
		_ = rc.Close()
		names[f.Name] = string(b)
	}
	assert.Contains(t, names, "services.xml")
	assert.Contains(t, names, "hosts.xml")
	assert.Contains(t, names, "schemas/aircraft.sd")
	assert.Contains(t, names, "schemas/airport.sd")
	assert.Contains(t, names["schemas/aircraft.sd"], "field tail_number type string")
}

func TestBuildApplicationPackageSkipsEmptyTypeID(t *testing.T) {
	t.Parallel()
	pkg, err := BuildApplicationPackage([]searchabstraction.TypeMapping{
		{TypeID: ""},
		{TypeID: "Aircraft"},
	})
	require.NoError(t, err)
	zr, err := zip.NewReader(bytes.NewReader(pkg), int64(len(pkg)))
	require.NoError(t, err)
	for _, f := range zr.File {
		assert.NotEqual(t, "schemas/.sd", f.Name, "empty type ids must not produce schema files")
	}
}

func indexOf(s, sub string) int {
	return bytes.Index([]byte(s), []byte(sub))
}
