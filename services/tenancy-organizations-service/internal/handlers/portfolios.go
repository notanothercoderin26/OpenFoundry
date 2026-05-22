package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/openfoundry/openfoundry-go/services/tenancy-organizations-service/internal/domain"
	"github.com/openfoundry/openfoundry-go/services/tenancy-organizations-service/internal/models"
)

// PortfoliosHandlers exposes the CMP.28 portfolio surface — list,
// create, update, delete portfolios, and manage their N:M membership
// with ontology_projects.
type PortfoliosHandlers struct {
	Pool *pgxpool.Pool
}

func (h *PortfoliosHandlers) List(w http.ResponseWriter, r *http.Request) {
	if _, ok := authClaims(w, r); !ok {
		return
	}
	rows, err := h.Pool.Query(r.Context(),
		`SELECT p.id, p.name, p.slug, p.description, p.organization_id,
		        p.created_by, p.created_at, p.updated_at,
		        COUNT(pp.project_id) AS project_count
		   FROM compass_portfolios p
		   LEFT JOIN compass_portfolio_projects pp ON pp.portfolio_id = p.id
		  GROUP BY p.id
		  ORDER BY p.name ASC`,
	)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to list portfolios: %s", err))
		return
	}
	defer rows.Close()
	out := make([]models.CompassPortfolio, 0)
	for rows.Next() {
		var p models.CompassPortfolio
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.Description, &p.OrganizationID,
			&p.CreatedBy, &p.CreatedAt, &p.UpdatedAt, &p.ProjectCount); err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to scan portfolios: %s", err))
			return
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to list portfolios: %s", err))
		return
	}
	writeJSON(w, http.StatusOK, models.ListCompassPortfoliosResponse{Data: out})
}

func (h *PortfoliosHandlers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := authClaims(w, r)
	if !ok {
		return
	}
	var body models.CreateCompassPortfolioRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	name := strings.TrimSpace(body.Name)
	slug := strings.TrimSpace(body.Slug)
	if name == "" || slug == "" {
		writeJSONErr(w, http.StatusBadRequest, "name and slug required")
		return
	}
	var orgID *uuid.UUID
	if body.OrganizationID != nil && *body.OrganizationID != "" {
		parsed, err := uuid.Parse(*body.OrganizationID)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid organization_id")
			return
		}
		orgID = &parsed
	}
	p := &models.CompassPortfolio{
		Name:           name,
		Slug:           slug,
		Description:    strings.TrimSpace(body.Description),
		OrganizationID: orgID,
		CreatedBy:      claims.Sub,
	}
	err := h.Pool.QueryRow(r.Context(),
		`INSERT INTO compass_portfolios (name, slug, description, organization_id, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at, updated_at`,
		p.Name, p.Slug, p.Description, p.OrganizationID, p.CreatedBy,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "compass_portfolios_slug_uniq") || strings.Contains(err.Error(), "duplicate key") {
			writeJSONErr(w, http.StatusConflict, "portfolio slug already taken")
			return
		}
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to create portfolio: %s", err))
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *PortfoliosHandlers) Update(w http.ResponseWriter, r *http.Request) {
	if _, ok := authClaims(w, r); !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	var body models.UpdateCompassPortfolioRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Name == nil && body.Description == nil {
		writeJSONErr(w, http.StatusBadRequest, "nothing to update")
		return
	}
	var (
		name        *string
		description *string
	)
	if body.Name != nil {
		v := strings.TrimSpace(*body.Name)
		if v == "" {
			writeJSONErr(w, http.StatusBadRequest, "name cannot be empty")
			return
		}
		name = &v
	}
	if body.Description != nil {
		v := strings.TrimSpace(*body.Description)
		description = &v
	}
	out := &models.CompassPortfolio{}
	err := h.Pool.QueryRow(r.Context(),
		`UPDATE compass_portfolios
		    SET name = COALESCE($2, name),
		        description = COALESCE($3, description),
		        updated_at = NOW()
		  WHERE id = $1
		  RETURNING id, name, slug, description, organization_id,
		            created_by, created_at, updated_at`,
		id, name, description,
	).Scan(&out.ID, &out.Name, &out.Slug, &out.Description, &out.OrganizationID,
		&out.CreatedBy, &out.CreatedAt, &out.UpdatedAt)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to update portfolio: %s", err))
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *PortfoliosHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	if _, ok := authClaims(w, r); !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	cmd, err := h.Pool.Exec(r.Context(), `DELETE FROM compass_portfolios WHERE id = $1`, id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to delete portfolio: %s", err))
		return
	}
	if cmd.RowsAffected() == 0 {
		writeJSONErr(w, http.StatusNotFound, "portfolio not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *PortfoliosHandlers) ListProjects(w http.ResponseWriter, r *http.Request) {
	if _, ok := authClaims(w, r); !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	rows, err := h.Pool.Query(r.Context(),
		`SELECT pp.portfolio_id, pp.project_id, pp.added_by, pp.added_at
		   FROM compass_portfolio_projects pp
		  WHERE pp.portfolio_id = $1
		  ORDER BY pp.added_at DESC`,
		id,
	)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to list portfolio projects: %s", err))
		return
	}
	defer rows.Close()
	out := make([]models.PortfolioProjectMembership, 0)
	for rows.Next() {
		var m models.PortfolioProjectMembership
		if err := rows.Scan(&m.PortfolioID, &m.ProjectID, &m.AddedBy, &m.AddedAt); err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to scan portfolio projects: %s", err))
			return
		}
		out = append(out, m)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": out})
}

func (h *PortfoliosHandlers) AddProject(w http.ResponseWriter, r *http.Request) {
	claims, ok := authClaims(w, r)
	if !ok {
		return
	}
	portfolioID, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	projectID, ok := parseUUIDParam(w, r, "project_id", "project_id")
	if !ok {
		return
	}
	if _, err := domain.EnsureProjectViewAccess(r.Context(), h.Pool, claims, projectID); err != nil {
		writeJSONErr(w, http.StatusForbidden, err.Error())
		return
	}
	m := models.PortfolioProjectMembership{
		PortfolioID: portfolioID,
		ProjectID:   projectID,
		AddedBy:     claims.Sub,
	}
	err := h.Pool.QueryRow(r.Context(),
		`INSERT INTO compass_portfolio_projects (portfolio_id, project_id, added_by)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (portfolio_id, project_id)
		 DO UPDATE SET added_by = EXCLUDED.added_by
		 RETURNING added_at`,
		portfolioID, projectID, claims.Sub,
	).Scan(&m.AddedAt)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to add project to portfolio: %s", err))
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (h *PortfoliosHandlers) RemoveProject(w http.ResponseWriter, r *http.Request) {
	if _, ok := authClaims(w, r); !ok {
		return
	}
	portfolioID, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	projectID, ok := parseUUIDParam(w, r, "project_id", "project_id")
	if !ok {
		return
	}
	cmd, err := h.Pool.Exec(r.Context(),
		`DELETE FROM compass_portfolio_projects
		  WHERE portfolio_id = $1 AND project_id = $2`,
		portfolioID, projectID,
	)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to remove project from portfolio: %s", err))
		return
	}
	if cmd.RowsAffected() == 0 {
		writeJSONErr(w, http.StatusNotFound, "portfolio project not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Namespaces ──────────────────────────────────────────────────────

// NamespacesHandlers wires CMP.29.
type NamespacesHandlers struct {
	Pool *pgxpool.Pool
}

func (h *NamespacesHandlers) List(w http.ResponseWriter, r *http.Request) {
	if _, ok := authClaims(w, r); !ok {
		return
	}
	rows, err := h.Pool.Query(r.Context(),
		`SELECT id, name, slug, description, organization_id,
		        created_by, created_at, updated_at
		   FROM compass_namespaces
		  ORDER BY name ASC`,
	)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to list namespaces: %s", err))
		return
	}
	defer rows.Close()
	out := make([]models.CompassNamespace, 0)
	for rows.Next() {
		var n models.CompassNamespace
		if err := rows.Scan(&n.ID, &n.Name, &n.Slug, &n.Description, &n.OrganizationID,
			&n.CreatedBy, &n.CreatedAt, &n.UpdatedAt); err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to scan namespaces: %s", err))
			return
		}
		out = append(out, n)
	}
	writeJSON(w, http.StatusOK, models.ListCompassNamespacesResponse{Data: out})
}

func (h *NamespacesHandlers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := authClaims(w, r)
	if !ok {
		return
	}
	var body models.CreateCompassNamespaceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	name := strings.TrimSpace(body.Name)
	slug := strings.TrimSpace(body.Slug)
	if name == "" || slug == "" {
		writeJSONErr(w, http.StatusBadRequest, "name and slug required")
		return
	}
	var orgID *uuid.UUID
	if body.OrganizationID != nil && *body.OrganizationID != "" {
		parsed, err := uuid.Parse(*body.OrganizationID)
		if err != nil {
			writeJSONErr(w, http.StatusBadRequest, "invalid organization_id")
			return
		}
		orgID = &parsed
	}
	n := &models.CompassNamespace{
		Name:           name,
		Slug:           slug,
		Description:    strings.TrimSpace(body.Description),
		OrganizationID: orgID,
		CreatedBy:      claims.Sub,
	}
	err := h.Pool.QueryRow(r.Context(),
		`INSERT INTO compass_namespaces (name, slug, description, organization_id, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at, updated_at`,
		n.Name, n.Slug, n.Description, n.OrganizationID, n.CreatedBy,
	).Scan(&n.ID, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "compass_namespaces_slug_uniq") || strings.Contains(err.Error(), "duplicate key") {
			writeJSONErr(w, http.StatusConflict, "namespace slug already taken")
			return
		}
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to create namespace: %s", err))
		return
	}
	writeJSON(w, http.StatusCreated, n)
}

func (h *NamespacesHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	if _, ok := authClaims(w, r); !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	cmd, err := h.Pool.Exec(r.Context(), `DELETE FROM compass_namespaces WHERE id = $1`, id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to delete namespace: %s", err))
		return
	}
	if cmd.RowsAffected() == 0 {
		writeJSONErr(w, http.StatusNotFound, "namespace not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── Promote endpoints ───────────────────────────────────────────────

// PromoteProject sets is_promoted=TRUE on a project. Editors only.
func (h *ProjectsHandlers) PromoteProject(w http.ResponseWriter, r *http.Request) {
	h.setProjectPromoted(w, r, true)
}

// UnpromoteProject clears the promoted flag.
func (h *ProjectsHandlers) UnpromoteProject(w http.ResponseWriter, r *http.Request) {
	h.setProjectPromoted(w, r, false)
}

func (h *ProjectsHandlers) setProjectPromoted(w http.ResponseWriter, r *http.Request, promoted bool) {
	claims, ok := authClaims(w, r)
	if !ok {
		return
	}
	projectID, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	if _, err := domain.EnsureProjectEditAccess(r.Context(), h.Pool, claims, projectID); err != nil {
		writeJSONErr(w, http.StatusForbidden, err.Error())
		return
	}
	var rowsAffected int64
	if promoted {
		cmd, err := h.Pool.Exec(r.Context(),
			`UPDATE ontology_projects
			    SET is_promoted = TRUE, promoted_at = NOW(), promoted_by = $2
			  WHERE id = $1 AND is_deleted = FALSE`,
			projectID, claims.Sub,
		)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to promote project: %s", err))
			return
		}
		rowsAffected = cmd.RowsAffected()
	} else {
		cmd, err := h.Pool.Exec(r.Context(),
			`UPDATE ontology_projects
			    SET is_promoted = FALSE, promoted_at = NULL, promoted_by = NULL
			  WHERE id = $1 AND is_deleted = FALSE`,
			projectID,
		)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to unpromote project: %s", err))
			return
		}
		rowsAffected = cmd.RowsAffected()
	}
	if rowsAffected == 0 {
		writeJSONErr(w, http.StatusNotFound, "project not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PromoteResource sets is_promoted on a bound resource.
func (h *ProjectsHandlers) PromoteResource(w http.ResponseWriter, r *http.Request) {
	h.setResourcePromoted(w, r, true)
}

// UnpromoteResource clears the flag.
func (h *ProjectsHandlers) UnpromoteResource(w http.ResponseWriter, r *http.Request) {
	h.setResourcePromoted(w, r, false)
}

func (h *ProjectsHandlers) setResourcePromoted(w http.ResponseWriter, r *http.Request, promoted bool) {
	claims, ok := authClaims(w, r)
	if !ok {
		return
	}
	projectID, ok := parseUUIDParam(w, r, "id", "id")
	if !ok {
		return
	}
	resourceID, ok := parseUUIDParam(w, r, "resource_id", "resource_id")
	if !ok {
		return
	}
	kindParam := chi.URLParam(r, "kind")
	resourceKind, err := domain.ParseOntologyResourceKind(kindParam)
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if _, err := domain.EnsureProjectEditAccess(r.Context(), h.Pool, claims, projectID); err != nil {
		writeJSONErr(w, http.StatusForbidden, err.Error())
		return
	}
	var rowsAffected int64
	if promoted {
		cmd, err := h.Pool.Exec(r.Context(),
			`UPDATE ontology_project_resources
			    SET is_promoted = TRUE, promoted_at = NOW(), promoted_by = $4
			  WHERE project_id = $1 AND resource_kind = $2 AND resource_id = $3
			    AND is_deleted = FALSE`,
			projectID, resourceKind.String(), resourceID, claims.Sub,
		)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to promote resource: %s", err))
			return
		}
		rowsAffected = cmd.RowsAffected()
	} else {
		cmd, err := h.Pool.Exec(r.Context(),
			`UPDATE ontology_project_resources
			    SET is_promoted = FALSE, promoted_at = NULL, promoted_by = NULL
			  WHERE project_id = $1 AND resource_kind = $2 AND resource_id = $3
			    AND is_deleted = FALSE`,
			projectID, resourceKind.String(), resourceID,
		)
		if err != nil {
			writeJSONErr(w, http.StatusInternalServerError, fmt.Sprintf("failed to unpromote resource: %s", err))
			return
		}
		rowsAffected = cmd.RowsAffected()
	}
	if rowsAffected == 0 {
		writeJSONErr(w, http.StatusNotFound, "resource binding not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
