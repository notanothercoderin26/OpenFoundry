// Package repo owns the action-type write path lifted out of the
// kernel (B02 §Deferred follow-up — closed). The kernel's
// `libs/ontology-kernel/handlers/actions/actions.go` continues to
// serve List / Get / Validate / Execute / WhatIf / InlineEdit /
// Upload — only the three schema-mutation routes (POST, PUT/PATCH,
// DELETE on /actions[/{id}]) come here so we can pair the SQL with
// libs/outbox.Enqueue inside the same transaction per ADR-0022.
//
// Persistence target: the `ontology_schema.action_types` table
// declared in the consolidated migration shipped by
// `services/ontology-definition-service/internal/repo/migrations/0001_ontology_schema_consolidated.sql`.
// Both services share the `openfoundry_ontology_service` database, so
// the table is already in place by the time this service boots.
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	kmodels "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/models"
)

// Repo is the SQL surface for action-type schema mutations. The
// AppState (kernel) keeps the read path going through
// `state.Stores.Definitions`; this Repo only owns Create / Update /
// Delete so the write+outbox pair stays atomic.
type Repo struct{ Pool *pgxpool.Pool }

// actionTypeReturning is the column list returned by INSERT / UPDATE
// statements — kept in lock-step with the columns the
// `ontology_schema.action_types` table declares in migration 0001.
const actionTypeReturning = `id, name, display_name, description, object_type_id,
	operation_kind, COALESCE(input_schema, '[]'::jsonb), COALESCE(config, 'null'::jsonb),
	confirmation_required, permission_key,
	COALESCE(authorization_policy, '{}'::jsonb), COALESCE(form_schema, '{}'::jsonb),
	owner_id, created_at, updated_at`

// CreateActionType inserts a row in `ontology_schema.action_types`
// and emits an `ontology.action_type.changed.v1` `created` event in
// the same transaction. Returns the inserted row hydrated as a
// kernel-compatible `ActionType` so callers can re-use the existing
// JSON shape without translating.
func (r *Repo) CreateActionType(ctx context.Context, body *kmodels.CreateActionTypeRequest, ownerID uuid.UUID) (*kmodels.ActionType, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*kmodels.ActionType, error) {
		id, _ := uuid.NewV7()
		displayName := body.Name
		if body.DisplayName != nil && *body.DisplayName != "" {
			displayName = *body.DisplayName
		}
		description := ""
		if body.Description != nil {
			description = *body.Description
		}
		inputSchemaJSON, err := json.Marshal(coalesceInputSchema(body.InputSchema))
		if err != nil {
			return nil, fmt.Errorf("encode input_schema: %w", err)
		}
		formSchemaJSON, err := json.Marshal(coalesceFormSchema(body.FormSchema))
		if err != nil {
			return nil, fmt.Errorf("encode form_schema: %w", err)
		}
		authPolicyJSON, err := json.Marshal(coalesceAuthPolicy(body.AuthorizationPolicy))
		if err != nil {
			return nil, fmt.Errorf("encode authorization_policy: %w", err)
		}
		config := body.Config
		if len(config) == 0 {
			config = json.RawMessage("null")
		}
		confirmation := false
		if body.ConfirmationRequired != nil {
			confirmation = *body.ConfirmationRequired
		}

		row := tx.QueryRow(ctx,
			`INSERT INTO ontology_schema.action_types
			   (id, name, display_name, description, object_type_id,
			    operation_kind, input_schema, config,
			    confirmation_required, permission_key,
			    authorization_policy, form_schema, owner_id,
			    created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5,
			         $6, $7::jsonb, $8::jsonb,
			         $9, $10,
			         $11::jsonb, $12::jsonb, $13,
			         $14, $14)
			 RETURNING `+actionTypeReturning,
			id, strings.TrimSpace(body.Name), displayName, description, body.ObjectTypeID,
			body.OperationKind, inputSchemaJSON, []byte(config),
			confirmation, body.PermissionKey,
			authPolicyJSON, formSchemaJSON, ownerID,
			time.Now().UTC())

		created, err := scanActionType(row)
		if err != nil {
			return nil, err
		}
		if err := EnqueueActionTypeEvent(ctx, tx, EventOptions{
			AggregateID: created.ID.String(),
			EventType:   EventCreated,
			ActorID:     ownerID,
			Version:     1,
			After:       created,
		}); err != nil {
			return nil, fmt.Errorf("enqueue action_type created event: %w", err)
		}
		return created, nil
	})
}

// ListActionTypes returns every action type currently registered.
// Used by the geopolitica seed package for its idempotency check; the
// kernel's primary read path goes through `state.Stores.Definitions`
// (see libs/ontology-kernel/handlers/actions/actions.go::ListActionTypes)
// and stays the canonical surface for UI / SDK callers.
func (r *Repo) ListActionTypes(ctx context.Context) ([]kmodels.ActionType, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT `+actionTypeReturning+` FROM ontology_schema.action_types ORDER BY name LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]kmodels.ActionType, 0)
	for rows.Next() {
		v, err := scanActionType(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

// GetActionType returns the action type by id, or nil if missing.
// Used by UpdateActionType to capture the `before` snapshot, and by
// the lifted update flow before applying the patch.
func (r *Repo) GetActionType(ctx context.Context, id uuid.UUID) (*kmodels.ActionType, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT `+actionTypeReturning+` FROM ontology_schema.action_types WHERE id = $1`, id)
	v, err := scanActionType(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

// UpdateActionType applies a partial update. Mirrors the field set the
// kernel `UpdateActionType` handler accepts. Emits an `updated` event
// inside the same transaction.
func (r *Repo) UpdateActionType(ctx context.Context, id uuid.UUID, body *kmodels.UpdateActionTypeRequest, actorID uuid.UUID) (*kmodels.ActionType, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*kmodels.ActionType, error) {
		current, err := getActionTypeForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if current == nil {
			return nil, nil
		}

		displayName := current.DisplayName
		if body.DisplayName != nil {
			displayName = *body.DisplayName
		}
		description := current.Description
		if body.Description != nil {
			description = *body.Description
		}
		operationKind := current.OperationKind
		if body.OperationKind != nil && *body.OperationKind != "" {
			operationKind = *body.OperationKind
		}
		inputSchema := current.InputSchema
		if body.InputSchema != nil {
			inputSchema = *body.InputSchema
		}
		formSchema := current.FormSchema
		if body.FormSchema != nil {
			formSchema = *body.FormSchema
		}
		config := current.Config
		if len(body.Config) > 0 {
			config = body.Config
		}
		confirmation := current.ConfirmationRequired
		if body.ConfirmationRequired != nil {
			confirmation = *body.ConfirmationRequired
		}
		permissionKey := current.PermissionKey
		if body.PermissionKey != nil {
			permissionKey = body.PermissionKey
		}
		authPolicy := current.AuthorizationPolicy
		if body.AuthorizationPolicy != nil {
			authPolicy = *body.AuthorizationPolicy
		}

		inputSchemaJSON, err := json.Marshal(inputSchema)
		if err != nil {
			return nil, fmt.Errorf("encode input_schema: %w", err)
		}
		formSchemaJSON, err := json.Marshal(formSchema)
		if err != nil {
			return nil, fmt.Errorf("encode form_schema: %w", err)
		}
		authPolicyJSON, err := json.Marshal(authPolicy)
		if err != nil {
			return nil, fmt.Errorf("encode authorization_policy: %w", err)
		}
		if len(config) == 0 {
			config = json.RawMessage("null")
		}

		row := tx.QueryRow(ctx,
			`UPDATE ontology_schema.action_types
			   SET display_name = $2,
			       description = $3,
			       operation_kind = $4,
			       input_schema = $5::jsonb,
			       config = $6::jsonb,
			       confirmation_required = $7,
			       permission_key = $8,
			       authorization_policy = $9::jsonb,
			       form_schema = $10::jsonb,
			       updated_at = NOW()
			 WHERE id = $1
			 RETURNING `+actionTypeReturning,
			id, displayName, description, operationKind,
			inputSchemaJSON, []byte(config), confirmation, permissionKey,
			authPolicyJSON, formSchemaJSON)

		updated, err := scanActionType(row)
		if err != nil {
			return nil, err
		}
		if err := EnqueueActionTypeEvent(ctx, tx, EventOptions{
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     1,
			Before:      current,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue action_type updated event: %w", err)
		}
		return updated, nil
	})
}

// DeleteActionType removes the row and emits a `deleted` event in the
// same transaction. Returns false (with nil error) when no row matches.
func (r *Repo) DeleteActionType(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (bool, error) {
		before, err := getActionTypeForUpdate(ctx, tx, id)
		if err != nil {
			return false, err
		}
		if before == nil {
			return false, nil
		}
		tag, err := tx.Exec(ctx, `DELETE FROM ontology_schema.action_types WHERE id = $1`, id)
		if err != nil {
			return false, err
		}
		if tag.RowsAffected() == 0 {
			return false, nil
		}
		if err := EnqueueActionTypeEvent(ctx, tx, EventOptions{
			AggregateID: id.String(),
			EventType:   EventDeleted,
			ActorID:     actorID,
			Version:     1,
			Before:      before,
		}); err != nil {
			return false, fmt.Errorf("enqueue action_type deleted event: %w", err)
		}
		return true, nil
	})
}

func getActionTypeForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*kmodels.ActionType, error) {
	row := tx.QueryRow(ctx,
		`SELECT `+actionTypeReturning+` FROM ontology_schema.action_types WHERE id = $1 FOR UPDATE`, id)
	v, err := scanActionType(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return v, err
}

type rowLikeT interface{ Scan(...any) error }

// scanActionType decodes a single row produced by `actionTypeReturning`.
// The JSONB columns are scanned into `[]byte` first and then unmarshal'd
// into the kernel-typed fields so callers see the same shape the
// existing kernel handler returns.
func scanActionType(r rowLikeT) (*kmodels.ActionType, error) {
	a := &kmodels.ActionType{}
	var inputRaw, configRaw, authRaw, formRaw []byte
	if err := r.Scan(&a.ID, &a.Name, &a.DisplayName, &a.Description, &a.ObjectTypeID,
		&a.OperationKind, &inputRaw, &configRaw,
		&a.ConfirmationRequired, &a.PermissionKey,
		&authRaw, &formRaw,
		&a.OwnerID, &a.CreatedAt, &a.UpdatedAt); err != nil {
		return nil, err
	}
	if len(inputRaw) > 0 {
		_ = json.Unmarshal(inputRaw, &a.InputSchema)
	}
	a.Config = json.RawMessage(configRaw)
	if len(authRaw) > 0 {
		_ = json.Unmarshal(authRaw, &a.AuthorizationPolicy)
	}
	if len(formRaw) > 0 {
		_ = json.Unmarshal(formRaw, &a.FormSchema)
	}
	return a, nil
}

// ── Coalescing helpers ────────────────────────────────────────────────
//
// The kernel `CreateActionType` defaults each optional field; we
// replicate the same defaults rather than send `null` JSONB rows.

func coalesceInputSchema(p *[]kmodels.ActionInputField) []kmodels.ActionInputField {
	if p == nil {
		return []kmodels.ActionInputField{}
	}
	return *p
}

func coalesceFormSchema(p *kmodels.ActionFormSchema) kmodels.ActionFormSchema {
	if p == nil {
		return kmodels.ActionFormSchema{}
	}
	return *p
}

func coalesceAuthPolicy(p *kmodels.ActionAuthorizationPolicy) kmodels.ActionAuthorizationPolicy {
	if p == nil {
		return kmodels.ActionAuthorizationPolicy{}
	}
	return *p
}

// runRepoTx opens a transaction, runs `fn`, commits on success / rolls
// back on failure. Identical contract to the generic helper in
// `services/ontology-definition-service/internal/repo/repo.go`.
func runRepoTx[T any](ctx context.Context, pool *pgxpool.Pool, fn func(tx pgx.Tx) (T, error)) (T, error) {
	var zero T
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return zero, fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(context.Background())
		}
	}()
	v, err := fn(tx)
	if err != nil {
		return zero, err
	}
	if err := tx.Commit(ctx); err != nil {
		return zero, fmt.Errorf("commit tx: %w", err)
	}
	committed = true
	return v, nil
}
