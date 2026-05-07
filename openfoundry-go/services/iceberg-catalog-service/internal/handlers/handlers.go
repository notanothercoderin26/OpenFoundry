// Package handlers wires the HTTP endpoints for iceberg-catalog-service.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	authmw "github.com/openfoundry/openfoundry-go/libs/auth-middleware"
	"github.com/openfoundry/openfoundry-go/services/iceberg-catalog-service/internal/models"
)

type Store interface {
	ListNamespaces(ctx context.Context, projectRID string) ([]models.IcebergNamespace, error)
	GetNamespace(ctx context.Context, id uuid.UUID) (*models.IcebergNamespace, error)
	CreateNamespace(ctx context.Context, body *models.CreateNamespaceRequest, createdBy uuid.UUID) (*models.IcebergNamespace, error)
	UpdateNamespaceProperties(ctx context.Context, id uuid.UUID, properties []byte) (*models.IcebergNamespace, error)
	DeleteNamespace(ctx context.Context, id uuid.UUID) (bool, error)
	ListTables(ctx context.Context, projectRID string, namespace []string) ([]models.IcebergTable, error)
	GetTable(ctx context.Context, projectRID string, namespace []string, tableName string) (*models.IcebergTable, error)
	CreateTable(ctx context.Context, projectRID string, namespace []string, body *models.CreateTableRequest, createdBy uuid.UUID) (*models.IcebergTable, string, error)
	CommitTable(ctx context.Context, projectRID string, namespace []string, tableName string, body *models.CommitTableRequest) (*models.IcebergTable, string, error)
	ListSnapshots(ctx context.Context, tableID uuid.UUID) ([]models.Snapshot, error)
}

type Handlers struct{ Repo Store }

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, models.ErrorEnvelope{Error: models.ErrorBody{Message: msg, Type: errorType(status), Code: status}})
}

func (h *Handlers) ListNamespaces(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	items, err := h.Repo.ListNamespaces(r.Context(), r.URL.Query().Get("project_rid"))
	if err != nil {
		slog.Error("list namespaces", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list namespaces")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.IcebergNamespace]{Items: items})
}

func (h *Handlers) GetNamespace(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	v, err := h.Repo.GetNamespace(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "namespace not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handlers) CreateNamespace(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateNamespaceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.ProjectRID == "" || body.Name == "" {
		writeJSONErr(w, http.StatusBadRequest, "project_rid and name required")
		return
	}
	if len(body.Properties) > 0 && !json.Valid(body.Properties) {
		writeJSONErr(w, http.StatusBadRequest, "properties must be valid JSON")
		return
	}
	v, err := h.Repo.CreateNamespace(r.Context(), &body, caller.Sub)
	if err != nil {
		slog.Error("create namespace", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

func (h *Handlers) UpdateNamespace(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body models.UpdateNamespaceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if len(body.Properties) > 0 && !json.Valid(body.Properties) {
		writeJSONErr(w, http.StatusBadRequest, "properties must be valid JSON")
		return
	}
	v, err := h.Repo.UpdateNamespaceProperties(r.Context(), id, []byte(body.Properties))
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if v == nil {
		writeJSONErr(w, http.StatusNotFound, "namespace not found")
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handlers) DeleteNamespace(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	deleted, err := h.Repo.DeleteNamespace(r.Context(), id)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !deleted {
		writeJSONErr(w, http.StatusNotFound, "namespace not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func errorType(status int) string {
	switch status {
	case http.StatusUnauthorized:
		return "AuthenticationException"
	case http.StatusForbidden:
		return "ForbiddenException"
	case http.StatusNotFound:
		return "NoSuchTableException"
	case http.StatusConflict:
		return "AlreadyExistsException"
	case http.StatusBadRequest:
		return "BadRequestException"
	default:
		return "InternalServerException"
	}
}

func projectRID(r *http.Request) string {
	if v := r.Header.Get("X-Foundry-Project-Rid"); v != "" {
		return v
	}
	return "ri.foundry.main.project.default"
}

func namespacePath(raw string) []string {
	if raw == "" {
		return nil
	}
	return strings.Split(raw, ".")
}

func ensureMarkingsAllowed(w http.ResponseWriter, claims *authmw.Claims, markings []string) bool {
	for _, m := range markings {
		if !claims.AllowsMarking(m) {
			writeJSONErr(w, http.StatusForbidden, "caller lacks required marking: "+m)
			return false
		}
	}
	return true
}

func (h *Handlers) ListTables(w http.ResponseWriter, r *http.Request) {
	if _, ok := authmw.FromContext(r.Context()); !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	items, err := h.Repo.ListTables(r.Context(), projectRID(r), namespacePath(chi.URLParam(r, "namespace")))
	if err != nil {
		slog.Error("list tables", slog.String("error", err.Error()))
		writeJSONErr(w, http.StatusInternalServerError, "failed to list tables")
		return
	}
	ids := make([]models.TableIdentifier, 0, len(items))
	for _, t := range items {
		ids = append(ids, models.TableIdentifier{Namespace: t.Namespace, Name: t.Name})
	}
	writeJSON(w, http.StatusOK, models.ListTablesResponse{Identifiers: ids})
}

func (h *Handlers) CreateTable(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var body models.CreateTableRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Name == "" || len(body.Schema) == 0 || !json.Valid(body.Schema) {
		writeJSONErr(w, http.StatusBadRequest, "name and schema required")
		return
	}
	if len(body.Markings) == 0 {
		body.Markings = []string{"public"}
	}
	if !ensureMarkingsAllowed(w, caller, body.Markings) {
		return
	}
	t, location, err := h.Repo.CreateTable(r.Context(), projectRID(r), namespacePath(chi.URLParam(r, "namespace")), &body, caller.Sub)
	if err != nil {
		writeJSONErr(w, statusFromErr(err), err.Error())
		return
	}
	metadata, err := h.tableMetadata(r.Context(), t)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.LoadTableResponse{Metadata: metadata, MetadataLocation: location, Config: tableConfig(t)})
}

func (h *Handlers) LoadTable(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	t, err := h.Repo.GetTable(r.Context(), projectRID(r), namespacePath(chi.URLParam(r, "namespace")), chi.URLParam(r, "table"))
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if t == nil {
		writeJSONErr(w, http.StatusNotFound, "table not found")
		return
	}
	if !ensureMarkingsAllowed(w, caller, t.Markings) {
		return
	}
	metadata, err := h.tableMetadata(r.Context(), t)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	location := fmt.Sprintf("%s/metadata/v1.metadata.json", t.Location)
	if t.CurrentMetadataLocation != nil {
		location = *t.CurrentMetadataLocation
	}
	writeJSON(w, http.StatusOK, models.LoadTableResponse{Metadata: metadata, MetadataLocation: location, Config: tableConfig(t)})
}

func (h *Handlers) CommitTable(w http.ResponseWriter, r *http.Request) {
	caller, ok := authmw.FromContext(r.Context())
	if !ok {
		writeJSONErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	current, err := h.Repo.GetTable(r.Context(), projectRID(r), namespacePath(chi.URLParam(r, "namespace")), chi.URLParam(r, "table"))
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if current == nil {
		writeJSONErr(w, http.StatusNotFound, "table not found")
		return
	}
	if !ensureMarkingsAllowed(w, caller, current.Markings) {
		return
	}
	var body models.CommitTableRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	updated, location, err := h.Repo.CommitTable(r.Context(), projectRID(r), namespacePath(chi.URLParam(r, "namespace")), chi.URLParam(r, "table"), &body)
	if err != nil {
		writeJSONErr(w, statusFromErr(err), err.Error())
		return
	}
	metadata, err := h.tableMetadata(r.Context(), updated)
	if err != nil {
		writeJSONErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.CommitTableResponse{Metadata: metadata, MetadataLocation: location})
}

func (h *Handlers) tableMetadata(ctx context.Context, t *models.IcebergTable) (json.RawMessage, error) {
	snaps, err := h.Repo.ListSnapshots(ctx, t.ID)
	if err != nil {
		return nil, err
	}
	return buildMetadata(t, snaps)
}

func statusFromErr(err error) int {
	msg := err.Error()
	if strings.Contains(msg, "not found") || strings.Contains(msg, "no rows") {
		return http.StatusNotFound
	}
	if strings.Contains(msg, "already exists") || strings.Contains(msg, "duplicate") || strings.Contains(msg, "assert-") {
		return http.StatusConflict
	}
	return http.StatusBadRequest
}

func tableConfig(t *models.IcebergTable) map[string]string {
	return map[string]string{"warehouse": strings.TrimSuffix(t.Location, "/"), "table-rid": t.RID}
}

func buildMetadata(t *models.IcebergTable, snapshots []models.Snapshot) (json.RawMessage, error) {
	now := time.Now().UTC().UnixMilli()
	snaps := make([]map[string]any, 0, len(snapshots))
	log := make([]map[string]any, 0, len(snapshots))
	for _, s := range snapshots {
		var summary map[string]any
		_ = json.Unmarshal(s.Summary, &summary)
		if summary == nil {
			summary = map[string]any{}
		}
		summary["operation"] = s.Operation
		snaps = append(snaps, map[string]any{
			"snapshot-id": s.SnapshotID, "parent-snapshot-id": s.ParentSnapshotID,
			"sequence-number": s.SequenceNumber, "timestamp-ms": s.TimestampMS,
			"summary": summary, "manifest-list": s.ManifestListLocation, "schema-id": s.SchemaID,
		})
		log = append(log, map[string]any{"timestamp-ms": s.TimestampMS, "snapshot-id": s.SnapshotID})
	}
	var schema any
	if err := json.Unmarshal(t.SchemaJSON, &schema); err != nil {
		return nil, err
	}
	var spec any
	if err := json.Unmarshal(t.PartitionSpec, &spec); err != nil {
		return nil, err
	}
	var sort any
	if err := json.Unmarshal(t.SortOrder, &sort); err != nil {
		return nil, err
	}
	var props any
	if err := json.Unmarshal(t.Properties, &props); err != nil {
		return nil, err
	}
	currentSchemaID := int64(0)
	if m, ok := schema.(map[string]any); ok {
		if n, ok := m["schema-id"].(float64); ok {
			currentSchemaID = int64(n)
		}
	}
	refs := map[string]any{}
	currentSnapshot := int64(-1)
	if t.CurrentSnapshotID != nil {
		currentSnapshot = *t.CurrentSnapshotID
		refs["main"] = map[string]any{"snapshot-id": *t.CurrentSnapshotID, "type": "branch"}
	}
	doc := map[string]any{
		"format-version": t.FormatVersion, "table-uuid": t.TableUUID, "location": t.Location,
		"last-sequence-number": t.LastSequenceNumber, "last-updated-ms": now,
		"current-schema-id": currentSchemaID, "schemas": []any{schema},
		"default-spec-id": 0, "partition-specs": []any{spec}, "default-sort-order-id": 0,
		"sort-orders": []any{sort}, "properties": props, "current-snapshot-id": currentSnapshot,
		"refs": refs, "snapshots": snaps, "snapshot-log": log,
		"metadata-log": []any{map[string]any{"timestamp-ms": now, "metadata-file": fmt.Sprintf("%s/metadata/v%d.metadata.json", t.Location, t.FormatVersion)}},
	}
	return json.Marshal(doc)
}
