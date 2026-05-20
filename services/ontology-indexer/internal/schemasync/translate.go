// Package schemasync consumes `ontology.object_type.changed.v1` and
// pushes per-type mappings to the search backend (when it implements
// `searchabstraction.MappingRegistrar`). This is the "schema-aware
// mapping registration" closure for B03 §G5.
//
// The package owns:
//   - the envelope shape (a deliberate, minimal subset of the producer
//     in services/ontology-definition-service/internal/repo/events.go —
//     duplicated rather than imported so the indexer stays decoupled
//     from the producer's internal models);
//   - the ObjectType → TypeMapping translation;
//   - the consumer-side Handler that turns a Kafka record into the
//     right MappingRegistrar call.
package schemasync

import (
	"encoding/json"
	"strings"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// EventType discriminates the schema mutation. Mirrors the producer.
type EventType string

const (
	EventCreated EventType = "created"
	EventUpdated EventType = "updated"
	EventDeleted EventType = "deleted"
)

// SchemaEventEnvelope is the wire envelope on
// `ontology.object_type.changed.v1`. Only the fields the indexer
// actually consumes are typed; unknown fields ignored.
type SchemaEventEnvelope struct {
	SchemaVersion int             `json:"schema_version"`
	EventType     EventType       `json:"event_type"`
	Aggregate     string          `json:"aggregate"`
	AggregateID   string          `json:"aggregate_id"`
	Before        json.RawMessage `json:"before,omitempty"`
	After         json.RawMessage `json:"after,omitempty"`
}

// ObjectTypePayload is the projection of the ObjectType row the
// envelope carries in Before/After. Fields the indexer doesn't need
// (audit, restricted views, lineage) are deliberately absent — the
// JSON decoder ignores unknown keys.
type ObjectTypePayload struct {
	APIName    string             `json:"api_name"`
	Name       string             `json:"name"`
	PrimaryKey string             `json:"primary_key"`
	Properties []PropertyPayload  `json:"properties"`
}

// PropertyPayload is the per-property projection. The producer uses
// `property_type` as the canonical type string (e.g. "string",
// "double", "datetime") with `base_type` as a fallback for legacy
// rows; we accept both.
type PropertyPayload struct {
	Name         string `json:"name"`
	PropertyType string `json:"property_type"`
	BaseType     string `json:"base_type,omitempty"`
	TypeFamily   string `json:"type_family,omitempty"`
	ValueShape   string `json:"value_shape,omitempty"`
	IsArray      bool   `json:"is_array"`
	Searchable   bool   `json:"searchable"`
	Sortable     bool   `json:"sortable"`
	Filterable   bool   `json:"filterable"`
}

// MappingFromPayload translates the producer's ObjectType wire shape
// into the search-backend-agnostic TypeMapping. The TypeID is the
// `api_name` (Vespa-friendly identifier) when present, falling back
// to `name`.
func MappingFromPayload(p ObjectTypePayload) searchabstraction.TypeMapping {
	typeID := strings.TrimSpace(p.APIName)
	if typeID == "" {
		typeID = strings.TrimSpace(p.Name)
	}
	fields := make([]searchabstraction.MappingField, 0, len(p.Properties))
	for _, prop := range p.Properties {
		fields = append(fields, searchabstraction.MappingField{
			Name:       prop.Name,
			Type:       mapFieldType(prop),
			IsArray:    prop.IsArray,
			Searchable: prop.Searchable,
			Sortable:   prop.Sortable,
			Filterable: prop.Filterable,
		})
	}
	return searchabstraction.TypeMapping{
		TypeID:     repos.TypeId(typeID),
		APIName:    p.APIName,
		PrimaryKey: p.PrimaryKey,
		Fields:     fields,
	}
}

// mapFieldType normalises the producer's free-form property_type
// (mirroring services/ontology-definition-service/internal/models/
// property_type_metadata.go) to the search-abstraction's
// MappingFieldType. Unknown types fall back to FieldUnknown — backends
// can decide how to handle that (Vespa typically drops the field).
func mapFieldType(p PropertyPayload) searchabstraction.MappingFieldType {
	t := strings.ToLower(strings.TrimSpace(p.PropertyType))
	if t == "" {
		t = strings.ToLower(strings.TrimSpace(p.BaseType))
	}
	if family := strings.ToLower(strings.TrimSpace(p.TypeFamily)); family != "" {
		if mapped, ok := familyToField[family]; ok {
			return mapped
		}
	}
	if mapped, ok := propertyTypeToField[t]; ok {
		return mapped
	}
	return searchabstraction.FieldUnknown
}

var propertyTypeToField = map[string]searchabstraction.MappingFieldType{
	"string":     searchabstraction.FieldString,
	"text":       searchabstraction.FieldText,
	"longtext":   searchabstraction.FieldText,
	"longtext_v1": searchabstraction.FieldText,
	"integer":    searchabstraction.FieldInteger,
	"int":        searchabstraction.FieldInteger,
	"int32":      searchabstraction.FieldInteger,
	"long":       searchabstraction.FieldLong,
	"int64":      searchabstraction.FieldLong,
	"bigint":     searchabstraction.FieldLong,
	"double":     searchabstraction.FieldDouble,
	"float":      searchabstraction.FieldDouble,
	"decimal":    searchabstraction.FieldDouble,
	"numeric":    searchabstraction.FieldDouble,
	"boolean":    searchabstraction.FieldBoolean,
	"bool":       searchabstraction.FieldBoolean,
	"date":       searchabstraction.FieldDate,
	"datetime":   searchabstraction.FieldDate,
	"timestamp":  searchabstraction.FieldDate,
	"time":       searchabstraction.FieldDate,
	"geopoint":   searchabstraction.FieldGeo,
	"geoshape":   searchabstraction.FieldGeo,
}

var familyToField = map[string]searchabstraction.MappingFieldType{
	"string":   searchabstraction.FieldString,
	"text":     searchabstraction.FieldText,
	"integer":  searchabstraction.FieldInteger,
	"long":     searchabstraction.FieldLong,
	"numeric":  searchabstraction.FieldDouble,
	"boolean":  searchabstraction.FieldBoolean,
	"date":     searchabstraction.FieldDate,
	"datetime": searchabstraction.FieldDate,
	"geo":      searchabstraction.FieldGeo,
}
