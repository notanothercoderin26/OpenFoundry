package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

// Querier is the slice of pgx behavior the batch flow needs. Both
// *pgxpool.Pool and pgx.Tx satisfy it, which lets the same statement
// helpers run transactionally inside SaveBatch and non-transactionally
// from one-shot audit reads.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// SaveBatch applies a working-state save atomically.
//
// Semantics:
//   - all edits succeed and the transaction commits, or
//   - any single failure (validation error, version conflict, db error)
//     rolls the entire transaction back; the response carries per-edit
//     reasons keyed by ClientID so the Review-edits modal can render
//     them in its Warnings / Errors / Conflicts tabs.
//
// Successful results carry the post-mutation resource snapshot in
// `After` so the client can rehydrate its cache without a follow-up
// fetch. Failed batches leave the database untouched; previously-OK
// entries in the slice are downgraded to "skipped" so the UI keeps
// the unsaved-changes badge accurate.
func (r *Repo) SaveBatch(ctx context.Context, req *models.BatchSaveRequest, actorID uuid.UUID) (*models.BatchSaveResponse, error) {
	resp := &models.BatchSaveResponse{Status: models.BatchStatusOK, Results: []models.BatchEditResult{}}
	if req == nil || len(req.Edits) == 0 {
		resp.BatchID = uuid.New()
		return resp, nil
	}
	resp.BatchID = uuid.New()
	source := req.Source
	if source == "" {
		source = "ontology-manager"
	}

	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("batch-save: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	audit := newAuditWriter(tx)
	results := make([]models.BatchEditResult, len(req.Edits))
	failed := false

	for i, edit := range req.Edits {
		result, err := r.applyBatchEdit(ctx, tx, audit, edit, actorID, resp.BatchID, source)
		if err != nil {
			return nil, fmt.Errorf("batch-save: edit %d (%s %s): %w",
				i, edit.Op, edit.Resource, err)
		}
		results[i] = result
		if result.Status != models.BatchStatusOK {
			failed = true
			markSkipped(results, i, req.Edits)
			break
		}
	}

	if failed {
		resp.Status = "failed"
		resp.Results = results
		return resp, nil
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("batch-save: commit: %w", err)
	}
	resp.Results = results
	return resp, nil
}

// markSkipped degrades both already-applied edits (which will be rolled
// back) and not-yet-applied edits to status="skipped". The UI uses this
// to keep its dirty-state counter consistent: every edit in the batch
// is still pending, none was persisted.
func markSkipped(results []models.BatchEditResult, failedIdx int, edits []models.BatchEdit) {
	for j := 0; j < failedIdx; j++ {
		if results[j].Status == models.BatchStatusOK {
			results[j].Status = models.BatchStatusSkipped
			results[j].NewVersion = nil
			results[j].After = nil
		}
	}
	for j := failedIdx + 1; j < len(edits); j++ {
		next := edits[j]
		results[j] = models.BatchEditResult{
			ClientID: next.ClientID,
			Resource: next.Resource,
			Op:       next.Op,
			Status:   models.BatchStatusSkipped,
		}
	}
}

// applyBatchEdit dispatches a single edit by (Resource, Op). It never
// returns an `error` for domain failures (conflicts, validation
// errors): those are surfaced as result.Status values so the caller
// can collect them across the whole batch before rolling back. It
// returns a Go error only for unexpected infrastructure failures.
func (r *Repo) applyBatchEdit(ctx context.Context, tx pgx.Tx, audit *auditWriter,
	edit models.BatchEdit, actorID, batchID uuid.UUID, source string,
) (models.BatchEditResult, error) {
	base := models.BatchEditResult{
		ClientID: edit.ClientID,
		Resource: edit.Resource,
		Op:       edit.Op,
	}
	if err := validateEditEnvelope(edit); err != nil {
		return errResult(base, "invalid_edit", "", err.Error()), nil
	}
	switch edit.Resource {
	case models.BatchResourceObjectType:
		return r.applyObjectTypeEdit(ctx, tx, audit, edit, actorID, batchID, source, base)
	case models.BatchResourceLinkType:
		return r.applyLinkTypeEdit(ctx, tx, audit, edit, actorID, batchID, source, base)
	case models.BatchResourceObjectTypeGroup:
		return r.applyObjectTypeGroupEdit(ctx, tx, audit, edit, actorID, batchID, source, base)
	case models.BatchResourceProperty:
		return r.applyPropertyEdit(ctx, tx, audit, edit, actorID, batchID, source, base)
	default:
		return errResult(base, "unsupported_resource", "",
			fmt.Sprintf("unsupported resource %q", edit.Resource)), nil
	}
}

func validateEditEnvelope(edit models.BatchEdit) error {
	if strings.TrimSpace(edit.ClientID) == "" {
		return errors.New("client_id is required")
	}
	switch edit.Op {
	case models.BatchOpCreate, models.BatchOpUpdate, models.BatchOpDelete:
	default:
		return fmt.Errorf("unsupported op %q", edit.Op)
	}
	if edit.Op != models.BatchOpCreate {
		if edit.ID == nil {
			return errors.New("id is required for update/delete")
		}
		if edit.ExpectedVersion == nil {
			return errors.New("expected_version is required for update/delete")
		}
	}
	return nil
}

// ── Object types ───────────────────────────────────────────────────────

func (r *Repo) applyObjectTypeEdit(ctx context.Context, tx pgx.Tx, audit *auditWriter,
	edit models.BatchEdit, actorID, batchID uuid.UUID, source string,
	base models.BatchEditResult,
) (models.BatchEditResult, error) {
	switch edit.Op {
	case models.BatchOpCreate:
		var body models.CreateObjectTypeRequest
		if err := json.Unmarshal(edit.Body, &body); err != nil {
			return errResult(base, "invalid_body", "", err.Error()), nil
		}
		// Let the caller pre-assign the uuid via either the envelope
		// or the body, so the Review-edits modal can stage related
		// creates (e.g. a property that references this object type)
		// in the same batch without a round trip to resolve ids.
		if body.ID == nil && edit.ID != nil {
			body.ID = edit.ID
		}
		created, err := r.createObjectTypeTx(ctx, tx, &body, actorID)
		if err != nil {
			return errResult(base, "create_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:      &batchID,
			ResourceKind: models.BatchResourceObjectType,
			ResourceID:   created.ID,
			Operation:    models.BatchOpCreate,
			ChangedBy:    actorID,
			NewVersion:   created.Version,
			After:        created,
			Source:       source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceObjectType, models.BatchOpCreate, created.ID, created.Version, actorID, batchID, nil, created); err != nil {
			return models.BatchEditResult{}, err
		}
		return okResult(base, created.ID, created.Version, created), nil

	case models.BatchOpUpdate:
		current, err := getObjectTypeForUpdate(ctx, tx, *edit.ID)
		if err != nil {
			return errResult(base, "get_failed", "", err.Error()), nil
		}
		if current == nil {
			return errResult(base, "not_found", "", "object type not found"), nil
		}
		if current.Version != *edit.ExpectedVersion {
			return conflictResult(base, current.ID, current.Version, current), nil
		}
		var body models.UpdateObjectTypeRequest
		if err := json.Unmarshal(edit.Body, &body); err != nil {
			return errResult(base, "invalid_body", "", err.Error()), nil
		}
		updated, err := r.updateObjectTypeTx(ctx, tx, current, &body)
		if err != nil {
			return errResult(base, "update_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:         &batchID,
			ResourceKind:    models.BatchResourceObjectType,
			ResourceID:      updated.ID,
			Operation:       models.BatchOpUpdate,
			ChangedBy:       actorID,
			ExpectedVersion: edit.ExpectedVersion,
			NewVersion:      updated.Version,
			Before:          current,
			After:           updated,
			FieldDiffs:      diffObjects(current, updated),
			Source:          source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceObjectType, models.BatchOpUpdate, updated.ID, updated.Version, actorID, batchID, current, updated); err != nil {
			return models.BatchEditResult{}, err
		}
		return okResult(base, updated.ID, updated.Version, updated), nil

	case models.BatchOpDelete:
		current, err := getObjectTypeForUpdate(ctx, tx, *edit.ID)
		if err != nil {
			return errResult(base, "get_failed", "", err.Error()), nil
		}
		if current == nil {
			return errResult(base, "not_found", "", "object type not found"), nil
		}
		if current.Version != *edit.ExpectedVersion {
			return conflictResult(base, current.ID, current.Version, current), nil
		}
		if _, err := tx.Exec(ctx, `DELETE FROM ontology_schema.object_types WHERE id = $1`, current.ID); err != nil {
			return errResult(base, "delete_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:         &batchID,
			ResourceKind:    models.BatchResourceObjectType,
			ResourceID:      current.ID,
			Operation:       models.BatchOpDelete,
			ChangedBy:       actorID,
			ExpectedVersion: edit.ExpectedVersion,
			NewVersion:      current.Version,
			Before:          current,
			Source:          source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceObjectType, models.BatchOpDelete, current.ID, current.Version, actorID, batchID, current, nil); err != nil {
			return models.BatchEditResult{}, err
		}
		base.ResourceID = &current.ID
		base.Status = models.BatchStatusOK
		return base, nil
	}
	return errResult(base, "unsupported_op", "", "unreachable"), nil
}

// ── Link types ─────────────────────────────────────────────────────────

func (r *Repo) applyLinkTypeEdit(ctx context.Context, tx pgx.Tx, audit *auditWriter,
	edit models.BatchEdit, actorID, batchID uuid.UUID, source string,
	base models.BatchEditResult,
) (models.BatchEditResult, error) {
	switch edit.Op {
	case models.BatchOpCreate:
		var body models.CreateLinkTypeRequest
		if err := json.Unmarshal(edit.Body, &body); err != nil {
			return errResult(base, "invalid_body", "", err.Error()), nil
		}
		if body.ID == nil && edit.ID != nil {
			body.ID = edit.ID
		}
		created, err := r.createLinkTypeTx(ctx, tx, &body, actorID)
		if err != nil {
			return errResult(base, "create_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:      &batchID,
			ResourceKind: models.BatchResourceLinkType,
			ResourceID:   created.ID,
			Operation:    models.BatchOpCreate,
			ChangedBy:    actorID,
			NewVersion:   created.Version,
			After:        created,
			Source:       source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceLinkType, models.BatchOpCreate, created.ID, created.Version, actorID, batchID, nil, created); err != nil {
			return models.BatchEditResult{}, err
		}
		return okResult(base, created.ID, created.Version, created), nil

	case models.BatchOpUpdate:
		current, err := getLinkTypeForUpdate(ctx, tx, *edit.ID)
		if err != nil {
			return errResult(base, "get_failed", "", err.Error()), nil
		}
		if current == nil {
			return errResult(base, "not_found", "", "link type not found"), nil
		}
		if current.Version != *edit.ExpectedVersion {
			return conflictResult(base, current.ID, current.Version, current), nil
		}
		var body models.UpdateLinkTypeRequest
		if err := json.Unmarshal(edit.Body, &body); err != nil {
			return errResult(base, "invalid_body", "", err.Error()), nil
		}
		updated, err := r.updateLinkTypeTx(ctx, tx, current, &body)
		if err != nil {
			return errResult(base, "update_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:         &batchID,
			ResourceKind:    models.BatchResourceLinkType,
			ResourceID:      updated.ID,
			Operation:       models.BatchOpUpdate,
			ChangedBy:       actorID,
			ExpectedVersion: edit.ExpectedVersion,
			NewVersion:      updated.Version,
			Before:          current,
			After:           updated,
			FieldDiffs:      diffObjects(current, updated),
			Source:          source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceLinkType, models.BatchOpUpdate, updated.ID, updated.Version, actorID, batchID, current, updated); err != nil {
			return models.BatchEditResult{}, err
		}
		return okResult(base, updated.ID, updated.Version, updated), nil

	case models.BatchOpDelete:
		current, err := getLinkTypeForUpdate(ctx, tx, *edit.ID)
		if err != nil {
			return errResult(base, "get_failed", "", err.Error()), nil
		}
		if current == nil {
			return errResult(base, "not_found", "", "link type not found"), nil
		}
		if current.Version != *edit.ExpectedVersion {
			return conflictResult(base, current.ID, current.Version, current), nil
		}
		if _, err := tx.Exec(ctx, `DELETE FROM ontology_schema.link_types WHERE id = $1`, current.ID); err != nil {
			return errResult(base, "delete_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:         &batchID,
			ResourceKind:    models.BatchResourceLinkType,
			ResourceID:      current.ID,
			Operation:       models.BatchOpDelete,
			ChangedBy:       actorID,
			ExpectedVersion: edit.ExpectedVersion,
			NewVersion:      current.Version,
			Before:          current,
			Source:          source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceLinkType, models.BatchOpDelete, current.ID, current.Version, actorID, batchID, current, nil); err != nil {
			return models.BatchEditResult{}, err
		}
		base.ResourceID = &current.ID
		base.Status = models.BatchStatusOK
		return base, nil
	}
	return errResult(base, "unsupported_op", "", "unreachable"), nil
}

// ── Object type groups ─────────────────────────────────────────────────

func (r *Repo) applyObjectTypeGroupEdit(ctx context.Context, tx pgx.Tx, audit *auditWriter,
	edit models.BatchEdit, actorID, batchID uuid.UUID, source string,
	base models.BatchEditResult,
) (models.BatchEditResult, error) {
	switch edit.Op {
	case models.BatchOpCreate:
		var body models.CreateObjectTypeGroupRequest
		if err := json.Unmarshal(edit.Body, &body); err != nil {
			return errResult(base, "invalid_body", "", err.Error()), nil
		}
		if body.ID == nil && edit.ID != nil {
			body.ID = edit.ID
		}
		created, err := r.createObjectTypeGroupTx(ctx, tx, &body, actorID)
		if err != nil {
			return errResult(base, "create_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:      &batchID,
			ResourceKind: models.BatchResourceObjectTypeGroup,
			ResourceID:   created.ID,
			Operation:    models.BatchOpCreate,
			ChangedBy:    actorID,
			NewVersion:   created.Version,
			After:        created,
			Source:       source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceObjectTypeGroup, models.BatchOpCreate, created.ID, created.Version, actorID, batchID, nil, created); err != nil {
			return models.BatchEditResult{}, err
		}
		return okResult(base, created.ID, created.Version, created), nil

	case models.BatchOpUpdate:
		current, err := getObjectTypeGroupForUpdate(ctx, tx, *edit.ID)
		if err != nil {
			return errResult(base, "get_failed", "", err.Error()), nil
		}
		if current == nil {
			return errResult(base, "not_found", "", "object type group not found"), nil
		}
		if current.Version != *edit.ExpectedVersion {
			return conflictResult(base, current.ID, current.Version, current), nil
		}
		var body models.UpdateObjectTypeGroupRequest
		if err := json.Unmarshal(edit.Body, &body); err != nil {
			return errResult(base, "invalid_body", "", err.Error()), nil
		}
		updated, err := r.updateObjectTypeGroupTx(ctx, tx, current, &body, actorID)
		if err != nil {
			return errResult(base, "update_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:         &batchID,
			ResourceKind:    models.BatchResourceObjectTypeGroup,
			ResourceID:      updated.ID,
			Operation:       models.BatchOpUpdate,
			ChangedBy:       actorID,
			ExpectedVersion: edit.ExpectedVersion,
			NewVersion:      updated.Version,
			Before:          current,
			After:           updated,
			FieldDiffs:      diffObjects(current, updated),
			Source:          source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceObjectTypeGroup, models.BatchOpUpdate, updated.ID, updated.Version, actorID, batchID, current, updated); err != nil {
			return models.BatchEditResult{}, err
		}
		return okResult(base, updated.ID, updated.Version, updated), nil

	case models.BatchOpDelete:
		current, err := getObjectTypeGroupForUpdate(ctx, tx, *edit.ID)
		if err != nil {
			return errResult(base, "get_failed", "", err.Error()), nil
		}
		if current == nil {
			return errResult(base, "not_found", "", "object type group not found"), nil
		}
		if current.Version != *edit.ExpectedVersion {
			return conflictResult(base, current.ID, current.Version, current), nil
		}
		if _, err := tx.Exec(ctx,
			`UPDATE ontology_schema.object_types SET group_names = array_remove(group_names, $1), updated_at = NOW() WHERE $1 = ANY(group_names)`,
			current.Name); err != nil {
			return errResult(base, "delete_failed", "", err.Error()), nil
		}
		if _, err := tx.Exec(ctx,
			`DELETE FROM ontology_schema.ontology_project_resources WHERE resource_kind = 'object_type_group' AND resource_id = $1`,
			current.ID); err != nil {
			return errResult(base, "delete_failed", "", err.Error()), nil
		}
		if _, err := tx.Exec(ctx, `DELETE FROM ontology_schema.object_type_groups WHERE id = $1`, current.ID); err != nil {
			return errResult(base, "delete_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:         &batchID,
			ResourceKind:    models.BatchResourceObjectTypeGroup,
			ResourceID:      current.ID,
			Operation:       models.BatchOpDelete,
			ChangedBy:       actorID,
			ExpectedVersion: edit.ExpectedVersion,
			NewVersion:      current.Version,
			Before:          current,
			Source:          source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceObjectTypeGroup, models.BatchOpDelete, current.ID, current.Version, actorID, batchID, current, nil); err != nil {
			return models.BatchEditResult{}, err
		}
		base.ResourceID = &current.ID
		base.Status = models.BatchStatusOK
		return base, nil
	}
	return errResult(base, "unsupported_op", "", "unreachable"), nil
}

// ── Properties ─────────────────────────────────────────────────────────

func (r *Repo) applyPropertyEdit(ctx context.Context, tx pgx.Tx, audit *auditWriter,
	edit models.BatchEdit, actorID, batchID uuid.UUID, source string,
	base models.BatchEditResult,
) (models.BatchEditResult, error) {
	switch edit.Op {
	case models.BatchOpCreate:
		var body batchCreatePropertyBody
		if err := json.Unmarshal(edit.Body, &body); err != nil {
			return errResult(base, "invalid_body", "", err.Error()), nil
		}
		if body.ObjectTypeID == uuid.Nil {
			return errResult(base, "invalid_body", "object_type_id", "object_type_id is required"), nil
		}
		if body.ID == nil && edit.ID != nil {
			body.ID = edit.ID
		}
		created, err := r.createPropertyTx(ctx, tx, body.ObjectTypeID, &body.CreatePropertyRequest)
		if err != nil {
			return errResult(base, "create_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:      &batchID,
			ResourceKind: models.BatchResourceProperty,
			ResourceID:   created.ID,
			Operation:    models.BatchOpCreate,
			ChangedBy:    actorID,
			NewVersion:   created.Version,
			After:        created,
			Source:       source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceProperty, models.BatchOpCreate, created.ID, created.Version, actorID, batchID, nil, created); err != nil {
			return models.BatchEditResult{}, err
		}
		return okResult(base, created.ID, created.Version, created), nil

	case models.BatchOpUpdate:
		current, err := getPropertyForUpdate(ctx, tx, *edit.ID)
		if err != nil {
			return errResult(base, "get_failed", "", err.Error()), nil
		}
		if current == nil {
			return errResult(base, "not_found", "", "property not found"), nil
		}
		if current.Version != *edit.ExpectedVersion {
			return conflictResult(base, current.ID, current.Version, current), nil
		}
		var body models.UpdatePropertyRequest
		if err := json.Unmarshal(edit.Body, &body); err != nil {
			return errResult(base, "invalid_body", "", err.Error()), nil
		}
		updated, err := r.updatePropertyTx(ctx, tx, current, &body)
		if err != nil {
			return errResult(base, "update_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:         &batchID,
			ResourceKind:    models.BatchResourceProperty,
			ResourceID:      updated.ID,
			Operation:       models.BatchOpUpdate,
			ChangedBy:       actorID,
			ExpectedVersion: edit.ExpectedVersion,
			NewVersion:      updated.Version,
			Before:          current,
			After:           updated,
			FieldDiffs:      diffObjects(current, updated),
			Source:          source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceProperty, models.BatchOpUpdate, updated.ID, updated.Version, actorID, batchID, current, updated); err != nil {
			return models.BatchEditResult{}, err
		}
		return okResult(base, updated.ID, updated.Version, updated), nil

	case models.BatchOpDelete:
		current, err := getPropertyForUpdate(ctx, tx, *edit.ID)
		if err != nil {
			return errResult(base, "get_failed", "", err.Error()), nil
		}
		if current == nil {
			return errResult(base, "not_found", "", "property not found"), nil
		}
		if current.Version != *edit.ExpectedVersion {
			return conflictResult(base, current.ID, current.Version, current), nil
		}
		if _, err := tx.Exec(ctx, `DELETE FROM ontology_schema.properties WHERE id = $1`, current.ID); err != nil {
			return errResult(base, "delete_failed", "", err.Error()), nil
		}
		if err := audit.write(ctx, auditEntry{
			BatchID:         &batchID,
			ResourceKind:    models.BatchResourceProperty,
			ResourceID:      current.ID,
			Operation:       models.BatchOpDelete,
			ChangedBy:       actorID,
			ExpectedVersion: edit.ExpectedVersion,
			NewVersion:      current.Version,
			Before:          current,
			Source:          source,
		}); err != nil {
			return models.BatchEditResult{}, err
		}
		if err := emitOutboxForBatchEdit(ctx, tx, models.BatchResourceProperty, models.BatchOpDelete, current.ID, current.Version, actorID, batchID, current, nil); err != nil {
			return models.BatchEditResult{}, err
		}
		base.ResourceID = &current.ID
		base.Status = models.BatchStatusOK
		return base, nil
	}
	return errResult(base, "unsupported_op", "", "unreachable"), nil
}

// batchCreatePropertyBody extends CreatePropertyRequest with the
// owning ObjectTypeID because property creates inside a batch are not
// scoped by URL path.
type batchCreatePropertyBody struct {
	ObjectTypeID                  uuid.UUID `json:"object_type_id"`
	models.CreatePropertyRequest  `json:",inline"`
}

// emitOutboxForBatchEdit appends an `ontology.<resource>.changed.v1`
// event to the outbox in the same transaction as the primary mutation.
// The Lineage map propagates the batch_id so consumers can correlate
// the per-edit events that share a single Review-edits submit.
func emitOutboxForBatchEdit(
	ctx context.Context, tx pgx.Tx,
	resourceKind, op string,
	id uuid.UUID, version int,
	actorID, batchID uuid.UUID,
	before, after any,
) error {
	topic, aggregate, ok := batchTopicAndAggregate(resourceKind)
	if !ok {
		return fmt.Errorf("emit outbox: unknown resource %q", resourceKind)
	}
	eventType, ok := batchEventType(op)
	if !ok {
		return fmt.Errorf("emit outbox: unknown op %q", op)
	}
	return EnqueueSchemaEvent(ctx, tx, EventOptions{
		Topic:       topic,
		Aggregate:   aggregate,
		AggregateID: id.String(),
		EventType:   eventType,
		ActorID:     actorID,
		Version:     version,
		Before:      before,
		After:       after,
		Lineage:     map[string]string{"batch-id": batchID.String()},
	})
}

func batchTopicAndAggregate(resourceKind string) (string, string, bool) {
	switch resourceKind {
	case models.BatchResourceObjectType:
		return TopicObjectType, AggregateObjectType, true
	case models.BatchResourceLinkType:
		return TopicLinkType, AggregateLinkType, true
	case models.BatchResourceObjectTypeGroup:
		return TopicObjectTypeGroup, AggregateObjectTypeGroup, true
	case models.BatchResourceProperty:
		return TopicProperty, AggregateProperty, true
	case models.BatchResourceSharedPropertyType:
		return TopicSharedPropertyType, AggregateSharedPropertyType, true
	}
	return "", "", false
}

func batchEventType(op string) (EventType, bool) {
	switch op {
	case models.BatchOpCreate:
		return EventCreated, true
	case models.BatchOpUpdate:
		return EventUpdated, true
	case models.BatchOpDelete:
		return EventDeleted, true
	}
	return "", false
}

// ── Result helpers ─────────────────────────────────────────────────────

func okResult(base models.BatchEditResult, id uuid.UUID, version int, after any) models.BatchEditResult {
	out := base
	out.Status = models.BatchStatusOK
	out.ResourceID = &id
	v := version
	out.NewVersion = &v
	if after != nil {
		if raw, err := json.Marshal(after); err == nil {
			out.After = raw
		}
	}
	return out
}

func conflictResult(base models.BatchEditResult, id uuid.UUID, currentVersion int, currentBody any) models.BatchEditResult {
	out := base
	out.Status = models.BatchStatusConflict
	out.ResourceID = &id
	cv := currentVersion
	out.CurrentVersion = &cv
	if raw, err := json.Marshal(currentBody); err == nil {
		out.CurrentBody = raw
	}
	return out
}

func errResult(base models.BatchEditResult, code, field, message string) models.BatchEditResult {
	out := base
	out.Status = models.BatchStatusError
	out.Errors = []models.ValidationIssue{{
		Code:     code,
		Field:    field,
		Message:  message,
		Severity: "error",
	}}
	return out
}

// ── Tx-scoped read locks ──────────────────────────────────────────────
//
// Each "ForUpdate" helper locks the target row with SELECT … FOR UPDATE
// so concurrent batch saves serialize at the row level. We re-use the
// existing column / scan helpers from repo.go to keep the read shape
// consistent with the rest of the service.

func getObjectTypeForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*models.ObjectType, error) {
	row := tx.QueryRow(ctx, objectTypeSelect+` WHERE id = $1 FOR UPDATE`, id)
	v, err := scanObjectType(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

func getLinkTypeForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*models.LinkType, error) {
	row := tx.QueryRow(ctx, `SELECT `+linkTypeColumns+` FROM ontology_schema.link_types WHERE id = $1 FOR UPDATE`, id)
	v, err := scanLinkType(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

func getObjectTypeGroupForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*models.ObjectTypeGroup, error) {
	// Lock only the group row; the COALESCE subqueries in
	// objectTypeGroupColumns run as part of the same statement and
	// inherit the FOR UPDATE clause via the outer scan.
	row := tx.QueryRow(ctx,
		`SELECT `+objectTypeGroupColumns+`
		 FROM ontology_schema.object_type_groups g
		 WHERE g.id = $1 FOR UPDATE`, id)
	v, err := scanObjectTypeGroup(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

func getPropertyForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*models.Property, error) {
	row := tx.QueryRow(ctx,
		`SELECT `+propertyColumns+` FROM ontology_schema.properties WHERE id = $1 FOR UPDATE`, id)
	v, err := scanProperty(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

// ── Tx-scoped mutators ────────────────────────────────────────────────
//
// These mirror the existing public Create/Update methods but take a
// pgx.Tx so they run inside the batch transaction. They duplicate
// just enough SQL to stay self-contained — refactoring the public
// methods to share these would touch every caller and is left for a
// follow-up cleanup.

func (r *Repo) createObjectTypeTx(ctx context.Context, tx pgx.Tx, body *models.CreateObjectTypeRequest, ownerID uuid.UUID) (*models.ObjectType, error) {
	id := uuid.New()
	if body.ID != nil && *body.ID != uuid.Nil {
		id = *body.ID
	}
	editable := false
	if body.Editable != nil {
		editable = *body.Editable
	}
	datasourceType := normalizeBackingDatasourceType(ptrString(body.BackingDatasourceType), body.BackingRestrictedViewID, body.RestrictedViewID)
	restrictedViewID := firstNonEmptyStringPtr(body.RestrictedViewID, body.BackingRestrictedViewID)
	if datasourceType != "restricted_view" {
		restrictedViewID = nil
	}
	policy := normalizeJSONRaw(body.RestrictedViewPolicy)
	policyVersion := intValue(body.RestrictedViewPolicyVersion)
	registeredPolicyVersion := intValue(body.RestrictedViewRegisteredPolicyVersion)
	indexedPolicyVersion := intValue(body.RestrictedViewIndexedPolicyVersion)
	storageMode := normalizedStorageMode(ptrString(body.RestrictedViewStorageMode))
	policyUpdatedAt := body.RestrictedViewPolicyUpdatedAt
	if len(policy) > 0 && string(policy) != "{}" && policyUpdatedAt == nil {
		now := time.Now().UTC()
		policyUpdatedAt = &now
	}
	row := tx.QueryRow(ctx,
		`INSERT INTO ontology_schema.object_types
		    (id, name, display_name, description, primary_key_property,
		     icon, color, owner_id, plural_display_name, editable,
		     backing_dataset_id, backing_dataset_rid, backing_datasource_type,
		     backing_restricted_view_id, restricted_view_policy,
		     restricted_view_policy_version, restricted_view_registered_policy_version,
		     restricted_view_indexed_policy_version, restricted_view_storage_mode,
		     restricted_view_policy_updated_at, restricted_view_registered_at,
		     restricted_view_indexed_at, pipeline_rid, managed_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
		         $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
		 RETURNING `+objectTypeReturning,
		id, strings.TrimSpace(body.Name), body.DisplayName, body.Description,
		body.PrimaryKeyProperty, body.Icon, body.Color, ownerID,
		body.PluralDisplayName, editable, body.BackingDatasetID,
		body.BackingDatasetRID, datasourceType, restrictedViewID, policy,
		policyVersion, registeredPolicyVersion, indexedPolicyVersion, storageMode,
		policyUpdatedAt, body.RestrictedViewRegisteredAt,
		body.RestrictedViewIndexedAt, body.PipelineRID, body.ManagedBy,
	)
	v, err := scanObjectType(row)
	if err != nil {
		return nil, err
	}
	models.EnrichObjectTypeMetadata(v, nil)
	return v, nil
}

func (r *Repo) updateObjectTypeTx(ctx context.Context, tx pgx.Tx, current *models.ObjectType, body *models.UpdateObjectTypeRequest) (*models.ObjectType, error) {
	dn := current.DisplayName
	if body.DisplayName != nil {
		dn = *body.DisplayName
	}
	desc := current.Description
	if body.Description != nil {
		desc = *body.Description
	}
	pk := current.PrimaryKeyProperty
	if body.PrimaryKeyProperty != nil {
		pk = body.PrimaryKeyProperty
	}
	icon := current.Icon
	if body.Icon != nil {
		icon = body.Icon
	}
	color := current.Color
	if body.Color != nil {
		color = body.Color
	}
	plural := current.PluralDisplayName
	if body.PluralDisplayName != nil {
		plural = body.PluralDisplayName
	}
	editable := current.Editable
	if body.Editable != nil {
		editable = *body.Editable
	}
	backingDatasetID := current.BackingDatasetID
	if body.BackingDatasetID != nil {
		backingDatasetID = body.BackingDatasetID
	}
	backingDatasetRID := current.BackingDatasetRID
	if body.BackingDatasetRID != nil {
		backingDatasetRID = body.BackingDatasetRID
	}
	datasourceType := current.BackingDatasourceType
	if body.BackingDatasourceType != nil {
		datasourceType = normalizeBackingDatasourceType(*body.BackingDatasourceType, body.BackingRestrictedViewID, body.RestrictedViewID)
	}
	if datasourceType == "" {
		datasourceType = normalizeBackingDatasourceType("", current.BackingRestrictedViewID, nil)
	}
	restrictedViewID := current.BackingRestrictedViewID
	if body.RestrictedViewID != nil || body.BackingRestrictedViewID != nil {
		restrictedViewID = firstNonEmptyStringPtr(body.RestrictedViewID, body.BackingRestrictedViewID)
	}
	if datasourceType != "restricted_view" {
		restrictedViewID = nil
	}
	policy := current.RestrictedViewPolicy
	policyUpdatedAt := current.RestrictedViewPolicyUpdatedAt
	if len(body.RestrictedViewPolicy) > 0 {
		policy = normalizeJSONRaw(body.RestrictedViewPolicy)
		policyUpdatedAt = body.RestrictedViewPolicyUpdatedAt
		if policyUpdatedAt == nil {
			now := time.Now().UTC()
			policyUpdatedAt = &now
		}
	}
	policyVersion := current.RestrictedViewPolicyVersion
	if body.RestrictedViewPolicyVersion != nil {
		policyVersion = *body.RestrictedViewPolicyVersion
	}
	registeredPolicyVersion := current.RestrictedViewRegisteredPolicyVersion
	if body.RestrictedViewRegisteredPolicyVersion != nil {
		registeredPolicyVersion = *body.RestrictedViewRegisteredPolicyVersion
	}
	indexedPolicyVersion := current.RestrictedViewIndexedPolicyVersion
	if body.RestrictedViewIndexedPolicyVersion != nil {
		indexedPolicyVersion = *body.RestrictedViewIndexedPolicyVersion
	}
	storageMode := current.RestrictedViewStorageMode
	if body.RestrictedViewStorageMode != nil {
		storageMode = normalizedStorageMode(*body.RestrictedViewStorageMode)
	}
	registeredAt := current.RestrictedViewRegisteredAt
	if body.RestrictedViewRegisteredAt != nil {
		registeredAt = body.RestrictedViewRegisteredAt
	}
	indexedAt := current.RestrictedViewIndexedAt
	if body.RestrictedViewIndexedAt != nil {
		indexedAt = body.RestrictedViewIndexedAt
	}
	pipelineRID := current.PipelineRID
	if body.PipelineRID != nil {
		pipelineRID = body.PipelineRID
	}
	managedBy := current.ManagedBy
	if body.ManagedBy != nil {
		managedBy = body.ManagedBy
	}
	row := tx.QueryRow(ctx,
		`UPDATE ontology_schema.object_types SET
		    display_name = $2, description = $3, primary_key_property = $4,
		    icon = $5, color = $6, updated_at = $7,
		    plural_display_name = $8, editable = $9, backing_dataset_id = $10,
		    backing_dataset_rid = $11, backing_datasource_type = $12,
		    backing_restricted_view_id = $13, restricted_view_policy = $14,
		    restricted_view_policy_version = $15,
		    restricted_view_registered_policy_version = $16,
		    restricted_view_indexed_policy_version = $17,
		    restricted_view_storage_mode = $18,
		    restricted_view_policy_updated_at = $19,
		    restricted_view_registered_at = $20,
		    restricted_view_indexed_at = $21,
		    pipeline_rid = $22, managed_by = $23,
		    version = version + 1
		  WHERE id = $1
		  RETURNING `+objectTypeReturning,
		current.ID, dn, desc, pk, icon, color, time.Now().UTC(),
		plural, editable, backingDatasetID, backingDatasetRID,
		datasourceType, restrictedViewID, policy, policyVersion,
		registeredPolicyVersion, indexedPolicyVersion, storageMode,
		policyUpdatedAt, registeredAt, indexedAt,
		pipelineRID, managedBy,
	)
	return scanObjectType(row)
}

func (r *Repo) createLinkTypeTx(ctx context.Context, tx pgx.Tx, body *models.CreateLinkTypeRequest, ownerID uuid.UUID) (*models.LinkType, error) {
	id := uuid.New()
	if body.ID != nil && *body.ID != uuid.Nil {
		id = *body.ID
	}
	dn := body.DisplayName
	if dn == "" {
		dn = body.Name
	}
	card := body.Cardinality
	if card == "" {
		card = "many_to_many"
	}
	visibility := body.Visibility
	if visibility == "" {
		visibility = "normal"
	}
	mapping := body.LinkDatasourceMapping
	if mapping == nil {
		mapping = map[string]any{}
	}
	row := tx.QueryRow(ctx,
		`INSERT INTO ontology_schema.link_types
		 (id, name, display_name, description, source_type_id, target_type_id,
		  cardinality, label, reverse_label, visibility, link_datasource_mapping, owner_id, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
		 RETURNING `+linkTypeColumns,
		id, body.Name, dn, body.Description, body.SourceTypeID, body.TargetTypeID,
		card, body.Label, body.ReverseLabel, visibility, mapping, ownerID, time.Now().UTC())
	return scanLinkType(row)
}

func (r *Repo) updateLinkTypeTx(ctx context.Context, tx pgx.Tx, current *models.LinkType, body *models.UpdateLinkTypeRequest) (*models.LinkType, error) {
	dn := current.DisplayName
	if body.DisplayName != nil {
		dn = *body.DisplayName
	}
	desc := current.Description
	if body.Description != nil {
		desc = *body.Description
	}
	card := current.Cardinality
	if body.Cardinality != nil && *body.Cardinality != "" {
		card = *body.Cardinality
	}
	label := current.Label
	if body.Label != nil {
		label = *body.Label
	}
	rev := current.ReverseLabel
	if body.ReverseLabel != nil {
		rev = *body.ReverseLabel
	}
	vis := current.Visibility
	if body.Visibility != nil && *body.Visibility != "" {
		vis = *body.Visibility
	}
	mapping := current.LinkDatasourceMapping
	if body.LinkDatasourceMapping != nil {
		mapping = body.LinkDatasourceMapping
	}
	if mapping == nil {
		mapping = map[string]any{}
	}
	row := tx.QueryRow(ctx,
		`UPDATE ontology_schema.link_types SET
		   display_name = $2,
		   description = $3,
		   cardinality = $4,
		   label = $5,
		   reverse_label = $6,
		   visibility = $7,
		   link_datasource_mapping = $8,
		   updated_at = $9,
		   version = version + 1
		 WHERE id = $1
		 RETURNING `+linkTypeColumns,
		current.ID, dn, desc, card, label, rev, vis, mapping, time.Now().UTC())
	return scanLinkType(row)
}

func (r *Repo) createObjectTypeGroupTx(ctx context.Context, tx pgx.Tx, body *models.CreateObjectTypeGroupRequest, ownerID uuid.UUID) (*models.ObjectTypeGroup, error) {
	id := uuid.New()
	if body.ID != nil && *body.ID != uuid.Nil {
		id = *body.ID
	}
	name := strings.TrimSpace(body.Name)
	displayName := body.DisplayName
	if displayName == "" {
		displayName = name
	}
	visibility := body.Visibility
	if visibility == "" {
		visibility = "normal"
	}
	status := body.Status
	if status == "" {
		status = "active"
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO ontology_schema.object_type_groups
		    (id, name, display_name, description, visibility, status, owner_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
		id, name, displayName, body.Description, visibility, status, ownerID); err != nil {
		return nil, err
	}
	if body.ProjectID != nil && *body.ProjectID != uuid.Nil {
		if _, err := tx.Exec(ctx,
			`INSERT INTO ontology_schema.ontology_project_resources (project_id, resource_kind, resource_id, bound_by)
			 VALUES ($1, 'object_type_group', $2, $3)
			 ON CONFLICT (resource_kind, resource_id) DO UPDATE SET project_id = EXCLUDED.project_id, bound_by = EXCLUDED.bound_by`,
			*body.ProjectID, id, ownerID); err != nil {
			return nil, err
		}
	}
	if len(body.ObjectTypeIDs) > 0 {
		if err := replaceObjectTypeGroupMembers(ctx, tx, name, body.ObjectTypeIDs); err != nil {
			return nil, err
		}
	}
	return getObjectTypeGroupForUpdate(ctx, tx, id)
}

func (r *Repo) updateObjectTypeGroupTx(ctx context.Context, tx pgx.Tx, current *models.ObjectTypeGroup, body *models.UpdateObjectTypeGroupRequest, actorID uuid.UUID) (*models.ObjectTypeGroup, error) {
	name := current.Name
	if body.Name != nil && *body.Name != "" {
		name = *body.Name
	}
	displayName := current.DisplayName
	if body.DisplayName != nil {
		displayName = *body.DisplayName
	}
	description := current.Description
	if body.Description != nil {
		description = *body.Description
	}
	visibility := current.Visibility
	if body.Visibility != nil && *body.Visibility != "" {
		visibility = *body.Visibility
	}
	status := current.Status
	if body.Status != nil && *body.Status != "" {
		status = *body.Status
	}
	if _, err := tx.Exec(ctx,
		`UPDATE ontology_schema.object_type_groups
		 SET name = $2, display_name = $3, description = $4, visibility = $5, status = $6,
		     updated_at = $7, version = version + 1
		 WHERE id = $1`,
		current.ID, name, displayName, description, visibility, status, time.Now().UTC()); err != nil {
		return nil, err
	}
	if name != current.Name {
		if _, err := tx.Exec(ctx,
			`UPDATE ontology_schema.object_types
			 SET group_names = array_replace(group_names, $1, $2), updated_at = NOW()
			 WHERE $1 = ANY(group_names)`,
			current.Name, name); err != nil {
			return nil, err
		}
	}
	if body.ProjectID != nil {
		if *body.ProjectID == uuid.Nil {
			if _, err := tx.Exec(ctx,
				`DELETE FROM ontology_schema.ontology_project_resources WHERE resource_kind = 'object_type_group' AND resource_id = $1`,
				current.ID); err != nil {
				return nil, err
			}
		} else if _, err := tx.Exec(ctx,
			`INSERT INTO ontology_schema.ontology_project_resources (project_id, resource_kind, resource_id, bound_by)
			 VALUES ($1, 'object_type_group', $2, $3)
			 ON CONFLICT (resource_kind, resource_id) DO UPDATE SET project_id = EXCLUDED.project_id, bound_by = EXCLUDED.bound_by`,
			*body.ProjectID, current.ID, actorID); err != nil {
			return nil, err
		}
	}
	if body.ObjectTypeIDs != nil {
		if err := replaceObjectTypeGroupMembers(ctx, tx, name, *body.ObjectTypeIDs); err != nil {
			return nil, err
		}
	}
	return getObjectTypeGroupForUpdate(ctx, tx, current.ID)
}

func (r *Repo) createPropertyTx(ctx context.Context, tx pgx.Tx, typeID uuid.UUID, body *models.CreatePropertyRequest) (*models.Property, error) {
	id := uuid.New()
	if body.ID != nil && *body.ID != uuid.Nil {
		id = *body.ID
	}
	dn := body.DisplayName
	if dn == "" {
		dn = body.Name
	}
	row := tx.QueryRow(ctx,
		`INSERT INTO ontology_schema.properties
		 (id, object_type_id, name, display_name, description, property_type,
		  required, unique_constraint, time_dependent,
		  default_value, validation_rules, inline_edit_config,
		  created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
		 RETURNING `+propertyColumns,
		id, typeID, body.Name, dn, body.Description, body.PropertyType,
		body.Required, body.UniqueConstraint, body.TimeDependent,
		body.DefaultValue, body.ValidationRules, body.InlineEditConfig,
		time.Now().UTC())
	return scanProperty(row)
}

func (r *Repo) updatePropertyTx(ctx context.Context, tx pgx.Tx, current *models.Property, body *models.UpdatePropertyRequest) (*models.Property, error) {
	displayName := current.DisplayName
	if body.DisplayName != nil {
		displayName = *body.DisplayName
	}
	desc := current.Description
	if body.Description != nil {
		desc = *body.Description
	}
	propertyType := current.PropertyType
	if body.PropertyType != nil && *body.PropertyType != "" {
		propertyType = *body.PropertyType
	}
	required := current.Required
	if body.Required != nil {
		required = *body.Required
	}
	unique := current.UniqueConstraint
	if body.UniqueConstraint != nil {
		unique = *body.UniqueConstraint
	}
	timeDep := current.TimeDependent
	if body.TimeDependent != nil {
		timeDep = *body.TimeDependent
	}
	defaultValue := current.DefaultValue
	if body.DefaultValue != nil {
		defaultValue = body.DefaultValue
	}
	validationRules := current.ValidationRules
	if body.ValidationRules != nil {
		validationRules = body.ValidationRules
	}
	inlineEditConfig := current.InlineEditConfig
	if body.InlineEditConfig != nil {
		inlineEditConfig = body.InlineEditConfig
	}
	row := tx.QueryRow(ctx,
		`UPDATE ontology_schema.properties SET
		   display_name = $2,
		   description = $3,
		   property_type = $4,
		   required = $5,
		   unique_constraint = $6,
		   time_dependent = $7,
		   default_value = $8,
		   validation_rules = $9,
		   inline_edit_config = $10,
		   updated_at = $11,
		   version = version + 1
		 WHERE id = $1
		 RETURNING `+propertyColumns,
		current.ID, displayName, desc, propertyType, required, unique, timeDep,
		defaultValue, validationRules, inlineEditConfig, time.Now().UTC())
	return scanProperty(row)
}

// ── Diff helpers ──────────────────────────────────────────────────────

// diffObjects produces a list of field-level diffs between two JSON-
// marshalable values. The History view renders these as
// strikethrough(before) / green(after) pairs, so the algorithm only
// has to be correct for top-level fields; nested objects are emitted
// as one diff entry covering the whole subtree, which matches what
// the modal renders today.
func diffObjects(before, after any) []models.AuditDiffEntry {
	beforeMap := toFlatMap(before)
	afterMap := toFlatMap(after)
	out := []models.AuditDiffEntry{}
	keys := mergedKeys(beforeMap, afterMap)
	for _, k := range keys {
		if k == "version" || k == "updated_at" || k == "created_at" {
			continue
		}
		b, bOK := beforeMap[k]
		a, aOK := afterMap[k]
		if bOK && aOK && reflect.DeepEqual(b, a) {
			continue
		}
		entry := models.AuditDiffEntry{Path: k}
		if bOK {
			if raw, err := json.Marshal(b); err == nil {
				entry.Before = raw
			}
		}
		if aOK {
			if raw, err := json.Marshal(a); err == nil {
				entry.After = raw
			}
		}
		out = append(out, entry)
	}
	return out
}

func toFlatMap(v any) map[string]any {
	if v == nil {
		return map[string]any{}
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return map[string]any{}
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func mergedKeys(a, b map[string]any) []string {
	seen := map[string]struct{}{}
	for k := range a {
		seen[k] = struct{}{}
	}
	for k := range b {
		seen[k] = struct{}{}
	}
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
