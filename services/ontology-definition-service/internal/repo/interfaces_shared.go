// Repo helpers for the `interfaces` and `shared_property_types`
// tables. Reads back the Ontology Manager catalog; writes go through
// the same `runRepoTx` + outbox path used by object types / link
// types so every interface or shared-property-type mutation is
// observable on `ontology.interface.changed.v1` and
// `ontology.shared_property_type.changed.v1` respectively.
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/openfoundry/openfoundry-go/services/ontology-definition-service/internal/models"
)

func clampPaging(page, perPage int) (limit, offset int) {
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 {
		perPage = 50
	}
	if perPage > 500 {
		perPage = 500
	}
	return perPage, (page - 1) * perPage
}

const interfaceColumns = `id, name, display_name, description, owner_id,
	created_at, updated_at`

func (r *Repo) ListInterfaces(ctx context.Context, page, perPage int, search string) ([]models.OntologyInterface, int, error) {
	limit, offset := clampPaging(page, perPage)
	args := []any{}
	where := ""
	if search != "" {
		where = " WHERE name ILIKE $1 OR display_name ILIKE $1"
		args = append(args, "%"+search+"%")
	}

	var total int
	if err := r.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ontology_schema.ontology_interfaces`+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	q := `SELECT ` + interfaceColumns + ` FROM ontology_schema.ontology_interfaces` + where +
		` ORDER BY name LIMIT $` + itoa(len(args)-1) + ` OFFSET $` + itoa(len(args))
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.OntologyInterface, 0)
	for rows.Next() {
		v := models.OntologyInterface{}
		if err := rows.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description,
			&v.OwnerID, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, v)
	}
	return out, total, rows.Err()
}

const sharedPropertyTypeColumns = `id, name, display_name, description, property_type,
	required, unique_constraint, time_dependent,
	default_value, validation_rules, owner_id, created_at, updated_at, version`

func (r *Repo) ListSharedPropertyTypes(ctx context.Context, page, perPage int, search string) ([]models.SharedPropertyType, int, error) {
	limit, offset := clampPaging(page, perPage)
	args := []any{}
	where := ""
	if search != "" {
		where = " WHERE name ILIKE $1 OR display_name ILIKE $1"
		args = append(args, "%"+search+"%")
	}

	var total int
	if err := r.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ontology_schema.shared_property_types`+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	q := `SELECT ` + sharedPropertyTypeColumns + ` FROM ontology_schema.shared_property_types` +
		where + ` ORDER BY name LIMIT $` + itoa(len(args)-1) + ` OFFSET $` + itoa(len(args))
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.SharedPropertyType, 0)
	for rows.Next() {
		v := models.SharedPropertyType{}
		if err := rows.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description, &v.PropertyType,
			&v.Required, &v.UniqueConstraint, &v.TimeDependent,
			&v.DefaultValue, &v.ValidationRules, &v.OwnerID, &v.CreatedAt, &v.UpdatedAt, &v.Version); err != nil {
			return nil, 0, err
		}
		out = append(out, v)
	}
	return out, total, rows.Err()
}

// GetInterface returns one interface by id, or nil if not found.
func (r *Repo) GetInterface(ctx context.Context, id uuid.UUID) (*models.OntologyInterface, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT `+interfaceColumns+` FROM ontology_schema.ontology_interfaces WHERE id = $1`, id)
	v := models.OntologyInterface{}
	if err := row.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description,
		&v.OwnerID, &v.CreatedAt, &v.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &v, nil
}

// CreateInterface inserts a new interface and emits an
// `ontology.interface.changed.v1` `created` event.
func (r *Repo) CreateInterface(ctx context.Context, body *models.CreateOntologyInterfaceRequest, ownerID uuid.UUID) (*models.OntologyInterface, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.OntologyInterface, error) {
		id := uuid.New()
		dn := body.DisplayName
		if dn == "" {
			dn = body.Name
		}
		now := time.Now().UTC()
		row := tx.QueryRow(ctx,
			`INSERT INTO ontology_schema.ontology_interfaces
			   (id, name, display_name, description, owner_id, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $6)
			 RETURNING `+interfaceColumns,
			id, body.Name, dn, body.Description, ownerID, now)
		v := models.OntologyInterface{}
		if err := row.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description,
			&v.OwnerID, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicInterface,
			Aggregate:   AggregateInterface,
			AggregateID: v.ID.String(),
			EventType:   EventCreated,
			ActorID:     ownerID,
			Version:     1,
			After:       v,
		}); err != nil {
			return nil, fmt.Errorf("enqueue interface created event: %w", err)
		}
		return &v, nil
	})
}

// UpdateInterface applies a partial update to one interface and emits
// the corresponding outbox event.
func (r *Repo) UpdateInterface(ctx context.Context, id uuid.UUID, body *models.UpdateOntologyInterfaceRequest, actorID uuid.UUID) (*models.OntologyInterface, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.OntologyInterface, error) {
		current, err := getInterfaceForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if current == nil {
			return nil, nil
		}
		dn := current.DisplayName
		if body.DisplayName != nil {
			dn = *body.DisplayName
		}
		desc := current.Description
		if body.Description != nil {
			desc = *body.Description
		}
		row := tx.QueryRow(ctx,
			`UPDATE ontology_schema.ontology_interfaces
			   SET display_name = $2, description = $3, updated_at = NOW()
			 WHERE id = $1
			 RETURNING `+interfaceColumns,
			id, dn, desc)
		updated := models.OntologyInterface{}
		if err := row.Scan(&updated.ID, &updated.Name, &updated.DisplayName,
			&updated.Description, &updated.OwnerID, &updated.CreatedAt, &updated.UpdatedAt); err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicInterface,
			Aggregate:   AggregateInterface,
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     1,
			Before:      current,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue interface updated event: %w", err)
		}
		return &updated, nil
	})
}

// DeleteInterface removes an interface and emits a `deleted` event.
// Cascades to interface_properties + object_type_interfaces via the
// FK ON DELETE CASCADE declared in migration 0001.
func (r *Repo) DeleteInterface(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (bool, error) {
		before, err := getInterfaceForUpdate(ctx, tx, id)
		if err != nil {
			return false, err
		}
		if before == nil {
			return false, nil
		}
		tag, err := tx.Exec(ctx,
			`DELETE FROM ontology_schema.ontology_interfaces WHERE id = $1`, id)
		if err != nil {
			return false, err
		}
		if tag.RowsAffected() == 0 {
			return false, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicInterface,
			Aggregate:   AggregateInterface,
			AggregateID: id.String(),
			EventType:   EventDeleted,
			ActorID:     actorID,
			Version:     1,
			Before:      before,
		}); err != nil {
			return false, fmt.Errorf("enqueue interface deleted event: %w", err)
		}
		return true, nil
	})
}

func getInterfaceForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*models.OntologyInterface, error) {
	row := tx.QueryRow(ctx,
		`SELECT `+interfaceColumns+` FROM ontology_schema.ontology_interfaces WHERE id = $1 FOR UPDATE`, id)
	v := models.OntologyInterface{}
	if err := row.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description,
		&v.OwnerID, &v.CreatedAt, &v.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &v, nil
}

// GetSharedPropertyType returns one row, or nil if not found.
func (r *Repo) GetSharedPropertyType(ctx context.Context, id uuid.UUID) (*models.SharedPropertyType, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT `+sharedPropertyTypeColumns+` FROM ontology_schema.shared_property_types WHERE id = $1`, id)
	v := models.SharedPropertyType{}
	if err := row.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description, &v.PropertyType,
		&v.Required, &v.UniqueConstraint, &v.TimeDependent,
		&v.DefaultValue, &v.ValidationRules, &v.OwnerID, &v.CreatedAt, &v.UpdatedAt, &v.Version); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &v, nil
}

// CreateSharedPropertyType inserts a new SPT and emits an
// `ontology.shared_property_type.changed.v1` `created` event.
func (r *Repo) CreateSharedPropertyType(ctx context.Context, body *models.CreateSharedPropertyTypeRequest, ownerID uuid.UUID) (*models.SharedPropertyType, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.SharedPropertyType, error) {
		id := uuid.New()
		dn := body.DisplayName
		if dn == "" {
			dn = body.Name
		}
		defVal, err := jsonOrNull(body.DefaultValue)
		if err != nil {
			return nil, fmt.Errorf("default_value: %w", err)
		}
		valRules, err := jsonOrNull(body.ValidationRules)
		if err != nil {
			return nil, fmt.Errorf("validation_rules: %w", err)
		}
		now := time.Now().UTC()
		row := tx.QueryRow(ctx,
			`INSERT INTO ontology_schema.shared_property_types
			   (id, name, display_name, description, property_type,
			    required, unique_constraint, time_dependent,
			    default_value, validation_rules,
			    owner_id, created_at, updated_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
			 RETURNING `+sharedPropertyTypeColumns,
			id, body.Name, dn, body.Description, body.PropertyType,
			body.Required, body.UniqueConstraint, body.TimeDependent,
			defVal, valRules, ownerID, now)
		v := models.SharedPropertyType{}
		if err := row.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description, &v.PropertyType,
			&v.Required, &v.UniqueConstraint, &v.TimeDependent,
			&v.DefaultValue, &v.ValidationRules, &v.OwnerID, &v.CreatedAt, &v.UpdatedAt, &v.Version); err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicSharedPropertyType,
			Aggregate:   AggregateSharedPropertyType,
			AggregateID: v.ID.String(),
			EventType:   EventCreated,
			ActorID:     ownerID,
			Version:     1,
			After:       v,
		}); err != nil {
			return nil, fmt.Errorf("enqueue shared_property_type created event: %w", err)
		}
		return &v, nil
	})
}

// UpdateSharedPropertyType applies a partial update. `property_type`
// is intentionally read-only (changing the underlying data type would
// break every consumer object type — callers delete and recreate).
func (r *Repo) UpdateSharedPropertyType(ctx context.Context, id uuid.UUID, body *models.UpdateSharedPropertyTypeRequest, actorID uuid.UUID) (*models.SharedPropertyType, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.SharedPropertyType, error) {
		current, err := getSharedPropertyTypeForUpdate(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		if current == nil {
			return nil, nil
		}
		dn := current.DisplayName
		if body.DisplayName != nil {
			dn = *body.DisplayName
		}
		desc := current.Description
		if body.Description != nil {
			desc = *body.Description
		}
		required := current.Required
		if body.Required != nil {
			required = *body.Required
		}
		uniq := current.UniqueConstraint
		if body.UniqueConstraint != nil {
			uniq = *body.UniqueConstraint
		}
		td := current.TimeDependent
		if body.TimeDependent != nil {
			td = *body.TimeDependent
		}
		defVal := current.DefaultValue
		if body.DefaultValue != nil {
			defVal = body.DefaultValue
		}
		valRules := current.ValidationRules
		if body.ValidationRules != nil {
			valRules = body.ValidationRules
		}
		defValBytes, err := jsonOrNull(defVal)
		if err != nil {
			return nil, fmt.Errorf("default_value: %w", err)
		}
		valRulesBytes, err := jsonOrNull(valRules)
		if err != nil {
			return nil, fmt.Errorf("validation_rules: %w", err)
		}
		row := tx.QueryRow(ctx,
			`UPDATE ontology_schema.shared_property_types
			   SET display_name = $2, description = $3,
			       required = $4, unique_constraint = $5, time_dependent = $6,
			       default_value = $7, validation_rules = $8, updated_at = NOW(),
			       version = version + 1
			 WHERE id = $1
			 RETURNING `+sharedPropertyTypeColumns,
			id, dn, desc, required, uniq, td, defValBytes, valRulesBytes)
		updated := models.SharedPropertyType{}
		if err := row.Scan(&updated.ID, &updated.Name, &updated.DisplayName, &updated.Description, &updated.PropertyType,
			&updated.Required, &updated.UniqueConstraint, &updated.TimeDependent,
			&updated.DefaultValue, &updated.ValidationRules, &updated.OwnerID, &updated.CreatedAt, &updated.UpdatedAt, &updated.Version); err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicSharedPropertyType,
			Aggregate:   AggregateSharedPropertyType,
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     1,
			Before:      current,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue shared_property_type updated event: %w", err)
		}
		return &updated, nil
	})
}

// DeleteSharedPropertyType removes an SPT and emits a deleted event.
// Cascades to object_type_shared_property_types via FK ON DELETE
// CASCADE.
func (r *Repo) DeleteSharedPropertyType(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (bool, error) {
		before, err := getSharedPropertyTypeForUpdate(ctx, tx, id)
		if err != nil {
			return false, err
		}
		if before == nil {
			return false, nil
		}
		tag, err := tx.Exec(ctx,
			`DELETE FROM ontology_schema.shared_property_types WHERE id = $1`, id)
		if err != nil {
			return false, err
		}
		if tag.RowsAffected() == 0 {
			return false, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicSharedPropertyType,
			Aggregate:   AggregateSharedPropertyType,
			AggregateID: id.String(),
			EventType:   EventDeleted,
			ActorID:     actorID,
			Version:     1,
			Before:      before,
		}); err != nil {
			return false, fmt.Errorf("enqueue shared_property_type deleted event: %w", err)
		}
		return true, nil
	})
}

func getSharedPropertyTypeForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*models.SharedPropertyType, error) {
	row := tx.QueryRow(ctx,
		`SELECT `+sharedPropertyTypeColumns+` FROM ontology_schema.shared_property_types WHERE id = $1 FOR UPDATE`, id)
	v := models.SharedPropertyType{}
	if err := row.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description, &v.PropertyType,
		&v.Required, &v.UniqueConstraint, &v.TimeDependent,
		&v.DefaultValue, &v.ValidationRules, &v.OwnerID, &v.CreatedAt, &v.UpdatedAt, &v.Version); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &v, nil
}

// jsonOrNull serialises `v` to JSON-bytes for the JSONB columns. A
// nil input is stored as SQL NULL so the column distinguishes
// "unset" from "set to JSON null".
func jsonOrNull(v any) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

// itoa is a tiny strconv-free helper to keep the query builder readable
// without adding another import to repo.go.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := [20]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
