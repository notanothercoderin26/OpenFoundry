// Repo helpers for the `object_views` table. Mirrors the
// interface/shared-property-type pattern in interfaces_shared.go:
// reads back the Ontology Manager "Object Views" tab catalog and the
// per-object-type detail surfaces; writes go through the same
// `runRepoTx` + outbox path so every mutation is observable on
// `ontology.object_view.changed.v1`.
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

const objectViewColumns = `id, name, display_name, description, object_type_id,
	mode, form_factor, config, branch_label, published,
	owner_id, created_at, updated_at, version`

// ListObjectViews returns one page of object views ordered by
// `display_name`. Both filters are optional; the empty value
// (nil pointer / empty string) disables that filter.
func (r *Repo) ListObjectViews(ctx context.Context, objectTypeID *uuid.UUID, formFactor string, page, perPage int) ([]models.ObjectView, int, error) {
	limit, offset := clampPaging(page, perPage)
	args := []any{}
	where := ""
	add := func(clause string, arg any) {
		args = append(args, arg)
		if where == "" {
			where = " WHERE " + clause + " $" + itoa(len(args))
		} else {
			where += " AND " + clause + " $" + itoa(len(args))
		}
	}
	if objectTypeID != nil {
		add("object_type_id =", *objectTypeID)
	}
	if formFactor != "" {
		add("form_factor =", formFactor)
	}

	var total int
	if err := r.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ontology_schema.object_views`+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	q := `SELECT ` + objectViewColumns + ` FROM ontology_schema.object_views` + where +
		` ORDER BY display_name LIMIT $` + itoa(len(args)-1) + ` OFFSET $` + itoa(len(args))
	rows, err := r.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]models.ObjectView, 0)
	for rows.Next() {
		v, err := scanObjectView(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *v)
	}
	return out, total, rows.Err()
}

func (r *Repo) GetObjectView(ctx context.Context, id uuid.UUID) (*models.ObjectView, error) {
	row := r.Pool.QueryRow(ctx,
		`SELECT `+objectViewColumns+` FROM ontology_schema.object_views WHERE id = $1`, id)
	v, err := scanObjectView(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return v, nil
}

func (r *Repo) CreateObjectView(ctx context.Context, body *models.CreateObjectViewRequest, ownerID uuid.UUID) (*models.ObjectView, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.ObjectView, error) {
		id := uuid.New()
		dn := body.DisplayName
		if dn == "" {
			dn = body.Name
		}
		mode := body.Mode
		if mode == "" {
			mode = "standard"
		}
		formFactor := body.FormFactor
		if formFactor == "" {
			formFactor = "full"
		}
		config := []byte(body.Config)
		if len(config) == 0 {
			config = []byte("{}")
		}
		published := false
		if body.Published != nil {
			published = *body.Published
		}
		now := time.Now().UTC()
		row := tx.QueryRow(ctx,
			`INSERT INTO ontology_schema.object_views
			   (id, name, display_name, description, object_type_id,
			    mode, form_factor, config, branch_label, published,
			    owner_id, created_at, updated_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
			 RETURNING `+objectViewColumns,
			id, body.Name, dn, body.Description, body.ObjectTypeID,
			mode, formFactor, config, body.BranchLabel, published,
			ownerID, now)
		v, err := scanObjectView(row)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectView,
			Aggregate:   AggregateObjectView,
			AggregateID: v.ID.String(),
			EventType:   EventCreated,
			ActorID:     ownerID,
			Version:     1,
			After:       v,
		}); err != nil {
			return nil, fmt.Errorf("enqueue object_view created event: %w", err)
		}
		return v, nil
	})
}

func (r *Repo) UpdateObjectView(ctx context.Context, id uuid.UUID, body *models.UpdateObjectViewRequest, actorID uuid.UUID) (*models.ObjectView, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (*models.ObjectView, error) {
		current, err := getObjectViewForUpdate(ctx, tx, id)
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
		mode := current.Mode
		if body.Mode != nil {
			mode = *body.Mode
		}
		formFactor := current.FormFactor
		if body.FormFactor != nil {
			formFactor = *body.FormFactor
		}
		config := []byte(current.Config)
		if len(body.Config) > 0 {
			config = []byte(body.Config)
		}
		if len(config) == 0 {
			config = []byte("{}")
		}
		branchLabel := current.BranchLabel
		if body.BranchLabel != nil {
			// Empty string is a request to clear the branch label;
			// store NULL so the unique-index COALESCE keys collapse
			// to the default ("main") bucket.
			if *body.BranchLabel == "" {
				branchLabel = nil
			} else {
				v := *body.BranchLabel
				branchLabel = &v
			}
		}
		published := current.Published
		if body.Published != nil {
			published = *body.Published
		}
		row := tx.QueryRow(ctx,
			`UPDATE ontology_schema.object_views
			   SET display_name = $2, description = $3,
			       mode = $4, form_factor = $5, config = $6,
			       branch_label = $7, published = $8,
			       updated_at = NOW(), version = version + 1
			 WHERE id = $1
			 RETURNING `+objectViewColumns,
			id, dn, desc, mode, formFactor, config, branchLabel, published)
		updated, err := scanObjectView(row)
		if err != nil {
			return nil, err
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectView,
			Aggregate:   AggregateObjectView,
			AggregateID: id.String(),
			EventType:   EventUpdated,
			ActorID:     actorID,
			Version:     updated.Version,
			Before:      current,
			After:       updated,
		}); err != nil {
			return nil, fmt.Errorf("enqueue object_view updated event: %w", err)
		}
		return updated, nil
	})
}

func (r *Repo) DeleteObjectView(ctx context.Context, id uuid.UUID, actorID uuid.UUID) (bool, error) {
	return runRepoTx(ctx, r.Pool, func(tx pgx.Tx) (bool, error) {
		before, err := getObjectViewForUpdate(ctx, tx, id)
		if err != nil {
			return false, err
		}
		if before == nil {
			return false, nil
		}
		tag, err := tx.Exec(ctx,
			`DELETE FROM ontology_schema.object_views WHERE id = $1`, id)
		if err != nil {
			return false, err
		}
		if tag.RowsAffected() == 0 {
			return false, nil
		}
		if err := EnqueueSchemaEvent(ctx, tx, EventOptions{
			Topic:       TopicObjectView,
			Aggregate:   AggregateObjectView,
			AggregateID: id.String(),
			EventType:   EventDeleted,
			ActorID:     actorID,
			Version:     before.Version,
			Before:      before,
		}); err != nil {
			return false, fmt.Errorf("enqueue object_view deleted event: %w", err)
		}
		return true, nil
	})
}

func getObjectViewForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*models.ObjectView, error) {
	row := tx.QueryRow(ctx,
		`SELECT `+objectViewColumns+` FROM ontology_schema.object_views WHERE id = $1 FOR UPDATE`, id)
	v, err := scanObjectView(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return v, nil
}

// row is anything that exposes a pgx-style Scan — pgx.Row, pgx.Rows
// during iteration, or a tx.QueryRow result. Keeping the helper
// generic over both avoids duplicating the column wiring across the
// list and single-row paths.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanObjectView(row rowScanner) (*models.ObjectView, error) {
	v := models.ObjectView{}
	var config []byte
	if err := row.Scan(&v.ID, &v.Name, &v.DisplayName, &v.Description, &v.ObjectTypeID,
		&v.Mode, &v.FormFactor, &config, &v.BranchLabel, &v.Published,
		&v.OwnerID, &v.CreatedAt, &v.UpdatedAt, &v.Version); err != nil {
		return nil, err
	}
	if len(config) > 0 {
		v.Config = json.RawMessage(config)
	}
	return &v, nil
}
