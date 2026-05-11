package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPropertyMetadataJSONShape(t *testing.T) {
	t.Parallel()
	property := Property{
		ID:           uuid.New(),
		ObjectTypeID: uuid.New(),
		Name:         "trailhead",
		DisplayName:  "Trailhead",
		PropertyType: "geopoint",
		CreatedAt:    time.Date(2026, 5, 11, 0, 0, 0, 0, time.UTC),
		UpdatedAt:    time.Date(2026, 5, 11, 0, 0, 0, 0, time.UTC),
	}

	EnrichPropertyMetadata(&property)

	out, err := json.Marshal(property)
	require.NoError(t, err)
	var view map[string]any
	require.NoError(t, json.Unmarshal(out, &view))
	assert.Equal(t, "geopoint", view["base_type"])
	assert.Equal(t, "geospatial", view["type_family"])
	assert.Equal(t, "lat-lon-object", view["value_shape"])
	assert.Equal(t, true, view["filterable"])
	assert.Equal(t, false, view["sortable"])
	assert.Equal(t, []any{"geospatial", "point"}, view["semantic_hints"])
}
