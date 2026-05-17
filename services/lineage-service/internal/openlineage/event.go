// Package openlineage decodes events that conform to the OpenLineage
// object model (https://openlineage.io/docs/spec/object-model) into the
// internal lineage-service representation.
//
// We accept the canonical RunEvent shape and a small set of permissive
// aliases so producers can emit slightly older OL versions (or the
// shorter form some Foundry-era pipelines still use) without a
// schema-registry hop.
package openlineage

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// EdgeType discriminates the relationship an edge encodes between a
// run and a dataset.
type EdgeType string

const (
	EdgeTypeInput  EdgeType = "INPUT"
	EdgeTypeOutput EdgeType = "OUTPUT"
)

// RunState mirrors the OL eventType values. Unknown event types are
// surfaced as StateOther so the consumer never drops them silently.
type RunState string

const (
	StateRunning  RunState = "RUNNING"
	StateComplete RunState = "COMPLETE"
	StateFailed   RunState = "FAILED"
	StateAborted  RunState = "ABORTED"
	StateOther    RunState = "OTHER"
)

// RunEvent is the subset of the OpenLineage RunEvent schema we
// persist. Facets are kept as raw JSON so we round-trip whatever the
// producer attached.
type RunEvent struct {
	EventType string          `json:"eventType"`
	EventTime string          `json:"eventTime"`
	Run       RunRef          `json:"run"`
	Job       JobRef          `json:"job"`
	Inputs    []DatasetRef    `json:"inputs"`
	Outputs   []DatasetRef    `json:"outputs"`
	Producer  string          `json:"producer,omitempty"`
	SchemaURL string          `json:"schemaURL,omitempty"`
}

// RunRef identifies one execution of a job. RunId is the OL UUID
// string; we store it as text to stay agnostic of UUID format choices.
type RunRef struct {
	RunID  string          `json:"runId"`
	Facets json.RawMessage `json:"facets,omitempty"`
}

// JobRef is the (namespace, name) tuple from OL.
type JobRef struct {
	Namespace string          `json:"namespace"`
	Name      string          `json:"name"`
	Facets    json.RawMessage `json:"facets,omitempty"`
}

// DatasetRef is the (namespace, name) dataset identifier. Facets carry
// dataset-level metadata (schema, owners, …) that we persist verbatim
// for v1 — column-level lineage is explicitly out of scope.
type DatasetRef struct {
	Namespace string          `json:"namespace"`
	Name      string          `json:"name"`
	Facets    json.RawMessage `json:"facets,omitempty"`
}

// ErrInvalidEvent is returned when a payload is missing fields the
// adapter cannot synthesise (run id, job namespace+name, eventType).
var ErrInvalidEvent = errors.New("openlineage: invalid event")

// DecodeEvent unmarshals a JSON payload and validates the minimum
// surface area we need to land the event in the graph tables.
func DecodeEvent(raw []byte) (*RunEvent, error) {
	if len(raw) == 0 {
		return nil, ErrInvalidEvent
	}
	var ev RunEvent
	if err := json.Unmarshal(raw, &ev); err != nil {
		return nil, err
	}
	if err := ev.Validate(); err != nil {
		return nil, err
	}
	return &ev, nil
}

// Validate enforces the minimum-required-field contract.
func (e *RunEvent) Validate() error {
	if e == nil {
		return ErrInvalidEvent
	}
	if strings.TrimSpace(e.Run.RunID) == "" {
		return ErrInvalidEvent
	}
	if strings.TrimSpace(e.Job.Namespace) == "" || strings.TrimSpace(e.Job.Name) == "" {
		return ErrInvalidEvent
	}
	if strings.TrimSpace(e.EventType) == "" {
		return ErrInvalidEvent
	}
	return nil
}

// State maps eventType to a RunState. Unknown types fall through to
// StateOther so the row still lands.
func (e *RunEvent) State() RunState {
	switch strings.ToUpper(strings.TrimSpace(e.EventType)) {
	case "START", "RUNNING":
		return StateRunning
	case "COMPLETE", "SUCCEEDED":
		return StateComplete
	case "FAIL", "FAILED":
		return StateFailed
	case "ABORT", "ABORTED":
		return StateAborted
	default:
		return StateOther
	}
}

// ParsedEventTime returns the EventTime as a time.Time. Accepts the OL
// canonical RFC3339Nano form and the shorter RFC3339 spelling. Returns
// the zero time when EventTime is missing or unparseable so callers
// can fall back to "now".
func (e *RunEvent) ParsedEventTime() time.Time {
	v := strings.TrimSpace(e.EventTime)
	if v == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
		return t.UTC()
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t.UTC()
	}
	return time.Time{}
}

// DatasetRID renders the canonical (namespace, name) → rid form. The
// rid is the primary key on lineage_datasets and is what /upstream and
// /downstream accept as a path segment. We pick `namespace/name` over
// the OL `namespace::name` form because it round-trips through HTTP
// URL-encoding without surprise.
func DatasetRID(namespace, name string) string {
	return strings.TrimSpace(namespace) + "/" + strings.TrimSpace(name)
}

// RID returns the canonical RID for this dataset reference.
func (d DatasetRef) RID() string { return DatasetRID(d.Namespace, d.Name) }
