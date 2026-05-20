package schemasync

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	searchabstraction "github.com/openfoundry/openfoundry-go/libs/search-abstraction"
	repos "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// recordingBackend is a SearchBackend that also implements
// MappingRegistrar; it captures every call for assertions.
type recordingBackend struct {
	mu         sync.Mutex
	registered []searchabstraction.TypeMapping
	dropped    []repos.TypeId
	registerErr error
}

func (b *recordingBackend) Search(context.Context, repos.SearchQuery, repos.ReadConsistency) (repos.PagedResult[repos.SearchHit], error) {
	return repos.PagedResult[repos.SearchHit]{}, nil
}
func (b *recordingBackend) Index(context.Context, repos.IndexDoc) error { return nil }
func (b *recordingBackend) Delete(context.Context, repos.TenantId, repos.ObjectId) (bool, error) {
	return true, nil
}
func (b *recordingBackend) SearchVector(context.Context, repos.VectorQuery, repos.ReadConsistency) ([]repos.SearchHit, error) {
	return nil, repos.ErrVectorSearchUnsupported()
}
func (b *recordingBackend) BulkIndex(ctx context.Context, docs []repos.IndexDoc) (repos.BulkOutcome, error) {
	return repos.DefaultBulkIndex(ctx, b, docs)
}
func (b *recordingBackend) RegisterTypeMapping(_ context.Context, m searchabstraction.TypeMapping) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.registerErr != nil {
		return b.registerErr
	}
	b.registered = append(b.registered, m)
	return nil
}
func (b *recordingBackend) DropTypeMapping(_ context.Context, _ repos.TenantId, typeID repos.TypeId) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.dropped = append(b.dropped, typeID)
	return nil
}

// noRegistrarBackend implements SearchBackend but NOT MappingRegistrar
// — used to verify the fallback path.
type noRegistrarBackend struct{}

func (noRegistrarBackend) Search(context.Context, repos.SearchQuery, repos.ReadConsistency) (repos.PagedResult[repos.SearchHit], error) {
	return repos.PagedResult[repos.SearchHit]{}, nil
}
func (noRegistrarBackend) Index(context.Context, repos.IndexDoc) error { return nil }
func (noRegistrarBackend) Delete(context.Context, repos.TenantId, repos.ObjectId) (bool, error) {
	return true, nil
}
func (noRegistrarBackend) SearchVector(context.Context, repos.VectorQuery, repos.ReadConsistency) ([]repos.SearchHit, error) {
	return nil, repos.ErrVectorSearchUnsupported()
}
func (noRegistrarBackend) BulkIndex(ctx context.Context, docs []repos.IndexDoc) (repos.BulkOutcome, error) {
	return repos.BulkOutcome{}, nil
}

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func envelope(t *testing.T, eventType EventType, payload ObjectTypePayload, beforeOnly bool) []byte {
	t.Helper()
	after, err := json.Marshal(payload)
	require.NoError(t, err)
	env := SchemaEventEnvelope{
		SchemaVersion: 1,
		EventType:     eventType,
		Aggregate:     "ontology_object_type",
		AggregateID:   payload.APIName,
	}
	if beforeOnly {
		env.Before = after
	} else {
		env.After = after
	}
	raw, err := json.Marshal(env)
	require.NoError(t, err)
	return raw
}

func TestHandlerRegistersCreatedMapping(t *testing.T) {
	t.Parallel()
	be := &recordingBackend{}
	h := &Handler{Backend: be, Log: discardLog()}
	value := envelope(t, EventCreated, ObjectTypePayload{
		APIName:    "Aircraft",
		PrimaryKey: "id",
		Properties: []PropertyPayload{
			{Name: "tail_number", PropertyType: "string", Searchable: true, Filterable: true},
			{Name: "max_passengers", PropertyType: "integer", Sortable: true},
		},
	}, false)
	out, err := h.ProcessRecord(context.Background(), value)
	require.NoError(t, err)
	assert.Equal(t, OutcomeRegistered, out)
	require.Len(t, be.registered, 1)
	assert.Equal(t, repos.TypeId("Aircraft"), be.registered[0].TypeID)
	assert.Len(t, be.registered[0].Fields, 2)
}

func TestHandlerRegistersUpdatedMapping(t *testing.T) {
	t.Parallel()
	be := &recordingBackend{}
	h := &Handler{Backend: be, Log: discardLog()}
	value := envelope(t, EventUpdated, ObjectTypePayload{APIName: "Aircraft", Properties: []PropertyPayload{{Name: "id", PropertyType: "string"}}}, false)
	out, err := h.ProcessRecord(context.Background(), value)
	require.NoError(t, err)
	assert.Equal(t, OutcomeRegistered, out)
	require.Len(t, be.registered, 1)
}

func TestHandlerDropsDeletedMappingUsingBefore(t *testing.T) {
	t.Parallel()
	be := &recordingBackend{}
	h := &Handler{Backend: be, Log: discardLog()}
	value := envelope(t, EventDeleted, ObjectTypePayload{APIName: "Aircraft"}, true)
	out, err := h.ProcessRecord(context.Background(), value)
	require.NoError(t, err)
	assert.Equal(t, OutcomeDropped, out)
	assert.Equal(t, []repos.TypeId{"Aircraft"}, be.dropped)
}

func TestHandlerDropsDeletedMappingFallsBackToAggregateID(t *testing.T) {
	t.Parallel()
	be := &recordingBackend{}
	h := &Handler{Backend: be, Log: discardLog()}
	env := SchemaEventEnvelope{
		SchemaVersion: 1,
		EventType:     EventDeleted,
		Aggregate:     "ontology_object_type",
		AggregateID:   "LegacyType",
	}
	value, err := json.Marshal(env)
	require.NoError(t, err)
	out, err := h.ProcessRecord(context.Background(), value)
	require.NoError(t, err)
	assert.Equal(t, OutcomeDropped, out)
	assert.Equal(t, []repos.TypeId{"LegacyType"}, be.dropped)
}

func TestHandlerSkipsWhenBackendLacksRegistrar(t *testing.T) {
	t.Parallel()
	h := &Handler{Backend: noRegistrarBackend{}, Log: discardLog()}
	value := envelope(t, EventCreated, ObjectTypePayload{APIName: "Aircraft", Properties: []PropertyPayload{{Name: "id", PropertyType: "string"}}}, false)
	out, err := h.ProcessRecord(context.Background(), value)
	require.NoError(t, err)
	assert.Equal(t, OutcomeSkippedNoOp, out)
}

func TestHandlerSurfacesRegistrarErrorForRetry(t *testing.T) {
	t.Parallel()
	be := &recordingBackend{registerErr: errors.New("vespa unavailable")}
	h := &Handler{Backend: be, Log: discardLog()}
	value := envelope(t, EventCreated, ObjectTypePayload{APIName: "Aircraft", Properties: []PropertyPayload{{Name: "id", PropertyType: "string"}}}, false)
	_, err := h.ProcessRecord(context.Background(), value)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "vespa unavailable")
}

func TestHandlerMalformedEnvelopeIsDecodeError(t *testing.T) {
	t.Parallel()
	h := &Handler{Backend: &recordingBackend{}, Log: discardLog()}
	out, err := h.ProcessRecord(context.Background(), []byte("{not json"))
	require.NoError(t, err)
	assert.Equal(t, OutcomeDecodeError, out)
}

func TestHandlerIgnoresOtherAggregates(t *testing.T) {
	t.Parallel()
	h := &Handler{Backend: &recordingBackend{}, Log: discardLog()}
	env := SchemaEventEnvelope{SchemaVersion: 1, EventType: EventCreated, Aggregate: "ontology_link_type", AggregateID: "owns"}
	value, err := json.Marshal(env)
	require.NoError(t, err)
	out, err := h.ProcessRecord(context.Background(), value)
	require.NoError(t, err)
	assert.Equal(t, OutcomeIgnoredEvent, out)
}
