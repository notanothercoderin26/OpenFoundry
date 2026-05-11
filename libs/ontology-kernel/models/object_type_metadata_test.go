package models

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestEnrichObjectTypeMetadata(t *testing.T) {
	t.Parallel()
	objectTypeID := uuid.New()
	pk := "id"
	icon := "walk"
	color := "#0f766e"
	objectType := ObjectType{
		ID:                 objectTypeID,
		Name:               "Trail",
		DisplayName:        "Trail",
		Description:        "Runnable trail.",
		PrimaryKeyProperty: &pk,
		Icon:               &icon,
		Color:              &color,
		OwnerID:            uuid.New(),
		CreatedAt:          time.Date(2026, 5, 11, 0, 0, 0, 0, time.UTC),
		UpdatedAt:          time.Date(2026, 5, 11, 0, 0, 0, 0, time.UTC),
	}
	properties := []Property{
		{ID: uuid.New(), ObjectTypeID: objectTypeID, Name: "label", DisplayName: "Label", PropertyType: "string"},
		{ID: uuid.New(), ObjectTypeID: objectTypeID, Name: "trailhead", DisplayName: "Trailhead", PropertyType: "geopoint"},
		{ID: uuid.New(), ObjectTypeID: objectTypeID, Name: "route", DisplayName: "Route", PropertyType: "geojson"},
	}

	EnrichObjectTypeMetadata(&objectType, properties)

	assert.Equal(t, "ri.ontology.main.object-type."+objectTypeID.String(), objectType.RID)
	assert.Equal(t, "Trail", objectType.APIName)
	assert.Equal(t, "Trails", *objectType.PluralDisplayName)
	assert.Equal(t, "id", objectType.PrimaryKey)
	assert.Equal(t, "label", *objectType.TitleProperty)
	assert.Equal(t, "active", objectType.Status)
	assert.Equal(t, "normal", objectType.Visibility)
	assert.Len(t, objectType.Properties, 3)
	assert.Equal(t, 3, objectType.PropertyCount)
	assert.Equal(t, []string{"label", "id"}, objectType.SearchablePropertyNames)
	assert.Equal(t, []string{"trailhead"}, objectType.GeoPointPropertyNames)
	assert.Equal(t, []string{"route"}, objectType.GeoShapePropertyNames)
}
