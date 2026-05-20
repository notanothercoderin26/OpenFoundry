// HTTP handlers for the action-type schema mutations lifted out of
// the kernel (B02 §Deferred follow-up — closed).
//
// The kernel's `libs/ontology-kernel/handlers/actions/actions.go`
// continues to serve List / Get / Validate / Execute / WhatIf /
// InlineEdit / Upload. Only POST/PUT/PATCH/DELETE on /actions[/{id}]
// land here so we can pair the SQL with libs/outbox.Enqueue inside
// the same transaction per ADR-0022.
//
// **Drift TODO** (B02 §Deferred):
//   - `parseOperationKind` and `validateActionParameterType` are
//     copied from libs/ontology-kernel/handlers/actions/actions.go.
//     They are 20 lines combined and have been stable for months;
//     if either drifts in the kernel, mirror the change here.
//   - The object-type-exists check uses a direct SQL query against
//     `ontology_schema.object_types`. The kernel's equivalent
//     (`domain.ActionRepoObjectTypeExists`) routes through the
//     pluggable DefinitionStore. The two answers MUST converge
//     because the underlying table is the same.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	kmodels "github.com/openfoundry/openfoundry-go/libs/ontology-kernel/models"
	"github.com/openfoundry/openfoundry-go/services/ontology-actions-service/internal/repo"
)

// Handlers wires the lifted action-type handlers to the repo + pool.
// The pool is held separately for the small validation queries (e.g.
// "does this object_type_id exist?") that don't need the full repo
// surface.
type Handlers struct {
	Repo *repo.Repo
	Pool *pgxpool.Pool
}

func (h *Handlers) CreateActionType(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body kmodels.CreateActionTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeJSONErr(w, http.StatusBadRequest, "action type name is required")
		return
	}
	if err := validateActionDefinition(r.Context(), h.Pool,
		body.ObjectTypeID, body.OperationKind, body.InputSchema, body.Config); err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}

	created, err := h.Repo.CreateActionType(r.Context(), &body, caller.Sub)
	if err != nil {
		slog.Error("create action type", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *Handlers) UpdateActionType(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	var body kmodels.UpdateActionTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	current, err := h.Repo.GetActionType(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if current == nil {
		writeJSONErr(w, http.StatusNotFound, "action type not found")
		return
	}

	operationKind := current.OperationKind
	if body.OperationKind != nil {
		operationKind = *body.OperationKind
	}
	inputSchema := &current.InputSchema
	if body.InputSchema != nil {
		inputSchema = body.InputSchema
	}
	config := current.Config
	if len(body.Config) > 0 {
		config = body.Config
	}
	if err := validateActionDefinition(r.Context(), h.Pool,
		current.ObjectTypeID, operationKind, inputSchema, config); err != nil {
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}

	updated, err := h.Repo.UpdateActionType(r.Context(), id, &body, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if updated == nil {
		writeJSONErr(w, http.StatusNotFound, "action type not found")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handlers) DeleteActionType(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusNotFound, "not found")
		return
	}
	deleted, err := h.Repo.DeleteActionType(r.Context(), id, caller.Sub)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "action type not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Validation (drift-mirrored from libs/ontology-kernel/handlers/actions) ─

// validateActionDefinition checks the invariants the kernel enforces
// at action-type create/update time:
//
//   - The referenced object type exists.
//   - The operation kind is one of the recognised tokens.
//   - Every input field has a non-empty name and a valid property
//     type (`object_reference*` and `object_set` are accepted as
//     special action-only types; the rest delegate to the kernel's
//     property-type vocabulary).
//
// Differences with the kernel version:
//   - Reads `ontology_schema.object_types` directly instead of going
//     through the DefinitionStore abstraction (same table, identical
//     answer).
//   - Drops the `invoke_function` config check (will be re-added once
//     the function runtime is wired into this service; not used by
//     the demo path).
func validateActionDefinition(
	ctx context.Context,
	pool *pgxpool.Pool,
	objectTypeID uuid.UUID,
	operationKindRaw string,
	inputSchema *[]kmodels.ActionInputField,
	_ json.RawMessage,
) error {
	exists, err := objectTypeExists(ctx, pool, objectTypeID)
	if err != nil {
		return errors.New("failed to validate object type: " + err.Error())
	}
	if !exists {
		return errors.New("referenced object type does not exist")
	}
	if _, err := parseOperationKind(operationKindRaw); err != nil {
		return err
	}
	if inputSchema != nil {
		for _, field := range *inputSchema {
			if strings.TrimSpace(field.Name) == "" {
				return errors.New("action input field name is required")
			}
			if err := validateActionParameterType(field.PropertyType); err != nil {
				return errors.New(field.Name + ": " + err.Error())
			}
		}
	}
	return nil
}

func objectTypeExists(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (bool, error) {
	var found bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM ontology_schema.object_types WHERE id = $1)`, id,
	).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return found, err
}

// parseOperationKind mirrors libs/ontology-kernel/handlers/actions/actions.go::parseOperationKind.
func parseOperationKind(raw string) (string, error) {
	switch raw {
	case "modify_object":
		return "update_object", nil
	case "create_object", "update_object", "create_or_modify_object",
		"create_link", "delete_link", "delete_object",
		"invoke_function", "invoke_webhook",
		"create_interface", "modify_interface", "delete_interface",
		"create_interface_link", "delete_interface_link":
		return raw, nil
	default:
		return "", errors.New("invalid action operation kind '" + raw + "'")
	}
}

// validateActionParameterType mirrors libs/ontology-kernel/handlers/actions/actions.go::validateActionParameterType,
// but uses a small local vocabulary instead of importing the kernel's
// `domain.ValidatePropertyType` (which has a large transitive import
// graph). The accepted set matches what the kernel currently allows.
func validateActionParameterType(propertyType string) error {
	switch strings.TrimSpace(strings.ToLower(propertyType)) {
	case "object_reference", "object_reference_list", "object_set",
		"string", "integer", "long", "double", "float", "boolean",
		"date", "timestamp", "uuid", "geopoint", "geoshape", "vector":
		return nil
	default:
		return errors.New("unsupported property type '" + propertyType + "'")
	}
}

// writeJSON / writeJSONErr keep handler code symmetric with the kernel's
// own helpers without depending on them.

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
