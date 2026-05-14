// Package objects holds the kernel's object-storage helpers that the
// downstream handlers (rules, funnel, …) reach into:
//
//   - LoadObjectInstance / LoadRepoObjectFromStore — read paths.
//   - ApplyObjectWrite — the writeback-front wrapper that builds
//     the canonical `ontology.object.changed.v1` payload and routes
//     through `domain.ApplyObjectWithOutbox`.
//   - AppendObjectRevision — append an action-log "revision" entry
//     so the dashboard run-history stays observable.
//   - InstanceToRepoObject — pure projection from the handler view to
//     the storage Object.
//   - FindObjectIDByProperty — scan ObjectStore by type to find an
//     existing row by primary-key property value.
//   - ValueAsStoreText — pure JSON → store-text helper.
package objects

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/gocql/gocql"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	ontologykernel "github.com/openfoundry/openfoundry-go/libs/ontology-kernel"
	"github.com/openfoundry/openfoundry-go/libs/ontology-kernel/domain"
	storage "github.com/openfoundry/openfoundry-go/libs/storage-abstraction"
)

// LoadObjectInstance fetches an object by ID and projects it into the
// handler-facing ObjectInstance view.
func LoadObjectInstance(
	ctx context.Context,
	state *ontologykernel.AppState,
	claims *authmw.Claims,
	objectID uuid.UUID,
	consistency storage.ReadConsistency,
) (*domain.ObjectInstance, error) {
	tenant := domain.TenantFromClaims(claims)
	stored, err := state.Stores.Objects.Get(ctx, tenant, storage.ObjectId(objectID.String()), consistency)
	if err != nil {
		return nil, fmt.Errorf("object store get failed: %w", err)
	}
	if stored == nil {
		return nil, nil
	}
	return domain.ObjectStoreToObjectInstance(*stored, claims.OrgID), nil
}

// LoadRepoObjectFromStore is the LoadObjectInstance variant that
// returns the raw storage.Object so callers can read its Version for
// optimistic concurrency.
func LoadRepoObjectFromStore(
	ctx context.Context,
	state *ontologykernel.AppState,
	claims *authmw.Claims,
	objectID uuid.UUID,
	consistency storage.ReadConsistency,
) (*storage.Object, error) {
	tenant := domain.TenantFromClaims(claims)
	stored, err := state.Stores.Objects.Get(ctx, tenant, storage.ObjectId(objectID.String()), consistency)
	if err != nil {
		return nil, fmt.Errorf("object store get failed: %w", err)
	}
	return stored, nil
}

// InstanceToRepoObject projects an ObjectInstance into the storage
// Object wire shape. Pure — no IO. Used by ApplyObjectWrite to compose
// the payload it hands to writeback.
func InstanceToRepoObject(
	tenant storage.TenantId,
	object *domain.ObjectInstance,
	version uint64,
	properties json.RawMessage,
	marking string,
) storage.Object {
	var orgID *string
	if object.OrganizationID != nil {
		s := object.OrganizationID.String()
		orgID = &s
	}
	createdAtMs := object.CreatedAt.UnixMilli()
	owner := storage.OwnerId(object.CreatedBy.String())
	return storage.Object{
		Tenant:         tenant,
		ID:             storage.ObjectId(object.ID.String()),
		TypeID:         storage.TypeId(object.ObjectTypeID.String()),
		Version:        version,
		Payload:        properties,
		OrganizationID: orgID,
		CreatedAtMs:    &createdAtMs,
		UpdatedAtMs:    object.UpdatedAt.UnixMilli(),
		Owner:          &owner,
		Markings:       []storage.MarkingId{storage.MarkingId(marking)},
	}
}

// ApplyObjectWrite builds the canonical `ontology.object.changed.v1`
// payload, merges caller-supplied extras, and routes through
// `domain.ApplyObjectWithOutbox` so retries collapse on the
// deterministic event_id.
func ApplyObjectWrite(
	ctx context.Context,
	state *ontologykernel.AppState,
	claims *authmw.Claims,
	object *domain.ObjectInstance,
	expectedVersion *uint64,
	operation string,
	extra json.RawMessage,
) (domain.WritebackOutcome, error) {
	targetVersion := uint64(1)
	if expectedVersion != nil {
		targetVersion = *expectedVersion + 1
	}

	payload := map[string]any{
		"object_id":       object.ID,
		"object_type_id":  object.ObjectTypeID,
		"operation":       operation,
		"properties":      json.RawMessage(object.Properties),
		"actor_id":        claims.Sub,
		"organization_id": object.OrganizationID,
		"marking":         object.Marking,
		"version":         targetVersion,
	}
	if len(extra) > 0 && string(extra) != "null" {
		var asMap map[string]any
		if err := json.Unmarshal(extra, &asMap); err == nil {
			for k, v := range asMap {
				payload[k] = v
			}
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return domain.WritebackOutcome{}, fmt.Errorf("encode writeback payload: %w", err)
	}

	tenant := domain.TenantFromClaims(claims)
	repoObject := InstanceToRepoObject(tenant, object, targetVersion, object.Properties, object.Marking)
	return domain.ApplyObjectWithOutbox(ctx, state.DB, state.Stores.Objects,
		repoObject, expectedVersion, "object", "ontology.object.changed.v1", body)
}

// AppendObjectRevision appends a "revision" entry to the action log so
// `list_object_revisions` can replay history. `restoredFromRevisionNumber`
// is non-nil when the revision is a restore from an earlier snapshot.
func AppendObjectRevision(
	ctx context.Context,
	state *ontologykernel.AppState,
	claims *authmw.Claims,
	object *domain.ObjectInstance,
	operation string,
	revisionNumber int64,
	restoredFromRevisionNumber *int64,
) error {
	payload := map[string]any{
		"object_id":       object.ID,
		"object_type_id":  object.ObjectTypeID,
		"operation":       operation,
		"properties":      json.RawMessage(object.Properties),
		"marking":         object.Marking,
		"organization_id": object.OrganizationID,
		"changed_by":      claims.Sub,
		"revision_number": revisionNumber,
	}
	if restoredFromRevisionNumber != nil {
		payload["restored_from_revision_number"] = *restoredFromRevisionNumber
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode revision payload: %w", err)
	}
	objectID := storage.ObjectId(object.ID.String())
	// The action store is backed by Cassandra in production, where
	// `action_id` is a TimeUUID column. Mint a v1 UUID here; v7 fails
	// the gocql TimeUUID version check ("Invalid version for TimeUUID
	// type: 0x7").
	actionID := gocql.TimeUUID()
	return state.Stores.Actions.Append(ctx, storage.ActionLogEntry{
		Tenant:       domain.TenantFromClaims(claims),
		ActionID:     actionID.String(),
		Kind:         "revision",
		Subject:      claims.Sub.String(),
		Object:       &objectID,
		Payload:      body,
		RecordedAtMs: time.Now().UTC().UnixMilli(),
	})
}

// ValueAsStoreText is a pure JSON → store-text projection used by the
// primary-key scan path.
//
// Rules:
//   - JSON null → error ("primary key value cannot be null").
//   - JSON string → the inner string verbatim (NOT re-quoted).
//   - any other JSON type → its compact JSON encoding.
func ValueAsStoreText(value json.RawMessage) (string, error) {
	if len(value) == 0 || string(value) == "null" {
		return "", errors.New("primary key value cannot be null")
	}
	var asString string
	if err := json.Unmarshal(value, &asString); err == nil {
		return asString, nil
	}
	var anyVal any
	if err := json.Unmarshal(value, &anyVal); err != nil {
		return "", fmt.Errorf("failed to serialize property value: %w", err)
	}
	out, err := json.Marshal(anyVal)
	if err != nil {
		return "", fmt.Errorf("failed to serialize property value: %w", err)
	}
	return string(out), nil
}

// FindObjectIDByProperty walks every object of the given type (via
// ObjectStore.ListByType, paged at 200 per request) until it finds one
// whose property value matches `propertyValue`.
//
// Returns (nil, nil) when no row matches.
func FindObjectIDByProperty(
	ctx context.Context,
	state *ontologykernel.AppState,
	claims *authmw.Claims,
	objectTypeID uuid.UUID,
	propertyName, propertyValue string,
	consistency storage.ReadConsistency,
) (*uuid.UUID, error) {
	tenant := domain.TenantFromClaims(claims)
	typeID := storage.TypeId(objectTypeID.String())
	var token *string
	for {
		page, err := state.Stores.Objects.ListByType(ctx, tenant, typeID,
			storage.Page{Size: 200, Token: token}, consistency)
		if err != nil {
			return nil, fmt.Errorf("failed to scan object store for existing object: %w", err)
		}
		for _, obj := range page.Items {
			var props map[string]json.RawMessage
			if err := json.Unmarshal(obj.Payload, &props); err != nil {
				continue
			}
			raw, ok := props[propertyName]
			if !ok {
				continue
			}
			text, err := ValueAsStoreText(raw)
			if err != nil {
				return nil, err
			}
			if text == propertyValue {
				parsed, err := uuid.Parse(string(obj.ID))
				if err != nil {
					return nil, fmt.Errorf("object store returned invalid object id: %w", err)
				}
				return &parsed, nil
			}
		}
		if page.NextToken == nil {
			return nil, nil
		}
		token = page.NextToken
	}
}
