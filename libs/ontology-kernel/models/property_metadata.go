package models

import "strings"

// PropertyTypeMetadata describes the Foundry-like base type semantics
// that Workshop, Pipeline Builder, object queries, and inline edits need
// to reason about a property without hardcoding raw property_type strings.
type PropertyTypeMetadata struct {
	BaseType        string
	TypeFamily      string
	TypeDisplayName string
	ValueShape      string
	IsArray         bool
	ArrayItemType   *string
	ArrayAllowed    bool
	Searchable      bool
	Filterable      bool
	Sortable        bool
	Aggregatable    bool
	SemanticHints   []string
}

// EnrichPropertyMetadata attaches canonical base type metadata to a
// direct object property. The persisted PropertyType remains unchanged.
func EnrichPropertyMetadata(property *Property) {
	if property == nil {
		return
	}
	metadata := PropertyTypeMetadataFor(property.PropertyType)
	property.BaseType = metadata.BaseType
	property.TypeFamily = metadata.TypeFamily
	property.TypeDisplayName = metadata.TypeDisplayName
	property.ValueShape = metadata.ValueShape
	property.IsArray = metadata.IsArray
	property.ArrayItemType = metadata.ArrayItemType
	property.ArrayAllowed = metadata.ArrayAllowed
	property.Searchable = metadata.Searchable
	property.Filterable = metadata.Filterable
	property.Sortable = metadata.Sortable
	property.Aggregatable = metadata.Aggregatable
	property.SemanticHints = append([]string(nil), metadata.SemanticHints...)
}

func EnrichSharedPropertyTypeMetadata(property *SharedPropertyType) {
	if property == nil {
		return
	}
	metadata := PropertyTypeMetadataFor(property.PropertyType)
	property.BaseType = metadata.BaseType
	property.TypeFamily = metadata.TypeFamily
	property.TypeDisplayName = metadata.TypeDisplayName
	property.ValueShape = metadata.ValueShape
	property.IsArray = metadata.IsArray
	property.ArrayItemType = metadata.ArrayItemType
	property.ArrayAllowed = metadata.ArrayAllowed
	property.Searchable = metadata.Searchable
	property.Filterable = metadata.Filterable
	property.Sortable = metadata.Sortable
	property.Aggregatable = metadata.Aggregatable
	property.SemanticHints = append([]string(nil), metadata.SemanticHints...)
}

func EnrichInterfacePropertyMetadata(property *InterfaceProperty) {
	if property == nil {
		return
	}
	metadata := PropertyTypeMetadataFor(property.PropertyType)
	property.BaseType = metadata.BaseType
	property.TypeFamily = metadata.TypeFamily
	property.TypeDisplayName = metadata.TypeDisplayName
	property.ValueShape = metadata.ValueShape
	property.IsArray = metadata.IsArray
	property.ArrayItemType = metadata.ArrayItemType
	property.ArrayAllowed = metadata.ArrayAllowed
	property.Searchable = metadata.Searchable
	property.Filterable = metadata.Filterable
	property.Sortable = metadata.Sortable
	property.Aggregatable = metadata.Aggregatable
	property.SemanticHints = append([]string(nil), metadata.SemanticHints...)
}

func PropertyTypeMetadataFor(propertyType string) PropertyTypeMetadata {
	isArray, itemType := parseArrayPropertyType(propertyType)
	base := CanonicalPropertyBaseType(propertyType)
	if isArray && itemType != nil {
		base = CanonicalPropertyBaseType(*itemType)
	}

	metadata := metadataForBaseType(base)
	metadata.IsArray = isArray
	if isArray {
		itemHint := ""
		if itemType != nil {
			item := base
			metadata.ArrayItemType = &item
			itemHint = item
		}
		metadata.BaseType = "array"
		metadata.TypeFamily = "collection"
		metadata.TypeDisplayName = "Array"
		metadata.ValueShape = "array"
		metadata.Searchable = itemType != nil && metadata.Searchable && isStringLikeType(base)
		metadata.Filterable = true
		metadata.Sortable = false
		metadata.Aggregatable = false
		metadata.SemanticHints = uniqueNonEmptyStrings(append([]string{"array", itemHint}, metadata.SemanticHints...))
	}
	return metadata
}

func CanonicalPropertyBaseType(propertyType string) string {
	isArray, itemType := parseArrayPropertyType(propertyType)
	if isArray {
		if itemType == nil {
			return "array"
		}
		return CanonicalPropertyBaseType(*itemType)
	}
	kind := normalizePropertyType(propertyType)
	switch {
	case kind == "string" || kind == "str" || kind == "text":
		return "string"
	case kind == "integer" || kind == "int" || kind == "long" || kind == "short" || kind == "byte":
		return "integer"
	case kind == "float" || kind == "double" || kind == "decimal" || kind == "number" || kind == "numeric":
		return "float"
	case kind == "boolean" || kind == "bool":
		return "boolean"
	case kind == "date":
		return "date"
	case kind == "timestamp" || kind == "datetime":
		return "timestamp"
	case kind == "json":
		return "json"
	case kind == "array":
		return "array"
	case kind == "vector" || kind == "embedding":
		return "vector"
	case kind == "reference" || kind == "object_reference":
		return "reference"
	case isGeoPointType(kind):
		return "geopoint"
	case isGeoShapeType(kind):
		return "geoshape"
	case kind == "media_reference" || kind == "media" || kind == "mediaref":
		return "media_reference"
	case kind == "attachment" || kind == "file":
		return "attachment"
	case kind == "time_series" || kind == "timeseries" || kind == "time_series_reference":
		return "time_series"
	case kind == "struct":
		return "struct"
	default:
		return kind
	}
}

func metadataForBaseType(base string) PropertyTypeMetadata {
	switch base {
	case "string":
		return propertyTypeMetadata(base, "primitive", "String", "string", true, true, true, false, true, "string")
	case "integer":
		return propertyTypeMetadata(base, "numeric", "Integer", "integer", true, true, true, true, false, "numeric")
	case "float":
		return propertyTypeMetadata(base, "numeric", "Float", "number", true, true, true, true, false, "numeric")
	case "boolean":
		return propertyTypeMetadata(base, "primitive", "Boolean", "boolean", true, true, true, false, false, "boolean")
	case "date":
		return propertyTypeMetadata(base, "temporal", "Date", "date-string", true, true, true, false, false, "temporal")
	case "timestamp":
		return propertyTypeMetadata(base, "temporal", "Timestamp", "timestamp-string", true, true, true, false, false, "temporal")
	case "json":
		return propertyTypeMetadata(base, "structured", "JSON", "json", true, false, false, false, false, "json")
	case "array":
		return propertyTypeMetadata(base, "collection", "Array", "array", true, true, false, false, false, "array")
	case "vector":
		return propertyTypeMetadata(base, "semantic", "Vector", "numeric-array", false, false, false, false, false, "vector", "embedding")
	case "reference":
		return propertyTypeMetadata(base, "reference", "Object reference", "string", true, true, true, false, true, "reference")
	case "geopoint":
		return propertyTypeMetadata(base, "geospatial", "Geopoint", "lat-lon-object", true, true, false, false, false, "geospatial", "point")
	case "geoshape":
		return propertyTypeMetadata(base, "geospatial", "Geoshape", "geojson-object-or-string", true, true, false, false, false, "geospatial", "shape")
	case "media_reference":
		return propertyTypeMetadata(base, "media", "Media reference", "media-reference", true, true, false, false, false, "media")
	case "attachment":
		return propertyTypeMetadata(base, "file", "Attachment", "attachment-reference", true, true, false, false, false, "attachment")
	case "time_series":
		return propertyTypeMetadata(base, "timeseries", "Time series", "time-series", false, false, false, false, false, "time_series", "temporal")
	case "struct":
		return propertyTypeMetadata(base, "structured", "Struct", "object", true, false, false, false, false, "struct")
	default:
		return propertyTypeMetadata(base, "unknown", strings.TrimSpace(base), "unknown", true, false, false, false, false)
	}
}

func propertyTypeMetadata(base, family, displayName, valueShape string, arrayAllowed, filterable, sortable, aggregatable, searchable bool, hints ...string) PropertyTypeMetadata {
	return PropertyTypeMetadata{
		BaseType:        base,
		TypeFamily:      family,
		TypeDisplayName: displayName,
		ValueShape:      valueShape,
		ArrayAllowed:    arrayAllowed,
		Searchable:      searchable,
		Filterable:      filterable,
		Sortable:        sortable,
		Aggregatable:    aggregatable,
		SemanticHints:   uniqueNonEmptyStrings(hints),
	}
}

func parseArrayPropertyType(propertyType string) (bool, *string) {
	raw := strings.TrimSpace(propertyType)
	if raw == "" {
		return false, nil
	}
	kind := normalizePropertyType(raw)
	if kind == "array" {
		return true, nil
	}
	if strings.HasSuffix(kind, "[]") {
		item := strings.TrimSuffix(kind, "[]")
		return true, &item
	}
	for _, prefix := range []string{"array<", "array_of_"} {
		if strings.HasPrefix(kind, prefix) {
			item := strings.TrimPrefix(kind, prefix)
			item = strings.TrimSuffix(item, ">")
			if item != "" {
				return true, &item
			}
		}
	}
	return false, nil
}
