// Package repo holds SQL queries + embedded migration for
// ontology-definition-service.
//
// All queries are schema-qualified to ontology_schema (matches the
// Rust impl which sets search_path on the pool at connect time).
package repo

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		if _, err := pool.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}
	return nil
}

type Repo struct{ Pool *pgxpool.Pool }

const objectTypeSelect = `SELECT id, name, display_name, description,
	primary_key_property, icon, color, owner_id, created_at, updated_at,
	plural_display_name, editable, backing_dataset_id, backing_dataset_rid,
	backing_datasource_type, backing_restricted_view_id, restricted_view_policy,
	restricted_view_policy_version, restricted_view_registered_policy_version,
	restricted_view_indexed_policy_version, restricted_view_storage_mode,
	restricted_view_policy_updated_at, restricted_view_registered_at,
	restricted_view_indexed_at, pipeline_rid, managed_by,
	COALESCE(app_capabilities_json, '{}'::jsonb), version
	FROM ontology_schema.object_types`

// objectTypeReturning mirrors the column list of objectTypeSelect so the
// INSERT/UPDATE statements that use RETURNING can be scanned through
// scanObjectType. Keep the two in lock-step.
const objectTypeReturning = `id, name, display_name, description, primary_key_property,
	icon, color, owner_id, created_at, updated_at,
	plural_display_name, editable, backing_dataset_id,
	backing_dataset_rid, backing_datasource_type,
	backing_restricted_view_id, restricted_view_policy,
	restricted_view_policy_version, restricted_view_registered_policy_version,
	restricted_view_indexed_policy_version, restricted_view_storage_mode,
	restricted_view_policy_updated_at, restricted_view_registered_at,
	restricted_view_indexed_at, pipeline_rid, managed_by,
	COALESCE(app_capabilities_json, '{}'::jsonb), version`

func (r *Repo) ListObjectTypes(ctx context.Context) ([]models.ObjectType, error) {
	rows, err := r.Pool.Query(ctx, objectTypeSelect+` ORDER BY name LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]models.ObjectType, 0)
	for rows.Next() {
		v, err := scanObjectType(rows)
		if err != nil {
			return nil, err
		}
		if err := r.enrichObjectTypeMetadata(ctx, v); err != nil {
			return nil, err
		}
		out = append(out, *v)
	}
	return out, rows.Err()
}

func (r *Repo) GetObjectType(ctx context.Context, id uuid.UUID) (*models.ObjectType, error) {
	row := r.Pool.QueryRow(ctx, objectTypeSelect+` WHERE id = $1`, id)
	v, err := scanObjectType(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return v, r.enrichObjectTypeMetadata(ctx, v)
}

func (r *Repo) CreateObjectType(ctx context.Context, body *models.CreateObjectTypeRequest, ownerID uuid.UUID) (*models.ObjectType, error) {
	return r.runInTx(ctx, func(tx pgx.Tx) (*models.ObjectType, error) {
		v, err := r.createObjectTypeTx(ctx, tx, body, ownerID)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectType,
			Aggregate:   AggregateObjectType,
			AggregateID: v.ID.String(),
			EventType:   EventCreated,
			ActorID:     ownerID,
			Version:     v.Version,
			After:       v,
		}); err != nil {
			return nil, fmt.Errorf("enqueue object_type created event: %w", err)
		}
		return v, nil
	})
}

// runInTx opens a Postgres transaction, runs `fn` inside it and commits
// on success / rolls back on failure. It is the single sanctioned way
// to combine a primary schema mutation with an outbox.Enqueue under
// ADR-0022 atomicity. The typed `runInTx` keeps the common ObjectType
// case ergonomic; for other return shapes use the generic `runRepoTx`
// below.
func (r *Repo) runInTx(ctx context.Context, fn func(tx pgx.Tx) (*models.ObjectType, error)) (*models.ObjectType, error) {
	return runRepoTx(ctx, r.Pool, fn)
}

// runRepoTx is the generic transaction runner. Callers pass a closure
// that performs the primary mutation and any outbox enqueues; the
// helper rolls back on error, commits on success, and returns whatever
// the closure produced.
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

func (r *Repo) UpdateObjectType(ctx context.Context, id uuid.UUID, body *models.UpdateObjectTypeRequest, actorID uuid.UUID) (*models.ObjectType, error) {
	return r.runInTx(ctx, func(tx pgx.Tx) (*models.ObjectType, error) {
		current, err := getObjectTypeForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if current == nil {
			return nil, nil
		}
		updated, err := r.updateObjectTypeTx(ctx, tx, current, body)
		if err != nil {
			return nil, err
		}
		if updated == nil {
			return nil, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectType,
			Aggregate:   AggregateObjectType,
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     updated.Version,
			Before:      current,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue object_type updated event: %w", err)
		}
		return updated, nil
	})
}

// DeleteObjectType removes an object type and emits an
// `ontology.object_type.changed.v1` event of type `deleted`. The
// `before` snapshot is captured inside the same transaction as the
// DELETE so the event payload reflects the row that was actually
// removed.
func (r *Repo) DeleteObjectType(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error) {
	deleted, err := runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (bool, error) {
		before, err := getObjectTypeForUpdate(ctx, tx, id)
		if err != nil {
			return false, err
		}
		if before == nil {
			return false, nil
		}
		cmd, err := tx.Exec(ctx, `DELETE FROM ontology_schema.object_types WHERE id = $1`, id)
		if err != nil {
			return false, err
		}
		if cmd.RowsAffected() == 0 {
			return false, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectType,
			Aggregate:   AggregateObjectType,
			AggregateID: id.String(),
			EventType:   EventDeleted,
			ActorID:     actorID,
			Version:     before.Version,
			Before:      before,
		}); err != nil {
			return false, fmt.Errorf("enqueue object_type deleted event: %w", err)
		}
		return true, nil
	})
	return deleted, err
}

type rowLikeT interface{ Scan(...any) error }

func scanObjectType(r rowLikeT) (*models.ObjectType, error) {
	v := &models.ObjectType{}
	if err := r.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description,
		&v.PrimaryKeyProperty, &v.Icon, &v.Color, &v.OwnerID,
		&v.CreatedAt, &v.UpdatedAt, &v.PluralDisplayName, &v.Editable,
		&v.BackingDatasetID, &v.BackingDatasetRID, &v.BackingDatasourceType,
		&v.BackingRestrictedViewID, &v.RestrictedViewPolicy,
		&v.RestrictedViewPolicyVersion,
		&v.RestrictedViewRegisteredPolicyVersion,
		&v.RestrictedViewIndexedPolicyVersion,
		&v.RestrictedViewStorageMode,
		&v.RestrictedViewPolicyUpdatedAt,
		&v.RestrictedViewRegisteredAt,
		&v.RestrictedViewIndexedAt, &v.PipelineRID,
		&v.ManagedBy, &v.AppCapabilities, &v.Version); err != nil {
		return nil, err
	}
	models.EnrichObjectTypeMetadata(v, nil)
	return v, nil
}

// UpdateAppCapabilities writes only the app_capabilities_json column
// for a single object type. The payload is stored verbatim — callers
// are responsible for sanitising / validating the JSON before they
// invoke this. Returns the refreshed ObjectType. Emits an
// `ontology.object_type.changed.v1` event with type `updated` carrying
// the before/after snapshots.
func (r *Repo) UpdateAppCapabilities(ctx context.Context, id uuid.UUID, payload json.RawMessage, actorID uuid.UUID) (*models.ObjectType, error) {
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	return r.runInTx(ctx, func(tx pgx.Tx) (*models.ObjectType, error) {
		before, err := getObjectTypeForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if before == nil {
			return nil, nil
		}
		tag, err := tx.Exec(ctx,
			`UPDATE ontology_schema.object_types
			    SET app_capabilities_json = $2,
			        updated_at = NOW(),
			        version = version + 1
			    WHERE id = $1`, id, []byte(payload))
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, nil
		}
		row := tx.QueryRow(ctx, objectTypeSelect+` WHERE id = $1`, id)
		updated, err := scanObjectType(row)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectType,
			Aggregate:   AggregateObjectType,
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     updated.Version,
			Before:      before,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue object_type app_capabilities event: %w", err)
		}
		return updated, nil
	})
}

func ptrString(ptr *string) string {
	if ptr == nil {
		return ""
	}
	return *ptr
}

func firstNonEmptyStringPtr(values ...*string) *string {
	for _, value := range values {
		if value == nil {
			continue
		}
		trimmed := strings.TrimSpace(*value)
		if trimmed != "" {
			return &trimmed
		}
	}
	return nil
}

func normalizeBackingDatasourceType(raw string, restrictedViewIDs ...*string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "restricted_view", "restricted-view", "rv":
		return "restricted_view"
	case "dataset", "":
		for _, id := range restrictedViewIDs {
			if id != nil && strings.TrimSpace(*id) != "" {
				return "restricted_view"
			}
		}
		return "dataset"
	default:
		return normalized
	}
}

func normalizedStorageMode(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "foundry_object_storage", "local_storage", "local_index", "remote", "none":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "remote"
	}
}

func intValue(ptr *int) int {
	if ptr == nil || *ptr < 0 {
		return 0
	}
	return *ptr
}

func normalizeJSONRaw(raw []byte) json.RawMessage {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return json.RawMessage("{}")
	}
	return json.RawMessage(trimmed)
}

func (r *Repo) enrichObjectTypeMetadata(ctx context.Context, objectType *models.ObjectType) error {
	properties, err := r.ListProperties(ctx, objectType.ID)
	if err != nil {
		return err
	}
	models.EnrichObjectTypeMetadata(objectType, properties)
	return nil
}

// ── Properties ─────────────────────────────────────────────────────────

const propertyColumns = `id, object_type_id, name, display_name, description, property_type,
	required, unique_constraint, time_dependent,
	default_value, validation_rules, inline_edit_config,
	created_at, updated_at, version`

func (r *Repo) ListProperties(ctx context.Context, typeID uuid.UUID) ([]models.Property, error) {
	rows, err := r.Pool.Query(ctx,
		`SELECT `+propertyColumns+` FROM ontology_schema.properties WHERE object_type_id = $1 ORDER BY created_at`,
		typeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Property{}
	for rows.Next() {
		p, err := scanProperty(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

func (r *Repo) CreateProperty(ctx context.Context, typeID uuid.UUID, body *models.CreatePropertyRequest, actorID uuid.UUID) (*models.Property, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.Property, error) {
		p, err := r.createPropertyTx(ctx, tx, typeID, body)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicProperty,
			Aggregate:   AggregateProperty,
			AggregateID: p.ID.String(),
			EventType:   EventCreated,
			ActorID:     actorID,
			Version:     p.Version,
			After:       p,
		}); err != nil {
			return nil, fmt.Errorf("enqueue property created event: %w", err)
		}
		return p, nil
	})
}

// GetProperty reads a single property by id. Returns nil, nil when no
// row matches. Used by the new PATCH/DELETE endpoints to surface
// 404s before opening the mutation transaction.
func (r *Repo) GetProperty(ctx context.Context, id uuid.UUID) (*models.Property, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT `+propertyColumns+` FROM ontology_schema.properties WHERE id = $1`, id)
	p, err := scanProperty(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return p, err
}

// UpdateProperty applies a partial update to a single property and
// emits an `ontology.property.changed.v1` event. Mirrors the
// transactional pattern used elsewhere in this repo: select for
// update + mutate + outbox enqueue + commit, all atomic.
func (r *Repo) UpdateProperty(ctx context.Context, id uuid.UUID, body *models.UpdatePropertyRequest, actorID uuid.UUID) (*models.Property, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.Property, error) {
		current, err := getPropertyForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if current == nil {
			return nil, nil
		}
		updated, err := r.updatePropertyTx(ctx, tx, current, body)
		if err != nil {
			return nil, err
		}
		if updated == nil {
			return nil, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicProperty,
			Aggregate:   AggregateProperty,
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     updated.Version,
			Before:      current,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue property updated event: %w", err)
		}
		return updated, nil
	})
}

// DeleteProperty removes a property and emits a deleted event.
func (r *Repo) DeleteProperty(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (bool, error) {
		before, err := getPropertyForUpdate(ctx, tx, id)
		if err != nil {
			return false, err
		}
		if before == nil {
			return false, nil
		}
		tag, err := tx.Exec(ctx, `DELETE FROM ontology_schema.properties WHERE id = $1`, id)
		if err != nil {
			return false, err
		}
		if tag.RowsAffected() == 0 {
			return false, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicProperty,
			Aggregate:   AggregateProperty,
			AggregateID: id.String(),
			EventType:   EventDeleted,
			ActorID:     actorID,
			Version:     before.Version,
			Before:      before,
		}); err != nil {
			return false, fmt.Errorf("enqueue property deleted event: %w", err)
		}
		return true, nil
	})
}

func scanProperty(r rowLikeT) (*models.Property, error) {
	p := &models.Property{}
	if err := r.Scan(&p.ID, &p.ObjectTypeID, &p.Name, &p.DisplayName, &p.Description,
		&p.PropertyType, &p.Required, &p.UniqueConstraint, &p.TimeDependent,
		&p.DefaultValue, &p.ValidationRules, &p.InlineEditConfig,
		&p.CreatedAt, &p.UpdatedAt, &p.Version); err != nil {
		return nil, err
	}
	models.EnrichPropertyMetadata(p)
	return p, nil
}

// ── Object type groups ─────────────────────────────────────────────────

const objectTypeGroupColumns = `g.id, g.name, g.display_name, g.description, g.visibility, g.status,
	g.owner_id, g.created_at, g.updated_at, g.version,
	COALESCE((SELECT array_agg(ot.id ORDER BY ot.display_name) FROM ontology_schema.object_types ot WHERE g.name = ANY(ot.group_names)), '{}'::uuid[]) AS object_type_ids,
	(SELECT pr.project_id FROM ontology_schema.ontology_project_resources pr WHERE pr.resource_kind = 'object_type_group' AND pr.resource_id = g.id LIMIT 1) AS project_id`

func (r *Repo) ListObjectTypeGroups(ctx context.Context, search string, limit, offset int64) ([]models.ObjectTypeGroup, int64, error) {
	pattern := "%" + search + "%"
	var total int64
	if err := r.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ontology_schema.object_type_groups
		 WHERE name ILIKE $1 OR display_name ILIKE $1 OR description ILIKE $1`,
		pattern,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.Pool.Query(ctx,
		`SELECT `+objectTypeGroupColumns+`
		 FROM ontology_schema.object_type_groups g
		 WHERE g.name ILIKE $1 OR g.display_name ILIKE $1 OR g.description ILIKE $1
		 ORDER BY g.display_name ASC, g.created_at DESC
		 LIMIT $2 OFFSET $3`,
		pattern, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []models.ObjectTypeGroup{}
	for rows.Next() {
		group, err := scanObjectTypeGroup(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *group)
	}
	return out, total, rows.Err()
}

func (r *Repo) GetObjectTypeGroup(ctx context.Context, id uuid.UUID) (*models.ObjectTypeGroup, error) {
	row := r.Pool.QueryRow(ctx, `SELECT `+objectTypeGroupColumns+` FROM ontology_schema.object_type_groups g WHERE g.id = $1`, id)
	group, err := scanObjectTypeGroup(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return group, err
}

func (r *Repo) CreateObjectTypeGroup(ctx context.Context, body *models.CreateObjectTypeGroupRequest, ownerID uuid.UUID) (*models.ObjectTypeGroup, error) {
	id := uuid.New()
	if body.ID != nil && *body.ID != uuid.Nil {
		id = *body.ID
	}
	displayName := body.DisplayName
	if displayName == "" {
		displayName = body.Name
	}
	visibility := body.Visibility
	if visibility == "" {
		visibility = "normal"
	}
	status := body.Status
	if status == "" {
		status = "active"
	}
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`INSERT INTO ontology_schema.object_type_groups
		 (id, name, display_name, description, visibility, status, owner_id, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
		id, body.Name, displayName, body.Description, visibility, status, ownerID, time.Now().UTC()); err != nil {
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
	if err := replaceObjectTypeGroupMembers(ctx, tx, body.Name, body.ObjectTypeIDs); err != nil {
		return nil, err
	}
	created, err := getObjectTypeGroupForUpdate(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
		Topic:       TopicObjectTypeGroup,
		Aggregate:   AggregateObjectTypeGroup,
		AggregateID: id.String(),
		EventType:   EventCreated,
		ActorID:     ownerID,
		Version:     1,
		After:       created,
	}); err != nil {
		return nil, fmt.Errorf("enqueue object_type_group created event: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetObjectTypeGroup(ctx, id)
}

func (r *Repo) UpdateObjectTypeGroup(ctx context.Context, id uuid.UUID, body *models.UpdateObjectTypeGroupRequest, actorID uuid.UUID) (*models.ObjectTypeGroup, error) {
	current, err := r.GetObjectTypeGroup(ctx, id)
	if err != nil || current == nil {
		return current, err
	}
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
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`UPDATE ontology_schema.object_type_groups
		 SET name = $2, display_name = $3, description = $4, visibility = $5, status = $6,
		     updated_at = $7, version = version + 1
		 WHERE id = $1`,
		id, name, displayName, description, visibility, status, time.Now().UTC()); err != nil {
		return nil, err
	}
	if name != current.Name {
		if _, err := tx.Exec(ctx,
			`UPDATE ontology_schema.object_types
			 SET group_names = array_replace(group_names, $1, $2), updated_at = NOW()
			 WHERE $1 = ANY(group_names)`, current.Name, name); err != nil {
			return nil, err
		}
	}
	if body.ProjectID != nil {
		if *body.ProjectID == uuid.Nil {
			if _, err := tx.Exec(ctx, `DELETE FROM ontology_schema.ontology_project_resources WHERE resource_kind = 'object_type_group' AND resource_id = $1`, id); err != nil {
				return nil, err
			}
		} else if _, err := tx.Exec(ctx,
			`INSERT INTO ontology_schema.ontology_project_resources (project_id, resource_kind, resource_id, bound_by)
			 VALUES ($1, 'object_type_group', $2, $3)
			 ON CONFLICT (resource_kind, resource_id) DO UPDATE SET project_id = EXCLUDED.project_id, bound_by = EXCLUDED.bound_by`,
			*body.ProjectID, id, actorID); err != nil {
			return nil, err
		}
	}
	if body.ObjectTypeIDs != nil {
		if err := replaceObjectTypeGroupMembers(ctx, tx, name, *body.ObjectTypeIDs); err != nil {
			return nil, err
		}
	}
	after, err := getObjectTypeGroupForUpdate(ctx, tx, id)
	if err != nil {
		return nil, err
	}
	if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
		Topic:       TopicObjectTypeGroup,
		Aggregate:   AggregateObjectTypeGroup,
		AggregateID: id.String(),
		EventType:   EventUpdated,
		ActorID:     actorID,
		Version:     after.Version,
		Before:      current,
		After:       after,
	}); err != nil {
		return nil, fmt.Errorf("enqueue object_type_group updated event: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetObjectTypeGroup(ctx, id)
}

func (r *Repo) DeleteObjectTypeGroup(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (bool, error) {
		current, err := getObjectTypeGroupForUpdate(ctx, tx, id)
		if err != nil {
			return false, err
		}
		if current == nil {
			return false, nil
		}
		if _, err := tx.Exec(ctx, `UPDATE ontology_schema.object_types SET group_names = array_remove(group_names, $1), updated_at = NOW() WHERE $1 = ANY(group_names)`, current.Name); err != nil {
			return false, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM ontology_schema.ontology_project_resources WHERE resource_kind = 'object_type_group' AND resource_id = $1`, id); err != nil {
			return false, err
		}
		tag, err := tx.Exec(ctx, `DELETE FROM ontology_schema.object_type_groups WHERE id = $1`, id)
		if err != nil {
			return false, err
		}
		if tag.RowsAffected() == 0 {
			return false, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectTypeGroup,
			Aggregate:   AggregateObjectTypeGroup,
			AggregateID: id.String(),
			EventType:   EventDeleted,
			ActorID:     actorID,
			Version:     current.Version,
			Before:      current,
		}); err != nil {
			return false, fmt.Errorf("enqueue object_type_group deleted event: %w", err)
		}
		return true, nil
	})
}

// AddObjectTypeToGroup links an object type into a group and emits an
// `ontology.object_type_group.changed.v1` `updated` event reflecting
// the new membership set. The link state itself lives on
// `object_types.group_names`, so consumers receive the group's view of
// the change rather than a stand-alone link event.
func (r *Repo) AddObjectTypeToGroup(ctx context.Context, groupID, objectTypeID, actorID uuid.UUID) (*models.ObjectTypeGroup, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.ObjectTypeGroup, error) {
		before, err := getObjectTypeGroupForUpdate(ctx, tx, groupID)
		if err != nil {
			return nil, err
		}
		if before == nil {
			return nil, nil
		}
		if _, err := tx.Exec(ctx,
			`UPDATE ontology_schema.object_types
			 SET group_names = CASE WHEN $1 = ANY(group_names) THEN group_names ELSE array_append(group_names, $1) END,
			     updated_at = NOW()
			 WHERE id = $2`,
			before.Name, objectTypeID); err != nil {
			return nil, err
		}
		after, err := getObjectTypeGroupForUpdate(ctx, tx, groupID)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectTypeGroup,
			Aggregate:   AggregateObjectTypeGroup,
			AggregateID: groupID.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     after.Version,
			Before:      before,
			After:       after,
		}); err != nil {
			return nil, fmt.Errorf("enqueue object_type_group add-member event: %w", err)
		}
		return after, nil
	})
}

func (r *Repo) RemoveObjectTypeFromGroup(ctx context.Context, groupID, objectTypeID, actorID uuid.UUID) (*models.ObjectTypeGroup, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.ObjectTypeGroup, error) {
		before, err := getObjectTypeGroupForUpdate(ctx, tx, groupID)
		if err != nil {
			return nil, err
		}
		if before == nil {
			return nil, nil
		}
		if _, err := tx.Exec(ctx,
			`UPDATE ontology_schema.object_types
			 SET group_names = array_remove(group_names, $1), updated_at = NOW()
			 WHERE id = $2`,
			before.Name, objectTypeID); err != nil {
			return nil, err
		}
		after, err := getObjectTypeGroupForUpdate(ctx, tx, groupID)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectTypeGroup,
			Aggregate:   AggregateObjectTypeGroup,
			AggregateID: groupID.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     after.Version,
			Before:      before,
			After:       after,
		}); err != nil {
			return nil, fmt.Errorf("enqueue object_type_group remove-member event: %w", err)
		}
		return after, nil
	})
}

func replaceObjectTypeGroupMembers(ctx context.Context, tx pgx.Tx, groupName string, objectTypeIDs []uuid.UUID) error {
	if _, err := tx.Exec(ctx, `UPDATE ontology_schema.object_types SET group_names = array_remove(group_names, $1), updated_at = NOW() WHERE $1 = ANY(group_names)`, groupName); err != nil {
		return err
	}
	for _, objectTypeID := range objectTypeIDs {
		if objectTypeID == uuid.Nil {
			continue
		}
		if _, err := tx.Exec(ctx,
			`UPDATE ontology_schema.object_types
			 SET group_names = CASE WHEN $1 = ANY(group_names) THEN group_names ELSE array_append(group_names, $1) END,
			     updated_at = NOW()
			 WHERE id = $2`, groupName, objectTypeID); err != nil {
			return err
		}
	}
	return nil
}

func scanObjectTypeGroup(r rowLikeT) (*models.ObjectTypeGroup, error) {
	group := &models.ObjectTypeGroup{}
	if err := r.Scan(&group.ID, &group.Name, &group.DisplayName, &group.Description,
		&group.Visibility, &group.Status, &group.OwnerID, &group.CreatedAt, &group.UpdatedAt,
		&group.Version, &group.ObjectTypeIDs, &group.ProjectID); err != nil {
		return nil, err
	}
	group.ObjectTypeCount = len(group.ObjectTypeIDs)
	return group, nil
}

// ── Link types ─────────────────────────────────────────────────────────

const linkTypeColumns = `id, name, display_name, description, source_type_id, target_type_id,
	cardinality, label, reverse_label, visibility, link_datasource_mapping, owner_id, created_at, updated_at,
	COALESCE(app_capabilities_json, '{}'::jsonb) AS app_capabilities_json, version`

func (r *Repo) ListLinkTypes(ctx context.Context, objectTypeID *uuid.UUID) ([]models.LinkType, error) {
	q := `SELECT ` + linkTypeColumns + ` FROM ontology_schema.link_types`
	args := []any{}
	if objectTypeID != nil {
		q += ` WHERE source_type_id = $1 OR target_type_id = $1`
		args = append(args, *objectTypeID)
	}
	q += ` ORDER BY created_at`
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.LinkType{}
	for rows.Next() {
		lt, err := scanLinkType(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *lt)
	}
	return out, rows.Err()
}

func (r *Repo) GetLinkType(ctx context.Context, id uuid.UUID) (*models.LinkType, error) {
	row := r.Pool.QueryRow(ctx, `SELECT `+linkTypeColumns+` FROM ontology_schema.link_types WHERE id = $1`, id)
	lt, err := scanLinkType(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return lt, err
}

func (r *Repo) CreateLinkType(ctx context.Context, body *models.CreateLinkTypeRequest, ownerID uuid.UUID) (*models.LinkType, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.LinkType, error) {
		lt, err := r.createLinkTypeTx(ctx, tx, body, ownerID)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicLinkType,
			Aggregate:   AggregateLinkType,
			AggregateID: lt.ID.String(),
			EventType:   EventCreated,
			ActorID:     ownerID,
			Version:     lt.Version,
			After:       lt,
		}); err != nil {
			return nil, fmt.Errorf("enqueue link_type created event: %w", err)
		}
		return lt, nil
	})
}

func (r *Repo) UpdateLinkType(ctx context.Context, id uuid.UUID, body *models.UpdateLinkTypeRequest, actorID uuid.UUID) (*models.LinkType, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.LinkType, error) {
		current, err := getLinkTypeForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if current == nil {
			return nil, nil
		}
		updated, err := r.updateLinkTypeTx(ctx, tx, current, body)
		if err != nil {
			return nil, err
		}
		if updated == nil {
			return nil, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicLinkType,
			Aggregate:   AggregateLinkType,
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     updated.Version,
			Before:      current,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue link_type updated event: %w", err)
		}
		return updated, nil
	})
}

func (r *Repo) DeleteLinkType(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (bool, error) {
		before, err := getLinkTypeForUpdate(ctx, tx, id)
		if err != nil {
			return false, err
		}
		if before == nil {
			return false, nil
		}
		tag, err := tx.Exec(ctx, `DELETE FROM ontology_schema.link_types WHERE id = $1`, id)
		if err != nil {
			return false, err
		}
		if tag.RowsAffected() == 0 {
			return false, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicLinkType,
			Aggregate:   AggregateLinkType,
			AggregateID: id.String(),
			EventType:   EventDeleted,
			ActorID:     actorID,
			Version:     before.Version,
			Before:      before,
		}); err != nil {
			return false, fmt.Errorf("enqueue link_type deleted event: %w", err)
		}
		return true, nil
	})
}

func scanLinkType(r rowLikeT) (*models.LinkType, error) {
	lt := &models.LinkType{}
	if err := r.Scan(&lt.ID, &lt.Name, &lt.DisplayName, &lt.Description,
		&lt.SourceTypeID, &lt.TargetTypeID, &lt.Cardinality, &lt.Label, &lt.ReverseLabel,
		&lt.Visibility, &lt.LinkDatasourceMapping, &lt.OwnerID, &lt.CreatedAt, &lt.UpdatedAt,
		&lt.AppCapabilities, &lt.Version); err != nil {
		return nil, err
	}
	return lt, nil
}

// UpdateLinkTypeAppCapabilities writes only the app_capabilities_json
// column for a single link type. Used by the Vertex edge-direction
// editor; payload is stored verbatim — callers validate the JSON
// before invoking this. Emits an `ontology.link_type.changed.v1`
// `updated` event with before/after snapshots.
func (r *Repo) UpdateLinkTypeAppCapabilities(ctx context.Context, id uuid.UUID, payload json.RawMessage, actorID uuid.UUID) (*models.LinkType, error) {
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.LinkType, error) {
		before, err := getLinkTypeForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if before == nil {
			return nil, nil
		}
		tag, err := tx.Exec(ctx,
			`UPDATE ontology_schema.link_types
			    SET app_capabilities_json = $2,
			        updated_at = NOW(),
			        version = version + 1
			    WHERE id = $1`, id, []byte(payload))
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() == 0 {
			return nil, nil
		}
		updated, err := getLinkTypeForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicLinkType,
			Aggregate:   AggregateLinkType,
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     updated.Version,
			Before:      before,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue link_type app_capabilities event: %w", err)
		}
		return updated, nil
	})
}

var _ = errors.New
var _ = pgx.ErrNoRows
