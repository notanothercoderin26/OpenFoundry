// Read-only repo helpers for the `interfaces` and
// `shared_property_types` tables. Used by the Ontology Manager UI to
// populate the catalog selectors; CRUD lives in a follow-up slice.
package repo

import (
	"context"

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
	default_value, validation_rules, owner_id, created_at, updated_at`

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
			&v.DefaultValue, &v.ValidationRules, &v.OwnerID, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, v)
	}
	return out, total, rows.Err()
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
