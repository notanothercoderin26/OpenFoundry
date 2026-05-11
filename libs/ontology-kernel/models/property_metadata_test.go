package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEnrichPropertyMetadataCoversBaseTypes(t *testing.T) {
	t.Parallel()
	cases := []struct {
		propertyType string
		baseType     string
		family       string
		arrayAllowed bool
	}{
		{"string", "string", "primitive", true},
		{"long", "integer", "numeric", true},
		{"decimal", "float", "numeric", true},
		{"boolean", "boolean", "primitive", true},
		{"date", "date", "temporal", true},
		{"timestamp", "timestamp", "temporal", true},
		{"geopoint", "geopoint", "geospatial", true},
		{"geojson", "geoshape", "geospatial", true},
		{"vector", "vector", "semantic", false},
		{"attachment", "attachment", "file", true},
		{"media_reference", "media_reference", "media", true},
		{"time_series", "time_series", "timeseries", false},
	}
	for _, tc := range cases {
		t.Run(tc.propertyType, func(t *testing.T) {
			property := Property{PropertyType: tc.propertyType}
			EnrichPropertyMetadata(&property)
			assert.Equal(t, tc.baseType, property.BaseType)
			assert.Equal(t, tc.family, property.TypeFamily)
			assert.Equal(t, tc.arrayAllowed, property.ArrayAllowed)
			assert.NotEmpty(t, property.TypeDisplayName)
			assert.NotEmpty(t, property.ValueShape)
		})
	}
}

func TestEnrichPropertyMetadataForTypedArray(t *testing.T) {
	t.Parallel()
	property := Property{PropertyType: "array<geopoint>"}

	EnrichPropertyMetadata(&property)

	require.True(t, property.IsArray)
	require.NotNil(t, property.ArrayItemType)
	assert.Equal(t, "array", property.BaseType)
	assert.Equal(t, "geopoint", *property.ArrayItemType)
	assert.Equal(t, "collection", property.TypeFamily)
	assert.Contains(t, property.SemanticHints, "geopoint")
}

func TestPropertyJSONShapeIncludesMetadataWhenEnriched(t *testing.T) {
	t.Parallel()
	property := Property{
		ID:           uuid.New(),
		ObjectTypeID: uuid.New(),
		Name:         "route",
		DisplayName:  "Route",
		PropertyType: "geoshape",
		CreatedAt:    time.Date(2026, 5, 11, 0, 0, 0, 0, time.UTC),
		UpdatedAt:    time.Date(2026, 5, 11, 0, 0, 0, 0, time.UTC),
	}
	EnrichPropertyMetadata(&property)

	out, err := json.Marshal(property)
	require.NoError(t, err)
	var view map[string]any
	require.NoError(t, json.Unmarshal(out, &view))
	for _, key := range []string{
		"property_type", "base_type", "type_family", "type_display_name",
		"value_shape", "is_array", "array_allowed", "searchable", "filterable",
		"sortable", "aggregatable", "semantic_hints",
	} {
		assert.Contains(t, view, key)
	}
	assert.Equal(t, "geoshape", view["base_type"])
	assert.Equal(t, "geospatial", view["type_family"])
}
