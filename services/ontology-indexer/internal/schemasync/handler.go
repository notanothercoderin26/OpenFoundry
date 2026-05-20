package schemasync

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// Outcome mirrors runtime.RecordOutcome semantics but lives in this
// package to avoid an import cycle. The runtime translates back when
// returning to the projection loop.
type Outcome string

const (
	OutcomeRegistered   Outcome = "schema_registered"
	OutcomeDropped      Outcome = "schema_dropped"
	OutcomeSkippedNoOp  Outcome = "schema_skipped_no_registrar"
	OutcomeDecodeError  Outcome = "schema_decode_error"
	OutcomeIgnoredEvent Outcome = "schema_ignored_event"
)

// Handler routes one decoded record from `ontology.object_type.changed.v1`
// to the configured backend's MappingRegistrar (when present).
//
// Backend nil ⇒ all records become OutcomeSkippedNoOp (the indexer is
// running streaming-only without a search backend wired). This is the
// behaviour used by integration tests that exercise consumer wiring
// against an InMemorySearchBackend that does not implement
// MappingRegistrar.
type Handler struct {
	Backend searchabstraction.SearchBackend
	Log     *slog.Logger
}

// ProcessRecord decodes the envelope and dispatches register/drop.
// Malformed payloads are logged and reported as OutcomeDecodeError so
// the runtime commits the offset (poison pills do not block the loop).
func (h *Handler) ProcessRecord(ctx context.Context, value []byte) (Outcome, error) {
	log := h.Log
	if log == nil {
		log = slog.Default()
	}
	var env SchemaEventEnvelope
	if err := json.Unmarshal(value, &env); err != nil {
		log.Warn("schemasync: malformed envelope", slog.String("error", err.Error()))
		return OutcomeDecodeError, nil
	}
	if env.Aggregate != "" && env.Aggregate != "ontology_object_type" {
		// Topic carries other aggregates in some deployments — skip.
		return OutcomeIgnoredEvent, nil
	}
	registrar, ok := asRegistrar(h.Backend)
	switch env.EventType {
	case EventCreated, EventUpdated:
		if len(env.After) == 0 {
			log.Warn("schemasync: missing After payload", slog.String("event_type", string(env.EventType)))
			return OutcomeDecodeError, nil
		}
		var payload ObjectTypePayload
		if err := json.Unmarshal(env.After, &payload); err != nil {
			log.Warn("schemasync: bad After payload", slog.String("error", err.Error()))
			return OutcomeDecodeError, nil
		}
		mapping := MappingFromPayload(payload)
		if mapping.TypeID == "" {
			log.Warn("schemasync: payload has neither api_name nor name; skipping")
			return OutcomeDecodeError, nil
		}
		if !ok {
			log.Debug("schemasync: backend does not implement MappingRegistrar; skipping",
				slog.String("type_id", string(mapping.TypeID)))
			return OutcomeSkippedNoOp, nil
		}
		if err := registrar.RegisterTypeMapping(ctx, mapping); err != nil {
			return OutcomeRegistered, fmt.Errorf("RegisterTypeMapping %s: %w", mapping.TypeID, err)
		}
		log.Info("schemasync: registered mapping",
			slog.String("type_id", string(mapping.TypeID)),
			slog.Int("field_count", len(mapping.Fields)))
		return OutcomeRegistered, nil
	case EventDeleted:
		typeID, parseErr := typeIDForDelete(env)
		if parseErr != nil {
			log.Warn("schemasync: delete envelope had no usable identifier", slog.String("error", parseErr.Error()))
			return OutcomeDecodeError, nil
		}
		if !ok {
			log.Debug("schemasync: backend does not implement MappingRegistrar; skipping drop",
				slog.String("type_id", string(typeID)))
			return OutcomeSkippedNoOp, nil
		}
		if err := registrar.DropTypeMapping(ctx, "", typeID); err != nil {
			return OutcomeDropped, fmt.Errorf("DropTypeMapping %s: %w", typeID, err)
		}
		log.Info("schemasync: dropped mapping", slog.String("type_id", string(typeID)))
		return OutcomeDropped, nil
	default:
		log.Warn("schemasync: unknown event_type", slog.String("event_type", string(env.EventType)))
		return OutcomeIgnoredEvent, nil
	}
}

func asRegistrar(b searchabstraction.SearchBackend) (searchabstraction.MappingRegistrar, bool) {
	if b == nil {
		return nil, false
	}
	r, ok := b.(searchabstraction.MappingRegistrar)
	return r, ok
}

// typeIDForDelete pulls a TypeId from the Before payload when present
// (the canonical case from EnqueueSchemaEvent), falling back to
// AggregateID which the producer sets to the api_name on deletes.
func typeIDForDelete(env SchemaEventEnvelope) (repos.TypeId, error) {
	if len(env.Before) > 0 {
		var payload ObjectTypePayload
		if err := json.Unmarshal(env.Before, &payload); err == nil {
			m := MappingFromPayload(payload)
			if m.TypeID != "" {
				return m.TypeID, nil
			}
		}
	}
	if env.AggregateID != "" {
		return repos.TypeId(env.AggregateID), nil
	}
	return "", fmt.Errorf("no usable identifier in delete envelope")
}
