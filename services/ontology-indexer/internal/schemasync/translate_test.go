package schemasync

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

func TestMappingFromPayloadPreservesPropertyMetadata(t *testing.T) {
	t.Parallel()
	in := ObjectTypePayload{
		APIName:    "Aircraft",
		Name:       "Aircraft",
		PrimaryKey: "id",
		Properties: []PropertyPayload{
			{Name: "tail_number", PropertyType: "string", Searchable: true, Filterable: true},
			{Name: "max_passengers", PropertyType: "integer", Sortable: true, Filterable: true},
			{Name: "weight_kg", PropertyType: "double", Sortable: true},
			{Name: "first_flight_at", PropertyType: "datetime", Sortable: true},
			{Name: "is_active", PropertyType: "boolean", Filterable: true},
			{Name: "tags", PropertyType: "string", IsArray: true, Searchable: true},
			{Name: "registration_country", PropertyType: "", BaseType: "string", Filterable: true},
			{Name: "rotor_count", PropertyType: "", TypeFamily: "integer"},
		},
	}
	out := MappingFromPayload(in)
	assert.Equal(t, repos.TypeId("Aircraft"), out.TypeID)
	assert.Equal(t, "Aircraft", out.APIName)
	assert.Equal(t, "id", out.PrimaryKey)
	require.Len(t, out.Fields, 8)
	assert.Equal(t, searchabstraction.MappingField{
		Name: "tail_number", Type: searchabstraction.FieldString, Searchable: true, Filterable: true,
	}, out.Fields[0])
	assert.Equal(t, searchabstraction.FieldInteger, out.Fields[1].Type)
	assert.Equal(t, searchabstraction.FieldDouble, out.Fields[2].Type)
	assert.Equal(t, searchabstraction.FieldDate, out.Fields[3].Type)
	assert.Equal(t, searchabstraction.FieldBoolean, out.Fields[4].Type)
	assert.True(t, out.Fields[5].IsArray)
	assert.Equal(t, searchabstraction.FieldString, out.Fields[6].Type, "base_type fallback")
	assert.Equal(t, searchabstraction.FieldInteger, out.Fields[7].Type, "type_family fallback")
}

func TestMappingFromPayloadUnknownTypeMapsToUnknown(t *testing.T) {
	t.Parallel()
	out := MappingFromPayload(ObjectTypePayload{
		APIName: "Mystery",
		Properties: []PropertyPayload{
			{Name: "weird", PropertyType: "ufo_coordinates"},
		},
	})
	require.Len(t, out.Fields, 1)
	assert.Equal(t, searchabstraction.FieldUnknown, out.Fields[0].Type)
}

func TestMappingFromPayloadAPINameFallsBackToName(t *testing.T) {
	t.Parallel()
	out := MappingFromPayload(ObjectTypePayload{Name: "Spaceship"})
	assert.Equal(t, repos.TypeId("Spaceship"), out.TypeID)
}
